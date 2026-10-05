#!/usr/bin/env bash
# Valida las migraciones de DERMAPEX en una base de datos PostgreSQL LOCAL Y DESECHABLE:
#   1) simula lo mínimo de Supabase (db-tests/00_local_supabase_stubs.sql),
#   2) aplica supabase/migrations/*.sql en orden,
#   3) ejecuta la batería de RLS/integridad (db-tests/10_*.sql).
#
# Uso: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dermapex_test scripts/test-db.sh
#
# NUNCA apuntar a un proyecto Supabase: el script crea esquemas y datos de prueba. Por seguridad
# se niega a ejecutarse contra hosts de Supabase.
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL con una base de datos local vacía}"

case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "ERROR: DATABASE_URL apunta a Supabase. Este script solo admite bases locales desechables." >&2
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)

if [ "$("${PSQL[@]}" -tAc "select count(*) from pg_namespace where nspname in ('auth','storage','app_private')")" != "0" ]; then
  echo "ERROR: la base de datos no está vacía (existen auth/storage/app_private). Usa una base nueva." >&2
  exit 1
fi

echo "→ Stubs locales de Supabase"
"${PSQL[@]}" -f "$ROOT/db-tests/00_local_supabase_stubs.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ Migración $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done

for test_file in "$ROOT"/db-tests/1*.sql; do
  echo "→ Pruebas $(basename "$test_file")"
  "${PSQL[@]}" -f "$test_file"
done
