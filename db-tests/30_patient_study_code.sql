-- SOLO PARA PRUEBAS LOCALES. Código de estudio correlativo por centro (DPX-<n>-NNNN), asignado por
-- la base de datos. Se ejecuta tras 10_* y 20_* (reutiliza sus usuarios y centros).

\set ON_ERROR_STOP on
\set QUIET on

-- Centros de partida: CM = 11 (cohorte CMO, ya con 2 pacientes de 20_*), CS = 12, CV = 13 (sin pacientes).

select dermapex_test.expect(
  (select string_agg(study_code, ',' order by center_seq) from public.patients where center_id = '22222222-0000-4000-8000-000000000001') = 'DPX-11-0001,DPX-11-0002',
  'los pacientes reciben DPX-<centro>-NNNN correlativo, ignorando el código que envía el cliente');
select dermapex_test.expect(
  (select study_code from public.patients where id = 'b0000000-1000-4000-8000-000000000001') = 'DPX-12-0001',
  'cada centro tiene su propia numeración');

-- Alta sin código desde la aplicación: lo asigna la base de datos.
begin;
select dermapex_test.as_user('aaaaaaaa-1000-4000-8000-000000000001');
insert into public.patients (id, center_id, age_at_inclusion, sex) values ('a0000000-3000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 40, 'male');
select dermapex_test.expect((select study_code from public.patients where id = 'a0000000-3000-4000-8000-000000000001') = 'DPX-11-0003', 'alta sin código: se asigna el siguiente del centro');

select dermapex_test.expect_fail($$update public.patients set study_code = 'DPX-11-9999' where id = 'a0000000-3000-4000-8000-000000000001'$$, 'el código de estudio es inmutable');
select dermapex_test.expect_fail($$update public.patients set center_seq = 7 where id = 'a0000000-3000-4000-8000-000000000001'$$, 'el correlativo es inmutable');
update public.patients set sex = 'female' where id = 'a0000000-3000-4000-8000-000000000001';
select dermapex_test.expect((select study_code from public.patients where id = 'a0000000-3000-4000-8000-000000000001') = 'DPX-11-0003', 'editar otros datos no altera el código');

-- Un alta rechazada no consume número.
select dermapex_test.expect_fail($$insert into public.patients (center_id, age_at_inclusion) values ('22222222-0000-4000-8000-000000000001', 15)$$, 'alta rechazada (menor de edad)');
insert into public.patients (id, center_id) values ('a0000000-3000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001');
select dermapex_test.expect((select study_code from public.patients where id = 'a0000000-3000-4000-8000-000000000002') = 'DPX-11-0004', 'un alta rechazada no deja hueco en la numeración');
select dermapex_test.expect_fail($$select * from public.patient_code_counters$$, 'el contador no es accesible desde la API');
commit;

-- Coordinación: borrado deja hueco; no se reutiliza. Cambio de centro bloqueado.
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
delete from public.patients where id = 'a0000000-3000-4000-8000-000000000002';
insert into public.patients (id, center_id) values ('a0000000-3000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001');
select dermapex_test.expect((select study_code from public.patients where id = 'a0000000-3000-4000-8000-000000000003') = 'DPX-11-0005', 'un número borrado no se reutiliza (queda hueco auditado)');
select dermapex_test.expect_fail($$update public.patients set center_id = '22222222-0000-4000-8000-000000000003' where id = 'a0000000-3000-4000-8000-000000000003'$$, 'no se cambia de centro a un paciente con código');

-- Número de centro: obligatorio para incluir, único, inmutable con pacientes.
insert into public.centers (id, code, name, study_arm) values ('22222222-0000-4000-8000-000000000005', 'SINNUM', 'Centro sin número', 'cmo');
select dermapex_test.expect_fail($$insert into public.patients (center_id) values ('22222222-0000-4000-8000-000000000005')$$, 'sin número de centro no se incluyen pacientes');
select dermapex_test.expect_fail($$update public.centers set study_number = 11 where code = 'SINNUM'$$, 'número de centro único');
select dermapex_test.expect_fail($$update public.centers set study_number = 100 where code = 'SINNUM'$$, 'número de centro entre 1 y 99');
update public.centers set study_number = 14 where code = 'SINNUM';
update public.centers set study_number = 15 where code = 'SINNUM';
select dermapex_test.expect((select study_number from public.centers where code = 'SINNUM') = 15, 'sin pacientes, coordinación puede corregir el número');
select dermapex_test.expect_fail($$update public.centers set study_number = 21 where code = 'CM'$$, 'con pacientes, el número del centro no cambia');
select dermapex_test.expect_fail($$update public.centers set study_number = null where code = 'SINNUM'$$, 'el número no puede anularse');
commit;

begin;
select dermapex_test.as_user('aaaaaaaa-1000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.affected($$update public.centers set study_number = 30 where code = 'CM'$$) = 0, 'un investigador no puede cambiar el número de su centro');
commit;

select dermapex_test.expect(
  (select count(*) from public.audit_log where table_name = 'centers' and action = 'UPDATE'
      and old_data ->> 'study_number' = '14' and new_data ->> 'study_number' = '15') = 1,
  'la auditoría registra el cambio de número de centro');

-- Altas concurrentes: el bloqueo de fila del contador serializa la numeración (comprobación de unicidad).
select dermapex_test.expect(
  (select count(*) = count(distinct (center_id, center_seq)) from public.patients where center_seq is not null),
  'sin correlativos duplicados por centro');

\echo 'DERMAPEX: todas las pruebas del código de estudio superadas.'
