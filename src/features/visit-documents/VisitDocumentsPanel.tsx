import { useEffect, useMemo, useRef, useState } from 'react';

import { getVisitDocumentTypeLabel } from './documentTypeLabels';
import { formatDocumentDate, formatDocumentSize } from './formatters';
import {
  deleteVisitDocument,
  getVisitDocumentSignedUrl,
  listVisitDocuments,
  uploadVisitDocument,
} from './visitDocumentsService';
import { VISIT_DOCUMENT_TYPES, type VisitDocumentRecord, type VisitDocumentType } from './types';

const MAX_PDF_SIZE_BYTES = 6 * 1024 * 1024;

type VisitDocumentsPanelProps = {
  visitId: string;
  currentUserId?: string | null;
  className?: string;
};

function validateSelectedFile(file: File | null): string | null {
  if (!file) {
    return 'Selecciona un archivo PDF antes de subirlo.';
  }

  const fileName = file.name.toLowerCase();
  const isPdfExtension = fileName.endsWith('.pdf');
  const isPdfMimeType = file.type === 'application/pdf';

  if (!isPdfExtension || !isPdfMimeType) {
    return 'El archivo seleccionado no es un PDF válido.';
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return 'El archivo supera el tamaño máximo permitido de 6 MB.';
  }

  return null;
}

function buildPanelClassName(className?: string): string {
  return className ? `card ${className}` : 'card';
}

export function VisitDocumentsPanel({ visitId, currentUserId, className }: VisitDocumentsPanelProps) {
  const [documents, setDocuments] = useState<VisitDocumentRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<VisitDocumentType>(VISIT_DOCUMENT_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [actionDocumentId, setActionDocumentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isUserKnownUnauthenticated = currentUserId === null;

  const uploadDisabled = useMemo(() => {
    if (isUploading || isLoadingList || isUserKnownUnauthenticated) {
      return true;
    }
    return !selectedFile;
  }, [isLoadingList, isUploading, isUserKnownUnauthenticated, selectedFile]);

  async function loadDocuments(): Promise<void> {
    setIsLoadingList(true);
    setErrorMessage(null);

    const result = await listVisitDocuments(visitId);
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setDocuments([]);
    } else {
      setDocuments(result.data);
    }

    setIsLoadingList(false);
  }

  useEffect(() => {
    void loadDocuments();
  }, [visitId]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (!file) {
      return;
    }

    const validationError = validateSelectedFile(file);
    if (validationError) {
      setSelectedFile(null);
      event.target.value = '';
      setErrorMessage(validationError);
    }
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isUserKnownUnauthenticated) {
      setErrorMessage('Tu sesión no está disponible. Inicia sesión de nuevo para subir documentos.');
      return;
    }

    const validationError = validateSelectedFile(selectedFile);
    if (validationError || !selectedFile) {
      setErrorMessage(validationError ?? 'Selecciona un archivo válido.');
      return;
    }

    setIsUploading(true);
    const result = await uploadVisitDocument({
      visitId,
      file: selectedFile,
      documentType,
      notes,
    });
    setIsUploading(false);

    if (result.errorMessage || !result.data) {
      setErrorMessage(result.errorMessage ?? 'No fue posible subir el documento.');
      return;
    }

    setSelectedFile(null);
    setDocumentType(VISIT_DOCUMENT_TYPES[0]);
    setNotes('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setSuccessMessage('Documento subido correctamente.');
    await loadDocuments();
  };

  const withSignedUrl = async (documentId: string): Promise<string | null> => {
    setActionDocumentId(documentId);
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = await getVisitDocumentSignedUrl(documentId);
    setActionDocumentId(null);

    if (result.errorMessage || !result.data) {
      setErrorMessage(result.errorMessage ?? 'No fue posible generar el enlace del documento.');
      return null;
    }

    return result.data;
  };

  const handleOpenDocument = async (document: VisitDocumentRecord) => {
    const signedUrl = await withSignedUrl(document.id);
    if (!signedUrl) {
      return;
    }

    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadDocument = async (documentToDownload: VisitDocumentRecord) => {
    const signedUrl = await withSignedUrl(documentToDownload.id);
    if (!signedUrl) {
      return;
    }

    const link = window.document.createElement('a');
    link.href = signedUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = documentToDownload.original_file_name;
    window.document.body.append(link);
    link.click();
    link.remove();
  };

  const handleDeleteDocument = async (documentToDelete: VisitDocumentRecord) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const confirmed = window.confirm(
      `¿Deseas eliminar el documento \"${documentToDelete.original_file_name}\"? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    setActionDocumentId(documentToDelete.id);
    const result = await deleteVisitDocument(documentToDelete.id);
    setActionDocumentId(null);

    if (!result.success || result.errorMessage) {
      setErrorMessage(result.errorMessage ?? 'No se pudo eliminar el documento.');
      return;
    }

    setSuccessMessage('Documento eliminado correctamente.');
    await loadDocuments();
  };

  return (
    <section className={buildPanelClassName(className)}>
      <div className="section-header">
        <h2>Documentos</h2>
      </div>

      <p className="help-text">
        Adjunta archivos PDF de esta visita clínica (máximo 6 MB por documento).
      </p>

      {errorMessage ? (
        <p className="error-state panel-notice" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="success-state panel-notice" role="status">
          {successMessage}
        </p>
      ) : null}

      <form className="form-grid" onSubmit={handleUpload}>
        <div className="grid-2">
          <label>
            Archivo PDF
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              disabled={isUploading || isUserKnownUnauthenticated}
            />
          </label>

          <label>
            Tipo documental
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as VisitDocumentType)}
              disabled={isUploading || isUserKnownUnauthenticated}
            >
              {VISIT_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getVisitDocumentTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Observaciones (opcional)
          <textarea
            rows={3}
            placeholder="Añade contexto clínico breve si aplica"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isUploading || isUserKnownUnauthenticated}
          />
        </label>

        {isUserKnownUnauthenticated ? (
          <p className="help-text">Necesitas iniciar sesión para subir o eliminar documentos.</p>
        ) : null}

        <div className="actions-inline">
          <button type="submit" disabled={uploadDisabled}>
            {isUploading ? 'Subiendo…' : 'Subir documento'}
          </button>
          {selectedFile ? (
            <span className="help-text">
              {selectedFile.name} · {formatDocumentSize(selectedFile.size)}
            </span>
          ) : null}
        </div>
      </form>

      <hr />

      {isLoadingList ? <p>Cargando documentos de la visita...</p> : null}

      {!isLoadingList && documents.length === 0 ? (
        <div className="empty-state">
          <h3>Todavía no hay documentos cargados.</h3>
          <p>
            Puedes empezar subiendo el primer PDF de esta visita.
          </p>
        </div>
      ) : null}

      {!isLoadingList && documents.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo documental</th>
                <th>Archivo</th>
                <th>Tamaño</th>
                <th>Observaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((item) => {
                const isActionRunning = actionDocumentId === item.id;

                return (
                  <tr key={item.id}>
                    <td>{formatDocumentDate(item.created_at)}</td>
                    <td>{getVisitDocumentTypeLabel(item.document_type)}</td>
                    <td>{item.original_file_name}</td>
                    <td>{formatDocumentSize(item.file_size)}</td>
                    <td>{item.notes?.trim() ? item.notes : '—'}</td>
                    <td>
                      <div className="actions-inline">
                        <button
                          type="button"
                          onClick={() => void handleOpenDocument(item)}
                          disabled={isActionRunning}
                        >
                          {isActionRunning ? 'Procesando…' : 'Abrir'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadDocument(item)}
                          disabled={isActionRunning}
                        >
                          Descargar
                        </button>
                        <button
                          type="button"
                          className="button-danger"
                          onClick={() => void handleDeleteDocument(item)}
                          disabled={isActionRunning || isUserKnownUnauthenticated}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/*
Ejemplo mínimo de uso en una página de visita (sin modificar rutas):

import { VisitDocumentsPanel } from '../features/visit-documents/VisitDocumentsPanel';

export function VisitDetailMockPage() {
  return (
    <div className="page-stack">
      <VisitDocumentsPanel
        visitId="a2fbc55f-3f8a-4a58-9df6-2fb7e6f1d21a"
        currentUserId="1f4f2e00-1111-2222-3333-444444444444"
      />
    </div>
  );
}
*/
