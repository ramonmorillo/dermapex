-- DERMAPEX · POEM y NRS de prurito en la visita basal y en la de mes 12 (decisión IP 2026-11-06).
--
-- Migración ADITIVA: no crea tablas, no modifica columnas ni toca registros existentes.
--   1) Da de alta los dos instrumentos en questionnaire_measurement_map (on conflict do nothing:
--      conserva measurement_id si ya existieran).
--   2) Añade un trigger de validación que SOLO actúa sobre los códigos POEM y PRURITUS_NRS; el resto de
--      cuestionarios (IEXPAC, DLQI, EVASAF, EQ-5D-5L, PAM-10, Morisky-Green) sigue exactamente igual.
--
-- Almacenamiento (mismo modelo que el resto: questionnaire_responses, una fila por visita e instrumento,
-- unique (visit_id, questionnaire_code) → sin duplicados por guardados repetidos; RLS por centro vigente):
--   POEM          responses = { q1..q7: entero 0-4 (solo los contestados), _version: texto }
--   PRURITUS_NRS  responses = { score: entero 0-10 (ausente = sin clave), _variant, _recall_period }
-- Un ítem sin respuesta NO se guarda como 0: se omite la clave.
--
-- PENDIENTE: derechos de reproducción de la versión española de POEM y de la NRS.

insert into public.questionnaire_measurement_map (questionnaire_code, label, instrument_version)
values
  ('POEM', 'POEM – Patient-Oriented Eczema Measure (7 ítems, últimos 7 días)',
   'POEM-ES-IP-2026-11 · castellano aportado por IP (adaptado de Charman 2013) – licencia pendiente'),
  ('PRURITUS_NRS', 'NRS de prurito – peor picor en las últimas 24 h (0-10)',
   'worst_itch_nrs_24h · adaptada de Phan 2012 – licencia pendiente')
on conflict (questionnaire_code) do nothing;

create or replace function app_private.validate_atopic_dermatitis_pro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit_type text;
  v_key text;
  v_value jsonb;
begin
  if new.questionnaire_code not in ('POEM', 'PRURITUS_NRS') then
    return new;
  end if;

  select v.visit_type into v_visit_type from public.visits v where v.id = new.visit_id;
  if v_visit_type is null or v_visit_type not in ('baseline', 'month_12') then
    raise exception '% solo se registra en la visita basal y en la de mes 12.', new.questionnaire_code;
  end if;

  if jsonb_typeof(new.responses) is distinct from 'object' then
    raise exception 'Respuestas de % no válidas.', new.questionnaire_code;
  end if;

  if new.questionnaire_code = 'POEM' then
    if jsonb_typeof(new.responses -> '_version') is distinct from 'string' then
      raise exception 'POEM: falta la versión del instrumento.';
    end if;
    for v_key, v_value in select key, value from jsonb_each(new.responses) loop
      if v_key = '_version' then
        continue;
      end if;
      if v_key not in ('q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7') then
        raise exception 'POEM: clave no admitida «%».', v_key;
      end if;
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric not in (0, 1, 2, 3, 4) then
        raise exception 'POEM: el ítem % debe ser un entero de 0 a 4.', v_key;
      end if;
    end loop;
  else
    if (new.responses ->> '_variant') is distinct from 'worst_itch_nrs_24h'
       or (new.responses ->> '_recall_period') is distinct from '24h' then
      raise exception 'NRS de prurito: variante o periodo de recuerdo no admitidos.';
    end if;
    for v_key, v_value in select key, value from jsonb_each(new.responses) loop
      if v_key in ('_variant', '_recall_period') then
        continue;
      end if;
      if v_key <> 'score' then
        raise exception 'NRS de prurito: clave no admitida «%».', v_key;
      end if;
      if jsonb_typeof(v_value) <> 'number'
         or (v_value #>> '{}')::numeric not in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10) then
        raise exception 'NRS de prurito: la puntuación debe ser un entero de 0 a 10.';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_atopic_dermatitis_pro() from public;

drop trigger if exists trg_questionnaire_responses_ad_pro on public.questionnaire_responses;
create trigger trg_questionnaire_responses_ad_pro
before insert or update on public.questionnaire_responses
for each row execute function app_private.validate_atopic_dermatitis_pro();

comment on function app_private.validate_atopic_dermatitis_pro() is
  'Valida POEM (q1-q7 enteros 0-4, _version) y PRURITUS_NRS (score entero 0-10 opcional, _variant=worst_itch_nrs_24h, _recall_period=24h) y que la visita sea basal o mes 12. No actúa sobre otros cuestionarios.';
