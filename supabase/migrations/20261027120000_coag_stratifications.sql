-- COAMO · 06 · Estratificación CMO de coagulopatías congénitas (registro propio por visita).
--
-- Fuente («M»): SEFH, «Adaptación del Modelo de Atención Farmacéutica CMO al paciente con coagulopatías
-- congénitas», v2.0 (aportado por el IP el 27/10/2026). Tablas 1-4 (pp. 12-16): 23 variables con pesos 1-4;
-- p. 17: puntos de corte 20 (Prioridad 2) y 28 (Prioridad 1), excepciones (terapia avanzada → P1;
-- < 18 años → modelo pediátrico); p. 19: el farmacéutico puede situar al paciente en un nivel superior.
-- Decisiones del IP: docs/coamo/COAMO_CMO_MODEL_SPEC.md §5 (07/10/2026: opciones acumulables, gravedad de
-- hemorragia literal, calidad de vida y adherencia por juicio profesional; 5.5: la estratificación BASAL define
-- la prioridad del análisis y las reestratificaciones se registran aparte con motivo) y 27/10/2026: se puede
-- estratificar en cualquier visita; las respuestas del modelo se guardan como registro propio (no se amplía el CRD).
--
-- Espejo exacto de src/domain/stratification.ts (frontend COAMO), probado con los mismos ejemplos
-- (tests/stratification.test.ts y db-tests/80_coag_stratifications.sql), incluido el caso clínico 1 de M
-- (31 puntos → Prioridad 1). Reglas de lectura documentadas en docs/ESTRATIFICACION_CMO.md (COAMO):
--   · 26 preguntas para 23 variables: «Cambios en el régimen», «Comorbilidades» y «Estilo de vida» tienen dos
--     descripciones que suman (única lectura compatible con los máximos 25/15/16 de M y con el caso clínico 1).
--   · Puntos de corte inclusivos (≥ 28 P1; ≥ 20 P2).
--   · Dato ausente ≠ 0: intervalo [mínimo, máximo]; la prioridad del modelo solo se asigna si ambos extremos
--     caen en el mismo nivel y constan la edad y la pregunta de terapia avanzada.
--   · Elevación de nivel solo hacia arriba y con motivo; nunca se baja el nivel del modelo.
--
-- La BD calcula la puntuación y la prioridad; el cliente solo escribe respuestas, propuestas (con su
-- procedencia), la visita de origen de los datos clínicos y la elevación con su motivo.

-- ── Especificación del modelo ───────────────────────────────────────────────

create or replace function coag_private.strat_spec()
returns table (ord integer, variable text, dimension text, option text, points integer, applies_to text[], exception text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ( 1, 'age', 'demographic', 'lt18', 0, null::text[], 'pediatric'),
    ( 1, 'age', 'demographic', '18_50', 1, null, 'pediatric'),
    ( 1, 'age', 'demographic', 'gt50', 2, null, 'pediatric'),
    ( 2, 'obesity', 'demographic', 'yes', 1, null, null),
    ( 2, 'obesity', 'demographic', 'no', 0, null, null),
    ( 3, 'inhibitors', 'clinical', 'yes', 3, null, null),
    ( 3, 'inhibitors', 'clinical', 'no', 0, null, null),
    ( 4, 'pain', 'clinical', 'none', 0, null, null),
    ( 4, 'pain', 'clinical', 'mild_moderate', 1, null, null),
    ( 4, 'pain', 'clinical', 'persistent', 2, null, null),
    ( 4, 'pain', 'clinical', 'acute', 3, null, null),
    ( 5, 'joint_status', 'clinical', 'yes', 3, null, null),
    ( 5, 'joint_status', 'clinical', 'no', 0, null, null),
    ( 6, 'bleeding_management', 'clinical', 'none', 0, null, null),
    ( 6, 'bleeding_management', 'clinical', 'hospital_admission', 2, null, null),
    ( 6, 'bleeding_management', 'clinical', 'outpatient', 3, null, null),
    ( 7, 'hemophilia_severity', 'clinical', 'mild', 0, array['HA', 'HB'], null),
    ( 7, 'hemophilia_severity', 'clinical', 'moderate', 1, array['HA', 'HB'], null),
    ( 7, 'hemophilia_severity', 'clinical', 'severe', 3, array['HA', 'HB'], null),
    ( 8, 'vwd_type', 'clinical', '1', 0, array['EVW'], null),
    ( 8, 'vwd_type', 'clinical', '2', 1, array['EVW'], null),
    ( 8, 'vwd_type', 'clinical', '3', 3, array['EVW'], null),
    ( 9, 'spontaneous_bleeds_gt2', 'clinical', 'yes', 4, null, null),
    ( 9, 'spontaneous_bleeds_gt2', 'clinical', 'no', 0, null, null),
    (10, 'comorbidity', 'clinical', 'yes', 1, null, null),
    (10, 'comorbidity', 'clinical', 'no', 0, null, null),
    (11, 'degenerative_joint', 'clinical', 'yes', 2, null, null),
    (11, 'degenerative_joint', 'clinical', 'no', 0, null, null),
    (12, 'psychological', 'clinical', 'yes', 3, null, null),
    (12, 'psychological', 'clinical', 'no', 0, null, null),
    (13, 'advanced_therapy', 'treatment', 'yes', 0, null, 'advanced_therapy'),
    (13, 'advanced_therapy', 'treatment', 'no', 0, null, 'advanced_therapy'),
    (14, 'route', 'treatment', 'sc_only', 0, null, null),
    (14, 'route', 'treatment', 'sc_iv', 1, null, null),
    (14, 'route', 'treatment', 'iv', 2, null, null),
    (15, 'dose_change', 'treatment', 'yes', 2, null, null),
    (15, 'dose_change', 'treatment', 'no', 0, null, null),
    (16, 'extra_doses', 'treatment', 'yes', 3, null, null),
    (16, 'extra_doses', 'treatment', 'no', 0, null, null),
    (17, 'home_dispensing', 'treatment', 'yes', 1, null, null),
    (17, 'home_dispensing', 'treatment', 'no', 0, null, null),
    (18, 'prophylaxis', 'treatment', 'yes', 3, null, null),
    (18, 'prophylaxis', 'treatment', 'no', 0, null, null),
    (19, 'non_adherence', 'treatment', 'yes', 4, null, null),
    (19, 'non_adherence', 'treatment', 'no', 0, null, null),
    (20, 'socioeconomic', 'social', 'yes', 3, null, null),
    (20, 'socioeconomic', 'social', 'no', 0, null, null),
    (21, 'intense_activity', 'social', 'yes', 1, null, null),
    (21, 'intense_activity', 'social', 'no', 0, null, null),
    (22, 'cv_risk', 'social', 'yes', 2, null, null),
    (22, 'cv_risk', 'social', 'no', 0, null, null),
    (23, 'access_difficulty', 'social', 'yes', 2, null, null),
    (23, 'access_difficulty', 'social', 'no', 0, null, null),
    (24, 'limited_knowledge', 'social', 'yes', 3, null, null),
    (24, 'limited_knowledge', 'social', 'no', 0, null, null),
    (25, 'transition', 'social', 'yes', 4, null, null),
    (25, 'transition', 'social', 'no', 0, null, null),
    (26, 'low_qol', 'social', 'yes', 1, null, null),
    (26, 'low_qol', 'social', 'no', 0, null, null)
  ) as s(ord, variable, dimension, option, points, applies_to, exception);
$$;

create or replace function coag_private.strat_priority(p_score integer)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case when p_score >= 28 then 1 when p_score >= 20 then 2 else 3 end)::smallint;
$$;

-- ── Cálculo (única fuente en BD; espejo de computeStratification) ───────────

create or replace function coag_private.stratification_result(p_diagnosis text, p_answers jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v record;
  v_points integer;
  v_min integer := 0;
  v_max integer := 0;
  v_scoring_missing integer := 0;
  v_missing text[] := '{}';
  v_dims jsonb := '{"demographic":{"points":0,"max":0},"clinical":{"points":0,"max":0},"treatment":{"points":0,"max":0},"social":{"points":0,"max":0}}';
  v_low smallint;
  v_high smallint;
  v_status text;
  v_priority smallint;
  v_basis text;
begin
  for v in
    select s.variable, s.dimension, max(s.points) as max_points
      from coag_private.strat_spec() s
     where s.applies_to is null or p_diagnosis = any(s.applies_to)
     group by s.variable, s.dimension
     order by min(s.ord)
  loop
    v_dims := jsonb_set(v_dims, array[v.dimension, 'max'], to_jsonb((v_dims #>> array[v.dimension, 'max'])::integer + v.max_points));
    select s.points into v_points from coag_private.strat_spec() s
     where s.variable = v.variable and s.option = (p_answers ->> v.variable);
    if found then
      v_dims := jsonb_set(v_dims, array[v.dimension, 'points'], to_jsonb((v_dims #>> array[v.dimension, 'points'])::integer + v_points));
      v_min := v_min + v_points;
      v_max := v_max + v_points;
    else
      v_missing := v_missing || v.variable;
      v_max := v_max + v.max_points;
      if v.max_points > 0 then v_scoring_missing := v_scoring_missing + 1; end if;
    end if;
  end loop;

  if (p_answers ->> 'age') = 'lt18' then
    v_status := 'pediatric_model';
  elsif (p_answers ->> 'advanced_therapy') = 'yes' then
    v_status := 'determined'; v_priority := 1; v_basis := 'advanced_therapy';
  else
    v_low := coag_private.strat_priority(v_min);
    v_high := coag_private.strat_priority(v_max);
    if v_low <> v_high or (p_answers ->> 'age') is null or (p_answers ->> 'advanced_therapy') is null then
      v_status := 'indeterminate';
    else
      v_status := 'determined'; v_priority := v_low; v_basis := 'score';
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'model_priority', v_priority,
    'basis', v_basis,
    'score', case when v_scoring_missing = 0 then v_min end,
    'score_min', v_min,
    'score_max', v_max,
    'by_dimension', v_dims,
    'missing', to_jsonb(v_missing),
    'qol_dependent', v_basis = 'score' and (p_answers ->> 'low_qol') = 'yes' and coag_private.strat_priority(v_min - 1) <> v_priority);
end;
$$;

-- ── Tabla ───────────────────────────────────────────────────────────────────

create table public.coag_stratifications (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.coag_visits(id) on delete cascade,
  model_version text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  answers jsonb not null default '{}'::jsonb,
  suggestions jsonb not null default '{}'::jsonb,
  clinical_source_visit_id uuid references public.coag_visits(id) on delete set null,
  raised_priority smallint check (raised_priority in (1, 2)),
  raised_reason text check (raised_reason is null or length(trim(raised_reason)) between 5 and 300),
  restratification_reason text check (restratification_reason is null or length(trim(restratification_reason)) between 5 and 300),
  result jsonb not null default '{}'::jsonb,
  score integer,
  score_min integer,
  score_max integer,
  model_priority smallint,
  final_priority smallint,
  revision integer not null default 1,
  correction_reason text,
  last_correction_reason text,
  last_corrected_at timestamptz,
  last_corrected_by uuid references public.coag_profiles(id) on delete set null,
  completed_at timestamptz,
  created_by uuid references public.coag_profiles(id) on delete set null,
  updated_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.coag_stratifications is
  'Estratificación CMO (modelo SEFH de coagulopatías congénitas v2.0) en una visita. answers = respuestas del profesional; suggestions = propuestas desde los datos clínicos con su procedencia; result, puntuaciones y prioridades las calcula la BD. Sin identificadores directos.';
comment on column public.coag_stratifications.answers is
  'Clave = pregunta del modelo (26, ver coag_private.strat_spec()); valor = código de opción. Clave ausente = sin responder (no equivale a 0 puntos).';
comment on column public.coag_stratifications.suggestions is
  'Trazabilidad: {pregunta: {value, from}} propuesto desde los datos clínicos de clinical_source_visit_id (el profesional confirma o corrige en answers).';
comment on column public.coag_stratifications.restratification_reason is
  'Motivo de la reestratificación (visita distinta de la basal; obligatorio al confirmar). La estratificación basal define la prioridad del análisis (spec §5.5).';
comment on column public.coag_stratifications.final_priority is
  'Prioridad asignada: la del modelo o la elevada por criterio profesional (raised_priority, solo hacia arriba, con raised_reason).';

create index idx_coag_strat_visit on public.coag_stratifications(visit_id);

-- ── Reglas de integridad, cálculo, corrección y autoría ─────────────────────

create or replace function coag_private.enforce_stratification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.coag_visits%rowtype;
  v_source public.coag_visits%rowtype;
  v_diagnosis text;
  v_key text;
  v_value jsonb;
  v_result jsonb;
  v_content_changed boolean;
begin
  if tg_op = 'UPDATE' and new.visit_id is distinct from old.visit_id then
    raise exception 'La visita de una estratificación no se puede modificar.';
  end if;

  select * into v_visit from public.coag_visits v where v.id = new.visit_id;
  if tg_op = 'INSERT' and v_visit.status in ('cancelled', 'not_done') then
    raise exception 'No se estratifica en una visita anulada o no realizada.';
  end if;
  select p.diagnosis into v_diagnosis from public.coag_patients p where p.id = v_visit.patient_id;

  -- Respuestas: preguntas del modelo aplicables al diagnóstico y opciones válidas.
  if jsonb_typeof(new.answers) <> 'object' or jsonb_typeof(new.suggestions) <> 'object' then
    raise exception 'Formato de respuestas no válido.';
  end if;
  for v_key, v_value in select * from jsonb_each(new.answers) loop
    if not exists (select 1 from coag_private.strat_spec() s where s.variable = v_key and (s.applies_to is null or v_diagnosis = any(s.applies_to))) then
      raise exception 'La pregunta «%» no pertenece al modelo o no aplica al diagnóstico.', v_key;
    end if;
    if jsonb_typeof(v_value) <> 'string' or not exists (select 1 from coag_private.strat_spec() s where s.variable = v_key and s.option = (v_value #>> '{}')) then
      raise exception 'Respuesta no válida en «%».', v_key;
    end if;
  end loop;
  for v_key, v_value in select * from jsonb_each(new.suggestions) loop
    if jsonb_typeof(v_value) <> 'object' or jsonb_typeof(v_value -> 'from') is distinct from 'string' or length(v_value ->> 'from') > 300
       or not exists (select 1 from coag_private.strat_spec() s where s.variable = v_key and s.option = (v_value ->> 'value')) then
      raise exception 'Propuesta no válida en «%».', v_key;
    end if;
  end loop;

  -- Origen de los datos clínicos: V0/VF del mismo paciente, no posterior a la visita.
  if new.clinical_source_visit_id is not null then
    select * into v_source from public.coag_visits v where v.id = new.clinical_source_visit_id;
    if v_source.patient_id is distinct from v_visit.patient_id or v_source.visit_type not in ('baseline', 'final')
       or v_source.visit_date > v_visit.visit_date then
      raise exception 'La visita de origen de los datos clínicos debe ser una V0/VF del mismo paciente, no posterior a esta visita.';
    end if;
  end if;

  -- Cálculo: lo fija la BD.
  v_result := coag_private.stratification_result(v_diagnosis, new.answers);
  new.model_version := 'CMO-COAG-SEFH-v2.0';
  new.result := v_result;
  new.score := (v_result ->> 'score')::integer;
  new.score_min := (v_result ->> 'score_min')::integer;
  new.score_max := (v_result ->> 'score_max')::integer;
  new.model_priority := (v_result ->> 'model_priority')::smallint;

  -- Elevación por criterio profesional (M p. 19): solo hacia arriba y con motivo.
  if new.raised_priority is null then
    new.raised_reason := null;
  else
    if new.model_priority is null then
      raise exception 'No se puede elevar un nivel que aún no está determinado.';
    end if;
    if new.raised_priority >= new.model_priority then
      raise exception 'Solo se puede elevar el nivel (prioridad de número menor que la del modelo), nunca bajarlo.';
    end if;
    if new.raised_reason is null then
      raise exception 'Indique el motivo de la elevación de nivel.';
    end if;
  end if;
  new.final_priority := coalesce(new.raised_priority, new.model_priority);

  if v_visit.visit_type = 'baseline' then
    new.restratification_reason := null;
  elsif new.status = 'completed' and new.restratification_reason is null then
    raise exception 'Para confirmar una reestratificación (visita distinta de la basal) indique el motivo.';
  end if;

  if new.status = 'completed' and new.model_priority is null then
    raise exception 'Para confirmar la estratificación, el nivel del modelo debe estar determinado (complete las respuestas que pueden cambiarlo).';
  end if;

  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.last_correction_reason := null;
    new.last_corrected_at := null;
    new.last_corrected_by := null;
  else
    new.revision := old.revision + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    v_content_changed := new.status is distinct from old.status
      or new.answers is distinct from old.answers
      or new.suggestions is distinct from old.suggestions
      or new.clinical_source_visit_id is distinct from old.clinical_source_visit_id
      or new.raised_priority is distinct from old.raised_priority
      or new.raised_reason is distinct from old.raised_reason
      or new.restratification_reason is distinct from old.restratification_reason;
    if old.status = 'completed' and v_content_changed then
      if new.correction_reason is null or length(trim(new.correction_reason)) < 5 then
        raise exception 'Esta estratificación está confirmada: indique el motivo de la corrección (mínimo 5 caracteres).';
      end if;
      new.last_correction_reason := left(trim(new.correction_reason), 300);
      new.last_corrected_at := timezone('utc', now());
      new.last_corrected_by := auth.uid();
    else
      new.last_correction_reason := old.last_correction_reason;
      new.last_corrected_at := old.last_corrected_at;
      new.last_corrected_by := old.last_corrected_by;
    end if;
  end if;
  new.correction_reason := null;

  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.completed_at := timezone('utc', now());
  elsif new.status <> 'completed' then
    new.completed_at := null;
  else
    new.completed_at := old.completed_at;
  end if;

  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_coag_strat_rules before insert or update on public.coag_stratifications
for each row execute function coag_private.enforce_stratification();
create trigger trg_coag_strat_audit after insert or update or delete on public.coag_stratifications
for each row execute function coag_private.write_audit_log();

-- ── RLS y privilegios ───────────────────────────────────────────────────────

alter table public.coag_stratifications enable row level security;
revoke all on public.coag_stratifications from public, anon, authenticated;
revoke all on function
  coag_private.strat_spec(),
  coag_private.strat_priority(integer),
  coag_private.stratification_result(text, jsonb),
  coag_private.enforce_stratification()
from public, anon, authenticated;

create policy coag_app_gate on public.coag_stratifications as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));

create policy coag_strat_select on public.coag_stratifications for select to authenticated
  using (coag_private.can_access_visit(visit_id));
create policy coag_strat_insert on public.coag_stratifications for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_strat_update on public.coag_stratifications for update to authenticated
  using (coag_private.can_access_visit(visit_id))
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_strat_delete on public.coag_stratifications for delete to authenticated
  using (coag_private.is_coordinator());

grant select on public.coag_stratifications to authenticated;
grant insert (visit_id, status, answers, suggestions, clinical_source_visit_id, raised_priority, raised_reason, restratification_reason),
      update (status, answers, suggestions, clinical_source_visit_id, raised_priority, raised_reason, restratification_reason, correction_reason)
  on public.coag_stratifications to authenticated;
grant delete on public.coag_stratifications to authenticated;
