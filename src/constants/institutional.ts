// Identidad institucional de DERMAPEX.
// Los campos en null dependen del protocolo oficial (promotor, investigador principal, centros
// participantes). No completar con datos inventados: dejar en null hasta disponer del documento fuente.
// Aprobación ética: dictamen favorable del CEI Sevilla Sur (portal SICEIA), comunicado por el IP el 2026-10-28.

export const PROJECT_IDENTITY = {
  name: 'DERMAPEX',
  subtitle: 'Modelo CMO-MAPEX en dermatitis atópica',
} as const;

export const PROJECT_INSTITUTIONAL_REFERENCE: {
  /** Título de la investigación tal como figura en la aprobación del comité de ética. */
  projectTitle: string;
  sponsor: string | null;
  principalInvestigator: string | null;
  ethicsCommittee: string | null;
  ethicsApprovalCode: string | null;
} = {
  projectTitle:
    'Mejora de la experiencia del paciente con dermatitis atópica moderada-grave mediante la implementación de un modelo de atención farmacéutica CMO-MAPEX',
  sponsor: null,
  principalInvestigator: null,
  ethicsCommittee: 'CEI Sevilla Sur',
  ethicsApprovalCode: 'SICEIA-2026-003487',
};

/** «CEI Sevilla Sur · SICEIA-2026-003487», o null si aún no hay código de aprobación. */
export function getEthicsApprovalText(): string | null {
  const { ethicsCommittee, ethicsApprovalCode } = PROJECT_INSTITUTIONAL_REFERENCE;
  if (!ethicsApprovalCode) return null;
  return ethicsCommittee ? `${ethicsCommittee} · ${ethicsApprovalCode}` : ethicsApprovalCode;
}

export const PENDING_PROTOCOL_LABEL = 'Pendiente de protocolo';

const ETHICS_FOOTER = getEthicsApprovalText();

export const PROJECT_SHORT_FOOTER = [
  `${PROJECT_IDENTITY.name} · ${PROJECT_IDENTITY.subtitle} · Estudio prospectivo multicéntrico`,
  ETHICS_FOOTER ? `Aprobado por el ${ETHICS_FOOTER}` : null,
]
  .filter(Boolean)
  .join(' · ');
