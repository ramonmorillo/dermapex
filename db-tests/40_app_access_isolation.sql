-- SOLO PARA PRUEBAS LOCALES. Aislamiento por aplicación (migración 20261007130000).
-- Se ejecuta tras 10_*, 20_* y 30_* (reutiliza sus helpers, centros y la coordinación C).
--
-- Usuarios nuevos:
--   E: cuenta solo COAMO (acceso 'coag'), con perfil DERMAPEX automático y una pertenencia antigua.
--   N: cuenta sin acceso a ninguna aplicación.
--   R: coordinación con acceso a DERMAPEX y COAMO (una sola cuenta, caso del IP).
-- Diseño: docs/coamo/SUPABASE_DERMAPEX_COAG_ARCHITECTURE.md §17.

\set ON_ERROR_STOP on
\set QUIET on

create function dermapex_test.count_rows(p_relation text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from %s', p_relation) into n;
  return n;
end $$;
grant execute on function dermapex_test.count_rows(text) to anon, authenticated;

-- ── Datos de partida (como administrador de BD) ─────────────────────────────

insert into auth.users (id, email) values
  ('eeeeeeee-4000-4000-8000-000000000001', 'coag-only@test'),
  ('eeeeeeee-4000-4000-8000-000000000002', 'no-access@test'),
  ('eeeeeeee-4000-4000-8000-000000000003', 'dual@test');

select app_private.set_app_access('coag-only@test', 'coag');
select app_private.set_app_access('DUAL@test ', 'dermapex');   -- correo sin distinguir mayúsculas/espacios
select app_private.set_app_access('dual@test', 'coag');
update public.profiles set role = 'coordinator' where id = 'eeeeeeee-4000-4000-8000-000000000003';

select dermapex_test.expect_fail($$select app_private.set_app_access('nadie@test', 'dermapex')$$, 'alta de acceso rechazada para un correo inexistente');
select dermapex_test.expect_fail($$insert into app_private.app_access (user_id, app_code) values ('eeeeeeee-4000-4000-8000-000000000002', 'iris')$$, 'solo se admiten los códigos de aplicación aprobados');
select dermapex_test.expect(
  (select count(*) from app_private.app_access where user_id = 'eeeeeeee-4000-4000-8000-000000000002') = 0,
  'una cuenta nueva de Auth no recibe acceso a ninguna aplicación');

-- Pertenencia antigua a un centro DERMAPEX (simula un error administrativo).
insert into public.center_memberships (profile_id, center_id) values
  ('eeeeeeee-4000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001');

-- Paciente, visita y documento de referencia en el centro C1 (cohorte CMO).
insert into public.patients (id, center_id, age_at_inclusion, sex, created_by) values
  ('e0000000-4000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 40, 'male', 'cccccccc-0000-4000-8000-000000000001');
insert into public.visits (id, patient_id, visit_type, created_by) values
  ('e1000000-4000-4000-8000-000000000001', 'e0000000-4000-4000-8000-000000000001', 'baseline', 'cccccccc-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name) values
  ('visit-documents', 'visits/e1000000-4000-4000-8000-000000000001/informe.pdf');

-- ── Inventario: toda tabla DERMAPEX tiene la barrera restrictiva ────────────

select dermapex_test.expect(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'coag\_%'
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname
            and p.policyname = 'dermapex_app_gate' and p.permissive = 'RESTRICTIVE'
       )
  ),
  'todas las tablas DERMAPEX de public tienen la política restrictiva dermapex_app_gate');

-- ── Controles positivos: las mismas operaciones SÍ funcionan para DERMAPEX (A2, investigador C1) ──
-- (A fue desactivado en 10_*). Garantizan que los rechazos de E se deben a la barrera y no a datos inválidos.
begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.cmo_variable_catalog') > 0, 'control: A2 ve el catálogo CMO');
select dermapex_test.expect(dermapex_test.count_rows('storage.objects') > 0, 'control: A2 ve el documento de la visita de su centro');
select dermapex_test.expect(dermapex_test.affected($$insert into public.medication_catalog (source, display_name) values ('manual', 'Catálogo escrito por COAMO')$$) = 1, 'control: A2 puede añadir al catálogo de medicamentos');
select dermapex_test.expect(dermapex_test.affected($$insert into public.patients (center_id, age_at_inclusion) values ('11111111-0000-4000-8000-000000000001', 50)$$) = 1, 'control: A2 puede crear pacientes en C1');
select dermapex_test.expect(dermapex_test.affected($$update public.visits set notes = notes where id = 'e1000000-4000-4000-8000-000000000001'$$) = 1, 'control: A2 puede modificar la visita de referencia');
rollback;

-- ── Cuenta solo COAMO (E) ───────────────────────────────────────────────────
begin;
select dermapex_test.as_user('eeeeeeee-4000-4000-8000-000000000001');
select dermapex_test.expect(app_private.has_app_access('coag') and not app_private.has_app_access('dermapex'), 'E tiene acceso COAMO y no DERMAPEX');
select dermapex_test.expect(not app_private.is_active_user(), 'E no es usuario activo de DERMAPEX aunque tenga perfil');
select dermapex_test.expect(not app_private.can_access_center('11111111-0000-4000-8000-000000000001'), 'E no accede al centro C1 pese a la pertenencia antigua');
select dermapex_test.expect(not app_private.has_cmo_center_access(), 'E no accede al catálogo CMO de intervenciones');

do $$
declare
  v_rel text;
begin
  foreach v_rel in array array[
    'public.audit_log', 'public.center_memberships', 'public.centers', 'public.cmo_model_versions',
    'public.cmo_score_item_results', 'public.cmo_scores', 'public.cmo_variable_catalog', 'public.consents',
    'public.intervention_catalog', 'public.interventions', 'public.med_catalog_aliases',
    'public.med_catalog_concept_ingredients', 'public.med_catalog_concepts', 'public.med_catalog_ingredients',
    'public.med_catalog_products', 'public.medication_catalog', 'public.patient_medications',
    'public.patients', 'public.profiles', 'public.questionnaire_measurement_map',
    'public.questionnaire_responses', 'public.usual_care_activity_catalog', 'public.visit_documents',
    'public.visit_medication_events', 'public.visits',
    'public.cmo_stratification_registry', 'public.cmo_stratification_item_values'
  ] loop
    perform dermapex_test.expect(dermapex_test.count_rows(v_rel) = 0, 'E no ve filas de ' || v_rel);
  end loop;
end $$;

select dermapex_test.expect(dermapex_test.count_rows('storage.objects') = 0, 'E no ve documentos del bucket DERMAPEX');
select dermapex_test.expect_fail($$insert into storage.objects (bucket_id, name) values ('visit-documents', 'visits/e1000000-4000-4000-8000-000000000001/e.pdf')$$, 'E no puede subir documentos a una visita DERMAPEX');
select dermapex_test.expect(dermapex_test.affected($$delete from storage.objects where bucket_id = 'visit-documents'$$) = 0, 'E no puede borrar documentos DERMAPEX');

select dermapex_test.expect_fail($$insert into public.medication_catalog (source, display_name) values ('manual', 'Catálogo escrito por COAMO')$$, 'E no puede escribir en catálogos DERMAPEX');
select dermapex_test.expect_fail($$insert into public.patients (center_id, age_at_inclusion) values ('11111111-0000-4000-8000-000000000001', 50)$$, 'E no puede crear pacientes DERMAPEX');
select dermapex_test.expect(dermapex_test.affected($$update public.profiles set full_name = 'X' where id = 'eeeeeeee-4000-4000-8000-000000000001'$$) = 0, 'E no puede editar su perfil DERMAPEX automático');
select dermapex_test.expect(dermapex_test.affected($$update public.visits set notes = notes where id = 'e1000000-4000-4000-8000-000000000001'$$) = 0, 'E no puede modificar visitas DERMAPEX conociendo su UUID');

select public.mark_password_changed();
select dermapex_test.expect_fail(
  $$select public.save_cmo_stratification('e1000000-4000-4000-8000-000000000001', 'baseline', 'x', 'x', '{}'::jsonb, 0, 1)$$,
  'E no puede guardar estratificaciones CMO');
select dermapex_test.expect_fail($$select app_private.visit_study_arm('e1000000-4000-4000-8000-000000000001')$$, 'la cohorte de una visita ya no es consultable desde la API');
select dermapex_test.expect_fail($$select * from app_private.app_access$$, 'E no puede leer la tabla de accesos');
select dermapex_test.expect_fail($$insert into app_private.app_access (user_id, app_code, is_active) values ('eeeeeeee-4000-4000-8000-000000000001', 'dermapex', true)$$, 'E no puede concederse acceso DERMAPEX');
select dermapex_test.expect_fail($$select app_private.set_app_access('coag-only@test', 'dermapex')$$, 'E no puede usar la función administrativa de accesos');
select dermapex_test.expect_fail($$select * from app_private.admin_log$$, 'E no puede leer el registro administrativo');
commit;

select dermapex_test.expect(
  (select must_change_password from public.profiles where id = 'eeeeeeee-4000-4000-8000-000000000001'),
  'mark_password_changed no altera el perfil DERMAPEX de una cuenta COAMO');

-- ── Cuenta sin acceso a ninguna aplicación (N) ──────────────────────────────
begin;
select dermapex_test.as_user('eeeeeeee-4000-4000-8000-000000000002');
select dermapex_test.expect(dermapex_test.count_rows('public.profiles') = 0, 'N no ve ni su propio perfil');
select dermapex_test.expect(dermapex_test.count_rows('public.cmo_variable_catalog') = 0, 'N no ve catálogos');
select dermapex_test.expect_fail($$insert into public.profiles (id, full_name) values ('eeeeeeee-4000-4000-8000-000000000002', 'Yo') on conflict (id) do update set full_name = 'Yo'$$, 'N no puede crear ni reescribir un perfil para colarse');
commit;

begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail($$select app_private.has_app_access('dermapex')$$, 'anon no puede ejecutar el helper de acceso');
commit;

-- ── Coordinación DERMAPEX (C) no ve ni gestiona cuentas de otra aplicación ──
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(dermapex_test.count_rows('public.patients') > 0, 'C sigue viendo pacientes DERMAPEX (regresión)');
select dermapex_test.expect(
  not exists (select 1 from public.profiles where id in ('eeeeeeee-4000-4000-8000-000000000001', 'eeeeeeee-4000-4000-8000-000000000002')),
  'C no ve perfiles de cuentas sin acceso DERMAPEX');
select dermapex_test.expect(
  exists (select 1 from public.profiles where id = 'eeeeeeee-4000-4000-8000-000000000003'),
  'C ve el perfil de una cuenta DERMAPEX que además tiene COAMO');
select dermapex_test.expect(
  not exists (select 1 from public.center_memberships where profile_id = 'eeeeeeee-4000-4000-8000-000000000001'),
  'C no ve la pertenencia antigua de la cuenta COAMO');
select dermapex_test.expect(
  not exists (
    select 1 from public.audit_log
     where row_id in ('eeeeeeee-4000-4000-8000-000000000001', 'eeeeeeee-4000-4000-8000-000000000002')
        or new_data ->> 'profile_id' = 'eeeeeeee-4000-4000-8000-000000000001'
  ),
  'la auditoría DERMAPEX no contiene eventos de cuentas ajenas');
select dermapex_test.expect_fail(
  $$insert into public.center_memberships (profile_id, center_id) values ('eeeeeeee-4000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002')$$,
  'C no puede asignar centros DERMAPEX a una cuenta sin acceso DERMAPEX');
commit;

select dermapex_test.expect(
  (select count(*) from app_private.admin_log
    where table_name in ('profiles', 'center_memberships')
      and (row_ref like 'eeeeeeee-4000-4000-8000-00000000000%' or new_data ->> 'profile_id' = 'eeeeeeee-4000-4000-8000-000000000001')) >= 3,
  'los eventos de perfiles/pertenencias de cuentas ajenas quedan en el registro administrativo privado');
select dermapex_test.expect(
  (select count(*) from app_private.admin_log where table_name = 'app_access') >= 4,
  'las altas de acceso por aplicación quedan registradas');

-- ── Coordinación con acceso a ambas aplicaciones (R) ────────────────────────
begin;
select dermapex_test.as_user('eeeeeeee-4000-4000-8000-000000000003');
select dermapex_test.expect(app_private.is_coordinator(), 'R es coordinación DERMAPEX');
select dermapex_test.expect(dermapex_test.count_rows('public.patients') > 0, 'R ve los pacientes DERMAPEX');
select dermapex_test.expect(dermapex_test.count_rows('storage.objects') > 0, 'R ve los documentos DERMAPEX');
select public.mark_password_changed();
select dermapex_test.expect((select not must_change_password from public.profiles where id = 'eeeeeeee-4000-4000-8000-000000000003'), 'R puede marcar su contraseña como cambiada');
commit;

-- ── Revocación: efecto inmediato con la sesión aún vigente ──────────────────
select app_private.set_app_access('coord@test', 'dermapex', false);
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect(not app_private.is_coordinator(), 'coordinación revocada pierde el rol al instante');
select dermapex_test.expect(dermapex_test.count_rows('public.patients') = 0, 'coordinación revocada no ve pacientes');
select dermapex_test.expect(dermapex_test.count_rows('public.audit_log') = 0, 'coordinación revocada no ve la auditoría');
commit;
select app_private.set_app_access('coord@test', 'dermapex', true);
begin;
select dermapex_test.as_user('eeeeeeee-4000-4000-8000-000000000003');
select dermapex_test.expect(exists (select 1 from public.profiles where id = 'cccccccc-0000-4000-8000-000000000001'), 'una cuenta DERMAPEX revocada y restaurada sigue visible para coordinación');
commit;

\echo 'DERMAPEX: todas las pruebas de aislamiento por aplicación superadas.'
