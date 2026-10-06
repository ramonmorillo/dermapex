-- DERMAPEX · 09 · Estratificación CMO-DERMAPEX: registro, verificación en servidor y visibilidad
-- por cohorte (decisiones D1, D5, D6 · PENDIENTE VALIDACIÓN IP).
--
-- 1. cmo_scores guarda motivo (D6), versión de modelo y motor, regla especial, incompletitud (D1),
--    variables desconocidas y desglose por bloque. cmo_score_item_results guarda UNA fila por variable
--    del modelo (27 puntuables + informativa), con valor bruto y puntos.
-- 2. Escritura SOLO mediante public.save_cmo_stratification(): una única transacción (puntuación +
--    ítems, sin registros a medias) que además RECALCULA en servidor la puntuación a partir del
--    catálogo versionado y rechaza el guardado si no coincide con la del motor TypeScript del cliente.
--    Se retiran los privilegios directos de INSERT/UPDATE (endurecimiento; antes el cliente escribía
--    directamente y los ítems se guardaban «best effort»).
-- 3. D5: puntuación, nivel, puntos por ítem y regla especial solo son legibles por coordinación o por
--    centros de la cohorte 'cmo'. Los centros 'standard' registran y consultan sus datos mediante dos
--    vistas que enmascaran los resultados (NULL).

-- ── Columnas nuevas ─────────────────────────────────────────────────────────

alter table public.cmo_scores
  add column model_version text references public.cmo_model_versions(model_version) on delete restrict,
  add column stratification_reason text check (
    stratification_reason is null
    or stratification_reason in ('baseline', 'month_6', 'month_12', 'treatment_change', 'clinical_change', 'need_detected')
  ),
  add column special_rule_applied boolean,
  add column incomplete boolean,
  add column unknown_variables text[] not null default '{}',
  add column block_scores jsonb not null default '[]'::jsonb;

comment on column public.cmo_scores.stratification_reason is
  'Motivo de la estratificación (D6): baseline, month_6, month_12, treatment_change, clinical_change, need_detected.';
comment on column public.cmo_scores.special_rule_applied is
  'true si embarazo o deseo gestacional = sí forzó el nivel 1 (regla especial del modelo).';
comment on column public.cmo_scores.incomplete is
  'true si alguna variable puntuable quedó como desconocida (D1): puntúa 0 y la puntuación puede infraestimar la complejidad.';
comment on column public.cmo_scores.priority is
  'Nivel CMO: 1 = mayor complejidad/prioridad (>=31 o regla especial), 2 = 18-30, 3 = <=17.';

-- ── Guardado atómico y verificado ───────────────────────────────────────────

create or replace function public.save_cmo_stratification(
  p_visit_id uuid,
  p_reason text,
  p_model_version text,
  p_engine_version text,
  p_answers jsonb,
  p_client_total numeric,
  p_client_level integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_arm text;
  v_age integer;
  v_model public.cmo_model_versions%rowtype;
  v_var record;
  v_value text;
  v_option jsonb;
  v_points numeric;
  v_total numeric := 0;
  v_blocks jsonb := '{}'::jsonb;
  v_unknown text[] := '{}';
  v_special boolean := false;
  v_level smallint;
  v_items jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
  v_block_scores jsonb;
  v_score_id uuid;
  v_extra text;
begin
  if v_uid is null or not app_private.is_active_user() then
    raise exception 'Usuario no autenticado o inactivo.';
  end if;
  if not app_private.can_access_visit(p_visit_id) then
    raise exception 'Sin acceso a la visita %.', p_visit_id;
  end if;

  select c.study_arm, p.age_at_inclusion into v_arm, v_age
    from public.visits v
    join public.patients p on p.id = v.patient_id
    join public.centers c on c.id = p.center_id
   where v.id = p_visit_id;
  if v_arm is null then
    raise exception 'El centro del paciente no tiene cohorte asignada (cmo/standard). Contacte con coordinación.';
  end if;

  if p_reason is null or p_reason not in ('baseline', 'month_6', 'month_12', 'treatment_change', 'clinical_change', 'need_detected') then
    raise exception 'El motivo de la estratificación es obligatorio y debe ser uno de los admitidos.';
  end if;

  select * into v_model from public.cmo_model_versions m where m.model_version = p_model_version;
  if not found or v_model.status <> 'active' then
    raise exception 'Versión de modelo CMO no disponible: %.', p_model_version;
  end if;
  if v_model.engine_version <> p_engine_version then
    raise exception 'La versión del motor (%) no corresponde al modelo % (requiere %). Recargue la aplicación.',
      p_engine_version, p_model_version, v_model.engine_version;
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Respuestas no válidas.';
  end if;
  select k into v_extra
    from jsonb_object_keys(p_answers) k
   where not exists (
     select 1 from public.cmo_variable_catalog vc
      where vc.model_version = p_model_version and vc.variable_code = k and vc.value_type <> 'derived_age'
   )
   limit 1;
  if v_extra is not null then
    raise exception 'Variable no reconocida en el modelo %: %.', p_model_version, v_extra;
  end if;

  -- Recalcular cada variable desde el catálogo versionado.
  for v_var in
    select vc.id, vc.variable_code, vc.label, vc.block, vc.value_type, vc.options, vc.is_scored, vc.sort_order
      from public.cmo_variable_catalog vc
     where vc.model_version = p_model_version
     order by vc.sort_order
  loop
    v_points := 0;
    if v_var.value_type = 'derived_age' then
      -- Edad desde la ficha del paciente (no se acepta del cliente).
      select o into v_option
        from jsonb_array_elements(v_var.options) o
       where v_age is not null and v_age between (o ->> 'min')::numeric and (o ->> 'max')::numeric
       limit 1;
      v_value := coalesce(v_option ->> 'value', 'unknown');
      v_points := coalesce((v_option ->> 'points')::numeric, 0);
      v_items := v_items || jsonb_build_object('id', v_var.id, 'code', v_var.variable_code,
        'raw', jsonb_build_object('value', v_value, 'age', v_age), 'points', v_points);
    else
      v_value := p_answers ->> v_var.variable_code;
      if v_value is null then
        raise exception 'Falta la respuesta de la variable % (sí/no/desconocido).', v_var.variable_code;
      end if;
      if v_value <> 'unknown' then
        select o into v_option from jsonb_array_elements(v_var.options) o where o ->> 'value' = v_value limit 1;
        if v_option is null then
          raise exception 'Valor no admitido para %: %.', v_var.variable_code, v_value;
        end if;
        v_points := case when v_var.is_scored then greatest((v_option ->> 'points')::numeric, 0) else 0 end;
      end if;
      v_items := v_items || jsonb_build_object('id', v_var.id, 'code', v_var.variable_code,
        'raw', jsonb_build_object('value', v_value), 'points', v_points);
    end if;

    if v_var.is_scored then
      if v_value = 'unknown' then
        v_unknown := v_unknown || v_var.variable_code;
      end if;
      v_total := v_total + v_points;
      v_blocks := jsonb_set(v_blocks, array[v_var.block], to_jsonb(coalesce((v_blocks ->> v_var.block)::numeric, 0) + v_points));
      if v_points > 0 then
        v_factors := v_factors || jsonb_build_object('code', v_var.variable_code, 'label', v_var.label, 'points', v_points,
          'raw_value', v_value, 'sort_order', v_var.sort_order);
      end if;
      if v_var.variable_code = any (v_model.special_rule_codes) and v_value = 'si' then
        v_special := true;
      end if;
    end if;
  end loop;

  v_level := case
    when v_special then 1
    when v_total >= v_model.level1_min_score then 1
    when v_total >= v_model.level2_min_score then 2
    else 3
  end;

  if p_client_total is distinct from v_total or p_client_level is distinct from v_level then
    raise exception 'Discrepancia entre el motor del cliente (% puntos, nivel %) y la verificación del servidor (% puntos, nivel %). No se ha guardado.',
      p_client_total, p_client_level, v_total, v_level;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('block', b.block, 'points', coalesce((v_blocks ->> b.block)::numeric, 0)) order by b.ord), '[]'::jsonb)
    into v_block_scores
    from (values ('demografica', 1), ('sociosanitaria', 2), ('clinica', 3), ('farmacoterapeutica', 4), ('especifica', 5)) as b(block, ord);

  select coalesce(jsonb_agg(f - 'sort_order' order by (f ->> 'points')::numeric desc, (f ->> 'sort_order')::integer), '[]'::jsonb)
    into v_factors
    from jsonb_array_elements(v_factors) f;

  -- Una estratificación por visita: un nuevo guardado actualiza la existente (cambio auditado).
  insert into public.cmo_scores (
    visit_id, score, priority, factors, recommendations, engine_version, model_version, stratification_reason,
    special_rule_applied, incomplete, unknown_variables, block_scores, calculated_by
  ) values (
    p_visit_id, v_total, v_level, v_factors, '[]'::jsonb, p_engine_version, p_model_version, p_reason,
    v_special, cardinality(v_unknown) > 0, v_unknown, v_block_scores, v_uid
  )
  on conflict (visit_id) do update set
    score = excluded.score,
    priority = excluded.priority,
    factors = excluded.factors,
    recommendations = excluded.recommendations,
    engine_version = excluded.engine_version,
    model_version = excluded.model_version,
    stratification_reason = excluded.stratification_reason,
    special_rule_applied = excluded.special_rule_applied,
    incomplete = excluded.incomplete,
    unknown_variables = excluded.unknown_variables,
    block_scores = excluded.block_scores,
    calculated_by = excluded.calculated_by
  returning id into v_score_id;

  delete from public.cmo_score_item_results where cmo_score_id = v_score_id;

  insert into public.cmo_score_item_results (cmo_score_id, visit_id, variable_id, source_question_code, raw_value, item_score, scored_by)
  select v_score_id, p_visit_id, (i ->> 'id')::uuid, i ->> 'code', i -> 'raw', (i ->> 'points')::numeric, v_uid
    from jsonb_array_elements(v_items) i;

  -- Solo se devuelve el identificador: nunca la puntuación (D5).
  return v_score_id;
end;
$$;

comment on function public.save_cmo_stratification(uuid, text, text, text, jsonb, numeric, integer) is
  'Guarda la estratificación CMO de una visita en una transacción (puntuación + una fila por variable), verificando en servidor la puntuación y el nivel calculados por el motor del cliente. Devuelve solo el id.';

revoke all on function public.save_cmo_stratification(uuid, text, text, text, jsonb, numeric, integer) from public, anon;
grant execute on function public.save_cmo_stratification(uuid, text, text, text, jsonb, numeric, integer) to authenticated;

-- ── RLS: lectura de resultados por cohorte; sin escritura directa ───────────

drop policy cmo_scores_select on public.cmo_scores;
drop policy cmo_scores_insert on public.cmo_scores;
drop policy cmo_scores_update on public.cmo_scores;
create policy cmo_scores_select on public.cmo_scores for select to authenticated
  using (app_private.can_view_cmo_results(visit_id));

drop policy cmo_score_item_results_select on public.cmo_score_item_results;
drop policy cmo_score_item_results_insert on public.cmo_score_item_results;
drop policy cmo_score_item_results_update on public.cmo_score_item_results;
drop policy cmo_score_item_results_delete on public.cmo_score_item_results;
create policy cmo_score_item_results_select on public.cmo_score_item_results for select to authenticated
  using (app_private.can_view_cmo_results(visit_id));
create policy cmo_score_item_results_delete on public.cmo_score_item_results for delete to authenticated
  using (app_private.is_coordinator());

revoke insert, update on public.cmo_scores from authenticated;
revoke insert, update on public.cmo_score_item_results from authenticated;

-- ── Vistas de registro con resultados enmascarados (D5) ─────────────────────
-- Vistas con los privilegios del propietario (no security_invoker) y filtro explícito por acceso a la
-- visita: así un centro 'standard' consulta QUÉ registró (fecha, motivo, versión, valores brutos,
-- incompletitud) sin poder leer puntuación, nivel, regla especial ni puntos.
-- (El asesor de Supabase las señalará como «security definer view»: es intencionado.)

create view public.cmo_stratification_registry with (security_barrier = true) as
select
  s.id,
  s.visit_id,
  v.patient_id,
  pt.center_id,
  c.study_arm,
  v.visit_type,
  v.visit_number,
  v.visit_date,
  v.scheduled_date,
  s.stratification_reason,
  s.engine_version,
  s.model_version,
  s.incomplete,
  cardinality(s.unknown_variables) as unknown_count,
  s.unknown_variables,
  s.calculated_by,
  s.created_at,
  s.updated_at,
  app_private.can_view_cmo_results(s.visit_id) as results_visible,
  case when app_private.can_view_cmo_results(s.visit_id) then s.score end as score,
  case when app_private.can_view_cmo_results(s.visit_id) then s.priority end as priority,
  case when app_private.can_view_cmo_results(s.visit_id) then s.special_rule_applied end as special_rule_applied,
  case when app_private.can_view_cmo_results(s.visit_id) then s.block_scores end as block_scores,
  case when app_private.can_view_cmo_results(s.visit_id) then s.factors end as factors
from public.cmo_scores s
join public.visits v on v.id = s.visit_id
join public.patients pt on pt.id = v.patient_id
join public.centers c on c.id = pt.center_id
where app_private.can_access_visit(s.visit_id);

create view public.cmo_stratification_item_values with (security_barrier = true) as
select
  r.id,
  r.cmo_score_id,
  r.visit_id,
  vc.variable_code,
  vc.label,
  vc.block,
  vc.sort_order,
  vc.is_scored,
  vc.model_version,
  r.raw_value,
  case when app_private.can_view_cmo_results(r.visit_id) then r.item_score end as item_score
from public.cmo_score_item_results r
join public.cmo_variable_catalog vc on vc.id = r.variable_id
where app_private.can_access_visit(r.visit_id);

comment on view public.cmo_stratification_registry is
  'Registro de estratificaciones accesibles. score/priority/special_rule_applied/block_scores/factors = NULL si el usuario no puede ver resultados CMO (centros standard; D5).';
comment on view public.cmo_stratification_item_values is
  'Valores brutos registrados por variable. item_score = NULL si el usuario no puede ver resultados CMO (D5).';

revoke all on public.cmo_stratification_registry, public.cmo_stratification_item_values from public, anon, authenticated;
grant select on public.cmo_stratification_registry, public.cmo_stratification_item_values to authenticated;
