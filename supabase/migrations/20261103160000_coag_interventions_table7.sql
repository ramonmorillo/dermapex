-- COAMO · 11 · Actuaciones de AF de Prioridad 1 (Tabla 7 del modelo CMO de coagulopatías, SEFH v2.0).
--
-- Fuente: Tabla 7 «Definición de las actuaciones de AF en pacientes de Prioridad 1» (pp. 24-25), aportada por el
-- investigador en imagen legible el 03/11/2026 y transcrita literalmente (pendiente de cotejo).
-- La Tabla 7 repite, con el mismo texto, todas las actuaciones de las Tablas 5 y 6 (ya cargadas con prioridad 1 en
-- applies_to_priorities, migración 20261103150000) y añade 7 propias de Prioridad 1, que se cargan aquí.
-- Con esta migración el catálogo de Prioridad 1 queda completo (31 actuaciones). Aditiva: solo inserta en el catálogo.

insert into public.coag_intervention_catalog (code, catalog_version, domain, applies_to_priorities, source_table, sort_order, action_text) values
('SFT-08', 'CMO-COAG-SEFH-v2.0-T7', 'pharmacotherapeutic_followup', '{1}', 'Tabla 7', 8, 'Crear planes específicos para abordar rápidamente cualquier reacción adversa al tratamiento, asegurando vías rápidas de comunicación entre niveles asistenciales y entre los diferentes servicios del hospital, especialmente con el servicio de urgencias hospitalarias.'),
('SFT-09', 'CMO-COAG-SEFH-v2.0-T7', 'pharmacotherapeutic_followup', '{1}', 'Tabla 7', 9, 'Desarrollar programas específicos orientados a la detección, prevención o control de factores de riesgo relacionados con las coagulopatías congénitas.'),
('EDU-10', 'CMO-COAG-SEFH-v2.0-T7', 'patient_education', '{1}', 'Tabla 7', 10, 'Ofrecer programas intensivos de educación sanitaria para pacientes de alta prioridad, incluyendo sesiones regulares y materiales educativos avanzados.'),
('COO-09', 'CMO-COAG-SEFH-v2.0-T7', 'care_coordination', '{1}', 'Tabla 7', 9, 'Elaborar informes periódicos (telefónicos, registros en HCE o en sesiones multidisciplinares) para informar al equipo multidisciplinar sobre los casos de pacientes prioritarios.'),
('COO-10', 'CMO-COAG-SEFH-v2.0-T7', 'care_coordination', '{1}', 'Tabla 7', 10, 'Trabajar conjuntamente y participar en los equipos de gestión de casos para la discusión y abordaje específico de estos pacientes.'),
('COO-11', 'CMO-COAG-SEFH-v2.0-T7', 'care_coordination', '{1}', 'Tabla 7', 11, 'Desarrollar un plan de acción entre niveles asistenciales y con los distintos servicios del hospital que puedan estar involucrados (hematología, cirugía, urgencias, traumatología, anestesia, otros) para abordar las reacciones adversas al tratamiento y situaciones clínicas específicas, como procedimientos quirúrgicos programados o urgentes, estableciendo vías de comunicación rápida y efectiva.'),
('COO-12', 'CMO-COAG-SEFH-v2.0-T7', 'care_coordination', '{1}', 'Tabla 7', 12, 'Desarrollar un plan de acción con el Servicio de Urgencias Hospitalarias.');

comment on table public.coag_intervention_catalog is
  'Actuaciones de AF del modelo CMO de coagulopatías (SEFH v2.0), Tablas 5 (P3), 6 (P2) y 7 (P1), acumulativas, transcritas literalmente de las imágenes aportadas (pendiente de cotejo).';
