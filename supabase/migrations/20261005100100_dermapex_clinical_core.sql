-- DERMAPEX · 02 · Núcleo clínico genérico: pacientes, consentimientos, visitas, puntuación CMO,
-- intervenciones, cuestionarios, proceso por visita y documentos.
--
-- Columnas alineadas 1:1 con los servicios del frontend (src/services, src/features).
-- NO incluye variables clínicas de dermatitis atópica ni la tabla de evaluación clínica:
-- pendientes del protocolo/CRD (docs/DERMAPEX_NEXT_STEPS.md §1-§2).

-- ── Pacientes (seudonimizados) ──────────────────────────────────────────────

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete restrict,
  study_code text not null unique check (length(trim(study_code)) > 0),
  inclusion_date date,
  screening_date date,
  -- Estudio en adultos. La edad se calcula en el cliente; la fecha de nacimiento NO se almacena.
  age_at_inclusion integer check (age_at_inclusion is null or age_at_inclusion between 18 and 120),
  sex text check (sex is null or sex in ('female', 'male', 'other', 'unknown')),
  consent_signed boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (screening_date is null or inclusion_date is null or screening_date <= inclusion_date)
);

comment on table public.patients is
  'Paciente seudonimizado: solo código de estudio. Prohibido añadir identificadores directos (NHC, nombre, teléfono, email, fecha de nacimiento).';

create index idx_patients_center on public.patients(center_id);

-- Si el cliente no envía centro y el usuario pertenece a un único centro, se asigna ese centro.
create or replace function app_private.default_patient_center()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_count integer;
begin
  if new.center_id is null then
    select count(*), min(cm.center_id::text)::uuid
      into v_count, v_center_id
      from public.center_memberships cm
      join public.centers c on c.id = cm.center_id and c.is_active
     where cm.profile_id = auth.uid();
    if v_count = 1 then
      new.center_id := v_center_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_patients_default_center
before insert on public.patients
for each row execute function app_private.default_patient_center();

create trigger trg_patients_created_by
before insert or update on public.patients
for each row execute function app_private.stamp_actor_column('created_by');

create trigger trg_patients_updated_at
before update on public.patients
for each row execute function app_private.set_updated_at();

-- ── Consentimientos ─────────────────────────────────────────────────────────

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  consent_type text not null,
  document_version text,
  status text not null check (status in ('granted', 'revoked', 'pending')),
  granted_at timestamptz,
  revoked_at timestamptz,
  notes text,
  obtained_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on column public.consents.document_version is
  'Versión de la hoja de información/consentimiento aprobada por el CEIm.';

create index idx_consents_patient on public.consents(patient_id);

create trigger trg_consents_obtained_by
before insert or update on public.consents
for each row execute function app_private.stamp_actor_column('obtained_by');

create trigger trg_consents_updated_at
before update on public.consents
for each row execute function app_private.set_updated_at();

-- ── Visitas ─────────────────────────────────────────────────────────────────
-- visit_type = valores que escribe el frontend actual (src/constants/enums.ts). El calendario
-- DERMAPEX (basal, 6 y 12 meses) se ajustará con el protocolo (NEXT_STEPS §12).

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_type text not null check (visit_type in ('baseline', 'month_3', 'month_6', 'month_9', 'month_12', 'extra')),
  visit_number integer check (visit_number is null or visit_number > 0),
  scheduled_date date,
  visit_date date,
  visit_status text check (visit_status is null or visit_status in ('scheduled', 'completed', 'cancelled')),
  extraordinary_reason text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_visits_patient on public.visits(patient_id);
create index idx_visits_scheduled_date on public.visits(scheduled_date) where scheduled_date is not null;
create index idx_visits_visit_date on public.visits(visit_date) where visit_date is not null;

create trigger trg_visits_created_by
before insert or update on public.visits
for each row execute function app_private.stamp_actor_column('created_by');

create trigger trg_visits_updated_at
before update on public.visits
for each row execute function app_private.set_updated_at();

-- ── Puntuación CMO (estructura genérica; el motor CMO-DERMAPEX está pendiente) ─

create table public.cmo_scores (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  score numeric(6,2) not null,
  priority smallint not null check (priority in (1, 2, 3)),
  factors jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  engine_version text,
  calculated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on column public.cmo_scores.engine_version is
  'Versión del CMO-DERMAPEX scoring engine que produjo la puntuación (trazabilidad del algoritmo).';

create trigger trg_cmo_scores_calculated_by
before insert or update on public.cmo_scores
for each row execute function app_private.stamp_actor_column('calculated_by', 'restamp');

create trigger trg_cmo_scores_updated_at
before update on public.cmo_scores
for each row execute function app_private.set_updated_at();

-- Catálogo de variables del modelo CMO. Vacío: se poblará con el protocolo CMO-DERMAPEX.
create table public.cmo_variable_catalog (
  id uuid primary key default gen_random_uuid(),
  variable_code text not null unique,
  label text not null,
  domain text,
  model_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_cmo_variable_catalog_updated_at
before update on public.cmo_variable_catalog
for each row execute function app_private.set_updated_at();

create table public.cmo_score_item_results (
  id uuid primary key default gen_random_uuid(),
  cmo_score_id uuid not null references public.cmo_scores(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  variable_id uuid not null references public.cmo_variable_catalog(id) on delete restrict,
  source_question_code text,
  raw_value jsonb,
  item_score numeric(6,2) not null,
  scored_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_cmo_score_item_results_score on public.cmo_score_item_results(cmo_score_id);

create trigger trg_cmo_score_item_results_scored_by
before insert or update on public.cmo_score_item_results
for each row execute function app_private.stamp_actor_column('scored_by');

create trigger trg_cmo_score_item_results_updated_at
before update on public.cmo_score_item_results
for each row execute function app_private.set_updated_at();

-- ── Intervenciones ──────────────────────────────────────────────────────────

-- Catálogo CMO-DERMAPEX versionado. Vacío: se poblará con el protocolo (NEXT_STEPS §11).
create table public.intervention_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  domain text,
  cmo_pillar text not null check (cmo_pillar in ('capacidad', 'motivacion', 'oportunidad')),
  min_level smallint not null check (min_level in (1, 2, 3)),
  catalog_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_intervention_catalog_updated_at
before update on public.intervention_catalog
for each row execute function app_private.set_updated_at();

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  intervention_type text not null check (length(trim(intervention_type)) > 0),
  -- El frontend guarda aquí el pilar CMO con su etiqueta ('Capacidad', 'Motivación', 'Oportunidad').
  intervention_domain text,
  priority_level text check (priority_level is null or priority_level in ('low', 'medium', 'high')),
  delivered boolean,
  linked_to_cmo_level smallint check (linked_to_cmo_level is null or linked_to_cmo_level in (1, 2, 3)),
  outcome text,
  notes text,
  delivered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_interventions_visit on public.interventions(visit_id);

create trigger trg_interventions_delivered_by
before insert or update on public.interventions
for each row execute function app_private.stamp_actor_column('delivered_by');

create trigger trg_interventions_updated_at
before update on public.interventions
for each row execute function app_private.set_updated_at();

-- ── Cuestionarios ───────────────────────────────────────────────────────────
-- Catálogo de instrumentos habilitados. Vacío a propósito: no se asume que los cuestionarios de IRIS
-- formen parte de DERMAPEX. Mientras esté vacío, guardar cuestionarios devuelve un error explícito.

create table public.questionnaire_measurement_map (
  questionnaire_code text primary key check (questionnaire_code ~ '^[A-Z0-9_]{2,40}$'),
  measurement_id uuid not null unique default gen_random_uuid(),
  label text,
  instrument_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_questionnaire_measurement_map_updated_at
before update on public.questionnaire_measurement_map
for each row execute function app_private.set_updated_at();

create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  measurement_id uuid not null,
  questionnaire_code text not null references public.questionnaire_measurement_map(questionnaire_code) on delete restrict,
  responses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (visit_id, questionnaire_code)
);

create index idx_questionnaire_responses_code on public.questionnaire_responses(questionnaire_code);

-- Trazabilidad heredada de IRIS (migración 20260915074023): el código del cuestionario debe
-- coincidir con el measurement_id configurado; se rellena si falta.
create or replace function app_private.set_questionnaire_response_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mapped_code text;
begin
  select qmm.questionnaire_code into v_mapped_code
    from public.questionnaire_measurement_map qmm
   where qmm.measurement_id = new.measurement_id;

  if v_mapped_code is null then
    raise exception 'No existe un cuestionario configurado para measurement_id %.', new.measurement_id;
  end if;

  if new.questionnaire_code is null then
    new.questionnaire_code := v_mapped_code;
  elsif new.questionnaire_code <> v_mapped_code then
    raise exception 'questionnaire_code no coincide con el measurement_id configurado.';
  end if;

  return new;
end;
$$;

create trigger trg_questionnaire_response_code
before insert or update of measurement_id, questionnaire_code on public.questionnaire_responses
for each row execute function app_private.set_questionnaire_response_code();

create trigger trg_questionnaire_responses_user_id
before insert or update on public.questionnaire_responses
for each row execute function app_private.stamp_actor_column('user_id', 'restamp');

create trigger trg_questionnaire_responses_updated_at
before update on public.questionnaire_responses
for each row execute function app_private.set_updated_at();

-- ── Proceso y factibilidad por visita (variables heredadas, pendientes de validar: AUDIT R3) ─

create table public.visit_process_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  total_session_minutes integer check (total_session_minutes is null or total_session_minutes >= 0),
  stratification_performed boolean,
  stratification_level text,
  stratification_completed_correctly boolean,
  intervention_registered boolean,
  intervention_count integer check (intervention_count is null or intervention_count >= 0),
  recommendation_to_professional boolean,
  recommendation_status text check (recommendation_status is null or recommendation_status in ('accepted', 'not_accepted', 'pending', 'not_applicable')),
  patient_continues_program boolean,
  dropout_reason text,
  operational_incidents text,
  additional_admin_minutes integer check (additional_admin_minutes is null or additional_admin_minutes >= 0),
  equipment_cost numeric(10,2) check (equipment_cost is null or equipment_cost >= 0),
  additional_material_cost numeric(10,2) check (additional_material_cost is null or additional_material_cost >= 0),
  other_costs numeric(10,2) check (other_costs is null or other_costs >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_visit_process_records_created_by
before insert or update on public.visit_process_records
for each row execute function app_private.stamp_actor_column('created_by');

create trigger trg_visit_process_records_updated_at
before update on public.visit_process_records
for each row execute function app_private.set_updated_at();

-- ── Documentos de visita (PDF en Storage, bucket privado 'visit-documents') ──

create table public.visit_documents (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  original_file_name text not null,
  stored_file_path text not null unique,
  mime_type text not null check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size > 0 and file_size <= 6291456),
  document_type text not null check (document_type in ('lab_report', 'ecg', 'hospital_discharge', 'specialist_report', 'imaging', 'map', 'prescription', 'other')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- La ruta debe pertenecer a la visita registrada (visits/<visit_id>/<uuid>.pdf).
  check (stored_file_path like 'visits/' || visit_id::text || '/%')
);

create index idx_visit_documents_visit on public.visit_documents(visit_id);

create trigger trg_visit_documents_uploaded_by
before insert or update on public.visit_documents
for each row execute function app_private.stamp_actor_column('uploaded_by');

create trigger trg_visit_documents_updated_at
before update on public.visit_documents
for each row execute function app_private.set_updated_at();

-- ── Coherencia entre visita y paciente ──────────────────────────────────────

create or replace function app_private.enforce_visit_patient_match()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.visits v where v.id = new.visit_id and v.patient_id = new.patient_id) then
    raise exception 'La visita % no pertenece al paciente %.', new.visit_id, new.patient_id;
  end if;
  return new;
end;
$$;

create trigger trg_visit_process_records_patient_match
before insert or update of visit_id, patient_id on public.visit_process_records
for each row execute function app_private.enforce_visit_patient_match();

create or replace function app_private.enforce_item_result_visit_match()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cmo_scores s where s.id = new.cmo_score_id and s.visit_id = new.visit_id) then
    raise exception 'El resultado por ítem no corresponde a la visita de la puntuación CMO.';
  end if;
  return new;
end;
$$;

create trigger trg_cmo_score_item_results_visit_match
before insert or update of cmo_score_id, visit_id on public.cmo_score_item_results
for each row execute function app_private.enforce_item_result_visit_match();

-- ── Auditoría ───────────────────────────────────────────────────────────────

create trigger trg_patients_audit after insert or update or delete on public.patients
for each row execute function app_private.write_audit_log();
create trigger trg_consents_audit after insert or update or delete on public.consents
for each row execute function app_private.write_audit_log();
create trigger trg_visits_audit after insert or update or delete on public.visits
for each row execute function app_private.write_audit_log();
create trigger trg_cmo_scores_audit after insert or update or delete on public.cmo_scores
for each row execute function app_private.write_audit_log();
create trigger trg_cmo_score_item_results_audit after insert or update or delete on public.cmo_score_item_results
for each row execute function app_private.write_audit_log();
create trigger trg_interventions_audit after insert or update or delete on public.interventions
for each row execute function app_private.write_audit_log();
create trigger trg_questionnaire_responses_audit after insert or update or delete on public.questionnaire_responses
for each row execute function app_private.write_audit_log();
create trigger trg_visit_process_records_audit after insert or update or delete on public.visit_process_records
for each row execute function app_private.write_audit_log();
create trigger trg_visit_documents_audit after insert or update or delete on public.visit_documents
for each row execute function app_private.write_audit_log();
create trigger trg_cmo_variable_catalog_audit after insert or update or delete on public.cmo_variable_catalog
for each row execute function app_private.write_audit_log();
create trigger trg_intervention_catalog_audit after insert or update or delete on public.intervention_catalog
for each row execute function app_private.write_audit_log();
