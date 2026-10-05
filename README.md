# DERMAPEX

Modelo CMO-MAPEX en dermatitis atópica. Aplicación web para un estudio prospectivo multicéntrico en pacientes adultos con dermatitis atópica moderada-grave.

> **Estado: fase de migración arquitectónica.** La base técnica procede de IRIS (`cmorcvtesis`). La lógica clínica de DERMAPEX (variables, estratificación CMO-DERMAPEX, cuestionarios, intervenciones) **aún no está implementada**. Ver `docs/`.

## Documentación

- `docs/DERMAPEX_MIGRATION_AUDIT.md` — qué se reutilizó, adaptó, retiró o queda en revisión.
- `docs/DERMAPEX_DATABASE_PLAN.md` — plan del esquema Supabase (no hay migraciones todavía).
- `docs/DERMAPEX_NEXT_STEPS.md` — qué falta y qué lo bloquea.

## Arquitectura

- **Frontend:** React 18 + TypeScript + Vite, `createHashRouter` (compatible con GitHub Pages).
- **Backend:** Supabase (Auth, Postgres con RLS, Storage, Edge Function `search-cima-medications`). Proyecto **independiente** del de IRIS.
- **Informes:** PDF generado en el navegador.
- **Exportación:** CSV, XLSX y SPSS (`.sav` + sintaxis `.sps`), anonimizada.
- **Tests:** Vitest.

## Puesta en marcha local

```bash
npm ci
cp .env.example .env   # rellenar con el proyecto Supabase de DERMAPEX
npm run dev
```

Variables obligatorias: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clave *anon/publishable*; **nunca** la service-role). Sin ellas la app muestra una pantalla de configuración pendiente.

```bash
npx tsc -b     # typecheck
npm test       # tests
npm run build  # build de producción (dist/)
```

## Despliegue (GitHub Pages)

Workflow `.github/workflows/deploy-pages.yml` (en cada push a `main`):

1. *Settings → Pages → Source = GitHub Actions*.
2. *Secrets*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` del proyecto DERMAPEX.
3. Ruta base: por defecto `/dermapex/`; con dominio propio, crear la variable de repositorio `DERMAPEX_BASE_PATH=/`.

Los PR ejecutan `.github/workflows/ci.yml` (typecheck, tests, build).

## Seguridad

- No versionar `.env` ni credenciales. `.env.example` contiene solo *placeholders*.
- No ejecutar migraciones contra ningún proyecto Supabase sin revisión explícita.
