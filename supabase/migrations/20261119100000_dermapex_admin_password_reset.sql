-- DERMAPEX · Restablecimiento administrativo de contraseña (soporte de la Edge Function
-- `admin-reset-password`).
--
-- Contexto: una investigadora ha perdido su contraseña y no recibe los correos de recuperación
-- (filtros del correo corporativo). Coordinación necesita restablecerla desde la aplicación, sin
-- crear otra cuenta ni tocar su UUID, centros, permisos ni datos clínicos.
--
-- Qué hace esta migración (solo estructura de control; NO toca datos clínicos):
--   1. app_private.admin_actions: registro administrativo de la operación. NUNCA guarda
--      contraseñas ni tokens (solo quién, a quién, cuándo y resultado).
--   2. Tres funciones public.admin_pwreset_* invocables ÚNICAMENTE con la clave service_role
--      (la Edge Function). El cliente (anon/authenticated) no puede ejecutarlas.
--        · admin_pwreset_candidates(actor): investigadores DERMAPEX activos (si el actor es
--          coordinación DERMAPEX activa).
--        · admin_pwreset_begin(actor, target): autoriza en el servidor, limita la frecuencia y
--          marca must_change_password = true ANTES de que la Edge Function cambie la contraseña
--          (si el cambio fallase, el indicador queda en true: es el estado seguro).
--        · admin_pwreset_complete(actor, target, ok): registra el resultado y, si fue correcto,
--          cierra las sesiones abiertas de la cuenta.
--   3. La contraseña temporal solo existe en la memoria de la Edge Function y en la respuesta
--      HTTP a coordinación; nunca llega a una tabla.
--
-- Límites deliberados: solo se puede restablecer a investigadores (rol 'investigator') con acceso
-- DERMAPEX activo y perfil activo; nunca a uno mismo ni a otra coordinación.

create table app_private.admin_actions (
  id bigint generated always as identity primary key,
  at timestamptz not null default timezone('utc', now()),
  actor_id uuid not null,
  target_id uuid not null,
  action text not null check (action in ('password_reset')),
  outcome text not null check (outcome in ('started', 'succeeded', 'failed'))
);

comment on table app_private.admin_actions is
  'Registro de operaciones administrativas sobre cuentas (restablecimiento de contraseña). Sin contraseñas, tokens ni correos. No visible para ningún rol de la API.';

create index idx_admin_actions_actor_at on app_private.admin_actions (actor_id, at desc);

alter table app_private.admin_actions enable row level security;
revoke all on app_private.admin_actions from public, anon, authenticated;

-- ── Autorización del solicitante (el servidor no se fía del cliente) ────────
-- auth.uid() es nulo con la clave service_role, así que el actor se pasa explícitamente (la Edge
-- Function lo obtiene de verificar el JWT contra Auth) y se comprueba aquí contra la base de datos.

create or replace function app_private.is_active_dermapex_coordinator(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor is not null
     and exists (
       select 1
         from public.profiles p
         join app_private.app_access a on a.user_id = p.id and a.app_code = 'dermapex' and a.is_active
        where p.id = p_actor and p.is_active and p.role = 'coordinator'
     );
$$;

create or replace function public.admin_pwreset_candidates(p_actor uuid)
returns table (id uuid, full_name text, must_change_password boolean, center_codes text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_active_dermapex_coordinator(p_actor) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.full_name,
         p.must_change_password,
         coalesce(
           (select array_agg(c.code order by c.code)
              from public.center_memberships cm
              join public.centers c on c.id = cm.center_id
             where cm.profile_id = p.id),
           array[]::text[])
    from public.profiles p
    join app_private.app_access a on a.user_id = p.id and a.app_code = 'dermapex' and a.is_active
   where p.is_active and p.role = 'investigator' and p.id <> p_actor
   order by p.full_name nulls last, p.id;
end;
$$;

create or replace function public.admin_pwreset_begin(p_actor uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_active_dermapex_coordinator(p_actor) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_target is null or p_target = p_actor then
    raise exception 'Cuenta no válida para el restablecimiento' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles p
      join app_private.app_access a on a.user_id = p.id and a.app_code = 'dermapex' and a.is_active
     where p.id = p_target and p.is_active and p.role = 'investigator'
  ) then
    raise exception 'Cuenta no válida para el restablecimiento' using errcode = '42501';
  end if;

  -- Freno ante abuso o bucles: como máximo 10 operaciones por coordinador y hora.
  if (select count(*) from app_private.admin_actions
       where actor_id = p_actor and action = 'password_reset' and outcome = 'started'
         and at > timezone('utc', now()) - interval '1 hour') >= 10 then
    raise exception 'Demasiados restablecimientos en la última hora' using errcode = '54000';
  end if;

  -- Contraseña temporal ⇒ cambio obligatorio en el primer acceso (sistema ya existente).
  update public.profiles set must_change_password = true where id = p_target;

  -- Auth es compartido con COAMO: si la cuenta tiene también perfil COAMO, la contraseña temporal
  -- sería válida allí, de modo que también se le exige cambiarla.
  if to_regclass('public.coag_profiles') is not null then
    execute 'update public.coag_profiles set must_change_password = true where id = $1' using p_target;
  end if;

  insert into app_private.admin_actions (actor_id, target_id, action, outcome)
  values (p_actor, p_target, 'password_reset', 'started');
end;
$$;

create or replace function public.admin_pwreset_complete(p_actor uuid, p_target uuid, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_active_dermapex_coordinator(p_actor) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  insert into app_private.admin_actions (actor_id, target_id, action, outcome)
  values (p_actor, p_target, 'password_reset', case when p_ok then 'succeeded' else 'failed' end);

  -- Cierra las sesiones abiertas con la contraseña anterior (si el esquema de Auth las expone).
  if p_ok and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_target;
  end if;
end;
$$;

-- Solo la clave service_role (Edge Function) puede ejecutarlas.
revoke all on function
  app_private.is_active_dermapex_coordinator(uuid),
  public.admin_pwreset_candidates(uuid),
  public.admin_pwreset_begin(uuid, uuid),
  public.admin_pwreset_complete(uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.admin_pwreset_candidates(uuid),
  public.admin_pwreset_begin(uuid, uuid),
  public.admin_pwreset_complete(uuid, uuid, boolean)
to service_role;
