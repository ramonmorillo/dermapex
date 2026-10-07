-- DERMAPEX · DLQI en la primera y la última visita para todos los pacientes (ambas cohortes).
-- Puntuación (Cardiff University): ítems 0-3, «Sin relación» y un único ítem sin contestar = 0;
-- ítem 7: impide trabajar/estudiar = 3, si no 0-2; total 0-30; con 2+ ítems sin contestar no se puntúa.
-- Pendiente: licencia de uso (Cardiff) y versión española oficial. Idempotente.

insert into public.questionnaire_measurement_map (questionnaire_code, label, instrument_version)
values ('DLQI', 'DLQI – Dermatology Life Quality Index', 'castellano (10 ítems) – licencia pendiente')
on conflict (questionnaire_code) do nothing;
