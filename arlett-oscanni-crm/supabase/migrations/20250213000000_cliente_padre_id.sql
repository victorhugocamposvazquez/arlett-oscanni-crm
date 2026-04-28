-- Relación particular-empresas: empresas son clientes con cliente_padre_id apuntando al particular
alter table public.clientes
  add column if not exists cliente_padre_id uuid references public.clientes (id) on delete set null;

comment on column public.clientes.cliente_padre_id is 'Si tipo=empresa, referencia al particular titular que la representa';

create index if not exists idx_clientes_cliente_padre_id on public.clientes (cliente_padre_id);
