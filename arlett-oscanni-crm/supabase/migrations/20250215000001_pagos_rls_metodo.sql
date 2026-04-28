-- =============================================================================
-- Pagos: añadir bizum a metodo_pago, RLS vía facturas.user_id
-- No renombrar columnas. No borrar datos. Migración segura.
-- =============================================================================

-- 1. Actualizar check de metodo_pago (añadir bizum, mantener domiciliacion)
do $$
declare
  r record;
begin
  for r in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public' and t.relname = 'pagos'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%metodo_pago%'
  ) loop
    execute format('alter table public.pagos drop constraint if exists %I', r.conname);
  end loop;
  alter table public.pagos add constraint pagos_metodo_pago_check
    check (metodo_pago is null or metodo_pago in ('efectivo', 'transferencia', 'tarjeta', 'domiciliacion', 'bizum', 'otro'));
end;
$$;

-- 2. RLS: reemplazar política de agente (acceso vía facturas.user_id, no pagos.user_id)
drop policy if exists "Agente CRUD pagos de sus facturas" on public.pagos;

create policy "Agente CRUD pagos de sus facturas"
  on public.pagos for all
  using (
    exists (
      select 1 from public.facturas f
      where f.id = pagos.factura_id
      and f.user_id = auth.uid()
    )
  );

-- 3. Índices (crear si no existen)
create index if not exists idx_pagos_factura_id on public.pagos (factura_id);
create index if not exists idx_pagos_user_id on public.pagos (user_id);
create index if not exists idx_pagos_fecha on public.pagos (fecha);
