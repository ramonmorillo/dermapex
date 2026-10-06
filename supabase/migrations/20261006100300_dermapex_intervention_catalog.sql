-- DERMAPEX · 10 · Catálogo CMO de intervenciones (decisiones D7 y D8 · PENDIENTE VALIDACIÓN IP) y
-- trazabilidad catálogo → intervención registrada.
--
-- D7: se cargan LITERALMENTE las 20 tarjetas de
--   ramonmorillo/cmoinmunomediadas @ 227e444 · assets/modules/interventions-catalog.js
-- (texto, dimensión C/M/O, niveles recomendados, categoría y tier), sin reescribir ni inventar, con
-- catalog_version = 'cmoinmunomediadas@227e444-draft'. La correspondencia tarjeta → paquete mínimo
-- del protocolo es una PROPUESTA documentada en docs/DERMAPEX_CMO_ENGINE.md §6.
--
-- D8: semántica de nivel con 1 = mayor complejidad/máxima prioridad. La fuente da una LISTA de niveles
-- recomendados (recommendedLevels), que no cabe sin pérdida en un único «nivel mínimo». Se añade
-- recommended_levels smallint[] como fuente de verdad y min_level pasa a ser un valor DERIVADO =
-- max(recommended_levels) = nivel MENOS prioritario para el que se recomienda la tarjeta
-- (p. ej. [1] → 1: solo nivel 1; [1,2,3] → 3: todos). Lo calcula un trigger; la UI filtra por
-- recommended_levels.
--
-- Versionado: el catálogo no se sobrescribe; una versión nueva son filas nuevas con otro
-- catalog_version (unicidad por código + versión).

alter table public.intervention_catalog
  drop constraint intervention_catalog_code_key,
  add column recommended_levels smallint[],
  add column category text check (category is null or category in ('seguimiento', 'educacion', 'coordinacion')),
  add column tier text check (tier is null or tier in ('basica', 'avanzada', 'centro')),
  add column linked_need_ids text[] not null default '{}',
  add column sort_order integer,
  add column source_ref text,
  add constraint intervention_catalog_code_version_key unique (code, catalog_version),
  add constraint intervention_catalog_recommended_levels_valid check (
    recommended_levels is null
    or (cardinality(recommended_levels) > 0 and recommended_levels <@ array[1, 2, 3]::smallint[])
  );

comment on column public.intervention_catalog.recommended_levels is
  'Niveles CMO (1 = máxima prioridad) para los que la fuente recomienda la intervención. Fuente de verdad del filtrado (D8).';
comment on column public.intervention_catalog.min_level is
  'DERIVADO = max(recommended_levels): nivel menos prioritario (número mayor) para el que se recomienda. Nivel 1 = máxima prioridad. No usar para filtrar (D8).';
comment on column public.intervention_catalog.label is
  'Texto literal de la fuente (interventions-catalog.js, campo text).';
comment on column public.intervention_catalog.domain is
  'Categoría de la fuente (seguimiento/educacion/coordinacion); se mantiene por compatibilidad. Ver category.';

create or replace function app_private.derive_intervention_min_level()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recommended_levels is not null then
    new.min_level := (select max(l) from unnest(new.recommended_levels) l);
  end if;
  return new;
end;
$$;

create trigger trg_intervention_catalog_min_level
before insert or update on public.intervention_catalog
for each row execute function app_private.derive_intervention_min_level();

-- Catálogo inmutable salvo is_active (mismo principio que el modelo CMO).
create trigger trg_intervention_catalog_immutable
before update on public.intervention_catalog
for each row execute function app_private.enforce_model_immutability();

-- D5: el catálogo CMO solo es visible para coordinación y para miembros de centros de la cohorte CMO.
drop policy intervention_catalog_select on public.intervention_catalog;
create policy intervention_catalog_select on public.intervention_catalog for select to authenticated
  using (app_private.is_active_user() and app_private.has_cmo_center_access());

-- ── Semilla literal ─────────────────────────────────────────────────────────

insert into public.intervention_catalog (
  code, label, domain, cmo_pillar, min_level, catalog_version, recommended_levels, category, tier,
  linked_need_ids, sort_order, source_ref
)
select r.code, r.label, r.category, r.cmo_pillar, 3, 'cmoinmunomediadas@227e444-draft',
       array(select jsonb_array_elements_text(r.recommended_levels)::smallint), r.category, r.tier,
       array(select jsonb_array_elements_text(r.linked_need_ids)), r.sort_order,
       'cmoinmunomediadas@227e444d2da1a6dcffe1c99f3afafb894297e483:assets/modules/interventions-catalog.js#' || r.code
  from jsonb_to_recordset(
-- BEGIN INTERVENTION_CATALOG_JSON
$json$[
{"code":"seg-revision-conciliacion","label":"Revisión, validación y conciliación del tratamiento completo (EI + concomitante)","category":"seguimiento","cmo_pillar":"capacidad","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["cap-manejo-regimen","opo-seguridad-medicamento"],"sort_order":1},
{"code":"seg-control-adherencia","label":"Control de adherencia y desarrollo de intervenciones específicas","category":"seguimiento","cmo_pillar":"motivacion","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["mot-adherencia"],"sort_order":2},
{"code":"seg-adaptado-necesidades","label":"Seguimiento adaptado a las necesidades individuales del paciente","category":"seguimiento","cmo_pillar":"oportunidad","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":[],"sort_order":3},
{"code":"seg-coordinacion-siguiente-visita","label":"Coordinación de la siguiente visita con el médico y el departamento de citaciones","category":"seguimiento","cmo_pillar":"oportunidad","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["opo-coordinacion-asistencial"],"sort_order":4},
{"code":"seg-plan-accion-ram","label":"Plan de acción entre niveles asistenciales para reacciones adversas, con vías rápidas de comunicación permanente","category":"seguimiento","cmo_pillar":"oportunidad","tier":"avanzada","recommended_levels":[1],"linked_need_ids":["cap-actividad-no-controlada","opo-seguridad-medicamento"],"sort_order":5},
{"code":"seg-objetivos-corto-plazo","label":"Establecer objetivos a corto plazo según el Modelo CMO en consultas externas","category":"seguimiento","cmo_pillar":"oportunidad","tier":"basica","recommended_levels":[1],"linked_need_ids":[],"sort_order":6},
{"code":"edu-promocion-adherencia","label":"Promoción activa de la adherencia","category":"educacion","cmo_pillar":"motivacion","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["mot-adherencia"],"sort_order":7},
{"code":"edu-informacion-enfermedad","label":"Información sobre la enfermedad y el tratamiento (posología, conservación) y prevención de reacciones adversas","category":"educacion","cmo_pillar":"capacidad","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["cap-manejo-regimen","cap-actividad-no-controlada"],"sort_order":8},
{"code":"edu-material-personalizado","label":"Material personalizado (hoja de medicación)","category":"educacion","cmo_pillar":"capacidad","tier":"basica","recommended_levels":[1,2],"linked_need_ids":["cap-manejo-regimen","opo-comunicacion"],"sort_order":9},
{"code":"edu-habitos-vida-saludable","label":"Educación sobre hábitos de vida saludable","category":"educacion","cmo_pillar":"capacidad","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["cap-habitos"],"sort_order":10},
{"code":"edu-paciente-activo","label":"Fomento de un paciente activo e informado que se corresponsabilice de su tratamiento","category":"educacion","cmo_pillar":"motivacion","tier":"basica","recommended_levels":[1,2,3],"linked_need_ids":["mot-psicologico","mot-calidad-vida"],"sort_order":11},
{"code":"edu-recursos-digitales","label":"Recursos web y aplicaciones informativas","category":"educacion","cmo_pillar":"oportunidad","tier":"avanzada","recommended_levels":[1,2,3],"linked_need_ids":["opo-comunicacion"],"sort_order":12},
{"code":"coord-unificacion-criterios","label":"Unificación de criterios entre profesionales (médico, enfermería) y niveles asistenciales (especializada, primaria, oficina de farmacia)","category":"coordinacion","cmo_pillar":"oportunidad","tier":"avanzada","recommended_levels":[1,2],"linked_need_ids":["opo-coordinacion-asistencial"],"sort_order":13},
{"code":"coord-programa-agentes","label":"Programa de actuación con todos los agentes implicados","category":"coordinacion","cmo_pillar":"oportunidad","tier":"avanzada","recommended_levels":[1,2],"linked_need_ids":["opo-coordinacion-asistencial"],"sort_order":14},
{"code":"coord-actuaciones-consensuadas","label":"Definición de actuaciones consensuadas específicas para el paciente entre profesionales (registradas en la historia clínica)","category":"coordinacion","cmo_pillar":"oportunidad","tier":"avanzada","recommended_levels":[1,2],"linked_need_ids":["opo-coordinacion-asistencial"],"sort_order":15},
{"code":"coord-comites-biologicos","label":"Participación en comités de biológicos","category":"coordinacion","cmo_pillar":"oportunidad","tier":"centro","recommended_levels":[1,2,3],"linked_need_ids":["opo-seguridad-medicamento"],"sort_order":16},
{"code":"coord-servicios-sociales-psicologia","label":"Coordinación con Servicios Sociales o Psicología/Psiquiatría","category":"coordinacion","cmo_pillar":"oportunidad","tier":"centro","recommended_levels":[1,2],"linked_need_ids":["opo-soporte-social","mot-psicologico"],"sort_order":17},
{"code":"coord-asociaciones-pacientes","label":"Colaboración con asociaciones de pacientes","category":"coordinacion","cmo_pillar":"oportunidad","tier":"centro","recommended_levels":[1,2,3],"linked_need_ids":["opo-soporte-social"],"sort_order":18},
{"code":"coord-programas-objetivos-farmacoterapeuticos","label":"Desarrollo de programas orientados a objetivos farmacoterapéuticos","category":"coordinacion","cmo_pillar":"oportunidad","tier":"avanzada","recommended_levels":[1,2,3],"linked_need_ids":["cap-manejo-regimen"],"sort_order":19},
{"code":"coord-reuniones-especialidades","label":"Reuniones periódicas con Reumatología/Dermatología/Digestivo para coordinación sobre indicadores de eficacia y adherencia","category":"coordinacion","cmo_pillar":"oportunidad","tier":"centro","recommended_levels":[1],"linked_need_ids":["opo-coordinacion-asistencial"],"sort_order":20}
]$json$
-- END INTERVENTION_CATALOG_JSON
  ::jsonb) as r(code text, label text, category text, cmo_pillar text, tier text, recommended_levels jsonb, linked_need_ids jsonb, sort_order integer);

-- ── Intervenciones registradas: vínculo con el catálogo ─────────────────────

alter table public.interventions
  add column catalog_item_id uuid references public.intervention_catalog(id) on delete restrict,
  add column catalog_code text,
  add column catalog_version text;

comment on column public.interventions.catalog_item_id is
  'Tarjeta del catálogo CMO usada. NULL = «Otra intervención (texto libre)». Código, versión, texto y pilar se sellan en servidor desde el catálogo.';

create or replace function app_private.enforce_intervention_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.intervention_catalog%rowtype;
begin
  -- D5: el registro de intervenciones CMO solo está disponible en centros de la cohorte CMO.
  if coalesce(app_private.visit_study_arm(new.visit_id), '') <> 'cmo' then
    raise exception 'Las intervenciones CMO solo pueden registrarse en centros de la cohorte CMO.';
  end if;

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

create trigger trg_interventions_rules
before insert or update on public.interventions
for each row execute function app_private.enforce_intervention_rules();

revoke all on function app_private.derive_intervention_min_level(), app_private.enforce_intervention_rules() from public;
