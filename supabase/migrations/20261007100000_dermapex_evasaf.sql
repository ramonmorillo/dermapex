-- DERMAPEX · EVASAF (satisfacción con la atención farmacéutica; Monje-Agudo et al., Farm Hosp 2015)
-- en visita basal y mes 12 para todos los pacientes (decisión IP 2026-10-07).
-- 10 ítems Likert 1-5 guardados en bruto; resumen provisional = media de los 10 ítems (el artículo de
-- validación no define puntuación total). Idempotente.

insert into public.questionnaire_measurement_map (questionnaire_code, label, instrument_version)
values ('EVASAF', 'EVASAF – Satisfacción con la atención farmacéutica', 'Farm Hosp 2015;39(3):152-6 (10 ítems)')
on conflict (questionnaire_code) do nothing;
