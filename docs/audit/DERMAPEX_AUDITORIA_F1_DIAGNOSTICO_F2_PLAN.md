# DERMAPEX · Auditoría como base de datos de investigación clínica

**Fase 1 (diagnóstico) y Fase 2 (plan de corrección).** Fecha: 2026-10-28. Rama: `claude/determined-hopper-7fblji` (base `main` @ `ae295b7`).
Estudio: protocolo v1.0, HIP/CI v1.0; CEI Sevilla Sur, SICEIA-2026-003487, dictamen favorable de 27/10/2026.

**Alcance de esta entrega.** Solo diagnóstico y plan. No se ha modificado ningún dato ni la estructura de producción durante la auditoría. La Fase 3 (implementación) empieza cuando el IP apruebe el plan del §6.

Convenciones:
- **[Obj]** dato objetivo verificado (código, migración o consulta de solo lectura a producción);
- **[Int]** interpretación técnica;
- **[Rec]** recomendación.

Estado de cada funcionalidad:
- **IMPL**: implementada en el código;
- **COMP**: comprobada con prueba automatizada o en producción;
- **PEND**: pendiente de validar.

---

## 0. Estado de seguimiento (actualizado 2026-10-28)

- **Respuestas del IP:**
  - los datos actuales de producción son de prueba y se borrarán al iniciar el estudio, con copia previa;
  - aportará el protocolo, el CRD y los manuales;
  - Supabase sigue en plan gratuito.
- **Fase 3 autorizada:** bloque 1 (exportación) y bloque 0 mediante script que ejecuta el IP.
  - **Hecho y validado:** ver `DERMAPEX_EXPORTACION_VALIDACION.md` (C1, C2, C3, A5-A8, B1 y M3 corregidas; C5 mitigada, pendiente de ejecutar en producción).
  - Guías: `DERMAPEX_EXPORTACION_GUIA.md` y `DERMAPEX_COPIAS_SEGURIDAD.md`.
- **Sin autorizar:** bloques 2, 3, 4 y 6. **Bloqueado:** bloque 5 (documentos).
- **Hallazgo nuevo (media):** en IEXPAC, la respuesta «No aplica» de los ítems 12-15 no se guarda (se omite la clave), así que no se distingue de «no contestado». Se corregirá en el bloque 2.

## 1. Método y fuentes

| Fuente | Acceso | Uso |
|---|---|---|
| Repositorio (`src/`, `supabase/migrations/` (28 migraciones), `db-tests/`, `tests/`, `e2e/`, `docs/`) | Completo | Lectura íntegra de esquema, servicios y exportación |
| Supabase producción `dermapex` (ref. `efjpjponblmdjlhmmiet`, PostgreSQL 17, región eu-west-1) | Solo lectura (recuentos y metadatos, sin leer contenido clínico) | Inventario real, RLS, recuentos, asesor de seguridad, plan |
| Protocolo v1.0 | **No disponible** | — |
| CRD / cuaderno de recogida de datos | **No disponible** | — |
| Manuales y textos oficiales de los instrumentos (IEXPAC, DLQI, POEM, NRS, EQ-5D-5L, PAM-10, Morisky-Green, EVASAF) | **No disponibles** | — |

> **Limitación principal.** Sin protocolo, sin CRD y sin manuales de los instrumentos **no se puede validar la cobertura de variables** (§3) ni las reglas de puntuación (§4). Todo lo que sigue sobre variables describe lo que *existe*, no lo que *debería existir*.

## 2. Estado real de producción (2026-10-28, solo lectura)

**[Obj]** Plan Supabase de la organización: **Free**.

**[Obj]** Tablas DERMAPEX con datos:

| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| patients | 5 | questionnaire_responses | 18 (6 instrumentos × 3 visitas) |
| visits | 11 | interventions | 10 |
| cmo_scores | 9 | patient_medications | 9 |
| cmo_score_item_results | 252 | visit_medication_events | 14 |
| consents | **0** | visit_documents | 2 |
| audit_log | 574 | profiles / center_memberships / centers | 8 / 7 / 5 |

**[Obj]** RLS activada en las 36 tablas de `public`; todas tienen políticas.

**[Int]** El dictamen es de 27/10/2026, así que estos 5 pacientes son, previsiblemente, de prueba. **No puedo comprobarlo sin leer contenido clínico.** Hasta que el IP lo confirme se tratan como potencialmente reales. Hay que decidir qué hacer con ellos antes de la primera inclusión real (ver §7, pregunta 1).

## 3. Cobertura del modelo de datos frente al estudio

| Bloque del estudio | Estado | Evidencia |
|---|---|---|
| Identificador seudonimizado del paciente | IMPL + COMP | `patients.study_code` único, asignado por la BD (`DPX-<centro>-<n>`), sin identificadores directos (`20261005100100…:10-25`, `db-tests/30_*`) |
| Centro y cohorte (CMO / estándar) | IMPL + COMP | `patients.center_id` NOT NULL; cohorte = `centers.study_arm`; aislamiento por centro probado (`db-tests/10_*`, `40_*`) |
| Usuarios y roles (investigador / coordinación) | IMPL + COMP | `center_memberships`, `app_private.is_coordinator()`, barrera por aplicación (`20261007130000`) |
| Visitas y fechas | IMPL | `visits` (tipo, fecha programada, fecha realizada, estado). Una visita activa por tipo (índice aplicado hoy, COMP) |
| **Calendario y ventanas de visita** | **AUSENTE** | Tipos heredados (basal, 3, 6, 9, 12 meses, extra), sin ventanas (NEXT_STEPS §12) [P] |
| **Variables clínicas de dermatitis atópica** (gravedad, extensión, prurito, brotes, tratamiento previo, comorbilidades…) | **AUSENTE** | `20261005100100…:4-6`: «NO incluye variables clínicas de dermatitis atópica». No hay tabla ni formulario [P] |
| Estratificación CMO | IMPL + COMP | Guardado atómico en servidor (`save_cmo_stratification`), modelo versionado e inmutable, 252 ítems almacenados |
| Farmacoterapia | IMPL (parcial) | `patient_medications` y `visit_medication_events`. Sin tratamiento índice, motivo de cambio ni definición de persistencia o adherencia [P] |
| Intervenciones farmacéuticas | IMPL | Catálogo CMO versionado (borrador) y listado de AF estándar (borrador) [P] |
| Cuestionarios | IMPL (parcial) | IEXPAC, DLQI, EVASAF, EQ-5D-5L, PAM-10, Morisky-Green. **POEM y NRS de prurito no implementados** (NEXT_STEPS §5-6) |
| **Consentimiento informado (versión HIP/CI por paciente)** | **NO SE USA** | La tabla `consents` existe pero tiene 0 filas. La interfaz solo guarda `patients.consent_signed` (booleano), sin fecha ni versión |
| **Estado en el estudio: inclusión, finalización, abandono, pérdida, retirada de consentimiento** | **AUSENTE en DERMAPEX** | Existe en COAMO (`coag_patients.status`), no en `patients`. No se puede calcular el flujo CONSORT/STROBE |
| Resultados clínicos y asistenciales | **AUSENTE** | Dependen del protocolo [P] |

## 4. Incidencias

Escala de gravedad:
- **Crítica**: puede causar pérdida de datos, exportación incompleta o imposibilidad de analizar la variable principal;
- **Alta**: corrupción o alteración sin trazabilidad;
- **Media**: calidad o trazabilidad mejorable;
- **Baja**: mejora menor.

### 4.1 Críticas

| ID | Incidencia | Evidencia | Impacto |
|---|---|---|---|
| **C1** | La exportación trunca en silencio a 1000 filas: `patients`, `visits`, `cmo_scores`, `interventions`, `patient_medications` y `questionnaire_responses` se leen **sin paginar**. Solo las vistas de estratificación paginan | `exportService.ts:447-452`, `questionnaireService.ts:293` | Al superar 1000 filas (intervenciones: ~5 visitas × varias intervenciones × N pacientes; cuestionarios: 6 por visita) faltan registros **sin aviso**. No hay recuento de control |
| **C2** | No hay manifiesto ni conciliación de recuentos | `exportService.ts` | Nada demuestra que la extracción esté completa |
| **C3** | Las respuestas individuales de los cuestionarios solo se exportan como **texto JSON en una columna** (`responses_raw`) | `exportService.ts:620` | No son analizables en SPSS ni Excel, aunque sí están almacenadas |
| **C4** | Variables clínicas de DA, POEM, NRS de prurito y estado en el estudio **no existen** | §3 | El estudio no se puede ejecutar completo con la versión actual. Bloqueado por el protocolo y el CRD |
| **C5** | **Plan Free**: según la documentación de Supabase, no incluye copias restaurables desde el panel ni recuperación a un punto en el tiempo, y el proyecto se pausa tras inactividad. **No existe ningún procedimiento de copia propio** | `get_organization` → `free` | Riesgo de pérdida total sin recuperación. *Verificar en Panel → Database → Backups* |
| **C6** | Cuestionarios «todo o nada»: no se guarda ninguno si falta un solo campo obligatorio de cualquiera de los 6 instrumentos | `VisitQuestionnairesPage.tsx:368-371` | Pérdida de datos realmente recogidos (p. ej. IEXPAC completo con un ítem de PAM-10 sin contestar). Sin borrador |

### 4.2 Altas

| ID | Incidencia | Evidencia | Impacto |
|---|---|---|---|
| **A1** | «Marcar visita como completada» desde la ficha **sobrescribe `visit_date` con la fecha de hoy**, incluso si ya existía. Además usa la fecha UTC (`toISOString`), que puede corresponder al día anterior o siguiente | `PatientDetailPage.tsx:231-233` | Confunde fecha de visita con fecha de registro y altera un dato clínico |
| **A2** | El mismo cambio de estado **ignora los errores** sin avisar | `PatientDetailPage.tsx:234-237` | El usuario cree que se guardó cuando no |
| **A3** | Concurrencia «el último gana»: las actualizaciones no comprueban versión (`updated_at`), y los cuestionarios se reescriben enteros (`upsert` del JSON completo) | `visitService.updateVisit`, `questionnaireService.ts:270` | Dos profesionales editando a la vez: se pierde el cambio de uno (recuperable solo desde `audit_log`) |
| **A4** | Borrado físico con **cascada**: coordinación puede borrar un paciente y desaparecen sus visitas, cuestionarios, intervenciones y medicación. No hay anulación lógica ni motivo | Políticas `*_delete` (`20261005100300…:171-264`), FK `on delete cascade`, botón «Eliminar» en `PatientsPage` | Los datos solo quedan en `audit_log` como JSON |
| **A5** | El seudónimo del paciente en la exportación (`P0001…`) se **recalcula en cada extracción** según el orden de alta | `exportService.ts:243-247` | No es estable entre extracciones: se rompe el enlace entre ficheros de fechas distintas. Además se exporta también `study_code`, así que el seudónimo adicional no aporta protección |
| **A6** | La exportación **altera textos**: elimina saltos de línea y colapsa espacios | `normalizeTextValue`, `exportService.ts:163` | El valor exportado no coincide con el almacenado (notas, observaciones) |
| **A7** | Cabeceras CSV inestables: se toman de las claves de la primera fila (`Object.keys(rows[0])`) | `exportService.ts:710, 724-726` | La estructura del fichero puede cambiar entre extracciones |
| **A8** | Datos almacenados que **no se exportan**: `visit_status`, `extraordinary_reason`, `visits.notes`, `visit_medication_events`, `consents`, metadatos de `visit_documents` y la medicación no activa (solo se exporta la activa) | `exportService.ts:449, 514` | Exportación incompleta respecto a la BD |
| **A9** | IEXPAC: la regla de puntuación es **provisional** (`10·(Σ1-11 − 11)/44`; el ítem 12 se usa como secundaria) y no está verificada con el manual oficial | `questionnaireDomain.ts:72-86`, NEXT_STEPS §4 | Afecta a la **variable principal** |

### 4.3 Medias

| ID | Incidencia |
|---|---|
| M1 | La puntuación de los cuestionarios se recalcula al leer, sin guardar la versión del algoritmo con la que se interpreta (los datos brutos sí se conservan, lo cual es correcto). Falta versionar el algoritmo en la exportación y en el diccionario |
| M2 | `audit_log` registra fila, antes/después, usuario y hora (correcto y protegido frente a escritura desde la API, COMP en `db-tests`), pero **no el motivo de la corrección** ni el diff por variable |
| M3 | Sin diccionario de datos generado. Las etiquetas SPSS solo cubren parte de los ficheros |
| M4 | No hay módulo de calidad de datos (pendientes, incompletos, inconsistencias cronológicas, fuera de ventana) |
| M5 | Exportación multicéntrica: cualquier usuario puede exportar lo que su RLS le deja ver (su centro; coordinación, todo). No hay un permiso específico de exportación ni un registro de quién exportó qué |
| M6 | Visitas: no se impide que `visit_date` sea anterior a la inclusión, ni fechas futuras en visitas realizadas |
| M7 | Los cuestionarios solo se habilitan en basal y mes 12, por regla heredada; falta confirmarlo con el protocolo |
| M8 | Asesor de seguridad: protección de contraseñas filtradas **desactivada** (Auth) |

### 4.4 Bajas

| ID | Incidencia |
|---|---|
| B1 | `toCsvValue` no entrecomilla `\r` aislado |
| B2 | El asesor marca 2 vistas `SECURITY DEFINER`. **Revisado: aceptable**, porque filtran explícitamente con `can_access_visit()` (`20261006100200…:283, 300`) y existe prueba de aislamiento |
| B3 | Funciones RPC `SECURITY DEFINER` expuestas (`save_cmo_stratification`, `mark_password_changed`). Son intencionadas y validan acceso internamente; queda pendiente revisarlas de nuevo en la Fase 4 |

### 4.5 Lo que está bien (comprobado)

- Seudonimización por diseño: sin fecha de nacimiento ni identificadores directos; la edad se calcula en el cliente.
- RLS por centro y barrera por aplicación, con baterías SQL automatizadas en CI (`scripts/test-db.sh`).
- Guardado atómico y verificado en servidor de la estratificación CMO; catálogo de variables inmutable y versionado.
- Auditoría por trigger en las 10 tablas clínicas, que sobrevive al borrado y no es modificable desde la API.
- Una visita activa por tipo y paciente (índice aplicado el 2026-10-28).
- Integridad referencial: FK en todas las relaciones; coherencia visita-paciente forzada por trigger.

## 5. Matriz de correspondencia (estado actual, parcial)

Solo se pueden mapear las variables **implementadas**. La columna «Variable del protocolo» queda vacía hasta disponer del protocolo v1.0 y del CRD. La matriz completa y estable (identificador `DPX_<bloque>_<n>`) es el entregable 2 de la Fase 3.

| Bloque | Interfaz | Tabla.columna | Validación (frontend / BD) | Exportación actual |
|---|---|---|---|---|
| Paciente | Nuevo paciente | `patients.study_code, center_id, inclusion_date, screening_date, age_at_inclusion, sex, consent_signed` | Edad 18-120 y cribado ≤ inclusión (BD) | `pacientes.csv` (sin `screening_date` ni `consent_signed`) |
| Visita | Nueva visita / Agenda | `visits.visit_type, scheduled_date, visit_date, visit_status, extraordinary_reason, notes` | Tipo y estado (CHECK), unicidad por tipo | `visitas.csv` solo con tipo, número y fechas (A8) |
| CMO | Estratificación | `cmo_scores`, `cmo_score_item_results` (raw_value, item_score) | Motor en servidor | `estratificaciones_cmo.*` (.csv, .sav, .sps) |
| Intervenciones | Intervenciones | `interventions.*` (+ catálogo, código y versión) | CHECK | `intervenciones.csv` (C1: sin paginar) |
| Cuestionarios | Cuestionarios PRO | `questionnaire_responses.responses` (JSON por ítem) | Frontend: todo o nada (C6) | Puntuaciones basal/final y JSON bruto (C3) |
| Medicación | Medicación | `patient_medications.*`, `visit_medication_events.*` | Parcial | Solo la activa, por visita (A8) |

## 6. Plan de corrección (Fase 2)

Principios:
- cambios incrementales y reversibles, sin tocar datos existentes;
- cada migración con su batería `db-tests`;
- **ningún cambio en producción sin copia previa verificada** (bloque 0) y aprobación expresa.

### Bloque 0 · Requisito previo: copia de seguridad (C5)

| Paso | Responsable | Detalle |
|---|---|---|
| 0.1 | IP / promotor | Decidir el plan: **Pro** (copias diarias restaurables; recuperación a un punto en el tiempo como complemento) o mantener Free con copias propias |
| 0.2 | Claude (script) + IP (credenciales) | Script `pg_dump` de esquema y datos (`public`, `app_private`, `auth.users` mínimo y metadatos de Storage) con cifrado y suma de verificación. La cadena de conexión **no** se guarda en el repositorio |
| 0.3 | Claude | **Prueba real de restauración** en un PostgreSQL local aislado, comparando recuentos por tabla con producción |
| 0.4 | IP | Procedimiento operativo: frecuencia, custodia cifrada fuera de Supabase, retención y respuesta ante incidentes |

### Bloque 1 · Exportación fiable (C1, C2, C3, A5-A8, B1, M1, M3). Solo frontend, sin cambios en la BD

1. Todas las lecturas paginadas con orden estable por `id`. Tras cada tabla, conciliación con `count: 'exact'`; si no coincide, **la exportación falla y lo dice**.
2. **Manifiesto** (`manifest.json`): fecha, usuario, versión de la app y del algoritmo, alcance (centros visibles), recuentos por tabla (BD frente a fichero) y huella SHA-256 de cada fichero.
3. Tablas completas «raw» (una por tabla clínica, sin transformar los valores) y conjuntos analíticos:
   - **LONG**: una fila por paciente y visita;
   - **WIDE**: una fila por paciente, con sufijos `_v0`, `_m3`… `_m12`;
   - tablas relacionadas uno-a-muchos: intervenciones, medicación, eventos y **respuestas por ítem** en formato largo (`visit_id, instrumento, item, valor`), además de columnas por ítem en WIDE.
4. Identificador estable = `study_code`; se elimina el seudónimo secuencial (A5). Para envíos externos se puede añadir un **seudónimo de extracción** con clave, como opción documentada.
5. Fidelidad: no normalizar textos (A6); cabeceras fijas desde el diccionario (A7); CSV en UTF-8 con BOM opcional y separador configurable (`,`/`;`), con escape conforme a RFC 4180 (B1).
6. **Diccionario de datos** generado desde una única definición en código: nombre, etiqueta, tipo, unidad, valores, categorías, instrumento, visita, tabla de origen, regla de cálculo y código de perdido. SPSS: `.sps` para todos los ficheros. El `.sav` binario actual (`spssWriter.ts`) **se mantiene solo si supera la prueba de reimportación**; si no, se retira y queda el par CSV + `.sps`.
7. Excel con las hojas: pacientes, visitas, clínicas (cuando existan), tratamientos, cuestionarios (ítems), intervenciones, derivadas, incidencias de calidad, diccionario y metadatos. JSON estructurado. **Parquet: no** (dependencia pesada sin beneficio claro con este volumen).
8. Pruebas: **reimportación** (CSV → parser → comparación celda a celda), nulos frente a cero, caracteres especiales (`;`, `"`, saltos de línea, ñ, tildes, emoji), decimales, fechas y volumen alto (≥ 5 000 filas simuladas para probar la paginación). Ruta SPSS: validación sintáctica del `.sps` y, si hay PSPP disponible en CI, importación real.

### Bloque 2 · Guardado seguro (A1-A3, C6). Frontend y una migración aditiva

1. A1/A2: completar una visita **solo rellena `visit_date` si está vacía**, con la fecha local y confirmación; los errores se muestran.
2. C6: guardado **por instrumento**, permitiendo respuestas incompletas (borrador) con estado de completitud por cuestionario. La puntuación sigue las reglas de ausentes de cada manual; sin regla documentada, no se puntúa (`null`, nunca 0).
3. A3: **control optimista de concurrencia**. La actualización envía el `updated_at` leído; si otro usuario ha guardado entretanto, se avisa y no se sobrescribe. Para cuestionarios, mediante una RPC atómica con esa comprobación.
4. Confirmación de guardado tras releer de la BD (ya existe en cuestionarios; se extiende a visitas e intervenciones).

### Bloque 3 · Trazabilidad (A4, M2). Migraciones aditivas; requieren aprobación

1. **Anulación lógica** en lugar de borrado: columnas `voided_at`, `voided_by` y `void_reason` en las tablas clínicas; retirar el `DELETE` a todos los roles de la API (coordinación incluida); la anulación se hace por RPC y exige motivo. Las vistas y exportaciones excluyen lo anulado por defecto y lo incluyen bajo demanda.
2. **Motivo de corrección**: al editar un dato ya guardado, la interfaz pide motivo, que se registra en `audit_log` (columna nueva `reason`, vía una variable de sesión en la misma transacción RPC).
3. Historial por registro en la interfaz, reconstruido desde `audit_log` con diff por variable.

### Bloque 4 · Calidad de datos (M4, M6). Solo lectura

Panel por centro calculado sobre registros reales: pacientes incluidos, sin basal, visitas esperadas, realizadas, pendientes y vencidas, cuestionarios completos e incompletos, completitud por variable, incoherencias cronológicas y posibles duplicados. **Las ventanas de visita dependen del protocolo.** Se distinguen tres tipos de hallazgo: error confirmado, valor a revisar y ausencia legítima.

### Bloque 5 · Contenido del protocolo (C4, A9, M7). **Bloqueado hasta disponer de los documentos**

Variables clínicas de DA, POEM, NRS de prurito, estado en el estudio (finalización, abandono, pérdida y retirada, con fecha y motivo), consentimiento por paciente con versión de HIP/CI (usando la tabla `consents` ya existente), calendario y ventanas, y validación de la puntuación IEXPAC con el manual.

### Bloque 6 · Seguridad (M5, M8)

- Activar la protección de contraseñas filtradas (panel de Auth; lo hace el IP).
- Registrar en `audit_log` cada exportación (quién, cuándo, alcance y recuentos).
- Opcional: rol explícito «puede exportar multicéntrico».
- Informe de riesgos de reidentificación: edad, sexo, centro y fechas exactas son cuasi-identificadores en un estudio pequeño. Se propone exportar fechas relativas a la inclusión en la base de análisis compartida.

### Orden propuesto y riesgo

| Orden | Bloque | Toca producción | Riesgo | Aprobación |
|---|---|---|---|---|
| 1 | 0 · Copia y restauración | Solo lectura (`pg_dump`) | Bajo | Credenciales del IP |
| 2 | 1 · Exportación | No (solo frontend) | Bajo | Este plan |
| 3 | 2 · Guardado seguro | Frontend + 1 RPC aditiva | Bajo-medio | Este plan |
| 4 | 4 · Calidad de datos | No | Bajo | Este plan |
| 5 | 3 · Trazabilidad y anulación | Migraciones aditivas que cambian permisos | Medio | **Expresa** |
| 6 | 5 · Contenido del protocolo | Tablas nuevas | Medio | **Protocolo, CRD y manuales** |
| 7 | 6 · Seguridad | Panel de Auth | Bajo | IP |

### Pruebas (entregable 11), mapeadas a la lista del encargo

- **Ya cubiertas** por `db-tests` y `vitest`: 1 (alta), 2 (parcial: duplicado de visita), 21 (acceso entre centros) y 22 (auditoría, parcial).
- **Previstas en los bloques 1 a 4**: 3-20 y 23.
- **Requiere bloque 0**: 24 (restauración).
- Cada prueba se informará como **superada**, **fallida** o **no ejecutada**.

## 7. Decisiones e información que necesito del IP

1. **Datos actuales** (5 pacientes, 11 visitas): ¿son de prueba? Si lo son, ¿se conservan, se anulan lógicamente o se eliminan con acta antes de la primera inclusión real? *Si fueran reales, habría que verificar que su inclusión fue posterior al dictamen de 27/10/2026.*
2. **Protocolo v1.0 y CRD** (PDF o Word). Imprescindibles para el bloque 5 y la matriz completa.
3. **Manual de puntuación de IEXPAC** (variable principal) y textos y licencias de POEM, NRS de prurito, DLQI, EQ-5D-5L y PAM-10. ¿Siguen Morisky-Green, EQ-5D-5L y PAM-10 en el protocolo v1.0?
4. **Plan de Supabase**: ¿se pasa a Pro? Afecta al diseño de las copias (bloque 0).
5. **Aprobación** de los bloques 1, 2 y 4 (bajo riesgo) para empezar la Fase 3, y **decisión** sobre el bloque 3 (anulación lógica y motivo de corrección).
