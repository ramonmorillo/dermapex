-- DERMAPEX · 06 · Cambio de contraseña obligatorio en el primer acceso.
--
-- En el plan gratuito de Supabase no se pueden editar las plantillas de correo y el filtro
-- antiphishing del correo corporativo consume los enlaces de un solo uso. Por eso las cuentas se
-- crean desde el panel con una contraseña temporal (distinta para cada persona) y la aplicación
-- obliga a sustituirla en el primer acceso.

alter table public.profiles
  add column must_change_password boolean not null default true;

comment on column public.profiles.must_change_password is
  'true hasta que la persona fija su propia contraseña desde la aplicación. Coordinación puede volver a ponerlo a true (p. ej. tras restablecer una contraseña desde el panel).';

-- Las cuentas existentes tampoco han fijado aún una contraseña propia desde la aplicación.
update public.profiles set must_change_password = true;

-- La propia persona marca que ya ha cambiado su contraseña (no puede alterar el indicador de otros).
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;
