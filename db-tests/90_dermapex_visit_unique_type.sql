-- SOLO PARA PRUEBAS LOCALES. DERMAPEX · una visita activa de cada tipo del calendario por paciente
-- (migración 20261028120000). Se ejecuta tras 30_* (reutiliza el investigador y el centro de esa batería).

\set ON_ERROR_STOP on
\set QUIET on

begin;
select dermapex_test.as_user('aaaaaaaa-1000-4000-8000-000000000001');
insert into public.patients (id, center_id) values ('a0000000-9000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001');

insert into public.visits (id, patient_id, visit_type, scheduled_date, visit_status)
values ('a1000000-9000-4000-8000-000000000001', 'a0000000-9000-4000-8000-000000000001', 'month_6', '2026-11-01', 'scheduled');
select dermapex_test.expect_fail($$insert into public.visits (patient_id, visit_type, visit_status) values ('a0000000-9000-4000-8000-000000000001', 'month_6', 'scheduled')$$, 'segunda visita «mes 6» activa rechazada');
select dermapex_test.expect_fail($$insert into public.visits (patient_id, visit_type) values ('a0000000-9000-4000-8000-000000000001', 'month_6')$$, 'visita sin estado cuenta como activa');

insert into public.visits (patient_id, visit_type, visit_status) values ('a0000000-9000-4000-8000-000000000001', 'extra', 'scheduled');
insert into public.visits (patient_id, visit_type, visit_status) values ('a0000000-9000-4000-8000-000000000001', 'extra', 'scheduled');
select dermapex_test.expect((select count(*) from public.visits where patient_id = 'a0000000-9000-4000-8000-000000000001' and visit_type = 'extra') = 2, 'las extraordinarias pueden repetirse');

update public.visits set visit_status = 'cancelled' where id = 'a1000000-9000-4000-8000-000000000001';
insert into public.visits (id, patient_id, visit_type, scheduled_date, visit_status)
values ('a1000000-9000-4000-8000-000000000002', 'a0000000-9000-4000-8000-000000000001', 'month_6', '2026-11-15', 'scheduled');
select dermapex_test.expect(true, 'cancelada no cuenta: se reprograma el mismo tipo');
select dermapex_test.expect_fail($$update public.visits set visit_status = 'scheduled' where id = 'a1000000-9000-4000-8000-000000000001'$$, 'no se reactiva una cancelada si ya hay otra activa del mismo tipo');
select dermapex_test.expect_fail($$update public.visits set visit_type = 'month_6' where patient_id = 'a0000000-9000-4000-8000-000000000001' and visit_type = 'extra'$$, 'reclasificar a un tipo ya ocupado rechazado');
rollback;

\echo 'DERMAPEX: unicidad de tipo de visita por paciente superada.'
