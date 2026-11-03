-- COAMO · 10 · Actuaciones de atención farmacéutica por prioridad CMO: catálogo y registro.
--
-- Fuente del catálogo: «Adaptación del Modelo de Atención Farmacéutica CMO al paciente con coagulopatías congénitas»
-- (SEFH v2.0), Tabla 5 «Definición de las actuaciones de AF en pacientes de Prioridad 3» (p. 20) y Tabla 6 (Prioridad 2,
-- pp. 21-22), aportadas por el investigador como imágenes el 03/11/2026 y transcritas literalmente (pendiente de cotejo).
-- Las tablas son acumulativas: la Tabla 6 repite las actuaciones de la Tabla 5 y añade otras; cada actuación se guarda una
-- vez con las prioridades a las que se aplica. La Tabla 7 (Prioridad 1, pp. 24-25) NO se carga: la copia aportada no es
-- legible; las actuaciones de las Tablas 5-6 se aplican también a Prioridad 1 (modelo acumulativo, spec §4), pero el
-- catálogo de Prioridad 1 queda INCOMPLETO hasta cargar la Tabla 7.
--
-- Registro (coag_interventions): lo que el farmacéutico planifica o REALIZA en una visita. Que una actuación aparezca
-- recomendada no crea ningún registro. Estados: planned (prevista), performed (realizada, con fecha), discarded (registro
-- anulado por error; se conserva). La prioridad de contexto la deriva la BD de la última estratificación completada del
-- paciente hasta la fecha de la visita. Actuaciones adicionales fuera del catálogo: custom_text con ámbito.
-- Aditiva: no modifica tablas existentes. Sin dependencias de DERMAPEX.

-- ── Catálogo (solo lectura para la app) ─────────────────────────────────────

create table public.coag_intervention_catalog (
  code text primary key,
  catalog_version text not null,
  domain text not null check (domain in ('pharmacotherapeutic_followup', 'patient_education', 'care_coordination')),
  applies_to_priorities smallint[] not null,
  source_table text not null,
  sort_order integer not null,
  action_text text not null,
  is_active boolean not null default true
);

comment on table public.coag_intervention_catalog is
  'Actuaciones de AF del modelo CMO de coagulopatías (SEFH v2.0), Tablas 5 (P3) y 6 (P2), transcritas literalmente. Tabla 7 (P1) pendiente: copia no legible.';

insert into public.coag_intervention_catalog (code, catalog_version, domain, applies_to_priorities, source_table, sort_order, action_text) values
-- Seguimiento farmacoterapéutico (Tabla 5 = P3; repetidas en Tabla 6)
('SFT-01', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2,3}', 'Tabla 5', 1, 'Evaluar y validar regularmente los tratamientos para asegurar su adecuación, seguridad y efectividad, considerando las características únicas de las coagulopatías congénitas y las comorbilidades del paciente.'),
('SFT-02', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2,3}', 'Tabla 5', 2, 'Monitorizar periódicamente las concentraciones y la actividad funcional de los factores VIII, IX o de los niveles de antígeno y actividad del factor von Willebrand (en función de la patología del paciente) a través de la revisión de las analíticas para valorar la eficacia del tratamiento, ajustar dosis y facilitar la detección temprana de posibles complicaciones.'),
('SFT-03', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2,3}', 'Tabla 5', 3, 'Supervisar el cumplimiento de los tratamientos prescritos y desarrollar estrategias para mejorar la adherencia como educación personalizada, apoyo conductual y recordatorios digitales.'),
('SFT-04', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2,3}', 'Tabla 5', 4, 'Revisar y ajustar la medicación concomitante para evitar interacciones y efectos adversos específicos en pacientes con coagulopatías congénitas.'),
('SFT-05', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2,3}', 'Tabla 5', 5, 'Identificar, documentar, prevenir y gestionar problemas relacionados con la medicación y su administración domiciliaria, asegurando un enfoque multidisciplinar y la participación del paciente.'),
('SFT-06', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2}', 'Tabla 6', 6, 'Monitorizar y utilizar resultados informados por los pacientes (PROMs) y medidas de experiencia del paciente (PREMs) para adaptar los planes de tratamiento y mejorar los resultados clínicos.'),
('SFT-07', 'CMO-COAG-SEFH-v2.0-T5-T6', 'pharmacotherapeutic_followup', '{1,2}', 'Tabla 6', 7, 'Asegurar la continuidad del tratamiento y acompañar al paciente durante transiciones críticas, como ingreso o alta hospitalaria, cambios de terapia, paso a profilaxis extendida, uso de nuevos productos o vías de administración, estableciendo un seguimiento específico para detectar incidencias o problemas relacionados con la medicación.'),
-- Educación, formación y seguimiento del paciente
('EDU-01', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 1, 'Proporcionar información clara y accesible sobre la enfermedad, los tratamientos y las condiciones para su correcta conservación y mantenimiento, la importancia de la adherencia terapéutica y el contacto de asociaciones de pacientes disponibles, con el fin de empoderar al paciente.'),
('EDU-02', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 2, 'Ofrecer materiales educativos escritos o digitales que cubran los aspectos básicos del manejo de las coagulopatías congénitas, incluidos los síntomas y los efectos secundarios de los tratamientos, el manejo de hemorragias activas e información sobre el funcionamiento del centro hospitalario, incluyendo horarios de atención, contactos clave, ubicaciones de servicios y consultas de referencia.'),
('EDU-03', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 3, 'Realizar una entrevista estructurada para identificar barreras y causas de la falta de adherencia, proporcionando refuerzo educativo y reentrenamiento en auto infusión, e incorporando consultas de telefarmacia proactiva con seguimiento periódico para mejorar la adherencia y la seguridad del tratamiento.'),
('EDU-04', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 4, 'Facilitar información y concienciar al paciente sobre la importancia de su identificación como persona con una coagulopatía congénita, promoviendo el uso de documentación o dispositivos acreditativos que faciliten su reconocimiento en urgencias y prevengan eventos adversos por una atención no adaptada.'),
('EDU-05', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 5, 'Impulsar hábitos de vida saludables, control de factores de riesgo y el uso correcto de medicamentos a través de plataformas en línea, aplicaciones móviles y recursos educativos.'),
('EDU-06', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 6, 'Activar medidas de apoyo en aquellos casos de pacientes con dificultades de acceso o un entorno socioeconómico adverso incluyendo la dispensación domiciliaria cuando proceda, la coordinación con servicios sociales y la priorización de la telefarmacia frente al seguimiento presencial, garantizando la continuidad y equidad en la atención.'),
('EDU-07', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2,3}', 'Tabla 5', 7, 'Establecer un programa de educación intensiva en aquellos pacientes en situación de transición del ámbito pediátrico al adulto y en coordinación con hematología pediátrica para favorecer la continuidad asistencial y la autonomía terapéutica.'),
('EDU-08', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2}', 'Tabla 6', 8, 'Proporcionar formación y educación específica para familiares y cuidadores, facilitando su participación en el cuidado del paciente y la comunicación de cualquier nuevo evento clínico'),
('EDU-09', 'CMO-COAG-SEFH-v2.0-T5-T6', 'patient_education', '{1,2}', 'Tabla 6', 9, 'Facilitar el acceso a canales de comunicación directa concretos (telefarmacia, apps clínicas) para resolución de dudas o notificación de incidencias.'),
-- Coordinación con el equipo asistencial
('COO-01', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2,3}', 'Tabla 5', 1, 'Participación de los especialistas en FH en programas docentes multidisciplinares, que integren a todos los centros asistenciales nacionales, para garantizar un conocimiento actualizado y homogéneo en el abordaje de las coagulopatías congénitas.'),
('COO-02', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2,3}', 'Tabla 5', 2, 'Asegurar que todas las intervenciones farmacéuticas estén documentadas en la HCE del paciente para una mejor coordinación entre los profesionales implicados.'),
('COO-03', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2,3}', 'Tabla 5', 3, 'Promover una comunicación efectiva y bidireccional entre todos los profesionales sanitarios involucrados, garantizando un enfoque coherente y centrado en el paciente.'),
('COO-04', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2,3}', 'Tabla 5', 4, 'Garantizar una correcta coordinación con el servicio de hematología en los casos de nuevos pacientes, de inicio/cambio de tratamiento o ajustes de dosis, asegurando la continuidad asistencial y un abordaje multidisciplinar.'),
('COO-05', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2,3}', 'Tabla 5', 5, 'Fomentar la coordinación y comunicación entre hospitales para asegurar la continuidad en la dispensación de medicación a pacientes que recogen su tratamiento en distintos centros y poder detectar de forma temprana posibles complicaciones o incidentes.'),
('COO-06', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2,3}', 'Tabla 5', 6, 'Implementar programas de seguimiento farmacoterapéutico personalizados y conjuntos para pacientes con coagulopatías congénitas, asegurando la adherencia a los tratamientos y la mejora continua del manejo de la enfermedad.'),
('COO-07', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2}', 'Tabla 6', 7, 'Establecer procedimientos de trabajo conjuntos con el equipo asistencial para potenciar la autonomía de los pacientes y mejorar su capacidad de gestionar sus propias condiciones de salud.'),
('COO-08', 'CMO-COAG-SEFH-v2.0-T5-T6', 'care_coordination', '{1,2}', 'Tabla 6', 8, 'Establecer canales de comunicación con el servicio de hematología para garantizar la derivación a los servicios de salud mental y trabajo social en el caso de que se detecten necesidades específicas.');

-- ── Registro de actuaciones ─────────────────────────────────────────────────

create table public.coag_interventions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.coag_visits(id) on delete cascade,
  catalog_code text references public.coag_intervention_catalog(code),
  custom_text text check (custom_text is null or length(trim(custom_text)) between 3 and 500),
  domain text not null check (domain in ('pharmacotherapeutic_followup', 'patient_education', 'care_coordination')),
  status text not null default 'planned' check (status in ('planned', 'performed', 'discarded')),
  performed_date date,
  followup_note text check (followup_note is null or length(followup_note) <= 1000),
  priority_context smallint check (priority_context between 1 and 3),
  recommended_for_priority boolean,
  revision integer not null default 1,
  created_by uuid references public.coag_profiles(id) on delete set null,
  updated_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coag_interventions_one_source check ((catalog_code is null) <> (custom_text is null)),
  constraint coag_interventions_performed_date check ((status = 'performed') = (performed_date is not null) or status = 'discarded')
);

comment on table public.coag_interventions is
  'Actuaciones de AF planificadas o realizadas en una visita (catálogo CMO o adicionales). Recomendada ≠ realizada: solo existe fila si el profesional la registra. discarded = registro anulado (se conserva). priority_context y recommended_for_priority los fija la BD.';

create index idx_coag_interventions_visit on public.coag_interventions(visit_id);
create unique index uq_coag_interventions_catalog_per_visit on public.coag_interventions(visit_id, catalog_code)
  where catalog_code is not null and status <> 'discarded';

create or replace function coag_private.enforce_intervention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.coag_visits%rowtype;
  v_catalog public.coag_intervention_catalog%rowtype;
begin
  if tg_op = 'UPDATE' and (new.visit_id is distinct from old.visit_id or new.catalog_code is distinct from old.catalog_code) then
    raise exception 'La visita y la actuación de catálogo de un registro no se pueden modificar: anúlelo y regístrelo de nuevo.';
  end if;
  select * into v_visit from public.coag_visits v where v.id = new.visit_id;
  if tg_op = 'INSERT' and v_visit.status = 'cancelled' then
    raise exception 'No se registran actuaciones en una visita anulada.';
  end if;

  if new.catalog_code is not null then
    select * into v_catalog from public.coag_intervention_catalog c where c.code = new.catalog_code;
    if not found or not v_catalog.is_active then
      raise exception 'Actuación de catálogo no válida: %.', new.catalog_code;
    end if;
    new.domain := v_catalog.domain;
  else
    new.custom_text := trim(new.custom_text);
  end if;
  new.followup_note := nullif(trim(coalesce(new.followup_note, '')), '');

  if new.status = 'performed' then
    if new.performed_date is null then
      raise exception 'Indique la fecha en que se realizó la actuación.';
    end if;
    if new.performed_date > current_date then
      raise exception 'La fecha de realización no puede ser futura.';
    end if;
  elsif new.status = 'planned' then
    new.performed_date := null;
  end if;

  if tg_op = 'INSERT' then
    -- Prioridad vigente: última estratificación completada del paciente hasta la fecha de la visita.
    select s.final_priority into new.priority_context
      from public.coag_stratifications s join public.coag_visits sv on sv.id = s.visit_id
     where sv.patient_id = v_visit.patient_id and s.status = 'completed' and sv.status <> 'cancelled'
       and sv.visit_date <= v_visit.visit_date and s.final_priority is not null
     order by sv.visit_date desc, s.completed_at desc nulls last
     limit 1;
    new.recommended_for_priority := case
      when new.catalog_code is null or new.priority_context is null then null
      else new.priority_context = any (v_catalog.applies_to_priorities) end;
    new.revision := 1;
    new.created_by := auth.uid();
    new.created_at := timezone('utc', now());
  else
    new.priority_context := old.priority_context;
    new.recommended_for_priority := old.recommended_for_priority;
    new.revision := old.revision + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_coag_interventions_rules before insert or update on public.coag_interventions
for each row execute function coag_private.enforce_intervention();
create trigger trg_coag_interventions_audit after insert or update or delete on public.coag_interventions
for each row execute function coag_private.write_audit_log();

-- ── RLS y privilegios ───────────────────────────────────────────────────────

alter table public.coag_intervention_catalog enable row level security;
alter table public.coag_interventions enable row level security;
revoke all on public.coag_intervention_catalog, public.coag_interventions from public, anon, authenticated;
revoke all on function coag_private.enforce_intervention() from public, anon, authenticated;

create policy coag_app_gate on public.coag_intervention_catalog as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));
create policy coag_catalog_select on public.coag_intervention_catalog for select to authenticated
  using (coag_private.is_active_user());

create policy coag_app_gate on public.coag_interventions as restrictive for all to authenticated
  using (app_private.has_app_access('coag')) with check (app_private.has_app_access('coag'));
create policy coag_interventions_select on public.coag_interventions for select to authenticated
  using (coag_private.can_access_visit(visit_id));
create policy coag_interventions_insert on public.coag_interventions for insert to authenticated
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_interventions_update on public.coag_interventions for update to authenticated
  using (coag_private.can_access_visit(visit_id))
  with check (coag_private.is_active_user() and coag_private.can_access_visit(visit_id));
create policy coag_interventions_delete on public.coag_interventions for delete to authenticated
  using (coag_private.is_coordinator());

grant select on public.coag_intervention_catalog to authenticated;
grant select on public.coag_interventions to authenticated;
grant insert (visit_id, catalog_code, custom_text, domain, status, performed_date, followup_note),
      update (custom_text, domain, status, performed_date, followup_note)
  on public.coag_interventions to authenticated;
grant delete on public.coag_interventions to authenticated;
