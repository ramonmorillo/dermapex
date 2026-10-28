#!/usr/bin/env bash
# DERMAPEX · Prueba de restauración de una copia cifrada en un PostgreSQL LOCAL y desechable.
#
# 1) comprueba la huella del fichero cifrado y lo descifra en una carpeta temporal privada;
# 2) comprueba la huella SHA-256 de cada fichero interno frente a backup_manifest.txt;
# 3) crea una base de datos local nueva, carga lo mínimo de Supabase (db-tests/00_local_supabase_stubs.sql)
#    y las cuentas (id, email), y restaura estructura y datos con pg_restore;
# 4) compara el recuento de filas de cada tabla con el registrado en el momento de la copia.
# Si todo coincide, la copia es restaurable. La base de verificación se elimina al terminar
# (KEEP_RESTORED_DB=1 para conservarla y consultarla).
#
# Uso:  RESTORE_ADMIN_URL=postgresql:///postgres scripts/backup/dermapex-restore-verify.sh <copia.tar.gz.enc>
# Requisitos: PostgreSQL local de la misma versión mayor que el origen o superior, openssl.
set -euo pipefail
umask 077

ENC="${1:?Indica el fichero de copia (.tar.gz.enc)}"
: "${RESTORE_ADMIN_URL:?Define RESTORE_ADMIN_URL (conexión de administración a un PostgreSQL LOCAL)}"
case "$RESTORE_ADMIN_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*) echo "ERROR: la restauración de prueba solo se hace en un PostgreSQL local." >&2; exit 1 ;;
esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ -f "$ENC.sha256" ]; then
  expected="$(cut -d' ' -f1 "$ENC.sha256")"
  actual="$(openssl dgst -sha256 -r "$ENC" | cut -d' ' -f1)"
  [ "$expected" = "$actual" ] || { echo "ERROR: la huella del fichero cifrado no coincide (copia dañada o alterada)." >&2; exit 1; }
  echo "✓ Huella del fichero cifrado"
else
  echo "Aviso: no hay fichero .sha256 junto a la copia; se omite la comprobación externa."
fi

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  read -r -s -p "Frase de cifrado de la copia: " BACKUP_PASSPHRASE; echo
fi
export BACKUP_PASSPHRASE

WORK="$(mktemp -d)"
DB="dermapex_restore_$(date -u +%Y%m%d%H%M%S)"
cleanup() {
  if [ "${KEEP_RESTORED_DB:-0}" != "1" ]; then psql "$RESTORE_ADMIN_URL" -X -q -c "drop database if exists $DB" >/dev/null 2>&1 || true; fi
  if command -v shred >/dev/null 2>&1; then find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass env:BACKUP_PASSPHRASE -in "$ENC" | tar -C "$WORK" -xzf - \
  || { echo "ERROR: no se pudo descifrar (frase incorrecta o fichero dañado)." >&2; exit 1; }
DIR="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d | head -1)"
echo "✓ Descifrado"

while read -r hash file; do
  [ -n "$file" ] || continue
  actual="$(openssl dgst -sha256 -r "$DIR/$file" | cut -d' ' -f1)"
  [ "$hash" = "$actual" ] || { echo "ERROR: huella distinta en $file." >&2; exit 1; }
done < <(sed -n '/^sha256:/,$p' "$DIR/backup_manifest.txt" | tail -n +2)
echo "✓ Huellas internas ($(sed -n '/^sha256:/,$p' "$DIR/backup_manifest.txt" | tail -n +2 | wc -l) ficheros)"

psql "$RESTORE_ADMIN_URL" -X -q -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
TARGET="$(python3 -c 'import sys,urllib.parse as u; p=u.urlsplit(sys.argv[1]); print(f"{p.scheme}://{p.netloc}/{sys.argv[2]}" + (f"?{p.query}" if p.query else ""))' "$RESTORE_ADMIN_URL" "$DB")"
PSQL=(psql "$TARGET" -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f "$ROOT/db-tests/00_local_supabase_stubs.sql" >/dev/null
if [ -f "$DIR/auth_users_min.csv" ]; then
  "${PSQL[@]}" -c "\\copy auth.users (id, email) from '$DIR/auth_users_min.csv' with (format csv, header true)"
fi
# Los esquemas propios los crea pg_restore; public ya existe en una base nueva: se omite su CREATE SCHEMA.
pg_restore -l "$DIR/schema_data.dump" | grep -vE '^[0-9]+; [0-9]+ [0-9]+ (SCHEMA|COMMENT) - (public|SCHEMA public) ' > "$WORK/restore.list"
pg_restore --no-owner --exit-on-error -L "$WORK/restore.list" -d "$TARGET" "$DIR/schema_data.dump" 2> "$WORK/restore.log" \
  || { echo "ERROR en pg_restore:" >&2; tail -20 "$WORK/restore.log" >&2; exit 1; }
echo "✓ Estructura y datos restaurados en la base local $DB"

fail=0
total=0
while IFS=, read -r schema table expected; do
  [ -n "$table" ] || continue
  total=$((total + 1))
  got="$("${PSQL[@]}" -tA -c "select count(*) from \"$schema\".\"$table\"")"
  if [ "$got" != "$expected" ]; then echo "  ✗ $schema.$table: copia $expected, restaurado $got"; fail=$((fail + 1)); fi
done < "$DIR/row_counts.csv"
policies="$("${PSQL[@]}" -tA -c "select count(*) from pg_policies where schemaname in ('public','app_private','coag_private')")"
rls_off="$("${PSQL[@]}" -tA -c "select count(*) from pg_tables where schemaname = 'public' and not rowsecurity")"

echo "✓ Políticas RLS restauradas: $policies · tablas de public sin RLS: $rls_off"
if [ "$fail" -eq 0 ]; then
  echo "RESULTADO: RESTAURACIÓN VERIFICADA · $total tablas con el mismo número de filas que en la copia."
else
  echo "RESULTADO: FALLO · $fail de $total tablas con recuento distinto." >&2
  exit 1
fi
