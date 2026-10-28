#!/usr/bin/env bash
# DERMAPEX · Copia de seguridad cifrada de la base de datos (estructura + datos).
#
# Se ejecuta en el equipo del responsable de la copia. Ni la cadena de conexión ni la contraseña de la
# base de datos ni la frase de cifrado se escriben en disco ni en el repositorio.
#
# Contenido (dentro de un único fichero cifrado AES-256, clave derivada con PBKDF2):
#   schema_data.dump    pg_dump (formato custom) de public, app_private y coag_private: tablas, datos,
#                       funciones, triggers, políticas RLS y privilegios.
#   auth_data.dump      datos de auth.users y auth.identities (cuentas de los profesionales), solo si existen.
#   auth_users_min.csv  id y email de las cuentas (para la restauración de verificación en local).
#   storage_objects.csv metadatos de los documentos PDF (los ficheros PDF NO van en la copia: ver procedimiento).
#   row_counts.csv      recuento exacto de filas por tabla en el momento de la copia.
#   backup_manifest.txt fecha, versiones y huellas SHA-256 de cada fichero.
#
# Uso:
#   scripts/backup/dermapex-backup.sh <carpeta_destino>
# Variables (si no se definen, se preguntan):
#   DERMAPEX_DB_HOST   p. ej. aws-0-eu-west-1.pooler.supabase.com (Session pooler, puerto 5432)
#   DERMAPEX_DB_USER   p. ej. postgres.<ref-del-proyecto>
#   DERMAPEX_DB_PORT   por defecto 5432
#   DERMAPEX_DB_NAME   por defecto postgres
# Requisitos: pg_dump/psql de la MISMA versión mayor que el servidor o superior (Supabase: 17), openssl.
set -euo pipefail
umask 077

DEST="${1:?Indica la carpeta de destino (fuera del repositorio, idealmente cifrada)}"
mkdir -p "$DEST"

read_var() {
  local name="$1" prompt="$2" default="${3:-}"
  if [ -z "${!name:-}" ]; then
    read -r -p "$prompt${default:+ [$default]}: " value
    printf -v "$name" '%s' "${value:-$default}"
  fi
}
read_var DERMAPEX_DB_HOST "Host de la base de datos"
read_var DERMAPEX_DB_USER "Usuario" "postgres"
read_var DERMAPEX_DB_PORT "Puerto" "5432"
read_var DERMAPEX_DB_NAME "Base de datos" "postgres"

if [ -z "${PGPASSWORD:-}" ]; then
  read -r -s -p "Contraseña de la base de datos (no se muestra ni se guarda): " PGPASSWORD; echo
fi
export PGPASSWORD PGSSLMODE="${PGSSLMODE:-require}"
case "$DERMAPEX_DB_HOST" in localhost|127.0.0.1|/*) export PGSSLMODE=disable ;; esac

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  read -r -s -p "Frase de cifrado de la copia (mín. 16 caracteres; guárdela en el gestor de contraseñas del promotor): " BACKUP_PASSPHRASE; echo
  read -r -s -p "Repita la frase: " confirm; echo
  [ "$BACKUP_PASSPHRASE" = "$confirm" ] || { echo "ERROR: las frases no coinciden." >&2; exit 1; }
fi
[ "${#BACKUP_PASSPHRASE}" -ge 16 ] || { echo "ERROR: la frase de cifrado debe tener al menos 16 caracteres." >&2; exit 1; }

CONN=(-h "$DERMAPEX_DB_HOST" -p "$DERMAPEX_DB_PORT" -U "$DERMAPEX_DB_USER" -d "$DERMAPEX_DB_NAME")
PSQL=(psql "${CONN[@]}" -X -q -tA -v ON_ERROR_STOP=1)

server_major="$("${PSQL[@]}" -c 'show server_version_num' | cut -c1-2)"
client_major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
if [ "$client_major" -lt "$server_major" ]; then
  echo "ERROR: pg_dump $client_major es anterior al servidor ($server_major). Instale el cliente PostgreSQL $server_major." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
cleanup() {
  if command -v shred >/dev/null 2>&1; then find "$WORK" -type f -exec shred -u {} + 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
OUT="$WORK/dermapex_backup_$STAMP"
mkdir -p "$OUT"

echo "→ Recuento de filas por tabla"
"${PSQL[@]}" -F, > "$OUT/row_counts.csv" <<'SQL'
create temp table _counts(schema_name text, table_name text, n bigint);
do $$
declare r record; v bigint;
begin
  for r in select table_schema, table_name from information_schema.tables
           where table_schema in ('public', 'app_private', 'coag_private') and table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from %I.%I', r.table_schema, r.table_name) into v;
    insert into _counts values (r.table_schema, r.table_name, v);
  end loop;
end $$;
select schema_name, table_name, n from _counts order by 1, 2;
SQL

echo "→ Estructura y datos (public, app_private, coag_private)"
schemas=()
for s in public app_private coag_private; do
  if [ "$("${PSQL[@]}" -c "select count(*) from pg_namespace where nspname = '$s'")" = "1" ]; then schemas+=(-n "$s"); fi
done
pg_dump "${CONN[@]}" --format=custom --no-owner "${schemas[@]}" --file "$OUT/schema_data.dump"

echo "→ Cuentas de usuario (auth)"
auth_tables=()
for t in auth.users auth.identities; do
  if [ "$("${PSQL[@]}" -c "select to_regclass('$t') is not null")" = "t" ]; then auth_tables+=(-t "$t"); fi
done
if [ "${#auth_tables[@]}" -gt 0 ]; then
  pg_dump "${CONN[@]}" --format=custom --no-owner --data-only "${auth_tables[@]}" --file "$OUT/auth_data.dump"
  "${PSQL[@]}" -c "\\copy (select id, email from auth.users order by id) to '$OUT/auth_users_min.csv' with (format csv, header true)"
fi

echo "→ Metadatos de documentos (storage)"
if [ "$("${PSQL[@]}" -c "select to_regclass('storage.objects') is not null")" = "t" ]; then
  "${PSQL[@]}" -c "\\copy (select bucket_id, name, created_at from storage.objects order by bucket_id, name) to '$OUT/storage_objects.csv' with (format csv, header true)"
fi

{
  echo "DERMAPEX · copia de seguridad"
  echo "fecha_utc: $STAMP"
  echo "servidor: $DERMAPEX_DB_HOST:$DERMAPEX_DB_PORT/$DERMAPEX_DB_NAME (usuario $DERMAPEX_DB_USER)"
  echo "postgresql_servidor: $("${PSQL[@]}" -c 'show server_version')"
  echo "pg_dump: $(pg_dump --version)"
  echo "esquemas: ${schemas[*]}"
  echo "sha256:"
  (cd "$OUT" && for f in *; do [ "$f" = backup_manifest.txt ] || echo "  $(openssl dgst -sha256 -r "$f" | cut -d' ' -f1)  $f"; done)
} > "$OUT/backup_manifest.txt"

echo "→ Cifrado"
FINAL="$DEST/dermapex_backup_$STAMP.tar.gz.enc"
tar -C "$WORK" -czf - "dermapex_backup_$STAMP" \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -md sha256 -pass env:BACKUP_PASSPHRASE -out "$FINAL"
(cd "$DEST" && openssl dgst -sha256 -r "$(basename "$FINAL")" > "$(basename "$FINAL").sha256")

echo
echo "Copia creada: $FINAL"
echo "Huella:       $(cut -d' ' -f1 "$FINAL.sha256")"
echo "Recuentos:    $(wc -l < "$OUT/row_counts.csv") tablas"
echo "Siguiente paso obligatorio: verificar la restauración con scripts/backup/dermapex-restore-verify.sh"
