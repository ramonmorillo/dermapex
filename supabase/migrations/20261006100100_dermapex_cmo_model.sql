-- DERMAPEX · 08 · Modelo CMO-DERMAPEX versionado: versiones de modelo y catálogo de variables.
--
-- Modelo = CMO-MAPEX para enfermedades inmunomediadas, subtipo DERMATOLÓGICO, sin cambios en
-- variables, pesos, umbrales ni regla de embarazo. Fuente:
--   ramonmorillo/cmoinmunomediadas @ 227e444d2da1a6dcffe1c99f3afafb894297e483 (assets/modules/config.js)
-- Más una variable INFORMATIVA DERMAPEX (decisión D3 · PENDIENTE VALIDACIÓN IP) que no puntúa.
--
-- Principio de versionado: un modelo NUNCA se sobrescribe. El contenido de cmo_model_versions y de
-- cmo_variable_catalog es inmutable (solo se puede activar/retirar). Un cambio de variables, pesos o
-- umbrales exige una versión nueva (nuevas filas con otro model_version) en una migración nueva.
--
-- La semilla JSON (entre los marcadores BEGIN/END) es la misma que src/constants/cmoDermapexModel.ts:
-- tests/cmoModelFidelity.test.ts compara ambos y los compara con la fuente congelada.

-- ── Versiones del modelo ────────────────────────────────────────────────────

create table public.cmo_model_versions (
  model_version text primary key,
  engine_version text not null,
  subtype text not null check (subtype = 'dermatologica'),
  source_repository text not null,
  source_commit text not null check (source_commit ~ '^[0-9a-f]{40}$'),
  level1_min_score numeric(6,2) not null,
  level2_min_score numeric(6,2) not null check (level2_min_score < level1_min_score),
  special_rule_codes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'retired')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.cmo_model_versions is
  'Versiones inmutables del modelo CMO-DERMAPEX (variables y umbrales) y del motor que las calcula. Solo status es modificable.';
comment on column public.cmo_model_versions.engine_version is
  'Versión del motor (src/services/cmoScoringEngine.ts, CMO_ENGINE_VERSION) que debe producir las puntuaciones de este modelo.';

create trigger trg_cmo_model_versions_updated_at
before update on public.cmo_model_versions
for each row execute function app_private.set_updated_at();

-- ── Catálogo de variables: columnas del modelo ──────────────────────────────

alter table public.cmo_variable_catalog
  drop constraint cmo_variable_catalog_variable_code_key,
  add column block text check (block is null or block in ('demografica', 'sociosanitaria', 'clinica', 'farmacoterapeutica', 'especifica', 'informativa')),
  add column sort_order integer,
  add column value_type text check (value_type is null or value_type in ('boolean', 'select', 'derived_age')),
  add column options jsonb not null default '[]'::jsonb,
  add column is_scored boolean not null default true,
  add column definition text,
  add column criteria text,
  add column cmo_dimension text check (cmo_dimension is null or cmo_dimension in ('capacidad', 'motivacion', 'oportunidad')),
  add column special_rule text check (special_rule is null or special_rule = 'pregnancy_trigger'),
  add constraint cmo_variable_catalog_model_version_fkey
    foreign key (model_version) references public.cmo_model_versions(model_version) on delete restrict,
  add constraint cmo_variable_catalog_code_version_key unique (variable_code, model_version),
  add constraint cmo_variable_catalog_options_array check (jsonb_typeof(options) = 'array'),
  add constraint cmo_variable_catalog_informative_unscored check ((block = 'informativa') = (not is_scored));

comment on column public.cmo_variable_catalog.variable_code is
  'Código de variable = id de la fuente (cmoinmunomediadas/config.js) para trazabilidad directa. edad_grupo es derivada; conservacion_especial es la variable informativa DERMAPEX (D3).';
comment on column public.cmo_variable_catalog.options is
  'Valores admitidos y puntos: [{value, label, points}] (edad: además min/max en años). «unknown» (D1) siempre admitido y puntúa 0.';
comment on column public.cmo_variable_catalog.is_scored is
  'false = variable informativa: se registra pero no entra en el total (D3).';

-- Inmutabilidad: solo is_active puede cambiar (y updated_at, que se sella solo).
create or replace function app_private.enforce_model_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable text[] := case tg_table_name
    when 'cmo_model_versions' then array['status', 'updated_at']
    else array['is_active', 'updated_at']
  end;
begin
  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'El modelo CMO es inmutable (%): cree una versión nueva en lugar de modificarlo.', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger trg_cmo_model_versions_immutable
before update on public.cmo_model_versions
for each row execute function app_private.enforce_model_immutability();

create trigger trg_cmo_variable_catalog_immutable
before update on public.cmo_variable_catalog
for each row execute function app_private.enforce_model_immutability();

create trigger trg_cmo_model_versions_audit after insert or update or delete on public.cmo_model_versions
for each row execute function app_private.write_audit_log();

-- La auditoría genérica espera una columna id uuid; cmo_model_versions usa clave texto: row_id queda null
-- y la clave figura en new_data/old_data.

alter table public.cmo_model_versions enable row level security;
revoke all on public.cmo_model_versions from anon;
revoke truncate, references, trigger on public.cmo_model_versions from authenticated;

create policy cmo_model_versions_select on public.cmo_model_versions for select to authenticated
  using (app_private.is_active_user());
create policy cmo_model_versions_write on public.cmo_model_versions for all to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());

-- ── Semilla: modelo cmo-derma-model-1.0.0+src.227e444 ───────────────────────

insert into public.cmo_model_versions (
  model_version, engine_version, subtype, source_repository, source_commit,
  level1_min_score, level2_min_score, special_rule_codes, notes
) values (
  'cmo-derma-model-1.0.0+src.227e444',
  'cmo-dermapex-1.0.0+src.227e444',
  'dermatologica',
  'https://github.com/ramonmorillo/cmoinmunomediadas',
  '227e444d2da1a6dcffe1c99f3afafb894297e483',
  31, 18,
  array['embarazada', 'deseo_embarazo'],
  'Modelo CMO-MAPEX inmunomediadas, subtipo dermatológico, sin cambios (protocolo DERMAPEX v0.5, 5.4.3-5.4.4). Nivel: >=31 -> 1; 18-30 -> 2; <=17 -> 3; embarazo o deseo gestacional = si -> 1. Añade la variable informativa conservacion_especial (D3). Decisiones D1-D8 PENDIENTE VALIDACIÓN IP.'
);

insert into public.cmo_variable_catalog (
  variable_code, label, domain, model_version, block, sort_order, value_type, options, is_scored,
  definition, criteria, cmo_dimension, special_rule
)
select r.variable_code, r.label, r.block, 'cmo-derma-model-1.0.0+src.227e444', r.block, r.sort_order, r.value_type,
       r.options, r.is_scored, r.definition, r.criteria, r.cmo_dimension, r.special_rule
  from jsonb_to_recordset(
-- BEGIN CMO_VARIABLES_JSON
$json$[
{"variable_code":"edad_grupo","label":"Grupo de edad","block":"demografica","sort_order":1,"value_type":"derived_age","definition":"Derivada automáticamente de la edad del paciente (patients.age_at_inclusion) con AGE_GROUPS de la fuente.","criteria":null,"options":[{"value":"≤12","label":"≤ 12 años","points":1,"min":0,"max":12},{"value":"13-17","label":"13-17 años","points":3,"min":13,"max":17},{"value":"18-69","label":"18-69 años","points":2,"min":18,"max":69},{"value":"≥70","label":"≥ 70 años","points":2,"min":70,"max":200}],"cmo_dimension":null,"special_rule":null,"is_scored":true},
{"variable_code":"sexo_mujer","label":"Sexo femenino","block":"demografica","sort_order":2,"value_type":"boolean","definition":"El paciente es de sexo femenino.","criteria":"Marcar \"Sí\" solo si consta explícitamente en el texto que el paciente es mujer.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":1}],"cmo_dimension":null,"special_rule":null,"is_scored":true},
{"variable_code":"peso_obesidad","label":"Obesidad (IMC ≥30 kg/m²)","block":"demografica","sort_order":3,"value_type":"boolean","definition":"El paciente presenta obesidad, con un IMC igual o superior a 30 kg/m².","criteria":"Marcar \"Sí\" solo si el IMC ≥30 consta explícitamente, o si el texto menciona \"obesidad\" de forma expresa.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":null,"special_rule":null,"is_scored":true},
{"variable_code":"embarazada","label":"Embarazada","block":"demografica","sort_order":4,"value_type":"boolean","definition":"La paciente está embarazada en el momento de la evaluación.","criteria":"Marcar \"Sí\" solo si el embarazo consta explícitamente.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":null,"special_rule":"pregnancy_trigger","is_scored":true},
{"variable_code":"deseo_embarazo","label":"Deseo gestacional","block":"demografica","sort_order":5,"value_type":"boolean","definition":"La paciente expresa deseo de quedarse embarazada próximamente.","criteria":"Marcar \"Sí\" solo si el deseo gestacional consta explícitamente referido por la paciente o el equipo clínico.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":null,"special_rule":"pregnancy_trigger","is_scored":true},
{"variable_code":"alcoholismo_drogas","label":"Alcoholismo y/o drogadicción","block":"sociosanitaria","sort_order":6,"value_type":"boolean","definition":"Consumo problemático de alcohol y/o de otras sustancias.","criteria":"Marcar \"Sí\" solo si hay mención explícita de consumo de riesgo, abuso o dependencia de alcohol u otras drogas.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"tabaquismo","label":"Tabaquismo","block":"sociosanitaria","sort_order":7,"value_type":"boolean","definition":"El paciente es fumador activo.","criteria":"Marcar \"Sí\" solo si consta consumo activo de tabaco.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"barreras_comunicacion","label":"Barreras de comunicación","block":"sociosanitaria","sort_order":8,"value_type":"boolean","definition":"Barreras idiomáticas, culturales o cognitivas que dificultan la comunicación clínica.","criteria":"Marcar \"Sí\" solo si el texto menciona explícitamente dificultades de idioma, comprensión o comunicación.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"sin_soporte_social","label":"Sin soporte social/familiar","block":"sociosanitaria","sort_order":9,"value_type":"boolean","definition":"Ausencia de red de apoyo social o familiar.","criteria":"Marcar \"Sí\" solo si consta explícitamente que el paciente vive solo sin apoyo, o carece de soporte familiar/social.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"situacion_laboral_dificil","label":"Actividad laboral dificulta el cumplimiento","block":"sociosanitaria","sort_order":10,"value_type":"boolean","definition":"La situación laboral del paciente dificulta el cumplimiento del tratamiento o el seguimiento.","criteria":"Marcar \"Sí\" solo si se menciona explícitamente incompatibilidad horaria/laboral con el tratamiento o las visitas.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"calidad_vida_baja","label":"Calidad de vida disminuida","block":"sociosanitaria","sort_order":11,"value_type":"boolean","definition":"Calidad de vida relacionada con la salud disminuida (p. ej. escalas DLQI, SIBDQ, AIMS).","criteria":"Marcar \"Sí\" solo si consta una puntuación de escala de calidad de vida alterada, o una afirmación explícita de calidad de vida disminuida.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"motivacion","special_rule":null,"is_scored":true},
{"variable_code":"problemas_psicologicos","label":"Problemas psicológicos/psiquiátricos","block":"sociosanitaria","sort_order":12,"value_type":"boolean","definition":"Ansiedad, depresión u otro problema psiquiátrico relevante.","criteria":"Marcar \"Sí\" solo si hay diagnóstico, tratamiento o mención clínica explícita de ansiedad, depresión u otro trastorno psiquiátrico.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"motivacion","special_rule":null,"is_scored":true},
{"variable_code":"deterioro_cognitivo_funcional","label":"Deterioro cognitivo o dependencia funcional","block":"sociosanitaria","sort_order":13,"value_type":"boolean","definition":"Deterioro cognitivo o dependencia funcional relevante (p. ej. Pfeiffer, Katz).","criteria":"Marcar \"Sí\" solo si consta una prueba/escala alterada o una mención clínica explícita de deterioro cognitivo o dependencia para actividades básicas.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"comorbilidades_2mas","label":"≥2 enfermedades crónicas complejas","block":"clinica","sort_order":14,"value_type":"boolean","definition":"El paciente presenta dos o más enfermedades crónicas complejas además de la EI.","criteria":"Marcar \"Sí\" solo si se listan explícitamente 2 o más comorbilidades crónicas relevantes.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"insuficiencia_renal_hepatica","label":"Insuficiencia renal o hepática","block":"clinica","sort_order":15,"value_type":"boolean","definition":"Insuficiencia renal o hepática diagnosticada.","criteria":"Marcar \"Sí\" solo si consta el diagnóstico explícito o datos analíticos compatibles claramente descritos como insuficiencia renal/hepática.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"multidisciplinariedad","label":"≥2 especialistas por órganos afectados","block":"clinica","sort_order":16,"value_type":"boolean","definition":"El paciente es seguido por dos o más especialistas debido a afectación de distintos órganos.","criteria":"Marcar \"Sí\" solo si se mencionan explícitamente ≥2 especialidades médicas implicadas en el seguimiento.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"hospitalizaciones_urgencias","label":"≥1 ingreso/urgencias en los últimos 2 meses","block":"clinica","sort_order":17,"value_type":"boolean","definition":"Al menos un ingreso hospitalario o visita a urgencias en los últimos 2 meses.","criteria":"Marcar \"Sí\" solo si consta explícitamente un ingreso o visita a urgencias con fecha compatible con los últimos 2 meses.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"actividad_enfermedad","label":"Actividad moderada/alta de la enfermedad","block":"clinica","sort_order":18,"value_type":"boolean","definition":"La enfermedad inmunomediada de base presenta actividad moderada o alta (índices de actividad, brote clínico).","criteria":"Marcar \"Sí\" solo si consta un índice de actividad compatible con actividad moderada/alta, o una descripción clínica explícita de brote/actividad no controlada.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"naive_terapia","label":"Naïve a terapia hospitalaria","block":"farmacoterapeutica","sort_order":19,"value_type":"boolean","definition":"El paciente inicia por primera vez un tratamiento de dispensación hospitalaria para la EI.","criteria":"Marcar \"Sí\" solo si el texto indica explícitamente que es la primera vez que recibe este tipo de tratamiento.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":4}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"polimedicacion","label":"Polimedicación (≥6 medicamentos)","block":"farmacoterapeutica","sort_order":20,"value_type":"boolean","definition":"El paciente toma 6 o más medicamentos de forma simultánea.","criteria":"Marcar \"Sí\" solo si se puede contar o se menciona explícitamente un número de medicamentos ≥6.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"modificacion_regimen","label":"Modificación del tratamiento en los últimos 6 meses","block":"farmacoterapeutica","sort_order":21,"value_type":"boolean","definition":"El régimen terapéutico se ha modificado en los últimos 6 meses.","criteria":"Marcar \"Sí\" solo si consta explícitamente un cambio de tratamiento con fecha compatible con los últimos 6 meses.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"medicamento_alto_riesgo","label":"Medicamento de alto riesgo (ISMP)","block":"farmacoterapeutica","sort_order":22,"value_type":"boolean","definition":"El tratamiento incluye un medicamento considerado de alto riesgo según ISMP.","criteria":"Marcar \"Sí\" solo si el medicamento descrito corresponde a la lista de alto riesgo ISMP o se menciona explícitamente como tal.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"interacciones","label":"Riesgo de interacción clínicamente relevante","block":"farmacoterapeutica","sort_order":23,"value_type":"boolean","definition":"Existe riesgo de interacción farmacológica clínicamente relevante.","criteria":"Marcar \"Sí\" solo si el texto menciona explícitamente una interacción, o si la combinación de fármacos descrita es una interacción clínicamente relevante conocida y evidente.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"reacciones_adversas","label":"Reacciones adversas en el último año","block":"farmacoterapeutica","sort_order":24,"value_type":"boolean","definition":"El paciente ha presentado alguna reacción adversa a la medicación en el último año.","criteria":"Marcar \"Sí\" solo si consta explícitamente una reacción adversa con fecha compatible con el último año.","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":3}],"cmo_dimension":"capacidad","special_rule":null,"is_scored":true},
{"variable_code":"falta_adherencia","label":"Falta de adherencia","block":"farmacoterapeutica","sort_order":25,"value_type":"boolean","definition":"El paciente presenta falta de adherencia al tratamiento.","criteria":"Marcar \"Sí\" solo si hay una afirmación explícita de dosis olvidadas, incumplimiento, o una medida objetiva de baja adherencia. La ausencia de información sobre adherencia NO equivale a buena adherencia ni a mala adherencia: en ese caso debe quedar \"no consta información suficiente\".","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":4}],"cmo_dimension":"motivacion","special_rule":null,"is_scored":true},
{"variable_code":"medicamento_reciente","label":"Medicamento comercializado hace menos de 1 año","block":"farmacoterapeutica","sort_order":26,"value_type":"boolean","definition":"El tratamiento incluye un medicamento comercializado hace menos de un año.","criteria":"Marcar \"Sí\" solo si consta explícitamente que el medicamento es de comercialización reciente (<1 año).","options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":2}],"cmo_dimension":"oportunidad","special_rule":null,"is_scored":true},
{"variable_code":"comorbilidades_cv_diabetes","label":"Comorbilidades cardiovasculares / síndrome metabólico / diabetes","block":"especifica","sort_order":27,"value_type":"select","definition":"Número de comorbilidades cardiovasculares, de síndrome metabólico o diabetes asociadas.","criteria":"Seleccionar \"una\" o \"más de una\" solo si constan explícitamente diagnosticadas; si no hay mención, dejar sin determinar (no asumir ausencia).","options":[{"value":"ninguna","label":"Sin estas comorbilidades","points":0},{"value":"una","label":"Tiene una","points":1},{"value":"mas-una","label":"Tiene más de una","points":2}],"cmo_dimension":null,"special_rule":null,"is_scored":true},
{"variable_code":"conservacion_especial","label":"Requisitos especiales de conservación","block":"informativa","sort_order":28,"value_type":"boolean","definition":"Variable informativa del protocolo DERMAPEX (decisión D3). Informativa, no puntúa.","criteria":null,"options":[{"value":"no","label":"No","points":0},{"value":"si","label":"Sí","points":0}],"cmo_dimension":null,"special_rule":null,"is_scored":false}
]$json$
-- END CMO_VARIABLES_JSON
  ::jsonb) as r(
    variable_code text, label text, block text, sort_order integer, value_type text, options jsonb,
    is_scored boolean, definition text, criteria text, cmo_dimension text, special_rule text
  );
