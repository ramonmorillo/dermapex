#!/usr/bin/env bash
# Prueba de humo e2e LOCAL Y DESECHABLE (nunca contra Supabase):
#   1) aplica stubs + migraciones + e2e/seed.sql en una BD PostgreSQL local vacía,
#   2) arranca PostgREST y e2e/local-stack.mjs (auth ficticia + proxy /rest/v1),
#   3) compila la app apuntando a ese stack y la sirve con vite preview,
#   4) ejecuta e2e/smoke.mjs en Chromium (Playwright) y guarda capturas en docs/e2e-screenshots/.
#
# Requisitos: DATABASE_URL (superusuario, BD vacía), DATABASE_AUTHENTICATOR_URL (misma BD, rol
# authenticator/authenticator creado por la semilla), POSTGREST_BIN (binario PostgREST ≥ 12),
# PLAYWRIGHT_MODULE (ruta a playwright-core) y CHROMIUM_PATH (opcional).
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL con una base de datos local vacía}"
: "${DATABASE_AUTHENTICATOR_URL:?Define DATABASE_AUTHENTICATOR_URL (rol authenticator de la misma BD)}"
: "${POSTGREST_BIN:?Define POSTGREST_BIN con la ruta al binario de PostgREST}"
case "$DATABASE_URL$DATABASE_AUTHENTICATOR_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*) echo "ERROR: solo bases locales desechables." >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)
export JWT_SECRET="${JWT_SECRET:-dermapex-e2e-local-secret-not-for-production-000}"
WORK="$(mktemp -d)"
PIDS=()
cleanup() { for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done; rm -rf "$WORK"; }
trap cleanup EXIT

# Puertos ocupados (p. ej. restos de una ejecución anterior) invalidarían la prueba.
for port in 3000 4173 54321; do
  if curl -s -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then echo "ERROR: el puerto $port ya está en uso." >&2; exit 1; fi
done

"${PSQL[@]}" -f "$ROOT/db-tests/00_local_supabase_stubs.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$migration"; done
"${PSQL[@]}" -f "$ROOT/e2e/seed.sql"

cat > "$WORK/postgrest.conf" <<EOF
db-uri = "$DATABASE_AUTHENTICATOR_URL"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3000
EOF
"$POSTGREST_BIN" "$WORK/postgrest.conf" > "$WORK/postgrest.log" 2>&1 & PIDS+=($!)
node "$ROOT/e2e/local-stack.mjs" > "$WORK/stack.log" 2>&1 & PIDS+=($!)

ANON_KEY="$(node "$ROOT/e2e/local-stack.mjs" --print-anon-key)"
# vite se invoca con node directamente (no npx) para que el PID registrado sea el del servidor.
VITE=("node" "$ROOT/node_modules/vite/bin/vite.js")
(cd "$ROOT" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY="$ANON_KEY" "${VITE[@]}" build --outDir "$WORK/dist" --emptyOutDir > "$WORK/build.log" 2>&1)
(cd "$ROOT" && exec "${VITE[@]}" preview --outDir "$WORK/dist" --host 127.0.0.1 --port 4173 --strictPort > "$WORK/preview.log" 2>&1) & PIDS+=($!)

for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1 && curl -fsS http://127.0.0.1:4173/ >/dev/null 2>&1; then break; fi
  sleep 0.5
done

node "$ROOT/e2e/smoke.mjs"
