/**
 * DLQI (Dermatology Life Quality Index), versión castellano de 10 ítems, periodo de recuerdo 7 días.
 * Reglas de puntuación según Cardiff University (página oficial del DLQI):
 *   · Mucho = 3, Bastante = 2, Un poco = 1, Nada = 0; «Sin relación» = 0.
 *   · Ítem 7: si la enfermedad le ha impedido trabajar/estudiar = 3; si no, la pregunta siguiente
 *     puntúa Bastante = 2, Un poco = 1, Nada = 0.
 *   · Un único ítem sin contestar puntúa 0; con 2 o más sin contestar el cuestionario no se puntúa.
 *   · Total 0-30. Bandas: 0-1 sin efecto, 2-5 pequeño, 6-10 moderado, 11-20 muy grande, 21-30 extremo.
 * PENDIENTE: licencia de uso (Cardiff) y confirmar el texto con la versión española oficial.
 */

export const DLQI_NOT_RELEVANT = "nr" as const;

/** Respuesta de un ítem general: 0-3 o «Sin relación». */
export type DlqiItemAnswer = 0 | 1 | 2 | 3 | typeof DLQI_NOT_RELEVANT;

export const DLQI_SEVERITY_OPTIONS: Array<{ value: 0 | 1 | 2 | 3; label: string }> = [
  { value: 3, label: "Mucho" },
  { value: 2, label: "Bastante" },
  { value: 1, label: "Un poco" },
  { value: 0, label: "Nada" },
];

export const DLQI_Q7B_OPTIONS: Array<{ value: 0 | 1 | 2; label: string }> = [
  { value: 2, label: "Bastante" },
  { value: 1, label: "Un poco" },
  { value: 0, label: "Nada" },
];

/** Texto del cuestionario aportado por el IP (2026-10-07). Ítem 7 se modela aparte. */
export const DLQI_ITEMS: Array<{ key: string; text: string; allowsNotRelevant: boolean }> = [
  { key: "q1", text: "Durante los últimos 7 días, ¿ha sentido picor, dolor o escozor en la piel?", allowsNotRelevant: false },
  { key: "q2", text: "Durante los últimos 7 días, ¿se ha sentido incómodo/a o cohibido/a debido a sus problemas de piel?", allowsNotRelevant: false },
  { key: "q3", text: "Durante los últimos 7 días, ¿le han molestado sus problemas de piel para hacer la compra u ocuparse de la casa (o del jardín)?", allowsNotRelevant: true },
  { key: "q4", text: "Durante los últimos 7 días, ¿han influido sus problemas de piel en la elección de la ropa que lleva?", allowsNotRelevant: true },
  { key: "q5", text: "Durante los últimos 7 días, ¿han influido sus problemas de piel en cualquier actividad social o recreativa?", allowsNotRelevant: true },
  { key: "q6", text: "Durante los últimos 7 días, ¿ha tenido dificultades para hacer deporte debido a sus problemas de piel?", allowsNotRelevant: true },
  { key: "q8", text: "Durante los últimos 7 días, ¿sus problemas de piel le han ocasionado dificultades con su pareja, amigos íntimos o familiares?", allowsNotRelevant: true },
  { key: "q9", text: "Durante los últimos 7 días, ¿le han molestado sus problemas de piel en su vida sexual?", allowsNotRelevant: true },
  { key: "q10", text: "Durante los últimos 7 días, ¿el tratamiento de su piel le ha ocasionado problemas, por ejemplo ocupándole demasiado tiempo o ensuciando su domicilio?", allowsNotRelevant: true },
];

export const DLQI_Q7_TEXT = "Durante los últimos 7 días, ¿sus problemas de piel le han impedido totalmente trabajar o estudiar?";
export const DLQI_Q7B_TEXT = "Si la respuesta es «No»: durante los últimos 7 días, ¿le han molestado sus problemas de piel en su trabajo o en sus estudios?";

export type DlqiBand = "sin_efecto" | "pequeno" | "moderado" | "muy_grande" | "extremo";

export const DLQI_BAND_LABEL: Record<DlqiBand, string> = {
  sin_efecto: "Sin efecto sobre la vida del paciente",
  pequeno: "Efecto pequeño",
  moderado: "Efecto moderado",
  muy_grande: "Efecto muy grande",
  extremo: "Efecto extremadamente grande",
};

export function dlqiBand(total: number | null): DlqiBand | null {
  if (total === null || !Number.isFinite(total)) return null;
  if (total <= 1) return "sin_efecto";
  if (total <= 5) return "pequeno";
  if (total <= 10) return "moderado";
  if (total <= 20) return "muy_grande";
  return "extremo";
}

function itemScore(value: unknown, allowsNotRelevant: boolean): number | null {
  if (value === DLQI_NOT_RELEVANT && allowsNotRelevant) return 0;
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  return null;
}

/** Ítem 7: q7 = 'yes' | 'no' | 'nr'; si 'no', q7b = 0-2. */
function item7Score(q7: unknown, q7b: unknown): number | null {
  if (q7 === "yes") return 3;
  if (q7 === DLQI_NOT_RELEVANT) return 0;
  if (q7 === "no" && (q7b === 0 || q7b === 1 || q7b === 2)) return q7b;
  return null;
}

export type DlqiScore = { total: number | null; missingItems: number; band: DlqiBand | null };

export function scoreDlqi(responses: Record<string, unknown>): DlqiScore {
  let total = 0;
  let missingItems = 0;
  for (const item of DLQI_ITEMS) {
    const score = itemScore(responses[item.key], item.allowsNotRelevant);
    if (score === null) missingItems += 1;
    else total += score;
  }
  const seven = item7Score(responses.q7, responses.q7b);
  if (seven === null) missingItems += 1;
  else total += seven;

  if (missingItems >= 2) return { total: null, missingItems, band: null };
  return { total, missingItems, band: dlqiBand(total) };
}
