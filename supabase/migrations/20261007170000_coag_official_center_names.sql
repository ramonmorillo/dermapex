-- COAMO · 03 · Denominación oficial de los centros (protocolo COAMO, IIS La Fe, p. 9).
-- Sustituye los nombres provisionales de 20261007150100 (tomados del resumen del blueprint).
-- Los códigos internos y los números de estudio no cambian.

alter table public.coag_centers add column city text;
grant insert (city), update (city) on public.coag_centers to authenticated;

update public.coag_centers c set name = v.name, city = v.city
  from (values
    ('LAFE',       'Hospital Universitari i Politècnic La Fe',               'Valencia'),
    ('VHEBRON',    'Hospital Universitario Vall d''Hebron',                  'Barcelona'),
    ('LAPAZ',      'Hospital Universitario La Paz',                          'Madrid'),
    ('VROCIO',     'Hospital Universitario Virgen del Rocío',                'Sevilla'),
    ('CANDELARIA', 'Hospital Universitario Nuestra Señora de Candelaria',    'Tenerife'),
    ('CHUAC',      'Complejo Hospitalario Universitario de La Coruña',       'La Coruña'),
    ('BALMIS',     'Hospital General Universitario Dr. Balmis',              'Alicante'),
    ('VALME',      'Hospital Universitario Nuestra Señora de Valme',         'Sevilla')
  ) as v(code, name, city)
 where c.code = v.code;

comment on column public.coag_centers.city is 'Ciudad del centro (protocolo COAMO p. 9).';
