-- DERMAPEX · 11 · Retirada del módulo «Proceso» (decisión de la IP, 2026-10-06).
--
-- visit_process_records (tiempo de sesión, costes, abandono…) procedía de la tesis RCV de IRIS
-- (auditoría R3) y no forma parte de DERMAPEX. La aplicación ya no lo usa. Verificado antes de
-- eliminarla en el proyecto Supabase: 0 filas, 0 entradas de auditoría, sin claves foráneas ni vistas
-- que dependan de ella. Se usa RESTRICT (sin CASCADE): si apareciera una dependencia inesperada, la
-- migración falla en lugar de arrastrarla.
-- Con la tabla desaparecen sus triggers (autoría, updated_at, coherencia visita-paciente, auditoría) y
-- sus políticas RLS. Las entradas históricas de audit_log, si las hubiera, se conservan (sin FK).

drop table public.visit_process_records restrict;

-- Solo la usaba trg_visit_process_records_patient_match.
drop function app_private.enforce_visit_patient_match() restrict;
