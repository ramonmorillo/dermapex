-- COAMO · 07 · VERITAS-PRN y VERITAS-Pro: clave de puntuación y desbloqueo de VERITAS-Pro.
--
-- Fuentes (aportadas por el IP el 03/11/2026):
--   · «VERITAS-PRN puntuación» y «VERITAS-Pro puntuación» (Word): cada ítem puntúa 1 (máxima adherencia) a 5
--     (mínima) según el sentido de la pregunta; total = suma de los 24 ítems (24 máxima adherencia – 120 mínima).
--     Ítems invertidos (opción «Siempre» = 5): PRN 6, 7, 12, 13, 17, 19, 20, 23;
--     Pro 6, 7, 11, 13, 14, 16, 17, 18, 19, 20, 23.
--     Duncan NA et al. Haemophilia 2010;16(1):47-53 (PRN) y 2010;16(2):247-55 (Pro).
--   · Los textos de los ítems coinciden literalmente con los documentos ya implementados (VERITAS-PRN
--     14/10/2026; VERITAS-Pro 27/10/2026): no cambia instrument_version.
--
-- Cambios:
--   1. VERITAS-Pro admite respuestas (q1-q24, código de posición 1-5) y la BD fija su versión. Se elimina el
--      bloqueo «VERITAS-Pro no tiene versión aprobada en COAMO» de la migración 20261026120000, que existía
--      porque entonces no se había aportado el documento.
--   2. Puntuación VERITAS (scoring_version 'coamo-q-2'): item_scores (invertidos recodificados), total solo
--      con los 24 ítems (el documento no define regla para ausentes: no se imputa), sin puntos de corte y
--      sin subescalas (el documento de puntuación solo define el total). IEXPAC, EQ-5D-3L y EVASAF no
--      cambian (siguen en 'coamo-q-1').
--   3. Recalcula los derivados de los registros VERITAS existentes. NO modifica responses ni ningún dato
--      introducido: el trigger recalcula scores/scoring_version, incrementa revision y queda en coag_audit_log
--      (valor anterior y nuevo). No exige motivo de corrección porque no cambia el contenido clínico.
--
-- Aditiva y compatible: no cambia tablas, columnas, RLS ni grants. Espejo: COAMO src/domain/questionnaires/scoring.ts
-- (tests/questionnaireScoring.test.ts) y db-tests/71_coag_veritas_scoring.sql (mismos ejemplos).

create or replace function coag_private.veritas_reversed_items(p_instrument text)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select case p_instrument
    when 'VERITAS_PRN' then array[6, 7, 12, 13, 17, 19, 20, 23]
    when 'VERITAS_PRO' then array[6, 7, 11, 13, 14, 16, 17, 18, 19, 20, 23]
  end;
$$;

create or replace function coag_private.questionnaire_scoring_version(p_instrument text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_instrument in ('VERITAS_PRN', 'VERITAS_PRO') then 'coamo-q-2' else 'coamo-q-1' end;
$$;

create or replace function coag_private.questionnaire_items(p_instrument text)
returns table (item text, min_value integer, max_value integer, conditional boolean)
language sql
immutable
set search_path = ''
as $$
  select 'q' || g, 1, 5, g >= 12 from generate_series(1, 15) g where p_instrument = 'IEXPAC'
  union all
  select d, 1, 3, false
    from unnest(array['mobility', 'self_care', 'usual_activities', 'pain_discomfort', 'anxiety_depression']) d
   where p_instrument = 'EQ5D3L'
  union all
  select 'vas', 0, 100, false where p_instrument = 'EQ5D3L'
  union all
  select 'q' || g, 1, 5, false from generate_series(1, 10) g where p_instrument = 'EVASAF'
  union all
  select 'q' || g, 1, 5, false from generate_series(1, 24) g where p_instrument in ('VERITAS_PRN', 'VERITAS_PRO');
$$;

create or replace function coag_private.questionnaire_version(p_instrument text, p_mode text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_instrument
    when 'IEXPAC' then 'IEXPAC-COAMO-2026-10-14'
    when 'EQ5D3L' then case p_mode
      when 'self' then 'EQ-5D-3L-ES-ES-v2.0-self'
      when 'interviewer' then 'EQ-5D-3L-ES-ES-v1.0-interviewer'
    end
    when 'EVASAF' then 'EVASAF-FarmHosp2015-10it'
    when 'VERITAS_PRN' then 'VERITAS-PRN-ES-COAMO-2026-10-14'
    when 'VERITAS_PRO' then 'VERITAS-Pro-ES-COAMO-2026-10-27'
    else null
  end;
$$;

create or replace function coag_private.questionnaire_scores(p_instrument text, p_responses jsonb, p_applicability jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_answered integer;
  v_sum integer;
  v_dims text[] := array['mobility', 'self_care', 'usual_activities', 'pain_discomfort', 'anxiety_depression'];
  v_subscales jsonb := '{}'::jsonb;
  v_block text;
  v_i integer;
  v_blocks text[];
  v_item_scores jsonb;
begin
  if p_instrument = 'IEXPAC' then
    select count(*), sum((p_responses ->> ('q' || g))::integer)
      into v_answered, v_sum
      from generate_series(1, 11) g where p_responses ? ('q' || g);
    return jsonb_build_object(
      'items_expected', 11,
      'items_answered', v_answered,
      'complete', v_answered = 11,
      'sum', case when v_answered = 11 then v_sum end,
      'global_0_10', case when v_answered = 11 then round(10.0 * (v_sum - 11) / 44, 4) end,
      'conditional_applicable', (select count(*) from generate_series(12, 15) g where (p_applicability ->> ('q' || g)) = 'true'),
      'conditional_answered', (select count(*) from generate_series(12, 15) g where p_responses ? ('q' || g)));
  elsif p_instrument = 'EQ5D3L' then
    select count(*) into v_answered from unnest(v_dims) d where p_responses ? d;
    return jsonb_build_object(
      'dimensions_answered', v_answered,
      'profile_complete', v_answered = 5,
      'profile', case when v_answered = 5 then
        (select string_agg(p_responses ->> d, '' order by ord) from unnest(v_dims) with ordinality as t(d, ord)) end,
      'vas', case when p_responses ? 'vas' then (p_responses ->> 'vas')::integer end,
      'utility_index', null,
      'utility_index_status', 'no_approved_value_set');
  elsif p_instrument = 'EVASAF' then
    select count(*) into v_answered from generate_series(1, 10) g where p_responses ? ('q' || g);
    return jsonb_build_object('items_expected', 10, 'items_answered', v_answered, 'complete', v_answered = 10,
      'summary_score', null, 'summary_score_status', 'no_approved_rule');
  elsif p_instrument in ('VERITAS_PRN', 'VERITAS_PRO') then
    v_blocks := case p_instrument
      when 'VERITAS_PRN' then array['treatment', 'timing', 'dosing', 'planning', 'remembering', 'communicating']
      else array['routine', 'dosing', 'planning', 'remembering', 'skipping', 'communicating'] end;
    v_i := 0;
    foreach v_block in array v_blocks loop
      v_subscales := v_subscales || jsonb_build_object(v_block,
        (select count(*) from generate_series(v_i * 4 + 1, v_i * 4 + 4) g where p_responses ? ('q' || g)));
      v_i := v_i + 1;
    end loop;
    select count(*),
           coalesce(jsonb_object_agg('q' || g, s.points) filter (where s.points is not null), '{}'::jsonb),
           sum(s.points)
      into v_answered, v_item_scores, v_sum
      from generate_series(1, 24) g
      cross join lateral (
        select case when not (p_responses ? ('q' || g)) then null
                    when g = any (coag_private.veritas_reversed_items(p_instrument)) then 6 - (p_responses ->> ('q' || g))::integer
                    else (p_responses ->> ('q' || g))::integer end as points
      ) s
     where p_responses ? ('q' || g);
    return jsonb_build_object('items_expected', 24, 'items_answered', v_answered, 'complete', v_answered = 24,
      'block_items_answered', v_subscales,
      'item_scores', coalesce(v_item_scores, '{}'::jsonb),
      'total', case when v_answered = 24 then v_sum end,
      'total_min', 24, 'total_max', 120, 'direction', 'lower_is_more_adherent',
      'scoring_status', case when v_answered = 24 then 'scored' else 'incomplete_no_total' end,
      'subscale_scores', null, 'subscale_status', 'not_defined_in_scoring_document');
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function coag_private.enforce_questionnaire_administration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.coag_visits%rowtype;
  v_key text;
  v_value jsonb;
  v_spec record;
  v_content_changed boolean;
begin
  if tg_op = 'UPDATE' and (new.visit_id is distinct from old.visit_id or new.instrument_code is distinct from old.instrument_code) then
    raise exception 'La visita y el instrumento de un cuestionario no se pueden modificar.';
  end if;

  select * into v_visit from public.coag_visits v where v.id = new.visit_id;
  if v_visit.visit_type not in ('baseline', 'final') then
    raise exception 'Los cuestionarios del estudio se registran en la visita basal (V0) o final (VF).';
  end if;
  if tg_op = 'INSERT' and v_visit.status = 'cancelled' then
    raise exception 'No se registran cuestionarios en una visita anulada.';
  end if;

  -- Respuestas: objeto con ítems conocidos y enteros dentro de la escala del documento.
  if jsonb_typeof(new.responses) <> 'object' or jsonb_typeof(new.item_applicability) <> 'object' then
    raise exception 'Formato de respuestas no válido.';
  end if;
  for v_key, v_value in select * from jsonb_each(new.responses) loop
    select * into v_spec from coag_private.questionnaire_items(new.instrument_code) s where s.item = v_key;
    if not found then
      raise exception 'El ítem «%» no pertenece a %.', v_key, new.instrument_code;
    end if;
    if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}') !~ '^\d+$'
       or (v_value #>> '{}')::integer not between v_spec.min_value and v_spec.max_value then
      raise exception 'Respuesta no válida en «%» (admitido: % a %).', v_key, v_spec.min_value, v_spec.max_value;
    end if;
    if v_spec.conditional and (new.item_applicability ->> v_key) is distinct from 'true' then
      raise exception 'El ítem condicionado «%» solo se responde si se cumple su condición.', v_key;
    end if;
  end loop;
  for v_key, v_value in select * from jsonb_each(new.item_applicability) loop
    if not exists (select 1 from coag_private.questionnaire_items(new.instrument_code) s where s.item = v_key and s.conditional)
       or jsonb_typeof(v_value) <> 'boolean' then
      raise exception 'Aplicabilidad no válida para «%».', v_key;
    end if;
  end loop;

  -- Modalidad y fecha.
  if new.instrument_code = 'EQ5D3L' and new.administration_mode = 'assisted' then
    raise exception 'EQ-5D-3L: solo modalidades autoadministrada (v2.0) o por entrevista (v1.0), según los documentos aportados.';
  end if;
  if new.instrument_code = 'EQ5D3L' and new.status in ('in_progress', 'completed') and new.administration_mode is null then
    raise exception 'EQ-5D-3L: indique la modalidad de administración (el texto difiere entre versiones).';
  end if;
  if new.administration_date is not null and new.administration_date > current_date then
    raise exception 'La fecha de administración no puede ser futura.';
  end if;

  -- Estados.
  if new.status in ('not_applicable', 'not_done') then
    if new.status_reason_code is null then
      raise exception 'Indique el motivo («no aplicable» o «no realizado»).';
    end if;
    if new.status_reason_code = 'other' and new.status_reason_detail is null then
      raise exception 'Describa el motivo «otro».';
    end if;
    if new.responses <> '{}'::jsonb or new.item_applicability <> '{}'::jsonb then
      raise exception 'Un cuestionario no aplicable o no realizado no conserva respuestas: elimínelas antes de cambiar el estado.';
    end if;
  else
    new.status_reason_code := null;
    new.status_reason_detail := null;
  end if;
  if new.status = 'completed' then
    if new.administration_date is null or new.administration_mode is null then
      raise exception 'Para completar el cuestionario indique la fecha y la modalidad de administración.';
    end if;
    if new.responses = '{}'::jsonb then
      raise exception 'Un cuestionario completado necesita al menos una respuesta.';
    end if;
  end if;

  -- Versión y derivados: los fija la BD.
  new.instrument_version := coag_private.questionnaire_version(new.instrument_code, new.administration_mode);
  new.scores := coag_private.questionnaire_scores(new.instrument_code, new.responses, new.item_applicability);
  new.scoring_version := coag_private.questionnaire_scoring_version(new.instrument_code);

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
      or new.responses is distinct from old.responses
      or new.item_applicability is distinct from old.item_applicability
      or new.administration_mode is distinct from old.administration_mode
      or new.data_source is distinct from old.data_source
      or new.administration_date is distinct from old.administration_date
      or new.status_reason_code is distinct from old.status_reason_code
      or new.status_reason_detail is distinct from old.status_reason_detail;
    if old.status = 'completed' and v_content_changed then
      if new.correction_reason is null or length(trim(new.correction_reason)) < 5 then
        raise exception 'Este cuestionario está completado: indique el motivo de la corrección (mínimo 5 caracteres).';
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

revoke all on function
  coag_private.veritas_reversed_items(text),
  coag_private.questionnaire_scoring_version(text)
from public, anon, authenticated;

comment on column public.coag_questionnaire_administrations.responses is
  'Clave = ítem (q1…, o dimensión EQ-5D y vas); valor = entero. Clave ausente = no respondido. VERITAS-PRN y VERITAS-Pro: 1 Siempre, 2 A menudo, 3 A veces, 4 Rara vez, 5 Nunca (código de posición; la puntuación del ítem está en scores.item_scores).';

-- Recalcular derivados VERITAS existentes (solo scores/scoring_version; respuestas intactas; auditado).
update public.coag_questionnaire_administrations
   set scores = scores
 where instrument_code in ('VERITAS_PRN', 'VERITAS_PRO');
