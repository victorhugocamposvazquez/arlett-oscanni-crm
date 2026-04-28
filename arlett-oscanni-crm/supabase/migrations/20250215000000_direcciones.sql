-- =============================================================================
-- Tabla direcciones: direcciones separadas por cliente
-- No se eliminan las columnas de dirección antiguas en clientes.
-- =============================================================================

create table if not exists public.direcciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null check (tipo in ('fiscal', 'envio', 'contacto')),
  direccion text,
  codigo_postal text,
  ciudad text,
  provincia text,
  pais text,
  principal boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.direcciones is 'Direcciones por cliente. Tipo: fiscal, envio, contacto.';

alter table public.direcciones enable row level security;

create policy "Admin puede todo en direcciones"
  on public.direcciones for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Agente CRUD direcciones de sus clientes"
  on public.direcciones for all
  using (
    exists (
      select 1 from public.clientes c
      where c.id = direcciones.cliente_id
      and c.user_id = auth.uid()
    )
  );

create index if not exists idx_direcciones_cliente_id on public.direcciones (cliente_id);
create index if not exists idx_direcciones_tipo on public.direcciones (tipo);
create index if not exists idx_direcciones_principal on public.direcciones (cliente_id, principal) where principal = true;
