-- COAMO · 09 · EVASAF: apartado «Comentarios».
--
-- Fuente: «PROYECTO EVASAF» actualizado (PDF aportado por el investigador el 03/11/2026; creado el 31/10/2026):
-- mismos 10 ítems y escala 1-5 que la versión implementada, errata «na X» corregida y un apartado nuevo
-- «Comentarios:» de texto libre al final. Referencia: Monje-Agudo P et al. Farm Hosp 2015;39(3):152-6.
--
-- Cambios (aditivos y compatibles):
--   · Columna comments (texto libre, opcional, ≤ 2000 caracteres; espacios extremos eliminados; vacío → NULL).
--   · Solo admitida en EVASAF. «No aplicable» y «no realizado» no conservan comentarios.
--   · Modificar el comentario de un EVASAF completado exige motivo de corrección (como una respuesta) y queda en
--     coag_audit_log con el valor anterior y el nuevo.
--   · No cambian ítems, escala, versión del instrumento ni puntuación (EVASAF sigue sin total; coamo-q-1).
--   · Registros previos: comments = NULL = «no recogido» (el apartado no existía en el formulario electrónico).
-- Sin cambios de RLS; se añade la columna a los privilegios de insert/update de authenticated.

alter table public.coag_questionnaire_administrations add column comments text;

comment on column public.coag_questionnaire_administrations.comments is
  'Solo EVASAF: apartado «Comentarios» del documento (texto libre del paciente, ≤ 2000). NULL = sin comentarios o no recogido (registros anteriores al 03/11/2026). No debe contener datos identificativos.';

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

  -- Comentarios (solo EVASAF: apartado «Comentarios» del documento actualizado de 31/10/2026).
  if new.comments is not null then
    new.comments := nullif(trim(new.comments), '');
  end if;
  if new.comments is not null and new.instrument_code <> 'EVASAF' then
    raise exception 'Solo EVASAF tiene apartado de comentarios en su documento fuente.';
  end if;
  if new.comments is not null and length(new.comments) > 2000 then
    raise exception 'Los comentarios admiten como máximo 2000 caracteres.';
  end if;

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
    if new.responses <> '{}'::jsonb or new.item_applicability <> '{}'::jsonb or new.comments is not null then
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
      or new.status_reason_detail is distinct from old.status_reason_detail
      or new.comments is distinct from old.comments;
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

grant insert (comments), update (comments) on public.coag_questionnaire_administrations to authenticated;
