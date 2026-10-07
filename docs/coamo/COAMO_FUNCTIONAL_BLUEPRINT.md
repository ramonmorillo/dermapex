# COAMO · Blueprint funcional y de datos

Análisis y diseño · 7 de octubre de 2026 · Sin implementación.

**Alcance:** nueva aplicación de investigación multicéntrica en coagulopatías congénitas, repositorio/URL propios, entidades `coag_*` independientes. DERMAPEX es referencia técnica, no fuente de requisitos clínicos COAMO. La arquitectura del documento `SUPABASE_DERMAPEX_COAG_ARCHITECTURE.md` queda como base provisional y no se ejecuta aquí. No se genera SQL ni se modifica código, migraciones, Supabase, Auth, RLS, Storage o IRIS.

## 1. Fuentes, trazabilidad y limitación determinante

| Identificador | Fuente examinada | Uso y alcance |
|---|---|---|
| P | `Memoria proyecto COAGULOPAITAS TOMAS.pdf`, 17 páginas, memoria COAMO firmada el 30/08/2026 | Especificación clínica/metodológica principal; referencias P:página usan la numeración del propio documento |
| M-incorrecto | `Adaptación modelo CMO Migraña_v1.0.pdf`, 60 páginas físicas | La portada, índice y cuerpo dicen «Paciente con Migraña»; no es el modelo de coagulopatías requerido |
| M-pendiente | Adaptación CMO a coagulopatías congénitas citada en P:8 | Documento correcto no aportado; pendiente de recibir y validar versión |
| D | DERMAPEX, commit `c1694e424bda084e488fb0e3d03c0621fb799196` | Referencia de arquitectura, componentes y contratos existentes |
| T | Propuesta técnica de este blueprint | Metadatos operativos, relaciones, estados y controles; no se atribuyen al protocolo como variables clínicas |

**No se usan las variables, puntos, cortes, reglas especiales, frecuencias ni intervenciones clínicas del PDF de migraña.** Tampoco se heredan los de DERMAPEX. P:8 remite al modelo de coagulopatías y menciona variables de mayor relevancia de 4 puntos, pero no enumera los ítems, todas sus ponderaciones, cortes ni reglas. Esa mención aislada no permite construir un motor válido.

El blueprint funcional y el diccionario del protocolo pueden desarrollarse con P. El catálogo y motor CMO quedan bloqueados por M-pendiente. Esto no se resuelve con una estimación o con una herramienta pública citada en el protocolo: esta puede servir posteriormente para contraste, no sustituye la especificación clínica validada.

Convenciones:

- **CONFIRMADO P:** descrito en el protocolo, con página.
- **PROPUESTA T:** decisión de diseño técnico/operativo que deberá aprobarse; no introduce un nuevo resultado clínico.
- **PENDIENTE IP:** definición clínica o metodológica incompleta/ambigua, a confirmar por investigador principal antes de programar su lógica.
- **PENDIENTE M:** requiere el modelo CMO correcto.
- La configuración y el despliegue real son **REQUIERE VERIFICACIÓN EN SUPABASE**; el repositorio no prueba su estado.

No se presupone autorización ética por existir una fecha prevista de inicio. No se copian nombres ni datos de pacientes de ningún estudio.

## 2. Diseño del estudio y consecuencias para la aplicación

P:2,6,8,13–15 define un estudio observacional, multicéntrico, longitudinal, prospectivo, **antes-después**, de atención farmacéutica CMO; no interviene sobre el tratamiento farmacológico. Población adulta con hemofilia A, hemofilia B o enfermedad de von Willebrand, seguida en Farmacia Hospitalaria con medicamentos hospitalarios para esa patología. No hay aleatorización ni brazo estándar concurrente descrito.

- Objetivo principal: cambio de IEXPAC global basal→final; P:10 especifica escala 0–10.
- Secundarios: caracterización, intervenciones/contactos, calidad de vida, satisfacción, adherencia, resultados clínicos/terapéuticos y exploración por prioridad 1/2/3 (P:6,10–13).
- Seguimiento individual de 12 meses; final a 12 meses ±1 mes (P:14).
- Reclutamiento previsto de 3 meses, octubre–diciembre 2026; seguimiento calendario enero–diciembre 2027, cierre/análisis enero–marzo 2028 (P:9,14). Hay que resolver la relación entre ese calendario y el seguimiento individual; no fijar todas las finales en diciembre 2027.
- Tamaño objetivo declarado: 75 incluidos y 64 evaluables, con 15% de pérdidas (P:13). Son metas operativas, no límites de alta de pacientes.
- Visitas/pruebas integradas en asistencia habitual, sin procedimientos extraordinarios (P:2,8,13). Un formulario no debe obligar a solicitar analíticas que no se han hecho.

No trasladar `study_arm = cmo/standard` de DERMAPEX. Todos los centros reclutadores COAMO aplican el modelo según el diseño antes-después. La experiencia basal refleja atención previa; no equivale a una cohorte control separada. La app muestra descriptivos y exporta los datos; los tests inferenciales del plan P:14 se realizan en SPSS, no se implementan automáticamente en el dashboard.

## 3. Arquitectura funcional y usuarios

### 3.1 Aplicación

React + TypeScript + Vite, navegación de pacientes/visitas y frontend Supabase son arquitectura reutilizable. COAMO usa sus propios servicios con tablas `coag_*`, su propia configuración, identidad visual, rutas y despliegue. HashRouter es viable en GitHub Pages. Solo copiar componentes, estilos y utilidades tras revisar constantes clínicas y referencias incrustadas; no construir aquí el repositorio nuevo.

Capas propuestas: UI y navegación → casos de uso COAMO → servicios propios → contratos de datos versionados → futura RLS/funciones COAG. Separar el motor CMO y puntuaciones de cuestionarios de componentes visuales; conservar respuesta cruda y versión de reglas que generó cada derivado.

### 3.2 Usuarios, roles y centros

| Rol propuesto T | Acceso funcional | Límite |
|---|---|---|
| Investigador | Pacientes de sus centros COAMO, inclusión, visitas, contactos, cuestionarios e informes autorizados | Sin asignarse rol/centro ni acceder a DERMAPEX; exportación de su ámbito según aprobación |
| Coordinación COAMO | Centros/pacientes COAMO, calidad de datos, auditoría y exportación global COAMO | No obtiene coordinación DERMAPEX ni privilegios SQL administrativos |
| Administrador de infraestructura | Provisión y operaciones del proyecto físico fuera del frontend clínico | No confundir con rol clínico; credenciales privilegiadas nunca en navegador |
| Consultor metodológico | No crear rol ni acceso global automáticamente | P:9 describe apoyo, no permisos sobre datos; alcance pendiente IP |

Auth físico puede ser común, pero la autorización COAMO es explícita. El código interno de aplicación (`coag` u otro) debe fijarse al implementar sin confundir la marca COAMO con la familia `coag_*`. Sesión con storageKey propio; preferir origen distinto del de DERMAPEX. Nunca consultar `profiles` DERMAPEX para resolver permisos COAMO.

P:9 lista siete centros reclutadores: La Fe, Vall d’Hebron, La Paz, Virgen del Rocío, Nuestra Señora de Candelaria, CHU de La Coruña y Dr. Balmis; Valme es consultor/apoyo. P:13 habla de ocho hospitales y aproximadamente diez pacientes por centro. **PENDIENTE IP:** número de reclutadores y función de Valme. No sembrar ocho centros con permisos de reclutamiento por inferencia.

## 4. Matriz DERMAPEX → COAMO

«ELIMINAR/NO REUTILIZAR» significa excluir del nuevo COAMO, nunca borrar de DERMAPEX.

| Funcionalidad DERMAPEX / evidencia D | Clasificación COAMO | Motivo y adaptación concreta |
|---|---|---|
| `LoadingState`, `EmptyState`, `ErrorState`, `Notice`, `PageHeader`, `SectionHeader`, `StatusBadge` | REUTILIZAR | UI genérica; revisar accesibilidad y textos al integrarlos |
| `MetricCard`, `DistributionBar`, presentación de tendencias | REUTILIZAR | Primitivas visuales; unidades/denominadores son propios de COAMO |
| `AppShell`, CSS responsive, `VisitTabs`, navegación | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Marca, menú, secciones y autorización; AppShell actual consulta contraseña en `profiles` DERMAPEX |
| Login, recuperación, enlaces `authLinks`, `authService` | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Flujos Supabase útiles; endpoints de perfil/RPC, storageKey, callbacks y gate COAMO distintos |
| Centros y selector de centro | ADAPTAR | `centerService` y memberships pasan a `coag_*`; excluir study_arm y decidir consultor |
| Listado/detalle/alta paciente | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Búsqueda por código y patrón de ficha; nueva inclusión y diccionario clínico |
| Código DPX y contador DERMAPEX | NO REUTILIZAR contenido / ADAPTAR patrón | Prefijo propio, unicidad, generación servidor; propuesta `COAMO-<centro>-<secuencia>`, no requisito P |
| Estructura de visitas y `VisitTimeline` | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Basal/seguimientos/final/contactos; no imponer visitas 3/6/9 meses a todos |
| `followupStatus` y alertas >90 días | NO REUTILIZAR regla / ADAPTAR | P3 no necesita seguimiento intermedio; intervalo debe proceder de prioridad/modelo aprobado |
| `cmoScoringEngine`, catálogo/versionado, resultados por ítem | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Recalculo/versionado útiles; ítems y algoritmo COAMO pendientes M |
| Umbrales DERMAPEX ≥31, 18–30, ≤17 y embarazo/deseo gestacional | NO REUTILIZAR | No autorizados por las fuentes COAMO aportadas |
| Cohortes `cmo/standard`, enmascarado y panel atención habitual | ELIMINAR del alcance COAMO | P establece antes-después, sin brazo comparador concurrente |
| `CmoLevelBadge`, `CmoResultPanel`, `ProtocolPackage`, gráfico de puntos | ADAPTAR | Prioridades y UI reutilizables; quitar cortes/textos/calendario DERMAPEX |
| Catálogo de intervenciones, registro realizado/pendiente | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Tres ámbitos confirmados P; acciones/paquetes concretos requieren M |
| Entrevista motivacional y objetivos | NUEVA EN COAMO sobre patrón de plan | P:8 describe el proceso; no asumir un módulo completo existente en D |
| IEXPAC 11 ítems y fórmula global | REUTILIZAR tras validar versión | Coincide fórmula D con P:10; no heredar cuatro ítems condicionados sin aprobación |
| EVASAF 10 ítems 1–5 | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Texto oficial/versionado; media D es provisional y P no prescribe resumen global |
| Morisky-Green | REUTILIZAR tras validar texto y clave de respuestas | D calcula no/sí/no/no; P no transcribe preguntas ni clave, solo 4 respuestas correctas |
| EQ-5D actual (`eq5d`, identificado como 5L) | ADAPTACIÓN CLÍNICA COMPLETA | COAMO exige 3L; no limitar un formulario 5L y llamarlo 3L |
| DLQI y bandas dermatológicas | ELIMINAR / NO REUTILIZAR | Calidad de vida dermatológica sin equivalente en P |
| PAM-10/activación | ELIMINAR / NO REUTILIZAR | No incluido en P, aunque D tenga formularios y tipos heredados |
| `VisitQuestionnairesPage` guardado conjunto de seis instrumentos | NO REUTILIZAR tal cual / ADAPTAR | COAMO tiene cuatro instrumentos y datos faltantes; guardar independientemente, sin bloquear por DLQI/PAM |
| Medicación normalizada/CIMA, conciliación y eventos | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Tratamiento hemostático específico y concomitantes; no compartir catálogo/Edge Function clínicos de DERMAPEX |
| Tratamiento hemostático, dispensaciones y disponibilidad | NUEVA EN COAMO | P:11–12 prescribe categorías/régimen y porcentaje recogidas/previstas |
| Coagulopatía, sangrados, articulaciones/inhibidores y resultados PK | NUEVA EN COAMO | Diccionario P:11–13, sin equivalente clínico en D |
| `BaselineTrendPanel` | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Catálogo D está vacío; COAMO debe poblarlo con variables P, no con riesgo cardiovascular ni dermatitis |
| `dashboardAnalytics`, `DashboardPage` | ADAPTAR | Quitar cohortes, media vacía=0 y regla 90 días; desarrollar indicadores COAMO y pares IEXPAC |
| `reportService`, PDFs e informes | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Motor de descarga/PDF útil; campos, unidades, instrumentos y recomendaciones específicos |
| `exportService`, `stratificationExport`, `spssWriter` | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | CSV/XLSX/SAV/SPS y paginación; nuevo dataset/diccionario, revisar fechas y missing |
| Documentos de visita y errores/rollback de subida | REUTILIZAR ARQUITECTURA / ADAPTAR CONTENIDO | Bucket, rutas, permisos, tipos y límites propios COAMO; evitar identificadores en PDFs |
| Auditoría y sellado de autor | REUTILIZAR patrón / ADAPTAR | Log/triggers propios `coag_*`; no adjuntar logger DERMAPEX |
| Vitest, SQL RLS y smoke | REUTILIZAR infraestructura / NUEVOS casos | Reglas y fixtures COAMO, regresión e aislamiento; no copiar resultados de tests DERMAPEX |
| Marca, documentos públicos y referencias institucionales | ADAPTAR | COAMO y centros aprobados, sin vínculos que presenten otro estudio como propio |
| IRIS, variables cardiovasculares heredadas y lógica de dermatitis | NO REUTILIZAR | Fuera de las fuentes clínicas COAMO y del alcance |

## 5. Alta, inclusión, consentimiento y seudonimización

### 5.1 Flujo de inclusión

Paciente nuevo como borrador/screening → evaluación de elegibilidad → consentimiento escrito documentado → inclusión confirmada → basal. Propuesta T: estados separados `screening`, `included`, `not_included`, `withdrawn`, `lost_to_followup`, `completed`; términos y motivos definitivos pendientes IP. Una pérdida de seguimiento no se deduce de una sola visita cancelada.

| Criterio P:9 | Campo conceptual | Validación / bloqueo |
|---|---|---|
| Edad ≥18 | `age_at_inclusion_years` | Edad numérica ≥18 para inclusión; no guardar fecha de nacimiento |
| Diagnóstico HA/HB/EVW | `diagnosis` | Uno de los tres códigos aprobados, sin «otras coagulopatías» elegibles por defecto |
| Consentimiento por escrito | `written_consent_status`, fecha/versión técnica | No incluir sin consentimiento documentado |
| Ausencia de condición limitante | `no_study_limiting_condition` | Sí requerido; aclarar compatibilidad con apoyo para cuestionarios |
| Seguimiento en farmacia externa con fármacos hospitalarios para patología | `hospital_pharmacy_followup`, `hospital_drug_for_condition` | Ambos confirmados para incluir |
| Incapacidad para cuestionarios sin apoyo suficiente o para visitas a juicio investigador | `exclusion_unable_questionnaires_without_support`, `exclusion_unable_visits` | Cualquier exclusión presente bloquea inclusión; no registrar diagnóstico de discapacidad adicional |
| Ensayo/estudio intervencionista que interfiere a juicio investigador | `exclusion_interfering_trial` | Participar en cualquier ensayo no excluye automáticamente: exige juicio de interferencia |
| Evidencia en historia clínica | `eligibility_source_verified` (T) | Confirmación sin copiar historia ni identificadores; responsable y momento auditados |

No incluir si algún criterio está desconocido; permitir borrador y registrar falta de dato. La ausencia de enfermedad limitante del criterio de inclusión y el apoyo suficiente de exclusión pueden tensionarse: PENDIENTE IP para casos con cumplimentación asistida. No permitir proxy no aprobado ni respuestas inferidas por profesional.

### 5.2 Identidad y privacidad

Código seudonimizado generado en servidor y único en COAMO; UUID técnico interno. La propuesta de formato COAMO no se atribuye a P. P solo exige eCRD (P:13); la ausencia de identificadores directos es requisito del encargo y patrón D. No introducir nombre, apellidos, NHC, DNI, correo, teléfono, dirección o fecha de nacimiento del paciente. La tabla de correspondencia queda local, fuera de COAMO. Identidades de profesionales se manejan en autorización, no en datasets clínicos.

Documento firmado de consentimiento puede identificar al paciente: guardar preferentemente estado/fecha/versión y mantener original en el centro. No subir automáticamente consentimientos nominativos. Documentación adjunta: solo archivos desidentificados aprobados, nombre original controlado, acceso por visita/centro y política de retención pendiente de responsables.

## 6. Diccionario clínico trazable

### 6.1 Convenciones de recogida y obligatoriedad

B = basal; F = final; S = seguimiento cuando se obtiene en asistencia habitual. P:14 exige parámetros clínicos/analíticos e historia farmacoterapéutica B/F; no detalla cada campo en cada visita. La asignación variable a B/F que sigue es **propuesta de CRD basada en P**, con aprobación IP pendiente cuando no se indica momento explícito. Los datos demográficos/de caracterización se recogen en B; no repetir datos estáticos por rutina.

Obligatoriedad: **I** bloquea inclusión; **E** se espera para evaluación basal/final, pero admite faltante justificado; **C** condicionado por aplicabilidad/disponibilidad; **M** pendiente del modelo correcto. Solo elegibilidad/consentimiento y consistencia identificativa bloquean inclusión. «E» nunca obliga a inventar una medición; cierre de visita puede aceptar missing justificado con aviso de calidad. Unidades/rangos no definidos se confirman antes de crear validaciones clínicas duras.

Todos los campos de las tablas siguientes son P, excepto identificadores/fechas de medida/estado/origen del registro marcados T. No trasladar que una variable del protocolo sea automáticamente ítem puntuable CMO.

### 6.2 Demografía y entorno

| Campo conceptual / dominio | Fuente | Momento | Obligación | Validación y longitudinalidad |
|---|---|---|---|---|
| Edad en años | P:9–10 | Inclusión/B | I | ≥18; edad basal fija, no recalcular sin fecha de nacimiento |
| Sexo: masculino/femenino | P:10 | B | E | Mantener dominios P; no heredar categorías adicionales sin aprobación |
| Peso kg | P:10 | B; F/S si medido | E/C | Positivo; rangos plausibles como avisos aprobados, no números inventados |
| Altura m | P:10 | B | E | Positiva, conversión explícita si captura cm |
| IMC kg/m² | P:10 | B; F/S si medidas | Derivado C | peso/altura²; missing si falta componente, guardar versión/fecha de medidas |
| Estudios: sin estudios/primaria/secundaria/superiores | P:10 | B | E | Lista literal; repetición solo si relevante |
| Laboral: empleado/desempleado/jubilado/baja por enfermedad | P:10 | B, actualización asistencial S | E | No inferir situación socioeconómica de empleo |
| Situación socioeconómica favorable/desfavorable | P:11 | B, S si cambia | E | Criterio operativo pendiente IP, no inferir renta |
| Soporte familiar disponible sí/no | P:11 | B, S si cambia | E | Missing separado de «no» |
| Autonomía funcional sí/no | P:11 | B, S si cambia | E | Definición operativa pendiente IP |
| Actividad física sedentaria/moderada/intensa | P:11 | B, S si cambia | E | No asignar umbrales de minutos no incluidos |
| Dificultad acceso hospitalario sí/no | P:11 | B, S si cambia | E | No capturar domicilio como sustituto |
| Acceso TIC sí/no | P:11 | B, S si cambia | E | Describe disponibilidad, no autoriza contacto fuera de circuitos aprobados |
| Conocimiento enfermedad limitado/adecuado | P:11 | B, S si cambia | E | Criterio de evaluación pendiente IP; no inventar escala |

### 6.3 Comorbilidades y hábitos

P:11 enumera **infecciones secundarias a hemoderivados, diabetes, hipertensión, obesidad, problemas psicológicos, hábito tabáquico y consumo de alcohol**, todos sí/no. Cada uno tiene campo propio, B esperado y actualización S/F si se evalúa; E con posibilidad de faltante. No inventar subtipo de infección, HbA1c, cifras de presión, consumo en unidades, dependencia o diagnóstico psiquiátrico específico. La obesidad se registra como variable P; derivarla de IMC requiere aprobar definición, no suponer umbral. El protocolo no convierte estas variables por sí solo en comorbilidades puntuables de CMO.

### 6.4 Coagulopatía y resultados clínicos

| Campo conceptual / dominio | Fuente | Momento | Obligación | Validación / cautela |
|---|---|---|---|---|
| Enfermedad HA/HB/EVW | P:9,11 | Inclusión/B | I | Clasificación coherente; identidad diagnóstica no intercambiable sin corrección auditada |
| Hemofilia leve/moderada/grave | P:11 | B | E si HA/HB | Criterios de factor: >5%, 1–5%, <1%; no usar factor bajo tratamiento automáticamente para severidad basal |
| EVW tipo 1/2/3 | P:11 | B | E si EVW | No exigir subtipos 2A/2B/2N/2M: P:3 los describe en antecedentes, no en lista de variables |
| Años desde diagnóstico | P:11 | B | E | ≥0; precisión y edad de diagnóstico pendiente IP; no añadir fecha identificativa |
| Desarrollo de inhibidores sí/no | P:11–12 | B/F, S si documentado | E/C | Diferenciar antecedente y nuevo desarrollo, definición/ventana pendiente IP; resultado específico referido a reemplazo |
| Tasa anualizada sangrados (ABR) | P:11–12 | B/F | E | ≥0; ventana/tiempo observado obligatorio para interpretar tasa |
| Sangrados espontáneos, número | P:12 | B/F | E | Entero ≥0 en ventana definida; clasificación/mutua exclusión pendiente IP |
| Sangrados traumáticos, número | P:12 | B/F | E | Igual; no asumir que espontáneos+traumáticos agotan todas categorías |
| Tasa anualizada sangrados articulares (AJBR) | P:11–12 | B/F | E | ≥0; misma ventana para comparar con ABR |
| Gravedad sangrados último año: no aplica/ambulatorio/ingreso | P:11–12 | B/F | E | Regla de resumen si hay varios episodios pendiente IP; no inventar «máxima» como oficial |
| Artropatía hemofílica sí/no | P:11–12 | B/F | E/C | No marcar ausencia en EVW sin confirmar aplicabilidad |
| Articulación diana ausente/especificar | P:11–12 | B/F | E/C | ≥3 hemartrosis en 6 meses consecutivos según P:11; especificación sin datos identificativos |
| Dolor articular ausente/leve-moderado/persistente | P:11–12 | B/F | E/C | Escala categórica P; no reemplazar por EVA de dolor |
| HJHS si determinado | P:12 | B/F/S si disponible | C | Versión, rango y método requieren ficha oficial aprobada; no exigir examen nuevo |
| HEAD-US si determinado | P:12 | B/F/S si disponible | C | No mezclar numéricamente con HJHS; versión/unidad/rango pendientes |

Se recomienda CRD agregado por ventana para MVP. Un diario por episodio de sangrado no está exigido por P: su captura de fecha/localización/tratamiento detallado sería una ampliación a aprobar, no un requisito inventado. Para tasas calculadas en app, el numerador de episodios articulares y tiempo de observación son insumos técnicos necesarios (T derivados de definición P:11); si se importa una tasa ya calculada, guardar su origen/método y no crear episodios ficticios.

Fórmula conceptual ABR/AJBR = episodios × factor anual / tiempo observado. Convención 365, 365.25 días o meses exactos, manejo de periodos incompletos y ventana retrospectiva basal: **PENDIENTE IP**. No anualizar sin denominador, no multiplicar un recuento sin conocer el periodo y no sumar ventanas superpuestas como episodios distintos.

### 6.5 Tratamiento hemostático y resultados terapéuticos

| Campo / dominio | Fuente | Momento | Obligación | Validación |
|---|---|---|---|---|
| Régimen profilaxis/a demanda | P:11 | B/F, cambios S | E | Historial de vigencia; no usar «a demanda» como no adherencia |
| Tipo: plasmático, recombinante estándar, recombinante extendido, no sustitutivo, rebalanceador, génica | P:11 | B/F, cambios S | E | Categorías P, no asumir dosis/frecuencia comunes |
| Agente hemostático, especificar | P:11 | B/F, cambios S | E | Nombre/código de catálogo propio y texto controlado; no inventar lista cerrada de fármacos |
| Cambio de régimen desde última visita sí/no | P:11 | S/F; B no aplica salvo periodo aclarado | E/C | Referencia a visita anterior y episodio de tratamiento; no inferir sin historial |
| Dispensación hospital/proximidad (domicilio u oficina) | P:11 | B/F, cambios S | E | Las submodalidades están en P; no guardar dirección |
| Polifarmacia sí/no | P:11 | B/F, S si cambia | E | ≥5 concurrentes; recuento técnico opcional y fecha; no exigir lista de nombres no necesaria |
| Concentración del factor deficitario | P:12 | B/F/S si disponible y reemplazo | C | Unidad/método/momento respecto a dosis pendientes; no confundir con severidad diagnóstica |
| Semivida si determinada | P:12–13 | B/F/S si disponible | C | Valor positivo y unidad aprobada; no estimación automática |
| AUC si determinada | P:12–13 | B/F/S si disponible | C | ≥0, unidad y método; no crear cálculo PK nuevo |
| Modificación de pauta | P:12 | S/F | E/C | Registrar evento respecto a previo; granularidad de dosis/frecuencia pendiente IP |
| Cambio de agente hemostático | P:12 | S/F | E/C | Historial anterior/nuevo sin reemplazar pasado |
| Necesidad de factor para manejo de sangrados | P:12 | B/F | E/C | Tipo de respuesta y ventana pendiente IP; no asumir unidades consumidas |

La pauta es trazable por la variable «modificación de pauta», pero P no prescribe campos concretos de dosis, vía, intervalo, peso ajustado o unidad de consumo. PENDIENTE IP para detalle de prescripción; no programar un formulario universal de dosis de factor como si fuera obligatorio.

Medicación concomitante: P:6 habla de adherencia hospitalaria/no hospitalaria y P:11 de ≥5 medicamentos concurrentes. Reutilizar arquitectura de conciliación solo para medicación necesaria a esos objetivos; no convertir automáticamente cada fármaco concomitante en outcome ni exigir búsqueda CIMA. Propuesta T de registro mínimo: identificador/nombre de medicamento, vigencia y condición hospitalaria/concomitante; pauta detallada solo tras aprobación. Catálogo independiente COAMO.

## 7. Longitudinalidad, visitas y plan de atención

### 7.1 Tipos y estado

Entidades separadas para **visita evaluativa** (basal, seguimiento, final) y **contacto asistencial** (programado/no programado; presencial/teléfono/videollamada/plataforma). Un contacto puede vincularse a una visita sin ser una evaluación completa ni inflar el número de visitas con PROM. Clasificación, estados programada/realizada/cancelada/no realizada y fecha efectiva son T; momento/modo de contacto son P:6,8,12,15.

| Momento | Datos/acciones | Fuente y restricciones |
|---|---|---|
| Inclusión | Elegibilidad y consentimiento | P:9,14; sin consentimiento no incluir |
| Basal | Caracterización, clínica/terapia, CMO, plan, IEXPAC, EVASAF, EQ-5D-3L y adherencia | P:10–14; definir orden y evitar administrar IEXPAC después de intervención como si fuera experiencia previa |
| Seguimiento | Contactos, intervenciones, adherencia y datos clínicos obtenidos habitualmente | P:14–15; periodicidad P1/P2 pendiente M; no imponer batería de cuestionarios completa |
| Final | 12 meses ±1 mes; clínica/terapia, cuatro instrumentos, dispensaciones y resultados | P:14; guardar fecha real y desviación de ventana, no falsificar fecha por estar fuera de plazo |
| Extra/no programada | Necesidad paciente/equipo, contacto e intervención | P:15; no crear automáticamente un seguimiento protocolizado |

P:15 dice que prioridad 3 se valora cada 12 meses, por lo que no aplica seguimiento intermedio; no declarar «pérdida» a los 90 días. P1/P2: no hay intervalo en P, pendiente M. El sistema puede mostrar pendientes solo contra calendario aprobado y fecha real de siguiente evaluación; distinguir no requerido, no programado, vencido y pérdida confirmada.

### 7.2 Prioridad longitudinal

P exige estratificación basal y seguimiento según prioridad; no determina expresamente cuándo reestratificar. Propuesta T: historial de evaluaciones CMO con fecha/visita, modelo/motor, respuestas, puntos, regla y prioridad; nueva evaluación no sobreescribe la anterior. Reestratificación en final o ante cambio clínico/terapéutico necesita aprobación IP/M; no heredar motivos DERMAPEX como obligación COAMO.

Mostrar «prioridad basal», «última prioridad evaluada» y fecha de esta. Cambio de P1 a P2/P3 significa menor prioridad asistencial, no prueba automáticamente mejoría clínica ni éxito del tratamiento. Comparar puntos solo bajo versiones comparables; si cambió modelo, advertir y separar series.

Plan de atención (P:8 + T para estructura): prioridad vigente, intervenciones previstas de catálogo aprobado, objetivos acordados, barreras y expectativas documentadas de forma mínima y no identificativa, canales asistenciales disponibles. Entrevista motivacional no es un nuevo cuestionario puntuable. No crear chat propio ni conectar WhatsApp personal: registrar uso de circuitos corporativos aprobados.

## 8. Modelo CMO de coagulopatías: contrato pendiente

| Elemento requerido | Confirmado | Pendiente / regla de bloqueo |
|---|---|---|
| Dimensiones | P:8 cita demográficas, clínicas, farmacoterapéuticas y sociosanitarias | Lista de ítems y agrupación exacta M |
| Variables puntuables | P alude al modelo externo | M: texto, opciones, condiciones, unidades y evidencia |
| Ponderación | P:8 menciona 4 puntos para variables de mayor relevancia | No equivale a asignar 4 a todos los campos P; faltan demás pesos y combinaciones |
| Puntos de corte | Tres prioridades P1/P2/P3 | No aportados; prohibido copiar ≥31/18–30/≤17 DERMAPEX o cortes de migraña |
| Reglas automáticas especiales | No detalladas en P | M-pendiente; no asumir embarazo, inhibidores o sangrado grave como override |
| P1/P2/P3 | Alta/intermedia/baja complejidad P:8 | Paquetes/criterios exactos M |
| Periodicidad | P:15: P3 cada 12 meses, sin seguimiento intermedio | P1/P2 y manejo de cambios de prioridad M/IP |
| Faltantes | No especificado para puntuación | No convertir desconocido a cero por herencia D; regla M/IP |
| Catálogo de actuaciones | P:8 remite a apartado 5 del módulo Capacidad | M-pendiente, incluye acciones por prioridad y posible acumulación |
| Reestratificación | Basal confirmada P:14 | Frecuencia/trigger/final M/IP |

Contrato a completar por cada ítem M: código estable, texto literal, fuente/página, bloque, tipo de respuesta, opciones, condición de aplicabilidad, puntos por opción, dato clínico que lo alimenta, obligatoriedad, regla de missing y vigencia. Por regla especial: condición exacta, prioridad resultante, precedencia sobre suma, combinación y evidencia. Por corte: extremos inclusivos/exclusivos, huecos y empates resueltos.

Arquitectura D útil: catálogo y modelo versionados, resultados por ítem, explicación del total y cálculo verificado en servidor. Pero se necesita un motor COAMO independiente probado con casos clínicos de referencia. No generar suma/etiqueta válida mientras falte definición. Prioridad introducida por profesional, si se acepta provisionalmente para un piloto, debe quedar como «clasificación manual externa, no validada por motor» y con fuente; no sustituye los requisitos del estudio ni autoriza un MVP clínico sin modelo aprobado.

## 9. Intervenciones farmacéuticas y resultados de proceso

P:6,8,12 define tres ámbitos: seguimiento farmacoterapéutico; educación, formación y seguimiento del paciente; coordinación con el equipo asistencial. Capturar intervención prevista/realizada, ámbito, contacto, modalidad, programada/no programada y fecha. Campos ID, autor, versión de catálogo y vínculo al plan son T.

El catálogo preciso por prioridad requiere M-pendiente. No copiar acciones de dermatitis o migraña, mínimo número por visita, paquetes acumulativos o requisitos de resultado de intervención no descritos. Separar «sin intervención realizada» de «sin registro» mediante confirmación operativa T; no asumir cero al no existir filas.

El número total se deriva de registros realizados únicos. Una llamada con tres actuaciones genera un contacto y tres intervenciones; no contar ambos como cuatro intervenciones. Mostrar también programadas/no programadas y modalidad con denominadores claros. Evaluación de grado de implementación CMO por centro está citada en P:13, pero la escala/fórmula no está definida: no construir un índice de fidelidad arbitrario.

## 10. Instrumentos, adherencia y resultados

### 10.1 IEXPAC: resultado principal

P:10: 11 ítems, siempre=5, casi siempre=4, a veces=3, casi nunca=2, nunca=1. Suma 11–55; **global = 10 × (suma − 11) / 44**, rango 0–10. D implementa esa fórmula en `VisitQuestionnairesPage` y usa un dominio de cuestionarios; es reutilizable tras fijar versión, redacción oficial y permisos de uso.

Recoger B/F, respuestas crudas, fecha, estado, suma, global y versión. Si falta uno de los 11 ítems, no calcular global en ausencia de regla aprobada; guardar parcial y motivo. Guardar precisión suficiente y redondear solo visualmente. Delta = final − basal para pares completos; no imputar ni convertir ausencias en cero. P:13 usa 1 punto como diferencia mínima clínicamente relevante del cálculo muestral; no etiquetar automáticamente a cada paciente como respondedor con ese umbral sin confirmar definición analítica.

D incluye ítems condicionales 12–15; P menciona puntuación condicional pero no define qué ítems usar. **PENDIENTE IP:** versión de 11 ítems más cuáles condicionados. No incorporarlos al global ni exigirlos a todos; no heredar q12–q15 sin fuente aprobada. IEXPAC mide experiencia (PREM), no calidad de vida.

### 10.2 EQ-5D-3L

P:12: movilidad, cuidado personal, actividades cotidianas, dolor/malestar, ansiedad/depresión; tres niveles por dimensión por definición del instrumento y EVA 0–100. B/F. D contiene EQ-5D-5L: reutilizar estructura de formulario/versionado, **reemplazar instrumento**, textos oficiales y opciones por versión 3L validada/licenciada. No usar strings/índices 5L ni crosswalk sin autorización.

Conservar cada dimensión 1–3 y perfil de cinco dígitos; EVA independiente 0–100. No sumar dimensiones para llamar a esa suma utilidad. Índice de utilidad solo si se aprueba tarifa/país/versión/licencia y algoritmo; mientras tanto exportar perfil+EVA y utility missing. Faltante de dimensión invalida perfil completo, no la EVA disponible. No confundir EVA de salud con dolor articular.

### 10.3 EVASAF

P:12: 10 preguntas, escala 1 muy deficiente a 5 excelente, B/F. D `evasaf.ts` conserva ítems y calcula media solo con diez respuestas; el propio código marca el agregado como provisional. El protocolo no especifica media/suma/constructos como score principal EVASAF. Reutilizar presentación y validación de respuestas oficiales después de confirmar versión. Exportar cada ítem; media o suma solo como resumen descriptivo aprobado, etiquetado y versionado. No convertirlo en índice validado inventado ni añadir comentarios libres porque otro estudio los tenga.

### 10.4 Morisky-Green

P:12: cuatro preguntas sí/no; alta adherencia si cuatro correctas, baja si ≥1 incorrecta, B/F. P:14 incluye valoración de adherencia en S, sin precisar si repite ambos métodos: confirmar carga en seguimiento. D usa clave no/sí/no/no según su redacción; revisar formulario oficial COAMO antes de reutilizar el algoritmo. Guardar ítems originales y resultado/versión; si incompleto, no calculable, nunca baja por missing.

P:6 incluye tratamiento hospitalario y no hospitalario; sección P:12 se titula adherencia hospitalaria. **PENDIENTE IP:** a qué tratamiento se refiere cada administración y si se necesitan formularios separados. Capturar alcance evaluado como metadato T para no mezclar pacientes/regímenes.

### 10.5 Registro de dispensaciones

P:12 exige **100 × número de dispensaciones recogidas / previstas de agentes hemostáticos en los últimos 12 meses**, al inicio y al final. No es MPR/PDC por días de cobertura ni prueba de administración efectiva. Registrar numerador entero ≥0, denominador entero ≥0, ventana de referencia, agente/episodio al que corresponde y fuente verificada sin identificadores del sistema hospitalario.

Si previstas=0, porcentaje no calculable/no aplica con motivo; no asignar 100%. Si recogidas>previstas, avisar para revisión sin truncar a 100 ni rechazar silenciosamente; confirmar criterio y ajustes por dispensaciones extraordinarias/cambios de régimen. En terapias a demanda/génica/rebalanceadores, aplicabilidad y dispensaciones previstas requieren definición IP. No convertir un periodo menor en 12 meses por extrapolación no aprobada.

MVP: resumen agregado B/F a partir de registros fuente. Lista de eventos de dispensación con fecha/unidades solo si se aprueba su necesidad, de forma no identificativa. No automatizar integración con sistemas hospitalarios en esta fase.

### 10.6 Outcomes y comparación

Resultados clínicos y terapéuticos son exclusivamente los de la sección 6 y P:12–13. PROM: EQ-5D-3L; PREM: IEXPAC y satisfacción EVASAF. Morisky y registro de dispensación son medidas de adherencia, no índices genéricos de calidad de vida. Mostrar cambios descriptivos y datos emparejados; no atribuir causalidad ni crear «respuesta hemostática», escalas de discapacidad u outcomes compuestos no descritos.

## 11. Modelo conceptual de datos: exclusivamente `coag_*`

No es SQL ni una modificación del modelo existente. IDs, timestamps, autoría, estados, versión y referencias técnicas son T; los campos clínicos remiten a los diccionarios P anteriores. Para cada grupo de campos se conserva código de fuente/página, unidad y regla; «JSON de respuestas» no exime de diccionario validado.

| Entidad conceptual | Finalidad / campos | Relaciones | Origen | Recogida y obligatoriedad | Validación / temporalidad |
|---|---|---|---|---|---|
| `coag_profiles` | Perfil investigador, rol/actividad, nombre profesional | Identidad Auth; memberships COAG | T, organización P:9 | Provisión administrativa requerida | Rol protegido; no autorizar por existencia de perfil; longitudinal administrativa |
| `coag_centers` | Código, nombre, activo, función reclutador/consultor propuesta | Perfiles por memberships; pacientes | P:9 + T | Antes de reclutar, lista final IP | Código único; no study_arm; cambios auditados |
| `coag_center_memberships` | Perfil, centro, vigencia/autor de asignación | Solo perfiles/centros COAG | T | Administración | No autoasignación; pertenencia a app válida; historial administrativo |
| `coag_patients` | UUID, código, centro, estado del estudio | Screening, consentimientos, B y visitas | Encargo + P:9 + T | Screening/inclusión; identidad/centro requeridos | Sin identificadores directos; código/centro inmutables salvo corrección controlada |
| `coag_eligibility_assessments` | Todos los criterios sección 5, evaluación y fuente verificada | Paciente, profesional COAG | P:9 + T | Antes de incluir; criterios completos | Ninguna exclusión; historial de correcciones |
| `coag_consents` | Estado escrito, fecha, versión, retirada como estado técnico | Paciente | P:9,14 + T | Preinclusión, cambios | Documento original no obligatorio en app; no acceso sin consentimiento válido |
| `coag_baseline_characteristics` | Edad, sexo, estudios y descripción sociosanitaria/comorbilidades | Una evaluación basal por paciente | P:10–11 | B, E salvo edad I | Dominios sección 6; no sobreescribir basal por actualizaciones futuras |
| `coag_context_observations` | Actualizaciones de peso/contexto/comorbilidades si recogidas | Paciente y visita | Campos P:10–11; separación temporal T | S/F según dato habitual, no obligado por defecto | Diccionario aprobado y fecha efectiva; longitudinal |
| `coag_visits` | Basal/seguimiento/final, fecha prevista/efectiva, estado, ventana | Paciente, clínica, cuestionarios | P:14–15 + T | B/F requeridas evaluativamente; S según prioridad | Un basal/final válido, visitas extra no reemplazan final sin regla; longitudinal |
| `coag_contacts` | Programado/no, modalidad, fecha/realización | Paciente, visita opcional, intervenciones | P:6,8,12,15 + T | Cada contacto realizado | No duplicar visita/contacto; sin datos de comunicación personales |
| `coag_clinical_assessments` | Diagnóstico/gravedad y variables clínicas sección 6.4 | Paciente/visita | P:11–12 | B/F; C para escalas disponibles | Clasificación condicional, unidades/ventanas; longitudinal, basal conservada |
| `coag_bleeding_summaries` | ABR/AJBR, espontáneos/traumáticos, gravedad, ventana, origen de tasa | Evaluación clínica/visita | P:11–12 + T de periodo/método | B/F, E con missing | No doble contabilización de ventanas; tasas no negativas |
| `coag_treatment_episodes` | Régimen, categoría, agente, dispensación y vigencia | Paciente, agente de catálogo | P:11–12 + T de vigencia | B y cada cambio observado | Intervalos coherentes; coexistencia posible requiere IP, no forzar uno sin revisar |
| `coag_treatment_changes` | Cambio régimen/pauta/agente, fecha, episodio anterior/nuevo | Episodios, visita/contacto | P:11–12 + T | S/F si ocurre | No sobrescribir historial; granularidad de pauta pendiente IP |
| `coag_therapeutic_assessments` | Factor, semivida, AUC, necesidad de factor | Visita, tratamiento | P:12–13 | B/F/S si disponible, C | Métodos/unidades y reemplazo aplicable, no pruebas nuevas |
| `coag_medication_catalog` | Identidad/descripción de agentes y concomitantes necesarios | Episodios/medicación | Arquitectura D + P:11 | Antes o al registrar fármaco | Catálogo propio; ninguna FK a catálogo DERMAPEX |
| `coag_concomitant_medications` | Medicamentos necesarios, vigencia, alcance | Paciente, catálogo | P:6,11 + T | B/F si recogidos | Detalle pendiente IP; polifarmacia no exige inventar una prescripción |
| `coag_dispensing_assessments` | Recogidas/previstas, %, ventana y aplicabilidad | Paciente, visita, tratamiento | P:12 + T | B/F | Denominador 0→missing/no aplica; no MPR/PDC |
| `coag_cmo_model_versions` | Versión, fuente aprobada, cortes/reglas, vigencia | Variables y evaluaciones CMO | M-pendiente + T | Antes del motor | No rellenar con migraña/DERMAPEX; versiones históricas inmutables |
| `coag_cmo_variable_catalog` | Ítem, bloque, opciones, puntos, regla missing, fuente/página | Modelo | M-pendiente | Catálogo previo aprobado | Completitud y cobertura sin huecos/solapes |
| `coag_cmo_assessments` | Fecha/visita, modelo/motor, total, prioridad, regla, completitud | Paciente, visita, resultados de ítems | P:8,14 + M + T | B, futuras reevaluaciones IP | Derivados verificados, no sobreescribir historia |
| `coag_cmo_item_results` | Valor bruto, estado missing, puntos/resultados | Evaluación e ítem de modelo | M + T | Cada estratificación | Mismo modelo; no puntos cero por desconocido sin regla |
| `coag_care_plans` | Prioridad usada, objetivos/plan y vigencia | Paciente, CMO, intervenciones previstas | P:8 + M + T | Tras B, revisiones aprobadas | No recomendación automática no validada; historial longitudinal |
| `coag_intervention_catalog` | Acción, ámbito, prioridad/paquete y versión | Registro de acciones | P:8,12 + M | Antes del registro catalogado | Contenido M aprobado, no dermatitis ni migraña |
| `coag_interventions` | Prevista/realizada, fecha, ámbito, modalidad, autor | Paciente, plan, contacto/visita, catálogo | P:6,8,12 + T | B/S/F | Contar realizadas únicas; sin registro ≠ cero |
| `coag_questionnaire_versions` | Instrumento, versión/idioma, ítems y algoritmo aprobado | Respuestas | P:10,12 + documentación oficial + T | Antes de uso | Solo IEXPAC, EVASAF, EQ-5D-3L, Morisky en alcance actual |
| `coag_questionnaire_responses` | Ítems crudos, aplicabilidad, completitud, fecha, derivados/versiones | Visita, instrumento | P:10,12 + T | B/F; adherencia S pendiente alcance | Una administración válida por momento/alcance; correcciones auditadas |
| `coag_followup_events` | Retirada/pérdida/finalización, fecha y motivo operativo aprobado | Paciente, visita si corresponde | P:13–15 + T | Cuando se confirma evento | Motivos no especificados P: aprobar, no inferir fallecimiento u otros outcomes |
| `coag_visit_documents` | Tipo aprobado, ruta, fecha, autor, estado de desidentificación | Visita/paciente; bucket propio | Encargo, P:14 + T | Solo documentos necesarios | Sin originales identificativos; rutas/autor protegidos |
| `coag_data_queries` | Campo/visita, incidencia, resolución y autor | Entidad registrada, paciente/visita | T para calidad | Cuando hay problema | No modificar dato clínico automáticamente; longitudinal administrativa |
| `coag_audit_log` | Evento, actor, entidad, cambios mínimos, instante | Referencias históricas, no dependencias destructivas | Encargo + patrón D/T | Automático | Sin DML cliente, solo ámbito COAMO |
| `coag_export_runs` | Fecha, ámbito, versión/dataset, conteos y autor | Exportación, sin copia de datos personales | T | Cada exportación | Registro técnico, snapshot reproducible; no es outcome |

Relaciones principales: centro → pacientes → visitas → evaluaciones/cuestionarios; paciente → episodios de tratamiento → cambios/dispensación; paciente → contactos → intervenciones; modelo → variables → ítems de evaluaciones; evaluación CMO → plan → acciones. Todos los parents clínicos son COAMO. No se crea ninguna FK clínica a DERMAPEX.

La autorización común provisional se referencia como contrato externo de infraestructura ya descrito, **sin crear aquí entidades compartidas ni SQL**. Todas las entidades de negocio propuestas en este documento tienen prefijo `coag_`.

## 12. Datos faltantes, pérdidas y control de calidad

Propuesta T: dato + estado `observed`, `not_collected`, `unknown`, `not_applicable`, `declined`, con vocabulario/motivos aprobados. No todas las categorías se aplican a cada campo. Ausente ≠ negativo ≠ cero ≠ no aplicable. Mostrar completitud por campo esperado y por instrumento; C condicional no entra en denominador si no aplica. Distinguir visita no realizada de visita realizada con un cuestionario incompleto.

No imputar media, cero, última observación o puntuación parcial sin regla aprobada. No borrar paciente de exportación por faltar final; conservar estado y missing. Cuando el paciente retira consentimiento, alcance de retención/uso posterior lo decide consentimiento y aprobación ética; no inferir «borrar todo» ni «seguir usando todo».

Controles duros: identidad técnica, FK del estudio, fechas/ventanas consistentes, opciones válidas, elegibilidad/consentimiento para inclusión, ítems dentro de escala. Avisos revisables: plausibilidad antropométrica, recogidas>previstas, observación fuera de ventana, discordancia clínica/tasa o diagnóstico, cambios sin previo documentado. No bloquear ingreso de dato clínico real solo porque es extremo.

Calidad de datos: registrar procedencia/verificación, errores de unidad, duplicados, fecha efectiva vs entrada, coherencia basal/final, periodos de tasa y dosificación. Corrección con autor/fecha y razón, sin borrar historia. La app no cambia tratamiento, no emite alarma diagnóstica no validada y no solicita pruebas extraordinarias para completar un campo.

Pérdidas: porcentaje sobre incluidos con definición de evaluable/final/retirada aprobada. 15% P es previsión muestral, no umbral automático de decisión individual. Un retraso es incidencia, no necesariamente pérdida. Cierre del dataset con resolución de queries y snapshot de análisis, no una edición silenciosa posterior a exportar.

## 13. Dashboard COAMO

Descriptivo y orientado a P:6,10–15. Investigador ve su ámbito; coordinación COAMO ve COAMO global, nunca DERMAPEX. Todos los gráficos muestran denominador, missing, periodo, filtro y fecha de corte. No mostrar cero si el subconjunto está vacío; «sin datos».

| Bloque | Indicadores propuestos | Denominador/precaución |
|---|---|---|
| Operación | Visitas/contactos pendientes/realizados, próximos finales, queries abiertas | Fechas efectivas y calendario aprobado; no alerta universal 90 días |
| Reclutamiento | Screening, elegibles, incluidos, no incluidos y total frente a meta 75 | Meta global P; por-centro solo si cuota confirmada; no contar consultor como reclutador |
| Seguimiento | B/F realizadas, finales en ventana, retenciones/pérdidas confirmadas | Incluidos con oportunidad de llegar a final; distinguir aún no vencidos |
| Distribución CMO | P1/P2/P3 basal y última; sin clasificación | Solo evaluaciones válidas, modelo/fecha visibles; bloque no operativo hasta M |
| Evolución CMO | Matriz de transición basal→última/final, cambios de puntos comparables | Pares válidos, no convertir menor prioridad en éxito clínico |
| Clínica | ABR/AJBR, espontáneos/traumáticos, gravedad, artropatía/diana/dolor e inhibidores | Ventanas homogéneas, n de datos; separar diagnóstico y disponibilidad de escalas |
| Terapia | Régimen/categoría/agente, cambios, modalidad dispensación, parámetros disponibles | Tratamiento vigente al corte vs basal/final explícitos; PK condicional |
| Intervenciones | Total, ámbito, modalidad, programadas/no programadas | Actuaciones realizadas distintas de contactos; no registro separado |
| Adherencia | Morisky alta/baja/no calculable, recogidas/previstas y % | Instrumento/alcance y ventana; sin denominador no hay porcentaje |
| PROM/PREM | EQ-5D-3L perfiles/EVA, EVASAF por ítem/resumen aprobado | No utility sin tarifa; EVASAF no índice validado por defecto |
| Principal IEXPAC | Cobertura B/F, pares completos, distribución B/F y delta en pares | Separar todos los B de subconjunto emparejado; evitar medias de grupos diferentes como delta |
| Completitud | Campos esperados completos, instrumentos parciales, datos fuera de ventana | Excluir no aplicables aprobados; mostrar pérdida final y oportunidades de evaluación |

Media/mediana y dispersión descriptivas pueden definirse en especificación analítica posterior, sin tests de normalidad en app. No p-values, Wilcoxon, Friedman, chi-cuadrado, modelos inferenciales ni clasificaciones de «mejoró estadísticamente». P:14 incluye esos análisis para SPSS, no exige que el frontend los ejecute.

## 14. Evolución, informes y documentación

Ficha: identificación seudonimizada → inclusión/basal → timeline de visitas/contactos → tratamientos vigentes/históricos → clínica por ventanas → CMO versionado → cuestionarios e intervenciones. Gráficos separados por unidad; no mezclar HJHS y HEAD-US ni tratar tasa anualizada como recuento bruto. Señalar missing y cambios de versión en series.

Informes propuestos T: resumen asistencial de visita, evolución longitudinal del paciente y reporte operativo/calidad de centro. Campos clínicos solo P/M; sin nombre/NHC; auditar emisión cuando proceda. Los informes muestran origen/fecha, cuestionarios incompletos y CMO no disponible. No generar recomendaciones específicas automáticas hasta disponer de catálogo M aprobado.

Documentación en app: protocolo/versiones aprobadas, guía de recogida, definiciones de tasas/ventanas, instrucciones oficiales de instrumentos y catálogo CMO cuando se aporte. No subir el PDF de migraña como guía del estudio ni vincular a recursos externos como fuente clínica validada sin revisión.

## 15. Exportación para análisis estadístico

Reutilizar utilidades CSV/XLSX/SAV/SPS y paginación de D; reemplazar contratos/diccionario. Dataset relacional largo como base, más una vista/tablas emparejadas B/F para análisis principal. No combinar relaciones 1:N en una tabla plana que multiplique cuestionarios o intervenciones.

| Archivo/dataset conceptual | Clave / granularidad | Contenido y fuente |
|---|---|---|
| `patients` | Código COAMO único | Centro, inclusión/estado, elegibilidad y caracterización P:9–11 |
| `visits` | Código+ID visita | Tipo, fechas/días desde ancla aprobada, prevista/real, ventana, estado T/P:14 |
| `clinical_assessments` | Código+visita/evaluación | Clínica P:11–12, missing, unidades y origen |
| `bleeding_summaries` | Código+visita+ventana | Recuentos, tasas, gravedad, numeradores/periodo T/P:11–12 |
| `treatments` / `treatment_changes` | Código+episodio/evento | Régimen/categoría/agente, vigencia y cambios P:11–12 |
| `therapeutic_outcomes` | Código+visita/evaluación | Factor, PK disponible, necesidad factor P:12–13 |
| `dispensing` | Código+visita+tratamiento/ventana | Recogidas, previstas, % y aplicabilidad P:12 |
| `cmo_assessments` / `cmo_items` | Código+evaluación (+ítem) | Versiones, respuestas, puntos, reglas y prioridad M cuando aprobado |
| `questionnaires` / `questionnaire_items` | Código+visita+instrumento/alcance (+ítem) | Crudos, derivados, completitud y versión P:10,12 |
| `contacts` / `interventions` | Código+evento | Modalidad, programación, ámbito, realización y catálogo P:6,8,12,15 |
| `followup` | Código+evento de estado | Finalización/retirada/pérdida y fechas, definición pendiente IP |
| `iexpac_paired` | Una fila por paciente | Basal/final, fechas, sumas/globales y delta, flags par/ventana/missing |
| `dictionary` / `manifest` | Variable / ejecución | Etiqueta, tipo, unidad, dominios/missing, fuente/página, fórmula, versión/corte y n filas |

No incluir nombres de pacientes/profesionales, emails, Auth UUID, NHC, comentarios libres sin depurar, archivos clínicos, rutas Storage, URLs firmadas ni datos que vinculen al otro estudio. Los identificadores técnicos de visita/evaluación para joins pueden ser propios del dataset, no tienen que exponer UUID de producción. Centro/código/fechas exactas pueden ser cuasiidentificadores; exportar fechas o tiempos relativos según plan de privacidad aprobado, no afirmar que seudonimización equivale a anonimato.

Tiempo: conservar basal/final real, ventana clínica y días/meses relativos desde ancla confirmada; no usar fecha de creación del registro como fecha de visita. Dataset largo permite más de dos medidas sin inventar un calendario mensual. Para comparaciones B/F no duplicar basal si existen múltiples seguimientos.

Missing: numéricos vacíos/system-missing y columnas de estado/motivo; si se emplean códigos SPSS de usuario, documentarlos y declararlos en `.sps`, sin −999 como valor clínico calculable. Binarios sí/no conservan missing separado. Instrumentos incompletos incluyen ítems disponibles pero global no calculable. Exportar los no evaluables con flags, sin exclusión automática.

CSV seguro frente a fórmulas de hoja de cálculo en texto libre/códigos; codificación, separador y formato decimal estables. Versionar etiquetas y categorías SAV/SPS, preservar crudos y derivados y comprobar compatibilidad SPSS. Paginación determinista y corte consistente: no prometer un snapshot si se descargan tablas que cambian simultáneamente sin mecanismo de congelación/versionado.

## 16. Dependencias y decisiones abiertas

| ID | Duda/contradicción | Efecto | Acción previa a programar |
|---|---|---|---|
| C01 | Segundo PDF es migraña, no coagulopatías | No hay especificación validada del motor/catalogo/periodicidad P1/P2 | Aportar modelo correcto con versión aprobada; cotejar ítems/tablas/cortes/reglas |
| C02 | Siete reclutadores + Valme consultor P:9 vs ocho hospitales P:13 | Permisos de centro y metas | IP confirma lista y función de Valme |
| C03 | 64 evaluables, 75 incluidos y 15% pérdidas P:13 | 64/0.85≈75.29; redondeo conservador implicaría 76 | Mantener meta P=75 visible, señalar discrepancia; IP/estadístico confirma cálculo, no cambiarlo unilateralmente |
| C04 | 12 meses desde inclusión vs calendario fijo enero–diciembre 2027 | Basales de octubre 2026 y final diciembre 2027 no son 12 meses | IP fija ancla y calendario operativo por paciente |
| C05 | Condición limitante excluida vs apoyo suficiente para cuestionarios | Elegibilidad y cumplimentación asistida | Definir cuándo se permite asistencia, quién responde y registro necesario |
| C06 | IEXPAC 11 global y mención condicional; D tiene 12–15 | Formulario y exportación | Versión oficial y condicionales autorizados; no añadir por herencia |
| C07 | EVASAF sin fórmula resumen en P; D media provisional | Dashboard/resultado derivado | Aprobar resumen o limitar a ítems; verificar texto oficial |
| C08 | P pide 3L; D incluye 5L | Instrumento incompatible | Versión 3L, licencia y tarifa si se requiere utilidad |
| C09 | Morisky sin texto/clave y alcance hospitalario/no hospitalario | Riesgo de puntuar con polaridad incorrecta | Texto/clave oficial, tratamientos evaluados y administración en S |
| C10 | Ventanas ABR/AJBR y clasificación de sangrados incompletas | Tasas no comparables | Definir tiempos, factor anual, resumen de gravedad y episodios incompletos |
| C11 | HJHS/HEAD-US y PK «si determinados», sin unidades/versiones | Validaciones y faltantes | Documentación de medida; no solicitar pruebas para completar |
| C12 | Inhibidores: antecedente vs desarrollo durante seguimiento | Outcome incierto | Definir aplicabilidad, ventana y criterio de nuevo desarrollo |
| C13 | Dispensaciones previstas en regímenes diversos, >100% | Adherencia espuria | Reglas por régimen/cambio y manejo de ventanas sin dispensación esperada |
| C14 | Estratificación explícita solo inicial; cambio longitudinal solicitado | Reevaluaciones y comparación | Confirmar momentos/motivos y comparabilidad de versiones, no imponer por D |
| C15 | «Necesidad de factor» y «modificación de pauta» sin dominio exacto | Campos adicionales podrían inventarse | IP define respuesta, periodo y granularidad mínima |
| C16 | Grado de implementación CMO mencionado sin herramienta | Índice de fidelidad inventado | Aprobar medida o limitar a proceso descriptivo |
| C17 | Diagnóstico EVW subtipos en antecedentes, no variables CRD | Exceso de campos | No incluir salvo enmienda/confirmación explícita |
| C18 | Motivos de pérdida, retirada y uso posterior no detallados | Privacidad/cierre/evaluable | Consentimiento aprobado y plan de datos; no inventar outcomes |
| C19 | «Mejora» para subgrupos sin definición de respondedor individual | Etiquetas clínicas no justificadas | Estadístico/IP define fuera de app; 1 punto del cálculo muestral no se adopta automáticamente |
| C20 | Formulario/taxonomía M no aportados y herramientas externas citadas | No hay contenido implementable seguro | Fuente aprobada antes de programar; no inferir de artifact citado |

Dependencias técnicas: autorización futura por aplicación, tablas/RLS/bucket/auditoría separados, historial de migraciones canónico y tests de aislamiento del documento previo. Su aceptación provisional no autoriza ejecución. Dependencias de gobierno: aprobación ética, CRD, licencias/versiones de instrumentos, formación homogénea y definiciones analíticas/retención. Configuración, límites del plan y callbacks: REQUIERE VERIFICACIÓN EN SUPABASE.

## 17. Roadmap de construcción propuesto

1. **Cerrar especificación:** recibir M correcto; resolver C01–C20 prioritarias; aprobar CRD y diccionario con trazabilidad. Sin esto no hay motor clínico implementable.
2. **Diseño técnico del nuevo repo:** mapa de componentes, contratos `coag_*`, roles y acceso, versionado, metodología de testing; sin cambiar DERMAPEX.
3. **Infraestructura futura autorizada:** separación/gates y regresión conforme a arquitectura previa; solo después de autorización explícita y pruebas en entorno aislado.
4. **Núcleo COAMO:** navegación, centros, pacientes, elegibilidad/consentimiento, basal/final, estados y missing; pruebas contra diccionario.
5. **Contenido clínico e instrumentos:** CRD de P, tratamientos/dispensación, cuestionarios oficiales, puntuaciones reproducibles y exportación de crudos.
6. **CMO validado:** catálogo/motor/reglas y casos de referencia M, plan e intervenciones; resultados por ítem y versión.
7. **Longitudinalidad:** contactos, cambios de tratamiento/prioridad aprobados, ventana final, incidencias y pérdidas.
8. **Dashboard/informes/exportación:** denominadores y pares IEXPAC, datasets completos, privacidad, pruebas SPSS y coherencia con fuente.
9. **Piloto ficticio y validación:** investigadores/coordinación, casos missing y límites, mobile/responsive, aislamiento y regresión DERMAPEX. Sin paciente real hasta aprobación.
10. **Versión completa:** automatizaciones/integraciones únicamente con justificación y autorización, sin ampliar clínica por analogía.

Pruebas futuras: elegibilidad (≥18, exclusiones, consentimiento), cálculos IEXPAC, 3L/EVA, Morisky/EVASAF aprobados, missing, denominador dispensación cero, ventana final, historial y duplicados; motor CMO cuando exista M; seguridad SQL/REST/RPC/Storage; exportaciones con n/keys coherentes. No se ejecutan pruebas de un COAMO que todavía no se ha implementado.

## 18. Conclusiones operativas: los 13 puntos de cierre

### 1. Porcentaje estimado de reutilización DERMAPEX

**Estimación de planificación: 45–60% de reutilización total de arquitectura/componentes**, contando adaptación, no porcentaje de código demostrado. Aproximadamente 15–25% del esfuerzo total podría reutilizarse casi sin cambios en utilidades/UI y otro 30–35% aprovecharía patrones con adaptación. No sumar rangos como métrica empírica ni afirmar que el 60% del código está validado. Estimación basada en la matriz de áreas, pendiente de recalcular al recibir M y cerrar el CRD; clínica y seguridad no se heredan por porcentaje.

### 2. Componentes reutilizables sin cambios

Primitivas UI genéricas y estados de carga/vacío/error, herramientas de serialización/descarga y partes puras de escritura SPSS tras probar su contrato. Revisar integración, accesibilidad, dependencias y literales: «sin cambios» no cubre los services que apuntan a tablas DERMAPEX.

### 3. Componentes reutilizables con adaptación

Layout/navegación responsive, Auth/callbacks, selector de centro, fichas/listados, timeline, formularios/versionado de cuestionarios, gráficos, PDFs, exportación paginada, documentos y patrón de auditoría. IEXPAC puede compartir fórmula; EVASAF/Morisky requieren aprobar versión/reglas; CMO comparte arquitectura, no contenidos. EQ-5D debe convertirse realmente en 3L mediante instrumento oficial.

### 4. Componentes nuevos

CRD de coagulopatía, clínica/sangrados/PK, tratamiento hemostático y dispensación, inclusión específica, datos faltantes por aplicabilidad, agenda por prioridad, plan CMO validado, catálogo propio, pares IEXPAC y dashboard COAMO. Fuente de verdad: P y futuro M, no PDF de migraña.

### 5. Funcionalidades DERMAPEX que deben eliminarse del nuevo COAMO

DLQI, PAM-10 no protocolizado, contenidos dermatológicos, motor/cortes/reglas DERMAPEX, study_arm/brazo estándar y enmascarado, alertas universales 90 días, batería conjunta de seis cuestionarios, código DPX y calendario rígido de visitas trimestrales. «Eliminar» es excluir de COAMO; DERMAPEX permanece intacto.

### 6. Modelo conceptual COAMO

Familia independiente `coag_*`: usuarios/centros → pacientes/elegibilidad/consentimiento → basal/visitas/contactos → clínica/tratamiento/dispensación → CMO versionado/plan/intervenciones → instrumentos/resultados → seguimiento/calidad/documentos/auditoría/exportaciones. Relaciones y diccionario en secciones 6 y 11; sin SQL, sin joins clínicos entre aplicaciones.

### 7. Flujo completo del investigador

**LOGIN → AUTORIZACIÓN COAMO → CENTRO → PACIENTE SEUDONIMIZADO → ELEGIBILIDAD Y CONSENTIMIENTO → INCLUSIÓN → BASAL → ESTRATIFICACIÓN CMO VALIDADA → PLAN DE ATENCIÓN → SEGUIMIENTO SEGÚN PRIORIDAD → CONTACTOS/INTERVENCIONES → CUESTIONARIOS EN MOMENTOS REQUERIDOS → VISITA FINAL → REVISIÓN DE CALIDAD → DASHBOARD → EXPORTACIÓN.**

IEXPAC basal debe reflejar antes de la aplicación del modelo; definir orden con IP. Cuestionarios basales se recogen también en basal, no solo después del seguimiento. P3 puede transitar basal→final sin visita intermedia protocolizada; los contactos por necesidad siguen siendo registrables. Cada paso distingue borrador, completado y dato faltante justificado.

### 8. Roadmap de construcción

Fuente M/CRD y decisiones → diseño nuevo repo → infraestructura separada autorizada → núcleo/elegibilidad → clínica/cuestionarios → CMO/intervenciones → longitudinalidad → resultados/exportación → piloto ficticio → lanzamiento aprobado. Ninguna etapa autoriza tocar Supabase ahora.

### 9. Dependencias

Documento CMO correcto, IP/estadístico, instrumento oficial/licencias, comité ético/consentimiento, centros y calendario confirmados, política de retención y asignación de roles. Posteriormente: infraestructura común segura con datos COAG independientes, tests y restauración. No usar servicio privilegiado desde navegador ni credenciales IRIS.

### 10. Dudas o contradicciones entre protocolo y modelo

No se puede cotejar P con el modelo CMO de coagulopatías porque el aportado es de migraña. Esta es la limitación principal, no una discrepancia de umbral resoluble. Además existen contradicciones internas P: centros, redondeo muestral, calendario individual/global y apoyo para cuestionarios, junto a diferencias claras con D (3L/5L, instrumentos y seguimiento). Registro detallado C01–C20.

### 11. Decisiones clínicas que requieren confirmación antes de programar

Ítems/puntos/cortes/reglas CMO; intervalos P1/P2 y reestratificación; catálogo por prioridad; versión y condicionales IEXPAC; resumen EVASAF; clave/alcance Morisky; 3L/tarifa; ventanas sangrados/inhibidores, PK/unidades, pauta y dispensaciones; asistencia en cuestionarios; pérdidas/evaluable y uso de datos tras retirada. No suplirlas con defaults heredados.

### 12. Propuesta de MVP

MVP **clínicamente útil**, no un clon visual: login/autorización/centros, alta seudonimizada con elegibilidad/consentimiento, CRD basal/final de P, tratamientos e historial mínimo, dispensación agregada B/F, cuatro instrumentos aprobados, CMO validado con plan y registro de intervenciones/contactos, missing/pérdidas, auditoría, dashboard operativo/IEXPAC y exportación estadística reproducible. Seguridad y validación no son opcionales.

No diferir IEXPAC principal, final a 12 meses ni modelo CMO si se pretende usar el MVP en el estudio. Hasta recibir M solo es viable un diseño/prototipo no clínico con ese módulo explícitamente bloqueado; no llamarlo MVP listo para reclutar.

### 13. Propuesta de versión completa

Añadir gestión de queries/cierre más rica, vistas longitudinales completas y transiciones CMO, informes revisados por profesionales, filtros de calidad por centro, exportaciones/versiones congeladas, administración operativa aprobada y mejor soporte de contactos/telefarmacia corporativa. Captura por episodio de sangrado, integración de dispensaciones o cálculo de utilidad EQ-5D solo si se aprueban necesidad, especificación y licencias; no son ampliaciones automáticas. Mantener los análisis inferenciales externos a la app.

**Estado final:** blueprint funcional y diccionario P preparados; diseño clínico CMO incompleto por documento fuente incorrecto y decisiones IP pendientes. No se ha implementado COAMO ni aplicado la arquitectura Supabase. El siguiente insumo necesario es la adaptación CMO a coagulopatías congénitas correcta, no la de migraña.
