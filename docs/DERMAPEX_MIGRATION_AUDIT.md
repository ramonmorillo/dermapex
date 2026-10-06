# DERMAPEX · Auditoría de migración arquitectónica desde IRIS (`cmorcvtesis`)

**Fase:** migración arquitectónica (no adaptación clínica).
**Origen:** `ramonmorillo/cmorcvtesis`, rama `main`, commit `45a3360d22f073285c6cc85535f5707c30b0a87a` (2026-09-25). Solo lectura: el repositorio origen no se ha modificado.
**Destino:** `ramonmorillo/dermapex`.

Convenciones de este documento:

- **Dato objetivo**: lo que está en el código o en las migraciones de IRIS (con ruta).
- **Interpretación**: lectura técnica/profesional del dato.
- **Decisión**: lo que se ha hecho en este PR.

---

## 1. Alcance y método

1. Se inventariaron los 131 ficheros versionados de IRIS (≈ 13 000 líneas de código fuente, 22 migraciones SQL, 1 Edge Function, 3 suites de test).
2. Se trazaron las dependencias entre módulos (`import`) y las tablas Supabase a las que accede cada servicio (`supabase.from(...)`).
3. Se buscaron referencias a IRIS, RCV, variables cardiovasculares, datos de la tesis y credenciales.
4. Se copió la base completa salvo exclusiones justificadas (§6), se verificó que compilaba **antes** de tocar nada (línea base: `tsc` limpio, 31/31 tests) y después se aplicaron los cambios descritos.

**Credenciales.** No se encontraron URL, claves ni IDs de proyecto Supabase hardcodeados en IRIS: el cliente ya leía `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.ts`) y el workflow las tomaba de *secrets*. Las únicas referencias a infraestructura propia de IRIS eran el dominio `iriscmo.es` en `index.html` (eliminado).

---

## 2. Clasificación

### A. CORE_REUSE — reutilizado prácticamente sin cambios

| Elemento | Ruta | Comentario |
|---|---|---|
| Stack | `package.json`, `vite.config.ts`, `tsconfig*.json` | React 18, TypeScript 5.9, Vite 5, react-router 6 (`createHashRouter`), supabase-js 2, xlsx, vitest. Sin frameworks nuevos. |
| Cliente Supabase y pantalla de configuración ausente | `src/lib/supabase.ts`, `src/App.tsx` | Patrón `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` intacto. |
| Autenticación | `src/services/authService.ts`, `src/components/layout/AppShell.tsx` | Guardia de sesión en el *shell* autenticado. |
| Router y estructura de páginas | `src/router.tsx` | Rutas idénticas (incluida `/visits/:visitId/stratification`, ahora placeholder). |
| Pacientes | `src/services/patientService.ts`, `PatientsPage`, `NewPatientPage` | Solo cambian textos de cabecera y la etiqueta «Farmacia» → «Centro». |
| Visitas y timeline | `src/services/visitService.ts`, `NewVisitPage`, `VisitTimeline`, `VisitTabs`, `utils/followupStatus.ts` | Sin cambios funcionales. |
| Persistencia de puntuación CMO | `src/services/cmoScoreService.ts` | Genérica (score, nivel 1-3, `factors` JSON, `calculated_by`). No contiene reglas. |
| Nivel de referencia para intervenciones | `src/utils/referenceStratification.ts` (+ test) | Genérico. |
| Intervenciones (servicio) | `src/services/interventionService.ts` | Sin cambios. |
| Proceso/factibilidad por visita | `src/services/visitProcessService.ts`, `VisitProcessPage` | Sin cambios (ver REVIEW sobre sus variables). |
| Medicación longitudinal | `src/features/medications/**` | Catálogo normalizado, eventos por visita, snapshot por visita. Solo se retiran las sugerencias de indicación RCV. |
| Integración CIMA | `src/features/medications/cimaSearchService.ts`, `supabase/functions/search-cima-medications/index.ts` | API REST pública de la AEMPS, gratuita. La Edge Function debe desplegarse en el Supabase de DERMAPEX. |
| Documentos de visita | `src/features/visit-documents/**`, `VisitDocumentsPage` | PDF ≤ 6 MB, bucket privado `visit-documents`, URLs firmadas 10 min. |
| Infraestructura de cuestionarios | `src/services/questionnaireService.ts`, `src/services/questionnaireDomain.ts` (+ test) | Guardado por visita, `questionnaire_measurement_map`, validación de trazabilidad paciente/visita/momento. |
| Generador PDF en navegador | `src/services/reportService.ts` (`composePdfDocument` y auxiliares) | Motor sin cambios. |
| Escritor SPSS `.sav` | `src/utils/spssWriter.ts` | Sin cambios. |
| Analítica longitudinal del dashboard | `src/services/dashboardAnalytics.ts` (+ 22 tests) | Lógica genérica de niveles CMO basal vs. último. |
| Componentes UI | `src/components/ui/*`, `src/components/common/*` | `MetricCard`, `Notice`, `StatusBadge`, `DistributionBar`, `TrendDelta`, `ScoreTrendChart`, `CmoLevelBadge`, `CmoResultPanel`, `PatientHeader`, `PageHeader`, `SectionHeader`, `LoadingState`, `ErrorState`, `EmptyState`. |
| Hoja de estilos | `src/styles/main.css` | Conservada; las clases `iris-*` se mantienen como identificadores internos (ver REVIEW). |
| Despliegue | `.github/workflows/deploy-pages.yml` | Se añade la ruta base configurable (§5). |

### B. REUSE_ADAPT — arquitectura reutilizable, contenido clínico a modificar

| Elemento | Ruta | Estado tras este PR |
|---|---|---|
| Dashboard | `src/services/dashboardService.ts`, `src/pages/DashboardPage.tsx` | Infraestructura conservada. Se elimina el *embed* `clinical_assessments(id)` (rompería el panel en una BD DERMAPEX). Aviso visible de indicadores heredados. |
| Cuestionarios (instrumentos) | `src/pages/VisitQuestionnairesPage.tsx`, `questionnaireDomain.ts` | Motor intacto. IEXPAC, Morisky-Green, EQ-5D-5L y PAM-10 siguen operativos pero marcados como **heredados de IRIS, pendientes de validación**. Calendario de cuestionarios = basal / Mes 12 (heredado). |
| Informes | `src/services/reportService.ts`, `VisitReportsPage` | Motor intacto. Retirados: firma con nombre propio, pie de la tesis, recomendaciones de coordinación por nivel CMO-RCV y recomendaciones por defecto al paciente. |
| Catálogo de intervenciones | `src/pages/VisitInterventionsPage.tsx`, `src/constants/interventionCatalog.ts` | Catálogo vaciado. Se mantiene «Otra intervención (texto libre)» con pilar CMO, prioridad y nivel vinculado. |
| Tendencias longitudinales | `src/features/baseline-trend/*` | Panel generalizado (ya no depende del tipo RCV `ClinicalAssessment`); catálogo de parámetros vacío. |
| Ficha del paciente | `src/pages/PatientDetailPage.tsx` | Deja de consultar `clinical_assessments`. Conserva evolución CMO, cuestionarios, medicación, intervenciones. |
| Formulario clínico de visita / estratificación | `src/pages/BaselineStratificationPage.tsx` | Sustituido por un placeholder de solo lectura. |
| Exportación | `src/services/exportService.ts` | Se conservan CSV/XLSX/SPSS y anonimización. Retiradas las 35 variables de `clinical_assessments`. Función renombrada `exportResearchDataBundle`. |
| Normalización de payloads clínicos | `src/utils/payloadNormalization.ts` (nuevo, + test) | Extraída del antiguo `assessmentService.ts` (lógica genérica guiada por esquema) para reutilizarla en los formularios DERMAPEX. |
| Tipos de visita | `src/constants/enums.ts` | **Sin cambios**: basal, mes 3, 6, 9, 12, extraordinaria. DERMAPEX prevé basal/6/12 (ver NEXT_STEPS §12). |
| Identidad institucional | `src/constants/institutional.ts`, `InstitutionalReference`, `PublicFooter`, `ProjectPage`, `LoginPage`, `PublicInfoPage`, `AppShell`, `BrandMark`, `index.html`, `public/favicon.svg` | DERMAPEX + subtítulo provisional. Promotor, IP y código CEIm = `null` → «Pendiente de protocolo». |

### C. RCV_REMOVE_OR_REPLACE — específico de riesgo cardiovascular

| Elemento (dato objetivo) | Ruta IRIS | Decisión |
|---|---|---|
| Motor CMO-RCV: 20 variables (HTA, no-HDL ≥ 130, patología CV, ECV 12 m, raza/etnia, embarazo, tabaco, actividad física…), umbrales N1 ≥ 37 / N2 ≥ 27 | `src/services/cmoScoringEngine.ts` | **Retirado.** El fichero conserva solo tipos genéricos, `LEVEL_THRESHOLDS = []`, `CMO_ENGINE_NAME = 'CMO-DERMAPEX scoring engine'`, `CMO_ENGINE_STATUS = 'pending_protocol'`. No existe función de cálculo. |
| Evaluación clínica (PA, FC, peso, IMC, cintura, LDL, HDL, no-HDL, glucosa, HbA1c, SCORE2, Framingham, `cv_risk_level`, tabaco, dieta…) | `src/services/assessmentService.ts` | **Eliminado.** Su normalizador genérico se ha extraído a `utils/payloadNormalization.ts`. |
| Formulario de estratificación basal RCV (671 líneas) | `src/pages/BaselineStratificationPage.tsx` | **Sustituido** por placeholder «pendiente de CMO-DERMAPEX scoring engine». |
| Catálogo de parámetros de tendencia (vitales, analíticos, riesgo CV) | `src/features/baseline-trend/parameterCatalog.ts` | **Vaciado.** |
| Catálogo de 46 intervenciones (cribado FRCV, PA, lípidos, HbA1c, FA, cesación tabáquica orientada a eventos CV…) | `VisitInterventionsPage.tsx` (inline) y `constants/interventionCatalog.ts` (duplicado, no usado por la UI) | **Vaciados.** No se ha conservado un subconjunto «genérico» para no fabricar un catálogo DERMAPEX por selección. Referencia disponible en el commit origen. |
| Sugerencias de indicación (prevención secundaria, HTA, dislipidemia, IC, FA…) | `src/features/medications/MedicationPanel.tsx` | **Retiradas.** Indicación en texto libre, sin aviso de «no estandarizada» mientras no haya lista. |
| `SMOKER_STATUS_OPTIONS` | `src/constants/enums.ts` | **Eliminado** (solo lo usaba el formulario RCV). |
| Variables de `clinical_assessments` en la exportación y etiquetas SPSS | `src/services/exportService.ts` | **Eliminadas.** |
| Recomendaciones de coordinación por nivel (p. ej. «revisión médica preferente en ≤ 7 días» en N1) | `src/services/reportService.ts` | **Retiradas** (regla clínica del estudio RCV). Texto «pendiente de definir en el protocolo». |
| Textos «riesgo cardiovascular», «CMO-RCV», «tesis», datos de doctoranda/directores/universidad/SICEIA, firma con nombre propio | múltiples | **Retirados** de toda la UI e informes. |
| Landing pública promocional de IRIS | `src/pages/LoginPage.tsx` | **Reducida** a identidad + acceso. No se han escrito textos promocionales ni *claims* nuevos. |
| Tablas `clinical_assessments`, `measurements` y columnas RCV | migraciones | No se migran (ver `DERMAPEX_DATABASE_PLAN.md`). |

### D. REVIEW — reutilización no clara (decisión conservadora adoptada)

| # | Elemento | Observación | Decisión |
|---|---|---|---|
| R1 | Instrumentos IEXPAC / Morisky-Green / EQ-5D-5L / PAM-10 | IEXPAC sí figura en DERMAPEX; los otros tres no consta que formen parte del protocolo. La fórmula IEXPAC implementada es `10·(Σq1..q11 − 11)/44` con ítem 12 aparte (`questionnaireDomain.ts`). Morisky-Green puede tener implicaciones de licencia (a verificar). | Se mantienen operativos para no romper el motor ni sus tests, con aviso visible. Validar contra protocolo antes de recoger datos reales. |
| R2 | Niveles CMO 1-3 y su semántica (1 = mayor complejidad) | Es la convención del modelo CMO en IRIS; no se ha verificado que el protocolo CMO-DERMAPEX use 3 niveles con la misma orientación. | Se conserva la infraestructura (tipos, badge, dashboard, intervenciones) porque no contiene reglas clínicas. Confirmar con protocolo. |
| R3 | `visit_process_records` (tiempo de sesión, costes, abandono, recomendación a otro profesional) | Variables de factibilidad de la tesis RCV; plausiblemente útiles pero no consta que estén en DERMAPEX. | **Retirado de la aplicación el 2026-10-06 por decisión de la IP** (no es útil para DERMAPEX): sin pestaña «Proceso», sin página ni servicio. La tabla `visit_process_records` sigue en la BD (vacía, con RLS y auditoría); su eliminación exigiría una migración nueva. |
| R4 | Tipos de documento (`ecg`, `lab_report`, `map`, …) | `ecg` tiene sesgo cardiológico; `map` (¿mapa de medicación?) ambiguo. | Sin cambios. Revisar lista con protocolo. |
| R5 | Clases CSS `iris-*` y comentarios internos | No visibles para el usuario. Renombrarlas sería refactor estético masivo (282 apariciones). | Conservadas. Renombrar en una tarea aislada si se desea. |
| R6 | `server/pdf/*` (Express + Playwright) | Código muerto en IRIS: no está en `package.json` (falta `express`), el README declara el PDF «100 % en navegador» y `openPrintableHtmlDocument` lanza «retirada». Contiene firma con nombre propio. | **No migrado.** |
| R7 | `docs/*` de IRIS (auditorías, propuestas) | Documentación del proyecto RCV. | **No migrados.** Se citan por nombre cuando aportan contexto. |
| R8 | Migraciones SQL de IRIS | Ver §4: no reflejan fielmente el esquema real de IRIS. | **No copiadas** a `supabase/migrations/` para evitar un `db push` accidental. Plan en `DERMAPEX_DATABASE_PLAN.md`. |
| R9 | Inferencia de tipos SPSS por nombre de columna (`spssWriter.ts`, `exportService.ts` `inferSpsFormatByHeader`) | Contiene prefijos RCV (`ldl_`, `hba1c_`, `score2_`…). Inocuos tras retirar esas columnas. | Sin cambios; revisar al definir el diccionario de datos DERMAPEX. |
| R10 | Defecto heredado en informe | `reportService.ts` `deriveSimpleSummary`: «Su prioridad CMO actual es ${cmoScore}» imprime la **puntuación** como si fuera la prioridad. También coexisten dos juegos de etiquetas de nivel (`cmoPriorityLabel` vs `CMO_LEVEL_META`). | **Corregido el 2026-10-06** (`reportService.describeCmoForReport`, etiquetas únicas en `cmoLevels.ts`; ver `DERMAPEX_CMO_ENGINE.md`). |
| R11 | Campo «Centro» del alta de paciente | Columna heredada `pharmacy_site` (texto libre). | Solo se cambia la etiqueta. Sustituir por `center_id` (ver plan BD). |
| R12 | Calendario de cuestionarios basal + `month_12`/`final` | Heredado de IRIS (`isQuestionnaireVisitType`). | Sin cambios. Ajustar a basal/6/12 según protocolo. |

---

## 3. Seguridad y trazabilidad: lo que se preserva y lo que falta

**Preservado en el frontend:** autenticación obligatoria en todo el *shell*; `created_by`/`calculated_by`/`uploaded_by` = `auth.uid()`; validación de trazabilidad de cuestionarios antes de generar informes; anonimización de IDs en exportación; documentos en bucket privado con URL firmada.

**Hallazgos (dato objetivo → interpretación):**

1. **Aislamiento por usuario, no por centro.** `app_private.can_read_patient` / `can_write_patient` (migración `20260417100000_harden_rls_role_ready.sql`) permiten acceso si `patients.created_by = auth.uid()` o rol `admin`. → En un estudio **multicéntrico** esto impide el trabajo en equipo dentro de un centro y no aporta aislamiento entre centros. Requiere modelo `centers` + pertenencia (plan BD).
2. **Auditoría incompleta.** `write_audit_log` solo se dispara en `patients`, `consents`, `visits`, `measurements`, `cmo_scores`, `interventions`, `questionnaire_responses` y `visit_process_records`. → No se auditan `patient_medications`, `visit_medication_events`, `visit_documents` ni `clinical_assessments`.
3. **Roles definidos pero no explotados.** `profiles.role ∈ {clinician, admin, pharmacist, investigator}`; las políticas solo distinguen `admin`. → Sin rol de monitor/solo lectura ni de coordinador de centro.
4. **Datos identificativos.** `patients` admite `medical_record_number`, `initials`, `birth_date`, `phone`, `email`. → Revisar minimización/seudonimización para DERMAPEX (la app solo usa `study_code` y `birth_date` para calcular la edad).
5. **Edge Function CIMA con CORS `*`.** Aceptable (proxy de API pública), pero conviene restringir orígenes en producción.

Ninguna medida de seguridad se ha rebajado en este PR. No se ha ejecutado nada contra ningún Supabase.

---

## 4. Riesgo principal: las migraciones de IRIS no son fuente de verdad

Datos objetivos:

- El código usa tablas **que ninguna migración crea**: `visit_documents` (+ bucket `visit-documents`) y `med_catalog_ingredients`, `med_catalog_concepts`, `med_catalog_products`, `med_catalog_concept_ingredients`, `med_catalog_aliases` (las migraciones solo les añaden RLS).
- Restricciones de migración incompatibles con los valores que escribe la app: `visits.visit_status` admite `programada/realizada/cancelada/no_presentada`, la app usa `scheduled/completed/cancelled`; `clinical_assessments.smoker_status` admite `si/no`, la app usaba `never/former_recent/current`.
- Columnas que la app escribía y que ninguna migración crea: `clinical_assessments.biological_sex` y `clinical_assessments.hypertension_present` (comprobado con búsqueda exhaustiva en las 22 migraciones).

Interpretación: el esquema remoto de IRIS evolucionó fuera de las migraciones. **Reproducir IRIS ejecutando sus migraciones no daría un esquema compatible con su propio frontend.** El esquema DERMAPEX debe escribirse de nuevo, completo y verificado contra los servicios (ver plan BD).

---

## 5. Cambios de infraestructura

| Cambio | Motivo |
|---|---|
| `.env.example` solo con *placeholders* DERMAPEX y advertencia sobre la service-role key | Requisito de credenciales. |
| `.gitignore` ignora `.env.*` (salvo `.env.example`) y temporales de Supabase CLI | Evitar fugas de credenciales. |
| `vite.config.ts`: `base` desde `DERMAPEX_BASE_PATH` (por defecto `/`) | IRIS usaba dominio propio (`base: '/'`). Sin dominio, GitHub Pages sirve en `/dermapex/` y los *assets* romperían. |
| Workflow Pages: `DERMAPEX_BASE_PATH = vars.DERMAPEX_BASE_PATH \|\| '/dermapex/'` | Ídem. |
| Nuevo `.github/workflows/ci.yml` (PR: `tsc`, tests, build sin secretos) | El workflow heredado solo se ejecuta en `main`. |
| `index.html`: `<meta name="robots" content="noindex, nofollow">`, sin `canonical`/`og:url` de IRIS | Aplicación de acceso restringido aún sin contenido público aprobado. Decisión conservadora, reversible. |
| `package.json` / `package-lock.json`: `name = dermapex` | Identidad. Sin cambios de dependencias. |

---

## 6. Verificación

| Comprobación | Resultado |
|---|---|
| `npm ci` | OK |
| `npx tsc -b` | OK, sin errores |
| `npm test` (vitest) | 4 ficheros, 33 tests OK (31 heredados + 2 nuevos de `payloadNormalization`) |
| `npm run build` | OK. Aviso heredado: *chunk* de ~900 kB (xlsx), sin impacto funcional |
| Build con `DERMAPEX_BASE_PATH=/dermapex/` | *Assets* con prefijo correcto |
| Humo en Chromium | Sin `.env`: pantalla «Falta configuración de Supabase». Con valores ficticios: landing/login DERMAPEX y `/#/legal` sin errores de consola |
| Barrido de texto | Sin referencias visibles a IRIS/RCV salvo los avisos que explican explícitamente la herencia |

**No verificado (requiere Supabase DERMAPEX):** pantallas autenticadas contra datos reales, RLS, Edge Function CIMA, subida de documentos.

`npm audit --omit=dev` (heredado, no modificado): `react-router`/`@remix-run/router` (moderado, *open redirect*), `ws` (alto, vía supabase-js realtime), `xlsx` 0.18.5 (alto; SheetJS ya no publica correcciones en npm). Ver NEXT_STEPS.
