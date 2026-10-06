-- SOLO PARA PRUEBAS LOCALES. Batería de seguridad e integridad del esquema DERMAPEX.
-- Cada bloque se ejecuta impersonando a un usuario (como hace PostgREST: rol + claims JWT).
-- Cualquier aserción fallida aborta el script (ON_ERROR_STOP).

\set ON_ERROR_STOP on
\set QUIET on

create schema dermapex_test;
grant usage on schema dermapex_test to anon, authenticated;

create function dermapex_test.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function dermapex_test.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select set_config('role', 'anon', true);
$$;

create function dermapex_test.expect(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FALLO: %', p_msg; end if;
  raise notice 'OK  %', p_msg;
end $$;

create function dermapex_test.expect_fail(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  % (rechazado: %)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'FALLO: % (se esperaba rechazo y se aceptó)', p_msg;
end $$;

create function dermapex_test.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema dermapex_test to anon, authenticated;

-- ── Datos de partida (como administrador de BD) ─────────────────────────────
-- A, A2: investigadores del centro C1 · B: investigador de C2 · C: coordinación · D: sin centro

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@c1.test', '{"full_name":"Investigador A"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'a2@c1.test', '{}'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'b@c2.test', '{}'),
  ('cccccccc-0000-4000-8000-000000000001', 'coord@test', '{}'),
  ('dddddddd-0000-4000-8000-000000000001', 'nocenter@test', '{}');

select dermapex_test.expect((select count(*) from public.profiles) = 5, 'perfil creado automáticamente para cada usuario de Auth');
select dermapex_test.expect((select full_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Investigador A', 'full_name tomado de los metadatos de Auth');
select dermapex_test.expect((select bool_and(role = 'investigator') from public.profiles), 'rol por defecto = investigator');

update public.profiles set role = 'coordinator' where id = 'cccccccc-0000-4000-8000-000000000001';
insert into public.centers (id, code, name, study_arm, study_number) values
  ('11111111-0000-4000-8000-000000000001', 'C1', 'Centro uno', 'cmo', 1),
  ('11111111-0000-4000-8000-000000000002', 'C2', 'Centro dos', 'standard', 2);
insert into public.center_memberships (profile_id, center_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002');

-- ── Sin sesión ──────────────────────────────────────────────────────────────
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.patients', 'anon no puede leer pacientes');
select dermapex_test.expect_fail('select * from public.centers', 'anon no puede leer centros');
select dermapex_test.expect_fail('select * from public.medication_catalog', 'anon no puede leer el catálogo');
select dermapex_test.expect_fail('select app_private.is_coordinator()', 'anon no puede ejecutar las funciones internas de acceso');
select dermapex_test.expect_fail($$insert into storage.objects (bucket_id, name) values ('visit-documents', 'visits/a1000000-0000-4000-8000-0000000000a1/anon.pdf')$$, 'anon no puede subir documentos');
commit;

-- ── Investigador A (centro C1) ──────────────────────────────────────────────
begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000001');

-- Alta sin centro → se asigna su único centro; autoría sellada aunque el cliente envíe otra.
insert into public.patients (id, study_code, age_at_inclusion, sex, created_by)
values ('a0000000-0000-4000-8000-0000000000a1', 'DPX-C1-001', 34, 'female', 'bbbbbbbb-0000-4000-8000-000000000001');
select dermapex_test.expect((select center_id from public.patients where id = 'a0000000-0000-4000-8000-0000000000a1') = '11111111-0000-4000-8000-000000000001', 'centro asignado por defecto (único centro del usuario)');
select dermapex_test.expect((select created_by from public.patients where id = 'a0000000-0000-4000-8000-0000000000a1') = 'aaaaaaaa-0000-4000-8000-000000000001', 'created_by sellado con el usuario real (no suplantable)');

select dermapex_test.expect_fail($$insert into public.patients (study_code, center_id) values ('DPX-C2-X', '11111111-0000-4000-8000-000000000002')$$, 'A no puede crear pacientes en otro centro');
select dermapex_test.expect_fail($$insert into public.patients (study_code, center_id, age_at_inclusion) values ('DPX-MENOR', '11111111-0000-4000-8000-000000000001', 16)$$, 'edad < 18 rechazada (estudio en adultos)');
select dermapex_test.expect_fail($$update public.patients set center_id = '11111111-0000-4000-8000-000000000002' where id = 'a0000000-0000-4000-8000-0000000000a1'$$, 'A no puede mover un paciente a otro centro');

insert into public.visits (id, patient_id, visit_type, visit_number, scheduled_date, visit_status, created_by)
values ('a1000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a1', 'baseline', 1, '2026-10-05', 'scheduled', 'aaaaaaaa-0000-4000-8000-000000000001');
select dermapex_test.expect_fail($$insert into public.visits (patient_id, visit_type, created_by) values ('a0000000-0000-4000-8000-0000000000a1', 'month_24', 'aaaaaaaa-0000-4000-8000-000000000001')$$, 'tipo de visita no admitido');

-- Puntuación CMO: solo mediante save_cmo_stratification (ver 20_cmo_stratification.sql). Un segundo
-- guardado en la misma visita actualiza el registro (una estratificación por visita).
select public.save_cmo_stratification('a1000000-0000-4000-8000-0000000000a1', 'baseline', 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-1.0.0+src.227e444',
  (select jsonb_object_agg(variable_code, case when value_type = 'select' then 'ninguna' else 'no' end) from public.cmo_variable_catalog where value_type <> 'derived_age'), 2, 3);
select public.save_cmo_stratification('a1000000-0000-4000-8000-0000000000a1', 'baseline', 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-1.0.0+src.227e444',
  (select jsonb_object_agg(variable_code, case when value_type = 'select' then 'ninguna' when variable_code in ('naive_terapia', 'falta_adherencia', 'polimedicacion', 'tabaquismo', 'medicamento_reciente', 'sexo_mujer') then 'si' else 'no' end) from public.cmo_variable_catalog where value_type <> 'derived_age'), 18, 2);
select dermapex_test.expect((select priority from public.cmo_scores where visit_id = 'a1000000-0000-4000-8000-0000000000a1') = 2, 'nuevo guardado de la estratificación de la visita (actualiza)');
select dermapex_test.expect((select count(*) from public.cmo_scores where visit_id = 'a1000000-0000-4000-8000-0000000000a1') = 1, 'una sola estratificación por visita');

insert into public.interventions (visit_id, intervention_type, intervention_domain, priority_level, delivered, linked_to_cmo_level, delivered_by)
values ('a1000000-0000-4000-8000-0000000000a1', 'Intervención en texto libre', 'Capacidad', 'medium', true, 2, 'aaaaaaaa-0000-4000-8000-000000000001');

-- Cuestionarios: sin instrumento configurado no se puede guardar.
select dermapex_test.expect_fail($$insert into public.questionnaire_responses (visit_id, user_id, measurement_id, questionnaire_code, responses) values ('a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), 'IEXPAC', '{}')$$, 'cuestionario no configurado rechazado');
select dermapex_test.expect_fail($$insert into public.questionnaire_measurement_map (questionnaire_code) values ('IEXPAC')$$, 'investigador no puede configurar instrumentos');

-- El módulo «Proceso» (visit_process_records) se retiró en 20261006120000.
select dermapex_test.expect((select to_regclass('public.visit_process_records')) is null, 'tabla visit_process_records retirada');

-- Medicación (flujo del frontend: catálogo manual → medicación del paciente → evento de visita).
select dermapex_test.expect_fail($$insert into public.medication_catalog (source, display_name) values ('foo', 'Medicamento X')$$, 'fuente de catálogo no permitida');
insert into public.medication_catalog (id, source, display_name) values ('e0000000-0000-4000-8000-000000000001', 'manual', 'Medicamento manual de prueba');
insert into public.patient_medications (id, patient_id, medication_catalog_id, is_active, created_by)
values ('e1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-000000000001', true, 'aaaaaaaa-0000-4000-8000-000000000001');
insert into public.visit_medication_events (visit_id, patient_medication_id, event_type, new_value, created_by)
values ('a1000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-000000000001', 'added', '{}', 'aaaaaaaa-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected($$update public.visit_medication_events set event_type = 'stopped'$$) = 0, 'los eventos de medicación no se pueden editar');

-- Catálogo normalizado CIMA (flujo de normalizedCatalogService).
insert into public.med_catalog_ingredients (id, source, name_normalized, name_display) values ('e2000000-0000-4000-8000-000000000001', 'cima', 'principio x', 'Principio X');
insert into public.med_catalog_concepts (id, canonical_name, fingerprint, atc_codes) values ('e3000000-0000-4000-8000-000000000001', 'Principio X 10 mg', 'fp-x-10', '{}');
insert into public.med_catalog_concept_ingredients (concept_id, ingredient_id, sort_order) values ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 1);
update public.med_catalog_concept_ingredients set sort_order = 2 where concept_id = 'e3000000-0000-4000-8000-000000000001';
insert into public.med_catalog_products (concept_id, source, cima_cn, cima_name, routes, atc_codes) values ('e3000000-0000-4000-8000-000000000001', 'external_cima', '123456', 'X 10 mg', '{oral}', '{}');
insert into public.med_catalog_aliases (concept_id, alias_text, alias_normalized, alias_type) values ('e3000000-0000-4000-8000-000000000001', 'X', 'x', 'cima_name');

-- Documentos y Storage.
insert into storage.objects (bucket_id, name) values ('visit-documents', 'visits/a1000000-0000-4000-8000-0000000000a1/f1.pdf');
insert into public.visit_documents (id, visit_id, uploaded_by, original_file_name, stored_file_path, mime_type, file_size, document_type)
values ('d0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'informe.pdf', 'visits/a1000000-0000-4000-8000-0000000000a1/f1.pdf', 'application/pdf', 1024, 'lab_report');
select dermapex_test.expect_fail($$insert into storage.objects (bucket_id, name) values ('visit-documents', 'otra/ruta.pdf')$$, 'ruta de documento no válida rechazada');
select dermapex_test.expect_fail($$insert into public.visit_documents (visit_id, uploaded_by, original_file_name, stored_file_path, mime_type, file_size, document_type) values ('a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'x.docx', 'visits/a1000000-0000-4000-8000-0000000000a1/x.docx', 'application/msword', 10, 'other')$$, 'solo se admiten PDF');

-- Perfil: puede actualizar su nombre (upsert del frontend), nunca su rol ni el perfil de otro.
insert into public.profiles (id, full_name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Investigador A (editado)')
on conflict (id) do update set id = excluded.id, full_name = excluded.full_name;
select dermapex_test.expect_fail($$update public.profiles set role = 'coordinator' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'un investigador no puede escalarse a coordinador');
select dermapex_test.expect(dermapex_test.affected($$update public.profiles set full_name = 'x' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$) = 0, 'no puede editar el perfil de otro usuario');
select dermapex_test.expect_fail($$insert into public.center_memberships (profile_id, center_id) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002')$$, 'no puede asignarse otro centro');

-- Auditoría: invisible e inmodificable para investigadores; borrados clínicos no permitidos.
select dermapex_test.expect((select count(*) from public.audit_log) = 0, 'investigador no ve el registro de auditoría');
select dermapex_test.expect_fail($$insert into public.audit_log (table_name, action) values ('x', 'INSERT')$$, 'no puede escribir en la auditoría');
select dermapex_test.expect(dermapex_test.affected($$delete from public.patients where id = 'a0000000-0000-4000-8000-0000000000a1'$$) = 0, 'investigador no puede borrar pacientes');
select dermapex_test.expect(dermapex_test.affected($$delete from public.visits$$) = 0, 'investigador no puede borrar visitas');
commit;

-- ── Investigador A2 (mismo centro C1) ───────────────────────────────────────
begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000002');
select dermapex_test.expect((select count(*) from public.patients) = 1, 'compañero del mismo centro ve el paciente (trabajo en equipo)');
select dermapex_test.expect((select count(*) from public.patient_medications) = 1, 'compañero del mismo centro ve la medicación');
select dermapex_test.expect(dermapex_test.affected($$delete from public.visit_documents where id = 'd0000000-0000-4000-8000-000000000001'$$) = 0, 'no puede borrar un documento subido por otro');
select dermapex_test.expect(dermapex_test.affected($$delete from storage.objects where name = 'visits/a1000000-0000-4000-8000-0000000000a1/f1.pdf'$$) = 0, 'no puede borrar el fichero subido por otro');
commit;

-- ── Investigador B (centro C2) ──────────────────────────────────────────────
begin;
select dermapex_test.as_user('bbbbbbbb-0000-4000-8000-000000000001');
select dermapex_test.expect((select count(*) from public.patients) = 0, 'B no ve pacientes de C1');
select dermapex_test.expect((select count(*) from public.visits) = 0, 'B no ve visitas de C1');
select dermapex_test.expect((select count(*) from public.cmo_scores) = 0, 'B no ve puntuaciones de C1');
select dermapex_test.expect((select count(*) from public.patient_medications) = 0, 'B no ve medicación de C1');
select dermapex_test.expect((select count(*) from public.visit_documents) = 0, 'B no ve documentos de C1');
select dermapex_test.expect((select count(*) from storage.objects) = 0, 'B no ve ficheros de C1');
select dermapex_test.expect((select count(*) from public.centers) = 1, 'B solo ve su propio centro');
select dermapex_test.expect((select count(*) from public.profiles) = 1, 'B solo ve su propio perfil');
select dermapex_test.expect((select count(*) from public.medication_catalog) = 1, 'el catálogo de medicamentos es compartido');
select dermapex_test.expect_fail($$insert into public.visits (patient_id, visit_type, created_by) values ('a0000000-0000-4000-8000-0000000000a1', 'month_6', 'bbbbbbbb-0000-4000-8000-000000000001')$$, 'B no puede crear visitas para pacientes de C1');
select dermapex_test.expect_fail($$insert into storage.objects (bucket_id, name) values ('visit-documents', 'visits/a1000000-0000-4000-8000-0000000000a1/intruso.pdf')$$, 'B no puede subir documentos a visitas de C1');
select dermapex_test.expect(dermapex_test.affected($$update public.patients set sex = 'male'$$) = 0, 'B no puede modificar pacientes de C1');

insert into public.patients (id, study_code, created_by) values ('b0000000-0000-4000-8000-0000000000b1', 'DPX-C2-001', 'bbbbbbbb-0000-4000-8000-000000000001');
insert into public.visits (id, patient_id, visit_type, created_by) values ('b1000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-0000000000b1', 'baseline', 'bbbbbbbb-0000-4000-8000-000000000001');
commit;

-- ── Usuario sin centro ──────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('dddddddd-0000-4000-8000-000000000001');
select dermapex_test.expect((select count(*) from public.patients) = 0, 'usuario sin centro no ve pacientes');
select dermapex_test.expect_fail($$insert into public.patients (study_code, created_by) values ('DPX-X', 'dddddddd-0000-4000-8000-000000000001')$$, 'usuario sin centro no puede dar de alta pacientes');
commit;

-- ── Coordinación ────────────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect((select count(*) from public.patients) = 2, 'coordinación ve pacientes de todos los centros');
select dermapex_test.expect((select count(*) from public.audit_log) > 0, 'coordinación consulta la auditoría');
select dermapex_test.expect(
  (select count(*) from public.audit_log where table_name = 'patients' and action = 'INSERT'
     and actor_id = 'aaaaaaaa-0000-4000-8000-000000000001' and center_id = '11111111-0000-4000-8000-000000000001') = 1,
  'auditoría registra autor y centro del alta de paciente');
select dermapex_test.expect((select count(*) from public.audit_log where table_name in ('patient_medications', 'visit_medication_events', 'visit_documents')) = 3, 'auditoría cubre medicación y documentos');
select dermapex_test.expect_fail($$delete from public.audit_log$$, 'ni coordinación puede borrar la auditoría');

-- Configurar un instrumento habilita el guardado de respuestas (y se comprueba la trazabilidad).
insert into public.questionnaire_measurement_map (questionnaire_code, measurement_id, label) values
  ('TEST_PRO', 'f0000000-0000-4000-8000-000000000001', 'Instrumento de prueba'),
  ('TEST_PRO_2', 'f0000000-0000-4000-8000-000000000002', 'Instrumento de prueba 2');
commit;

begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.questionnaire_responses (visit_id, user_id, measurement_id, questionnaire_code, responses)
values ('a1000000-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'TEST_PRO', '{"q1":1}')
on conflict (visit_id, questionnaire_code) do update set responses = excluded.responses;
select dermapex_test.expect((select user_id from public.questionnaire_responses) = 'aaaaaaaa-0000-4000-8000-000000000001', 'autoría del cuestionario sellada con el usuario real');
select dermapex_test.expect_fail($$insert into public.questionnaire_responses (visit_id, user_id, measurement_id, questionnaire_code) values ('a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'TEST_PRO')$$, 'measurement_id de otro instrumento rechazado (trazabilidad)');
select dermapex_test.expect_fail($$insert into public.questionnaire_responses (visit_id, user_id, measurement_id, questionnaire_code) values ('a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'TEST_PRO')$$, 'segunda respuesta del mismo cuestionario en la visita rechazada');
select dermapex_test.expect(dermapex_test.affected($$delete from public.visit_documents where id = 'd0000000-0000-4000-8000-000000000001'$$) = 1, 'quien sube un documento puede borrarlo');
select dermapex_test.expect(dermapex_test.affected($$delete from storage.objects where name = 'visits/a1000000-0000-4000-8000-0000000000a1/f1.pdf'$$) = 1, 'quien sube un fichero puede borrarlo');
commit;

-- Desactivar un perfil revoca el acceso sin borrar su trazabilidad.
update public.profiles set is_active = false where id = 'aaaaaaaa-0000-4000-8000-000000000001';
begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select dermapex_test.expect((select count(*) from public.patients) = 0, 'perfil desactivado no ve pacientes');
select dermapex_test.expect((select count(*) from public.medication_catalog) = 0, 'perfil desactivado no ve catálogos');
commit;

-- Borrado por coordinación: en cascada y auditado.
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected($$delete from public.patients where id = 'a0000000-0000-4000-8000-0000000000a1'$$) = 1, 'coordinación puede borrar un paciente');
select dermapex_test.expect((select count(*) from public.visits where patient_id = 'a0000000-0000-4000-8000-0000000000a1') = 0, 'borrado en cascada de las visitas');
select dermapex_test.expect((select count(*) from public.audit_log where table_name = 'patients' and action = 'DELETE') = 1, 'borrado de paciente auditado (con datos previos)');
commit;

-- ── Cambio de contraseña obligatorio ────────────────────────────────────────
begin;
select dermapex_test.as_user('bbbbbbbb-0000-4000-8000-000000000001');
select dermapex_test.expect((select must_change_password from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'cuenta nueva obliga a cambiar la contraseña');
select dermapex_test.expect_fail($$update public.profiles set must_change_password = false where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, 'el indicador no se puede alterar directamente');
select public.mark_password_changed();
select dermapex_test.expect((select not must_change_password from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'mark_password_changed desactiva el indicador propio');
commit;
select dermapex_test.expect((select must_change_password from public.profiles where id = 'dddddddd-0000-4000-8000-000000000001'), 'mark_password_changed no afecta a otras cuentas');
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select public.mark_password_changed()', 'anon no puede ejecutar mark_password_changed');
commit;

\echo 'DERMAPEX: todas las pruebas de RLS e integridad superadas.'
