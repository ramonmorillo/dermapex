// Identidad institucional de DERMAPEX.
// Los campos en null dependen de documentos fuente aún no aportados. No completar con datos inventados.
// Aprobación ética: dictamen favorable del CEI Sevilla Sur (portal SICEIA) de 27/10/2026. Dictamen, promotor
// e IP comunicados por el IP el 2026-10-28.

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
  /** Fecha del dictamen favorable (ISO YYYY-MM-DD). */
  ethicsApprovalDate: string | null;
} = {
  projectTitle:
    'Mejora de la experiencia del paciente con dermatitis atópica moderada-grave mediante la implementación de un modelo de atención farmacéutica CMO-MAPEX',
  sponsor: 'FISEVI',
  principalInvestigator: 'Ramón Morillo',
  ethicsCommittee: 'CEI Sevilla Sur',
  ethicsApprovalCode: 'SICEIA-2026-003487',
  ethicsApprovalDate: '2026-10-27',
};

/** Fecha del dictamen en formato DD/MM/AAAA, o null. */
export function getEthicsApprovalDateLabel(): string | null {
  const iso = PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalDate;
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

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
