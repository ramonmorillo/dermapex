# DERMAPEX · Plan de base de datos

**Estado (actualizado en la fase 2):** el núcleo está implementado como migraciones en `supabase/migrations/2026100510*.sql` y validado en un PostgreSQL local con `scripts/test-db.sh` (también en CI). **No se ha aplicado a ningún proyecto Supabase**: los pasos están en `DERMAPEX_DATABASE_SETUP.md`. Las secciones siguientes se conservan como plan de referencia; el §5 resume lo implementado.

**Fuente:** migraciones de `ramonmorillo/cmorcvtesis` @ `45a3360` + uso real de tablas en el código migrado (`supabase.from(...)`).

> **Advertencia previa (ver `DERMAPEX_MIGRATION_AUDIT.md` §4).** Las migraciones de IRIS no reproducen su esquema real: faltan tablas que el código usa (`visit_documents`, `med_catalog_*`) y hay restricciones incompatibles con los valores que escribe la app (`visits.visit_status`). Por tanto **no deben copiarse ni ejecutarse**. El esquema DERMAPEX se escribirá como un conjunto nuevo de migraciones limpias, verificadas contra los servicios del frontend.

---

## 1. CORE — conservar conceptualmente

| Tabla / función | Uso en el código migrado | Notas para DERMAPEX |
|---|---|---|
| `profiles` (id = `auth.users.id`, `full_name`, `role`) | `cmoScoreService` hace *upsert* del perfil antes de guardar puntuaciones | Mantener. Ampliar roles (ver §2). |
| `patients` (`study_code` único, `inclusion_date`, `screening_date`, `birth_date`, `age_at_inclusion` 18-120, `sex`, `consent_signed`, `created_by`) | `patientService` | Mantener el núcleo seudonimizado. Revisar si se almacenan identificadores directos (`medical_record_number`, `initials`, `phone`, `email`): la app no los usa → **minimización**. |
| `visits` (`patient_id`, `visit_type`, `visit_number`, `visit_date` nullable, `scheduled_date`, `visit_status`, `extraordinary_reason`, `notes`, `created_by`) | `visitService`, dashboard, timeline | Mantener. Alinear el `check` de `visit_status` con los valores reales de la app (`scheduled/completed/cancelled`). |
| `consents` (`consent_type`, `status`, `granted_at`, `revoked_at`, `document_url`, `obtained_by`) | No usado aún por la UI | Mantener: necesario para el estudio (versionado del documento de consentimiento). |
| `audit_log` + `app_private.write_audit_log()` | Triggers | Mantener y **extender** a todas las tablas clínicas (ver §2). |
| `cmo_scores` (`visit_id` único, `score`, `priority` 1-3, `factors` JSON, `recommendations` JSON, `calculated_by`) | `cmoScoreService`, dashboard, informes, exportación | Mantener la estructura. Añadir versión del motor (ver §2). |
| `cmo_variable_catalog`, `cmo_score_item_results` | `cmoScoreService` (trazabilidad por ítem, *best effort*) | Mantener la arquitectura; **contenido** se poblará con las variables CMO-DERMAPEX. |
| `interventions` (`intervention_type`, `intervention_domain` = pilar CMO, `priority_level`, `linked_to_cmo_level`, `delivered`, `outcome`, `notes`, `delivered_by`) | `interventionService`, dashboard, informes | Mantener. |
| `intervention_catalog` | Seed oficial IRIS (no usado por la UI, que tenía catálogo *inline*) | Mantener la tabla como fuente versionada del catálogo CMO-DERMAPEX; **no** reutilizar el seed IRIS. |
| `questionnaire_responses` (`visit_id`, `user_id`, `measurement_id`, `questionnaire_code`, `responses` JSON, *upsert* por `visit_id,questionnaire_code`) + trigger `set_questionnaire_response_code` | `questionnaireService` | Mantener. Considerar guardar también puntuación calculada + versión del algoritmo (hoy se recalcula en cliente). |
| `questionnaire_measurement_map` (`questionnaire_code` → `measurement_id`) | `questionnaireService` | Mantener; poblar con los códigos de la batería DERMAPEX. |
| `medication_catalog` (+ `source`, `source_code`, `atc_code`…) | `medicationsService`, CIMA | Mantener, incluida la política de inserción por fuentes permitidas. |
| `med_catalog_ingredients`, `med_catalog_concepts`, `med_catalog_products`, `med_catalog_concept_ingredients`, `med_catalog_aliases` | `normalizedCatalogService` | Mantener. **Escribir su DDL** (IRIS no lo tiene en migraciones). |
| `patient_medications` (`start_date`, `end_date`, `is_active`, dosis/frecuencia/vía/indicación, metadatos de selección) | `medicationsService`, exportación | Mantener. Base para persistencia. |
| `visit_medication_events` (`added/modified/stopped/confirmed_no_change`, `old_value`/`new_value`) | `medicationsService` | Mantener. Es la traza longitudinal de cambios de tratamiento. |
| `visit_documents` + bucket Storage `visit-documents` (privado) | `visitDocumentsService` | Mantener. **Escribir DDL y políticas de Storage** (IRIS no las tiene en migraciones). |
| `visit_process_records` | — | **Eliminada** el 2026-10-06 por decisión de la IP (migración `20261006120000`; estaba vacía). |
| Funciones `app_private.current_profile_role`, `has_any_role`, `can_read_patient`, `can_write_patient`; `set_updated_at`, `set_created_by_to_current_user`, `set_delivered_by_to_current_user` | RLS y triggers | Mantener el patrón (helpers `security definer` con `search_path` fijo). Reescribir `can_*_patient` para el modelo por centro. |
| RLS `enable` + `force` en todas las tablas | — | Mantener sin excepciones. |
| Edge Function `search-cima-medications` | `cimaSearchService` | Desplegar en el proyecto DERMAPEX. |

## 2. ADAPTAR — reutilizables con cambios DERMAPEX

| Elemento | Cambio previsto | Bloqueado por |
|---|---|---|
| **Modelo multicéntrico** (nuevo): `centers`, `center_memberships (profile_id, center_id, role)`, `patients.center_id` | Sustituye `patients.pharmacy_site` (texto libre) e `investigator_name`. RLS por pertenencia a centro en lugar de `created_by = auth.uid()`. | Lista de centros y roles del protocolo. |
| Roles | Hoy: `clinician/admin/pharmacist/investigator`, solo `admin` se distingue. Proponer: investigador de centro, coordinador de centro, monitor (solo lectura, todos los centros), administrador de datos. | Plan de monitorización del estudio. |
| `audit_log` | Añadir triggers en `patient_medications`, `visit_medication_events`, `visit_documents`, `questionnaire_responses` (ya), tabla clínica DERMAPEX y `center_memberships`. Valorar `center_id` en el log. | — (técnico). |
| `cmo_scores` | Añadir `engine_version` / `model_version` (y opcionalmente `input_snapshot` JSON) para trazabilidad del algoritmo. | Versión del protocolo CMO-DERMAPEX. |
| `visits.visit_type` | Alinear con calendario DERMAPEX (basal, 6 m, 12 m, extraordinaria; ¿ventanas de visita?). | Protocolo. |
| Tabla clínica por visita DERMAPEX (sustituye a `clinical_assessments`) | Variables de dermatitis atópica (gravedad, tratamiento sistémico/biológico, comorbilidades atópicas…) **por definir**. Con `visit_id` único, `created_by`, `updated_at`, auditoría. | Protocolo / CRD. |
| `questionnaire_responses` | Códigos y reglas de IEXPAC, POEM, NRS prurito, DLQI, EVASAF, adherencia. | Protocolo y versiones validadas de los instrumentos. |
| `patient_medications` / `visit_medication_events` | Campos de persistencia (motivo de suspensión/cambio, fecha de fin), clasificación del tratamiento de DA. | Definición operativa de persistencia/adherencia. |
| `consents` | Versión de hoja de información/consentimiento aprobada por CEIm. | Documentación CEIm. |
| `visit_documents.document_type` | Revisar valores (`ecg`, `map`…). | Protocolo. |

## 3. ELIMINAR / SUSTITUIR — específicamente cardiovasculares

| Tabla / columna IRIS | Motivo | Sustituto |
|---|---|---|
| `clinical_assessments` completa: `systolic_bp`, `diastolic_bp`, `heart_rate`, `weight_kg`, `height_cm`, `bmi`, `waist_cm`, `ldl_mg_dl`, `hdl_mg_dl`, `non_hdl_mg_dl`, `fasting_glucose_mg_dl`, `hba1c_pct`, `score2_value`, `framingham_value`, `cv_risk_level`, `smoker_status`, `alcohol_use`, `physical_activity_level`, `diet_score`, `safety_incidents`, `adverse_events_count`, `high_risk_medication_present`, y las variables CMO-RCV (`education_level`, `pregnancy_postpartum`, `biological_sex`, `race_ethnicity_risk`, `hypertension_present`, `cv_pathology_present`, `comorbidities_present`, `recent_cvd_12m`, `hospital_er_use_12m`, `physical_activity_pattern`, `social_support_absent`, `psychosocial_stress`, `chronic_med_count`, `recent_regimen_change`, `regimen_complexity_present`, `adherence_problem`) | Modelo CMO-RCV. Algunas variables tienen análogo conceptual en CMO (polifarmacia, cambio de pauta, adherencia, apoyo social) pero **no se reutilizarán por renombrado**: entrarán solo si el protocolo CMO-DERMAPEX las define. | Tabla clínica DERMAPEX + `cmo_variable_catalog` DERMAPEX. |
| `measurements` (PA, lípidos, tabaco, dieta) | Esquema inicial RCV (no usado por la app). | — |
| `patient_baseline_profile`, `visit_clinical_context` | Extensiones de la tesis RCV (no usadas por la app migrada). | Valorar con el modelo de datos DERMAPEX. |
| Seed `intervention_catalog` (20260417123000) | Catálogo IRIS (p. ej. «seguimiento programado rutinario en farmacia comunitaria»). | Catálogo CMO-DERMAPEX. |
| `patients.pharmacy_site`, `patients.investigator_name` | Contexto farmacia comunitaria / tesis individual. | `center_id` + `created_by`. |

## 4. Procedimiento recomendado (siguiente fase)

1. Congelar el CRD/diccionario de datos DERMAPEX a partir del protocolo.
2. Escribir migraciones nuevas en `supabase/migrations/` (núcleo + centros + RLS + auditoría + Storage + `med_catalog_*`), sin dependencias de IRIS.
3. Validarlas en un entorno **local** (`supabase start`) o rama de desarrollo del proyecto DERMAPEX; ejecutar una batería de pruebas RLS (usuario de centro A no ve centro B; monitor solo lee; anónimo nada).
4. Generar tipos TypeScript desde el esquema y sustituir los tipos escritos a mano en los servicios.
5. Solo entonces aplicar al proyecto Supabase de DERMAPEX, con revisión explícita.

## 5. Implementado en la fase 2 (decisiones del investigador, 2026-10-05)

| Decisión | Implementación |
|---|---|
| Acceso **por centro** | `centers`, `center_memberships`; `patients.center_id` obligatorio; funciones `app_private.can_access_center/patient/visit` usadas por todas las políticas RLS. |
| Roles **investigador de centro** y **coordinación** | `profiles.role ∈ {investigator, coordinator}`. Coordinación: todos los centros, borrados, catálogos, centros, pertenencias y auditoría. El rol solo se cambia por SQL. |
| Pacientes **seudonimizados** | `patients` solo guarda código de estudio, centro, fechas de inclusión/cribado, edad, sexo y consentimiento. Sin NHC, nombre, teléfono, email ni fecha de nacimiento (la edad se calcula en el cliente). |
| Trazabilidad | `audit_log` sin claves foráneas, solo inserción por trigger, con autor, centro, paciente, visita y estado anterior/nuevo. Cubre también medicación, documentos, centros, perfiles y pertenencias. Autoría (`created_by`, `calculated_by`, `user_id`…) sellada en servidor con `auth.uid()`. |
| Integridad | Coherencia visita↔paciente (proceso, eventos de medicación, ítems CMO); documentos solo PDF ≤ 6 MB con ruta ligada a la visita; un cuestionario por visita y código, coherente con `questionnaire_measurement_map`. |
| Catálogos vacíos | `intervention_catalog`, `cmo_variable_catalog` y `questionnaire_measurement_map` sin datos: se cargan desde el protocolo. Consecuencia: **los cuestionarios no se pueden guardar** hasta configurar la batería DERMAPEX. |

No implementado (bloqueado por protocolo): tabla clínica de dermatitis atópica, calendario de visitas definitivo, catálogo de intervenciones, variables CMO-DERMAPEX.

## 6. Implementado el 2026-10-06 (estratificación CMO-DERMAPEX)

Migraciones `20261006100000`-`20261006100300` (pruebas en `db-tests/20_cmo_stratification.sql`):
`centers.study_arm` con trigger de inmutabilidad, `cmo_model_versions`, catálogo de variables
versionado e inmutable (28 filas), columnas nuevas en `cmo_scores`, función
`save_cmo_stratification` (única vía de escritura, verificada en servidor), RLS por cohorte y vistas
enmascaradas, catálogo de intervenciones literal (20 tarjetas) y vínculo `interventions → intervention_catalog`.
Detalle en `DERMAPEX_CMO_ENGINE.md`. **Pendiente de aplicar** al proyecto Supabase; tras aplicarlas,
coordinación debe asignar `study_arm` a cada centro existente.
