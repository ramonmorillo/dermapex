import { supabase } from '../lib/supabase';
import type { CmoLevel } from './cmoScoringEngine';

// Catálogo CMO de intervenciones versionado en la base de datos (intervention_catalog, D7/D8).
// La RLS solo lo devuelve a coordinación y a miembros de centros de la cohorte CMO (D5).

export type CmoPillar = 'capacidad' | 'motivacion' | 'oportunidad';

export type InterventionCatalogItem = {
  id: string;
  code: string;
  label: string;
  cmo_pillar: CmoPillar;
  category: string | null;
  tier: string | null;
  recommended_levels: CmoLevel[];
  min_level: CmoLevel;
  catalog_version: string;
  sort_order: number | null;
  is_active: boolean;
};

const CATALOG_SELECT = 'id,code,label,cmo_pillar,category,tier,recommended_levels,min_level,catalog_version,sort_order,is_active';

export async function listInterventionCatalog(
  catalogVersion: string,
): Promise<{ data: InterventionCatalogItem[]; errorMessage: string | null }> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };

  const { data, error } = await supabase
    .from('intervention_catalog')
    .select(CATALOG_SELECT)
    .eq('catalog_version', catalogVersion)
    .order('sort_order', { ascending: true });
  if (error) return { data: [], errorMessage: error.message };
  return { data: (data ?? []) as InterventionCatalogItem[], errorMessage: null };
}

/** D8: una tarjeta se recomienda para un nivel si ese nivel está en recommended_levels (1 = máxima prioridad). */
export function filterCatalogForLevel(items: InterventionCatalogItem[], level: CmoLevel | null, showAll: boolean): InterventionCatalogItem[] {
  const active = items.filter((item) => item.is_active);
  if (showAll || level === null) return active;
  return active.filter((item) => item.recommended_levels.includes(level));
}
