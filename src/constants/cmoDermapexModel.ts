// Modelo CMO-DERMAPEX = modelo CMO-MAPEX para enfermedades inmunomediadas, subtipo DERMATOLÓGICO.
//
// PORT LITERAL de la fuente clínica (solo datos, sin lógica):
//   ramonmorillo/cmoinmunomediadas @ 227e444d2da1a6dcffe1c99f3afafb894297e483
//   assets/modules/config.js → BLOCKS, AGE_GROUPS, PRIORITY_THRESHOLDS y FIELD_DEFINITIONS filtradas
//   con fieldsForDiseaseType('dermatologica').
// Etiquetas, definiciones, criterios, valores y pesos copiados sin reescribir (generados desde la
// fuente y verificados en tests/cmoModelFidelity.test.ts contra tests/reference/). Los bloques
// músculo-esquelético y gastrointestinal NO se portan.
//
// No modificar variables, pesos ni umbrales aquí: cualquier cambio exige una versión nueva del
// modelo (CMO_MODEL_VERSION), una migración nueva de cmo_variable_catalog y revisión de la IP.
// La única adición DERMAPEX es la variable INFORMATIVA de la decisión D3 (no puntúa).

export const CMO_SOURCE = {
  repository: 'https://github.com/ramonmorillo/cmoinmunomediadas',
  commit: '227e444d2da1a6dcffe1c99f3afafb894297e483',
  commitShort: '227e444',
  subtype: 'dermatologica',
} as const;

/** Versión del modelo clínico (variables, pesos, umbrales). Se guarda en cmo_variable_catalog y cmo_scores. */
export const CMO_MODEL_VERSION = `cmo-derma-model-1.0.0+src.${CMO_SOURCE.commitShort}`;

export type CmoBlockId = 'demografica' | 'sociosanitaria' | 'clinica' | 'farmacoterapeutica' | 'especifica';

export type CmoBlockDefinition = {
  id: CmoBlockId;
  label: string;
  /** Máximo DECLARADO por la fuente (BLOCKS.maxPoints). Ver discrepancia DISC-1 en docs/DERMAPEX_CMO_ENGINE.md. */
  declaredMaxPoints: number;
};

export type CmoAgeGroup = { value: string; label: string; points: number; min: number; max: number };

export type CmoOption = { value: string; label: string; points: number };

export type CmoAnswerFieldDefinition = {
  code: string;
  block: CmoBlockId;
  valueType: 'boolean' | 'select';
  label: string;
  definition: string;
  criteria: string;
  options: ReadonlyArray<CmoOption>;
  cmoDimension: 'capacidad' | 'motivacion' | 'oportunidad' | null;
  specialRule: 'pregnancy_trigger' | null;
};

/** Código de la variable derivada de edad (id usado por la fuente en contributingFactors). */
export const AGE_GROUP_CODE = 'edad_grupo';
export const AGE_GROUP_LABEL = 'Grupo de edad';

// ── Datos generados desde config.js (no editar a mano) ──────────────────────

export const CMO_BLOCKS: ReadonlyArray<CmoBlockDefinition> = [
  { id: 'demografica', label: 'Variables demográficas', declaredMaxPoints: 9 },
  { id: 'sociosanitaria', label: 'Variables sociosanitarias', declaredMaxPoints: 21 },
  { id: 'clinica', label: 'Variables clínicas', declaredMaxPoints: 14 },
  { id: 'farmacoterapeutica', label: 'Variables farmacoterapéuticas', declaredMaxPoints: 25 },
  { id: 'especifica', label: 'Variables específicas según tipo de EI', declaredMaxPoints: 2 },
];

export const CMO_AGE_GROUPS: ReadonlyArray<CmoAgeGroup> = [
  { value: '≤12', label: '≤ 12 años', points: 1, min: 0, max: 12 },
  { value: '13-17', label: '13-17 años', points: 3, min: 13, max: 17 },
  { value: '18-69', label: '18-69 años', points: 2, min: 18, max: 69 },
  { value: '≥70', label: '≥ 70 años', points: 2, min: 70, max: 200 },
];

export const CMO_LEVEL_THRESHOLDS_SOURCE = { level1: 31, level2: 18 } as const;

export const CMO_ANSWER_FIELDS: ReadonlyArray<CmoAnswerFieldDefinition> = [
  {
    code: 'sexo_mujer',
    block: 'demografica',
    valueType: 'boolean',
    label: 'Sexo femenino',
    definition: 'El paciente es de sexo femenino.',
    criteria: 'Marcar "Sí" solo si consta explícitamente en el texto que el paciente es mujer.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 1 },
    ],
    cmoDimension: null,
    specialRule: null,
  },
  {
    code: 'peso_obesidad',
    block: 'demografica',
    valueType: 'boolean',
    label: 'Obesidad (IMC ≥30 kg/m²)',
    definition: 'El paciente presenta obesidad, con un IMC igual o superior a 30 kg/m².',
    criteria: 'Marcar "Sí" solo si el IMC ≥30 consta explícitamente, o si el texto menciona "obesidad" de forma expresa.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: null,
    specialRule: null,
  },
  {
    code: 'embarazada',
    block: 'demografica',
    valueType: 'boolean',
    label: 'Embarazada',
    definition: 'La paciente está embarazada en el momento de la evaluación.',
    criteria: 'Marcar "Sí" solo si el embarazo consta explícitamente.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: null,
    specialRule: 'pregnancy_trigger',
  },
  {
    code: 'deseo_embarazo',
    block: 'demografica',
    valueType: 'boolean',
    label: 'Deseo gestacional',
    definition: 'La paciente expresa deseo de quedarse embarazada próximamente.',
    criteria: 'Marcar "Sí" solo si el deseo gestacional consta explícitamente referido por la paciente o el equipo clínico.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: null,
    specialRule: 'pregnancy_trigger',
  },
  {
    code: 'alcoholismo_drogas',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Alcoholismo y/o drogadicción',
    definition: 'Consumo problemático de alcohol y/o de otras sustancias.',
    criteria: 'Marcar "Sí" solo si hay mención explícita de consumo de riesgo, abuso o dependencia de alcohol u otras drogas.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'tabaquismo',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Tabaquismo',
    definition: 'El paciente es fumador activo.',
    criteria: 'Marcar "Sí" solo si consta consumo activo de tabaco.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'barreras_comunicacion',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Barreras de comunicación',
    definition: 'Barreras idiomáticas, culturales o cognitivas que dificultan la comunicación clínica.',
    criteria: 'Marcar "Sí" solo si el texto menciona explícitamente dificultades de idioma, comprensión o comunicación.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'sin_soporte_social',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Sin soporte social/familiar',
    definition: 'Ausencia de red de apoyo social o familiar.',
    criteria: 'Marcar "Sí" solo si consta explícitamente que el paciente vive solo sin apoyo, o carece de soporte familiar/social.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'situacion_laboral_dificil',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Actividad laboral dificulta el cumplimiento',
    definition: 'La situación laboral del paciente dificulta el cumplimiento del tratamiento o el seguimiento.',
    criteria: 'Marcar "Sí" solo si se menciona explícitamente incompatibilidad horaria/laboral con el tratamiento o las visitas.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'calidad_vida_baja',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Calidad de vida disminuida',
    definition: 'Calidad de vida relacionada con la salud disminuida (p. ej. escalas DLQI, SIBDQ, AIMS).',
    criteria: 'Marcar "Sí" solo si consta una puntuación de escala de calidad de vida alterada, o una afirmación explícita de calidad de vida disminuida.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'motivacion',
    specialRule: null,
  },
  {
    code: 'problemas_psicologicos',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Problemas psicológicos/psiquiátricos',
    definition: 'Ansiedad, depresión u otro problema psiquiátrico relevante.',
    criteria: 'Marcar "Sí" solo si hay diagnóstico, tratamiento o mención clínica explícita de ansiedad, depresión u otro trastorno psiquiátrico.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'motivacion',
    specialRule: null,
  },
  {
    code: 'deterioro_cognitivo_funcional',
    block: 'sociosanitaria',
    valueType: 'boolean',
    label: 'Deterioro cognitivo o dependencia funcional',
    definition: 'Deterioro cognitivo o dependencia funcional relevante (p. ej. Pfeiffer, Katz).',
    criteria: 'Marcar "Sí" solo si consta una prueba/escala alterada o una mención clínica explícita de deterioro cognitivo o dependencia para actividades básicas.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'comorbilidades_2mas',
    block: 'clinica',
    valueType: 'boolean',
    label: '≥2 enfermedades crónicas complejas',
    definition: 'El paciente presenta dos o más enfermedades crónicas complejas además de la EI.',
    criteria: 'Marcar "Sí" solo si se listan explícitamente 2 o más comorbilidades crónicas relevantes.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'insuficiencia_renal_hepatica',
    block: 'clinica',
    valueType: 'boolean',
    label: 'Insuficiencia renal o hepática',
    definition: 'Insuficiencia renal o hepática diagnosticada.',
    criteria: 'Marcar "Sí" solo si consta el diagnóstico explícito o datos analíticos compatibles claramente descritos como insuficiencia renal/hepática.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'multidisciplinariedad',
    block: 'clinica',
    valueType: 'boolean',
    label: '≥2 especialistas por órganos afectados',
    definition: 'El paciente es seguido por dos o más especialistas debido a afectación de distintos órganos.',
    criteria: 'Marcar "Sí" solo si se mencionan explícitamente ≥2 especialidades médicas implicadas en el seguimiento.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'hospitalizaciones_urgencias',
    block: 'clinica',
    valueType: 'boolean',
    label: '≥1 ingreso/urgencias en los últimos 2 meses',
    definition: 'Al menos un ingreso hospitalario o visita a urgencias en los últimos 2 meses.',
    criteria: 'Marcar "Sí" solo si consta explícitamente un ingreso o visita a urgencias con fecha compatible con los últimos 2 meses.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'actividad_enfermedad',
    block: 'clinica',
    valueType: 'boolean',
    label: 'Actividad moderada/alta de la enfermedad',
    definition: 'La enfermedad inmunomediada de base presenta actividad moderada o alta (índices de actividad, brote clínico).',
    criteria: 'Marcar "Sí" solo si consta un índice de actividad compatible con actividad moderada/alta, o una descripción clínica explícita de brote/actividad no controlada.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'naive_terapia',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Naïve a terapia hospitalaria',
    definition: 'El paciente inicia por primera vez un tratamiento de dispensación hospitalaria para la EI.',
    criteria: 'Marcar "Sí" solo si el texto indica explícitamente que es la primera vez que recibe este tipo de tratamiento.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 4 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'polimedicacion',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Polimedicación (≥6 medicamentos)',
    definition: 'El paciente toma 6 o más medicamentos de forma simultánea.',
    criteria: 'Marcar "Sí" solo si se puede contar o se menciona explícitamente un número de medicamentos ≥6.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'modificacion_regimen',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Modificación del tratamiento en los últimos 6 meses',
    definition: 'El régimen terapéutico se ha modificado en los últimos 6 meses.',
    criteria: 'Marcar "Sí" solo si consta explícitamente un cambio de tratamiento con fecha compatible con los últimos 6 meses.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'medicamento_alto_riesgo',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Medicamento de alto riesgo (ISMP)',
    definition: 'El tratamiento incluye un medicamento considerado de alto riesgo según ISMP.',
    criteria: 'Marcar "Sí" solo si el medicamento descrito corresponde a la lista de alto riesgo ISMP o se menciona explícitamente como tal.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'interacciones',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Riesgo de interacción clínicamente relevante',
    definition: 'Existe riesgo de interacción farmacológica clínicamente relevante.',
    criteria: 'Marcar "Sí" solo si el texto menciona explícitamente una interacción, o si la combinación de fármacos descrita es una interacción clínicamente relevante conocida y evidente.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'reacciones_adversas',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Reacciones adversas en el último año',
    definition: 'El paciente ha presentado alguna reacción adversa a la medicación en el último año.',
    criteria: 'Marcar "Sí" solo si consta explícitamente una reacción adversa con fecha compatible con el último año.',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 3 },
    ],
    cmoDimension: 'capacidad',
    specialRule: null,
  },
  {
    code: 'falta_adherencia',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Falta de adherencia',
    definition: 'El paciente presenta falta de adherencia al tratamiento.',
    criteria: 'Marcar "Sí" solo si hay una afirmación explícita de dosis olvidadas, incumplimiento, o una medida objetiva de baja adherencia. La ausencia de información sobre adherencia NO equivale a buena adherencia ni a mala adherencia: en ese caso debe quedar "no consta información suficiente".',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 4 },
    ],
    cmoDimension: 'motivacion',
    specialRule: null,
  },
  {
    code: 'medicamento_reciente',
    block: 'farmacoterapeutica',
    valueType: 'boolean',
    label: 'Medicamento comercializado hace menos de 1 año',
    definition: 'El tratamiento incluye un medicamento comercializado hace menos de un año.',
    criteria: 'Marcar "Sí" solo si consta explícitamente que el medicamento es de comercialización reciente (<1 año).',
    options: [
      { value: 'no', label: 'No', points: 0 },
      { value: 'si', label: 'Sí', points: 2 },
    ],
    cmoDimension: 'oportunidad',
    specialRule: null,
  },
  {
    code: 'comorbilidades_cv_diabetes',
    block: 'especifica',
    valueType: 'select',
    label: 'Comorbilidades cardiovasculares / síndrome metabólico / diabetes',
    definition: 'Número de comorbilidades cardiovasculares, de síndrome metabólico o diabetes asociadas.',
    criteria: 'Seleccionar "una" o "más de una" solo si constan explícitamente diagnosticadas; si no hay mención, dejar sin determinar (no asumir ausencia).',
    options: [
      { value: 'ninguna', label: 'Sin estas comorbilidades', points: 0 },
      { value: 'una', label: 'Tiene una', points: 1 },
      { value: 'mas-una', label: 'Tiene más de una', points: 2 },
    ],
    cmoDimension: null,
    specialRule: null,
  },
];

// ── Variable informativa DERMAPEX (decisión D3 · PENDIENTE VALIDACIÓN IP) ───
// NO procede de la fuente: la añade el protocolo DERMAPEX. Se registra (sí/no/desconocido) pero NO
// puntúa y no entra en el total. Código, etiqueta y texto de ayuda propuestos por implementación.

export type CmoInformativeFieldDefinition = {
  code: string;
  label: string;
  definition: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export const CMO_INFORMATIVE_FIELDS: ReadonlyArray<CmoInformativeFieldDefinition> = [
  {
    code: 'conservacion_especial',
    label: 'Requisitos especiales de conservación',
    definition: 'Variable informativa del protocolo DERMAPEX (decisión D3). Informativa, no puntúa.',
    options: [
      { value: 'no', label: 'No' },
      { value: 'si', label: 'Sí' },
    ],
  },
];
