import { describe, expect, test } from "vitest";

import { EVASAF_ITEMS, scoreEvasaf } from "../src/services/evasaf";
import { deriveQuestionnaireScores, normalizeQuestionnaireCode } from "../src/services/questionnaireDomain";

const all = (value: number) => Object.fromEntries(EVASAF_ITEMS.map((item) => [item.key, value]));

describe("EVASAF", () => {
  test("10 ítems, como el instrumento", () => {
    expect(EVASAF_ITEMS).toHaveLength(10);
  });

  test("media y suma con los 10 ítems contestados", () => {
    expect(scoreEvasaf(all(5))).toEqual({ sum: 50, mean: 5, answered: 10 });
    expect(scoreEvasaf({ ...all(4), q10: 1 })).toEqual({ sum: 37, mean: 3.7, answered: 10 });
  });

  test("con algún ítem sin contestar o fuera de rango no se resume", () => {
    expect(scoreEvasaf({ ...all(3), q9: undefined })).toEqual({ sum: null, mean: null, answered: 9 });
    expect(scoreEvasaf({ ...all(3), q1: 6 }).mean).toBeNull();
  });

  test("integrado en el dominio de cuestionarios", () => {
    expect(normalizeQuestionnaireCode("EVASAF")).toBe("evasaf");
    expect(deriveQuestionnaireScores("evasaf", all(2))).toEqual({ totalScore: 2, secondaryScore: 20 });
  });
});
