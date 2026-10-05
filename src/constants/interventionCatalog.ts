// Tipos compartidos del catálogo de intervenciones CMO.
//
// PENDIENTE DERMAPEX: el catálogo heredado de IRIS (intervenciones orientadas a riesgo
// cardiovascular) se ha retirado. El catálogo CMO-DERMAPEX se cargará a partir del protocolo
// oficial; preferentemente desde la tabla intervention_catalog de la base de datos, para que
// los textos queden versionados y trazables (ver docs/DERMAPEX_DATABASE_PLAN.md).

export type CmoPillar = 'capacidad' | 'motivacion' | 'oportunidad';

export type InterventionCatalogItem = {
  code: string;
  label: string;
  domain: string;
  cmo_pillar: CmoPillar;
  min_level: 1 | 2 | 3;
};

export const INTERVENTION_CATALOG: InterventionCatalogItem[] = [];
