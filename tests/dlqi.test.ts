import { describe, expect, test } from "vitest";

import { dlqiBand, scoreDlqi } from "../src/services/dlqi";
import { deriveQuestionnaireScores, normalizeQuestionnaireCode } from "../src/services/questionnaireDomain";

const general = (value: number | "nr") => ({ q1: value === "nr" ? 0 : value, q2: value === "nr" ? 0 : value, q3: value, q4: value, q5: value, q6: value, q8: value, q9: value, q10: value });

describe("DLQI · reglas de puntuación (Cardiff University)", () => {
  test("máximo 30: todo «Mucho» e ítem 7 = impide trabajar", () => {
    expect(scoreDlqi({ ...general(3), q7: "yes" }).total).toBe(30);
  });

  test("mínimo 0: todo «Nada» y en el trabajo «Nada»", () => {
    expect(scoreDlqi({ ...general(0), q7: "no", q7b: 0 }).total).toBe(0);
  });

  test("«Sin relación» puntúa 0, también en el ítem 7", () => {
    expect(scoreDlqi({ ...general("nr"), q7: "nr" })).toEqual({ total: 0, missingItems: 0, band: "sin_efecto" });
  });

  test("ítem 7: «No» puntúa según la pregunta siguiente (Bastante = 2)", () => {
    expect(scoreDlqi({ ...general(1), q7: "no", q7b: 2 }).total).toBe(9 + 2);
  });

  test("ítem 7 «No» sin la pregunta siguiente cuenta como sin contestar", () => {
    expect(scoreDlqi({ ...general(1), q7: "no" })).toEqual({ total: 9, missingItems: 1, band: "moderado" });
  });

  test("un ítem sin contestar puntúa 0; dos o más → no puntuable", () => {
    const one = { ...general(2), q7: "yes" } as Record<string, unknown>;
    delete one.q1;
    expect(scoreDlqi(one)).toEqual({ total: 16 + 3, missingItems: 1, band: "muy_grande" });
    delete one.q2;
    expect(scoreDlqi(one)).toEqual({ total: null, missingItems: 2, band: null });
  });

  test("«Sin relación» no se admite en los ítems 1 y 2", () => {
    expect(scoreDlqi({ ...general(0), q1: "nr", q7: "nr" }).missingItems).toBe(1);
  });

  test("bandas de interpretación en sus límites", () => {
    expect([0, 1, 2, 5, 6, 10, 11, 20, 21, 30].map(dlqiBand)).toEqual([
      "sin_efecto", "sin_efecto", "pequeno", "pequeno", "moderado", "moderado", "muy_grande", "muy_grande", "extremo", "extremo",
    ]);
    expect(dlqiBand(null)).toBeNull();
  });

  test("integrado en el dominio de cuestionarios", () => {
    expect(normalizeQuestionnaireCode("DLQI")).toBe("dlqi");
    expect(deriveQuestionnaireScores("dlqi", { ...general(3), q7: "yes" })).toEqual({ totalScore: 30, secondaryScore: 0 });
  });
});
