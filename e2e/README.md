# Prueba de humo e2e (local y desechable)

`run-smoke.sh` levanta PostgreSQL (ya en marcha, BD vacía) + PostgREST + un sustituto mínimo de
la autenticación de Supabase (`local-stack.mjs`), compila la app contra ese stack y recorre en
Chromium el flujo de estratificación en un centro `cmo`, en uno `standard` y como coordinación
(`smoke.mjs`). La RLS es la real de `supabase/migrations/`. Datos 100 % ficticios (`seed.sql`).

```bash
DATABASE_URL=postgresql://postgres@localhost:5432/dermapex_e2e \
DATABASE_AUTHENTICATOR_URL=postgresql://authenticator:authenticator@localhost:5432/dermapex_e2e \
POSTGREST_BIN=/ruta/postgrest \
PLAYWRIGHT_MODULE=/ruta/node_modules/playwright-core/index.mjs \
e2e/run-smoke.sh
```

Capturas: `docs/e2e-screenshots/`. Nunca apuntar a un proyecto Supabase real (el script lo rechaza).
