-- DERMAPEX · Los centros de la cohorte de atención farmacéutica estándar NO estratifican.
-- Decisión del IP (2026-10-07). Sustituye la parte de D5 que hacía registrar a ciegas las variables CMO
-- en los centros 'standard' (la puntuación se calculaba y se ocultaba): la cohorte comparadora no rellena
-- ninguna variable CMO, para no exponer al farmacéutico a la valoración Capacidad-Motivación-Oportunidad.
--
-- Se impone en la base de datos (no solo en la interfaz) con un trigger sobre cmo_scores, por el que pasa
-- todo guardado (public.save_cmo_stratification incluido). Aplica a cualquier rol, también coordinación.
-- No afecta a filas ya existentes (a 2026-10-07 no hay estratificaciones en centros 'standard').

create or replace function app_private.enforce_cmo_score_arm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_arm text := app_private.visit_study_arm(new.visit_id);
begin
  if v_arm is distinct from 'cmo' then
    raise exception 'Los centros de atención farmacéutica estándar no estratifican: la estratificación CMO solo se registra en centros de la cohorte CMO.';
  end if;
  return new;
end;
$$;

create trigger trg_cmo_scores_arm
before insert or update of visit_id on public.cmo_scores
for each row execute function app_private.enforce_cmo_score_arm();

revoke all on function app_private.enforce_cmo_score_arm() from public;
