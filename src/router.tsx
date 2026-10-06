import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { ConfirmEmailLinkPage } from './pages/ConfirmEmailLinkPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NewPatientPage } from './pages/NewPatientPage';
import { NewVisitPage } from './pages/NewVisitPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';
import { ProjectPage } from './pages/ProjectPage';
import { PublicInfoPage } from './pages/PublicInfoPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { VisitInterventionsPage } from './pages/VisitInterventionsPage';
import { VisitMedicationsPage } from './pages/VisitMedicationsPage';
import { VisitQuestionnairesPage } from './pages/VisitQuestionnairesPage';
import { VisitDocumentsPage } from './pages/VisitDocumentsPage';
import { VisitReportsPage } from './pages/VisitReportsPage';
import { VisitStratificationPage } from './pages/VisitStratificationPage';

export const router = createHashRouter([
  {
    path: '/',
    element: <LoginPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/confirm',
    element: <ConfirmEmailLinkPage />,
  },
  {
    path: '/set-password',
    element: <SetPasswordPage />,
  },
  ...['/legal', '/privacy', '/security', '/cookies'].map((path) => ({
    path,
    element: <PublicInfoPage />,
  })),
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/patients', element: <PatientsPage /> },
      { path: '/patients/new', element: <NewPatientPage /> },
      { path: '/project', element: <ProjectPage /> },
      { path: '/patients/:id', element: <PatientDetailPage /> },
      { path: '/patients/:id/visits/new', element: <NewVisitPage /> },
      { path: '/patients/:id/visits/:visitId', element: <NewVisitPage /> },
      { path: '/visits/:visitId/stratification', element: <VisitStratificationPage /> },
      { path: '/visits/:visitId/medications', element: <VisitMedicationsPage /> },
      { path: '/visits/:visitId/interventions', element: <VisitInterventionsPage /> },
      { path: '/visits/:visitId/questionnaires', element: <VisitQuestionnairesPage /> },
      { path: '/visits/:visitId/documents', element: <VisitDocumentsPage /> },
      { path: '/visits/:visitId/reports', element: <VisitReportsPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);
