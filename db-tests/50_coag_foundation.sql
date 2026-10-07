-- SOLO PARA PRUEBAS LOCALES. COAMO · base de control (migraciones 20261007150000/150100).
-- Se ejecuta tras 10_* a 40_* (reutiliza sus helpers y usuarios: C = coordinación DERMAPEX,
-- A2 = investigador DERMAPEX, E = acceso 'coag' sin perfil COAMO, R = acceso a ambas apps).
-- Diseño: docs/coamo/SUPABASE_DERMAPEX_COAG_ARCHITECTURE.md §17.

\set ON_ERROR_STOP on
\set QUIET on

-- ── Datos de partida (como administrador de BD) ─────────────────────────────
-- CI1: investigador COAMO de LAFE · CI2: investigador COAMO de VHEBRON · CC: coordinación COAMO

insert into auth.users (id, email) values
  ('c0a00000-5000-4000-8000-000000000001', 'ci1@coag.test'),
  ('c0a00000-5000-4000-8000-000000000002', 'ci2@coag.test'),
  ('c0a00000-5000-4000-8000-000000000003', 'cc@coag.test');

select coag_private.provision_user('ci1@coag.test', 'investigator', 'Investigadora COAMO 1');
select coag_private.provision_user('ci2@coag.test');
select coag_private.provision_user('cc@coag.test', 'coordinator');
select coag_private.provision_user('dual@test', 'coordinator');   -- R: coordinación en ambos estudios
select coag_private.assign_center('ci1@coag.test', 'lafe');        -- código sin distinguir mayúsculas
select coag_private.assign_center('ci2@coag.test', 'VHEBRON');

select dermapex_test.expect_fail($$select coag_private.provision_user('nadie@test')$$, 'alta COAMO rechazada para un correo inexistente');
select dermapex_test.expect_fail($$select coag_private.assign_center('coord@test', 'LAFE')$$, 'no se asignan centros COAMO a cuentas sin perfil COAMO');
select dermapex_test.expect_fail($$select coag_private.assign_center('ci1@coag.test', 'NOEXISTE')$$, 'centro COAMO inexistente rechazado');
select dermapex_test.expect_fail($$select coag_private.provision_user('ci1@coag.test', 'admin')$$, 'solo roles investigator/coordinator');

-- ── Centros sembrados ───────────────────────────────────────────────────────

select dermapex_test.expect((select count(*) from public.coag_centers) = 8, '8 centros COAMO');
select dermapex_test.expect(
  (select count(*) from public.coag_centers where center_role = 'recruiting' and study_number between 1 and 7) = 7,
  '7 reclutadores con número de estudio 1-7');
select dermapex_test.expect(
  (select center_role = 'consulting' and study_number is null from public.coag_centers where code = 'VALME'),
  'Valme es consultor y no tiene número de estudio');
select dermapex_test.expect_fail($$update public.coag_centers set study_number = 8 where code = 'VALME'$$, 'un centro consultor no puede tener número de estudio');

-- ── Inventario de seguridad (protege también tablas coag_* futuras) ─────────

select dermapex_test.expect(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'coag\_%'
       and (
         not c.relrowsecurity
         or not exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
              and p.policyname = 'coag_app_gate' and p.permissive = 'RESTRICTIVE'
         )
       )
  ),
  'toda tabla coag_* tiene RLS y la política restrictiva coag_app_gate');
select dermapex_test.expect(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname like 'coag\_%'
       and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))
  ),
  'anon no tiene ningún privilegio sobre tablas coag_* (privilegios por defecto neutralizados)');
select dermapex_test.expect(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'coag\_%'
       and has_table_privilege('authenticated', c.oid, 'TRUNCATE')
  ),
  'authenticated no puede vaciar tablas coag_*');

select id as vhebron_id from public.coag_centers where code = 'VHEBRON' \gset

-- ── Investigadora COAMO (CI1) ───────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(coag_private.is_active_user() and not coag_private.is_coordinator(), 'CI1 es investigadora COAMO activa');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_profiles') = 1, 'CI1 solo ve su perfil');
select dermapex_test.expect((select code from public.coag_centers) = 'LAFE' and dermapex_test.count_rows('public.coag_centers') = 1, 'CI1 solo ve su centro');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_center_memberships') = 1, 'CI1 solo ve su pertenencia');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_audit_log') = 0, 'CI1 no ve la auditoría');
select dermapex_test.expect(dermapex_test.affected($$update public.coag_profiles set full_name = 'Nombre editado' where id = 'c0a00000-5000-4000-8000-000000000001'$$) = 1, 'CI1 edita su nombre');
select dermapex_test.expect_fail($$update public.coag_profiles set role = 'coordinator' where id = 'c0a00000-5000-4000-8000-000000000001'$$, 'CI1 no puede escalarse a coordinación');
select dermapex_test.expect_fail($$update public.coag_profiles set must_change_password = false where id = 'c0a00000-5000-4000-8000-000000000001'$$, 'CI1 no altera el indicador de contraseña directamente');
select dermapex_test.expect_fail($$insert into public.coag_profiles (id) values ('c0a00000-5000-4000-8000-000000000001')$$, 'nadie se crea un perfil COAMO desde la API');
select dermapex_test.expect_fail($$insert into public.coag_centers (code, name, center_role) values ('NUEVO', 'Centro nuevo', 'recruiting')$$, 'CI1 no puede crear centros');
select dermapex_test.expect(dermapex_test.affected($$update public.coag_centers set name = 'X' where code = 'LAFE'$$) = 0, 'CI1 no puede editar su centro');
select dermapex_test.expect_fail(
  format('insert into public.coag_center_memberships (profile_id, center_id) values (%L, %L)', 'c0a00000-5000-4000-8000-000000000001', :'vhebron_id'),
  'CI1 no puede asignarse otro centro aunque conozca su UUID');
select public.coag_mark_password_changed();
select dermapex_test.expect((select not must_change_password from public.coag_profiles where id = 'c0a00000-5000-4000-8000-000000000001'), 'CI1 marca su contraseña como cambiada');
-- Nada de DERMAPEX
select dermapex_test.expect(
  dermapex_test.count_rows('public.patients') = 0 and dermapex_test.count_rows('public.centers') = 0
  and dermapex_test.count_rows('public.profiles') = 0 and dermapex_test.count_rows('public.cmo_variable_catalog') = 0
  and dermapex_test.count_rows('public.audit_log') = 0 and dermapex_test.count_rows('storage.objects') = 0,
  'CI1 no ve nada de DERMAPEX (pacientes, centros, perfiles, catálogo, auditoría, documentos)');
select dermapex_test.expect_fail($$select coag_private.provision_user('ci1@coag.test', 'coordinator')$$, 'CI1 no puede usar el alta administrativa');
select dermapex_test.expect_fail($$select coag_private.assign_center('ci1@coag.test', 'VHEBRON')$$, 'CI1 no puede asignarse centros por la función administrativa');
commit;

select dermapex_test.expect(
  (select must_change_password from public.coag_profiles where id = 'c0a00000-5000-4000-8000-000000000002'),
  'coag_mark_password_changed no afecta a otras cuentas');
select dermapex_test.expect(
  (select must_change_password from public.profiles where id = 'c0a00000-5000-4000-8000-000000000001'),
  'coag_mark_password_changed no toca el perfil DERMAPEX automático');

begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000002');
select dermapex_test.expect((select string_agg(code, ',') from public.coag_centers) = 'VHEBRON', 'CI2 solo ve su centro, no el de CI1');
select dermapex_test.expect(not exists (select 1 from public.coag_profiles where id = 'c0a00000-5000-4000-8000-000000000001'), 'CI2 no ve el perfil de CI1');
commit;

-- ── Coordinación COAMO (CC) ─────────────────────────────────────────────────
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(coag_private.is_coordinator(), 'CC es coordinación COAMO');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_centers') = 8, 'CC ve los 8 centros COAMO');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_profiles') = 4, 'CC ve los 4 perfiles COAMO (CI1, CI2, CC, R)');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_audit_log') > 0, 'CC consulta la auditoría COAMO');
select dermapex_test.expect(
  dermapex_test.count_rows('public.patients') = 0 and dermapex_test.count_rows('public.centers') = 0
  and dermapex_test.count_rows('public.profiles') = 0 and dermapex_test.count_rows('public.audit_log') = 0,
  'CC (coordinación COAMO) no ve nada de DERMAPEX');
select dermapex_test.expect(not app_private.is_coordinator(), 'CC no es coordinación DERMAPEX');
select dermapex_test.expect_fail($$delete from public.coag_centers where code = 'BALMIS'$$, 'ni coordinación borra centros (se desactivan)');
select dermapex_test.expect_fail($$delete from public.coag_audit_log$$, 'ni coordinación borra la auditoría COAMO');
select dermapex_test.expect_fail($$insert into public.centers (code, name, study_arm, study_number) values ('COAG', 'Intruso', 'cmo', 99)$$, 'CC no puede crear centros DERMAPEX');
select dermapex_test.expect_fail($$update public.coag_profiles set role = 'coordinator' where id = 'c0a00000-5000-4000-8000-000000000002'$$, 'ni coordinación cambia roles desde la API');
commit;

-- Escrituras de coordinación (en transacción que se deshace).
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000003');
select dermapex_test.expect(dermapex_test.affected($$insert into public.coag_centers (code, name, center_role, study_number) values ('PRUEBA', 'Centro de prueba', 'recruiting', 50)$$) = 1, 'CC da de alta un centro');
select dermapex_test.expect(
  (select created_by from public.coag_centers where code = 'PRUEBA') = 'c0a00000-5000-4000-8000-000000000003',
  'la autoría del alta se sella en servidor');
select dermapex_test.expect(dermapex_test.affected($$insert into public.coag_center_memberships (profile_id, center_id) select 'c0a00000-5000-4000-8000-000000000002', id from public.coag_centers where code = 'PRUEBA'$$) = 1, 'CC asigna un centro a un investigador COAMO');
select dermapex_test.expect(
  exists (select 1 from public.coag_audit_log where table_name = 'coag_center_memberships' and action = 'INSERT' and actor_id = 'c0a00000-5000-4000-8000-000000000003'),
  'la asignación queda en la auditoría COAMO con su autor');
select dermapex_test.expect_fail($$insert into public.coag_center_memberships (profile_id, center_id) select 'cccccccc-0000-4000-8000-000000000001', id from public.coag_centers where code = 'PRUEBA'$$, 'CC no puede asignar centros COAMO a una cuenta solo DERMAPEX');
rollback;

-- ── DERMAPEX no ve nada de COAMO ────────────────────────────────────────────

begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.patients') > 0, 'control: C (coordinación DERMAPEX) sigue viendo sus pacientes');
select dermapex_test.expect(
  dermapex_test.count_rows('public.coag_profiles') = 0 and dermapex_test.count_rows('public.coag_centers') = 0
  and dermapex_test.count_rows('public.coag_center_memberships') = 0 and dermapex_test.count_rows('public.coag_audit_log') = 0,
  'C (coordinación DERMAPEX) no ve nada de COAMO');
select dermapex_test.expect(not coag_private.is_coordinator(), 'C no es coordinación COAMO');
select dermapex_test.expect_fail($$insert into public.coag_centers (code, name, center_role) values ('INTRUSO', 'Intruso', 'recruiting')$$, 'C no puede crear centros COAMO');
select dermapex_test.expect(dermapex_test.affected($$update public.coag_centers set name = 'X'$$) = 0, 'C no puede editar centros COAMO');
select public.coag_mark_password_changed();
commit;

begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_centers') = 0 and dermapex_test.count_rows('public.coag_profiles') = 0, 'A2 (investigador DERMAPEX) no ve nada de COAMO');
commit;

-- E: acceso 'coag' pero sin perfil COAMO → nada.
begin;
select dermapex_test.as_user('eeeeeeee-4000-4000-8000-000000000001');
select dermapex_test.expect(not coag_private.is_active_user(), 'E (acceso COAMO sin perfil) no es usuario COAMO activo');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_centers') = 0, 'E no ve centros COAMO');
commit;

-- R: coordinación en ambos estudios con una sola cuenta, cada rol en su aplicación.
begin;
select dermapex_test.as_user('eeeeeeee-4000-4000-8000-000000000003');
select dermapex_test.expect(app_private.is_coordinator() and coag_private.is_coordinator(), 'R es coordinación en DERMAPEX y en COAMO');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_centers') = 8 and dermapex_test.count_rows('public.patients') > 0, 'R ve centros COAMO y pacientes DERMAPEX');
commit;

-- Anónimo
begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.coag_centers', 'anon no puede leer centros COAMO');
select dermapex_test.expect_fail('select * from public.coag_profiles', 'anon no puede leer perfiles COAMO');
select dermapex_test.expect_fail('select public.coag_mark_password_changed()', 'anon no puede ejecutar coag_mark_password_changed');
commit;

-- ── Auditorías separadas ────────────────────────────────────────────────────

select dermapex_test.expect(not exists (select 1 from public.audit_log where table_name like 'coag\_%'), 'la auditoría DERMAPEX no contiene eventos COAMO');
select dermapex_test.expect(not exists (select 1 from public.coag_audit_log where table_name not like 'coag\_%'), 'la auditoría COAMO no contiene eventos DERMAPEX');

-- ── Revocación inmediata ────────────────────────────────────────────────────

select app_private.set_app_access('ci1@coag.test', 'coag', false);
begin;
select dermapex_test.as_user('c0a00000-5000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.coag_centers') = 0 and dermapex_test.count_rows('public.coag_profiles') = 0, 'investigadora COAMO revocada no ve nada');
commit;
select app_private.set_app_access('ci1@coag.test', 'coag', true);

\echo 'COAMO: todas las pruebas de la base de control superadas.'
