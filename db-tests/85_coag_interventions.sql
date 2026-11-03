-- SOLO PARA PRUEBAS LOCALES. COAMO · actuaciones de AF (migración 20261103150000).
-- Se ejecuta tras 80_* (usa una visita con estratificación completada de esa batería y la de 71_* sin estratificar).

\set ON_ERROR_STOP on
\set QUIET on

select dermapex_test.expect((select count(*) from public.coag_intervention_catalog) = 24, 'catálogo: 24 actuaciones (Tablas 5 y 6)');
select dermapex_test.expect((select count(*) from public.coag_intervention_catalog where 3 = any (applies_to_priorities)) = 18, 'Prioridad 3: 18 actuaciones (Tabla 5)');
select dermapex_test.expect((select count(*) from public.coag_intervention_catalog where 2 = any (applies_to_priorities)) = 24, 'Prioridad 2: 24 actuaciones (Tabla 6, acumulativa)');

-- Visita con estratificación completada (de 80_*) y su prioridad vigente.
select v.id as iv, s.final_priority as ip, v.patient_id as ipat
  from public.coag_stratifications s join public.coag_visits v on v.id = s.visit_id
 where s.status = 'completed' and s.final_priority is not null and v.status <> 'cancelled'
 order by v.visit_date desc limit 1 \gset
-- Visita basal sin ninguna estratificación en el paciente (paciente de 71_*).
select v.id as nv from public.coag_visits v
 where v.visit_type = 'baseline' and v.status <> 'cancelled'
   and not exists (select 1 from public.coag_visits v2 join public.coag_stratifications s on s.visit_id = v2.id where v2.patient_id = v.patient_id)
 limit 1 \gset

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_intervention_catalog') = 24, 'una investigadora COAMO lee el catálogo');
select dermapex_test.expect_fail($$update public.coag_intervention_catalog set action_text = 'x' where code = 'SFT-01'$$, 'el catálogo no se modifica desde la app');
-- Realizada, de catálogo.
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status, performed_date)
    values (%L, 'SFT-06', 'care_coordination', 'performed', current_date - 1)$$, :'iv')) = 1,
  'registra como realizada una actuación de catálogo');
select dermapex_test.expect(
  (select domain = 'pharmacotherapeutic_followup' and priority_context = :ip
      and recommended_for_priority = (:ip = any ('{1,2}'::smallint[])) and revision = 1
      and created_by = 'c0a00000-5000-4000-8000-000000000001'
     from public.coag_interventions where visit_id = :'iv' and catalog_code = 'SFT-06'),
  'la BD fija ámbito del catálogo, prioridad vigente, si estaba recomendada y autoría');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status, performed_date) values (%L, 'SFT-06', 'pharmacotherapeutic_followup', 'performed', current_date)$$, :'iv'),
  'la misma actuación de catálogo no se duplica en una visita');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status) values (%L, 'EDU-01', 'patient_education', 'performed')$$, :'iv'),
  'realizada exige fecha');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status, performed_date) values (%L, 'EDU-01', 'patient_education', 'performed', current_date + 1)$$, :'iv'),
  'fecha de realización futura rechazada');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status) values (%L, 'NO-EXISTE', 'patient_education', 'planned')$$, :'iv'),
  'código de catálogo inexistente rechazado');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, custom_text, domain, status) values (%L, 'EDU-01', 'texto', 'patient_education', 'planned')$$, :'iv'),
  'catálogo y texto propio a la vez rechazados');
-- Prevista → realizada, con seguimiento.
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status, performed_date) values (%L, 'EDU-03', 'patient_education', 'planned', current_date)$$, :'iv')) = 1,
  'registra una actuación prevista');
select dermapex_test.expect(
  (select status = 'planned' and performed_date is null from public.coag_interventions where visit_id = :'iv' and catalog_code = 'EDU-03'),
  'prevista: sin fecha de realización (la BD la anula)');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_interventions set status = 'performed', performed_date = current_date, followup_note = '  Refuerzo de autoinfusión.  '
     where visit_id = %L and catalog_code = 'EDU-03' and revision = 1$$, :'iv')) = 1, 'prevista → realizada con nota de seguimiento');
select dermapex_test.expect(
  (select revision = 2 and followup_note = 'Refuerzo de autoinfusión.' and priority_context = :ip
     from public.coag_interventions where visit_id = :'iv' and catalog_code = 'EDU-03'),
  'revisión 2; nota sin espacios extremos; prioridad de contexto conservada');
select dermapex_test.expect_fail(format(
  $$update public.coag_interventions set priority_context = 3 where visit_id = %L and catalog_code = 'EDU-03'$$, :'iv'),
  'el cliente no escribe la prioridad de contexto');
-- Anular y volver a registrar.
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_interventions set status = 'discarded' where visit_id = %L and catalog_code = 'SFT-06'$$, :'iv')) = 1, 'anula un registro erróneo');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status, performed_date) values (%L, 'SFT-06', 'pharmacotherapeutic_followup', 'performed', current_date)$$, :'iv')) = 1,
  'tras anularla se puede registrar de nuevo (la anulada se conserva)');
-- Adicional fuera de catálogo.
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_interventions (visit_id, custom_text, domain, status, performed_date) values (%L, '  Llamada a enfermería de hemofilia  ', 'care_coordination', 'performed', current_date)$$, :'iv')) = 1,
  'registra una actuación adicional con su ámbito');
select dermapex_test.expect(
  (select custom_text = 'Llamada a enfermería de hemofilia' and recommended_for_priority is null from public.coag_interventions where visit_id = :'iv' and custom_text is not null),
  'adicional: texto recortado; «recomendada» no aplica');
-- Sin estratificación previa.
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status) values (%L, 'COO-02', 'care_coordination', 'planned')$$, :'nv')) = 1,
  'se puede registrar sin estratificación previa');
select dermapex_test.expect(
  (select priority_context is null and recommended_for_priority is null from public.coag_interventions where visit_id = :'nv'),
  'sin estratificación: prioridad y «recomendada» vacías (no se suponen)');
select dermapex_test.expect(dermapex_test.affected(format(
  $$delete from public.coag_interventions where visit_id = %L$$, :'iv')) = 0, 'una investigadora no borra actuaciones');
commit;

-- Aislamiento entre centros y estudios.
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_interventions') = 0, 'otro centro no ve actuaciones de LAFE');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_interventions (visit_id, catalog_code, domain, status) values (%L, 'COO-03', 'care_coordination', 'planned')$$, :'iv'),
  'otro centro no registra actuaciones en LAFE');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_interventions') = 0, 'DERMAPEX no ve actuaciones COAMO');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_intervention_catalog') = 0, 'DERMAPEX no ve el catálogo COAMO');
commit;
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.coag_interventions', 'anon no lee actuaciones');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log where table_name = 'coag_interventions' and action = 'UPDATE' and visit_id = :'iv'
           and old_data ->> 'status' = 'planned' and new_data ->> 'status' = 'performed'),
  'auditoría del cambio prevista → realizada, con visita');
commit;

select dermapex_test.expect(not exists (select 1 from public.audit_log where table_name like 'coag\_%'), 'nada de COAMO en la auditoría DERMAPEX');

\echo 'COAMO: todas las pruebas de actuaciones farmacéuticas superadas.'
