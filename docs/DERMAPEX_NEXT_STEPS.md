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

- Migraciones nuevas según `DERMAPEX_DATABASE_PLAN.md` (núcleo, **centros y pertenencias**, RLS por centro, auditoría ampliada, Storage, `med_catalog_*`). [T] + lista de centros/roles [P]
- Tabla clínica por visita que sustituya a `clinical_assessments`. [P]
- Tipos TypeScript generados desde el esquema; servicios nuevos (p. ej. `clinicalDataService.ts`) usando `utils/payloadNormalization.ts`. [T]
- Pruebas automatizadas de RLS. [T]

## 2. Variables clínicas de dermatitis atópica

- Falta la lista cerrada de variables, sus definiciones operativas y en qué visita se recogen. [P]
- Implementar: esquema de validación (`PayloadSchema`), formulario en `/visits/:visitId/stratification` (hoy placeholder `BaselineStratificationPage.tsx`), servicio de lectura/escritura, exportación y etiquetas SPSS.
- Alimentar `features/baseline-trend/parameterCatalog.ts` con las variables cuantitativas que tenga sentido representar longitudinalmente y reconectar `BaselineTrendPanel` en `PatientDetailPage.tsx`.

## 3. Estratificación CMO-DERMAPEX

- Falta: variables del modelo, puntuación de cada categoría, umbrales de nivel, número y semántica de niveles, regla ante datos ausentes, versión del modelo. [P]
- Implementar en `src/services/cmoScoringEngine.ts` (hoy solo tipos + `LEVEL_THRESHOLDS = []`) una función pura `scoreCmo(input)` con **tests unitarios por variable y por umbral** construidos desde la tabla del protocolo.
- Poblar `cmo_variable_catalog`; añadir `engine_version` a `cmo_scores`.
- Reconstruir la página de estratificación reutilizando `CmoResultPanel` y `ScoreTrendChart` (ya toleran los umbrales nuevos).
- Decidir si el nivel se recalcula en cada visita de seguimiento o solo en basal. [P]

## 4. IEXPAC

- Ya existe implementación heredada (11 ítems Likert 1-5 → `10·(Σ−11)/44`; ítem 12 aparte). **Verificar** contra la versión y manual que cite el protocolo (ítems, sentido, tratamiento de ausentes, ítem 12). [I]
- Confirmar momentos de administración. [P]

## 5. POEM

- No implementado. Falta: versión, ítems, opciones de respuesta, regla de puntuación y bandas de gravedad del manual oficial; licencia de uso. [I]
- Implementar como nuevo `QuestionnaireType` en `questionnaireDomain.ts` + formulario + `questionnaire_measurement_map` + exportación + tests.

## 6. NRS de prurito

- No implementado. Falta: formulación exacta, periodo de recuerdo (p. ej. 24 h/7 días), escala y si se registra peor/medio. [P]/[I]

## 7. DLQI

- No implementado. Falta: versión española autorizada, reglas de ítems no aplicables/ausentes y bandas de interpretación del manual; licencia. [I]

## 8. EVASAF

- No implementado. Falta: confirmar el instrumento exacto al que se refiere el protocolo, su versión, ítems y algoritmo de puntuación. **No se ha podido identificar a partir de la información disponible en este repositorio**; requiere el documento fuente. [I]/[P]

## 9. Adherencia

- Falta: método(s) de medida del protocolo (cuestionario, registros de dispensación, combinación), definición operativa y umbral de «adherente». [P]
- Infraestructura disponible: cuestionarios (Morisky-Green heredado, a validar/retirar), medicación longitudinal y eventos por visita. Si se usan registros de dispensación, se necesita modelo de datos adicional. [P]

## 10. Persistencia

- Falta: definición operativa (tratamiento índice, *gap* permitido, fecha de discontinuación, motivos de cambio/suspensión). [P]
- Base técnica disponible: `patient_medications.start_date/end_date/is_active` y `visit_medication_events` (`added/modified/stopped`). Probablemente requiere añadir motivo de suspensión/cambio y marcar el tratamiento índice. [P]

## 11. Intervenciones CMO

- Falta: catálogo CMO-DERMAPEX (código, texto, pilar C/M/O, nivel mínimo, dominio). [P]
- Cargarlo preferentemente en `intervention_catalog` (versionado en BD) y que `VisitInterventionsPage.tsx` lo lea de ahí en lugar del array local (hoy vacío). Mantener «Otra intervención» para casos no catalogados.

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
- Corregir el defecto heredado documentado en la auditoría (R10: se imprime la puntuación como «prioridad»). [T]

## 15. Exportación de base de investigación

- Hoy: CSV/XLSX/SPSS anonimizados con pacientes, visitas, puntuación CMO, intervenciones, cuestionarios heredados y medicación por visita.
- Falta: diccionario de datos definitivo (nombres de variable, etiquetas, valores) y plan de análisis estadístico para el formato *wide/long*. [P]
- Revisar la inferencia de formatos SPSS por nombre de columna (`inferSpsFormatByHeader`, `spssWriter.ts`). [T]
- Revisar que el conjunto exportado cumple la minimización acordada con el CEIm/DPD. [P]

---

## Orden recomendado

1. Protocolo/CRD → 2. Esquema BD (centros + RLS + auditoría) → 3. Variables clínicas → 4. Motor CMO-DERMAPEX con tests → 5. Batería de cuestionarios → 6. Intervenciones → 7. Adherencia/persistencia → 8. Dashboard, informes y exportación.
