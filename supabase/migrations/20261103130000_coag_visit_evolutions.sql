-- COAMO · 08 · Evolución farmacéutica por visita (texto libre del farmacéutico).
--
-- Petición de los investigadores (03/11/2026): campo «Evolución farmacéutica» asociado a cada visita, con
-- autoría, fecha de modificación y conservación de versiones. No es una variable del protocolo ni del CRD: es
-- documentación asistencial del estudio. Se guarda en una tabla propia (1:1 con la visita) para no modificar
-- coag_visits, sus reglas ni sus permisos.
--
-- Reglas:
--   · Una evolución por visita (clave = visit_id); la visita no puede cambiar. No se crea en visitas anuladas.
--   · Texto no vacío (1-8000 caracteres). Sin identificadores directos: lo recuerda la interfaz; la BD no puede
--     verificarlo (texto libre).
--   · Autoría y fechas las fija la BD; revision +1 en cada cambio (control de concurrencia en el cliente).
--   · Versiones: cada alta/cambio/borrado queda en coag_audit_log con el texto anterior y el nuevo.
--   · Acceso = acceso a la visita (centro asignado o coordinación COAMO); borrado solo coordinación.
--     Sin ninguna FK, helper ni log de DERMAPEX. Aditiva: no modifica tablas existentes.

create table public.coag_visit_evolutions (
  visit_id uuid primary key references public.coag_visits(id) on delete cascade,
  evolution_text text not null check (length(trim(evolution_text)) between 1 and 8000),
  revision integer not null default 1,
  created_by uuid references public.coag_profiles(id) on delete set null,
  updated_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.coag_visit_evolutions is
  'Evolución farmacéutica (texto libre) de una visita COAMO. Una por visita; versiones en coag_audit_log. Sin identificadores directos.';

create or replace function coag_private.enforce_visit_evolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.visit_id is distinct from old.visit_id then
    raise exception 'La visita de una evolución farmacéutica no se puede modificar.';
  end if;
  select v.status into v_status from public.coag_visits v where v.id = new.visit_id;
  if tg_op = 'INSERT' and v_status = 'cancelled' then
    raise exception 'No se registra la evolución farmacéutica en una visita anulada.';
  end if;
  new.evolution_text := trim(new.evolution_text);
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_by := auth.uid();
    new.created_at := timezone('utc', now());
  else
    new.revision := old.revision + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_coag_evolution_rules before insert or update on public.coag_visit_evolutions
for each row execute function coag_private.enforce_visit_evolution();
create trigger trg_coag_evolution_audit after insert or update or delete on public.coag_visit_evolutions
for each row execute function coag_private.write_audit_log();

alter table public.coag_visit_evolutions enable row level security;
revoke all on public.coag_visit_evolutions from public, anon, authenticated;
revoke all on function coag_private.enforce_visit_evolution() from public, anon, authenticated;

create policy coag_app_gate on public.coag_visit_evolutions as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));
create policy coag_evolution_select on public.coag_visit_evolutions for select to authenticated
  using (coag_private.can_access_visit(visit_id));
create policy coag_evolution_insert on public.coag_visit_evolutions for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_evolution_update on public.coag_visit_evolutions for update to authenticated
  using (coag_private.can_access_visit(visit_id))
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_evolution_delete on public.coag_visit_evolutions for delete to authenticated
  using (coag_private.is_coordinator());

grant select on public.coag_visit_evolutions to authenticated;
grant insert (visit_id, evolution_text), update (evolution_text) on public.coag_visit_evolutions to authenticated;
grant delete on public.coag_visit_evolutions to authenticated;
