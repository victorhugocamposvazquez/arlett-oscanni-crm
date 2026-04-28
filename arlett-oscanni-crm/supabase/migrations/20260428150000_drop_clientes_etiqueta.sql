-- Elimina columna etiqueta (fallecido) en clientes.
drop index if exists public.idx_clientes_etiqueta;
alter table if exists public.clientes drop constraint if exists clientes_etiqueta_check;
alter table if exists public.clientes drop column if exists etiqueta;
