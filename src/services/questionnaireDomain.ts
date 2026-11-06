import { DLQI_BAND_LABEL, scoreDlqi } from "./dlqi";
import { scoreEvasaf } from "./evasaf";
import { POEM_BAND_LABEL, PRURITUS_NRS_VARIANT_LABEL, scorePoem, scorePruritusNrs } from "./atopicDermatitisPro";

export type QuestionnaireType = "iexpac" | "morisky" | "eq5d" | "pam10" | "dlqi" | "evasaf" | "poem" | "pruritus_nrs";

export const CANONICAL_QUESTIONNAIRE_CODE: Record<QuestionnaireType, string> = {
  iexpac: "IEXPAC",
  morisky: "MORISKY_GREEN",
  eq5d: "EQ5D_5L",
  pam10: "PAM10",
  dlqi: "DLQI",
  evasaf: "EVASAF",
  poem: "POEM",
  pruritus_nrs: "PRURITUS_NRS",
};

export type QuestionnaireScores = {
  totalScore: number | null;
  secondaryScore: number | null;
};

export type QuestionnaireTrace = {
  id: string;
  patient_id: string | null;
  visit_id: string;
  visit_type: string;
  questionnaire_type: QuestionnaireType;
};

export type QuestionnaireResult = QuestionnaireTrace & {
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
};

export function normalizeQuestionnaireCode(
  raw: unknown,
): QuestionnaireType | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();

  if (value === "iexpac") return "iexpac";
  if (
    value === "morisky" ||
    value === "morisky-green" ||
    value === "morisky_green"
  )
    return "morisky";
  if (
    value === "eq5d" ||
    value === "eq-5d" ||
    value === "eq5d-5l" ||
    value === "eq_5d" ||
    value === "eq5d_5l"
  )
    return "eq5d";
  if (value === "pam10" || value === "pam-10" || value === "pam_10")
    return "pam10";
  if (value === "dlqi") return "dlqi";
  if (value === "evasaf") return "evasaf";
  if (value === "poem") return "poem";
  if (value === "pruritus_nrs") return "pruritus_nrs";

  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function deriveQuestionnaireScores(
  questionnaireType: QuestionnaireType,
  responses: Record<string, unknown>,
): QuestionnaireScores {
  if (questionnaireType === "iexpac") {
    let sum = 0;
    for (let index = 1; index <= 11; index += 1) {
      const value = parseNumber(responses[`q${index}`]);
      if (value === null || value < 1 || value > 5) {
        return { totalScore: null, secondaryScore: parseNumber(responses.q12) };
      }
      sum += value;
    }

    return {
      totalScore: Number(((10 * (sum - 11)) / 44).toFixed(2)),
      secondaryScore: parseNumber(responses.q12),
    };
  }

  if (questionnaireType === "evasaf") {
    // totalScore = media de los 10 ítems (1-5; provisional); secondaryScore = suma (10-50).
    const evasaf = scoreEvasaf(responses);
    return { totalScore: evasaf.mean, secondaryScore: evasaf.sum };
  }

  if (questionnaireType === "dlqi") {
    // secondaryScore = número de ítems sin contestar (con 2 o más no se puntúa).
    const dlqi = scoreDlqi(responses);
    return { totalScore: dlqi.total, secondaryScore: dlqi.missingItems };
  }

  if (questionnaireType === "poem") {
    // totalScore = 0-28 solo con los 7 ítems; secondaryScore = ítems sin respuesta válida.
    const poem = scorePoem(responses);
    return { totalScore: poem.total, secondaryScore: poem.missingItems };
  }

  if (questionnaireType === "pruritus_nrs") {
    return { totalScore: scorePruritusNrs(responses).score, secondaryScore: null };
  }

  if (questionnaireType === "morisky") {
    const { q1, q2, q3, q4 } = responses;
    if ([q1, q2, q3, q4].every((value) => typeof value === "boolean")) {
      const adherent =
        q1 === false && q2 === true && q3 === false && q4 === false;
      return { totalScore: adherent ? 1 : 0, secondaryScore: null };
    }
    return { totalScore: null, secondaryScore: null };
  }

  if (questionnaireType === "pam10") {
    let sum = 0;
    for (let index = 1; index <= 10; index += 1) {
      const value = parseNumber(responses[`q${index}`]);
      if (value === null || value < 1 || value > 5) {
        return { totalScore: null, secondaryScore: null };
      }
      sum += value;
    }
    return { totalScore: sum, secondaryScore: null };
  }

  return { totalScore: null, secondaryScore: parseNumber(responses.vas) };
}

/**
 * Cuestionarios obligatorios en la visita basal y en la de mes 12 (aviso de la ficha de paciente).
 * POEM y NRS de prurito se añaden el 2026-11-06 (protocolo DERMAPEX). PAM-10 sigue sin ser obligatorio.
 */
export const REQUIRED_VISIT_QUESTIONNAIRES: readonly QuestionnaireType[] = [
  "iexpac",
  "dlqi",
  "evasaf",
  "morisky",
  "eq5d",
  "poem",
  "pruritus_nrs",
];

/**
 * ¿El registro cuenta como cuestionario cumplimentado? Para los instrumentos previos basta con que
 * exista (criterio vigente). POEM exige los 7 ítems (un borrador no tiene puntuación) y la NRS un
 * valor registrado (un registro sin puntuación es dato ausente, no 0).
 */
export function isQuestionnaireRecordComplete(
  questionnaireType: QuestionnaireType,
  responses: Record<string, unknown>,
): boolean {
  if (questionnaireType === "poem") return scorePoem(responses).complete;
  if (questionnaireType === "pruritus_nrs") return scorePruritusNrs(responses).score !== null;
  return true;
}

/** Instrumentos obligatorios que faltan (o están incompletos) entre los registros de una visita. */
export function missingRequiredQuestionnaires(
  records: Array<{ questionnaire_type: QuestionnaireType; responses: Record<string, unknown> }>,
): QuestionnaireType[] {
  const completed = new Set(
    records.filter((r) => isQuestionnaireRecordComplete(r.questionnaire_type, r.responses ?? {})).map((r) => r.questionnaire_type),
  );
  return REQUIRED_VISIT_QUESTIONNAIRES.filter((type) => !completed.has(type));
}

export function validateQuestionnaireTrace<T extends QuestionnaireTrace>(
  records: T[],
  expected: { visitId: string; patientId: string; visitType: string },
): { data: T[]; errorMessage: string | null } {
  const mismatched = records.filter(
    (record) =>
      record.visit_id !== expected.visitId ||
      record.patient_id !== expected.patientId ||
      record.visit_type !== expected.visitType,
  );

  if (mismatched.length > 0) {
    return {
      data: [],
      errorMessage:
        "Se bloqueó el informe porque existen respuestas que no corresponden al paciente o al momento de seguimiento de esta visita.",
    };
  }

  const seen = new Set<QuestionnaireType>();
  for (const record of records) {
    if (seen.has(record.questionnaire_type)) {
      return {
        data: [],
        errorMessage:
          "Se bloqueó el informe porque existe más de una respuesta del mismo cuestionario para esta visita.",
      };
    }
    seen.add(record.questionnaire_type);
  }

  return { data: records, errorMessage: null };
}

export function formatQuestionnaireResult(result: QuestionnaireResult): string {
  if (result.questionnaire_type === "iexpac") {
    const total =
      result.total_score === null
        ? "no calculable"
        : `${result.total_score}/10`;
    const q12 =
      result.secondary_score === null
        ? ""
        : ` · ítem 12 (tras alta hospitalaria): ${result.secondary_score}/5`;
    return `IEXPAC (experiencia de atención) · puntuación global: ${total}${q12}`;
  }

  if (result.questionnaire_type === "evasaf") {
    const mean = result.total_score === null ? "no calculable" : `${result.total_score}/5`;
    return `EVASAF (satisfacción con la atención farmacéutica) · media de los 10 ítems: ${mean}`;
  }

  if (result.questionnaire_type === "dlqi") {
    const dlqi = scoreDlqi(result.responses);
    if (dlqi.total === null) {
      return `DLQI (calidad de vida dermatológica) · no puntuable (${dlqi.missingItems} ítems sin contestar)`;
    }
    return `DLQI (calidad de vida dermatológica) · ${dlqi.total}/30 · ${dlqi.band ? DLQI_BAND_LABEL[dlqi.band] : ""}`;
  }

  if (result.questionnaire_type === "poem") {
    const poem = scorePoem(result.responses);
    if (poem.total === null) {
      return `POEM (síntomas del eccema, 7 días) · no puntuable (${poem.missingItems} ítems sin contestar)`;
    }
    return `POEM (síntomas del eccema, 7 días) · ${poem.total}/28 · ${poem.band ? POEM_BAND_LABEL[poem.band] : ""}`;
  }

  if (result.questionnaire_type === "pruritus_nrs") {
    const nrs = scorePruritusNrs(result.responses);
    const variant = nrs.variant ? PRURITUS_NRS_VARIANT_LABEL[nrs.variant] ?? nrs.variant : "variante no registrada";
    return `NRS de prurito (${variant}) · ${nrs.score === null ? "no registrada" : `${nrs.score}/10`}`;
  }

  if (result.questionnaire_type === "morisky") {
    const outcome =
      result.total_score === 1
        ? "adherente"
        : result.total_score === 0
          ? "no adherente"
          : "no calculable";
    return `Morisky-Green (adherencia terapéutica) · resultado: ${outcome}`;
  }

  if (result.questionnaire_type === "eq5d") {
    const profile =
      typeof result.responses.profile === "string"
        ? result.responses.profile
        : "no disponible";
    const vas =
      result.secondary_score === null
        ? "no disponible"
        : `${result.secondary_score}/100`;
    return `EQ-5D-5L (calidad de vida) · perfil: ${profile} · EVA de salud: ${vas}`;
  }

  const total =
    result.total_score === null ? "no calculable" : `${result.total_score}/50`;
  return `PAM-10 (activación del paciente) · puntuación bruta: ${total}`;
}
