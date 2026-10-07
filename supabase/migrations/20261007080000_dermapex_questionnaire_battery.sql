-- Habilita la batería de cuestionarios de la pantalla de visita en questionnaire_measurement_map.
-- Decisión del IP (2026-10-07): se habilitan los cuatro instrumentos de la pantalla actual.
--   IEXPAC        : versión ©2015 castellano, 15 ítems (1-11 generales; 12-15 condicionados).
--                   Puntuación global = 10·(Σ ítems 1-11 − 11)/44; ítems 12-15 se registran en bruto.
--                   Regla de puntuación pendiente de verificar contra el manual oficial.
--   MORISKY_GREEN, EQ5D_5L, PAM10: heredados de IRIS; pendiente de confirmar versión y licencia.
-- Idempotente: no modifica filas ya existentes (conserva los measurement_id ya asignados).

insert into public.questionnaire_measurement_map (questionnaire_code, label, instrument_version)
values
  ('IEXPAC', 'IEXPAC – Experiencia del paciente crónico', 'IEXPAC ©2015 castellano (15 ítems)'),
  ('MORISKY_GREEN', 'Morisky-Green (4 ítems)', 'heredado IRIS – pendiente de validar'),
  ('EQ5D_5L', 'EQ-5D-5L', 'heredado IRIS – pendiente de validar'),
  ('PAM10', 'PAM-10', 'heredado IRIS – pendiente de validar')
on conflict (questionnaire_code) do nothing;
