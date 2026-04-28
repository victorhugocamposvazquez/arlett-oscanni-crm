-- Datos fiscales y bancarios para facturas (una sola fila, editable en backoffice)
-- -----------------------------------------------------------------------------

create table if not exists public.empresa_facturacion (
  id int primary key default 1,
  razon_social text not null default '',
  nif text not null default '',
  direccion text not null default '',
  codigo_postal text not null default '',
  localidad text not null default '',
  provincia text not null default '',
  telefono text,
  email text,
  iban text,
  numero_cuenta_bancaria text,
  updated_at timestamptz default now(),
  constraint empresa_facturacion_single_row check (id = 1)
);

comment on table public.empresa_facturacion is 'Datos de emisor en facturas impresas. Fila única (id=1).';

insert into public.empresa_facturacion (id)
values (1)
on conflict (id) do nothing;

alter table public.empresa_facturacion enable row level security;

create policy "Lectura empresa facturación (autenticados)"
  on public.empresa_facturacion for select
  to authenticated
  using (true);

create policy "Admin gestión empresa facturación"
  on public.empresa_facturacion for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create or replace function public.set_empresa_facturacion_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_empresa_facturacion_updated on public.empresa_facturacion;
create trigger trg_empresa_facturacion_updated
  before update on public.empresa_facturacion
  for each row execute function public.set_empresa_facturacion_updated_at();
