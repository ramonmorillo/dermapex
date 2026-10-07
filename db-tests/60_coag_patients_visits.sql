-- SOLO PARA PRUEBAS LOCALES. COAMO · pacientes, inclusión y visitas (migraciones 20261007170000/170100).
-- Se ejecuta tras 50_* (CI1 = investigadora LAFE, CI2 = investigador VHEBRON, CC = coordinación
-- COAMO, C = coordinación DERMAPEX).

\set ON_ERROR_STOP on
\set QUIET on

select id as lafe_id from public.coag_centers where code = 'LAFE' \gset
select id as vhebron_id from public.coag_centers where code = 'VHEBRON' \gset
select id as valme_id from public.coag_centers where code = 'VALME' \gset

-- ── Centros: denominación oficial ───────────────────────────────────────────

select dermapex_test.expect(
  (select name || ' (' || city || ')' from public.coag_centers where code = 'LAFE') = 'Hospital Universitari i Politècnic La Fe (Valencia)'
  and (select name from public.coag_centers where code = 'VALME') = 'Hospital Universitario Nuestra Señora de Valme',
  'centros con la denominación oficial del protocolo (p. 9)');

-- ── Alta de pacientes ───────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_patients (center_id, age_at_inclusion, sex, diagnosis) values (%L, 45, 'male', 'HA')$$, :'lafe_id')) = 1,
  'CI1 da de alta un paciente en su centro');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_patients (center_id, age_at_inclusion, sex, diagnosis) values (%L, 17, 'female', 'EVW')$$, :'lafe_id')) = 1,
  'CI1 da de alta un segundo paciente (cribado)');
select dermapex_test.expect(
  (select string_agg(study_code, ',' order by center_seq) from public.coag_patients) = 'COAMO-1-0001,COAMO-1-0002',
  'código COAMO-<n>-NNNN correlativo asignado por la BD');
select dermapex_test.expect((select bool_and(status = 'screening') from public.coag_patients), 'los pacientes nuevos empiezan en cribado');
select dermapex_test.expect((select count(*) from public.coag_inclusions) = 2, 'cada paciente tiene su ficha de inclusión');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_patients (center_id, diagnosis, study_code) values (%L, 'HA', 'COAMO-1-9999')$$, :'lafe_id'),
  'el código no lo puede fijar el cliente');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_patients (center_id, diagnosis) values (%L, 'HB')$$, :'vhebron_id'),
  'CI1 no da de alta pacientes en otro centro');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_patients (center_id, diagnosis) values (%L, 'XX')$$, :'lafe_id'),
  'diagnóstico solo HA/HB/EVW');
commit;

select id as p1 from public.coag_patients where study_code = 'COAMO-1-0001' \gset
select id as p2 from public.coag_patients where study_code = 'COAMO-1-0002' \gset

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_patients (center_id, diagnosis) values (%L, 'HA')$$, :'valme_id'),
  'Valme (consultor) no incluye pacientes, ni siquiera coordinación');
commit;

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
insert into public.coag_patients (center_id, age_at_inclusion, sex, diagnosis) values (:'vhebron_id', 60, 'male', 'HB');
select dermapex_test.expect((select study_code from public.coag_patients) = 'COAMO-2-0001', 'cada centro tiene su numeración; CI2 solo ve su paciente');
commit;

-- ── Visibilidad y aislamiento ───────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_patients') = 3, 'coordinación COAMO ve los pacientes de todos los centros');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(
  dermapex_test.count_rows('public.coag_patients') = 0 and dermapex_test.count_rows('public.coag_visits') = 0
  and dermapex_test.count_rows('public.coag_inclusions') = 0 and dermapex_test.count_rows('public.coag_patient_schedule') = 0,
  'coordinación DERMAPEX no ve pacientes, inclusiones, visitas ni calendario COAMO');
commit;
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.coag_patients', 'anon no lee pacientes COAMO');
select dermapex_test.expect_fail('select * from public.coag_patient_schedule', 'anon no lee el calendario COAMO');
commit;

-- ── Inclusión ───────────────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'included' where id = %L$$, :'p1'),
  'no se incluye sin evaluar la elegibilidad');
update public.coag_inclusions set inc_age_18 = true, inc_diagnosis = true, inc_written_consent = true,
  inc_no_limiting_condition = true, inc_hospital_pharmacy_followup = true,
  exc_unable_without_support = false, exc_unable_visits = false, exc_interfering_trial = true,
  questionnaire_support = 'family_or_caregiver', consent_date = current_date - 40, consent_version = 'v1.0'
 where patient_id = :'p1';
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'included' where id = %L$$, :'p1'),
  'un criterio de exclusión impide la inclusión');
update public.coag_inclusions set exc_interfering_trial = false, consent_date = null where patient_id = :'p1';
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'included' where id = %L$$, :'p1'),
  'sin fecha de consentimiento escrito no hay inclusión');
update public.coag_inclusions set consent_date = current_date - 40 where patient_id = :'p1';
select dermapex_test.expect((select assessed_by from public.coag_inclusions where patient_id = :'p1') = 'c0a00000-5000-4000-8000-000000000001',
  'la evaluación de elegibilidad registra a su autora');
select dermapex_test.expect(dermapex_test.affected(format($$update public.coag_patients set status = 'included' where id = %L$$, :'p1')) = 1,
  'con todos los criterios y consentimiento, el paciente se incluye (apoyo para cuestionarios permitido)');
select dermapex_test.expect((select inclusion_date from public.coag_patients where id = :'p1') = current_date - 40,
  'la fecha de inclusión es la del consentimiento');

update public.coag_inclusions set inc_age_18 = true, inc_diagnosis = true, inc_written_consent = true,
  inc_no_limiting_condition = true, inc_hospital_pharmacy_followup = true,
  exc_unable_without_support = false, exc_unable_visits = false, exc_interfering_trial = false,
  consent_date = current_date where patient_id = :'p2';
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'included' where id = %L$$, :'p2'),
  'un paciente de 17 años no se incluye aunque se marquen los criterios');
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'not_included' where id = %L$$, :'p2'),
  'la no inclusión exige motivo');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_patients set status = 'not_included', status_reason = 'not_eligible' where id = %L$$, :'p2')) = 1,
  'no inclusión con motivo');
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'screening' where id = %L$$, :'p1'),
  'no se vuelve a cribado desde la API');
select dermapex_test.expect_fail(format($$update public.coag_patients set center_id = %L where id = %L$$, :'vhebron_id', :'p1'),
  'el centro de un paciente no cambia');
select dermapex_test.expect_fail(format($$update public.coag_patients set inclusion_date = current_date where id = %L$$, :'p1'),
  'la fecha de inclusión no la edita el cliente');
commit;

-- ── Visitas ─────────────────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (%L, 'baseline', current_date, 'in_person')$$, :'p2'),
  'no hay visitas de pacientes no incluidos');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (%L, 'followup', current_date, 'phone')$$, :'p1'),
  'el seguimiento exige visita basal previa');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (%L, 'baseline', current_date - 41, 'in_person')$$, :'p1'),
  'la basal no es anterior al consentimiento');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'p1', 'baseline', current_date - 30, 'in_person');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (%L, 'baseline', current_date - 20, 'in_person')$$, :'p1'),
  'solo una visita basal por paciente');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (%L, 'followup', current_date - 31, 'phone')$$, :'p1'),
  'ninguna visita anterior a la basal');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality, is_scheduled) values (%L, 'contact', current_date - 10, 'video', false)$$, :'p1')) = 1,
  'contacto telemático no programado');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality, status) values (%L, 'final', current_date + 300, 'in_person', 'completed')$$, :'p1'),
  'una visita final realizada no puede tener fecha futura');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_visits (patient_id, visit_type, visit_date, modality, status) values (%L, 'final', current_date + 335, 'in_person', 'scheduled')$$, :'p1')) = 1,
  'la visita final se puede programar');
select dermapex_test.expect(
  (select final_due_date = baseline_date + 365 or final_due_date = baseline_date + 366 from public.coag_patient_schedule where patient_id = :'p1'),
  'fecha esperada de la final = basal + 12 meses');
select dermapex_test.expect(
  (select final_in_window from public.coag_patient_schedule where patient_id = :'p1'),
  'la final programada a ~11 meses está dentro de la ventana ±1 mes');
select dermapex_test.expect((select created_by from public.coag_visits where visit_type = 'contact') = 'c0a00000-5000-4000-8000-000000000001',
  'la autoría de la visita se sella en servidor');
select dermapex_test.expect_fail(format($$update public.coag_visits set visit_type = 'final' where patient_id = %L and visit_type = 'contact'$$, :'p1'),
  'el tipo de visita no cambia');
commit;

select id as baseline_v from public.coag_visits where patient_id = :'p1' and visit_type = 'baseline' \gset
select id as contact_v from public.coag_visits where patient_id = :'p1' and visit_type = 'contact' \gset
select id as final_v from public.coag_visits where patient_id = :'p1' and visit_type = 'final' \gset

-- ── Datos clínicos ──────────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_clinical_assessments (visit_id, weight_kg) values (%L, 70)$$, :'contact_v'),
  'los datos clínicos del protocolo van en basal o final, no en contactos');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_clinical_assessments (visit_id, vwd_type) values (%L, '2')$$, :'baseline_v'),
  'el tipo de EVW no aplica a hemofilia A');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_clinical_assessments (visit_id, target_joint_detail) values (%L, 'Rodilla derecha')$$, :'baseline_v'),
  'la localización de la articulación diana exige articulación diana presente');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_clinical_assessments (visit_id, weight_kg, height_m, hemophilia_severity, treatment_regimen,
      treatment_type, inhibitors, target_joint_present, target_joint_detail, dispensations_collected, dispensations_expected)
    values (%L, 80, 1.75, 'severe', 'prophylaxis', 'recombinant_extended', false, true, 'Rodilla derecha', 11, 12)$$, :'baseline_v')) = 1,
  'datos clínicos basales registrados');
select dermapex_test.expect((select bmi from public.coag_clinical_assessments where visit_id = :'baseline_v') = 26.1, 'IMC calculado por la BD (80 / 1,75² = 26,1)');
select dermapex_test.expect((select diabetes is null from public.coag_clinical_assessments where visit_id = :'baseline_v'), 'lo no registrado queda vacío, no «No»');
select dermapex_test.expect_fail(format($$update public.coag_clinical_assessments set bmi = 10 where visit_id = %L$$, :'baseline_v'), 'el IMC no se edita a mano');
select dermapex_test.expect_fail(format($$update public.coag_clinical_assessments set spontaneous_bleeds = -1 where visit_id = %L$$, :'baseline_v'), 'recuentos de sangrados no negativos');
commit;

-- ── Fin de seguimiento ──────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect_fail(format($$update public.coag_patients set status = 'completed' where id = %L$$, :'p1'),
  'no se completa el seguimiento sin visita final realizada');
select dermapex_test.expect(dermapex_test.affected(format($$delete from public.coag_patients where id = %L$$, :'p1')) = 0,
  'una investigadora no borra pacientes');
commit;

-- Visita final realizada (fecha simulada: como administrador, para no esperar 12 meses).
update public.coag_visits set status = 'completed', visit_date = current_date where id = :'final_v';
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(
  (select final_in_window is false and final_deviation_days < 0 from public.coag_patient_schedule where patient_id = :'p1'),
  'una final a los 30 días queda señalada fuera de ventana, con su desviación');
select dermapex_test.expect(dermapex_test.affected(format($$update public.coag_patients set status = 'completed' where id = %L$$, :'p1')) = 1,
  'con la final realizada, el seguimiento se completa');
commit;

-- ── Centro con pacientes y auditoría ────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect_fail($$update public.coag_centers set study_number = 50 where code = 'LAFE'$$,
  'no cambia el número de un centro con pacientes');
select dermapex_test.expect_fail($$update public.coag_centers set center_role = 'consulting', study_number = null where code = 'LAFE'$$,
  'no cambia la función de un centro con pacientes');
select dermapex_test.expect(
  (select count(*) from public.coag_audit_log where patient_id = :'p1' and table_name in ('coag_patients', 'coag_inclusions', 'coag_visits', 'coag_clinical_assessments')) >= 8,
  'altas y cambios de paciente, inclusión, visitas y datos clínicos quedan auditados con su paciente');
commit;

select dermapex_test.expect(not exists (select 1 from public.audit_log where table_name like 'coag\_%'), 'nada de COAMO en la auditoría DERMAPEX');

\echo 'COAMO: todas las pruebas de pacientes, inclusión y visitas superadas.'
