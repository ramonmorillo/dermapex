# DERMAPEX · Próximos pasos tras la migración arquitectónica

Este documento enumera **qué falta** para cada bloque y **qué dato de entrada lo bloquea**. No propone variables, puntos de corte ni reglas clínicas: todo lo clínico debe proceder del protocolo oficial DERMAPEX (versión y fecha a registrar en cada implementación).

Leyenda de dependencias: **[P]** protocolo/CRD · **[I]** instrumento validado (versión española, licencia, manual de puntuación) · **[T]** técnico (sin bloqueo clínico).

---

## 0. Prerrequisitos transversales

| Tarea | Dependencia |
|---|---|
| Protocolo DERMAPEX versionado + CRD/diccionario de datos (variable, tipo, unidades, rango, obligatoriedad, momento de recogida) | [P] |
| Proyecto Supabase DERMAPEX: configurar *secrets* `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en GitHub y `.env` local | [T] |
| GitHub Pages: activar *Source = GitHub Actions*; definir variable `DERMAPEX_BASE_PATH` si hay dominio propio | [T] |
| Dependencias con avisos de seguridad: actualizar `react-router-dom`/`@remix-run/router` a una versión sin el aviso GHSA-2j2x-hqr9-3h42 (comprobar con `npm audit`), valorar sustituir `xlsx` 0.18.5 (sin parches en npm) por la distribución oficial de SheetJS o alternativa, revisar `ws` vía supabase-js | [T] |

## 1. Modelo de datos definitivo

- ✅ Hecho (fase 2): migraciones del núcleo en `supabase/migrations/` (centros y pertenencias, RLS por centro con roles investigador/coordinación, pacientes seudonimizados, auditoría ampliada, Storage, `med_catalog_*`) y pruebas automatizadas de RLS (`scripts/test-db.sh`, CI). **Pendiente de aplicar** al proyecto Supabase: ver `DERMAPEX_DATABASE_SETUP.md`.
- Alta de centros participantes y usuarios (coordinación). [P]
- Tabla clínica por visita que sustituya a `clinical_assessments`. [P]
- Tipos TypeScript generados desde el esquema; servicios nuevos (p. ej. `clinicalDataService.ts`) usando `utils/payloadNormalization.ts`. [T]
- Pantalla de gestión de centros/usuarios para coordinación (hoy por SQL). [T]

## 2. Variables clínicas de dermatitis atópica

- Falta la lista cerrada de variables, sus definiciones operativas y en qué visita se recogen. [P]
- Implementar: esquema de validación (`PayloadSchema`), formulario en `/visits/:visitId/stratification` (hoy placeholder `BaselineStratificationPage.tsx`), servicio de lectura/escritura, exportación y etiquetas SPSS.
- Alimentar `features/baseline-trend/parameterCatalog.ts` con las variables cuantitativas que tenga sentido representar longitudinalmente y reconectar `BaselineTrendPanel` en `PatientDetailPage.tsx`.

## 3. Estratificación CMO-DERMAPEX

- ✅ Hecho (2026-10-06): modelo CMO-MAPEX inmunomediadas, subtipo dermatológico, sin cambios (fuente `cmoinmunomediadas@227e444`), motor `scoreCmo` (`cmo-dermapex-1.0.0+src.227e444`) equivalente a la fuente, catálogo de variables versionado e inmutable, guardado atómico verificado en servidor, cohortes por centro (`centers.study_arm`) con visibilidad restringida en BD, página `/visits/:visitId/stratification`, historial en la ficha y exportación CSV/XLSX/SPSS. Detalle y trazabilidad: `DERMAPEX_CMO_ENGINE.md`.
- **Validar (IP):** decisiones D1-D8 y A1-A6 (`DERMAPEX_CMO_ENGINE.md` §4) y discrepancias DISC-1…DISC-6 (§5), en particular el máximo del bloque demográfico (DISC-1) y el criterio de medicamento reciente (DISC-2). [P]
- **Aplicar** las migraciones `20261006*` al proyecto Supabase (con revisión explícita) y **asignar la cohorte** (`study_arm`) a cada centro existente antes de incluir pacientes. [T]
- Pendiente: redacción operativa de criterios para consulta (los actuales son literales de la fuente, pensados para extracción desde texto; DISC-4). [P]
- Pendiente: calendario de visitas (§12) y su relación con los motivos de estratificación. [P]

## 3b. Cohorte de atención farmacéutica estándar (decisión IP 2026-10-07)

- ✅ Los centros `standard` **no estratifican**: bloqueado en BD (trigger en `cmo_scores`, migración `20261007090000`) y oculto en la interfaz. Sustituye la parte de D5 que registraba las variables CMO a ciegas.
- ✅ Registran sus intervenciones seleccionándolas de un **listado neutro** por desplegable, sin texto libre (`usual_care_activity_catalog`, versión `af-estandar-0.1-borrador`, migración `20261007090100`). «Sin intervención en esta visita» es excluyente; cada actividad una vez por visita. La exportación distingue `sin_registro` / `sin_intervencion` / `con_intervencion`.
- **Validar (IP):** contenido del listado (propuesta de Claude, no procede de una clasificación publicada) y si la cohorte CMO debe registrar también con el mismo listado para comparar entre cohortes. [P]

## 4. IEXPAC

- ✅ Hecho (2026-10-07): ítems sustituidos por el texto literal de IEXPAC ©2015 castellano (15 ítems; 1-11 obligatorios, 12-15 condicionados con opción «No aplica»). Batería habilitada en `questionnaire_measurement_map` (migración `20261007080000`, aplicada): IEXPAC, MORISKY_GREEN, EQ5D_5L, PAM10.
- Puntuación provisional: global = `10·(Σ ítems 1-11 − 11)/44`; ítems 12-15 se guardan en bruto y no puntúan (`secondary_score` = ítem 12). **Verificar contra el manual oficial** (regla de puntuación, ausentes, uso de 12-15). [I]
- Pendiente: confirmar permiso de uso del texto del instrumento en la herramienta. [I]
- Confirmar momentos de administración. [P]
- Morisky-Green, EQ-5D-5L y PAM-10 habilitados por decisión del IP; siguen pendientes versión y licencia (R1). [I]

## 5. POEM

- No implementado. Falta: versión, ítems, opciones de respuesta, regla de puntuación y bandas de gravedad del manual oficial; licencia de uso. [I]
- Implementar como nuevo `QuestionnaireType` en `questionnaireDomain.ts` + formulario + `questionnaire_measurement_map` + exportación + tests.

## 6. NRS de prurito

- No implementado. Falta: formulación exacta, periodo de recuerdo (p. ej. 24 h/7 días), escala y si se registra peor/medio. [P]/[I]

## 7. DLQI

- ✅ Hecho (2026-10-07): DLQI de 10 ítems (texto aportado por el IP) en visitas basal y final, para ambas cohortes. Puntuación según Cardiff University (`src/services/dlqi.ts`): 0-3 por ítem, «Sin relación» = 0, ítem 7 (impide = 3; si no, 0-2), un ítem sin contestar = 0 y con 2+ no se puntúa; total 0-30 y bandas 0-1/2-5/6-10/11-20/21-30. Exportación: DLQI basal/final, banda y delta. Migración `20261007090200`.
- **Pendiente:** licencia de uso de Cardiff (incluido el formato electrónico) y confirmar el texto con la versión española oficial. [I]

## 8. EVASAF

- ✅ Hecho (2026-10-07): EVASAF (Monje-Agudo et al., Farm Hosp 2015;39(3):152-6), 10 ítems Likert 1-5, en visitas basal y mes 12 para ambas cohortes. Migración `20261007100000`.
- **Validar (IP):** el artículo no define puntuación total; resumen provisional = media de los 10 ítems (suma en `secondary_score`). No se recogen los datos sociodemográficos de cabecera ni los comentarios libres. [P]
- **Validar (IP):** en la visita basal el paciente puede no haber recibido aún atención farmacéutica del estudio; definir a qué atención se refiere la respuesta basal. [P]

## 9. Adherencia

- Falta: método(s) de medida del protocolo (cuestionario, registros de dispensación, combinación), definición operativa y umbral de «adherente». [P]
- Infraestructura disponible: cuestionarios (Morisky-Green heredado, a validar/retirar), medicación longitudinal y eventos por visita. Si se usan registros de dispensación, se necesita modelo de datos adicional. [P]

## 10. Persistencia

- Falta: definición operativa (tratamiento índice, *gap* permitido, fecha de discontinuación, motivos de cambio/suspensión). [P]
- Base técnica disponible: `patient_medications.start_date/end_date/is_active` y `visit_medication_events` (`added/modified/stopped`). Probablemente requiere añadir motivo de suspensión/cambio y marcar el tratamiento índice. [P]

## 11. Intervenciones CMO

- ✅ Hecho (2026-10-06): `intervention_catalog` con las 20 tarjetas literales de la fuente (`cmoinmunomediadas@227e444-draft`, dimensión C/M/O, niveles recomendados, categoría, tier), `recommended_levels` como fuente de verdad (D8), `VisitInterventionsPage` lee de la BD, filtra por nivel vigente con «ver todas», muestra el paquete mínimo del protocolo y guarda código y versión de catálogo. Solo centros `cmo`. «Otra intervención (texto libre)» se mantiene.
- **Validar (IP):** tabla de correspondencia tarjeta → paquete del protocolo (`DERMAPEX_CMO_ENGINE.md` §6), 7 tarjetas sin correspondencia clara y 7 acciones del protocolo sin tarjeta. Al validarlo, publicar una versión nueva del catálogo (sin sufijo `-draft`) en una migración nueva. [P]
- Pendiente: decidir si el brazo estándar debe documentar actuaciones de AF estándar (hoy bloqueado; A6). [P]

## 12. Visitas basal, 6 y 12 meses

- Hoy: `VISIT_TYPE_OPTIONS` heredado (basal, 3, 6, 9, 12, extraordinaria) y cuestionarios solo en basal y mes 12.
- Falta: calendario definitivo, ventanas de visita, qué se recoge en cada visita y política de visitas extraordinarias. [P]
- Implementar: ajuste de `src/constants/enums.ts`, `isQuestionnaireVisitType`, `dashboardService` (contadores por visita) y `NewVisitPage`.

## 13. Dashboard

- Hoy: indicadores genéricos CMO heredados (cohorte, seguimiento, actividad, calidad de datos) con aviso visible.
- Falta: lista de indicadores del estudio (reclutamiento por centro, completitud por visita, PROs, nivel CMO…). [P]
- Añadir filtro por centro cuando exista el modelo multicéntrico. [T]

## 14. Informes

- Motor PDF en navegador conservado. Falta: contenido de los informes paciente/clínico aprobado, textos de recomendaciones, firma (nombre del profesional desde perfil/centro). [P]
- ✅ Corregido R10 (la puntuación se imprimía como «prioridad»); etiquetas de nivel unificadas en `constants/cmoLevels.ts`. Los informes de centros de la cohorte estándar no incluyen resultados CMO.

## 15. Exportación de base de investigación

- Hoy: CSV/XLSX/SPSS anonimizados con pacientes, visitas, puntuación CMO, intervenciones, cuestionarios heredados y medicación por visita.
- Falta: diccionario de datos definitivo (nombres de variable, etiquetas, valores) y plan de análisis estadístico para el formato *wide/long*. [P]
- Revisar la inferencia de formatos SPSS por nombre de columna (`inferSpsFormatByHeader`, `spssWriter.ts`). [T]
- Revisar que el conjunto exportado cumple la minimización acordada con el CEIm/DPD. [P]

---

## Orden recomendado

1. Protocolo/CRD → 2. Esquema BD (centros + RLS + auditoría) → 3. Variables clínicas → 4. Motor CMO-DERMAPEX con tests → 5. Batería de cuestionarios → 6. Intervenciones → 7. Adherencia/persistencia → 8. Dashboard, informes y exportación.
