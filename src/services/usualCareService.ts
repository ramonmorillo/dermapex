import { supabase } from '../lib/supabase';

/**
 * Listado neutro de actividades de atención farmacéutica estándar (cohorte comparadora).
 * Versión en BD: usual_care_activity_catalog (migración 20261007090100). PROPUESTA pendiente de
 * validación por el IP; no reproduce las tarjetas del catálogo CMO para no contaminar el comparador.
 */
export const USUAL_CARE_CATALOG_VERSION = 'af-estandar-0.1-borrador';

export type UsualCareCategory = 'seguimiento' | 'educacion' | 'coordinacion';

export type UsualCareActivity = {
  id: string;
  code: string;
  label: string;
  category: UsualCareCategory | null;
  is_no_intervention: boolean;
  catalog_version: string;
  sort_order: number;
  is_active: boolean;
};

export const USUAL_CARE_CATEGORY_LABEL: Record<UsualCareCategory, string> = {
  seguimiento: 'Seguimiento',
  educacion: 'Educación',
  coordinacion: 'Coordinación',
};

export async function listUsualCareCatalog(
  catalogVersion: string = USUAL_CARE_CATALOG_VERSION,
): Promise<{ data: UsualCareActivity[]; errorMessage: string | null }> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };
  const { data, error } = await supabase
    .from('usual_care_activity_catalog')
    .select('id,code,label,category,is_no_intervention,catalog_version,sort_order,is_active')
    .eq('catalog_version', catalogVersion)
    .order('sort_order', { ascending: true });
  if (error) return { data: [], errorMessage: error.message };
  return { data: (data ?? []) as UsualCareActivity[], errorMessage: null };
}

/**
 * Opciones seleccionables en una visita, con las mismas reglas que impone la BD:
 * cada actividad una sola vez por visita; «Sin intervención» es excluyente con el resto.
 * `editingItemId`: actividad del registro que se está corrigiendo (sigue disponible para él).
 */
export function availableUsualCareOptions(
  catalog: UsualCareActivity[],
  registeredItemIds: Array<string | null | undefined>,
  editingItemId: string | null = null,
): UsualCareActivity[] {
  const others = registeredItemIds.filter((id): id is string => Boolean(id) && id !== editingItemId);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const otherIsNone = others.some((id) => byId.get(id)?.is_no_intervention);
  if (otherIsNone) return [];
  const taken = new Set(others);
  return catalog.filter(
    (item) => item.is_active && !taken.has(item.id) && !(item.is_no_intervention && others.length > 0),
  );
}
