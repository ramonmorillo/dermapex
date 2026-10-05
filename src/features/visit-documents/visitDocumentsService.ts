import { supabase } from '../../lib/supabase';
import {
  VISIT_DOCUMENT_BUCKET,
  VISIT_DOCUMENT_TYPES,
  type DeleteVisitDocumentResult,
  type GetVisitDocumentSignedUrlResult,
  type ListVisitDocumentsResult,
  type UploadVisitDocumentInput,
  type UploadVisitDocumentResult,
  type VisitDocumentRecord,
  type VisitDocumentType,
} from './types';

const MAX_PDF_SIZE_BYTES = 6 * 1024 * 1024;
const SIGNED_URL_EXPIRATION_SECONDS = 60 * 10;

function extractErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallbackMessage;
}

function validateVisitDocumentType(value: string): value is VisitDocumentType {
  return VISIT_DOCUMENT_TYPES.includes(value as VisitDocumentType);
}

function normalizeVisitDocument(record: VisitDocumentRecord): VisitDocumentRecord {
  return {
    ...record,
    document_type: validateVisitDocumentType(record.document_type) ? record.document_type : 'other',
    notes: record.notes ?? null,
  };
}

function validatePdf(file: File): string | null {
  const fileNameLower = file.name.toLowerCase();
  const hasPdfExtension = fileNameLower.endsWith('.pdf');
  const hasPdfMimeType = file.type === 'application/pdf';

  if (!hasPdfExtension || !hasPdfMimeType) {
    return 'Solo se permiten archivos PDF válidos.';
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return 'El archivo supera el tamaño máximo permitido de 6 MB.';
  }

  return null;
}

function buildStoragePath(visitId: string): string {
  return `visits/${visitId}/${crypto.randomUUID()}.pdf`;
}

async function getAuthenticatedUserId(): Promise<{ userId: string | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      userId: null,
      errorMessage: 'Supabase no está configurado. No se puede identificar el usuario actual.',
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      userId: null,
      errorMessage: 'Usuario no autenticado. Inicia sesión e inténtalo de nuevo.',
    };
  }

  return { userId: user.id, errorMessage: null };
}

export async function listVisitDocuments(visitId: string): Promise<ListVisitDocumentsResult> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar documentos de la visita.',
    };
  }

  const { data, error } = await supabase
    .from('visit_documents')
    .select('*')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible listar los documentos de la visita.'),
    };
  }

  const documents = (data ?? []).map((item) => normalizeVisitDocument(item as VisitDocumentRecord));
  return { data: documents, errorMessage: null };
}

export async function uploadVisitDocument(input: UploadVisitDocumentInput): Promise<UploadVisitDocumentResult> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede subir el documento.',
    };
  }

  const validationError = validatePdf(input.file);
  if (validationError) {
    return { data: null, errorMessage: validationError };
  }

  const authResult = await getAuthenticatedUserId();
  if (authResult.errorMessage || !authResult.userId) {
    return { data: null, errorMessage: authResult.errorMessage };
  }

  const storagePath = buildStoragePath(input.visitId);

  const { error: uploadError } = await supabase.storage
    .from(VISIT_DOCUMENT_BUCKET)
    .upload(storagePath, input.file, {
      upsert: false,
      contentType: 'application/pdf',
    });

  if (uploadError) {
    return {
      data: null,
      errorMessage: extractErrorMessage(uploadError, 'No fue posible subir el archivo al almacenamiento.'),
    };
  }

  const { data: insertData, error: insertError } = await supabase
    .from('visit_documents')
    .insert({
      visit_id: input.visitId,
      uploaded_by: authResult.userId,
      original_file_name: input.file.name,
      stored_file_path: storagePath,
      mime_type: 'application/pdf',
      file_size: input.file.size,
      document_type: input.documentType,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select('*')
    .maybeSingle();

  if (insertError) {
    await supabase.storage.from(VISIT_DOCUMENT_BUCKET).remove([storagePath]);

    return {
      data: null,
      errorMessage: extractErrorMessage(
        insertError,
        'El archivo se subió, pero falló el registro en base de datos. Se hizo rollback del archivo.',
      ),
    };
  }

  return {
    data: normalizeVisitDocument(insertData as VisitDocumentRecord),
    errorMessage: null,
  };
}

export async function getVisitDocumentSignedUrl(documentId: string): Promise<GetVisitDocumentSignedUrlResult> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede abrir el documento.',
    };
  }

  const { data: document, error: documentError } = await supabase
    .from('visit_documents')
    .select('stored_file_path')
    .eq('id', documentId)
    .maybeSingle();

  if (documentError) {
    return {
      data: null,
      errorMessage: extractErrorMessage(documentError, 'No fue posible consultar el documento solicitado.'),
    };
  }

  if (!document?.stored_file_path) {
    return {
      data: null,
      errorMessage: 'No se encontró el archivo asociado al documento.',
    };
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(VISIT_DOCUMENT_BUCKET)
    .createSignedUrl(document.stored_file_path, SIGNED_URL_EXPIRATION_SECONDS);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return {
      data: null,
      errorMessage: extractErrorMessage(signedUrlError, 'No fue posible generar un enlace temporal para el documento.'),
    };
  }

  return { data: signedUrlData.signedUrl, errorMessage: null };
}

export async function deleteVisitDocument(documentId: string): Promise<DeleteVisitDocumentResult> {
  if (!supabase) {
    return {
      success: false,
      errorMessage: 'Supabase no está configurado. No se puede eliminar el documento.',
    };
  }

  const { data: document, error: findError } = await supabase
    .from('visit_documents')
    .select('stored_file_path')
    .eq('id', documentId)
    .maybeSingle();

  if (findError) {
    return {
      success: false,
      errorMessage: extractErrorMessage(findError, 'No fue posible localizar el documento a eliminar.'),
    };
  }

  if (!document?.stored_file_path) {
    return {
      success: false,
      errorMessage: 'El documento no existe o no tiene ruta de archivo asociada.',
    };
  }

  const { error: deleteDbError } = await supabase.from('visit_documents').delete().eq('id', documentId);

  if (deleteDbError) {
    return {
      success: false,
      errorMessage: extractErrorMessage(deleteDbError, 'No fue posible eliminar el registro del documento.'),
    };
  }

  const { error: deleteStorageError } = await supabase.storage
    .from(VISIT_DOCUMENT_BUCKET)
    .remove([document.stored_file_path]);

  if (deleteStorageError) {
    return {
      success: false,
      errorMessage:
        'El registro se eliminó, pero no se pudo borrar el archivo físico. Contacta con soporte para limpieza del almacenamiento.',
    };
  }

  return { success: true, errorMessage: null };
}
