-- DERMAPEX · 05 · Almacenamiento de documentos de visita (Supabase Storage).
--
-- Bucket PRIVADO 'visit-documents' (constante VISIT_DOCUMENT_BUCKET del frontend).
-- Ruta obligatoria: visits/<visit_id>/<uuid>.pdf. Acceso por centro a través de la visita.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-documents', 'visit-documents', false, 6291456, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Extrae el visit_id de la ruta; null si la ruta no tiene el formato esperado.
create or replace function app_private.visit_id_from_document_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^visits/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+\.pdf$'
      then split_part(p_name, '/', 2)::uuid
    else null
  end;
$$;

-- El borrado del objeto se permite si ningún registro de visit_documents lo atribuye a OTRO usuario
-- (cubre el rollback del frontend cuando falla el alta en BD) o si es coordinación.
create or replace function app_private.can_delete_document_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_coordinator()
      or not exists (
        select 1 from public.visit_documents d
         where d.stored_file_path = p_name and d.uploaded_by <> auth.uid()
      );
$$;

revoke all on function app_private.visit_id_from_document_path(text) from public;
revoke all on function app_private.can_delete_document_object(text) from public;
grant execute on function app_private.visit_id_from_document_path(text) to authenticated;
grant execute on function app_private.can_delete_document_object(text) to authenticated;

create policy visit_documents_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'visit-documents'
    and app_private.can_access_visit(app_private.visit_id_from_document_path(name))
  );

create policy visit_documents_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'visit-documents'
    and app_private.can_access_visit(app_private.visit_id_from_document_path(name))
  );

create policy visit_documents_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'visit-documents'
    and app_private.can_access_visit(app_private.visit_id_from_document_path(name))
    and app_private.can_delete_document_object(name)
  );
