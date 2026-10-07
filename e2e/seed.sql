-- SOLO PARA PRUEBAS LOCALES (prueba de humo e2e). Datos 100 % ficticios.
-- Rol de conexión de PostgREST (como en Supabase: authenticator → anon/authenticated).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end $$;
grant anon, authenticated to authenticator;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-e2e0-4000-8000-000000000001', 'cmo@e2e.test', '{"full_name":"Farmacéutica centro CMO (ficticia)"}'),
  ('bbbbbbbb-e2e0-4000-8000-000000000001', 'estandar@e2e.test', '{"full_name":"Farmacéutico centro estándar (ficticio)"}'),
  ('cccccccc-e2e0-4000-8000-000000000001', 'coordinacion@e2e.test', '{"full_name":"Coordinación (ficticia)"}');

-- Autorización explícita a DERMAPEX (migración 20261007130000).
insert into app_private.app_access (user_id, app_code, is_active)
select id, 'dermapex', true from auth.users;

update public.profiles set must_change_password = false;
update public.profiles set role = 'coordinator' where id = 'cccccccc-e2e0-4000-8000-000000000001';

insert into public.centers (id, code, name, study_arm, study_number) values
  ('11111111-e2e0-4000-8000-000000000001', 'E2E-CMO', 'Centro ficticio cohorte CMO', 'cmo', 1),
  ('11111111-e2e0-4000-8000-000000000002', 'E2E-STD', 'Centro ficticio cohorte estándar', 'standard', 2);
insert into public.center_memberships (profile_id, center_id) values
  ('aaaaaaaa-e2e0-4000-8000-000000000001', '11111111-e2e0-4000-8000-000000000001'),
  ('bbbbbbbb-e2e0-4000-8000-000000000001', '11111111-e2e0-4000-8000-000000000002');

insert into public.patients (id, center_id, study_code, inclusion_date, age_at_inclusion, sex, consent_signed, created_by) values
  ('a0000000-e2e0-4000-8000-000000000001', '11111111-e2e0-4000-8000-000000000001', 'E2E-CMO-001', '2026-10-01', 34, 'female', true, 'aaaaaaaa-e2e0-4000-8000-000000000001'),
  ('b0000000-e2e0-4000-8000-000000000001', '11111111-e2e0-4000-8000-000000000002', 'E2E-STD-001', '2026-10-01', 58, 'male', true, 'bbbbbbbb-e2e0-4000-8000-000000000001');
insert into public.visits (id, patient_id, visit_type, visit_number, visit_date, visit_status, created_by) values
  ('a1000000-e2e0-4000-8000-000000000001', 'a0000000-e2e0-4000-8000-000000000001', 'baseline', 1, '2026-10-01', 'completed', 'aaaaaaaa-e2e0-4000-8000-000000000001'),
  ('b1000000-e2e0-4000-8000-000000000001', 'b0000000-e2e0-4000-8000-000000000001', 'baseline', 1, '2026-10-01', 'completed', 'bbbbbbbb-e2e0-4000-8000-000000000001');
