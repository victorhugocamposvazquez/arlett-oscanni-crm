-- Asegura columna etiqueta (fallecido) en clientes si aún no existe en el entorno.
-- Idempotente: equivalente a 20250225000000_clientes_etiqueta_fallecido.sql

alter table if exists public.clientes
  add column if not exists etiqueta text;

alter table if exists public.clientes drop constraint if exists clientes_etiqueta_check;
alter table if exists public.clientes add constraint clientes_etiqueta_check
  check (etiqueta is null or etiqueta in ('fallecido'));

comment on column public.clientes.etiqueta is 'Etiqueta especial: fallecido. Null = sin etiqueta especial.';

create index if not exists idx_clientes_etiqueta on public.clientes (etiqueta) where etiqueta is not null;
