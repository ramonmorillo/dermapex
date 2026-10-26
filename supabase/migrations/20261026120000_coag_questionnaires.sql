-- COAMO · 05 · Cuestionarios y resultados comunicados por el paciente (visitas basal y final).
--
-- Fuentes:
--   · Documentos Word de los instrumentos aportados por el IP (14/10/2026): IEXPAC (15 ítems:
--     1-11 + 12-15 condicionados), EQ-5D-3L autoadministrado (Spain (Spanish) v2.0) y por
--     entrevista (Spain (Spanish) v1.0), EVASAF (10 ítems, 1-5) y VERITAS-PRN (24 ítems, 6 bloques).
--   · Protocolo COAMO (P, IIS La Fe, 30/08/2026), p. 10: IEXPAC de 11 ítems, siempre=5 … nunca=1,
--     global = 10 × (suma − 11) / 44 (0-10); p. 12: EQ-5D-3L (5 dimensiones, 3 niveles, EVA 0-100)
--     y EVASAF (1 muy deficiente – 5 excelente). Transcrito en docs/coamo/COAMO_FUNCTIONAL_BLUEPRINT.md §10.
--   · VERITAS-Pro: documento fuente NO aportado. Se reserva el código, pero la BD no admite
--     respuestas hasta que se apruebe una versión (solo «pendiente», «no aplicable» o «no realizado»).
--
-- Reglas metodológicas aplicadas en la BD:
--   · Respuesta cruda = código de la opción en el orden del documento. Solo IEXPAC (ítems 1-11, P p. 10)
--     y el perfil/EVA de EQ-5D-3L tienen derivados documentados. EVASAF, VERITAS-PRN y los ítems
--     condicionados de IEXPAC NO reciben puntuación: no hay regla aprobada en los documentos.
--   · Sin imputación: IEXPAC global solo con los 11 ítems; perfil EQ-5D solo con las 5 dimensiones.
--     Índice de utilidad EQ-5D: siempre NULL (no hay tarifa de valoración aprobada).
--   · No respondido (clave ausente) ≠ valor válido. Ítem condicionado no aplicable se registra en
--     item_applicability, no como respuesta.
--   · Una administración por visita e instrumento: las dos modalidades del EQ-5D-3L son el mismo
--     instrumento (no se suman ni combinan).
--   · Un cuestionario completado solo se modifica con motivo de corrección; cada cambio queda en
--     coag_audit_log y la revisión se incrementa (control de concurrencia en el cliente).

-- ── Tabla ───────────────────────────────────────────────────────────────────

create table public.coag_questionnaire_administrations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.coag_visits(id) on delete cascade,
  instrument_code text not null check (instrument_code in ('IEXPAC', 'EQ5D3L', 'EVASAF', 'VERITAS_PRN', 'VERITAS_PRO')),
  instrument_version text,
  status text not null default 'in_progress'
    check (status in ('pending', 'in_progress', 'completed', 'not_applicable', 'not_done')),
  status_reason_code text check (status_reason_code in (
    'regimen_mismatch', 'diagnosis_mismatch', 'source_document_unavailable', 'not_in_protocol',
    'patient_declined', 'patient_unable', 'not_administered', 'other')),
  status_reason_detail text check (status_reason_detail is null or length(trim(status_reason_detail)) between 3 and 200),
  administration_mode text check (administration_mode in ('self', 'assisted', 'interviewer')),
  data_source text check (data_source in ('electronic', 'paper')),
  administration_date date,
  responses jsonb not null default '{}'::jsonb,
  item_applicability jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  scoring_version text,
  revision integer not null default 1,
  correction_reason text,
  last_correction_reason text,
  last_corrected_at timestamptz,
  last_corrected_by uuid references public.coag_profiles(id) on delete set null,
  completed_at timestamptz,
  created_by uuid references public.coag_profiles(id) on delete set null,
  updated_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (visit_id, instrument_code)
);

comment on table public.coag_questionnaire_administrations is
  'Administración de un instrumento (IEXPAC, EQ-5D-3L, EVASAF, VERITAS-PRN, VERITAS-Pro) en la visita basal o final. responses = códigos de opción del documento fuente (no puntuaciones salvo IEXPAC/EVASAF, cuyo código coincide con el valor de la escala). scores = derivados calculados por la BD (scoring_version). Sin identificadores directos.';
comment on column public.coag_questionnaire_administrations.responses is
  'Clave = ítem (q1…, o dimensión EQ-5D y vas); valor = entero. Clave ausente = no respondido. VERITAS-PRN: 1 Siempre, 2 A menudo, 3 A veces, 4 Rara vez, 5 Nunca (código de posición, NO puntuación).';
comment on column public.coag_questionnaire_administrations.item_applicability is
  'Solo ítems condicionados de IEXPAC (q12-q15): true = se cumple la condición (ingreso, urgencias, atención domiciliaria o servicios sociales en los últimos 6 meses); false = no aplica.';
comment on column public.coag_questionnaire_administrations.correction_reason is
  'Entrada de escritura: motivo obligatorio para modificar un cuestionario completado. La BD lo traslada a last_correction_reason y lo deja vacío.';

create index idx_coag_qadm_visit on public.coag_questionnaire_administrations(visit_id);

-- ── Especificación de ítems (fuente: documentos del IP) ─────────────────────

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
  select 'q' || g, 1, 5, false from generate_series(1, 24) g where p_instrument = 'VERITAS_PRN';
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
    else null
  end;
$$;

-- ── Puntuación (única fuente en BD; espejo probado en src/domain/questionnaires del frontend) ──

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
  elsif p_instrument = 'VERITAS_PRN' then
    v_i := 0;
    foreach v_block in array array['treatment', 'timing', 'dosing', 'planning', 'remembering', 'communicating'] loop
      v_subscales := v_subscales || jsonb_build_object(v_block,
        (select count(*) from generate_series(v_i * 4 + 1, v_i * 4 + 4) g where p_responses ? ('q' || g)));
      v_i := v_i + 1;
    end loop;
    select count(*) into v_answered from generate_series(1, 24) g where p_responses ? ('q' || g);
    return jsonb_build_object('items_expected', 24, 'items_answered', v_answered, 'complete', v_answered = 24,
      'block_items_answered', v_subscales, 'scores', null, 'scoring_status', 'scoring_key_not_provided');
  end if;
  return '{}'::jsonb;
end;
$$;

-- ── Reglas de integridad, versión, corrección y autoría ─────────────────────

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
  if new.instrument_code = 'VERITAS_PRO' and new.responses <> '{}'::jsonb then
    raise exception 'VERITAS-Pro no tiene versión aprobada en COAMO (documento fuente no aportado): no se admiten respuestas.';
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
  new.scoring_version := case when new.instrument_code = 'VERITAS_PRO' then null else 'coamo-q-1' end;

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

create trigger trg_coag_qadm_rules before insert or update on public.coag_questionnaire_administrations
for each row execute function coag_private.enforce_questionnaire_administration();
create trigger trg_coag_qadm_audit after insert or update or delete on public.coag_questionnaire_administrations
for each row execute function coag_private.write_audit_log();

-- ── RLS y privilegios ───────────────────────────────────────────────────────

alter table public.coag_questionnaire_administrations enable row level security;
revoke all on public.coag_questionnaire_administrations from public, anon, authenticated;
revoke all on function
  coag_private.questionnaire_items(text),
  coag_private.questionnaire_version(text, text),
  coag_private.questionnaire_scores(text, jsonb, jsonb),
  coag_private.enforce_questionnaire_administration()
from public, anon, authenticated;

create policy coag_app_gate on public.coag_questionnaire_administrations as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));

create policy coag_qadm_select on public.coag_questionnaire_administrations for select to authenticated
  using (coag_private.can_access_visit(visit_id));
create policy coag_qadm_insert on public.coag_questionnaire_administrations for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_qadm_update on public.coag_questionnaire_administrations for update to authenticated
  using (coag_private.can_access_visit(visit_id))
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_qadm_delete on public.coag_questionnaire_administrations for delete to authenticated
  using (coag_private.is_coordinator());

grant select on public.coag_questionnaire_administrations to authenticated;
grant insert (visit_id, instrument_code, status, status_reason_code, status_reason_detail, administration_mode,
              data_source, administration_date, responses, item_applicability),
      update (status, status_reason_code, status_reason_detail, administration_mode, data_source,
              administration_date, responses, item_applicability, correction_reason)
  on public.coag_questionnaire_administrations to authenticated;
grant delete on public.coag_questionnaire_administrations to authenticated;
