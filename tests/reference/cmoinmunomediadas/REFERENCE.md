# Referencia congelada · cmoinmunomediadas

Copia **literal y sin modificar** de la fuente clínica del modelo CMO-MAPEX para enfermedades
inmunomediadas. **Solo la usan los tests** (`tests/cmoEngineEquivalence.test.ts`,
`tests/cmoModelFidelity.test.ts`, `tests/interventionCatalogFidelity.test.ts`); la aplicación
nunca importa estos ficheros. El motor de producción es el port TypeScript de
`src/services/cmoScoringEngine.ts` con los datos de `src/constants/cmoDermapexModel.ts`.

| Campo | Valor |
|---|---|
| Repositorio | https://github.com/ramonmorillo/cmoinmunomediadas |
| Rama | `main` |
| Commit (HEAD fijado) | `227e444d2da1a6dcffe1c99f3afafb894297e483` (2026-09-10T18:11:08+02:00) |
| Último commit que tocó estos tres ficheros | `bf3494b65bf8616e9123af33d0c1e1307849d312` (2026-09-08) |
| Fecha de la copia | 2026-10-06 |

| Fichero | Ruta en la fuente | SHA-256 |
|---|---|---|
| `config.js` | `assets/modules/config.js` | `b85b3fba6aabb905e6d7e8acae1fc74d662c4106f42b52123142060802ab36ec` |
| `cmo-engine.js` | `assets/modules/cmo-engine.js` | `27fd557ccac68bb4f0cc01b9b8eb3555f1ee5ca81970d73aa8dcf1285617ec31` |
| `interventions-catalog.js` | `assets/modules/interventions-catalog.js` | `cf95b69bb1d45327548224dd947559ee28c257fce1dc0125a86705a35c93e4ca` |

`interventions-catalog.js` se añade a los dos ficheros pedidos para poder comprobar en test que el
catálogo cargado en `intervention_catalog` reproduce literalmente los textos de la fuente (D7).

Comprobación: `sha256sum tests/reference/cmoinmunomediadas/*.js` debe dar los valores de la
tabla (el test `cmoModelFidelity` también lo verifica). Si la fuente cambia, **no se editan estos
ficheros**: se copia la nueva versión, se actualiza esta tabla, se crea una versión nueva del
modelo/motor y se revisan las discrepancias.
