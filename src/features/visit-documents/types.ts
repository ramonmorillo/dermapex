export const VISIT_DOCUMENT_BUCKET = 'visit-documents';

export const VISIT_DOCUMENT_TYPES = [
  'lab_report',
  'ecg',
  'hospital_discharge',
  'specialist_report',
  'imaging',
  'map',
  'prescription',
  'other',
] as const;

export type VisitDocumentType = (typeof VISIT_DOCUMENT_TYPES)[number];

export type VisitDocumentRecord = {
  id: string;
  visit_id: string;
  uploaded_by: string;
  original_file_name: string;
  stored_file_path: string;
  mime_type: string;
  file_size: number;
  document_type: VisitDocumentType;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceResult<T> = {
  data: T;
  errorMessage: string | null;
};

export type UploadVisitDocumentInput = {
  visitId: string;
  file: File;
  documentType: VisitDocumentType;
  notes?: string | null;
};

export type UploadVisitDocumentResult = ServiceResult<VisitDocumentRecord | null>;

export type ListVisitDocumentsResult = ServiceResult<VisitDocumentRecord[]>;

export type GetVisitDocumentSignedUrlResult = ServiceResult<string | null>;

export type DeleteVisitDocumentResult = {
  success: boolean;
  errorMessage: string | null;
};
