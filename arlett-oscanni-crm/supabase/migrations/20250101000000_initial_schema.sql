-- =============================================================================
-- CRM — esquema inicial (clientes, facturación, presupuestos)
-- Supabase / PostgreSQL
-- Usuarios, clientes, facturas, presupuestos, pagos, métricas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USUARIOS Y PERFILES
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'agente' check (role in ('admin', 'agente')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.profiles is 'Perfiles ligados a auth.users. Admin: acceso total. Agente: solo sus registros.';

alter table public.profiles enable row level security;

create policy "Admin puede todo en profiles"
  on public.profiles for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Agente ve su propio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Agente actualiza su propio perfil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Usuario inserta su propio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'agente')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. CLIENTES
-- -----------------------------------------------------------------------------

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null,
  email text,
  telefono text,
  nif text,
  direccion text,
  notas text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.clientes is 'Clientes. Cada uno pertenece a un user_id (agente).';

alter table public.clientes enable row level security;

create policy "Admin puede todo en clientes"
  on public.clientes for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Agente CRUD sus clientes"
  on public.clientes for all
  using (auth.uid() = user_id);

create index if not exists idx_clientes_user_id on public.clientes (user_id);
create index if not exists idx_clientes_activo on public.clientes (activo) where activo = true;

-- -----------------------------------------------------------------------------
-- 3. FACTURAS
-- -----------------------------------------------------------------------------

create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete set null,
  numero text not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'emitida', 'pagada')),
  concepto text,
  fecha_emision date,
  fecha_vencimiento date,
  base_imponible numeric(12, 2) default 0,
  porcentaje_impuesto numeric(5, 2) default 21,
  importe_impuesto numeric(12, 2) default 0,
  irpf_porcentaje numeric(5, 2) default 0,
  irpf_importe numeric(12, 2) default 0,
  porcentaje_descuento numeric(5, 2) default 0,
  importe_descuento numeric(12, 2) default 0,
  total numeric(12, 2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, numero)
);

comment on table public.facturas is 'Facturas. numero único por usuario. Métricas: base, impuesto, descuento, total.';

alter table public.facturas enable row level security;

create policy "Admin puede todo en facturas"
  on public.facturas for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Agente CRUD sus facturas"
  on public.facturas for all
  using (auth.uid() = user_id);

create index if not exists idx_facturas_user_id on public.facturas (user_id);
create index if not exists idx_facturas_cliente_id on public.facturas (cliente_id);
create index if not exists idx_facturas_estado on public.facturas (estado);
create index if not exists idx_facturas_fecha_emision on public.facturas (fecha_emision);

-- -----------------------------------------------------------------------------
-- 4. LÍNEAS DE FACTURA
-- -----------------------------------------------------------------------------

create table if not exists public.factura_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas (id) on delete cascade,
  descripcion text not null,
  cantidad numeric(12, 4) not null default 0,
  precio_unitario numeric(12, 2) not null default 0,
  iva_porcentaje numeric(5, 2) not null default 21,
  orden int default 0
);

comment on table public.factura_lineas is 'Líneas de factura. Permisos heredados de la factura.';

alter table public.factura_lineas enable row level security;

create policy "Acceso factura_lineas según factura"
  on public.factura_lineas for all
  using (
    exists (
      select 1 from public.facturas f
      where f.id = factura_lineas.factura_id
      and (
        f.user_id = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      )
    )
  );

create index if not exists idx_factura_lineas_factura_id on public.factura_lineas (factura_id);

create or replace function public.recalcular_total_factura()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_base numeric;
  v_impuesto numeric;
  v_descuento numeric;
  v_irpf numeric;
  v_total numeric;
  v_pct_irpf numeric;
  v_pct_desc numeric;
begin
  select coalesce(sum(cantidad * precio_unitario), 0)
  into v_base
  from public.factura_lineas
  where factura_id = coalesce(new.factura_id, old.factura_id);

  select
    coalesce(sum(cantidad * precio_unitario * (iva_porcentaje / 100)), 0)
  into v_impuesto
  from public.factura_lineas
  where factura_id = coalesce(new.factura_id, old.factura_id);

  select porcentaje_descuento, irpf_porcentaje
  into v_pct_desc, v_pct_irpf
  from public.facturas
  where id = coalesce(new.factura_id, old.factura_id);

  v_descuento := v_base * coalesce(v_pct_desc, 0) / 100;
  v_irpf := v_base * coalesce(v_pct_irpf, 0) / 100;
  v_total := v_base + v_impuesto - v_descuento - v_irpf;

  update public.facturas
  set
    base_imponible = v_base,
    importe_impuesto = v_impuesto,
    irpf_importe = v_irpf,
    importe_descuento = v_descuento,
    total = v_total,
    updated_at = now()
  where id = coalesce(new.factura_id, old.factura_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_factura on public.factura_lineas;
create trigger trg_recalcular_factura
  after insert or update or delete on public.factura_lineas
  for each row execute function public.recalcular_total_factura();

-- -----------------------------------------------------------------------------
-- 5. PRESUPUESTOS
-- -----------------------------------------------------------------------------

create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete set null,
  numero text not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'enviado', 'aceptado', 'rechazado')),
  fecha date default current_date,
  concepto text,
  base_imponible numeric(12, 2) default 0,
  porcentaje_impuesto numeric(5, 2) default 21,
  importe_impuesto numeric(12, 2) default 0,
  porcentaje_descuento numeric(5, 2) default 0,
  importe_descuento numeric(12, 2) default 0,
  total numeric(12, 2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, numero)
);

comment on table public.presupuestos is 'Presupuestos. numero único por usuario.';

alter table public.presupuestos enable row level security;

create policy "Admin puede todo en presupuestos"
  on public.presupuestos for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Agente CRUD sus presupuestos"
  on public.presupuestos for all
  using (auth.uid() = user_id);

create index if not exists idx_presupuestos_user_id on public.presupuestos (user_id);
create index if not exists idx_presupuestos_cliente_id on public.presupuestos (cliente_id);
create index if not exists idx_presupuestos_estado on public.presupuestos (estado);
create index if not exists idx_presupuestos_fecha on public.presupuestos (fecha);

create table if not exists public.presupuesto_lineas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos (id) on delete cascade,
  descripcion text not null,
  cantidad numeric(12, 4) not null default 0,
  precio_unitario numeric(12, 2) not null default 0,
  orden int default 0
);

alter table public.presupuesto_lineas enable row level security;

create policy "Acceso presupuesto_lineas según presupuesto"
  on public.presupuesto_lineas for all
  using (
    exists (
      select 1 from public.presupuestos p
      where p.id = presupuesto_lineas.presupuesto_id
      and (
        p.user_id = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      )
    )
  );

create index if not exists idx_presupuesto_lineas_presupuesto_id on public.presupuesto_lineas (presupuesto_id);

create or replace function public.recalcular_total_presupuesto()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_base numeric;
  v_impuesto numeric;
  v_descuento numeric;
  v_total numeric;
  v_pct_imp numeric;
  v_pct_desc numeric;
begin
  select coalesce(sum(cantidad * precio_unitario), 0)
  into v_base
  from public.presupuesto_lineas
  where presupuesto_id = coalesce(new.presupuesto_id, old.presupuesto_id);

  select porcentaje_impuesto, porcentaje_descuento
  into v_pct_imp, v_pct_desc
  from public.presupuestos
  where id = coalesce(new.presupuesto_id, old.presupuesto_id);

  v_impuesto := v_base * coalesce(v_pct_imp, 21) / 100;
  v_descuento := v_base * coalesce(v_pct_desc, 0) / 100;
  v_total := v_base + v_impuesto - v_descuento;

  update public.presupuestos
  set
    base_imponible = v_base,
    importe_impuesto = v_impuesto,
    importe_descuento = v_descuento,
    total = v_total,
    updated_at = now()
  where id = coalesce(new.presupuesto_id, old.presupuesto_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalcular_presupuesto on public.presupuesto_lineas;
create trigger trg_recalcular_presupuesto
  after insert or update or delete on public.presupuesto_lineas
  for each row execute function public.recalcular_total_presupuesto();

-- -----------------------------------------------------------------------------
-- 6. PAGOS
-- -----------------------------------------------------------------------------

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  importe numeric(12, 2) not null check (importe > 0),
  fecha date not null default current_date,
  metodo_pago text check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta', 'domiciliacion', 'otro')),
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.pagos is 'Pagos contra facturas. user_id = propietario de la factura (RLS).';

alter table public.pagos enable row level security;

create policy "Admin puede todo en pagos"
  on public.pagos for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Agente CRUD pagos de sus facturas"
  on public.pagos for all
  using (auth.uid() = user_id);

create index if not exists idx_pagos_factura_id on public.pagos (factura_id);
create index if not exists idx_pagos_user_id on public.pagos (user_id);
create index if not exists idx_pagos_fecha on public.pagos (fecha);

-- -----------------------------------------------------------------------------
-- 7. VISTAS Y FUNCIONES AUXILIARES
-- -----------------------------------------------------------------------------

create or replace view public.v_facturas_totales as
select f.id, f.user_id, f.cliente_id, f.numero, f.estado, f.fecha_emision, f.total, f.importe_impuesto, f.importe_descuento
from public.facturas f
where f.estado in ('emitida', 'pagada');

create or replace view public.v_pagos_resumen as
select p.id, p.factura_id, p.user_id, p.importe, p.fecha, p.metodo_pago, f.numero as factura_numero, f.cliente_id
from public.pagos p
join public.facturas f on f.id = p.factura_id;

create or replace function public.fn_ingresos_totales(
  p_user_id uuid default null,
  p_desde date default null,
  p_hasta date default null
)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(f.total), 0)
  from public.facturas f
  where f.estado = 'pagada'
    and (p_user_id is null or f.user_id = p_user_id)
    and (p_desde is null or f.fecha_emision >= p_desde)
    and (p_hasta is null or f.fecha_emision <= p_hasta);
$$;
