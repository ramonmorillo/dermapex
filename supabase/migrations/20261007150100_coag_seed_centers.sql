-- COAMO · 02 · Centros del estudio (decisión del IP 2026-10-07: 7 reclutadores + Valme consultor).
--
-- Fuente de los nombres: docs/coamo/COAMO_FUNCTIONAL_BLUEPRINT.md §3.2, que resume el protocolo
-- COAMO (P:9). No se ha cotejado con el protocolo original: VERIFICAR la denominación oficial.
-- Valme figura como centro consultor (apoyo metodológico, sin inclusión de pacientes).
--
-- PROVISIONAL Y EDITABLE por coordinación COAMO mientras el centro no tenga pacientes:
--   · name: denominación (completar con la oficial).
--   · code: identificador corto interno (no aparece en el código del paciente).
--   · study_number: número del centro en el futuro código de paciente COAMO-<n>-NNNN; asignado
--     aquí en el orden en que el blueprint enumera los centros. No procede del protocolo.
-- No se crean pertenencias ni usuarios: se asignan con coag_private.provision_user / assign_center.

insert into public.coag_centers (code, name, center_role, study_number) values
  ('LAFE',       'La Fe',                        'recruiting', 1),
  ('VHEBRON',    'Vall d''Hebron',               'recruiting', 2),
  ('LAPAZ',      'La Paz',                       'recruiting', 3),
  ('VROCIO',     'Virgen del Rocío',             'recruiting', 4),
  ('CANDELARIA', 'Nuestra Señora de Candelaria', 'recruiting', 5),
  ('CHUAC',      'CHU de La Coruña',             'recruiting', 6),
  ('BALMIS',     'Dr. Balmis',                   'recruiting', 7),
  ('VALME',      'Valme',                        'consulting', null);
