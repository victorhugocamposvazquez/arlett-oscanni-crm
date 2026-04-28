-- =============================================================================
-- Refactor clientes (tipos, documento, jerarquía empresa/particular)
-- Una sola tabla. tipo_cliente, documento_fiscal, tipo_documento.
-- cliente_padre_id ya existe (empresa → particular titular).
-- user_id se mantiene para RLS.
-- =============================================================================

-- 1. tipo_cliente (reemplaza tipo)
-- Añadir columna con check
alter table if exists public.clientes
  add column if not exists tipo_cliente text default 'particular';

-- Aplicar check si la columna se acaba de crear (evitar error si ya existe con check)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes' and column_name = 'tipo'
  ) then
    update public.clientes set tipo_cliente = coalesce(tipo, 'particular') where tipo_cliente is null or tipo_cliente = '';
    alter table public.clientes drop column if exists tipo;
  end if;
  -- Asegurar constraint
  alter table public.clientes drop constraint if exists clientes_tipo_cliente_check;
  alter table public.clientes add constraint clientes_tipo_cliente_check
    check (tipo_cliente in ('particular', 'empresa'));
  alter table public.clientes alter column tipo_cliente set default 'particular';
exception when others then
  raise notice 'tipo_cliente: %', sqlerrm;
end;
$$;

comment on column public.clientes.tipo_cliente is 'particular o empresa';

-- 2. cliente_padre_id (ya añadido en 20250213000000, asegurar índice)
create index if not exists idx_clientes_cliente_padre_id on public.clientes (cliente_padre_id);

-- 3. documento_fiscal y tipo_documento (reemplazan nif)
alter table if exists public.clientes
  add column if not exists documento_fiscal text,
  add column if not exists tipo_documento text;

alter table public.clientes drop constraint if exists clientes_tipo_documento_check;
alter table public.clientes add constraint clientes_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('dni', 'nie', 'cif', 'vat'));

-- Migrar nif → documento_fiscal y inferir tipo_documento (solo si nif existe)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes' and column_name = 'nif'
  ) then
    update public.clientes
    set
      documento_fiscal = coalesce(documento_fiscal, nif),
      tipo_documento = case
        when coalesce(tipo_cliente, 'particular') = 'empresa' then coalesce(tipo_documento, 'cif')
        when nif is not null then coalesce(tipo_documento, 'dni')
        else tipo_documento
      end
    where nif is not null and documento_fiscal is null;
    alter table public.clientes drop column nif;
  end if;
end;
$$;

comment on column public.clientes.documento_fiscal is 'DNI, NIE, CIF o VAT según tipo_documento';
comment on column public.clientes.tipo_documento is 'dni, nie, cif, vat';

-- 4. Índices
create index if not exists idx_clientes_tipo_cliente on public.clientes (tipo_cliente);
create index if not exists idx_clientes_tipo_documento on public.clientes (tipo_documento) where tipo_documento is not null;
