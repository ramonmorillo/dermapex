-- SOLO PARA PRUEBAS LOCALES. COAMO · estratificación CMO (migración 20261027120000).
-- Se ejecuta tras 70_* (CI1 = investigadora LAFE, CI2 = investigador VHEBRON, CC = coordinación
-- COAMO, C = coordinación DERMAPEX). Los ejemplos coinciden con tests/stratification.test.ts del
-- frontend COAMO, incluido el caso clínico 1 del modelo SEFH v2.0 (31 puntos → Prioridad 1).

\set ON_ERROR_STOP on
\set QUIET on

select id as lafe_id from public.coag_centers where code = 'LAFE' \gset

-- ── Especificación: 23 variables (26 preguntas) y máximos de las tablas 1-4 ─
select dermapex_test.expect((select count(distinct variable) from coag_private.strat_spec()) = 26, '26 preguntas en la especificación');
select dermapex_test.expect(
  (select (r -> 'by_dimension' -> 'demographic' ->> 'max')::int = 3 and (r -> 'by_dimension' -> 'clinical' ->> 'max')::int = 25
      and (r -> 'by_dimension' -> 'treatment' ->> 'max')::int = 15 and (r -> 'by_dimension' -> 'social' ->> 'max')::int = 16
      and (r ->> 'score_max')::int = 59 and (r ->> 'status') = 'indeterminate' and r -> 'score' = 'null'::jsonb
      and jsonb_array_length(r -> 'missing') = 25
     from coag_private.stratification_result('HA', '{}') r),
  'máximos 3/25/15/16 (59); sin respuestas: indeterminado y 25 preguntas pendientes');
select dermapex_test.expect(
  (select (r -> 'by_dimension' -> 'clinical' ->> 'max')::int = 25 and not (r -> 'missing') ? 'hemophilia_severity' and (r -> 'missing') ? 'vwd_type'
     from coag_private.stratification_result('EVW', '{}') r),
  'EVW: tipo de EVW en lugar de gravedad de hemofilia; mismo máximo clínico');
select dermapex_test.expect(
  array[coag_private.strat_priority(19), coag_private.strat_priority(20), coag_private.strat_priority(27), coag_private.strat_priority(28)] = array[3, 2, 2, 1]::smallint[],
  'puntos de corte inclusivos 20 y 28');

-- ── Paciente del caso clínico 1 (62 años, hemofilia A) con visitas ──────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
insert into public.coag_patients (center_id, age_at_inclusion, sex, diagnosis) values (:'lafe_id', 62, 'male', 'HA');
commit;
select id as s_p from public.coag_patients where center_id = :'lafe_id' order by center_seq desc limit 1 \gset
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
update public.coag_inclusions set inc_age_18 = true, inc_diagnosis = true, inc_written_consent = true,
  inc_no_limiting_condition = true, inc_hospital_pharmacy_followup = true,
  exc_unable_without_support = false, exc_unable_visits = false, exc_interfering_trial = false,
  consent_date = current_date - 200 where patient_id = :'s_p';
update public.coag_patients set status = 'included' where id = :'s_p';
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'s_p', 'baseline', current_date - 190, 'in_person');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'s_p', 'followup', current_date - 10, 'phone');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality, status) values (:'s_p', 'contact', current_date - 5, 'phone', 'cancelled');
commit;
select id as s_v0 from public.coag_visits where patient_id = :'s_p' and visit_type = 'baseline' \gset
select id as s_fu from public.coag_visits where patient_id = :'s_p' and visit_type = 'followup' \gset
select id as s_cx from public.coag_visits where patient_id = :'s_p' and visit_type = 'contact' \gset

\set case1 '{"age":"gt50","obesity":"no","inhibitors":"no","pain":"mild_moderate","joint_status":"yes","bleeding_management":"outpatient","hemophilia_severity":"severe","spontaneous_bleeds_gt2":"yes","comorbidity":"yes","degenerative_joint":"no","psychological":"yes","advanced_therapy":"no","route":"sc_only","dose_change":"yes","extra_doses":"yes","home_dispensing":"yes","prophylaxis":"yes","non_adherence":"no","socioeconomic":"no","intense_activity":"no","cv_risk":"yes","access_difficulty":"no","limited_knowledge":"no","transition":"no","low_qol":"no"}'

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_stratifications (visit_id, answers, suggestions, clinical_source_visit_id)
    values (%L, '{"age":"gt50","prophylaxis":"yes"}', '{"age":{"value":"gt50","from":"Edad en la inclusión: 62 años"}}', %L)$$, :'s_v0', :'s_v0')) = 1,
  'CI1 guarda un borrador de estratificación en V0 con propuesta y origen de los datos');
select dermapex_test.expect(
  (select status = 'in_progress' and revision = 1 and model_priority is null and final_priority is null and score is null
      and score_min = 5 and model_version = 'CMO-COAG-SEFH-v2.0' and created_by = 'c0a00000-5000-4000-8000-000000000001'
     from public.coag_stratifications where visit_id = :'s_v0'),
  'borrador: intervalo calculado, sin nivel (faltan datos), versión y autoría selladas por la BD');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_stratifications (visit_id) values (%L)$$, :'s_v0'), 'una sola estratificación por visita');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_stratifications (visit_id) values (%L)$$, :'s_cx'), 'no se estratifica en una visita anulada');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set answers = '{"vwd_type":"1"}' where visit_id = %L$$, :'s_v0'), 'pregunta que no aplica al diagnóstico rechazada');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set answers = '{"pain":"severe"}' where visit_id = %L$$, :'s_v0'), 'opción inexistente rechazada');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set answers = '{"age":2}' where visit_id = %L$$, :'s_v0'), 'valores no textuales rechazados');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set suggestions = '{"age":{"value":"gt50"}}' where visit_id = %L$$, :'s_v0'), 'propuesta sin procedencia rechazada');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set clinical_source_visit_id = %L where visit_id = %L$$, :'s_fu', :'s_v0'), 'el origen de los datos clínicos debe ser una V0/VF no posterior');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set model_priority = 3 where visit_id = %L$$, :'s_v0'), 'el cliente no escribe la prioridad del modelo');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set status = 'completed' where visit_id = %L$$, :'s_v0'), 'no se confirma con el nivel sin determinar');
-- Caso clínico 1 de M: 2 + 18 + 9 + 2 = 31 → Prioridad 1.
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_stratifications set answers = %L, status = 'completed' where visit_id = %L$$, :'case1', :'s_v0')) = 1,
  'caso clínico 1 confirmado');
select dermapex_test.expect(
  (select restratification_reason is null from public.coag_stratifications where visit_id = :'s_v0'),
  'la estratificación basal no lleva motivo de reestratificación');
select dermapex_test.expect(
  (select score = 31 and model_priority = 1 and final_priority = 1 and result ->> 'basis' = 'score'
      and (result -> 'by_dimension' -> 'demographic' ->> 'points')::int = 2 and (result -> 'by_dimension' -> 'clinical' ->> 'points')::int = 18
      and (result -> 'by_dimension' -> 'treatment' ->> 'points')::int = 9 and (result -> 'by_dimension' -> 'social' ->> 'points')::int = 2
      and completed_at is not null and revision = 2
     from public.coag_stratifications where visit_id = :'s_v0'),
  'caso clínico 1: 2 + 18 + 9 + 2 = 31 → Prioridad 1 (igual que M y que el frontend)');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set answers = answers || '{"cv_risk":"no"}' where visit_id = %L$$, :'s_v0'),
  'una estratificación confirmada no se modifica sin motivo de corrección');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_stratifications set answers = answers || '{"spontaneous_bleeds_gt2":"no","psychological":"no"}', correction_reason = 'Revisado con la HCE'
     where visit_id = %L and revision = 2$$, :'s_v0')) = 1, 'corrección con motivo');
select dermapex_test.expect(
  (select score = 24 and model_priority = 2 and final_priority = 2 and revision = 3 and last_correction_reason = 'Revisado con la HCE' and correction_reason is null
     from public.coag_stratifications where visit_id = :'s_v0'),
  'la corrección recalcula (24 → Prioridad 2) y conserva motivo y revisión');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set raised_priority = 1, correction_reason = 'Elevación' where visit_id = %L$$, :'s_v0'),
  'elevar exige motivo de la elevación');
select dermapex_test.expect_fail(format(
  $$update public.coag_stratifications set raised_priority = 2, raised_reason = 'Mismo nivel', correction_reason = 'Elevación' where visit_id = %L$$, :'s_v0'),
  'no se «eleva» al mismo nivel ni se baja');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_stratifications set raised_priority = 1, raised_reason = 'Inicio de emicizumab', correction_reason = 'Elevación por criterio profesional'
     where visit_id = %L$$, :'s_v0')) = 1, 'elevación a Prioridad 1 con motivo');
select dermapex_test.expect(
  (select model_priority = 2 and final_priority = 1 from public.coag_stratifications where visit_id = :'s_v0'),
  'se conservan el nivel del modelo (2) y el asignado (1)');
-- Seguimiento: cualquier visita; terapia avanzada → P1 con puntuación baja.
select dermapex_test.expect_fail(format(
  $$insert into public.coag_stratifications (visit_id, answers, status) values (%L, '{"age":"gt50","advanced_therapy":"yes"}', 'completed')$$, :'s_fu'),
  'una reestratificación no se confirma sin motivo (spec §5.5)');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_stratifications (visit_id, answers, status, clinical_source_visit_id, restratification_reason)
    values (%L, '{"age":"gt50","advanced_therapy":"yes"}', 'completed', %L, 'Inicio de terapia génica')$$, :'s_fu', :'s_v0')) = 1,
  'reestratificación en una visita de seguimiento, con motivo y datos clínicos de V0');
select dermapex_test.expect(
  (select model_priority = 1 and result ->> 'basis' = 'advanced_therapy' and score_min = 2 and score is null
     from public.coag_stratifications where visit_id = :'s_fu'),
  'terapia avanzada → Prioridad 1 con independencia de la puntuación');
commit;

-- ── Datos ausentes, menores y calidad de vida (mismos ejemplos que el frontend) ──
select dermapex_test.expect(
  (select r ->> 'status' = 'determined' and (r ->> 'model_priority')::int = 3 and r -> 'score' = 'null'::jsonb
      and (r ->> 'score_min')::int = 1 and (r ->> 'score_max')::int = 5
     from coag_private.stratification_result('HA', '{"age":"18_50","obesity":"no","inhibitors":"no","pain":"none","joint_status":"no","bleeding_management":"none","hemophilia_severity":"mild","spontaneous_bleeds_gt2":"no","comorbidity":"no","degenerative_joint":"no","psychological":"no","advanced_therapy":"no","route":"sc_only","dose_change":"no","extra_doses":"no","home_dispensing":"no","prophylaxis":"no","non_adherence":"no","socioeconomic":"no","intense_activity":"no","cv_risk":"no","access_difficulty":"no","limited_knowledge":"no","low_qol":"no"}') r),
  'lo que falta no puede cambiar el nivel: Prioridad 3 con intervalo 1-5');
select dermapex_test.expect(
  (select r ->> 'status' = 'indeterminate' from coag_private.stratification_result('HA', (:'case1')::jsonb - 'advanced_therapy') r),
  'sin la pregunta de terapia avanzada no se asigna nivel');
select dermapex_test.expect(
  (select r ->> 'status' = 'pediatric_model' and r -> 'model_priority' = 'null'::jsonb
     from coag_private.stratification_result('HA', (:'case1')::jsonb || '{"age":"lt18"}') r),
  'menor de 18 años → modelo pediátrico');
select dermapex_test.expect(
  (select (r ->> 'score')::int = 20 and (r ->> 'model_priority')::int = 2 and (r ->> 'qol_dependent')::boolean
     from coag_private.stratification_result('HA', '{"age":"18_50","obesity":"yes","inhibitors":"no","pain":"none","joint_status":"no","bleeding_management":"none","hemophilia_severity":"severe","spontaneous_bleeds_gt2":"no","comorbidity":"no","degenerative_joint":"no","psychological":"no","advanced_therapy":"no","route":"iv","dose_change":"no","extra_doses":"no","home_dispensing":"no","prophylaxis":"yes","non_adherence":"yes","socioeconomic":"no","intense_activity":"no","cv_risk":"yes","access_difficulty":"no","limited_knowledge":"yes","transition":"no","low_qol":"yes"}') r),
  'se marca cuando el nivel depende del punto de calidad de vida (fuera del pretest)');

-- ── Acceso por centro y separación de estudios ──────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_stratifications') = 0, 'CI2 (otro centro) no ve estratificaciones de LAFE');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_stratifications set answers = '{}' where visit_id = %L$$, :'s_v0')) = 0, 'CI2 no modifica estratificaciones de LAFE');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_stratifications') = 0, 'coordinación DERMAPEX no ve estratificaciones COAMO');
commit;
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.coag_stratifications', 'anon no lee estratificaciones COAMO');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$delete from public.coag_stratifications where visit_id = %L$$, :'s_fu')) = 0, 'una investigadora no borra estratificaciones');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_stratifications') = 2, 'coordinación COAMO ve todas las estratificaciones');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log
           where table_name = 'coag_stratifications' and action = 'UPDATE' and patient_id = :'s_p' and center_id = :'lafe_id'
             and old_data ->> 'final_priority' = '2' and new_data ->> 'final_priority' = '1'
             and new_data ->> 'raised_reason' = 'Inicio de emicizumab'),
  'la auditoría conserva el nivel anterior, el nuevo y el motivo de la elevación, con paciente y centro');
commit;

select dermapex_test.expect(not exists (select 1 from public.audit_log where table_name like 'coag\_%'), 'nada de COAMO en la auditoría DERMAPEX');

\echo 'COAMO: todas las pruebas de estratificación superadas.'
