# DERMAPEX · Motor de estratificación CMO-DERMAPEX y catálogo de intervenciones

**Estado:** implementado (NEXT_STEPS §3 y §11). Decisiones D1-D8 **PENDIENTE VALIDACIÓN IP**.
**Fuente clínica:** `ramonmorillo/cmoinmunomediadas` @ `227e444` (ver
`tests/reference/cmoinmunomediadas/REFERENCE.md`, con SHA-256 de cada fichero).
**Protocolo:** DERMAPEX v0.5, apartados 5.4.3 y 5.4.4 (no incluido en el repositorio: el prompt de
encargo es la única transcripción disponible; ver §7).

Convenciones: **[Dato]** = lo que está en el código o en la fuente; **[Interpretación]** = lectura
técnica; **[Decisión]** = lo implementado.

| Identificador | Valor |
|---|---|
| `CMO_ENGINE_VERSION` (en `cmo_scores.engine_version`) | `cmo-dermapex-1.0.0+src.227e444` |
| `CMO_MODEL_VERSION` (en `cmo_variable_catalog.model_version`, `cmo_scores.model_version`) | `cmo-derma-model-1.0.0+src.227e444` |
| `INTERVENTION_CATALOG_VERSION` (en `intervention_catalog.catalog_version`) | `cmoinmunomediadas@227e444-draft` |

---

## 1. Fase 0 · Modelo de la fuente, variable a variable

[Dato] `config.js` (`FIELD_DEFINITIONS`, `AGE_GROUPS`, `BLOCKS`, `PRIORITY_THRESHOLDS`) filtrado
para `tipoEI = 'dermatologica'`. Los códigos son los `id` de la fuente. «Criterio» = campo
`criteria` literal (resumido aquí; el texto completo se muestra en la ayuda del formulario y está en
`src/constants/cmoDermapexModel.ts`).

| # | Código | Etiqueta (fuente) | Bloque | Valores → puntos |
|---|---|---|---|---|
| 1 | `edad_grupo` *(derivada)* | Grupo de edad | demográfica | ≤12 → 1 · 13-17 → 3 · **18-69 → 2 · ≥70 → 2** |
| 2 | `sexo_mujer` | Sexo femenino | demográfica | Sí 1 / No 0 |
| 3 | `peso_obesidad` | Obesidad (IMC ≥30 kg/m²) | demográfica | Sí 2 / No 0 |
| 4 | `embarazada` | Embarazada | demográfica | Sí 3 / No 0 · **regla especial** |
| 5 | `deseo_embarazo` | Deseo gestacional | demográfica | Sí 2 / No 0 · **regla especial** |
| 6 | `alcoholismo_drogas` | Alcoholismo y/o drogadicción | sociosanitaria | Sí 3 |
| 7 | `tabaquismo` | Tabaquismo | sociosanitaria | Sí 2 |
| 8 | `barreras_comunicacion` | Barreras de comunicación | sociosanitaria | Sí 3 |
| 9 | `sin_soporte_social` | Sin soporte social/familiar | sociosanitaria | Sí 3 |
| 10 | `situacion_laboral_dificil` | Actividad laboral dificulta el cumplimiento | sociosanitaria | Sí 2 |
| 11 | `calidad_vida_baja` | Calidad de vida disminuida | sociosanitaria | Sí 3 |
| 12 | `problemas_psicologicos` | Problemas psicológicos/psiquiátricos | sociosanitaria | Sí 3 |
| 13 | `deterioro_cognitivo_funcional` | Deterioro cognitivo o dependencia funcional | sociosanitaria | Sí 2 |
| 14 | `comorbilidades_2mas` | ≥2 enfermedades crónicas complejas | clínica | Sí 2 |
| 15 | `insuficiencia_renal_hepatica` | Insuficiencia renal o hepática | clínica | Sí 3 |
| 16 | `multidisciplinariedad` | ≥2 especialistas por órganos afectados | clínica | Sí 3 |
| 17 | `hospitalizaciones_urgencias` | ≥1 ingreso/urgencias en los últimos 2 meses | clínica | Sí 3 |
| 18 | `actividad_enfermedad` | Actividad moderada/alta de la enfermedad | clínica | Sí 3 |
| 19 | `naive_terapia` | Naïve a terapia hospitalaria | farmacoterapéutica | Sí 4 |
| 20 | `polimedicacion` | Polimedicación (≥6 medicamentos) | farmacoterapéutica | Sí 3 |
| 21 | `modificacion_regimen` | Modificación del tratamiento en los últimos 6 meses | farmacoterapéutica | Sí 3 |
| 22 | `medicamento_alto_riesgo` | Medicamento de alto riesgo (ISMP) | farmacoterapéutica | Sí 3 |
| 23 | `interacciones` | Riesgo de interacción clínicamente relevante | farmacoterapéutica | Sí 3 |
| 24 | `reacciones_adversas` | Reacciones adversas en el último año | farmacoterapéutica | Sí 3 |
| 25 | `falta_adherencia` | Falta de adherencia | farmacoterapéutica | Sí 4 |
| 26 | `medicamento_reciente` | Medicamento comercializado hace menos de 1 año | farmacoterapéutica | Sí 2 |
| 27 | `comorbilidades_cv_diabetes` | Comorbilidades cardiovasculares / síndrome metabólico / diabetes | específica (dermatológica) | ninguna 0 · una 1 · más de una 2 |
| — | `conservacion_especial` *(DERMAPEX, D3)* | Requisitos especiales de conservación | informativa | **no puntúa** |

**Recuento verificado** [Dato]: 5 demográficas (incl. edad) + 8 sociosanitarias + 5 clínicas + 8
farmacoterapéuticas + 1 específica = **27 puntuables**. Coincide con el encargo. Las variables
músculo-esqueléticas (`discapacidad_funcional`, `dolor_presente`) y gastrointestinales
(`complicaciones_intestinales`, `problemas_nutricionales`) **no se portan** ni aparecen en la UI.

**Umbrales y regla especial** [Dato, `cmo-engine.js`]: nivel 3 por defecto; total ≥ 18 → 2;
total ≥ 31 → 1; `embarazada = si` o `deseo_embarazo = si` → 1 siempre. Coinciden con el encargo.

### 1.1 Puntuación máxima del subtipo dermatológico

| Bloque | Máx. declarado en `BLOCKS` | Máx. aritmético (suma de pesos, adultos) |
|---|---:|---:|
| Demográficas | 9 | **10** (1 + 2 + 3 + 2 + 2) |
| Sociosanitarias | 21 | 21 |
| Clínicas | 14 | 14 |
| Farmacoterapéuticas | 25 | 25 |
| Específica (dermatológica) | 2 | 2 |
| **Total** | **71** | **72** |

**Discrepancia DISC-1** [Dato → Interpretación]: la fuente declara 9 puntos máximos en el bloque
demográfico y 71 en total, pero la suma de pesos en adultos es 10 (72 en total; 11/73 si se
incluyeran menores de 13-17 años). El motor de la fuente **no aplica tope** por bloque. El exceso
solo aparece si `embarazada` y `deseo_embarazo` son ambos «Sí»; en ese caso la regla especial ya
fuerza el nivel 1, por lo que **la discrepancia no puede cambiar el nivel asignado**. Se porta tal
cual (sin tope) para mantener equivalencia exacta; la UI muestra el máximo declarado por la fuente.
Ver §5.

## 2. Fase 0 · Encaje con el esquema de base de datos

| Tabla | Situación previa | Cambio |
|---|---|---|
| `centers` | sin cohorte | `study_arm` (`cmo` / `standard`), obligatoria en altas nuevas; trigger de inmutabilidad con pacientes; solo coordinación; auditada (ya existía el trigger de auditoría). |
| `cmo_variable_catalog` | vacía; `variable_code` único global; solo `label`, `domain`, `model_version` | Columnas `block`, `sort_order`, `value_type`, `options` (valor → puntos), `is_scored`, `definition`, `criteria`, `cmo_dimension`, `special_rule`; unicidad por `(variable_code, model_version)`; contenido inmutable (solo `is_active`). Semilla de 28 filas. |
| `cmo_model_versions` | no existía | Nueva: versión de modelo, versión de motor, commit de la fuente, umbrales, variables de regla especial. Inmutable. |
| `cmo_scores` | `score`, `priority`, `factors`, `engine_version` | `model_version`, `stratification_reason`, `special_rule_applied`, `incomplete`, `unknown_variables`, `block_scores`. Escritura solo vía función `save_cmo_stratification` (atómica, con verificación en servidor). Lectura de resultados restringida por cohorte. |
| `cmo_score_item_results` | `raw_value`, `item_score` | Sin columnas nuevas: una fila por cada una de las 28 variables (valor bruto + puntos). Lectura restringida por cohorte. |
| `intervention_catalog` | vacía; `min_level` sin semántica documentada; `code` único global | `recommended_levels smallint[]`, `category`, `tier`, `source_ref`; unicidad `(code, catalog_version)`; `min_level` derivado. Semilla de 20 tarjetas. |
| `interventions` | texto, pilar, nivel vinculado | `catalog_item_id`, `catalog_code`, `catalog_version` (sellados en servidor desde el catálogo). Solo centros `cmo`. |
| Vistas | — | `cmo_stratification_registry` y `cmo_stratification_item_values`: registro de estratificaciones con resultados enmascarados para centros `standard`. |

## 3. Fase 0 · Plan de archivos

| Acción | Archivo |
|---|---|
| Nuevo | `src/constants/dermapexStudyConfig.ts` (decisiones D1-D8, motivos, paquetes del anexo A, flags) |
| Nuevo | `src/constants/cmoDermapexModel.ts` (port de datos de `config.js`, subtipo dermatológico) |
| Reescrito | `src/services/cmoScoringEngine.ts` (`scoreCmo`, umbrales, versión) |
| Nuevo | `src/services/cmoStratificationService.ts` (validación, guardado atómico vía RPC, historial) |
| Nuevo | `src/services/profileService.ts` (rol del usuario para la visibilidad D5) |
| Nuevo | `src/services/interventionCatalogService.ts` (catálogo desde BD) |
| Reescrito | `src/pages/VisitStratificationPage.tsx` (sustituye `BaselineStratificationPage.tsx`) |
| Modificados | `VisitInterventionsPage.tsx`, `PatientDetailPage.tsx`, `VisitTabs.tsx`, `CmoResultPanel.tsx`, `ScoreTrendChart.tsx`, `cmoLevels.ts`, `exportService.ts`, `reportService.ts`, `patientService.ts`, `cmoScoreService.ts`, `interventionService.ts`, `router.tsx` |
| Migraciones | `20261006100000_dermapex_study_arm.sql`, `20261006100100_dermapex_cmo_model.sql`, `20261006100200_dermapex_cmo_stratification.sql`, `20261006100300_dermapex_intervention_catalog.sql` |
| Pruebas | `tests/cmo*.test.ts`, `tests/interventionCatalogFidelity.test.ts`, `db-tests/20_cmo_stratification.sql`, `e2e/` (humo con Playwright) |

---

## 4. Decisiones D1-D8 · PENDIENTE VALIDACIÓN IP

Centralizadas en `src/constants/dermapexStudyConfig.ts` (`DERMAPEX_DECISIONS`). Columna «Dónde se
cambia»: si dice *BD*, cambiarla exige además una migración nueva.

| # | Decisión implementada | Dato que la justifica | Dónde se cambia |
|---|---|---|---|
| D1 | Cada variable: Sí / No / Desconocido. Desconocido = 0 puntos, `incomplete = true`, lista en `unknown_variables`, aviso visible; se permite guardar. Además se **exige responder explícitamente** todas las variables (nada se da por «No» por omisión). | Encargo D1; principio de la fuente «una variable sin confirmar no puntúa». | `ALLOW_SAVE_INCOMPLETE`, `REQUIRE_EXPLICIT_ANSWER_FOR_EVERY_VARIABLE`; BD: `save_cmo_stratification` exige la respuesta. |
| D2 | `medicamento_reciente` literal de la fuente («comercializado hace menos de 1 año», 2 puntos). La ayuda del formulario muestra la discrepancia. | Encargo D2. | `RECENT_MEDICATION_PROTOCOL_DISCREPANCY`; un cambio de criterio = versión nueva del modelo. |
| D3 | `conservacion_especial` (código propuesto por implementación): informativa, Sí/No/Desconocido, 0 puntos, fuera del total y de `incomplete`. | Encargo D3. | `CMO_INFORMATIVE_FIELDS`; BD: fila `is_scored = false`. |
| D4 | No se muestra la periodicidad de la fuente; se muestra el paquete mínimo del anexo A (resultado e intervenciones). | Encargo D4. | `PROTOCOL_LEVEL_PACKAGES`, `SHOW_SOURCE_FOLLOW_UP_PERIODICITY`. |
| D5 | `centers.study_arm` (`cmo`/`standard`). Estándar: registra variables y se guarda la puntuación, pero RLS impide leer `cmo_scores`, `cmo_score_item_results` e `intervention_catalog`; las vistas devuelven puntuación/nivel/regla/puntos a NULL; no pueden registrar intervenciones (trigger). Mensaje «Datos de estratificación registrados. Centro de atención farmacéutica estándar». Coordinación ve todo. Los informes de pacientes de centros estándar no incluyen CMO (ni para coordinación). | Encargo D5. | `COMPARATOR_STRATIFICATION_VISIBLE` (solo UI) + BD (`can_view_cmo_results`, políticas, vistas). |
| D6 | Estratificación en cualquier visita, una por visita; motivo obligatorio: basal / visita 6 meses / visita 12 meses / cambio de tratamiento / cambio clínico / necesidad detectada. Reestratificar la misma visita sustituye el registro y deja el anterior en `audit_log`. | Encargo D6; `cmo_scores.visit_id` es único (esquema previo). | `STRATIFICATION_REASONS` + CHECK en BD. |
| D7 | 20 tarjetas literales de `interventions-catalog.js`, `catalog_version = cmoinmunomediadas@227e444-draft`, filtradas por nivel vigente con «ver todas»; paquete del protocolo como guía; «Otra intervención (texto libre)» se mantiene. | Encargo D7. | Migración nueva con otra versión. |
| D8 | `recommended_levels smallint[]` = fuente de verdad; `min_level` derivado = `max(recommended_levels)` (nivel menos prioritario recomendado; 1 = máxima prioridad). Hoy todas las listas de la fuente son {1..k}, así que no hay pérdida, pero el array evita depender de ello. | Encargo D8; test `interventionCatalogFidelity`. | — |

Decisiones adicionales de implementación (también a validar):

- **A1. Verificación en servidor.** `save_cmo_stratification` recalcula total y nivel desde el catálogo versionado y rechaza el guardado si no coincide con el motor del cliente. La edad se toma siempre de la ficha (`patients.age_at_inclusion`), nunca del cliente.
- **A2. Escritura directa retirada.** Ya no se puede insertar/modificar `cmo_scores` ni `cmo_score_item_results` salvo por esa función (endurecimiento respecto al estado previo).
- **A3. Sexo precargado** desde la ficha (mujer → Sí, varón → No, otro/desconocido → sin precargar); editable.
- **A4. Edad a la inclusión** también en reestratificaciones de 6/12 meses: en adultos no cambia la puntuación (18-69 y ≥70 puntúan 2).
- **A5. Centros previos sin cohorte:** no admiten pacientes nuevos ni estratificaciones hasta que coordinación asigne la cohorte (primera asignación permitida aunque ya tengan pacientes).
- **A6. Intervenciones en centros estándar:** bloqueadas en BD (incluido texto libre), porque la tabla registra pilar CMO y nivel vinculado. Si el estudio necesita documentar actuaciones del brazo estándar, hace falta un diseño propio.

## 5. Discrepancias e incertidumbres

| Id | Dato | Impacto | Estado |
|---|---|---|---|
| DISC-1 | `BLOCKS` declara 9 puntos máx. en demográficas (71 total); la suma real en adultos es 10 (72). | No cambia ningún nivel (el exceso exige embarazo + deseo gestacional = Sí → nivel 1). Afecta solo a «máximo» mostrado/porcentajes. | Portado sin tope; la UI rotula «máx. declarado por la fuente». Requiere decisión IP. |
| DISC-2 | Protocolo: «medicamento recientemente comercializado **o con seguimiento adicional**»; fuente: «comercializado hace menos de 1 año». | Pacientes con medicamento con seguimiento adicional (triángulo negro) y >1 año no puntúan. | D2: criterio de la fuente. |
| DISC-3 | En la fuente, edad vacía (`''`) cae en la banda ≤12 (1 punto) porque `Number('') = 0`. | En DERMAPEX la edad es 18-120 o nula; con edad nula DERMAPEX puntúa 0 y marca desconocido. | Diferencia deliberada (D1). Los tests de equivalencia pasan la edad desconocida como `undefined`. |
| DISC-4 | Los criterios de la fuente están redactados para extracción desde texto («consta explícitamente en el texto»). | Se muestran literalmente como «Criterio (fuente)»; no hay criterio operativo propio de DERMAPEX. | No se han reescrito (principio 1). Valorar redacción operativa para consulta. |
| DISC-5 | `embarazada`/`deseo_embarazo` se ofrecen para cualquier sexo (la fuente no las restringe). | Riesgo de error de registro en varones. | Sin regla añadida (no está en la fuente). |
| DISC-6 | El protocolo no está en el repositorio: el anexo A y los apartados 5.4.3-5.4.4 se han tomado del encargo. | Trazabilidad documental. | Contrastar con el protocolo v0.5 firmado. |

## 6. Correspondencia tarjeta del catálogo → paquete mínimo del protocolo · PROPUESTA

**Propuesta de implementación para validación de la IP; no se usa en ninguna lógica.** Claves del
anexo A: N1a seguimiento intensivo · N1b entrevista motivacional · N1c plan individualizado de
objetivos · N1d educación reforzada · N1e revisión estrecha de adherencia · N1f telefarmacia
programada · N1g registro de contactos no programados · N1h coordinación activa ante incidencias ·
N2a seguimiento reforzado · N2b adherencia y seguridad en cada visita · N2c resolución estructurada
de dudas · N2d refuerzo educativo · N2e seguimiento mixto · N2f intervención ante barreras/empeora
experiencia · N3a seguimiento estándar · N3b verificación de adherencia, seguridad y comprensión ·
N3c educación básica · N3d canal de contacto · N3e reestratificación ante cambios.

| Tarjeta (código) | Niveles fuente | Acción(es) del paquete propuestas | Grado |
|---|---|---|---|
| seg-revision-conciliacion | 1,2,3 | N1a · N2a/N2b · N3a/N3b (seguridad) | Parcial |
| seg-control-adherencia | 1,2,3 | N1e · N2b · N3b | Clara |
| seg-adaptado-necesidades | 1,2,3 | N1a · N2a/N2f · N3a | Parcial |
| seg-coordinacion-siguiente-visita | 1,2,3 | — | **Sin correspondencia clara** |
| seg-plan-accion-ram | 1 | N1h | Parcial |
| seg-objetivos-corto-plazo | 1 | N1c | Clara |
| edu-promocion-adherencia | 1,2,3 | N1e · N2b · N3b | Parcial |
| edu-informacion-enfermedad | 1,2,3 | N1d · N2d · N3c | Clara |
| edu-material-personalizado | 1,2 | N1d · N2d | Parcial |
| edu-habitos-vida-saludable | 1,2,3 | — | **Sin correspondencia clara** |
| edu-paciente-activo | 1,2,3 | N1b (¿?) | **Sin correspondencia clara** |
| edu-recursos-digitales | 1,2,3 | N1f/N2e (¿?) | **Sin correspondencia clara** |
| coord-unificacion-criterios | 1,2 | N1h | Parcial |
| coord-programa-agentes | 1,2 | N1h | Parcial |
| coord-actuaciones-consensuadas | 1,2 | N1h · N1c | Parcial |
| coord-comites-biologicos | 1,2,3 | — | **Sin correspondencia clara** |
| coord-servicios-sociales-psicologia | 1,2 | N2f · N1h | Parcial |
| coord-asociaciones-pacientes | 1,2,3 | — | **Sin correspondencia clara** |
| coord-programas-objetivos-farmacoterapeuticos | 1,2,3 | N1c | Parcial |
| coord-reuniones-especialidades | 1 | — | **Sin correspondencia clara** |

Acciones del protocolo **sin tarjeta** en el catálogo: N1b entrevista motivacional estructurada,
N1f telefarmacia programada, N1g registro de contactos no programados, N2c resolución estructurada de
dudas, N2e seguimiento mixto presencial/telemático, N3d canal de contacto para dudas, N3e
reestratificación. Hoy solo pueden registrarse como «Otra intervención (texto libre)».

## 7. Seguridad, trazabilidad y limitaciones conocidas

- RLS por centro intacta; la visibilidad por cohorte se **añade** sobre ella (`can_view_cmo_results` = acceso a la visita **y** (coordinación **o** cohorte `cmo`)).
- Auditoría: altas, reestratificaciones (valor anterior y nuevo), reemplazo de ítems, cambios de cohorte, modelo y catálogo quedan en `audit_log`.
- Inmutabilidad: `cmo_model_versions`, `cmo_variable_catalog` e `intervention_catalog` solo admiten activar/retirar.
- **Limitación D5:** el cálculo se hace en el navegador (requisito de port TS). Un usuario del brazo estándar no lo ve en la interfaz y la BD no se lo devuelve, pero con herramientas de desarrollador podría inspeccionar el resultado antes del envío; además los pesos son públicos en la fuente. Alternativa más estricta (propuesta): calcular solo en servidor para el brazo estándar.
- Las dos vistas se ejecutan con privilegios del propietario y filtran por `can_access_visit` (el asesor de Supabase las marcará como *security definer view*; es intencionado).
- **Dashboard (fuera de alcance):** para coordinación mezcla niveles de ambos brazos; para investigadores estándar los indicadores CMO salen vacíos.
- Exportación: paginada para superar el límite de 1000 filas por petición en las tablas nuevas; el resto de tablas mantiene la consulta heredada.

## 8. Verificación (2026-10-06)

| Comprobación | Resultado |
|---|---|
| `npx tsc -b` | OK |
| `npm test` | 9 ficheros, 112 tests OK (79 nuevos: 30 motor, 15 equivalencia, 8 fidelidad modelo/semilla, 4 fidelidad catálogo, 22 servicio/exportación/informe) |
| Equivalencia con la fuente | 14 casos dirigidos + 500 aleatorios (semilla 20261006): idéntico total, nivel, regla especial, desglose por bloque y factores |
| `npm run build` | OK (aviso heredado de tamaño de *chunk*) |
| `scripts/test-db.sh` (PostgreSQL 16 local) | 133 aserciones OK (10_* adaptada + 20_cmo_stratification.sql nueva) |
| Humo e2e Chromium (`e2e/run-smoke.sh`: PostgreSQL + PostgREST 12 locales, RLS real) | 28/28 comprobaciones OK; capturas en `docs/e2e-screenshots/` |

No se ha ejecutado nada contra ningún proyecto Supabase. Las migraciones están **pendientes de aplicar**.
