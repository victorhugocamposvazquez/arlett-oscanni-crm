-- Pasa la numeración antigua al formato N-oc-AAAA / FR-N-oc-AAAA.
-- Ejecutar una sola vez (o las filas que ya no coincidan con el patrón antiguo no se tocan).
-- Orden: primero ordinarias, luego rectificativas.

-- Ordinarias y null tipo: 12/2026 -> 12-oc-2026
update public.facturas
set numero = regexp_replace(numero, '^(\d+)/(\d{4})$', '\1-oc-\2')
where coalesce(tipo_factura, 'ordinaria') <> 'rectificativa'
  and numero ~ '^\d+/\d{4}$';

-- Rectificativas: FR-3/2026 -> FR-3-oc-2026
update public.facturas
set numero = regexp_replace(numero, '^FR-(\d+)/(\d{4})$', 'FR-\1-oc-\2')
where tipo_factura = 'rectificativa'
  and numero ~ '^FR-\d+/\d{4}$';
