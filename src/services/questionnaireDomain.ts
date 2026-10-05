export type QuestionnaireType = "iexpac" | "morisky" | "eq5d" | "pam10";

export const CANONICAL_QUESTIONNAIRE_CODE: Record<QuestionnaireType, string> = {
  iexpac: "IEXPAC",
  morisky: "MORISKY_GREEN",
  eq5d: "EQ5D_5L",
  pam10: "PAM10",
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
        : ` · ítem adicional: ${result.secondary_score}/5`;
    return `IEXPAC (experiencia de atención) · puntuación global: ${total}${q12}`;
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
