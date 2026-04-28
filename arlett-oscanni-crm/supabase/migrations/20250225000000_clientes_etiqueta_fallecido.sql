-- Añadir etiqueta 'fallecido' a clientes
-- Permite marcar clientes fallecidos además de activo/inactivo
alter table public.clientes
  add column if not exists etiqueta text;

alter table public.clientes drop constraint if exists clientes_etiqueta_check;
alter table public.clientes add constraint clientes_etiqueta_check
  check (etiqueta is null or etiqueta in ('fallecido'));

comment on column public.clientes.etiqueta is 'Etiqueta especial: fallecido. Null = sin etiqueta especial.';

create index if not exists idx_clientes_etiqueta on public.clientes (etiqueta) where etiqueta is not null;
