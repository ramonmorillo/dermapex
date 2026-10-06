// Mapeo de respuestas de CIMA (AEMPS). Las fixtures reproducen la ESTRUCTURA documentada de la API REST
// de CIMA (campos y anidación); los valores son ilustrativos, no una captura real (el entorno de
// desarrollo no tiene salida a cima.aemps.es).
import { describe, expect, it } from 'vitest';

import {
  buildCimaSearchUrls,
  extractAtcCodes,
  extractIngredientNames,
  extractItems,
  extractSingleCn,
  mergeCimaResults,
  normalizeCimaMedication,
} from '../supabase/functions/search-cima-medications/cimaMapping';
import { cimaSourceCode } from '../src/features/medications/medicationsService';
import { mapExternalMedicationPayloadToNormalizedCandidate } from '../src/features/medications/normalizedCatalog/externalMapper';

const LISTADO = {
  totalFilas: 2,
  pagina: 1,
  tamanioPagina: 25,
  resultados: [
    {
      nregistro: '1171229001',
      nombre: 'MEDICAMENTO A 300 mg SOLUCION INYECTABLE EN JERINGA PRECARGADA',
      pactivos: 'PRINCIPIO A',
      labtitular: 'Laboratorio Ejemplo',
      estado: { aut: 1506297600000 },
      comerc: true,
      dosis: '300 mg',
      atcs: [
        { codigo: 'D11AH', nombre: 'Agentes para dermatitis, excluyendo corticosteroides', nivel: 4 },
        { codigo: 'D11AH05', nombre: 'principio a', nivel: 5 },
      ],
      viasAdministracion: [{ id: 58, nombre: 'VÍA SUBCUTÁNEA' }],
      formaFarmaceutica: { id: 40, nombre: 'SOLUCIÓN INYECTABLE EN JERINGA PRECARGADA' },
      formaFarmaceuticaSimplificada: { id: 21, nombre: 'INYECTABLE' },
      vtm: { id: 1, nombre: 'principio a' },
    },
    {
      nregistro: '80123',
      nombre: 'MEDICAMENTO B 10 mg COMPRIMIDOS',
      principiosActivos: [{ id: 1, nombre: 'PRINCIPIO B', cantidad: '10', unidad: 'mg' }, { id: 2, nombre: 'PRINCIPIO C' }],
      estado: { aut: 1, susp: 1600000000000 },
      comerc: false,
      presentaciones: [{ cn: '654321', nombre: 'Medicamento B 10 mg 30 comprimidos' }],
    },
  ],
};

describe('extracción de la respuesta de CIMA', () => {
  it('lee el listado (resultados) y el objeto único de /medicamento', () => {
    expect(extractItems(LISTADO)).toHaveLength(2);
    expect(extractItems(LISTADO.resultados[0])).toHaveLength(1);
    expect(extractItems({ totalFilas: 0, resultados: [] })).toEqual([]);
    expect(extractItems(null)).toEqual([]);
  });

  it('ATC: códigos (no nombres), nivel 5 primero', () => {
    expect(extractAtcCodes(LISTADO.resultados[0])).toEqual(['D11AH05', 'D11AH']);
  });

  it('principios activos: principiosActivos → pactivos → vtm', () => {
    expect(extractIngredientNames(LISTADO.resultados[0])).toEqual(['PRINCIPIO A']);
    expect(extractIngredientNames(LISTADO.resultados[1])).toEqual(['PRINCIPIO B', 'PRINCIPIO C']);
    expect(extractIngredientNames({ vtm: { nombre: 'principio z' } })).toEqual(['principio z']);
    expect(extractIngredientNames({ pactivos: 'X, Y' })).toEqual(['X', 'Y']);
  });

  it('CN solo si es inequívoco (una presentación)', () => {
    expect(extractSingleCn(LISTADO.resultados[0])).toBeNull();
    expect(extractSingleCn(LISTADO.resultados[1])).toBe('654321');
    expect(extractSingleCn({ presentaciones: [{ cn: '1' }, { cn: '2' }] })).toBeNull();
  });

  it('normaliza un medicamento del listado identificándolo por n.º de registro', () => {
    const dto = normalizeCimaMedication(LISTADO.resultados[0], '2026-10-06T00:00:00Z');
    expect(dto).toMatchObject({
      id: '1171229001',
      cima_nregistro: '1171229001',
      cima_cn: null,
      ingredient_names: ['PRINCIPIO A'],
      pharmaceutical_form: 'SOLUCIÓN INYECTABLE EN JERINGA PRECARGADA',
      pharmaceutical_form_simplified: 'INYECTABLE',
      routes: ['VÍA SUBCUTÁNEA'],
      atc_codes: ['D11AH05', 'D11AH'],
      authorization_status: 'autorizado',
      commercialized: true,
      dose: '300 mg',
    });
    expect(normalizeCimaMedication(LISTADO.resultados[1], 'x').authorization_status).toBe('suspendido');
  });
});

describe('consultas y fusión', () => {
  it('busca por nombre comercial y por principio activo; un número de 6-7 dígitos también como CN', () => {
    const urls = buildCimaSearchUrls('dupilumab');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('nombre=dupilumab');
    expect(urls[1]).toContain('practiv1=dupilumab');
    expect(urls.every((u) => u.includes('autorizados=1') && u.includes('comerc=1'))).toBe(true);
    expect(buildCimaSearchUrls('712345')[0]).toContain('cn=712345');
  });

  it('une resultados sin duplicar por n.º de registro y respeta el límite', () => {
    const a = normalizeCimaMedication(LISTADO.resultados[0], 'x');
    const b = normalizeCimaMedication(LISTADO.resultados[1], 'x');
    expect(mergeCimaResults([[a, b], [a]], 20).map((i) => i.id)).toEqual(['1171229001', '80123']);
    expect(mergeCimaResults([[a, b]], 1)).toHaveLength(1);
  });
});

describe('guardado en el catálogo de DERMAPEX', () => {
  it('código de origen: CN si existe; si no, nreg:<n.º de registro>', () => {
    expect(cimaSourceCode('654321', '80123')).toBe('654321');
    expect(cimaSourceCode(null, '1171229001')).toBe('nreg:1171229001');
    expect(cimaSourceCode(null, null)).toBeNull();
  });

  it('dos fármacos distintos con igual dosis/forma/vía y sin principio activo no se fusionan', () => {
    const base = { source: 'external_cima', strength: '300 mg', pharmaceutical_form: 'SOLUCIÓN INYECTABLE', routes: ['VÍA SUBCUTÁNEA'] };
    const x = mapExternalMedicationPayloadToNormalizedCandidate({ ...base, cima_name: 'X', cima_nregistro: '111' });
    const y = mapExternalMedicationPayloadToNormalizedCandidate({ ...base, cima_name: 'Y', cima_nregistro: '222' });
    expect(x.fingerprint).not.toBe(y.fingerprint);
  });

  it('el candidato normalizado toma principios activos, ATC, vía y n.º de registro del resultado de CIMA', () => {
    const dto = normalizeCimaMedication(LISTADO.resultados[0], 'x');
    const candidate = mapExternalMedicationPayloadToNormalizedCandidate({ ...dto.raw_payload, ...dto, source: 'external_cima' });
    expect(candidate.ingredientNames).toEqual(['PRINCIPIO A']);
    expect(candidate.atcCodes[0]).toBe('D11AH05');
    expect(candidate.routeDefault).toBe('VÍA SUBCUTÁNEA');
    expect(candidate.cimaNRegistro).toBe('1171229001');
    expect(candidate.productSource).toBe('external_cima');
  });
});
