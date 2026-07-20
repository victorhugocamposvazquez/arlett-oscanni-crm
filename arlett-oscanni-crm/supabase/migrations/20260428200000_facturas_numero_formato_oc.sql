-- Pasa la numeración antigua al formato N-OC-AAAA / FR-N-OC-AAAA.
-- En BD ya migrada con "-oc-" en minúsculas, el último bloque unifica a "-OC-".

-- Ordinarias y null tipo: 12/2026 -> 12-OC-2026
update public.facturas
set numero = regexp_replace(numero, '^(\d+)/(\d{4})$', '\1-OC-\2')
where coalesce(tipo_factura, 'ordinaria') <> 'rectificativa'
  and numero ~ '^\d+/\d{4}$';

-- Rectificativas: FR-3/2026 -> FR-3-OC-2026
update public.facturas
set numero = regexp_replace(numero, '^FR-(\d+)/(\d{4})$', 'FR-\1-OC-\2')
where tipo_factura = 'rectificativa'
  and numero ~ '^FR-\d+/\d{4}$';

-- Variante ya migrada con guion y "oc" minúsculas
update public.facturas
set numero = replace(numero, '-oc-', '-OC-')
where position('-oc-' in numero) > 0;
