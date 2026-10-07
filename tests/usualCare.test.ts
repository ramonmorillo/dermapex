import { describe, expect, test } from "vitest";

import { countRealInterventions, interventionRecordStatus } from "../src/services/exportService";
import { availableUsualCareOptions, type UsualCareActivity } from "../src/services/usualCareService";

const item = (id: string, extra: Partial<UsualCareActivity> = {}): UsualCareActivity => ({
  id,
  code: id,
  label: id,
  category: "seguimiento",
  is_no_intervention: false,
  catalog_version: "af-estandar-0.1-borrador",
  sort_order: 1,
  is_active: true,
  ...extra,
});

const catalog = [item("a"), item("b"), item("retirada", { is_active: false }), item("none", { is_no_intervention: true, category: null })];

describe("listado de AF estándar", () => {
  test("visita sin registros: todas las activas, incluida «Sin intervención»", () => {
    expect(availableUsualCareOptions(catalog, []).map((o) => o.id)).toEqual(["a", "b", "none"]);
  });

  test("una actividad registrada desaparece y «Sin intervención» deja de estar disponible", () => {
    expect(availableUsualCareOptions(catalog, ["a"]).map((o) => o.id)).toEqual(["b"]);
  });

  test("visita «Sin intervención»: no se ofrece nada más", () => {
    expect(availableUsualCareOptions(catalog, ["none"])).toEqual([]);
  });

  test("al corregir el único registro se ofrecen todas, incluida la suya", () => {
    expect(availableUsualCareOptions(catalog, ["none"], "none").map((o) => o.id)).toEqual(["a", "b", "none"]);
    expect(availableUsualCareOptions(catalog, ["a", "b"], "a").map((o) => o.id)).toEqual(["a"]);
  });
});

describe("recuento de intervenciones exportado", () => {
  test("distingue sin registro, sin intervención y con intervención", () => {
    expect(interventionRecordStatus([])).toBe("sin_registro");
    expect(interventionRecordStatus([{ usual_care_code: "sin-intervencion" }])).toBe("sin_intervencion");
    expect(interventionRecordStatus([{ usual_care_code: "conciliacion" }, { usual_care_code: null }])).toBe("con_intervencion");
    expect(countRealInterventions([{ usual_care_code: "sin-intervencion" }])).toBe(0);
    expect(countRealInterventions([{ usual_care_code: "conciliacion" }, { usual_care_code: null }])).toBe(2);
  });
});
