-- DERMAPEX · Una sola visita activa de cada tipo del calendario por paciente.
-- Un paciente no puede tener dos visitas «basal», «mes 3», … «mes 12» no canceladas: duplicarían la
-- fila del paciente en el análisis por visita. Las extraordinarias ('extra') pueden repetirse, y una
-- visita cancelada no cuenta (se puede cancelar y volver a programar el mismo tipo). visit_status
-- null cuenta como activa.
--
-- La migración NO corrige datos: si ya hay duplicados, se detiene y los enumera para que coordinación
-- decida cuál conservar (cancelar o reclasificar las demás) antes de volver a aplicarla.

do $$
declare
  v_duplicates text;
begin
  select string_agg(format('%s · %s (%s visitas)', coalesce(p.study_code, d.patient_id::text), d.visit_type, d.n), '; ' order by p.study_code, d.visit_type)
    into v_duplicates
  from (
    select patient_id, visit_type, count(*) as n
    from public.visits
    where visit_type <> 'extra' and visit_status is distinct from 'cancelled'
    group by patient_id, visit_type
    having count(*) > 1
  ) d
  left join public.patients p on p.id = d.patient_id;

  if v_duplicates is not null then
    raise exception 'Hay visitas duplicadas del mismo tipo por paciente: %. Cancela o reclasifica las sobrantes y vuelve a aplicar la migración.', v_duplicates;
  end if;
end;
$$;

create unique index uq_visits_one_active_type_per_patient on public.visits(patient_id, visit_type)
  where visit_type <> 'extra' and visit_status is distinct from 'cancelled';

comment on index public.uq_visits_one_active_type_per_patient is
  'Una visita no cancelada de cada tipo del calendario (basal, mes 3/6/9/12) por paciente; las extraordinarias pueden repetirse.';
