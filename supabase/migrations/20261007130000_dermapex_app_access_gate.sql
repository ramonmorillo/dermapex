-- DERMAPEX · Barrera de acceso por aplicación (fase 1 de la convivencia con COAMO en el mismo
-- proyecto Supabase).
--
-- Contexto: el proyecto Supabase de DERMAPEX va a alojar también el estudio COAMO (tablas
-- public.coag_*, en una fase posterior). Ambos comparten Auth. Hasta ahora, toda cuenta de Auth
-- recibía automáticamente un perfil DERMAPEX activo: una cuenta de COAMO habría podido leer
-- catálogos DERMAPEX y hacer algunas escrituras de referencia. Esta migración separa
-- IDENTIDAD (auth.users) de AUTORIZACIÓN (app_private.app_access).
--
-- Diseño: docs/coamo/SUPABASE_DERMAPEX_COAG_ARCHITECTURE.md (secciones 9, 10, 12 y 14).
-- Desviación aprobada por el IP (2026-10-07): una misma cuenta PUEDE tener acceso a varias
-- aplicaciones (clave primaria (user_id, app_code)), porque la coordinación de ambos estudios
-- recae en la misma persona. Los roles siguen siendo independientes por aplicación.
--
-- Qué hace:
--   1. app_private.app_access: autorización explícita por aplicación, solo administrable por SQL.
--   2. app_private.admin_log: registro administrativo privado (no visible para ningún rol clínico).
--   3. Barrera DERMAPEX en los helpers raíz (is_active_user, is_coordinator, can_access_center,
--      has_cmo_center_access); el resto (paciente, visita, CMO, Storage, RPC) la hereda.
--   4. Política RESTRICTIVA en todas las tablas DERMAPEX: sin acceso DERMAPEX, cero filas y cero
--      escrituras, aunque exista un perfil o una pertenencia antigua.
--   5. Perfiles y pertenencias: coordinación DERMAPEX solo ve/gestiona cuentas autorizadas en
--      DERMAPEX; no puede asignar centros DERMAPEX a una cuenta de otra aplicación.
--   6. Auditoría: los eventos de perfiles/pertenencias de cuentas ajenas a DERMAPEX van al
--      registro administrativo privado, no a public.audit_log.
--   7. Cierra superficies privilegiadas: mark_password_changed exige acceso DERMAPEX;
--      visit_study_arm deja de ser invocable por el cliente (sigue en uso interno).
--   8. Asigna acceso DERMAPEX a las cuentas existentes (confirmado por el IP el 2026-10-07: las
--      7 cuentas actuales son todas de DERMAPEX).
--
-- No cambia: tablas, columnas, datos clínicos, reglas de centro/cohorte, cálculo CMO, nombres de
-- servicios ni rutas. Para un usuario DERMAPEX autorizado el comportamiento es idéntico.

-- ── 0. Salvaguarda previa (antes de cualquier cambio) ───────────────────────
-- Las cuentas existentes se autorizarán en bloque a DERMAPEX (sección 8). Si hubiera más perfiles
-- de los confirmados por el IP (7 a 2026-10-07; p. ej. cuentas de COAMO creadas entretanto), se
-- aborta aquí, sin haber modificado nada, para clasificarlas a mano.

do $$
declare
  v_profiles integer;
begin
  select count(*) into v_profiles from public.profiles;
  if v_profiles > 7 then
    raise exception 'Hay % perfiles (se esperaban como máximo 7). Clasificar las cuentas antes de aplicar.', v_profiles;
  end if;
end
$$;

-- ── 1. Autorización explícita por aplicación ────────────────────────────────

create table app_private.app_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_code text not null check (app_code in ('dermapex', 'coag')),
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, app_code)
);

comment on table app_private.app_access is
  'Autorización explícita de cada cuenta de Auth a cada aplicación del proyecto (dermapex, coag). Sin fila activa no hay acceso, aunque exista perfil. Solo administración por SQL: app_private.set_app_access(email, app, activo).';

create trigger trg_app_access_updated_at
before update on app_private.app_access
for each row execute function app_private.set_updated_at();

alter table app_private.app_access enable row level security;
revoke all on app_private.app_access from public, anon, authenticated;

-- ── 2. Registro administrativo privado ──────────────────────────────────────

create table app_private.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default timezone('utc', now()),
  actor_id uuid,
  session_role text not null default session_user,
  table_name text not null,
  row_ref text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);

comment on table app_private.admin_log is
  'Registro administrativo privado: altas/bajas de acceso por aplicación y eventos de perfiles de cuentas no autorizadas en DERMAPEX. No visible para ningún rol de la API.';

alter table app_private.admin_log enable row level security;
revoke all on app_private.admin_log from public, anon, authenticated;

create or replace function app_private.write_admin_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into app_private.admin_log (actor_id, table_name, row_ref, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(v_row ->> 'user_id', v_row ->> 'id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_app_access_admin_log
after insert or update or delete on app_private.app_access
for each row execute function app_private.write_admin_log();

-- ── 3. Helpers de autorización por aplicación ───────────────────────────────

-- ¿La cuenta en sesión tiene acceso activo a la aplicación indicada? Solo informa sobre uno mismo.
create or replace function app_private.has_app_access(p_app text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.app_access a
     where a.user_id = auth.uid() and a.app_code = p_app and a.is_active
  );
$$;

-- Alta/baja administrativa (solo SQL Editor / service role; sin EXECUTE para la API).
create or replace function app_private.set_app_access(p_email text, p_app text, p_active boolean default true)
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
  values (v_user_id, p_app, p_active)
  on conflict (user_id, app_code) do update set is_active = excluded.is_active;
end;
$$;

comment on function app_private.set_app_access(text, text, boolean) is
  'Uso (SQL Editor): select app_private.set_app_access(''persona@correo'', ''dermapex''); para revocar: ..., ''dermapex'', false). No borra la cuenta ni su historial.';

-- ── 4. Barrera DERMAPEX en los helpers raíz ─────────────────────────────────

create or replace function app_private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_app_access('dermapex')
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create or replace function app_private.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_app_access('dermapex')
     and exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.is_active and p.role = 'coordinator'
     );
$$;

create or replace function app_private.can_access_center(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_coordinator()
      or (
        app_private.has_app_access('dermapex')
        and exists (
          select 1
            from public.center_memberships cm
            join public.profiles p on p.id = cm.profile_id and p.is_active
           where cm.profile_id = auth.uid() and cm.center_id = p_center_id
        )
      );
$$;

create or replace function app_private.has_cmo_center_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_coordinator()
      or (
        app_private.has_app_access('dermapex')
        and exists (
          select 1
            from public.center_memberships cm
            join public.profiles p on p.id = cm.profile_id and p.is_active
            join public.centers c on c.id = cm.center_id and c.study_arm = 'cmo'
           where cm.profile_id = auth.uid()
        )
      );
$$;

-- Visibilidad de un perfil DERMAPEX concreto: el propio, o cualquier cuenta autorizada (o
-- revocada) en DERMAPEX si quien consulta es coordinación DERMAPEX. Nunca cuentas de otra app.
create or replace function app_private.can_see_dermapex_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_app_access('dermapex')
     and (
       p_profile_id = auth.uid()
       or (
         app_private.is_coordinator()
         and exists (
           select 1 from app_private.app_access a
            where a.user_id = p_profile_id and a.app_code = 'dermapex'
         )
       )
     );
$$;

revoke all on function
  app_private.write_admin_log(),
  app_private.has_app_access(text),
  app_private.set_app_access(text, text, boolean),
  app_private.can_see_dermapex_profile(uuid)
from public, anon, authenticated;

grant execute on function
  app_private.has_app_access(text),
  app_private.can_see_dermapex_profile(uuid)
to authenticated;

-- ── 5. Políticas RESTRICTIVAS (se combinan con AND; no conceden nada por sí mismas) ──

do $$
declare
  -- Inventario explícito de tablas DERMAPEX. Toda tabla nueva de DERMAPEX debe añadirse aquí
  -- (o en una migración posterior) ANTES de concederle privilegios. Lo comprueba db-tests/40_*.
  v_tables text[] := array[
    'audit_log', 'center_memberships', 'centers', 'cmo_model_versions', 'cmo_score_item_results',
    'cmo_scores', 'cmo_variable_catalog', 'consents', 'intervention_catalog', 'interventions',
    'med_catalog_aliases', 'med_catalog_concept_ingredients', 'med_catalog_concepts',
    'med_catalog_ingredients', 'med_catalog_products', 'medication_catalog',
    'patient_code_counters', 'patient_medications', 'patients', 'profiles',
    'questionnaire_measurement_map', 'questionnaire_responses', 'usual_care_activity_catalog',
    'visit_documents', 'visit_medication_events', 'visits'
  ];
  v_table text;
  v_unlisted text;
begin
  -- Coherencia: no debe existir en public ninguna tabla que no esté inventariada (salvo coag_*).
  select string_agg(c.relname, ', ') into v_unlisted
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not like 'coag\_%'
     and c.relname <> all (v_tables);
  if v_unlisted is not null then
    raise exception 'Tablas de public sin clasificar en el inventario DERMAPEX: %', v_unlisted;
  end if;

  foreach v_table in array v_tables loop
    execute format(
      'create policy dermapex_app_gate on public.%I as restrictive for all to authenticated
         using (app_private.has_app_access(''dermapex''))
         with check (app_private.has_app_access(''dermapex''))',
      v_table);
  end loop;
end
$$;

-- Filas de perfiles y pertenencias: solo cuentas DERMAPEX (cubre lectura de coordinación y
-- asignación de centros DERMAPEX a cuentas de otra aplicación).
create policy profiles_dermapex_rows on public.profiles as restrictive for all to authenticated
  using (app_private.can_see_dermapex_profile(id))
  with check (app_private.can_see_dermapex_profile(id));

create policy center_memberships_dermapex_rows on public.center_memberships as restrictive for all to authenticated
  using (app_private.can_see_dermapex_profile(profile_id))
  with check (app_private.can_see_dermapex_profile(profile_id));

-- ── 6. Auditoría: eventos de cuentas ajenas a DERMAPEX fuera de public.audit_log ─────

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
  v_profile_id uuid;
begin
  -- Perfiles y pertenencias de cuentas sin relación con DERMAPEX (p. ej. el perfil automático de
  -- una cuenta de COAMO): al registro administrativo privado, no a la auditoría del estudio.
  if tg_table_name in ('profiles', 'center_memberships') then
    v_profile_id := case when tg_table_name = 'profiles' then (v_row ->> 'id')::uuid else (v_row ->> 'profile_id')::uuid end;
    if not exists (
      select 1 from app_private.app_access a where a.user_id = v_profile_id and a.app_code = 'dermapex'
    ) then
      insert into app_private.admin_log (actor_id, table_name, row_ref, action, old_data, new_data)
      values (auth.uid(), tg_table_name, v_row ->> 'id', tg_op, v_old, v_new);
      return coalesce(new, old);
    end if;
  end if;

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

-- ── 7. Superficies privilegiadas ────────────────────────────────────────────

-- Solo cuentas DERMAPEX pueden marcar su contraseña como cambiada en el perfil DERMAPEX.
-- (Límite conocido: el indicador es una barrera de interfaz; no prueba un cambio real en Auth.)
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false
   where id = auth.uid() and app_private.has_app_access('dermapex');
$$;

revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

-- La cohorte de una visita se consulta solo desde funciones y triggers internos (propietarios).
revoke execute on function app_private.visit_study_arm(uuid) from authenticated;

-- ── 8. Acceso DERMAPEX para las cuentas existentes ──────────────────────────
-- Confirmado por el IP (2026-10-07): las 7 cuentas existentes son de DERMAPEX (comprobado en la
-- sección 0).

insert into app_private.app_access (user_id, app_code, is_active)
select p.id, 'dermapex', true from public.profiles p
on conflict (user_id, app_code) do nothing;
