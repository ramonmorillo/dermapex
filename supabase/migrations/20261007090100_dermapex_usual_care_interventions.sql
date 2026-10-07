-- DERMAPEX · Registro de intervenciones en la cohorte de atención farmacéutica estándar.
-- Decisión del IP (2026-10-07): los centros 'standard' registran lo que hacen en cada visita
-- seleccionando de un listado desplegable, sin texto libre.
--
-- El listado es NEUTRO (no reproduce las tarjetas del catálogo CMO) para no contaminar la cohorte
-- comparadora con el contenido de la intervención evaluada. Cada actividad lleva la categoría
-- (seguimiento/educación/coordinación) que también usa el catálogo CMO, para poder comparar cohortes.
-- Versión 'af-estandar-0.1-borrador': PROPUESTA pendiente de validación por el IP; no procede de una
-- clasificación publicada. Una versión nueva = filas nuevas con otro catalog_version.
--
-- Reglas (en la base de datos):
--   · En centros 'standard' toda intervención procede del listado (usual_care_item_id obligatorio);
--     no se admite catálogo CMO ni nivel CMO. Texto, código, versión y categoría se sellan en servidor.
--   · En centros 'cmo' no se usa este listado (sigue el catálogo CMO, sin cambios).
--   · «Sin intervención en esta visita» es excluyente con cualquier otra actividad de la misma visita,
--     y cada actividad se registra como máximo una vez por visita.

create table public.usual_care_activity_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9-]{2,60}$'),
  label text not null,
  category text check (category is null or category in ('seguimiento', 'educacion', 'coordinacion')),
  is_no_intervention boolean not null default false,
  catalog_version text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (code, catalog_version)
);

comment on table public.usual_care_activity_catalog is
  'Listado neutro de actividades de atención farmacéutica estándar (cohorte comparadora). Versionado e inmutable salvo is_active.';

create trigger trg_usual_care_activity_catalog_updated_at
before update on public.usual_care_activity_catalog
for each row execute function app_private.set_updated_at();

-- Inmutable salvo is_active (misma función que el modelo CMO).
create trigger trg_usual_care_activity_catalog_immutable
before update on public.usual_care_activity_catalog
for each row execute function app_private.enforce_model_immutability();

create trigger trg_usual_care_activity_catalog_audit after insert or update or delete on public.usual_care_activity_catalog
for each row execute function app_private.write_audit_log();

alter table public.usual_care_activity_catalog enable row level security;
revoke all on public.usual_care_activity_catalog from anon;
revoke truncate, references, trigger on public.usual_care_activity_catalog from authenticated;

create policy usual_care_activity_catalog_select on public.usual_care_activity_catalog for select to authenticated
  using (app_private.is_active_user());
create policy usual_care_activity_catalog_write on public.usual_care_activity_catalog for all to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());

insert into public.usual_care_activity_catalog (code, label, category, is_no_intervention, catalog_version, sort_order) values
  ('validacion-prescripcion', 'Validación de la prescripción', 'seguimiento', false, 'af-estandar-0.1-borrador', 1),
  ('dispensacion-informacion', 'Dispensación e información sobre administración y conservación', 'educacion', false, 'af-estandar-0.1-borrador', 2),
  ('revision-adherencia', 'Revisión de la adherencia', 'seguimiento', false, 'af-estandar-0.1-borrador', 3),
  ('efectos-adversos-interacciones', 'Detección o manejo de efectos adversos o interacciones', 'seguimiento', false, 'af-estandar-0.1-borrador', 4),
  ('conciliacion', 'Conciliación de la medicación', 'seguimiento', false, 'af-estandar-0.1-borrador', 5),
  ('informacion-enfermedad', 'Información sobre la enfermedad', 'educacion', false, 'af-estandar-0.1-borrador', 6),
  ('comunicacion-profesionales', 'Comunicación con dermatología u otro profesional', 'coordinacion', false, 'af-estandar-0.1-borrador', 7),
  ('otra', 'Otra actividad', null, false, 'af-estandar-0.1-borrador', 8),
  ('sin-intervencion', 'Sin intervención en esta visita', null, true, 'af-estandar-0.1-borrador', 9);

-- ── Intervenciones registradas: vínculo con el listado estándar ─────────────

alter table public.interventions
  add column usual_care_item_id uuid references public.usual_care_activity_catalog(id) on delete restrict,
  add column usual_care_code text,
  add column usual_care_version text;

comment on column public.interventions.usual_care_item_id is
  'Actividad del listado de AF estándar (solo centros standard). Código, versión, texto y categoría se sellan en servidor.';

create index idx_interventions_usual_care on public.interventions(usual_care_item_id);

create or replace function app_private.enforce_intervention_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_arm text := app_private.visit_study_arm(new.visit_id);
  v_item public.intervention_catalog%rowtype;
  v_uc public.usual_care_activity_catalog%rowtype;
begin
  -- ── Cohorte estándar: solo listado neutro ──
  if v_arm = 'standard' then
    if new.usual_care_item_id is null then
      raise exception 'En los centros de atención farmacéutica estándar la intervención se selecciona del listado.';
    end if;
    if new.catalog_item_id is not null or new.linked_to_cmo_level is not null then
      raise exception 'Las intervenciones CMO solo pueden registrarse en centros de la cohorte CMO.';
    end if;

    select * into v_uc from public.usual_care_activity_catalog u where u.id = new.usual_care_item_id;
    if not found then
      raise exception 'Actividad del listado no encontrada.';
    end if;
    if (tg_op = 'INSERT' or new.usual_care_item_id is distinct from old.usual_care_item_id) and not v_uc.is_active then
      raise exception 'La actividad % está retirada del listado.', v_uc.code;
    end if;

    if exists (
      select 1 from public.interventions i
       where i.visit_id = new.visit_id and i.id <> new.id and i.usual_care_item_id = new.usual_care_item_id
    ) then
      raise exception 'Esta actividad ya está registrada en la visita.';
    end if;

    if v_uc.is_no_intervention then
      if exists (select 1 from public.interventions i where i.visit_id = new.visit_id and i.id <> new.id) then
        raise exception 'La visita ya tiene actividades registradas: no puede marcarse «Sin intervención».';
      end if;
    elsif exists (
      select 1 from public.interventions i
        join public.usual_care_activity_catalog u on u.id = i.usual_care_item_id
       where i.visit_id = new.visit_id and i.id <> new.id and u.is_no_intervention
    ) then
      raise exception 'La visita está marcada «Sin intervención»: corrija ese registro antes de añadir actividades.';
    end if;

    new.usual_care_code := v_uc.code;
    new.usual_care_version := v_uc.catalog_version;
    new.intervention_type := v_uc.label;
    new.intervention_domain := case v_uc.category
      when 'seguimiento' then 'Seguimiento'
      when 'educacion' then 'Educación'
      when 'coordinacion' then 'Coordinación'
    end;
    new.catalog_code := null;
    new.catalog_version := null;
    new.priority_level := null;
    return new;
  end if;

  -- ── Cohorte CMO: catálogo CMO (sin cambios respecto a 20261006100300) ──
  if v_arm is distinct from 'cmo' then
    raise exception 'Las intervenciones CMO solo pueden registrarse en centros de la cohorte CMO.';
  end if;
  if new.usual_care_item_id is not null then
    raise exception 'El listado de atención farmacéutica estándar no se usa en centros de la cohorte CMO.';
  end if;
  new.usual_care_code := null;
  new.usual_care_version := null;

  if new.catalog_item_id is null then
    new.catalog_code := null;
    new.catalog_version := null;
    return new;
  end if;

  select * into v_item from public.intervention_catalog c where c.id = new.catalog_item_id;
  if not found then
    raise exception 'Intervención de catálogo no encontrada.';
  end if;
  if tg_op = 'INSERT' and not v_item.is_active then
    raise exception 'La intervención de catálogo % está retirada.', v_item.code;
  end if;

  new.catalog_code := v_item.code;
  new.catalog_version := v_item.catalog_version;
  new.intervention_type := v_item.label;
  new.intervention_domain := case v_item.cmo_pillar
    when 'capacidad' then 'Capacidad'
    when 'motivacion' then 'Motivación'
    when 'oportunidad' then 'Oportunidad'
  end;
  return new;
end;
$$;

revoke all on function app_private.enforce_intervention_rules() from public;
