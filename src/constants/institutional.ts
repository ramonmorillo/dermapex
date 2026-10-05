// Identidad institucional de DERMAPEX.
// PROVISIONAL: los campos marcados como pendientes dependen del protocolo oficial
// (promotor, investigador principal, centros participantes, código de aprobación del CEIm).
// No completar con datos inventados: dejar en null hasta disponer del documento fuente.

export const PROJECT_IDENTITY = {
  name: 'DERMAPEX',
  subtitle: 'Modelo CMO-MAPEX en dermatitis atópica',
} as const;

export const PROJECT_INSTITUTIONAL_REFERENCE: {
  projectTitle: string;
  sponsor: string | null;
  principalInvestigator: string | null;
  ethicsApprovalCode: string | null;
} = {
  projectTitle: `${PROJECT_IDENTITY.name} · ${PROJECT_IDENTITY.subtitle}`,
  sponsor: null,
  principalInvestigator: null,
  ethicsApprovalCode: null,
};

export const PENDING_PROTOCOL_LABEL = 'Pendiente de protocolo';

export const PROJECT_SHORT_FOOTER = `${PROJECT_IDENTITY.name} · ${PROJECT_IDENTITY.subtitle} · Estudio prospectivo multicéntrico`;
