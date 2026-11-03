-- SOLO PARA PRUEBAS LOCALES. COAMO · EVASAF: apartado «Comentarios» (migración 20261103140000).
-- Se ejecuta tras 72_* (CI1 = LAFE, CI2 = VHEBRON, CC = coordinación COAMO, C = coordinación DERMAPEX).

\set ON_ERROR_STOP on
\set QUIET on

select id as lafe_id from public.coag_centers where code = 'LAFE' \gset
select p.id as cp from public.coag_patients p where p.center_id = :'lafe_id' and p.status = 'included' order by p.center_seq desc limit 1 \gset
select id as c0 from public.coag_visits where patient_id = :'cp' and visit_type = 'baseline' and status <> 'cancelled' \gset
select id as cf from public.coag_visits where patient_id = :'cp' and visit_type = 'final' and status <> 'cancelled' \gset

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, administration_mode, responses, comments)
    values (%L, 'EVASAF', 'self', '{"q1": 5}', '  Muy contento con la consulta.  ')$$, :'c0')) = 1,
  'EVASAF: se guarda un borrador con comentario');
select dermapex_test.expect(
  (select comments = 'Muy contento con la consulta.' and scores -> 'summary_score' = 'null'::jsonb and scoring_version = 'coamo-q-1'
     from public.coag_questionnaire_administrations where visit_id = :'c0' and instrument_code = 'EVASAF'),
  'se recupera el comentario (sin espacios extremos); la puntuación no cambia (sin total, coamo-q-1)');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set comments = '   ' where visit_id = %L and instrument_code = 'EVASAF'$$, :'c0')) = 1,
  'un comentario en blanco se guarda como NULL');
select dermapex_test.expect(
  (select comments is null from public.coag_questionnaire_administrations where visit_id = :'c0' and instrument_code = 'EVASAF'),
  'comentario vacío = NULL (no se guarda texto vacío)');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set comments = %L where visit_id = %L and instrument_code = 'EVASAF'$$, repeat('x', 2001), :'c0'),
  'más de 2000 caracteres rechazado');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, responses, comments) values (%L, 'IEXPAC', '{"q1": 1}', 'texto')$$, :'cf'),
  'solo EVASAF admite comentarios');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_questionnaire_administrations (visit_id, instrument_code, status, status_reason_code, comments)
    values (%L, 'EVASAF', 'not_done', 'patient_declined', 'texto')$$, :'cf'),
  '«no realizado» no conserva comentarios');
-- Completar y corregir el comentario.
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations
       set comments = 'Primer comentario', status = 'completed', administration_date = current_date - 390
     where visit_id = %L and instrument_code = 'EVASAF'$$, :'c0')) = 1, 'EVASAF completado con comentario');
select dermapex_test.expect_fail(format(
  $$update public.coag_questionnaire_administrations set comments = 'Cambiado sin motivo' where visit_id = %L and instrument_code = 'EVASAF'$$, :'c0'),
  'cambiar el comentario de un completado sin motivo rechazado');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_questionnaire_administrations set comments = 'Comentario corregido', correction_reason = 'Transcripción del papel'
     where visit_id = %L and instrument_code = 'EVASAF'$$, :'c0')) = 1, 'corrección del comentario con motivo');
commit;

-- Aislamiento y auditoría.
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect(
  not exists (select 1 from public.coag_questionnaire_administrations where comments is not null), 'otro centro no ve comentarios de LAFE');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_questionnaire_administrations') = 0, 'DERMAPEX no ve EVASAF de COAMO');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log where table_name = 'coag_questionnaire_administrations' and action = 'UPDATE'
           and old_data ->> 'comments' = 'Primer comentario' and new_data ->> 'comments' = 'Comentario corregido'
           and new_data ->> 'last_correction_reason' = 'Transcripción del papel'),
  'la auditoría conserva el comentario anterior, el nuevo y el motivo');
commit;

\echo 'COAMO: todas las pruebas de comentarios EVASAF superadas.'
