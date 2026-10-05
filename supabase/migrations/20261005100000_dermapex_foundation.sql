-- DERMAPEX · 01 · Base: esquema privado, centros, perfiles, pertenencias y auditoría.
--
-- Esquema nuevo e independiente de IRIS (no deriva de sus migraciones, que no reproducen su
-- esquema real; ver docs/DERMAPEX_MIGRATION_AUDIT.md §4).
--
-- Modelo de acceso (decisión del investigador, 2026-10-05):
--   · Acceso por CENTRO: un profesional ve y edita solo los pacientes de sus centros.
--   · Roles: 'investigator' (investigador de centro) y 'coordinator' (coordinación del estudio,
--     acceso a todos los centros).
--   · Pacientes SEUDONIMIZADOS: solo código de estudio; sin NHC, nombre, teléfono, email ni fecha
--     de nacimiento. La tabla de correspondencia código ↔ identidad queda fuera de la aplicación.

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ── Utilidades genéricas de triggers ────────────────────────────────────────

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Sella la columna de autoría indicada en TG_ARGV[0] con auth.uid():
--   · INSERT: siempre auth.uid() (impide suplantar autoría desde el cliente). Si no hay usuario
--     (SQL editor / service role) se respeta el valor recibido.
--   · UPDATE: conserva el valor original, salvo que TG_ARGV[1] = 'restamp' (p. ej. calculated_by,
--     que debe reflejar quién recalculó).
create or replace function app_private.stamp_actor_column()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text := tg_argv[0];
  v_restamp boolean := coalesce(tg_argv[1], '') = 'restamp';
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' or v_restamp then
    if v_uid is not null then
      new := jsonb_populate_record(new, jsonb_build_object(v_column, v_uid));
    end if;
  else
    new := jsonb_populate_record(new, jsonb_build_object(v_column, to_jsonb(old) -> v_column));
  end if;
  return new;
end;
$$;

-- ── Centros participantes ───────────────────────────────────────────────────

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.centers is
  'Centros participantes del estudio DERMAPEX. Alta exclusiva de coordinación. Sin datos sembrados: se cargan a partir del protocolo.';

create trigger trg_centers_updated_at
before update on public.centers
for each row execute function app_private.set_updated_at();

-- ── Perfiles profesionales ──────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'investigator' check (role in ('investigator', 'coordinator')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on column public.profiles.role is
  'investigator = investigador de centro; coordinator = coordinación del estudio (todos los centros). Solo modificable por SQL/service role (sin privilegio de columna para authenticated).';
comment on column public.profiles.is_active is
  'false revoca todo acceso a datos clínicos sin borrar la trazabilidad del usuario.';

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

-- Perfil automático al crear un usuario de Auth. Rol mínimo y SIN centros: un usuario nuevo
-- (incluido uno creado por registro público) no ve ningún dato hasta que coordinación le asigne centro.
create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_users_create_profile
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

-- Usuarios de Auth ya existentes antes de esta migración.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- ── Pertenencia a centros ───────────────────────────────────────────────────

create table public.center_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  center_id uuid not null references public.centers(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, center_id)
);

create index idx_center_memberships_center on public.center_memberships(center_id);

create trigger trg_center_memberships_created_by
before insert or update on public.center_memberships
for each row execute function app_private.stamp_actor_column('created_by');

-- ── Registro de auditoría (solo inserción, vía trigger) ─────────────────────
-- Sin claves foráneas a propósito: el registro debe sobrevivir al borrado de lo auditado.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default timezone('utc', now()),
  actor_id uuid,
  center_id uuid,
  patient_id uuid,
  visit_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);

create index idx_audit_log_at on public.audit_log(at desc);
create index idx_audit_log_table_row on public.audit_log(table_name, row_id);
create index idx_audit_log_patient on public.audit_log(patient_id) where patient_id is not null;
create index idx_audit_log_center on public.audit_log(center_id) where center_id is not null;

create or replace function app_private.write_audit_log()
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
  v_patient_id := case when tg_table_name = 'patients' then (v_row ->> 'id')::uuid else (v_row ->> 'patient_id')::uuid end;
  v_visit_id := case when tg_table_name = 'visits' then (v_row ->> 'id')::uuid else (v_row ->> 'visit_id')::uuid end;

  if v_patient_id is null and v_visit_id is not null then
    select v.patient_id into v_patient_id from public.visits v where v.id = v_visit_id;
  end if;

  v_center_id := case when tg_table_name = 'centers' then (v_row ->> 'id')::uuid else (v_row ->> 'center_id')::uuid end;
  if v_center_id is null and v_patient_id is not null then
    select p.center_id into v_center_id from public.patients p where p.id = v_patient_id;
  end if;

  insert into public.audit_log (actor_id, center_id, patient_id, visit_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), v_center_id, v_patient_id, v_visit_id, tg_table_name, (v_row ->> 'id')::uuid, tg_op, v_old, v_new);

  return coalesce(new, old);
end;
$$;

create trigger trg_centers_audit after insert or update or delete on public.centers
for each row execute function app_private.write_audit_log();
create trigger trg_profiles_audit after insert or update or delete on public.profiles
for each row execute function app_private.write_audit_log();
create trigger trg_center_memberships_audit after insert or update or delete on public.center_memberships
for each row execute function app_private.write_audit_log();
