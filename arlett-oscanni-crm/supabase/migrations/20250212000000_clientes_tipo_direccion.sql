-- Añadir tipo (particular/empresa), codigo_postal y localidad a clientes
alter table public.clientes
  add column if not exists tipo text default 'particular' check (tipo in ('particular', 'empresa')),
  add column if not exists codigo_postal text,
  add column if not exists localidad text;

comment on column public.clientes.tipo is 'particular: DNI, empresa: NIF';
comment on column public.clientes.codigo_postal is 'Código postal';
comment on column public.clientes.localidad is 'Localidad / Ciudad';
