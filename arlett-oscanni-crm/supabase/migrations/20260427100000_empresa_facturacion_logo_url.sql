-- URL pública del logotipo en facturas (o ruta bajo el mismo origen, ej. /images/logo.png)
alter table if exists public.empresa_facturacion
  add column if not exists logo_url text;

comment on column public.empresa_facturacion.logo_url is 'URL absoluta o ruta /... del logotipo en facturas impresas.';
