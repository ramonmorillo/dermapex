-- DERMAPEX · 03 · Medicación longitudinal y catálogo normalizado (CIMA).
--
-- Reutiliza la arquitectura de IRIS, pero escribe aquí el DDL completo de med_catalog_*, que en
-- IRIS se creó fuera de las migraciones. Columnas alineadas con
-- src/features/medications/{medicationsService,normalizedCatalog/*}.ts.
-- No contiene listas de tratamientos de dermatitis atópica.

-- ── Catálogo local de medicamentos seleccionables ───────────────────────────

create table public.medication_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('external_cima', 'manual')),
  source_code text,
  display_name text not null check (length(trim(display_name)) >= 2),
  active_ingredient text,
  strength text,
  form text,
  route text,
  atc_code text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (source <> 'external_cima' or source_code is not null)
);

create unique index uq_medication_catalog_source_code
  on public.medication_catalog(source, source_code) where source_code is not null;
create index idx_medication_catalog_display_name on public.medication_catalog(display_name);
create index idx_medication_catalog_active_ingredient on public.medication_catalog(active_ingredient);

create trigger trg_medication_catalog_created_by
before insert or update on public.medication_catalog
for each row execute function app_private.stamp_actor_column('created_by');

create trigger trg_medication_catalog_updated_at
before update on public.medication_catalog
for each row execute function app_private.set_updated_at();

-- ── Catálogo normalizado (ingredientes, conceptos, productos, alias) ─────────

create table public.med_catalog_ingredients (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('cima', 'internal', 'manual')),
  external_id text,
  name_normalized text not null unique,
  name_display text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_med_catalog_ingredients_updated_at
before update on public.med_catalog_ingredients
for each row execute function app_private.set_updated_at();

create table public.med_catalog_concepts (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  fingerprint text not null unique,
  strength_text text,
  pharmaceutical_form text,
  pharmaceutical_form_simplified text,
  route_default text,
  is_combination boolean not null default false,
  atc_codes text[] not null default '{}',
  source_priority text check (source_priority is null or source_priority in ('cima', 'internal', 'manual')),
  normalization_status text not null default 'exact' check (normalization_status in ('exact', 'inferred', 'manual_review')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_med_catalog_concepts_updated_at
before update on public.med_catalog_concepts
for each row execute function app_private.set_updated_at();

create table public.med_catalog_concept_ingredients (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.med_catalog_concepts(id) on delete cascade,
  ingredient_id uuid not null references public.med_catalog_ingredients(id) on delete restrict,
  amount_text text,
  unit text,
  sort_order integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  unique (concept_id, ingredient_id)
);

create table public.med_catalog_products (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.med_catalog_concepts(id) on delete restrict,
  source text not null check (source in ('external_cima', 'internal', 'manual')),
  cima_cn text,
  cima_nregistro text,
  cima_name text,
  labtitular text,
  commercialized boolean,
  authorization_status text,
  pharmaceutical_form text,
  pharmaceutical_form_simplified text,
  routes text[],
  atc_codes text[] not null default '{}',
  vmpp text,
  vmp text,
  raw_payload jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index uq_med_catalog_products_cima_cn on public.med_catalog_products(cima_cn) where cima_cn is not null;
create index idx_med_catalog_products_concept on public.med_catalog_products(concept_id);

create trigger trg_med_catalog_products_updated_at
before update on public.med_catalog_products
for each row execute function app_private.set_updated_at();

create table public.med_catalog_aliases (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.med_catalog_concepts(id) on delete cascade,
  alias_text text not null,
  alias_normalized text not null,
  alias_type text not null check (alias_type in ('cima_name', 'generic', 'brand', 'manual', 'typo')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (concept_id, alias_normalized)
);

-- ── Medicación del paciente y eventos por visita ────────────────────────────

create table public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_catalog_id uuid not null references public.medication_catalog(id) on delete restrict,
  catalog_concept_id uuid references public.med_catalog_concepts(id) on delete set null,
  catalog_product_id uuid references public.med_catalog_products(id) on delete set null,
  selection_source text check (selection_source is null or selection_source in ('internal', 'external_cima', 'external_other', 'manual')),
  selected_label_snapshot text,
  selected_source_payload jsonb,
  dose_text text,
  frequency_text text,
  route_text text,
  indication text,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index idx_patient_medications_patient_active on public.patient_medications(patient_id, is_active);
create index idx_patient_medications_catalog on public.patient_medications(medication_catalog_id);

create trigger trg_patient_medications_created_by
before insert or update on public.patient_medications
for each row execute function app_private.stamp_actor_column('created_by');

create trigger trg_patient_medications_updated_at
before update on public.patient_medications
for each row execute function app_private.set_updated_at();

create table public.visit_medication_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  patient_medication_id uuid not null references public.patient_medications(id) on delete cascade,
  event_type text not null check (event_type in ('added', 'modified', 'stopped', 'confirmed_no_change')),
  old_value jsonb,
  new_value jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_visit_medication_events_visit on public.visit_medication_events(visit_id, created_at desc);
create index idx_visit_medication_events_medication on public.visit_medication_events(patient_medication_id, created_at desc);

create trigger trg_visit_medication_events_created_by
before insert or update on public.visit_medication_events
for each row execute function app_private.stamp_actor_column('created_by');

-- El evento solo puede enlazar una visita y una medicación del MISMO paciente.
create or replace function app_private.enforce_medication_event_patient_match()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.visits v
      join public.patient_medications pm on pm.patient_id = v.patient_id
     where v.id = new.visit_id and pm.id = new.patient_medication_id
  ) then
    raise exception 'La visita y la medicación del evento pertenecen a pacientes distintos.';
  end if;
  return new;
end;
$$;

create trigger trg_visit_medication_events_patient_match
before insert or update of visit_id, patient_medication_id on public.visit_medication_events
for each row execute function app_private.enforce_medication_event_patient_match();

-- ── Auditoría (IRIS no auditaba la medicación) ───────────────────────────────

create trigger trg_patient_medications_audit after insert or update or delete on public.patient_medications
for each row execute function app_private.write_audit_log();
create trigger trg_visit_medication_events_audit after insert or update or delete on public.visit_medication_events
for each row execute function app_private.write_audit_log();
