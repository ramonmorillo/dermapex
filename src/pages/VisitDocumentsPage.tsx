import { useParams } from 'react-router-dom';

import { VisitTabs } from '../components/common/VisitTabs';
import { VisitDocumentsPanel } from '../features/visit-documents/VisitDocumentsPanel';

export function VisitDocumentsPage() {
  const { visitId = '' } = useParams();

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Documentos de visita</h1>
        <VisitTabs visitId={visitId} active="documents" />
      </section>

      <VisitDocumentsPanel visitId={visitId} />
    </div>
  );
}
