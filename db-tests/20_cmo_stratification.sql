-- SOLO PARA PRUEBAS LOCALES. Estratificación CMO-DERMAPEX: cohortes por centro (D5), guardado
-- atómico verificado en servidor, visibilidad de resultados, inmutabilidad del modelo, catálogo de
-- intervenciones (D7/D8) y auditoría. Se ejecuta después de 10_rls_and_integrity.sql (reutiliza sus
-- funciones auxiliares y la cuenta de coordinación C).

\set ON_ERROR_STOP on
\set QUIET on

-- Respuestas completas: todas «No»/«ninguna» salvo las indicadas como «si» o «unknown».
create function dermapex_test.answers(p_yes text[] default '{}', p_unknown text[] default '{}', p_overrides jsonb default '{}')
returns jsonb language sql stable as $$
  select jsonb_object_agg(
           variable_code,
           case
             when variable_code = any (p_unknown) then 'unknown'
             when variable_code = any (p_yes) then 'si'
             when value_type = 'select' then 'ninguna'
             else 'no'
           end
         ) || p_overrides
    from public.cmo_variable_catalog
   where model_version = 'cmo-derma-model-1.0.0+src.227e444' and value_type <> 'derived_age';
$$;

create function dermapex_test.save(p_visit uuid, p_answers jsonb, p_total numeric, p_level smallint, p_reason text default 'baseline')
returns uuid language sql as $$
  select public.save_cmo_stratification(p_visit, p_reason, 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-1.0.0+src.227e444', p_answers, p_total, p_level);
$$;

grant execute on all functions in schema dermapex_test to anon, authenticated;

-- ── Datos de partida ────────────────────────────────────────────────────────
-- M1: investigador del centro CM (cohorte CMO) · S1: investigador del centro CS (cohorte estándar)
-- C: coordinación (creada en 10_*)

insert into auth.users (id, email) values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'm1@cm.test'),
  ('bbbbbbbb-1000-4000-8000-000000000001', 's1@cs.test');

-- ── Cohorte del centro (study_arm) ──────────────────────────────────────────

select dermapex_test.expect_fail($$insert into public.centers (code, name) values ('SINARM', 'Centro sin cohorte')$$, 'study_arm obligatoria en centros nuevos (también por SQL)');
select dermapex_test.expect_fail($$insert into public.centers (code, name, study_arm) values ('MALARM', 'Cohorte inválida', 'control')$$, 'study_arm solo admite cmo/standard');

begin;
select dermapex_test.as_user('aaaaaaaa-0000-4000-8000-000000000002');
select dermapex_test.expect_fail($$insert into public.centers (code, name, study_arm) values ('INV', 'Alta por investigador', 'cmo')$$, 'un investigador no puede crear centros ni asignar cohorte');
select dermapex_test.expect(dermapex_test.affected($$update public.centers set study_arm = 'standard' where code = 'C1'$$) = 0, 'un investigador no puede cambiar la cohorte de su centro');
commit;

begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
insert into public.centers (id, code, name, study_arm) values
  ('22222222-0000-4000-8000-000000000001', 'CM', 'Centro cohorte CMO', 'cmo'),
  ('22222222-0000-4000-8000-000000000002', 'CS', 'Centro cohorte estándar', 'standard'),
  ('22222222-0000-4000-8000-000000000003', 'CV', 'Centro vacío', 'cmo');
insert into public.center_memberships (profile_id, center_id) values
  ('aaaaaaaa-1000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001'),
  ('bbbbbbbb-1000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002');
-- Sin pacientes la cohorte aún puede corregirse.
update public.centers set study_arm = 'standard' where code = 'CV';
update public.centers set study_arm = 'cmo' where code = 'CV';
select dermapex_test.expect((select study_arm from public.centers where code = 'CV') = 'cmo', 'coordinación puede corregir la cohorte de un centro sin pacientes');
select dermapex_test.expect_fail($$update public.centers set study_arm = null where code = 'CV'$$, 'la cohorte no puede anularse una vez asignada');
commit;

-- Centro anterior a la migración (study_arm NULL): se simula desactivando el trigger.
alter table public.centers disable trigger trg_centers_study_arm;
insert into public.centers (id, code, name) values ('22222222-0000-4000-8000-000000000004', 'LEGACY', 'Centro previo sin cohorte');
alter table public.centers enable trigger trg_centers_study_arm;
insert into public.center_memberships (profile_id, center_id) values ('aaaaaaaa-1000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000004');

begin;
select dermapex_test.as_user('aaaaaaaa-1000-4000-8000-000000000001');
select dermapex_test.expect_fail($$insert into public.patients (study_code, center_id) values ('DPX-LEG-001', '22222222-0000-4000-8000-000000000004')$$, 'no se incluyen pacientes en un centro sin cohorte');
insert into public.patients (id, study_code, center_id, age_at_inclusion, sex) values
  ('a0000000-1000-4000-8000-000000000001', 'DPX-CM-001', '22222222-0000-4000-8000-000000000001', 45, 'female'),
  ('a0000000-1000-4000-8000-000000000002', 'DPX-CM-002', '22222222-0000-4000-8000-000000000001', null, 'male');
insert into public.visits (id, patient_id, visit_type, visit_date) values
  ('a1000000-1000-4000-8000-000000000001', 'a0000000-1000-4000-8000-000000000001', 'baseline', '2026-10-01'),
  ('a1000000-1000-4000-8000-000000000002', 'a0000000-1000-4000-8000-000000000001', 'month_6', '2027-04-01'),
  ('a1000000-1000-4000-8000-000000000003', 'a0000000-1000-4000-8000-000000000002', 'baseline', '2026-10-02');
commit;

begin;
select dermapex_test.as_user('bbbbbbbb-1000-4000-8000-000000000001');
insert into public.patients (id, study_code, center_id, age_at_inclusion, sex) values
  ('b0000000-1000-4000-8000-000000000001', 'DPX-CS-001', '22222222-0000-4000-8000-000000000002', 72, 'female');
insert into public.visits (id, patient_id, visit_type, visit_date) values
  ('b1000000-1000-4000-8000-000000000001', 'b0000000-1000-4000-8000-000000000001', 'baseline', '2026-10-03');
commit;

begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect_fail($$update public.centers set study_arm = 'standard' where code = 'CM'$$, 'coordinación no puede cambiar la cohorte de un centro con pacientes');
select dermapex_test.expect_fail($$update public.centers set study_arm = null where code = 'CS'$$, 'ni anularla');
update public.centers set study_arm = 'standard' where code = 'LEGACY';
select dermapex_test.expect((select study_arm from public.centers where code = 'LEGACY') = 'standard', 'primera asignación de cohorte a un centro previo');
commit;
select dermapex_test.expect_fail($$update public.centers set study_arm = 'standard' where code = 'CM'$$, 'tampoco por SQL (sin usuario de API) con pacientes');

select dermapex_test.expect(
  (select count(*) from public.audit_log
    where table_name = 'centers' and action = 'UPDATE' and actor_id = 'cccccccc-0000-4000-8000-000000000001'
      and old_data ->> 'study_arm' = 'standard' and new_data ->> 'study_arm' = 'cmo' and new_data ->> 'code' = 'CV') = 1,
  'la auditoría registra el cambio de cohorte (autor, valor anterior y nuevo)');

-- ── Centro de la cohorte CMO ────────────────────────────────────────────────
begin;
select dermapex_test.as_user('aaaaaaaa-1000-4000-8000-000000000001');

-- 45 años (2) + naïve (4) + adherencia (4) + polimedicación (3) + tabaquismo (2) + reciente (2) + mujer (1) = 18 → nivel 2
select dermapex_test.save('a1000000-1000-4000-8000-000000000001',
  dermapex_test.answers(array['naive_terapia', 'falta_adherencia', 'polimedicacion', 'tabaquismo', 'medicamento_reciente', 'sexo_mujer']), 18, 2::smallint);
select dermapex_test.expect((select score from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000001') = 18, 'CMO: el centro lee su puntuación');
select dermapex_test.expect((select priority from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000001') = 2, 'CMO: el centro lee su nivel (18 → nivel 2)');
select dermapex_test.expect(
  (select engine_version = 'cmo-dermapex-1.0.0+src.227e444' and model_version = 'cmo-derma-model-1.0.0+src.227e444'
          and stratification_reason = 'baseline' and not incomplete and not special_rule_applied
     from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000001'),
  'versiones de motor y modelo, motivo e indicadores guardados');
select dermapex_test.expect((select count(*) from public.cmo_score_item_results where visit_id = 'a1000000-1000-4000-8000-000000000001') = 28, 'una fila por variable (27 puntuables + informativa)');
select dermapex_test.expect(
  (select raw_value ->> 'value' = '18-69' and (raw_value ->> 'age')::int = 45 and item_score = 2
     from public.cmo_stratification_item_values where visit_id = 'a1000000-1000-4000-8000-000000000001' and variable_code = 'edad_grupo'),
  'edad derivada en servidor desde la ficha (45 → 18-69, 2 puntos)');
select dermapex_test.expect((select sum(item_score) from public.cmo_score_item_results where visit_id = 'a1000000-1000-4000-8000-000000000001') = 18, 'la suma de puntos por ítem coincide con el total');
select dermapex_test.expect(
  (select block_scores = '[{"block":"demografica","points":3},{"block":"sociosanitaria","points":2},{"block":"clinica","points":0},{"block":"farmacoterapeutica","points":13},{"block":"especifica","points":0}]'::jsonb
     from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000001'),
  'desglose por bloque');
select dermapex_test.expect((select score = 18 and priority = 2 and results_visible from public.cmo_stratification_registry where visit_id = 'a1000000-1000-4000-8000-000000000001'), 'CMO: la vista de registro muestra puntuación y nivel');

-- Regla especial de embarazo con puntuación baja → nivel 1.
select dermapex_test.save('a1000000-1000-4000-8000-000000000002', dermapex_test.answers(array['sexo_mujer', 'embarazada']), 6, 1::smallint, 'month_6');
select dermapex_test.expect((select priority = 1 and special_rule_applied and score = 6 from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000002'), 'embarazo con 6 puntos → nivel 1 (regla especial)');
select dermapex_test.expect_fail($$select dermapex_test.save('a1000000-1000-4000-8000-000000000002', dermapex_test.answers(array['sexo_mujer', 'deseo_embarazo']), 5, 3::smallint)$$, 'el servidor rechaza un nivel que ignora la regla especial');

-- Desconocidos (D1) e informativa (D3).
select dermapex_test.save('a1000000-1000-4000-8000-000000000002',
  dermapex_test.answers(array['tabaquismo'], array['falta_adherencia', 'embarazada'], '{"conservacion_especial":"si"}'), 4, 3::smallint, 'clinical_change');
select dermapex_test.expect(
  (select incomplete and unknown_variables = array['embarazada', 'falta_adherencia'] and score = 4 and not special_rule_applied and stratification_reason = 'clinical_change'
     from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000002'),
  'desconocido puntúa 0, marca incompleto y registra la lista; la informativa «Sí» no suma');
select dermapex_test.expect(
  (select raw_value ->> 'value' = 'si' and item_score = 0 and not is_scored
     from public.cmo_stratification_item_values where visit_id = 'a1000000-1000-4000-8000-000000000002' and variable_code = 'conservacion_especial'),
  'variable informativa guardada con 0 puntos');
select dermapex_test.expect((select count(*) from public.cmo_score_item_results where visit_id = 'a1000000-1000-4000-8000-000000000002') = 28, 'el nuevo guardado reemplaza los ítems (sin duplicados)');

-- Edad desconocida en la ficha → edad_grupo desconocida, 0 puntos.
select dermapex_test.save('a1000000-1000-4000-8000-000000000003', dermapex_test.answers(), 0, 3::smallint);
select dermapex_test.expect((select incomplete and unknown_variables = array['edad_grupo'] from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000003'), 'edad ausente → edad_grupo desconocida');

-- Verificación en servidor (nada se guarda si algo no cuadra).
select dermapex_test.expect_fail($$select dermapex_test.save('a1000000-1000-4000-8000-000000000003', dermapex_test.answers(array['tabaquismo']), 0, 3::smallint)$$, 'total del cliente distinto del recalculado → rechazo');
select dermapex_test.expect_fail($$select dermapex_test.save('a1000000-1000-4000-8000-000000000003', dermapex_test.answers() - 'tabaquismo', 0, 3::smallint)$$, 'falta una variable → rechazo (respuesta explícita obligatoria)');
select dermapex_test.expect_fail($$select dermapex_test.save('a1000000-1000-4000-8000-000000000003', dermapex_test.answers(array[]::text[], array[]::text[], '{"tabaquismo":"a veces"}'), 0, 3::smallint)$$, 'valor no admitido → rechazo');
select dermapex_test.expect_fail($$select dermapex_test.save('a1000000-1000-4000-8000-000000000003', dermapex_test.answers(array[]::text[], array[]::text[], '{"dolor_presente":"si"}'), 0, 3::smallint)$$, 'variable de otro subtipo (músculo-esquelética) → rechazo');
select dermapex_test.expect_fail($$select dermapex_test.save('a1000000-1000-4000-8000-000000000003', dermapex_test.answers(array[]::text[], array[]::text[], '{"edad_grupo":"≤12"}'), 0, 3::smallint)$$, 'la edad no se acepta del cliente');
select dermapex_test.expect_fail($$select public.save_cmo_stratification('a1000000-1000-4000-8000-000000000003', 'baseline', 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-0.9.0', dermapex_test.answers(), 0, 3::smallint)$$, 'versión de motor que no corresponde al modelo → rechazo');
select dermapex_test.expect_fail($$select public.save_cmo_stratification('a1000000-1000-4000-8000-000000000003', null, 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-1.0.0+src.227e444', dermapex_test.answers(), 0, 3::smallint)$$, 'motivo obligatorio (D6)');
select dermapex_test.expect_fail($$select public.save_cmo_stratification('a1000000-1000-4000-8000-000000000003', 'por si acaso', 'cmo-derma-model-1.0.0+src.227e444', 'cmo-dermapex-1.0.0+src.227e444', dermapex_test.answers(), 0, 3::smallint)$$, 'motivo fuera de la lista (D6)');
select dermapex_test.expect((select score from public.cmo_scores where visit_id = 'a1000000-1000-4000-8000-000000000003') = 0, 'los intentos rechazados no alteran lo guardado');

-- Sin escritura directa (solo vía la función).
select dermapex_test.expect_fail($$insert into public.cmo_scores (visit_id, score, priority, calculated_by) values ('a1000000-1000-4000-8000-000000000003', 99, 1, 'aaaaaaaa-1000-4000-8000-000000000001')$$, 'no se puede insertar una puntuación directamente');
select dermapex_test.expect_fail($$update public.cmo_scores set score = 99$$, 'no se puede modificar una puntuación directamente');
select dermapex_test.expect_fail($$update public.cmo_score_item_results set item_score = 9$$, 'no se puede modificar un ítem directamente');
select dermapex_test.expect(dermapex_test.affected($$delete from public.cmo_score_item_results$$) = 0, 'el centro no puede borrar ítems');

-- Aislamiento: no estratifica ni ve visitas del centro estándar.
select dermapex_test.expect_fail($$select dermapex_test.save('b1000000-1000-4000-8000-000000000001', dermapex_test.answers(), 2, 3::smallint)$$, 'no puede estratificar visitas de otro centro');
select dermapex_test.expect((select count(*) from public.cmo_stratification_registry where center_id = '22222222-0000-4000-8000-000000000002') = 0, 'no ve el registro de estratificaciones de otro centro');

-- Catálogo de intervenciones CMO e intervenciones vinculadas.
select dermapex_test.expect((select count(*) from public.intervention_catalog where catalog_version = 'cmoinmunomediadas@227e444-draft') = 20, 'centro CMO: ve las 20 tarjetas del catálogo');
insert into public.interventions (visit_id, intervention_type, intervention_domain, catalog_item_id, catalog_code, catalog_version, linked_to_cmo_level, delivered)
select 'a1000000-1000-4000-8000-000000000001', 'texto manipulado', 'Motivación', id, 'otro', 'v0', 2, true
  from public.intervention_catalog where code = 'seg-revision-conciliacion';
select dermapex_test.expect(
  (select intervention_type = 'Revisión, validación y conciliación del tratamiento completo (EI + concomitante)'
          and intervention_domain = 'Capacidad' and catalog_code = 'seg-revision-conciliacion'
          and catalog_version = 'cmoinmunomediadas@227e444-draft' and linked_to_cmo_level = 2
     from public.interventions where visit_id = 'a1000000-1000-4000-8000-000000000001'),
  'intervención de catálogo: texto, pilar, código y versión sellados desde el catálogo');
insert into public.interventions (visit_id, intervention_type, intervention_domain, linked_to_cmo_level)
values ('a1000000-1000-4000-8000-000000000001', 'Otra intervención libre', 'Oportunidad', 2);
select dermapex_test.expect((select catalog_code is null from public.interventions where intervention_type = 'Otra intervención libre'), '«Otra intervención (texto libre)» sin código de catálogo');
commit;

-- ── Centro de la cohorte estándar (comparador) ──────────────────────────────
begin;
select dermapex_test.as_user('bbbbbbbb-1000-4000-8000-000000000001');
-- 72 años (2) + naïve (4) + adherencia (4) + polimedicación (3) + interacciones (3) + RAM (3) + mujer (1)
--   + modificación (3) + alcohol (3) + barreras (3) + comorbilidades (2) = 31 → nivel 1
select dermapex_test.expect(
  dermapex_test.save('b1000000-1000-4000-8000-000000000001',
    dermapex_test.answers(array['naive_terapia', 'falta_adherencia', 'polimedicacion', 'interacciones', 'reacciones_adversas', 'sexo_mujer', 'modificacion_regimen', 'alcoholismo_drogas', 'barreras_comunicacion', 'comorbilidades_2mas']),
    31, 1::smallint) is not null,
  'estándar: el centro registra la estratificación (se calcula y se guarda)');
select dermapex_test.expect((select count(*) from public.cmo_scores) = 0, 'estándar: NO puede leer puntuación ni nivel (cmo_scores)');
select dermapex_test.expect((select count(*) from public.cmo_score_item_results) = 0, 'estándar: NO puede leer puntos por ítem');
select dermapex_test.expect(
  (select score is null and priority is null and special_rule_applied is null and block_scores is null and factors is null and not results_visible
          and stratification_reason = 'baseline' and engine_version = 'cmo-dermapex-1.0.0+src.227e444' and study_arm = 'standard'
     from public.cmo_stratification_registry where visit_id = 'b1000000-1000-4000-8000-000000000001'),
  'estándar: la vista de registro enmascara puntuación, nivel, regla y desglose');
select dermapex_test.expect(
  (select count(*) = 28 and bool_and(item_score is null) and count(*) filter (where raw_value ->> 'value' = 'si') = 10
     from public.cmo_stratification_item_values where visit_id = 'b1000000-1000-4000-8000-000000000001'),
  'estándar: ve los valores brutos registrados, nunca los puntos');
select dermapex_test.expect((select count(*) from public.intervention_catalog) = 0, 'estándar: NO ve el catálogo CMO de intervenciones');
select dermapex_test.expect_fail($$insert into public.interventions (visit_id, intervention_type, intervention_domain, linked_to_cmo_level) values ('b1000000-1000-4000-8000-000000000001', 'x', 'Capacidad', 1)$$, 'estándar: no registra intervenciones CMO');
select dermapex_test.expect((select count(*) from public.cmo_stratification_registry where center_id = '22222222-0000-4000-8000-000000000001') = 0, 'estándar: no ve estratificaciones del centro CMO');
commit;

-- ── Coordinación ────────────────────────────────────────────────────────────
begin;
select dermapex_test.as_user('cccccccc-0000-4000-8000-000000000001');
select dermapex_test.expect((select score = 31 and priority = 1 from public.cmo_scores where visit_id = 'b1000000-1000-4000-8000-000000000001'), 'coordinación ve puntuación y nivel del brazo estándar');
select dermapex_test.expect((select results_visible and score = 31 from public.cmo_stratification_registry where visit_id = 'b1000000-1000-4000-8000-000000000001'), 'coordinación: vista de registro sin enmascarar');
select dermapex_test.expect(
  (select count(*) from public.audit_log
    where table_name = 'cmo_scores' and action = 'INSERT' and actor_id = 'bbbbbbbb-1000-4000-8000-000000000001'
      and visit_id = 'b1000000-1000-4000-8000-000000000001' and center_id = '22222222-0000-4000-8000-000000000002') = 1,
  'auditoría: alta de estratificación con autor, visita y centro');
select dermapex_test.expect(
  (select count(*) from public.audit_log
    where table_name = 'cmo_scores' and action = 'UPDATE' and visit_id = 'a1000000-1000-4000-8000-000000000002'
      and (old_data ->> 'score')::numeric = 6 and (new_data ->> 'score')::numeric = 4) = 1,
  'auditoría: la reestratificación de una visita conserva el valor anterior');
select dermapex_test.expect((select count(*) from public.audit_log where table_name = 'cmo_score_item_results' and action = 'DELETE') >= 28, 'auditoría: el reemplazo de ítems queda registrado');

-- Inmutabilidad del modelo y del catálogo de intervenciones.
select dermapex_test.expect_fail($$update public.cmo_variable_catalog set options = '[{"value":"si","label":"Sí","points":9}]' where variable_code = 'tabaquismo'$$, 'los pesos del modelo no se pueden modificar');
select dermapex_test.expect_fail($$update public.cmo_model_versions set level1_min_score = 30$$, 'los umbrales del modelo no se pueden modificar');
select dermapex_test.expect_fail($$update public.intervention_catalog set label = 'Texto reescrito' where code = 'seg-control-adherencia'$$, 'los textos del catálogo de intervenciones no se pueden modificar');
update public.intervention_catalog set is_active = false where code = 'coord-asociaciones-pacientes';
update public.intervention_catalog set is_active = true where code = 'coord-asociaciones-pacientes';
select dermapex_test.expect(true, 'una tarjeta sí se puede retirar y reactivar (is_active)');
select dermapex_test.expect(
  (select min_level = 2 and recommended_levels = array[1, 2]::smallint[] from public.intervention_catalog where code = 'coord-servicios-sociales-psicologia'),
  'D8: min_level derivado = max(recommended_levels)');
select dermapex_test.expect_fail($$insert into public.intervention_catalog (code, label, cmo_pillar, min_level, catalog_version) values ('seg-control-adherencia', 'dup', 'motivacion', 3, 'cmoinmunomediadas@227e444-draft')$$, 'código único por versión de catálogo');
commit;

begin;
select dermapex_test.as_anon();
select dermapex_test.expect_fail('select * from public.cmo_stratification_registry', 'anon no lee el registro de estratificaciones');
select dermapex_test.expect_fail($$select public.save_cmo_stratification('a1000000-1000-4000-8000-000000000001', 'baseline', 'x', 'y', '{}', 0, 3::smallint)$$, 'anon no puede estratificar');
commit;

\echo 'DERMAPEX: todas las pruebas de estratificación CMO superadas.'
