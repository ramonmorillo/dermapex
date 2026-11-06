-- SOLO PARA PRUEBAS LOCALES. DERMAPEX · POEM y NRS de prurito (migración 20261106120000) e
-- intervenciones con formulario simplificado. Reutiliza usuarios y centros de 10_* y 20_*:
-- A = investigador de CM (cohorte CMO, 20_*) · B = investigador de CS (estándar, 20_*) · C = coordinación (10_*).

\set ON_ERROR_STOP on
\set QUIET on

begin;
select dermapex_test.as_user('aaaaaaaa-1000-4000-8000-000000000001');
insert into public.patients (id, center_id) values ('a0000000-9500-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001');
insert into public.visits (id, patient_id, visit_type, scheduled_date, visit_status) values
  ('a1000000-9500-4000-8000-000000000000', 'a0000000-9500-4000-8000-000000000001', 'baseline', '2026-01-10', 'completed'),
  ('a1000000-9500-4000-8000-000000000006', 'a0000000-9500-4000-8000-000000000001', 'month_6', '2026-07-10', 'scheduled'),
  ('a1000000-9500-4000-8000-000000000012', 'a0000000-9500-4000-8000-000000000001', 'month_12', '2027-01-10', 'scheduled');

-- ── Catálogo ──
select dermapex_test.expect((select count(*) from public.questionnaire_measurement_map where questionnaire_code in ('POEM', 'PRURITUS_NRS')) = 2, 'POEM y PRURITUS_NRS dados de alta en el catálogo de instrumentos');

-- ── POEM: guardado, extremos y rechazo de valores inválidos ──
insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses)
select 'a1000000-9500-4000-8000-000000000000', measurement_id, 'POEM', '{"_version":"POEM-ES-IP-2026-11","q1":0,"q2":0,"q3":0,"q4":0,"q5":0,"q6":0,"q7":0}'
  from public.questionnaire_measurement_map where questionnaire_code = 'POEM';
select dermapex_test.expect((select responses ->> 'q1' from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000000' and questionnaire_code = 'POEM') = '0', 'POEM basal guardado con ítems a 0 (0 ≠ ausente)');

-- Guardado repetido (upsert de la aplicación): actualiza, no duplica.
insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses)
select 'a1000000-9500-4000-8000-000000000000', measurement_id, 'POEM', '{"_version":"POEM-ES-IP-2026-11","q1":4,"q2":4,"q3":4,"q4":4,"q5":4,"q6":4,"q7":4}'
  from public.questionnaire_measurement_map where questionnaire_code = 'POEM'
on conflict (visit_id, questionnaire_code) do update set responses = excluded.responses;
select dermapex_test.expect((select count(*) from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000000' and questionnaire_code = 'POEM') = 1, 'guardado repetido de POEM: un solo registro por visita');
select dermapex_test.expect((select responses ->> 'q7' from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000000' and questionnaire_code = 'POEM') = '4', 'guardado repetido actualiza las respuestas');

-- Borrador incompleto admitido (los ausentes no tienen clave).
insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses)
select 'a1000000-9500-4000-8000-000000000012', measurement_id, 'POEM', '{"_version":"POEM-ES-IP-2026-11","q1":2,"q2":1}'
  from public.questionnaire_measurement_map where questionnaire_code = 'POEM';
select dermapex_test.expect((select not (responses ? 'q3') from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'), 'POEM incompleto guardado como borrador; ítem ausente sin clave');
select dermapex_test.expect((select responses ->> 'q1' from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000000' and questionnaire_code = 'POEM') = '4', 'POEM basal y de mes 12 independientes');

select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_version":"POEM-ES-IP-2026-11","q1":5}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'$$, 'POEM: ítem 5 rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_version":"POEM-ES-IP-2026-11","q1":-1}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'$$, 'POEM: ítem negativo rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_version":"POEM-ES-IP-2026-11","q1":2.5}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'$$, 'POEM: ítem no entero rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_version":"POEM-ES-IP-2026-11","q1":"3"}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'$$, 'POEM: ítem en texto rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_version":"POEM-ES-IP-2026-11","q8":1}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'$$, 'POEM: ítem inexistente rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"q1":1}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'POEM'$$, 'POEM: sin versión del instrumento rechazado');
select dermapex_test.expect_fail($$insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses) select 'a1000000-9500-4000-8000-000000000006', measurement_id, 'POEM', '{"_version":"POEM-ES-IP-2026-11"}' from public.questionnaire_measurement_map where questionnaire_code = 'POEM'$$, 'POEM no se registra en visitas intermedias (mes 6)');

-- ── NRS de prurito ──
insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses)
select 'a1000000-9500-4000-8000-000000000000', measurement_id, 'PRURITUS_NRS', '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":0}'
  from public.questionnaire_measurement_map where questionnaire_code = 'PRURITUS_NRS';
insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses)
select 'a1000000-9500-4000-8000-000000000012', measurement_id, 'PRURITUS_NRS', '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h"}'
  from public.questionnaire_measurement_map where questionnaire_code = 'PRURITUS_NRS';
select dermapex_test.expect((select (responses -> 'score')::int from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000000' and questionnaire_code = 'PRURITUS_NRS') = 0, 'NRS = 0 guardado como 0');
select dermapex_test.expect((select not (responses ? 'score') from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS'), 'NRS ausente: registro sin puntuación (no se convierte en 0)');
update public.questionnaire_responses set responses = '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":10}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS';
select dermapex_test.expect((select (responses -> 'score')::int from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS') = 10, 'NRS = 10 admitido');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":11}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS'$$, 'NRS 11 rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":-1}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS'$$, 'NRS negativo rechazado');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":4.5}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS'$$, 'NRS no entera rechazada');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_variant":"peak_pruritus_nrs","_recall_period":"24h","score":4}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS'$$, 'NRS con otra variante rechazada (no se mezclan variantes)');
select dermapex_test.expect_fail($$update public.questionnaire_responses set responses = '{"_variant":"worst_itch_nrs_24h","_recall_period":"7d","score":4}' where visit_id = 'a1000000-9500-4000-8000-000000000012' and questionnaire_code = 'PRURITUS_NRS'$$, 'NRS con otro periodo de recuerdo rechazada');
select dermapex_test.expect_fail($$insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses) select 'a1000000-9500-4000-8000-000000000006', measurement_id, 'PRURITUS_NRS', '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":3}' from public.questionnaire_measurement_map where questionnaire_code = 'PRURITUS_NRS'$$, 'NRS no se registra en visitas intermedias');

-- ── El resto de cuestionarios no cambia (el trigger nuevo no actúa sobre ellos) ──
insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses)
select 'a1000000-9500-4000-8000-000000000006', measurement_id, 'IEXPAC', '{"q1":5,"q2":"texto heredado"}'
  from public.questionnaire_measurement_map where questionnaire_code = 'IEXPAC';
select dermapex_test.expect((select count(*) from public.questionnaire_responses where visit_id = 'a1000000-9500-4000-8000-000000000006' and questionnaire_code = 'IEXPAC') = 1, 'IEXPAC conserva su comportamiento previo (sin validación nueva)');

-- ── Intervenciones: formulario simplificado y conservación de históricos ──
insert into public.interventions (id, visit_id, intervention_type, intervention_domain, catalog_item_id, priority_level, delivered, linked_to_cmo_level, outcome)
select 'a2000000-9500-4000-8000-000000000001', 'a1000000-9500-4000-8000-000000000000', 'x', 'Motivación', id, 'high', false, 1, 'histórico'
  from public.intervention_catalog where code = 'edu-promocion-adherencia';
-- Edición desde el formulario nuevo: solo envía tipo, pilar, catálogo, resultado y notas.
update public.interventions set intervention_type = 'x', intervention_domain = 'Motivación', outcome = 'editado', notes = 'nota'
 where id = 'a2000000-9500-4000-8000-000000000001';
select dermapex_test.expect((select priority_level = 'high' and delivered = false and linked_to_cmo_level = 1 and outcome = 'editado' from public.interventions where id = 'a2000000-9500-4000-8000-000000000001'), 'editar no altera prioridad, entregada ni nivel vinculado históricos');
select dermapex_test.expect((select catalog_code = 'edu-promocion-adherencia' from public.interventions where id = 'a2000000-9500-4000-8000-000000000001'), 'catálogo e identificador de la intervención intactos');
-- Alta nueva sin prioridad ni nivel vinculado.
insert into public.interventions (id, visit_id, intervention_type, intervention_domain, catalog_item_id, delivered, priority_level, linked_to_cmo_level)
select 'a2000000-9500-4000-8000-000000000002', 'a1000000-9500-4000-8000-000000000000', 'x', 'Capacidad', id, true, null, null
  from public.intervention_catalog where code = 'edu-informacion-enfermedad';
select dermapex_test.expect((select delivered and priority_level is null and linked_to_cmo_level is null and intervention_domain = 'Capacidad' from public.interventions where id = 'a2000000-9500-4000-8000-000000000002'), 'alta sin campos retirados: realizada, sin prioridad ni nivel; pilar sellado del catálogo');
-- Texto libre: el pilar lo elige el profesional.
insert into public.interventions (visit_id, intervention_type, intervention_domain, delivered) values ('a1000000-9500-4000-8000-000000000000', 'Llamada de seguimiento', 'Oportunidad', true);
select dermapex_test.expect((select count(*) from public.interventions where visit_id = 'a1000000-9500-4000-8000-000000000000') = 3, 'intervenciones registradas en la visita');
commit;

-- ── RLS: aislamiento por centro ──
begin;
select dermapex_test.as_user('bbbbbbbb-1000-4000-8000-000000000001');
select dermapex_test.expect((select count(*) from public.questionnaire_responses where visit_id::text like 'a1000000-9500-%') = 0, 'B (otro centro) no ve POEM/NRS de C1');
select dermapex_test.expect(dermapex_test.affected($$update public.questionnaire_responses set responses = '{"_variant":"worst_itch_nrs_24h","_recall_period":"24h","score":9}' where visit_id = 'a1000000-9500-4000-8000-000000000000' and questionnaire_code = 'PRURITUS_NRS'$$) = 0, 'B no puede modificar la NRS de C1');
select dermapex_test.expect_fail($$insert into public.questionnaire_responses (visit_id, measurement_id, questionnaire_code, responses) select 'a1000000-9500-4000-8000-000000000012', measurement_id, 'POEM', '{"_version":"POEM-ES-IP-2026-11"}' from public.questionnaire_measurement_map where questionnaire_code = 'POEM' on conflict do nothing$$, 'B no puede registrar POEM en una visita de C1');
select dermapex_test.expect((select count(*) from public.interventions where visit_id::text like 'a1000000-9500-%') = 0, 'B no ve las intervenciones de C1');
rollback;

begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect((select count(*) from public.questionnaire_responses where visit_id::text like 'a1000000-9500-%' and questionnaire_code in ('POEM', 'PRURITUS_NRS')) = 4, 'coordinación ve los POEM/NRS de C1');
rollback;

begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.questionnaire_responses', 'anon no lee cuestionarios');
rollback;

-- Limpieza (como administrador de BD) para no interferir con baterías posteriores.
reset role;
delete from public.questionnaire_responses where visit_id::text like 'a1000000-9500-%';
delete from public.interventions where visit_id::text like 'a1000000-9500-%';
delete from public.visits where patient_id = 'a0000000-9500-4000-8000-000000000001';
delete from public.patients where id = 'a0000000-9500-4000-8000-000000000001';

\echo 'DERMAPEX: POEM, NRS de prurito e intervenciones simplificadas superadas.'
