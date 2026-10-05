-- DERMAPEX · 04 · Seguridad a nivel de fila (RLS) por centro y privilegios.
--
-- Reglas:
--   · Sin sesión (anon): ningún acceso a ninguna tabla.
--   · Usuario sin perfil activo o sin centro asignado: no ve datos clínicos.
--   · investigator: lee y escribe datos de los pacientes de SUS centros.
--   · coordinator: lee y escribe en todos los centros; único rol que borra pacientes, visitas y
--     registros clínicos, gestiona centros, pertenencias y catálogos, y consulta la auditoría.
--   · El rol de un perfil solo se cambia por SQL (service role): sin privilegio de columna vía API.
--   · audit_log: solo inserción por trigger; ningún rol de la API puede modificarlo ni borrarlo.
--
-- Se usa ENABLE (no FORCE) RLS: las políticas aplican a anon/authenticated; las funciones
-- SECURITY DEFINER de app_private (propiedad del rol que migra) pueden leer las tablas de control.

-- ── Funciones de decisión de acceso ─────────────────────────────────────────

create or replace function app_private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create or replace function app_private.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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
      or exists (
        select 1
          from public.center_memberships cm
          join public.profiles p on p.id = cm.profile_id and p.is_active
         where cm.profile_id = auth.uid() and cm.center_id = p_center_id
      );
$$;

create or replace function app_private.can_access_patient(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients pt
     where pt.id = p_patient_id and app_private.can_access_center(pt.center_id)
  );
$$;

create or replace function app_private.can_access_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.visits v
      join public.patients pt on pt.id = v.patient_id
     where v.id = p_visit_id and app_private.can_access_center(pt.center_id)
  );
$$;

revoke all on all functions in schema app_private from public;
grant usage on schema app_private to authenticated;
grant execute on function
  app_private.is_active_user(),
  app_private.is_coordinator(),
  app_private.can_access_center(uuid),
  app_private.can_access_patient(uuid),
  app_private.can_access_visit(uuid)
to authenticated;

-- ── Activar RLS en todas las tablas ─────────────────────────────────────────

alter table public.centers enable row level security;
alter table public.profiles enable row level security;
alter table public.center_memberships enable row level security;
alter table public.audit_log enable row level security;
alter table public.patients enable row level security;
alter table public.consents enable row level security;
alter table public.visits enable row level security;
alter table public.cmo_scores enable row level security;
alter table public.cmo_variable_catalog enable row level security;
alter table public.cmo_score_item_results enable row level security;
alter table public.intervention_catalog enable row level security;
alter table public.interventions enable row level security;
alter table public.questionnaire_measurement_map enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.visit_process_records enable row level security;
alter table public.visit_documents enable row level security;
alter table public.medication_catalog enable row level security;
alter table public.med_catalog_ingredients enable row level security;
alter table public.med_catalog_concepts enable row level security;
alter table public.med_catalog_concept_ingredients enable row level security;
alter table public.med_catalog_products enable row level security;
alter table public.med_catalog_aliases enable row level security;
alter table public.patient_medications enable row level security;
alter table public.visit_medication_events enable row level security;

-- ── Privilegios de tabla (defensa en profundidad además de RLS) ─────────────

revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke insert, update, delete on public.audit_log from authenticated;

revoke insert, update on public.profiles from authenticated;
grant insert (id, full_name), update (id, full_name) on public.profiles to authenticated;

-- ── Control de acceso: centros, perfiles, pertenencias, auditoría ───────────

create policy centers_select on public.centers for select to authenticated
  using (app_private.can_access_center(id));
create policy centers_insert on public.centers for insert to authenticated
  with check (app_private.is_coordinator());
create policy centers_update on public.centers for update to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());
create policy centers_delete on public.centers for delete to authenticated
  using (app_private.is_coordinator());

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app_private.is_coordinator());
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or app_private.is_coordinator())
  with check (id = auth.uid() or app_private.is_coordinator());

create policy center_memberships_select on public.center_memberships for select to authenticated
  using (profile_id = auth.uid() or app_private.is_coordinator());
create policy center_memberships_insert on public.center_memberships for insert to authenticated
  with check (app_private.is_coordinator());
create policy center_memberships_update on public.center_memberships for update to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());
create policy center_memberships_delete on public.center_memberships for delete to authenticated
  using (app_private.is_coordinator());

create policy audit_log_select on public.audit_log for select to authenticated
  using (app_private.is_coordinator());

-- ── Pacientes ───────────────────────────────────────────────────────────────

create policy patients_select on public.patients for select to authenticated
  using (app_private.can_access_center(center_id));
create policy patients_insert on public.patients for insert to authenticated
  with check (app_private.can_access_center(center_id));
create policy patients_update on public.patients for update to authenticated
  using (app_private.can_access_center(center_id))
  with check (app_private.can_access_center(center_id));
create policy patients_delete on public.patients for delete to authenticated
  using (app_private.is_coordinator());

-- ── Tablas colgadas del paciente ────────────────────────────────────────────

create policy consents_select on public.consents for select to authenticated
  using (app_private.can_access_patient(patient_id));
create policy consents_insert on public.consents for insert to authenticated
  with check (app_private.can_access_patient(patient_id));
create policy consents_update on public.consents for update to authenticated
  using (app_private.can_access_patient(patient_id)) with check (app_private.can_access_patient(patient_id));
create policy consents_delete on public.consents for delete to authenticated
  using (app_private.is_coordinator());

create policy visits_select on public.visits for select to authenticated
  using (app_private.can_access_patient(patient_id));
create policy visits_insert on public.visits for insert to authenticated
  with check (app_private.can_access_patient(patient_id));
create policy visits_update on public.visits for update to authenticated
  using (app_private.can_access_patient(patient_id)) with check (app_private.can_access_patient(patient_id));
create policy visits_delete on public.visits for delete to authenticated
  using (app_private.is_coordinator());

create policy patient_medications_select on public.patient_medications for select to authenticated
  using (app_private.can_access_patient(patient_id));
create policy patient_medications_insert on public.patient_medications for insert to authenticated
  with check (app_private.can_access_patient(patient_id));
create policy patient_medications_update on public.patient_medications for update to authenticated
  using (app_private.can_access_patient(patient_id)) with check (app_private.can_access_patient(patient_id));
create policy patient_medications_delete on public.patient_medications for delete to authenticated
  using (app_private.is_coordinator());

-- ── Tablas colgadas de la visita ────────────────────────────────────────────

create policy cmo_scores_select on public.cmo_scores for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy cmo_scores_insert on public.cmo_scores for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy cmo_scores_update on public.cmo_scores for update to authenticated
  using (app_private.can_access_visit(visit_id)) with check (app_private.can_access_visit(visit_id));
create policy cmo_scores_delete on public.cmo_scores for delete to authenticated
  using (app_private.is_coordinator());

-- El servicio borra y reinserta los resultados por ítem al recalcular: borrado permitido al centro.
create policy cmo_score_item_results_select on public.cmo_score_item_results for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy cmo_score_item_results_insert on public.cmo_score_item_results for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy cmo_score_item_results_update on public.cmo_score_item_results for update to authenticated
  using (app_private.can_access_visit(visit_id)) with check (app_private.can_access_visit(visit_id));
create policy cmo_score_item_results_delete on public.cmo_score_item_results for delete to authenticated
  using (app_private.can_access_visit(visit_id));

create policy interventions_select on public.interventions for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy interventions_insert on public.interventions for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy interventions_update on public.interventions for update to authenticated
  using (app_private.can_access_visit(visit_id)) with check (app_private.can_access_visit(visit_id));
create policy interventions_delete on public.interventions for delete to authenticated
  using (app_private.is_coordinator());

create policy questionnaire_responses_select on public.questionnaire_responses for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy questionnaire_responses_insert on public.questionnaire_responses for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy questionnaire_responses_update on public.questionnaire_responses for update to authenticated
  using (app_private.can_access_visit(visit_id)) with check (app_private.can_access_visit(visit_id));
create policy questionnaire_responses_delete on public.questionnaire_responses for delete to authenticated
  using (app_private.is_coordinator());

create policy visit_process_records_select on public.visit_process_records for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy visit_process_records_insert on public.visit_process_records for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy visit_process_records_update on public.visit_process_records for update to authenticated
  using (app_private.can_access_visit(visit_id)) with check (app_private.can_access_visit(visit_id));
create policy visit_process_records_delete on public.visit_process_records for delete to authenticated
  using (app_private.is_coordinator());

-- Eventos de medicación: traza longitudinal, solo inserción para el centro.
create policy visit_medication_events_select on public.visit_medication_events for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy visit_medication_events_insert on public.visit_medication_events for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy visit_medication_events_delete on public.visit_medication_events for delete to authenticated
  using (app_private.is_coordinator());

-- Documentos: el centro sube y consulta; borra quien lo subió o coordinación. Sin edición.
create policy visit_documents_select on public.visit_documents for select to authenticated
  using (app_private.can_access_visit(visit_id));
create policy visit_documents_insert on public.visit_documents for insert to authenticated
  with check (app_private.can_access_visit(visit_id));
create policy visit_documents_delete on public.visit_documents for delete to authenticated
  using (app_private.can_access_visit(visit_id) and (uploaded_by = auth.uid() or app_private.is_coordinator()));

-- ── Catálogos de configuración del estudio (lectura: usuarios activos; escritura: coordinación) ─

create policy cmo_variable_catalog_select on public.cmo_variable_catalog for select to authenticated
  using (app_private.is_active_user());
create policy cmo_variable_catalog_write on public.cmo_variable_catalog for all to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());

create policy intervention_catalog_select on public.intervention_catalog for select to authenticated
  using (app_private.is_active_user());
create policy intervention_catalog_write on public.intervention_catalog for all to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());

create policy questionnaire_measurement_map_select on public.questionnaire_measurement_map for select to authenticated
  using (app_private.is_active_user());
create policy questionnaire_measurement_map_write on public.questionnaire_measurement_map for all to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());

-- ── Catálogos de medicamentos (datos de referencia compartidos, sin datos de pacientes) ─
-- Lectura, alta y actualización para usuarios activos (lo requiere el flujo CIMA del frontend);
-- borrado solo coordinación. medication_catalog no admite edición: los fuentes válidas se fijan
-- por restricción CHECK (external_cima, manual).

create policy medication_catalog_select on public.medication_catalog for select to authenticated
  using (app_private.is_active_user());
create policy medication_catalog_insert on public.medication_catalog for insert to authenticated
  with check (app_private.is_active_user());
create policy medication_catalog_update on public.medication_catalog for update to authenticated
  using (app_private.is_coordinator()) with check (app_private.is_coordinator());
create policy medication_catalog_delete on public.medication_catalog for delete to authenticated
  using (app_private.is_coordinator());

create policy med_catalog_ingredients_select on public.med_catalog_ingredients for select to authenticated
  using (app_private.is_active_user());
create policy med_catalog_ingredients_insert on public.med_catalog_ingredients for insert to authenticated
  with check (app_private.is_active_user());
create policy med_catalog_ingredients_update on public.med_catalog_ingredients for update to authenticated
  using (app_private.is_active_user()) with check (app_private.is_active_user());
create policy med_catalog_ingredients_delete on public.med_catalog_ingredients for delete to authenticated
  using (app_private.is_coordinator());

create policy med_catalog_concepts_select on public.med_catalog_concepts for select to authenticated
  using (app_private.is_active_user());
create policy med_catalog_concepts_insert on public.med_catalog_concepts for insert to authenticated
  with check (app_private.is_active_user());
create policy med_catalog_concepts_update on public.med_catalog_concepts for update to authenticated
  using (app_private.is_active_user()) with check (app_private.is_active_user());
create policy med_catalog_concepts_delete on public.med_catalog_concepts for delete to authenticated
  using (app_private.is_coordinator());

create policy med_catalog_concept_ingredients_select on public.med_catalog_concept_ingredients for select to authenticated
  using (app_private.is_active_user());
create policy med_catalog_concept_ingredients_insert on public.med_catalog_concept_ingredients for insert to authenticated
  with check (app_private.is_active_user());
create policy med_catalog_concept_ingredients_update on public.med_catalog_concept_ingredients for update to authenticated
  using (app_private.is_active_user()) with check (app_private.is_active_user());
create policy med_catalog_concept_ingredients_delete on public.med_catalog_concept_ingredients for delete to authenticated
  using (app_private.is_coordinator());

create policy med_catalog_products_select on public.med_catalog_products for select to authenticated
  using (app_private.is_active_user());
create policy med_catalog_products_insert on public.med_catalog_products for insert to authenticated
  with check (app_private.is_active_user());
create policy med_catalog_products_update on public.med_catalog_products for update to authenticated
  using (app_private.is_active_user()) with check (app_private.is_active_user());
create policy med_catalog_products_delete on public.med_catalog_products for delete to authenticated
  using (app_private.is_coordinator());

create policy med_catalog_aliases_select on public.med_catalog_aliases for select to authenticated
  using (app_private.is_active_user());
create policy med_catalog_aliases_insert on public.med_catalog_aliases for insert to authenticated
  with check (app_private.is_active_user());
create policy med_catalog_aliases_update on public.med_catalog_aliases for update to authenticated
  using (app_private.is_active_user()) with check (app_private.is_active_user());
create policy med_catalog_aliases_delete on public.med_catalog_aliases for delete to authenticated
  using (app_private.is_coordinator());
