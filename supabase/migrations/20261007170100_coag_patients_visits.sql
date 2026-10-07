-- COAMO · 04 · Pacientes, inclusión, visitas y datos clínicos (entrega A).
--
-- Fuentes: protocolo COAMO (P, IIS La Fe, 30/08/2026) y decisiones del IP de 2026-10-07
-- (docs/coamo/COAMO_CMO_MODEL_SPEC.md §5). La estratificación CMO, las intervenciones y los
-- cuestionarios llegan en la entrega B.
--
-- Reglas del estudio aplicadas en la base de datos (no solo en la interfaz):
--   · Paciente seudonimizado: código COAMO-<n>-NNNN asignado por la BD (n = número del centro).
--     Sin nombre, NHC, DNI, contacto ni fecha de nacimiento.
--   · Solo centros reclutadores activos con número de estudio incluyen pacientes (Valme, no).
--   · Inclusión (P p. 9): exige todos los criterios de inclusión, ningún criterio de exclusión,
--     consentimiento escrito con fecha y edad ≥18. Los cuestionarios pueden cumplimentarse con
--     apoyo; se registra el tipo de apoyo (decisión IP).
--   · Visitas solo de pacientes incluidos; una basal y una final por paciente; la final se
--     espera a los 12 meses de la basal ±1 mes (P p. 14; decisión IP): fuera de ventana se admite
--     y se señala, no se bloquea ni se altera la fecha real.
--   · Datos clínicos y de tratamiento de P pp. 10-12 en las visitas basal y final. NULL = no
--     registrado (nunca se convierte en «No» ni en cero).

-- ── Auditoría: contexto de paciente y visita ────────────────────────────────

alter table public.coag_audit_log add column patient_id uuid, add column visit_id uuid;
create index idx_coag_audit_log_patient on public.coag_audit_log(patient_id) where patient_id is not null;

-- ── Pacientes ───────────────────────────────────────────────────────────────

create table public.coag_patients (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.coag_centers(id) on delete restrict,
  center_seq integer not null,
  study_code text not null unique,
  age_at_inclusion integer check (age_at_inclusion between 0 and 120),
  sex text check (sex in ('male', 'female')),
  diagnosis text not null check (diagnosis in ('HA', 'HB', 'EVW')),
  status text not null default 'screening'
    check (status in ('screening', 'included', 'not_included', 'withdrawn', 'lost_to_followup', 'completed')),
  status_reason text check (status_reason in (
    'not_eligible', 'declined', 'consent_withdrawn', 'investigator_decision', 'transfer_other_center', 'other')),
  inclusion_date date,
  status_changed_at timestamptz,
  created_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (center_id, center_seq)
);

comment on table public.coag_patients is
  'Paciente COAMO seudonimizado. Prohibidos identificadores directos (nombre, NHC, DNI, teléfono, email, dirección, fecha de nacimiento). La correspondencia código-paciente se custodia en el centro.';
comment on column public.coag_patients.status_reason is
  'Motivo del estado. Vocabulario PROVISIONAL (el protocolo no lo define; blueprint C18): validar con el IP.';

create index idx_coag_patients_center on public.coag_patients(center_id);

-- Contador interno por centro (no expuesto en la API).
create table coag_private.patient_code_counters (
  center_id uuid primary key references public.coag_centers(id) on delete restrict,
  last_seq integer not null default 0
);
revoke all on coag_private.patient_code_counters from public, anon, authenticated;

-- ── Inclusión: elegibilidad y consentimiento (1:1 con el paciente) ──────────

create table public.coag_inclusions (
  patient_id uuid primary key references public.coag_patients(id) on delete cascade,
  inc_age_18 boolean,
  inc_diagnosis boolean,
  inc_written_consent boolean,
  inc_no_limiting_condition boolean,
  inc_hospital_pharmacy_followup boolean,
  exc_unable_without_support boolean,
  exc_unable_visits boolean,
  exc_interfering_trial boolean,
  questionnaire_support text check (questionnaire_support in ('none', 'family_or_caregiver', 'professional', 'other')),
  consent_date date,
  consent_version text check (consent_version is null or length(trim(consent_version)) between 1 and 40),
  verified_in_clinical_record boolean,
  assessed_by uuid references public.coag_profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.coag_inclusions is
  'Criterios de inclusión/exclusión (protocolo p. 9) y consentimiento escrito. NULL = no evaluado. questionnaire_support: apoyo para cumplimentar cuestionarios (decisión IP 2026-10-07).';

-- ── Visitas y contactos ─────────────────────────────────────────────────────

create table public.coag_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.coag_patients(id) on delete cascade,
  visit_type text not null check (visit_type in ('baseline', 'followup', 'final', 'contact')),
  visit_date date not null,
  status text not null default 'completed' check (status in ('scheduled', 'completed', 'cancelled', 'not_done')),
  modality text not null check (modality in ('in_person', 'phone', 'video', 'digital_platform')),
  is_scheduled boolean not null default true,
  created_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.coag_visits is
  'Visitas evaluativas (basal, seguimiento, final) y contactos asistenciales (P pp. 11-12, 14-15). modality: presencial o no presencial (teléfono, videollamada, plataforma digital). is_scheduled: programada / no programada.';

create index idx_coag_visits_patient on public.coag_visits(patient_id, visit_date);
create unique index uq_coag_visits_one_baseline on public.coag_visits(patient_id)
  where visit_type = 'baseline' and status <> 'cancelled';
create unique index uq_coag_visits_one_final on public.coag_visits(patient_id)
  where visit_type = 'final' and status <> 'cancelled';

-- ── Datos clínicos y de tratamiento (visitas basal y final; P pp. 10-12) ────

create table public.coag_clinical_assessments (
  visit_id uuid primary key references public.coag_visits(id) on delete cascade,
  -- Demográficas / antropometría (P p. 10)
  weight_kg numeric(5, 1) check (weight_kg > 0),
  height_m numeric(3, 2) check (height_m > 0),
  bmi numeric(4, 1) generated always as (
    case when weight_kg is not null and height_m is not null then round(weight_kg / (height_m * height_m), 1) end
  ) stored,
  -- Sociosanitarias (P pp. 10-11)
  education_level text check (education_level in ('none', 'primary', 'secondary', 'higher')),
  employment_status text check (employment_status in ('employed', 'unemployed', 'retired', 'sick_leave')),
  socioeconomic_status text check (socioeconomic_status in ('favorable', 'unfavorable')),
  family_support boolean,
  functional_autonomy boolean,
  physical_activity text check (physical_activity in ('sedentary', 'moderate', 'intense')),
  hospital_access_difficulty boolean,
  ict_access boolean,
  disease_knowledge text check (disease_knowledge in ('limited', 'adequate')),
  -- Comorbilidades y hábitos (P p. 11)
  infection_from_blood_products boolean,
  diabetes boolean,
  hypertension boolean,
  obesity boolean,
  psychological_problems boolean,
  smoking boolean,
  alcohol_use boolean,
  -- Clínicas (P pp. 11-12)
  hemophilia_severity text check (hemophilia_severity in ('mild', 'moderate', 'severe')),
  vwd_type text check (vwd_type in ('1', '2', '3')),
  years_since_diagnosis integer check (years_since_diagnosis >= 0),
  inhibitors boolean,
  annualized_bleeding_rate numeric(6, 2) check (annualized_bleeding_rate >= 0),
  spontaneous_bleeds integer check (spontaneous_bleeds >= 0),
  traumatic_bleeds integer check (traumatic_bleeds >= 0),
  annualized_joint_bleeding_rate numeric(6, 2) check (annualized_joint_bleeding_rate >= 0),
  bleeding_severity_last_year text check (bleeding_severity_last_year in ('not_applicable', 'outpatient', 'hospital_admission')),
  hemophilic_arthropathy boolean,
  target_joint_present boolean,
  target_joint_detail text check (target_joint_detail is null or length(trim(target_joint_detail)) between 1 and 80),
  joint_pain text check (joint_pain in ('absent', 'mild_moderate', 'persistent')),
  hjhs_score numeric(5, 1) check (hjhs_score >= 0),
  head_us_score numeric(5, 1) check (head_us_score >= 0),
  -- Tratamiento (P p. 11)
  treatment_regimen text check (treatment_regimen in ('prophylaxis', 'on_demand')),
  treatment_type text check (treatment_type in (
    'plasma_derived', 'recombinant_standard', 'recombinant_extended', 'non_replacement', 'rebalancing', 'gene_therapy')),
  hemostatic_agent text check (hemostatic_agent is null or length(trim(hemostatic_agent)) between 2 and 120),
  regimen_changed_since_last_visit boolean,
  dispensing_mode text check (dispensing_mode in ('hospital', 'proximity_home', 'proximity_pharmacy')),
  polypharmacy boolean,
  -- Resultados terapéuticos (P p. 12)
  deficient_factor_level numeric(7, 3) check (deficient_factor_level >= 0),
  half_life_hours numeric(6, 2) check (half_life_hours > 0),
  auc numeric(10, 2) check (auc >= 0),
  dose_modified boolean,
  hemostatic_agent_changed boolean,
  factor_needed_for_bleeds boolean,
  -- Registro de dispensaciones de los últimos 12 meses (P p. 12)
  dispensations_collected integer check (dispensations_collected >= 0),
  dispensations_expected integer check (dispensations_expected >= 0),
  updated_by uuid references public.coag_profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coag_ca_target_joint_detail check (target_joint_present is true or target_joint_detail is null)
);

comment on table public.coag_clinical_assessments is
  'Variables del protocolo COAMO (pp. 10-12) en visita basal o final. NULL = no registrado. Polifarmacia: ≥5 medicamentos concurrentes; tasas anualizadas según definiciones de P p. 11 (ventana de cálculo pendiente de definir, blueprint C10). target_joint_detail: localización sin datos identificativos.';

-- ── Utilidades privadas ─────────────────────────────────────────────────────

create or replace function coag_private.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Sella quién evaluó la inclusión.
create or replace function coag_private.set_assessed_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.assessed_by := auth.uid();
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Asigna código y correlativo al alta; impide cambiar centro, código o correlativo.
create or replace function coag_private.assign_patient_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center public.coag_centers%rowtype;
  v_seq integer;
begin
  if tg_op = 'UPDATE' then
    if new.center_id is distinct from old.center_id or new.study_code is distinct from old.study_code
       or new.center_seq is distinct from old.center_seq then
      raise exception 'El centro y el código de estudio de un paciente no se pueden modificar.';
    end if;
    return new;
  end if;

  select * into v_center from public.coag_centers c where c.id = new.center_id;
  if not found then
    raise exception 'Centro COAMO inexistente.';
  end if;
  if v_center.center_role <> 'recruiting' then
    raise exception 'El centro % no incluye pacientes (centro consultor).', v_center.name;
  end if;
  if not v_center.is_active then
    raise exception 'El centro % está inactivo.', v_center.name;
  end if;
  if v_center.study_number is null then
    raise exception 'El centro % no tiene número de estudio asignado. Contacte con coordinación.', v_center.name;
  end if;

  insert into coag_private.patient_code_counters as pc (center_id, last_seq)
  values (new.center_id, 1)
  on conflict (center_id) do update set last_seq = pc.last_seq + 1
  returning last_seq into v_seq;

  new.center_seq := v_seq;
  new.study_code := 'COAMO-' || v_center.study_number || '-' || lpad(v_seq::text, 4, '0');
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  new.status := 'screening';
  new.status_reason := null;
  new.inclusion_date := null;
  return new;
end;
$$;

-- Fila de inclusión vacía para cada paciente nuevo.
create or replace function coag_private.create_inclusion_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coag_inclusions (patient_id) values (new.id);
  return new;
end;
$$;

-- ¿Cumple la elegibilidad completa del protocolo (p. 9)?
create or replace function coag_private.inclusion_ready(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select i.inc_age_18 is true and i.inc_diagnosis is true and i.inc_written_consent is true
       and i.inc_no_limiting_condition is true and i.inc_hospital_pharmacy_followup is true
       and i.exc_unable_without_support is false and i.exc_unable_visits is false
       and i.exc_interfering_trial is false
       and i.consent_date is not null
       and p.age_at_inclusion >= 18
       and p.sex is not null
      from public.coag_inclusions i
      join public.coag_patients p on p.id = i.patient_id
     where i.patient_id = p_patient_id
  ), false);
$$;

-- Máquina de estados del paciente.
create or replace function coag_private.enforce_patient_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    if new.inclusion_date is distinct from old.inclusion_date then
      raise exception 'La fecha de inclusión la fija la base de datos al incluir al paciente.';
    end if;
    return new;
  end if;

  if old.status = 'screening' and new.status = 'included' then
    if not coag_private.inclusion_ready(new.id) then
      raise exception 'No se puede incluir: faltan criterios de inclusión, hay algún criterio de exclusión, falta la fecha del consentimiento escrito, el sexo o la edad (≥18).';
    end if;
    new.inclusion_date := (select i.consent_date from public.coag_inclusions i where i.patient_id = new.id);
    new.status_reason := null;
  elsif old.status = 'screening' and new.status = 'not_included' then
    if new.status_reason is null then
      raise exception 'Indique el motivo de no inclusión.';
    end if;
  elsif old.status = 'included' and new.status in ('withdrawn', 'lost_to_followup') then
    if new.status_reason is null then
      raise exception 'Indique el motivo de la salida del estudio.';
    end if;
  elsif old.status = 'included' and new.status = 'completed' then
    if not exists (
      select 1 from public.coag_visits v
       where v.patient_id = new.id and v.visit_type = 'final' and v.status = 'completed'
    ) then
      raise exception 'Para finalizar el seguimiento debe existir la visita final realizada.';
    end if;
    new.status_reason := null;
  else
    raise exception 'Cambio de estado no permitido (% → %). Las correcciones las realiza coordinación por SQL.', old.status, new.status;
  end if;

  new.status_changed_at := timezone('utc', now());
  return new;
end;
$$;

-- Coherencia de las visitas con el estudio.
create or replace function coag_private.enforce_visit_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.coag_patients%rowtype;
  v_baseline_date date;
begin
  if tg_op = 'UPDATE' and (new.patient_id is distinct from old.patient_id or new.visit_type is distinct from old.visit_type) then
    raise exception 'El paciente y el tipo de una visita no se pueden modificar: anule la visita y regístrela de nuevo.';
  end if;

  select * into v_patient from public.coag_patients p where p.id = new.patient_id;
  if tg_op = 'INSERT' and v_patient.status <> 'included' then
    raise exception 'Solo se registran visitas de pacientes incluidos (estado actual: %).', v_patient.status;
  end if;

  if new.visit_type = 'baseline' then
    if v_patient.inclusion_date is not null and new.visit_date < v_patient.inclusion_date then
      raise exception 'La visita basal no puede ser anterior al consentimiento (%).', v_patient.inclusion_date;
    end if;
  else
    select v.visit_date into v_baseline_date
      from public.coag_visits v
     where v.patient_id = new.patient_id and v.visit_type = 'baseline' and v.status <> 'cancelled';
    if v_baseline_date is null then
      raise exception 'Registre primero la visita basal.';
    end if;
    if new.visit_date < v_baseline_date then
      raise exception 'La visita no puede ser anterior a la basal (%).', v_baseline_date;
    end if;
  end if;

  if new.visit_type in ('baseline', 'final') and new.status = 'completed' and new.visit_date > current_date then
    raise exception 'Una visita realizada no puede tener fecha futura.';
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Datos clínicos: solo en basal/final y coherentes con el diagnóstico.
create or replace function coag_private.enforce_clinical_assessment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_diagnosis text;
begin
  if tg_op = 'UPDATE' and new.visit_id is distinct from old.visit_id then
    raise exception 'La visita de un registro clínico no se puede modificar.';
  end if;

  select v.visit_type, p.diagnosis into v_type, v_diagnosis
    from public.coag_visits v join public.coag_patients p on p.id = v.patient_id
   where v.id = new.visit_id;

  if v_type not in ('baseline', 'final') then
    raise exception 'Los datos clínicos del protocolo se registran en las visitas basal y final.';
  end if;
  if v_diagnosis in ('HA', 'HB') and new.vwd_type is not null then
    raise exception 'El tipo de EVW solo aplica a pacientes con enfermedad de von Willebrand.';
  end if;
  if v_diagnosis = 'EVW' and new.hemophilia_severity is not null then
    raise exception 'La gravedad de la hemofilia solo aplica a pacientes con hemofilia A o B.';
  end if;
  return new;
end;
$$;

-- No se cambia el número ni la función de un centro que ya tiene pacientes.
create or replace function coag_private.enforce_center_with_patients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.study_number is distinct from old.study_number or new.center_role is distinct from old.center_role)
     and exists (select 1 from public.coag_patients p where p.center_id = old.id) then
    raise exception 'El centro % ya tiene pacientes: no se puede cambiar su número de estudio ni su función.', old.name;
  end if;
  return new;
end;
$$;

-- Auditoría: resuelve paciente, visita y centro también para las tablas nuevas.
create or replace function coag_private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_patient_id uuid;
  v_visit_id uuid;
  v_center_id uuid;
begin
  v_patient_id := case when tg_table_name = 'coag_patients' then (v_row ->> 'id')::uuid else (v_row ->> 'patient_id')::uuid end;
  v_visit_id := case when tg_table_name = 'coag_visits' then (v_row ->> 'id')::uuid else (v_row ->> 'visit_id')::uuid end;
  if v_patient_id is null and v_visit_id is not null then
    select v.patient_id into v_patient_id from public.coag_visits v where v.id = v_visit_id;
  end if;
  v_center_id := case when tg_table_name = 'coag_centers' then (v_row ->> 'id')::uuid else (v_row ->> 'center_id')::uuid end;
  if v_center_id is null and v_patient_id is not null then
    select p.center_id into v_center_id from public.coag_patients p where p.id = v_patient_id;
  end if;

  insert into public.coag_audit_log (actor_id, center_id, patient_id, visit_id, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(), v_center_id, v_patient_id, v_visit_id, tg_table_name,
    coalesce((v_row ->> 'id')::uuid, (v_row ->> 'patient_id')::uuid, (v_row ->> 'visit_id')::uuid),
    tg_op, v_old, v_new
  );
  return coalesce(new, old);
end;
$$;

-- ── Decisión de acceso por paciente y visita ────────────────────────────────

create or replace function coag_private.can_access_patient(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coag_patients p
     where p.id = p_patient_id and coag_private.can_access_center(p.center_id)
  );
$$;

create or replace function coag_private.can_access_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coag_visits v
      join public.coag_patients p on p.id = v.patient_id
     where v.id = p_visit_id and coag_private.can_access_center(p.center_id)
  );
$$;

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger trg_coag_patients_a_code before insert or update on public.coag_patients
for each row execute function coag_private.assign_patient_code();
create trigger trg_coag_patients_b_status before update on public.coag_patients
for each row execute function coag_private.enforce_patient_status();
create trigger trg_coag_patients_updated_at before update on public.coag_patients
for each row execute function coag_private.set_updated_at();
create trigger trg_coag_patients_inclusion_row after insert on public.coag_patients
for each row execute function coag_private.create_inclusion_row();

create trigger trg_coag_inclusions_assessed_by before update on public.coag_inclusions
for each row execute function coag_private.set_assessed_by();

create trigger trg_coag_visits_rules before insert or update on public.coag_visits
for each row execute function coag_private.enforce_visit_rules();

create trigger trg_coag_clinical_rules before insert or update on public.coag_clinical_assessments
for each row execute function coag_private.enforce_clinical_assessment();
create trigger trg_coag_clinical_updated_by before insert or update on public.coag_clinical_assessments
for each row execute function coag_private.set_updated_by();

create trigger trg_coag_centers_with_patients before update on public.coag_centers
for each row execute function coag_private.enforce_center_with_patients();

create trigger trg_coag_patients_audit after insert or update or delete on public.coag_patients
for each row execute function coag_private.write_audit_log();
create trigger trg_coag_inclusions_audit after insert or update or delete on public.coag_inclusions
for each row execute function coag_private.write_audit_log();
create trigger trg_coag_visits_audit after insert or update or delete on public.coag_visits
for each row execute function coag_private.write_audit_log();
create trigger trg_coag_clinical_audit after insert or update or delete on public.coag_clinical_assessments
for each row execute function coag_private.write_audit_log();

-- ── Calendario del paciente (ventana de la visita final) ────────────────────
-- security_invoker: aplica la RLS de quien consulta.

create view public.coag_patient_schedule with (security_invoker = true) as
select
  p.id as patient_id,
  b.visit_date as baseline_date,
  (b.visit_date + interval '12 months')::date as final_due_date,
  (b.visit_date + interval '11 months')::date as final_window_start,
  (b.visit_date + interval '13 months')::date as final_window_end,
  f.visit_date as final_date,
  f.status as final_status,
  case when f.visit_date is not null then f.visit_date - (b.visit_date + interval '12 months')::date end as final_deviation_days,
  case when f.visit_date is not null then
    f.visit_date between (b.visit_date + interval '11 months')::date and (b.visit_date + interval '13 months')::date
  end as final_in_window
from public.coag_patients p
left join public.coag_visits b on b.patient_id = p.id and b.visit_type = 'baseline' and b.status <> 'cancelled'
left join public.coag_visits f on f.patient_id = p.id and f.visit_type = 'final' and f.status <> 'cancelled';

comment on view public.coag_patient_schedule is
  'Fecha esperada de la visita final = basal + 12 meses; ventana ±1 mes (protocolo p. 14; decisión IP 2026-10-07).';

-- ── RLS y privilegios ───────────────────────────────────────────────────────

alter table public.coag_patients enable row level security;
alter table public.coag_inclusions enable row level security;
alter table public.coag_visits enable row level security;
alter table public.coag_clinical_assessments enable row level security;
alter table coag_private.patient_code_counters enable row level security;

revoke all on public.coag_patients, public.coag_inclusions, public.coag_visits, public.coag_clinical_assessments,
  public.coag_patient_schedule
  from public, anon, authenticated;

revoke all on all functions in schema coag_private from public, anon, authenticated;
grant execute on function
  coag_private.is_active_user(),
  coag_private.is_coordinator(),
  coag_private.can_access_center(uuid),
  coag_private.can_access_patient(uuid),
  coag_private.can_access_visit(uuid),
  coag_private.inclusion_ready(uuid)
to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['coag_patients', 'coag_inclusions', 'coag_visits', 'coag_clinical_assessments'] loop
    execute format(
      'create policy coag_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''coag'')) with check (app_private.has_app_access(''coag''))',
      v_table);
  end loop;
end
$$;

-- Pacientes: centro accesible; alta por cualquier profesional del centro; borrado solo coordinación.
create policy coag_patients_select on public.coag_patients for select to authenticated
  using (coag_private.can_access_center(center_id));
create policy coag_patients_insert on public.coag_patients for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_center(center_id));
create policy coag_patients_update on public.coag_patients for update to authenticated
  using (coag_private.can_access_center(center_id)) with check (coag_private.can_access_center(center_id));
create policy coag_patients_delete on public.coag_patients for delete to authenticated
  using (coag_private.is_coordinator());

create policy coag_inclusions_select on public.coag_inclusions for select to authenticated
  using (coag_private.can_access_patient(patient_id));
create policy coag_inclusions_update on public.coag_inclusions for update to authenticated
  using (coag_private.can_access_patient(patient_id)) with check (coag_private.can_access_patient(patient_id));

create policy coag_visits_select on public.coag_visits for select to authenticated
  using (coag_private.can_access_patient(patient_id));
create policy coag_visits_insert on public.coag_visits for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_patient(patient_id));
create policy coag_visits_update on public.coag_visits for update to authenticated
  using (coag_private.can_access_patient(patient_id)) with check (coag_private.can_access_patient(patient_id));
create policy coag_visits_delete on public.coag_visits for delete to authenticated
  using (coag_private.is_coordinator());

create policy coag_clinical_select on public.coag_clinical_assessments for select to authenticated
  using (coag_private.can_access_visit(visit_id));
create policy coag_clinical_insert on public.coag_clinical_assessments for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_clinical_update on public.coag_clinical_assessments for update to authenticated
  using (coag_private.can_access_visit(visit_id)) with check (coag_private.can_access_visit(visit_id));
create policy coag_clinical_delete on public.coag_clinical_assessments for delete to authenticated
  using (coag_private.is_coordinator());

grant select on public.coag_patients, public.coag_inclusions, public.coag_visits, public.coag_clinical_assessments,
  public.coag_patient_schedule to authenticated;
grant insert (center_id, age_at_inclusion, sex, diagnosis) on public.coag_patients to authenticated;
grant update (age_at_inclusion, sex, diagnosis, status, status_reason) on public.coag_patients to authenticated;
grant delete on public.coag_patients to authenticated;
grant update (inc_age_18, inc_diagnosis, inc_written_consent, inc_no_limiting_condition, inc_hospital_pharmacy_followup,
  exc_unable_without_support, exc_unable_visits, exc_interfering_trial, questionnaire_support,
  consent_date, consent_version, verified_in_clinical_record) on public.coag_inclusions to authenticated;
grant insert (patient_id, visit_type, visit_date, status, modality, is_scheduled),
      update (visit_date, status, modality, is_scheduled) on public.coag_visits to authenticated;
grant delete on public.coag_visits to authenticated;

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'coag_clinical_assessments'
     and column_name not in ('bmi', 'updated_by', 'updated_at');
  execute format('grant insert (%s) on public.coag_clinical_assessments to authenticated', v_cols);
  execute format('grant update (%s) on public.coag_clinical_assessments to authenticated',
    replace(v_cols, 'visit_id, ', ''));
end
$$;
grant delete on public.coag_clinical_assessments to authenticated;
