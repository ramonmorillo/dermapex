-- SOLO PARA PRUEBAS LOCALES. COAMO · cuestionarios V0/VF (migración 20261026120000).
-- Se ejecuta tras 60_* (CI1 = investigadora LAFE, CI2 = investigador VHEBRON, CC = coordinación
-- COAMO, C = coordinación DERMAPEX). Los ejemplos de puntuación coinciden con tests/questionnaires
-- del frontend COAMO.

\set ON_ERROR_STOP on
\set QUIET on

select id as lafe_id from public.coag_centers where code = 'LAFE' \gset

-- ── Paciente incluido con visitas basal y final (CI1) ───────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
insert into public.coag_patients (center_id, age_at_inclusion, sex, diagnosis) values (:'lafe_id', 52, 'male', 'HB');
commit;
select id as q_p from public.coag_patients where center_id = :'lafe_id' order by center_seq desc limit 1 \gset
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
update public.coag_inclusions set inc_age_18 = true, inc_diagnosis = true, inc_written_consent = true,
  inc_no_limiting_condition = true, inc_hospital_pharmacy_followup = true,
  exc_unable_without_support = false, exc_unable_visits = false, exc_interfering_trial = false,
  consent_date = current_date - 400 where patient_id = :'q_p';
update public.coag_patients set status = 'included' where id = :'q_p';
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'q_p', 'baseline', current_date - 390, 'in_person');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'q_p', 'final', current_date - 5, 'in_person');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality, is_scheduled) values (:'q_p', 'contact', current_date - 100, 'phone', false);
commit;
select id as v0 from public.coag_visits where patient_id = :'q_p' and visit_type = 'baseline' \gset
select id as vf from public.coag_visits where patient_id = :'q_p' and visit_type = 'final' \gset
select id as vc from public.coag_visits where patient_id = :'q_p' and visit_type = 'contact' \gset

-- ── IEXPAC: borrador, parcial, cálculo y correcciones ───────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, responses)
    values (%L, 'IEXPAC', '{"q1": 5, "q2": 1}')$$, :'v0')) = 1, 'CI1 guarda un borrador parcial de IEXPAC en V0');
select dermapex_test.expect(
  (select status = 'in_progress' and revision = 1 and (scores ->> 'items_answered')::int = 2
      and scores -> 'global_0_10' = 'null'::jsonb and scores -> 'sum' = 'null'::jsonb
      and instrument_version = 'IEXPAC-COAMO-2026-10-14' and created_by = 'c0a00000-5000-4000-8000-000000000001'
     from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'IEXPAC'),
  'parcial: sin suma ni global (no se imputa), versión y autoría selladas por la BD');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code) values (%L, 'IEXPAC')$$, :'v0'),
  'una sola administración por visita e instrumento');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code) values (%L, 'EVASAF')$$, :'vc'),
  'no hay cuestionarios en contactos ni seguimientos');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = '{"q16": 3}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'ítem inexistente rechazado');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = '{"q1": 0}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'IEXPAC: 0 fuera de escala (1-5)');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = '{"q1": 3.5}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'valores no enteros rechazados');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = '{"q1": "3"}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'valores de texto rechazados');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = '{"q12": 3}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'ítem condicionado sin condición cumplida rechazado');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set scores = '{"global_0_10": 10}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'el cliente no escribe puntuaciones');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set revision = 50 where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'el cliente no escribe la revisión');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set status = 'completed' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'completar exige fecha y modalidad');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set administration_date = current_date + 1 where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'fecha de administración futura rechazada');
-- Ejemplo verificado: 5,4,3,2,1,5,4,3,2,1,3 → suma 33 → global 10 × (33 − 11) / 44 = 5
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations
       set responses = '{"q1":5,"q2":4,"q3":3,"q4":2,"q5":1,"q6":5,"q7":4,"q8":3,"q9":2,"q10":1,"q11":3,"q12":4}',
           item_applicability = '{"q12": true, "q13": false}',
           status = 'completed', administration_date = current_date - 390, administration_mode = 'self', data_source = 'paper'
     where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0')) = 1, 'IEXPAC completo con un ítem condicionado aplicable');
select dermapex_test.expect(
  (select (scores ->> 'sum')::int = 33 and (scores ->> 'global_0_10')::numeric = 5 and (scores ->> 'complete')::boolean
      and (scores ->> 'conditional_applicable')::int = 1 and (scores ->> 'conditional_answered')::int = 1
      and completed_at is not null and revision = 2
     from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'IEXPAC'),
  'IEXPAC: suma 33 y global 5,0; el ítem condicionado no entra en la suma');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = responses || '{"q1": 4}' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0'),
  'un cuestionario completado no se modifica sin motivo de corrección');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations
       set responses = responses || '{"q1": 4}', correction_reason = 'Error de transcripción del papel'
     where visit_id = %L and instrument_code = 'IEXPAC' and revision = 2$$, :'v0')) = 1, 'corrección con motivo');
select dermapex_test.expect(
  (select (scores ->> 'sum')::int = 32 and revision = 3 and correction_reason is null
      and last_correction_reason = 'Error de transcripción del papel'
      and last_corrected_by = 'c0a00000-5000-4000-8000-000000000001'
     from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'IEXPAC'),
  'la corrección recalcula, incrementa la revisión y conserva motivo y autoría');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set responses = responses || '{"q1": 3}', correction_reason = 'Revisión obsoleta'
     where visit_id = %L and instrument_code = 'IEXPAC' and revision = 2$$, :'v0')) = 0,
  'control de concurrencia: una edición sobre una revisión antigua no sobrescribe nada');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set correction_reason = 'Solo motivo, sin cambios' where visit_id = %L and instrument_code = 'IEXPAC'$$, :'v0')) = 1
  and (select last_correction_reason from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'IEXPAC') = 'Error de transcripción del papel',
  'sin cambios de contenido no se registra una corrección');
-- IEXPAC final: todos «siempre» → 55 → 10; todos «nunca» se prueba en el frontend.
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, status, administration_date, administration_mode, responses)
    values (%L, 'IEXPAC', 'completed', current_date - 5, 'assisted',
      '{"q1":5,"q2":5,"q3":5,"q4":5,"q5":5,"q6":5,"q7":5,"q8":5,"q9":5,"q10":5,"q11":5}')$$, :'vf')) = 1, 'IEXPAC VF completo');
select dermapex_test.expect(
  (select (scores ->> 'sum')::int = 55 and (scores ->> 'global_0_10')::numeric = 10
     from public.coag_questionnaire_administrations where visit_id = :'vf' and instrument_code = 'IEXPAC'),
  'IEXPAC: 11 × «siempre» = 55 → global 10');
commit;

-- ── EQ-5D-3L: modalidad, perfil y EVA ───────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, responses) values (%L, 'EQ5D3L', '{"mobility": 1}')$$, :'v0'),
  'EQ-5D-3L exige modalidad (los textos difieren)');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode) values (%L, 'EQ5D3L', 'assisted')$$, :'v0'),
  'EQ-5D-3L: solo autoadministrado o entrevista');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses) values (%L, 'EQ5D3L', 'self', '{"mobility": 4}')$$, :'v0'),
  'EQ-5D-3L: niveles 1-3');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses) values (%L, 'EQ5D3L', 'self', '{"vas": 101}')$$, :'v0'),
  'EVA 0-100');
insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses)
  values (:'v0', 'EQ5D3L', 'self', '{"mobility":1,"self_care":1,"usual_activities":2,"pain_discomfort":2,"vas":0}');
select dermapex_test.expect(
  (select scores -> 'profile' = 'null'::jsonb and (scores ->> 'vas')::int = 0 and (scores ->> 'dimensions_answered')::int = 4
      and scores -> 'utility_index' = 'null'::jsonb and instrument_version = 'EQ-5D-3L-ES-ES-v2.0-self'
     from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'EQ5D3L'),
  'perfil incompleto sin código; EVA 0 se conserva como valor válido; sin índice de utilidad; versión v2.0');
update public.coag_questionnaire_administrations set responses = responses || '{"anxiety_depression": 3}'
 where visit_id = :'v0' and instrument_code = 'EQ5D3L';
select dermapex_test.expect(
  (select scores ->> 'profile' = '11223' from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'EQ5D3L'),
  'perfil EQ-5D-3L de cinco dígitos en el orden del documento (11223)');
insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses)
  values (:'vf', 'EQ5D3L', 'interviewer', '{"mobility":1}');
select dermapex_test.expect(
  (select instrument_version = 'EQ-5D-3L-ES-ES-v1.0-interviewer' from public.coag_questionnaire_administrations where visit_id = :'vf' and instrument_code = 'EQ5D3L'),
  'la modalidad por entrevista registra la versión v1.0');
commit;

-- ── EVASAF, VERITAS-PRN y VERITAS-Pro ───────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
insert into public.coag_questionnaire_administrations (visit_id, instrument_code, responses)
  values (:'v0', 'EVASAF', '{"q1":5,"q2":4,"q3":3,"q4":2,"q5":1,"q6":5,"q7":4,"q8":3,"q9":2,"q10":1}');
select dermapex_test.expect(
  (select (scores ->> 'complete')::boolean and scores -> 'summary_score' = 'null'::jsonb
     from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'EVASAF'),
  'EVASAF: completo, sin puntuación resumen (no aprobada)');
insert into public.coag_questionnaire_administrations (visit_id, instrument_code, responses)
  values (:'v0', 'VERITAS_PRN', '{"q1":1,"q2":2,"q5":5,"q24":3}');
select dermapex_test.expect(
  (select (scores -> 'block_items_answered' ->> 'treatment')::int = 2 and (scores -> 'block_items_answered' ->> 'timing')::int = 1
      and (scores -> 'block_items_answered' ->> 'communicating')::int = 1 and scores -> 'scores' = 'null'::jsonb
     from public.coag_questionnaire_administrations where visit_id = :'v0' and instrument_code = 'VERITAS_PRN'),
  'VERITAS-PRN: recuento por bloque, sin puntuación (clave no aportada)');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, responses) values (%L, 'VERITAS_PRO', '{"q1": 1}')$$, :'v0'),
  'VERITAS-Pro no admite respuestas sin documento fuente');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, status) values (%L, 'VERITAS_PRO', 'not_applicable')$$, :'v0'),
  '«no aplicable» exige motivo');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, status, status_reason_code) values (%L, 'VERITAS_PRO', 'not_done', 'other')$$, :'v0'),
  'el motivo «otro» exige descripción');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, status, status_reason_code)
    values (%L, 'VERITAS_PRO', 'not_applicable', 'source_document_unavailable')$$, :'v0')) = 1,
  'VERITAS-Pro marcado como no aplicable con motivo');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set status = 'not_done', status_reason_code = 'patient_declined'
     where visit_id = %L and instrument_code = 'VERITAS_PRN'$$, :'v0'),
  '«no realizado» no conserva respuestas parciales de forma silenciosa');
commit;

-- ── Acceso por centro y separación de estudios ──────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_questionnaire_administrations') = 0, 'CI2 (otro centro) no ve cuestionarios de LAFE');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set responses = '{}' where visit_id = %L$$, :'v0')) = 0,
  'CI2 no modifica cuestionarios de LAFE');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code) values (%L, 'IEXPAC')$$, :'vc'),
  'CI2 no crea cuestionarios en visitas de otro centro');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_questionnaire_administrations') = 0, 'coordinación DERMAPEX no ve cuestionarios COAMO');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code) values (%L, 'EVASAF')$$, :'vf'),
  'coordinación DERMAPEX no escribe cuestionarios COAMO');
commit;
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.coag_questionnaire_administrations', 'anon no lee cuestionarios COAMO');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$delete from public.coag_questionnaire_administrations where visit_id = %L and instrument_code = 'EVASAF'$$, :'v0')) = 0,
  'una investigadora no borra cuestionarios');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_questionnaire_administrations') = 7, 'coordinación COAMO ve todos los cuestionarios');
select dermapex_test.expect(
  (select count(*) from public.coag_audit_log
    where table_name = 'coag_questionnaire_administrations' and patient_id = :'q_p' and center_id = :'lafe_id') >= 10,
  'altas y correcciones de cuestionarios auditadas con paciente y centro');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log
           where table_name = 'coag_questionnaire_administrations' and action = 'UPDATE'
             and old_data -> 'responses' ->> 'q1' = '5' and new_data -> 'responses' ->> 'q1' = '4'
             and new_data ->> 'last_correction_reason' = 'Error de transcripción del papel'),
  'la auditoría conserva el valor anterior, el nuevo y el motivo de la corrección');
select dermapex_test.expect(dermapex_test.affected(format(
  $$delete from public.coag_questionnaire_administrations where visit_id = %L and instrument_code = 'VERITAS_PRO'$$, :'v0')) = 1,
  'coordinación COAMO puede borrar un registro (queda auditado)');
commit;

select dermapex_test.expect(not exists (select 1 from public.audit_log where table_name like 'coag\_%'), 'nada de COAMO en la auditoría DERMAPEX');

\echo 'COAMO: todas las pruebas de cuestionarios superadas.'
