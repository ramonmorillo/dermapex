-- SOLO PARA PRUEBAS LOCALES. DERMAPEX · Restablecimiento administrativo de contraseña
-- (migración 20261119100000). Usuarios propios (prefijo 9600...) sobre los helpers de 10_*.

\set ON_ERROR_STOP on
\set QUIET on

-- Los helpers de prueba también los usa service_role (la Edge Function).
grant usage on schema dermapex_test to service_role;
grant execute on all functions in schema dermapex_test to service_role;

insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-000000000001', 'coord96@test'),
  ('96000000-0000-4000-8000-000000000002', 'inv96@test'),
  ('96000000-0000-4000-8000-000000000003', 'inv96b@test'),
  ('96000000-0000-4000-8000-000000000004', 'inactive96@test'),
  ('96000000-0000-4000-8000-000000000005', 'noaccess96@test'),
  ('96000000-0000-4000-8000-000000000006', 'coord96b@test'),
  ('96000000-0000-4000-8000-000000000007', 'coordinactive96@test');
insert into app_private.app_access (user_id, app_code, is_active)
select id, 'dermapex', true from auth.users where id::text like '96000000%' and id <> '96000000-0000-4000-8000-000000000005';
update public.profiles set role = 'coordinator' where id in ('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000006','96000000-0000-4000-8000-000000000007');
update public.profiles set is_active = false where id in ('96000000-0000-4000-8000-000000000004','96000000-0000-4000-8000-000000000007');
update public.profiles set must_change_password = false where id in ('96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000003');
insert into public.center_memberships (profile_id, center_id) values ('96000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001');

create temp table _before as
  select (select count(*) from public.patients) p, (select count(*) from public.visits) v,
         (select count(*) from public.center_memberships where profile_id = '96000000-0000-4000-8000-000000000002') m,
         (select role from public.profiles where id = '96000000-0000-4000-8000-000000000002') r;
grant all on _before to public;

-- ── Los roles de la API no pueden ejecutar las funciones administrativas ──
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail($$select * from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000001')$$, 'anon no puede listar candidatos');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002')$$, 'anon no puede iniciar un restablecimiento');
commit;
begin;
select dermapex_test.as_user('96000000-0000-4000-8000-000000000001');
select dermapex_test.expect_fail($$select * from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000001')$$, 'ni siquiera la coordinación puede llamarlas directamente (solo service_role)');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002')$$, 'coordinación autenticada: sin EXECUTE sobre begin');
select dermapex_test.expect_fail($$select * from app_private.admin_actions$$, 'el registro administrativo no es legible desde la API');
commit;

-- ── Con service_role (Edge Function): autorización en servidor ──
begin;
set local role service_role;
select dermapex_test.expect((select count(*) from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000001') where id in ('96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000003')) = 2, 'coordinación activa ve a los investigadores activos');
select dermapex_test.expect((select count(*) from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000001') where id in ('96000000-0000-4000-8000-000000000004','96000000-0000-4000-8000-000000000005','96000000-0000-4000-8000-000000000006','96000000-0000-4000-8000-000000000001')) = 0, 'el listado excluye inactivos, sin acceso DERMAPEX, coordinación y al propio solicitante');
select dermapex_test.expect((select center_codes from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000001') where id = '96000000-0000-4000-8000-000000000002') = array['C1'], 'el listado incluye el centro');
select dermapex_test.expect_fail($$select * from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000002')$$, 'un investigador no obtiene el listado');
select dermapex_test.expect_fail($$select * from public.admin_pwreset_candidates('96000000-0000-4000-8000-000000000007')$$, 'coordinación inactiva rechazada');
select dermapex_test.expect_fail($$select * from public.admin_pwreset_candidates(null)$$, 'solicitante nulo rechazado');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000003')$$, 'un investigador no puede restablecer a otro');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001')$$, 'no se puede restablecer a uno mismo');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000006')$$, 'no se puede restablecer a otra coordinación');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000004')$$, 'no se puede restablecer a un investigador inactivo');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000005')$$, 'no se puede restablecer a una cuenta sin acceso DERMAPEX');
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-0000000000ff')$$, 'destino inexistente rechazado');
reset role;
select dermapex_test.expect((select count(*) from app_private.admin_actions) = 0, 'los intentos rechazados no dejan registros de inicio');
set local role service_role;

-- Caso válido
select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002');
select dermapex_test.expect((select must_change_password from public.profiles where id = '96000000-0000-4000-8000-000000000002'), 'must_change_password = true tras iniciar');
select dermapex_test.expect(not (select must_change_password from public.profiles where id = '96000000-0000-4000-8000-000000000003'), 'otras cuentas no se alteran');
select public.admin_pwreset_complete('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002', true);
reset role;
select dermapex_test.expect((select count(*) from app_private.admin_actions where actor_id = '96000000-0000-4000-8000-000000000001' and target_id = '96000000-0000-4000-8000-000000000002' and outcome in ('started','succeeded')) = 2, 'operación registrada (inicio y resultado)');
set local role service_role;
reset role;
select dermapex_test.expect(not exists (select 1 from information_schema.columns where table_schema = 'app_private' and table_name = 'admin_actions' and column_name ~* '(pass|token|secret|email)'), 'el registro no tiene columnas de contraseña, token ni correo');
set local role service_role;
select dermapex_test.expect_fail($$select public.admin_pwreset_complete('96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000003', true)$$, 'complete también exige coordinación');

-- Límite de frecuencia: 10 por hora y coordinador
select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003') from generate_series(1, 9);
select dermapex_test.expect_fail($$select public.admin_pwreset_begin('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003')$$, 'freno de frecuencia: a la undécima operación en una hora');
commit;

-- ── Sin efectos sobre identidad, centros, permisos ni datos clínicos ──
select dermapex_test.expect((select p = (select count(*) from public.patients) and v = (select count(*) from public.visits) from _before), 'pacientes y visitas intactos');
select dermapex_test.expect((select m = (select count(*) from public.center_memberships where profile_id = '96000000-0000-4000-8000-000000000002') from _before), 'centros del investigador intactos');
select dermapex_test.expect((select r = (select role from public.profiles where id = '96000000-0000-4000-8000-000000000002') from _before), 'rol del investigador intacto');
select dermapex_test.expect((select is_active from app_private.app_access where user_id = '96000000-0000-4000-8000-000000000002' and app_code = 'dermapex'), 'acceso DERMAPEX intacto');
select dermapex_test.expect((select count(*) from auth.users where id = '96000000-0000-4000-8000-000000000002') = 1, 'la cuenta de Auth (UUID) sigue existiendo');
