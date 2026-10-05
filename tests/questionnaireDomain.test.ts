import { describe, expect, test } from "vitest";

import {
  deriveQuestionnaireScores,
  formatQuestionnaireResult,
  validateQuestionnaireTrace,
  type QuestionnaireResult,
} from "../src/services/questionnaireDomain.ts";

function result(
  overrides: Partial<QuestionnaireResult> = {},
): QuestionnaireResult {
  return {
    id: "response-1",
    patient_id: "patient-a",
    visit_id: "visit-baseline-a",
    visit_type: "baseline",
    questionnaire_type: "iexpac",
    responses: {},
    total_score: 5,
    secondary_score: null,
    ...overrides,
  };
}

describe("questionnaire report integrity", () => {
  test("accepts only responses from the exact patient, visit and follow-up moment", () => {
    const records = [
      result(),
      result({ id: "response-2", questionnaire_type: "morisky" }),
    ];
    const checked = validateQuestionnaireTrace(records, {
      visitId: "visit-baseline-a",
      patientId: "patient-a",
      visitType: "baseline",
    });

    expect(checked.errorMessage).toBeNull();
    expect(checked.data).toEqual(records);
  });

  test("blocks a response belonging to another patient", () => {
    const checked = validateQuestionnaireTrace(
      [result({ patient_id: "patient-b" })],
      {
        visitId: "visit-baseline-a",
        patientId: "patient-a",
        visitType: "baseline",
      },
    );

    expect(checked.data).toHaveLength(0);
    expect(checked.errorMessage).toMatch(/paciente o al momento/);
  });

  test("blocks a response belonging to another visit or follow-up moment", () => {
    const wrongVisit = validateQuestionnaireTrace(
      [result({ visit_id: "visit-month-12-a" })],
      {
        visitId: "visit-baseline-a",
        patientId: "patient-a",
        visitType: "baseline",
      },
    );
    const wrongMoment = validateQuestionnaireTrace(
      [result({ visit_type: "month_12" })],
      {
        visitId: "visit-baseline-a",
        patientId: "patient-a",
        visitType: "baseline",
      },
    );

    expect(wrongVisit.errorMessage).not.toBeNull();
    expect(wrongMoment.errorMessage).not.toBeNull();
  });

  test("blocks duplicate questionnaires within the same visit", () => {
    const checked = validateQuestionnaireTrace(
      [result(), result({ id: "response-2" })],
      {
        visitId: "visit-baseline-a",
        patientId: "patient-a",
        visitType: "baseline",
      },
    );

    expect(checked.data).toHaveLength(0);
    expect(checked.errorMessage).toMatch(/más de una respuesta/);
  });

  test("calculates and labels every questionnaire with its correct scale", () => {
    const iexpacResponses = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`q${index + 1}`, 3]),
    );
    const iexpac = deriveQuestionnaireScores("iexpac", {
      ...iexpacResponses,
      q12: 4,
    });
    const morisky = deriveQuestionnaireScores("morisky", {
      q1: false,
      q2: true,
      q3: false,
      q4: false,
    });
    const eq5d = deriveQuestionnaireScores("eq5d", { vas: 82 });
    const pam10 = deriveQuestionnaireScores(
      "pam10",
      Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [`q${index + 1}`, 4]),
      ),
    );

    expect(iexpac).toEqual({ totalScore: 5, secondaryScore: 4 });
    expect(morisky).toEqual({ totalScore: 1, secondaryScore: null });
    expect(eq5d).toEqual({ totalScore: null, secondaryScore: 82 });
    expect(pam10).toEqual({ totalScore: 40, secondaryScore: null });

    expect(
      formatQuestionnaireResult(
        result({
          total_score: iexpac.totalScore,
          secondary_score: iexpac.secondaryScore,
        }),
      ),
    ).toMatch(/5\/10/);
    expect(
      formatQuestionnaireResult(
        result({
          questionnaire_type: "morisky",
          total_score: morisky.totalScore,
        }),
      ),
    ).toMatch(/adherente/);
    expect(
      formatQuestionnaireResult(
        result({
          questionnaire_type: "eq5d",
          responses: { profile: "12345" },
          secondary_score: 82,
          total_score: null,
        }),
      ),
    ).toMatch(/12345.*82\/100/);
    expect(
      formatQuestionnaireResult(
        result({ questionnaire_type: "pam10", total_score: pam10.totalScore }),
      ),
    ).toMatch(/40\/50/);
  });
});
