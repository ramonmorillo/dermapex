-- DERMAPEX · 12 · Código de estudio del paciente correlativo por centro, asignado por la base de datos
-- (decisión de la IP, 2026-10-06).
--
-- Formato: DPX-<número de centro>-<correlativo de 4 dígitos>   p. ej. DPX-1-0001, DPX-2-0015.
--   · centers.study_number: número del centro en el estudio (1-99). Solo coordinación lo asigna; es
--     obligatorio para incluir pacientes y no puede cambiarse ni anularse si el centro tiene pacientes
--     (mismas reglas que study_arm). Auditado por el trigger de centros existente.
--   · El correlativo se toma de patient_code_counters con bloqueo de fila: dos altas simultáneas en el
--     mismo centro nunca reciben el mismo número. Un alta rechazada (RLS, validación) deshace también
--     el incremento. Un número asignado no se reutiliza: borrar un paciente deja un hueco (queda en la
--     auditoría).
--   · El código lo calcula SIEMPRE la base de datos (se ignora el valor que envíe el cliente) y es
--     inmutable. Tampoco se permite cambiar de centro a un paciente con código asignado.
--   · El código no contiene ningún dato del paciente (seudonimización): la tabla de correspondencia
--     código ↔ identidad sigue fuera de la aplicación.
-- La numeración de los centros existentes NO va en esta migración (dato de configuración del estudio):
-- la asigna coordinación por SQL (docs/DERMAPEX_DATABASE_SETUP.md §4).

alter table public.centers
  add column study_number smallint unique check (study_number is null or study_number between 1 and 99);

comment on column public.centers.study_number is
  'Número del centro en el código de estudio (DPX-<n>-NNNN). Obligatorio para incluir pacientes; inmutable si el centro tiene pacientes. Solo coordinación.';

create or replace function app_private.enforce_center_study_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.study_number is not distinct from old.study_number then
    return new;
  end if;
  if tg_op = 'INSERT' and new.study_number is null then
    return new;  -- se puede asignar después; sin número no se incluyen pacientes
  end if;
  if auth.uid() is not null and not app_private.is_coordinator() then
    raise exception 'Solo coordinación puede asignar el número de estudio de un centro.';
  end if;
  if tg_op = 'UPDATE' then
    if new.study_number is null then
      raise exception 'El número de estudio de un centro no puede anularse una vez asignado.';
    end if;
    if old.study_number is not null and exists (select 1 from public.patients p where p.center_id = new.id) then
      raise exception 'No se puede cambiar el número de estudio del centro %: ya tiene pacientes incluidos.', new.code;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_centers_study_number
before insert or update on public.centers
for each row execute function app_private.enforce_center_study_number();

-- Contador por centro. Sin acceso desde la API: solo lo usa el trigger (SECURITY DEFINER).
create table public.patient_code_counters (
  center_id uuid primary key references public.centers(id) on delete restrict,
  last_seq integer not null default 0 check (last_seq between 0 and 9999)
);

alter table public.patient_code_counters enable row level security;
revoke all on public.patient_code_counters from public, anon, authenticated;

comment on table public.patient_code_counters is
  'Último correlativo asignado por centro para el código de estudio. Interno: solo lo escribe app_private.assign_patient_study_code().';

alter table public.patients
  add column center_seq integer check (center_seq is null or center_seq between 1 and 9999);

comment on column public.patients.study_code is
  'Código de estudio DPX-<número de centro>-<correlativo 4 dígitos>, asignado por la base de datos al dar de alta; inmutable. Sin datos identificativos.';
comment on column public.patients.center_seq is
  'Correlativo del paciente dentro de su centro (parte numérica del código de estudio).';

create unique index uq_patients_center_seq on public.patients(center_id, center_seq) where center_seq is not null;

create or replace function app_private.assign_patient_study_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number smallint;
  v_seq integer;
begin
  if tg_op = 'UPDATE' then
    if new.study_code is distinct from old.study_code or new.center_seq is distinct from old.center_seq then
      raise exception 'El código de estudio del paciente es inmutable.';
    end if;
    if new.center_id is distinct from old.center_id and old.center_seq is not null then
      raise exception 'No se puede cambiar de centro a un paciente con código de estudio asignado.';
    end if;
    return new;
  end if;

  select c.study_number into v_number from public.centers c where c.id = new.center_id;
  if v_number is null then
    raise exception 'El centro no tiene número de estudio asignado. Contacte con coordinación.';
  end if;

  insert into public.patient_code_counters as pc (center_id, last_seq)
  values (new.center_id, 1)
  on conflict (center_id) do update set last_seq = pc.last_seq + 1
  returning pc.last_seq into v_seq;

  if v_seq > 9999 then
    raise exception 'Se ha alcanzado el máximo de 9999 pacientes en el centro.';
  end if;

  new.center_seq := v_seq;
  new.study_code := 'DPX-' || v_number || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

-- Nombre posterior a trg_patients_default_center y trg_patients_zz_center_has_arm (orden alfabético):
-- el centro ya está asignado y validado cuando se genera el código.
create trigger trg_patients_zzz_study_code
before insert or update on public.patients
for each row execute function app_private.assign_patient_study_code();

revoke all on function app_private.enforce_center_study_number(), app_private.assign_patient_study_code() from public;
