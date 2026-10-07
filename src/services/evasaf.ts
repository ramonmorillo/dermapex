/**
 * EVASAF: encuesta de satisfacción con la atención farmacéutica recibida en las consultas de farmacia
 * hospitalaria (Monje-Agudo P, et al. Farm Hosp. 2015;39(3):152-156). 10 ítems Likert 1-5
 * (1 = muy deficiente, 5 = excelente) + comentarios abiertos (no recogidos aquí).
 *
 * El artículo de validación no define una puntuación total. PROVISIONAL (pendiente de confirmar por el IP):
 * se guardan los 10 ítems en bruto y, como resumen descriptivo, la media de los 10 ítems (rango 1-5),
 * solo si están todos contestados.
 */

export const EVASAF_ITEMS: Array<{ key: string; text: string }> = [
  { key: "q1", text: "Conozco mejor los medicamentos que utilizo." },
  { key: "q2", text: "Sé qué medicamentos puedo tomar y cuáles no por las interacciones que puedan existir. Mi farmacéutico me pregunta por mi medicación domiciliaria." },
  { key: "q3", text: "Soy más consciente de la importancia de cumplir mi tratamiento para ser adherente." },
  { key: "q4", text: "Tengo mayores conocimientos sobre las reacciones adversas que pueden provocar mis medicamentos." },
  { key: "q5", text: "He logrado reducir las reacciones adversas de los medicamentos que tomo gracias a una mejor explicación sobre el manejo de los mismos." },
  { key: "q6", text: "Siento la implicación de mi farmacéutico en mi problema de salud." },
  { key: "q7", text: "Continuaría visitando la consulta de AF para seguir en el programa de seguimiento de mis medicamentos." },
  { key: "q8", text: "Solicitaría a mi médico que continúe trabajando conjuntamente con mi farmacéutico porque confío en él." },
  { key: "q9", text: "La AF prestada se lleva a cabo de forma privada." },
  { key: "q10", text: "Estoy satisfecho con el servicio que recibo." },
];

export const EVASAF_SCALE: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { value: 1, label: "Muy deficiente" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "Excelente" },
];

export type EvasafScore = { sum: number | null; mean: number | null; answered: number };

export function scoreEvasaf(responses: Record<string, unknown>): EvasafScore {
  let sum = 0;
  let answered = 0;
  for (const item of EVASAF_ITEMS) {
    const value = responses[item.key];
    if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
      sum += value;
      answered += 1;
    }
  }
  if (answered < EVASAF_ITEMS.length) return { sum: null, mean: null, answered };
  return { sum, mean: Number((sum / EVASAF_ITEMS.length).toFixed(2)), answered };
}
