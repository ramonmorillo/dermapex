-- SOLO PARA PRUEBAS LOCALES. COAMO · VERITAS-PRN y VERITAS-Pro: clave de puntuación (migración 20261103120000).
-- Se ejecuta tras 70_*. Mismos ejemplos calculados a mano que tests/questionnaireScoring.test.ts del frontend COAMO.
-- Clave: 1 = máxima adherencia … 5 = mínima; invertidos (Siempre = 5): PRN 6,7,12,13,17,19,20,23;
-- Pro 6,7,11,13,14,16,17,18,19,20,23. Total = suma de los 24 ítems (24-120); sin total si falta algún ítem.

\set ON_ERROR_STOP on
\set QUIET on

select id as lafe_id from public.coag_centers where code = 'LAFE' \gset

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
insert into public.coag_patients (center_id, age_at_inclusion, sex, diagnosis) values (:'lafe_id', 40, 'male', 'HA');
commit;
select id as vp from public.coag_patients where center_id = :'lafe_id' order by center_seq desc limit 1 \gset
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
update public.coag_inclusions set inc_age_18 = true, inc_diagnosis = true, inc_written_consent = true,
  inc_no_limiting_condition = true, inc_hospital_pharmacy_followup = true,
  exc_unable_without_support = false, exc_unable_visits = false, exc_interfering_trial = false,
  consent_date = current_date - 400 where patient_id = :'vp';
update public.coag_patients set status = 'included' where id = :'vp';
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'vp', 'baseline', current_date - 390, 'in_person');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality) values (:'vp', 'final', current_date - 5, 'in_person');
commit;
select id as w0 from public.coag_visits where patient_id = :'vp' and visit_type = 'baseline' \gset
select id as wf from public.coag_visits where patient_id = :'vp' and visit_type = 'final' \gset

-- ── VERITAS-Pro: guardar, recuperar, completar, corregir ────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses)
    values (%L, 'VERITAS_PRO', 'self', '{"q11": 1, "q12": 1}')$$, :'w0')) = 1,
  'VERITAS-Pro: se guarda un borrador con respuestas (bloqueo anterior retirado)');
select dermapex_test.expect(
  (select instrument_version = 'VERITAS-Pro-ES-COAMO-2026-10-27' and scoring_version = 'coamo-q-2'
      and responses = '{"q11": 1, "q12": 1}'::jsonb
      and scores -> 'item_scores' = '{"q11": 5, "q12": 1}'::jsonb and scores -> 'total' = 'null'::jsonb
     from public.coag_questionnaire_administrations where visit_id = :'w0' and instrument_code = 'VERITAS_PRO'),
  'VERITAS-Pro: se recupera tal cual; q11 invertido (Siempre = 5), q12 directo; parcial sin total');
-- Todo «Siempre» (1): 13 directos × 1 + 11 invertidos × 5 = 68.
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations
       set responses = (select jsonb_object_agg('q' || g, 1) from generate_series(1, 24) g),
           status = 'completed', administration_date = current_date - 390, data_source = 'paper'
     where visit_id = %L and instrument_code = 'VERITAS_PRO'$$, :'w0')) = 1, 'VERITAS-Pro completado');
select dermapex_test.expect(
  (select (scores ->> 'total')::int = 68 and (scores ->> 'items_answered')::int = 24 and scores ->> 'scoring_status' = 'scored'
      and scores ->> 'direction' = 'lower_is_more_adherent' and scores -> 'subscale_scores' = 'null'::jsonb
     from public.coag_questionnaire_administrations where visit_id = :'w0' and instrument_code = 'VERITAS_PRO'),
  'VERITAS-Pro todo «Siempre» → total 68');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set responses = responses || '{"q1": 2}'
     where visit_id = %L and instrument_code = 'VERITAS_PRO'$$, :'w0'),
  'VERITAS-Pro completado: corregir sin motivo rechazado');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set responses = responses || '{"q1": 2}', correction_reason = 'Error de transcripción'
     where visit_id = %L and instrument_code = 'VERITAS_PRO'$$, :'w0')) = 1, 'VERITAS-Pro: corrección con motivo');
select dermapex_test.expect(
  (select (scores ->> 'total')::int = 69 and revision = 3 from public.coag_questionnaire_administrations
    where visit_id = :'w0' and instrument_code = 'VERITAS_PRO'),
  'la corrección recalcula el total (68 → 69) e incrementa la revisión');
-- VF: máxima adherencia (directos = 1; invertidos = 5) → 24.
insert into public.coag_questionnaire_administrations (visit_id, instrument_code, status, administration_mode, administration_date, responses)
  select :'wf', 'VERITAS_PRO', 'completed', 'self', current_date - 5,
         jsonb_object_agg('q' || g, case when g = any (array[6, 7, 11, 13, 14, 16, 17, 18, 19, 20, 23]) then 5 else 1 end)
    from generate_series(1, 24) g;
select dermapex_test.expect(
  (select (scores ->> 'total')::int = 24 from public.coag_questionnaire_administrations where visit_id = :'wf' and instrument_code = 'VERITAS_PRO'),
  'VERITAS-Pro máxima adherencia → 24');
commit;

-- ── VERITAS-PRN: ejemplos de la clave ───────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
-- Todo «Nunca» (5): 16 directos × 5 + 8 invertidos × 1 = 88.
insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses)
  select :'w0', 'VERITAS_PRN', 'self', jsonb_object_agg('q' || g, 5) from generate_series(1, 24) g;
select dermapex_test.expect(
  (select (scores ->> 'total')::int = 88 and (scores -> 'item_scores' ->> 'q6')::int = 1 and (scores -> 'item_scores' ->> 'q1')::int = 5
     from public.coag_questionnaire_administrations where visit_id = :'w0' and instrument_code = 'VERITAS_PRN'),
  'VERITAS-PRN todo «Nunca» → 88 (q6 invertido = 1 punto)');
-- Mínima adherencia (directos = 5; invertidos = 1) → 120.
update public.coag_questionnaire_administrations
   set responses = (select jsonb_object_agg('q' || g, case when g = any (array[6, 7, 12, 13, 17, 19, 20, 23]) then 1 else 5 end) from generate_series(1, 24) g)
 where visit_id = :'w0' and instrument_code = 'VERITAS_PRN';
select dermapex_test.expect(
  (select (scores ->> 'total')::int = 120 from public.coag_questionnaire_administrations where visit_id = :'w0' and instrument_code = 'VERITAS_PRN'),
  'VERITAS-PRN mínima adherencia → 120');
update public.coag_questionnaire_administrations set responses = responses - 'q24'
 where visit_id = :'w0' and instrument_code = 'VERITAS_PRN';
select dermapex_test.expect(
  (select scores -> 'total' = 'null'::jsonb and (scores ->> 'items_answered')::int = 23 from public.coag_questionnaire_administrations
    where visit_id = :'w0' and instrument_code = 'VERITAS_PRN'),
  'VERITAS-PRN con 23/24: sin total (no se imputa)');
commit;

-- ── Recalcular registros con derivados antiguos (paso final de la migración) ─
-- Simula un registro guardado con la versión coamo-q-1 (sin total) y aplica la misma sentencia de la migración.
alter table public.coag_questionnaire_administrations disable trigger trg_coag_qadm_rules;
update public.coag_questionnaire_administrations
   set scores = '{"items_expected": 24, "items_answered": 24, "complete": true, "scores": null, "scoring_status": "scoring_key_not_provided"}',
       scoring_version = 'coamo-q-1',
       responses = (select jsonb_object_agg('q' || g, 3) from generate_series(1, 24) g)
 where visit_id = :'w0' and instrument_code = 'VERITAS_PRN';
alter table public.coag_questionnaire_administrations enable trigger trg_coag_qadm_rules;
select revision as rev_before from public.coag_questionnaire_administrations where visit_id = :'w0' and instrument_code = 'VERITAS_PRN' \gset
update public.coag_questionnaire_administrations set scores = scores where instrument_code in ('VERITAS_PRN', 'VERITAS_PRO');
select dermapex_test.expect(
  (select (scores ->> 'total')::int = 72 and scoring_version = 'coamo-q-2' and revision = :rev_before + 1
      and responses = (select jsonb_object_agg('q' || g, 3) from generate_series(1, 24) g)
     from public.coag_questionnaire_administrations where visit_id = :'w0' and instrument_code = 'VERITAS_PRN'),
  'recalcular: total 72 (todo «A veces»), coamo-q-2, revisión +1, respuestas intactas');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log where table_name = 'coag_questionnaire_administrations' and action = 'UPDATE'
             and old_data ->> 'scoring_version' = 'coamo-q-1' and new_data ->> 'scoring_version' = 'coamo-q-2'
             and old_data -> 'responses' = new_data -> 'responses'),
  'el recálculo queda auditado (valor anterior y nuevo) sin cambiar respuestas');
select dermapex_test.expect(
  (select bool_and(scoring_version = 'coamo-q-1') from public.coag_questionnaire_administrations where instrument_code in ('IEXPAC', 'EQ5D3L', 'EVASAF')),
  'IEXPAC, EQ-5D-3L y EVASAF conservan su versión de puntuación');

-- ── Aislamiento ─────────────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set responses = '{}' where visit_id = %L$$, :'w0')) = 0,
  'otro centro no modifica VERITAS de LAFE');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_questionnaire_administrations') = 0, 'DERMAPEX no ve VERITAS de COAMO');
commit;

\echo 'COAMO: todas las pruebas de puntuación VERITAS superadas.'
