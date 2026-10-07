-- COAMO · 01 · Base de control: perfiles, centros, pertenencias y auditoría (fase 2 de la
-- convivencia DERMAPEX + COAMO en el mismo proyecto Supabase).
--
-- Diseño: docs/coamo/SUPABASE_DERMAPEX_COAG_ARCHITECTURE.md (§9, §10.2, §12, §13) y
-- docs/coamo/COAMO_FUNCTIONAL_BLUEPRINT.md (§3.2, §11). Prefijo técnico coag_*; marca COAMO.
--
-- Principios:
--   · Familia independiente: ninguna FK, helper, catálogo, log ni trigger compartido con DERMAPEX.
--     Solo se comparten Auth y la autorización por aplicación (app_private.app_access, 'coag').
--   · Autorización = identidad + acceso 'coag' activo + perfil COAMO activo + rol/centro.
--   · Los privilegios por defecto de public conceden TODO a anon/authenticated sobre tablas nuevas:
--     cada tabla se crea con RLS y se revocan los privilegios en esta misma migración, antes de
--     conceder solo los necesarios.
--   · Sin datos clínicos: pacientes, visitas, cuestionarios, CMO y documentos llegarán cuando estén
--     aprobados el CRD y el modelo CMO de coagulopatías (blueprint §8 y §16).
--
-- Decisiones del IP (2026-10-07): 7 centros reclutadores y Valme como centro consultor (sin
-- inclusión de pacientes); código de paciente futuro COAMO-<n>-NNNN (n = study_number del centro).

-- ── Esquema privado y utilidades propias ────────────────────────────────────

create schema coag_private;
revoke all on schema coag_private from public;
grant usage on schema coag_private to authenticated;

create or replace function coag_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Sella created_by con auth.uid() en el alta (sin sesión —SQL Editor— respeta el valor recibido).
create or replace function coag_private.stamp_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

-- ── Tablas de control ───────────────────────────────────────────────────────

create table public.coag_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'investigator' check (role in ('investigator', 'coordinator')),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.coag_profiles is
  'Perfil profesional COAMO. Independiente de public.profiles (DERMAPEX). Alta solo administrativa: coag_private.provision_user(email, rol). investigator = centro asignado; coordinator = coordinación COAMO (todos los centros COAMO, nunca DERMAPEX).';

create table public.coag_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,20}$'),
  name text not null check (length(trim(name)) >= 2),
  center_role text not null check (center_role in ('recruiting', 'consulting')),
  study_number integer unique check (study_number between 1 and 99),
  is_active boolean not null default true,
  created_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coag_centers_consulting_without_number check (center_role = 'recruiting' or study_number is null)
);

comment on table public.coag_centers is
  'Centros COAMO. recruiting = incluye pacientes (requerirá study_number para el código COAMO-<n>-NNNN); consulting = apoyo metodológico sin inclusión (Valme, protocolo P:9).';

create table public.coag_center_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.coag_profiles(id) on delete cascade,
  center_id uuid not null references public.coag_centers(id) on delete restrict,
  created_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, center_id)
);

create index idx_coag_center_memberships_center on public.coag_center_memberships(center_id);

-- Sin claves foráneas a propósito: el registro debe sobrevivir al borrado de lo auditado.
create table public.coag_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default timezone('utc', now()),
  actor_id uuid,
  center_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);

create index idx_coag_audit_log_at on public.coag_audit_log(at desc);
create index idx_coag_audit_log_table_row on public.coag_audit_log(table_name, row_id);

-- RLS activada y privilegios revocados ANTES de conceder nada (los defaults de public lo abren todo).
alter table public.coag_profiles enable row level security;
alter table public.coag_centers enable row level security;
alter table public.coag_center_memberships enable row level security;
alter table public.coag_audit_log enable row level security;

revoke all on public.coag_profiles, public.coag_centers, public.coag_center_memberships, public.coag_audit_log
  from public, anon, authenticated;

create trigger trg_coag_profiles_updated_at before update on public.coag_profiles
for each row execute function coag_private.set_updated_at();
create trigger trg_coag_centers_updated_at before update on public.coag_centers
for each row execute function coag_private.set_updated_at();
create trigger trg_coag_centers_created_by before insert or update on public.coag_centers
for each row execute function coag_private.stamp_created_by();
create trigger trg_coag_center_memberships_created_by before insert or update on public.coag_center_memberships
for each row execute function coag_private.stamp_created_by();

-- ── Auditoría propia ────────────────────────────────────────────────────────

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
begin
  insert into public.coag_audit_log (actor_id, center_id, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(),
    case when tg_table_name = 'coag_centers' then (v_row ->> 'id')::uuid else (v_row ->> 'center_id')::uuid end,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_coag_profiles_audit after insert or update or delete on public.coag_profiles
for each row execute function coag_private.write_audit_log();
create trigger trg_coag_centers_audit after insert or update or delete on public.coag_centers
for each row execute function coag_private.write_audit_log();
create trigger trg_coag_center_memberships_audit after insert or update or delete on public.coag_center_memberships
for each row execute function coag_private.write_audit_log();

-- ── Decisión de acceso (solo tablas COAMO; nunca helpers de DERMAPEX) ───────

create or replace function coag_private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_app_access('coag')
     and exists (select 1 from public.coag_profiles p where p.id = auth.uid() and p.is_active);
$$;

create or replace function coag_private.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_app_access('coag')
     and exists (
       select 1 from public.coag_profiles p
        where p.id = auth.uid() and p.is_active and p.role = 'coordinator'
     );
$$;

create or replace function coag_private.can_access_center(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coag_private.is_coordinator()
      or (
        app_private.has_app_access('coag')
        and exists (
          select 1
            from public.coag_center_memberships cm
            join public.coag_profiles p on p.id = cm.profile_id and p.is_active
           where cm.profile_id = auth.uid() and cm.center_id = p_center_id
        )
      );
$$;

-- ── Alta administrativa (SQL Editor; sin EXECUTE para la API) ───────────────

-- Autoriza una cuenta de Auth en COAMO y crea (o reactiva) su perfil COAMO con el rol indicado.
create or replace function coag_private.provision_user(p_email text, p_role text default 'investigator', p_full_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'No existe ninguna cuenta de Auth con el correo %', p_email;
  end if;

  insert into app_private.app_access (user_id, app_code, is_active)
  values (v_user_id, 'coag', true)
  on conflict (user_id, app_code) do update set is_active = true;

  insert into public.coag_profiles (id, full_name, role)
  values (v_user_id, nullif(trim(coalesce(p_full_name, '')), ''), p_role)
  on conflict (id) do update
    set role = excluded.role,
        is_active = true,
        full_name = coalesce(excluded.full_name, public.coag_profiles.full_name);
end;
$$;

-- Asigna un centro COAMO a una cuenta ya provisionada en COAMO.
create or replace function coag_private.assign_center(p_email text, p_center_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_center_id uuid;
begin
  select p.id into v_profile_id
    from public.coag_profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(trim(p_email));
  if v_profile_id is null then
    raise exception 'La cuenta % no tiene perfil COAMO: ejecute antes coag_private.provision_user.', p_email;
  end if;

  select c.id into v_center_id from public.coag_centers c where c.code = upper(trim(p_center_code));
  if v_center_id is null then
    raise exception 'No existe ningún centro COAMO con código %', p_center_code;
  end if;

  insert into public.coag_center_memberships (profile_id, center_id)
  values (v_profile_id, v_center_id)
  on conflict (profile_id, center_id) do nothing;
end;
$$;

-- Marca la contraseña temporal como cambiada (solo el propio perfil COAMO).
-- Límite conocido (igual que DERMAPEX): barrera de interfaz; no prueba un cambio real en Auth.
create or replace function public.coag_mark_password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.coag_profiles set must_change_password = false
   where id = auth.uid() and app_private.has_app_access('coag');
$$;

revoke all on all functions in schema coag_private from public, anon, authenticated;
revoke all on function public.coag_mark_password_changed() from public, anon, authenticated;

grant execute on function
  coag_private.is_active_user(),
  coag_private.is_coordinator(),
  coag_private.can_access_center(uuid)
to authenticated;
grant execute on function public.coag_mark_password_changed() to authenticated;

-- ── Políticas ───────────────────────────────────────────────────────────────

-- Barrera restrictiva de aplicación (AND con las permisivas): sin acceso 'coag', nada.
create policy coag_app_gate on public.coag_profiles as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));
create policy coag_app_gate on public.coag_centers as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));
create policy coag_app_gate on public.coag_center_memberships as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));
create policy coag_app_gate on public.coag_audit_log as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));

-- Perfiles: el propio o coordinación COAMO. Solo se edita el nombre (rol, actividad y contraseña
-- temporal quedan fuera de los privilegios de columna).
create policy coag_profiles_select on public.coag_profiles for select to authenticated
  using (id = auth.uid() or coag_private.is_coordinator());
create policy coag_profiles_update on public.coag_profiles for update to authenticated
  using (id = auth.uid() or coag_private.is_coordinator())
  with check (id = auth.uid() or coag_private.is_coordinator());

-- Centros: lectura de los propios (coordinación, todos); alta y edición solo coordinación; sin
-- borrado desde la API (se desactivan).
create policy coag_centers_select on public.coag_centers for select to authenticated
  using (coag_private.can_access_center(id));
create policy coag_centers_insert on public.coag_centers for insert to authenticated
  with check (coag_private.is_coordinator());
create policy coag_centers_update on public.coag_centers for update to authenticated
  using (coag_private.is_coordinator()) with check (coag_private.is_coordinator());

-- Pertenencias: las propias o coordinación; gestión solo coordinación.
create policy coag_center_memberships_select on public.coag_center_memberships for select to authenticated
  using (profile_id = auth.uid() or coag_private.is_coordinator());
create policy coag_center_memberships_insert on public.coag_center_memberships for insert to authenticated
  with check (coag_private.is_coordinator());
create policy coag_center_memberships_delete on public.coag_center_memberships for delete to authenticated
  using (coag_private.is_coordinator());

-- Auditoría: solo lectura de coordinación COAMO.
create policy coag_audit_log_select on public.coag_audit_log for select to authenticated
  using (coag_private.is_coordinator());

-- ── Privilegios mínimos para la API ─────────────────────────────────────────

grant select on public.coag_profiles, public.coag_centers, public.coag_center_memberships, public.coag_audit_log
  to authenticated;
grant update (full_name) on public.coag_profiles to authenticated;
grant insert (code, name, center_role, study_number, is_active),
      update (code, name, center_role, study_number, is_active)
  on public.coag_centers to authenticated;
grant insert (profile_id, center_id), delete on public.coag_center_memberships to authenticated;
