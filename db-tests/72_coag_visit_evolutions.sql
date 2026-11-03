-- SOLO PARA PRUEBAS LOCALES. COAMO · evolución farmacéutica por visita (migración 20261103130000).
-- Se ejecuta tras 71_* (CI1 = LAFE, CI2 = VHEBRON, CC = coordinación COAMO, C = coordinación DERMAPEX).

\set ON_ERROR_STOP on
\set QUIET on

select id as lafe_id from public.coag_centers where code = 'LAFE' \gset
select p.id as ep from public.coag_patients p where p.center_id = :'lafe_id' and p.status = 'included' order by p.center_seq desc limit 1 \gset
select id as e0 from public.coag_visits where patient_id = :'ep' and visit_type = 'baseline' \gset
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
insert into public.coag_visits (patient_id, visit_type, visit_date, modality, status) values (:'ep', 'followup', current_date - 200, 'phone', 'cancelled');
commit;
select id as ex from public.coag_visits where patient_id = :'ep' and visit_type = 'followup' and status = 'cancelled' \gset

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$insert into public.coag_visit_evolutions (visit_id, evolution_text) values (%L, '  Paciente estable. Se refuerza la adherencia.  ')$$, :'e0')) = 1,
  'CI1 registra la evolución farmacéutica de una visita de su centro');
select dermapex_test.expect(
  (select evolution_text = 'Paciente estable. Se refuerza la adherencia.' and revision = 1
      and created_by = 'c0a00000-5000-4000-8000-000000000001' and updated_by = created_by
     from public.coag_visit_evolutions where visit_id = :'e0'),
  'se recupera el texto (sin espacios extremos) con autoría y revisión fijadas por la BD');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visit_evolutions (visit_id, evolution_text) values (%L, 'otra')$$, :'e0'),
  'una sola evolución por visita (no se sobrescribe con una inserción)');
select dermapex_test.expect_fail(format(
  $$update public.coag_visit_evolutions set evolution_text = '   ' where visit_id = %L$$, :'e0'),
  'texto vacío rechazado (no se borra el contenido de forma silenciosa)');
select dermapex_test.expect_fail(format(
  $$update public.coag_visit_evolutions set revision = 99 where visit_id = %L$$, :'e0'),
  'el cliente no escribe la revisión');
select dermapex_test.expect_fail(format(
  $$update public.coag_visit_evolutions set created_by = null where visit_id = %L$$, :'e0'),
  'el cliente no escribe la autoría');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visit_evolutions (visit_id, evolution_text) values (%L, 'texto')$$, :'ex'),
  'no se registra en una visita anulada');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visit_evolutions (visit_id, evolution_text) values (%L, %L)$$, :'ex', repeat('x', 8001)),
  'texto de más de 8000 caracteres rechazado');
commit;

-- Concurrencia: la actualización condicionada a la revisión cargada no sobrescribe un cambio ajeno.
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_visit_evolutions set evolution_text = 'Revisión por coordinación.' where visit_id = %L and revision = 1$$, :'e0')) = 1,
  'coordinación COAMO edita (revisión 1 → 2)');
commit;
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_visit_evolutions set evolution_text = 'Cambio con revisión obsoleta' where visit_id = %L and revision = 1$$, :'e0')) = 0,
  'guardar con una revisión obsoleta no modifica nada (0 filas: el cliente avisa)');
select dermapex_test.expect(
  (select evolution_text = 'Revisión por coordinación.' and revision = 2 and created_by = 'c0a00000-5000-4000-8000-000000000001'
      and updated_by = 'c0a00000-5000-4000-8000-000000000003'
     from public.coag_visit_evolutions where visit_id = :'e0'),
  'se conserva la autoría original y se registra quién modificó');
select dermapex_test.expect(dermapex_test.affected(format(
  $$delete from public.coag_visit_evolutions where visit_id = %L$$, :'e0')) = 0, 'una investigadora no borra evoluciones');
commit;

-- Aislamiento entre centros y estudios.
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_visit_evolutions') = 0, 'CI2 (otro centro) no ve evoluciones de LAFE');
select dermapex_test.expect(dermapex_test.affected(format(
  $$update public.coag_visit_evolutions set evolution_text = 'x' where visit_id = %L$$, :'e0')) = 0, 'CI2 no modifica evoluciones de LAFE');
select dermapex_test.expect_fail(format(
  $$insert into public.coag_visit_evolutions (visit_id, evolution_text) values (%L, 'x')$$, :'e0'), 'CI2 no crea evoluciones en LAFE');
commit;
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_visit_evolutions') = 0, 'coordinación DERMAPEX no ve evoluciones COAMO');
commit;
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.coag_visit_evolutions', 'anon no lee evoluciones');
commit;

-- Versiones en la auditoría COAMO.
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log
           where table_name = 'coag_visit_evolutions' and action = 'UPDATE' and visit_id = :'e0' and patient_id = :'ep' and center_id = :'lafe_id'
             and old_data ->> 'evolution_text' = 'Paciente estable. Se refuerza la adherencia.'
             and new_data ->> 'evolution_text' = 'Revisión por coordinación.'),
  'la auditoría conserva la versión anterior y la nueva, con visita, paciente y centro');
select dermapex_test.expect(dermapex_test.affected(format(
  $$delete from public.coag_visit_evolutions where visit_id = %L$$, :'e0')) = 1, 'coordinación COAMO puede borrar (auditado)');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log where table_name = 'coag_visit_evolutions' and action = 'DELETE' and old_data ->> 'evolution_text' = 'Revisión por coordinación.'),
  'el borrado conserva el último texto en la auditoría');
commit;

select dermapex_test.expect(not exists (select 1 from public.audit_log where table_name like 'coag\_%'), 'nada de COAMO en la auditoría DERMAPEX');

\echo 'COAMO: todas las pruebas de evolución farmacéutica superadas.'
