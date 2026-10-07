// Transformación PURA (sin Deno ni red) de la respuesta de la API REST de CIMA (AEMPS) al formato que
// consume DERMAPEX. La usa index.ts (Edge Function) y la prueban tests/cimaMapping.test.ts.
//
// Endpoint: GET https://cima.aemps.es/cima/rest/medicamentos?...  →  { totalFilas, pagina, tamanioPagina,
// resultados: Medicamento[] }. El listado identifica cada medicamento por su NÚMERO DE REGISTRO
// (nregistro); el código nacional (cn) pertenece a cada presentación y normalmente NO viene en el listado.
// Campos de Medicamento usados (documentación CIMA REST): nregistro, nombre, pactivos, labtitular, estado,
// comerc, dosis, atcs[{codigo,nombre,nivel}], principiosActivos[{nombre,...}], vtm{nombre},
// viasAdministracion[{nombre}], formaFarmaceutica{nombre}, formaFarmaceuticaSimplificada{nombre},
// presentaciones[{cn,nombre}]. La lectura es tolerante: cualquier campo puede faltar.

export type CimaItem = Record<string, unknown>;

export type CimaMedicationDto = {
  id: string;
  source: 'external_cima_remote';
  source_label: string;
  cima_cn: string | null;
  cima_nregistro: string | null;
  cima_name: string;
  ingredient_names: string[];
  labtitular: string | null;
  pharmaceutical_form: string | null;
  pharmaceutical_form_simplified: string | null;
  routes: string[];
  atc_codes: string[];
  authorization_status: string | null;
  commercialized: boolean | null;
  vmpp: string | null;
  vmp: string | null;
  dose: string | null;
  raw_payload: CimaItem;
  fetched_at: string;
};

export function cleanString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Nombre de un objeto {nombre} o la propia cadena. */
function nameOf(value: unknown): string | null {
  return cleanString(asRecord(value)?.nombre ?? value);
}

function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(nameOf).filter((entry): entry is string => Boolean(entry));
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Códigos ATC (no nombres). Se priorizan los de nivel 5 (principio activo) y se conservan los demás. */
export function extractAtcCodes(item: CimaItem): string[] {
  const atcs = Array.isArray(item.atcs) ? item.atcs : [];
  const parsed = atcs
    .map((entry) => {
      const record = asRecord(entry);
      const code = cleanString(record?.codigo ?? entry);
      const level = Number(record?.nivel);
      return code ? { code: code.toUpperCase(), level: Number.isFinite(level) ? level : code.length >= 7 ? 5 : 0 } : null;
    })
    .filter((entry): entry is { code: string; level: number } => Boolean(entry))
    .sort((a, b) => b.level - a.level);
  const single = cleanString(item.atc);
  return dedupe([...parsed.map((entry) => entry.code), ...(single ? [single.toUpperCase()] : [])]);
}

/** Principios activos: principiosActivos[] → pactivos ("A, B") → vtm. */
export function extractIngredientNames(item: CimaItem): string[] {
  const fromList = namesOf(item.principiosActivos);
  if (fromList.length > 0) return dedupe(fromList);
  const pactivos = cleanString(item.pactivos);
  if (pactivos) return dedupe(pactivos.split(/\s*[,+;]\s*/).map((part) => part.trim()).filter(Boolean));
  const vtm = nameOf(item.vtm);
  return vtm ? [vtm] : [];
}

/** CN solo si el medicamento tiene UNA presentación (si hay varias, el CN es ambiguo y no se asigna). */
export function extractSingleCn(item: CimaItem): string | null {
  const direct = cleanString(item.cn);
  if (direct) return direct;
  const presentations = Array.isArray(item.presentaciones) ? item.presentaciones : [];
  if (presentations.length !== 1) return null;
  return cleanString(asRecord(presentations[0])?.cn);
}

function authorizationStatus(item: CimaItem): string | null {
  const estado = asRecord(item.estado);
  if (!estado) return cleanString(item.estado);
  if (estado.rev) return 'revocado';
  if (estado.susp) return 'suspendido';
  if (estado.aut) return 'autorizado';
  return null;
}

export function extractItems(responseData: unknown): CimaItem[] {
  if (Array.isArray(responseData)) {
    return responseData.filter((entry): entry is CimaItem => Boolean(asRecord(entry)));
  }
  const record = asRecord(responseData);
  if (!record) return [];
  for (const key of ['resultados', 'results', 'medicamentos', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter((entry): entry is CimaItem => Boolean(asRecord(entry)));
  }
  // /medicamento?cn=… devuelve un único objeto.
  return record.nregistro ? [record] : [];
}

export function normalizeCimaMedication(item: CimaItem, fetchedAt: string): CimaMedicationDto {
  const cimaNRegistro = cleanString(item.nregistro);
  const cimaCn = extractSingleCn(item);
  const cimaName = cleanString(item.nombre) ?? 'Medicamento CIMA';
  return {
    id: cimaNRegistro ?? cimaCn ?? cimaName,
    source: 'external_cima_remote',
    source_label: 'CIMA remoto',
    cima_cn: cimaCn,
    cima_nregistro: cimaNRegistro,
    cima_name: cimaName,
    ingredient_names: extractIngredientNames(item),
    labtitular: cleanString(item.labtitular),
    pharmaceutical_form: nameOf(item.formaFarmaceutica),
    pharmaceutical_form_simplified: nameOf(item.formaFarmaceuticaSimplificada),
    routes: dedupe(namesOf(item.viasAdministracion)),
    atc_codes: extractAtcCodes(item),
    authorization_status: authorizationStatus(item),
    commercialized: typeof item.comerc === 'boolean' ? item.comerc : null,
    vmpp: cleanString(item.vmpp),
    vmp: cleanString(item.vmp),
    dose: cleanString(item.dosis),
    raw_payload: item,
    fetched_at: fetchedAt,
  };
}

/**
 * Consultas a CIMA para un texto libre. Los farmacéuticos buscan tanto por nombre comercial como por
 * principio activo; CIMA los separa (nombre / practiv1), así que se consultan ambos. Un número de 6-7
 * dígitos se trata además como código nacional (cn).
 */
export function buildCimaSearchUrls(query: string): string[] {
  const base = 'https://cima.aemps.es/cima/rest/medicamentos';
  const make = (params: Record<string, string>) => {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('autorizados', '1');
    url.searchParams.set('comerc', '1');
    return url.toString();
  };
  const urls = [make({ nombre: query }), make({ practiv1: query })];
  if (/^\d{6,7}$/.test(query)) urls.unshift(make({ cn: query }));
  return urls;
}

/** Une resultados de varias consultas sin duplicar (por nregistro) y prioriza los comercializados. */
export function mergeCimaResults(lists: CimaMedicationDto[][], limit: number): CimaMedicationDto[] {
  const byId = new Map<string, CimaMedicationDto>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return [...byId.values()]
    .sort((a, b) => Number(b.commercialized === true) - Number(a.commercialized === true) || a.cima_name.localeCompare(b.cima_name, 'es'))
    .slice(0, limit);
}
