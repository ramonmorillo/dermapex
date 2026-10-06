-- DERMAPEX · 07 · Cohorte del estudio por CENTRO (decisión D5 · PENDIENTE VALIDACIÓN IP).
--
-- Diseño observacional con asignación por centro: cohorte AF CMO-MAPEX ('cmo') frente a cohorte AF
-- estándar ('standard'). La cohorte determina qué ve el centro (migración 20261006100200).
--
-- Reglas (impuestas en la base de datos, no solo en la interfaz):
--   · Obligatoria en todo centro NUEVO. Los centros existentes quedan con NULL hasta que coordinación
--     la asigne; mientras sea NULL no se pueden dar de alta pacientes ni estratificar en ese centro.
--   · Solo coordinación puede asignarla (por API). El SQL del panel (sin usuario de API) también puede,
--     porque es la vía de administración actual de centros.
--   · No puede cambiarse ni anularse si el centro ya tiene pacientes (también desde SQL). La primera
--     asignación (NULL → valor) se permite aunque existan pacientes previos, para no bloquear centros
--     creados antes de esta migración.
--   · Cada cambio queda en audit_log (trigger trg_centers_audit, ya existente).

alter table public.centers
  add column study_arm text check (study_arm is null or study_arm in ('cmo', 'standard'));

comment on column public.centers.study_arm is
  'Cohorte del centro: cmo = atención farmacéutica CMO-MAPEX; standard = atención farmacéutica estándar (comparador). Obligatoria en centros nuevos; inmutable si el centro tiene pacientes. Decisión D5, PENDIENTE VALIDACIÓN IP.';

create or replace function app_private.enforce_center_study_arm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.study_arm is null then
      raise exception 'La cohorte del centro (study_arm: cmo o standard) es obligatoria.';
    end if;
    if auth.uid() is not null and not app_private.is_coordinator() then
      raise exception 'Solo coordinación puede asignar la cohorte de un centro.';
    end if;
    return new;
  end if;

  if new.study_arm is distinct from old.study_arm then
    if auth.uid() is not null and not app_private.is_coordinator() then
      raise exception 'Solo coordinación puede asignar la cohorte de un centro.';
    end if;
    if new.study_arm is null then
      raise exception 'La cohorte de un centro no puede anularse una vez asignada.';
    end if;
    if old.study_arm is not null and exists (select 1 from public.patients p where p.center_id = new.id) then
      raise exception 'No se puede cambiar la cohorte del centro %: ya tiene pacientes incluidos.', new.code;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_centers_study_arm
before insert or update on public.centers
for each row execute function app_private.enforce_center_study_arm();

-- Sin cohorte asignada no se incluyen pacientes (evita datos generados con un brazo indeterminado).
create or replace function app_private.enforce_patient_center_has_arm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.center_id is not null
     and (tg_op = 'INSERT' or new.center_id is distinct from old.center_id)
     and not exists (select 1 from public.centers c where c.id = new.center_id and c.study_arm is not null) then
    raise exception 'El centro no tiene cohorte asignada (cmo/standard). Contacte con coordinación.';
  end if;
  return new;
end;
$$;

-- Nombre posterior a trg_patients_default_center (orden alfabético): el centro ya está asignado.
create trigger trg_patients_zz_center_has_arm
before insert or update of center_id on public.patients
for each row execute function app_private.enforce_patient_center_has_arm();

-- ── Funciones de cohorte reutilizadas por la RLS ────────────────────────────

create or replace function app_private.visit_study_arm(p_visit_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.study_arm
    from public.visits v
    join public.patients p on p.id = v.patient_id
    join public.centers c on c.id = p.center_id
   where v.id = p_visit_id;
$$;

-- D5: resultados CMO (puntuación, nivel, puntos por ítem, regla especial) visibles para coordinación
-- o para centros de la cohorte CMO con acceso a la visita. Nunca para el brazo estándar.
create or replace function app_private.can_view_cmo_results(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.can_access_visit(p_visit_id)
     and (app_private.is_coordinator() or app_private.visit_study_arm(p_visit_id) = 'cmo');
$$;

-- Acceso al catálogo CMO de intervenciones: coordinación o miembro de algún centro de la cohorte CMO.
create or replace function app_private.has_cmo_center_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_coordinator()
      or exists (
        select 1
          from public.center_memberships cm
          join public.profiles p on p.id = cm.profile_id and p.is_active
          join public.centers c on c.id = cm.center_id and c.study_arm = 'cmo'
         where cm.profile_id = auth.uid()
      );
$$;

revoke all on function
  app_private.enforce_center_study_arm(),
  app_private.enforce_patient_center_has_arm(),
  app_private.visit_study_arm(uuid),
  app_private.can_view_cmo_results(uuid),
  app_private.has_cmo_center_access()
from public;
grant execute on function
  app_private.visit_study_arm(uuid),
  app_private.can_view_cmo_results(uuid),
  app_private.has_cmo_center_access()
to authenticated;
