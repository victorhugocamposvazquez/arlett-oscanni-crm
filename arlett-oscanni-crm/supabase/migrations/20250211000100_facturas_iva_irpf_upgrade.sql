-- -----------------------------------------------------------------------------
-- FACTURAS: Upgrade fiscal incremental e idempotente
-- - IVA por línea
-- - IRPF opcional en factura
-- - Recalculo de totales compatible con base existente
-- -----------------------------------------------------------------------------

alter table if exists public.facturas
  add column if not exists irpf_porcentaje numeric(5,2) default 0,
  add column if not exists irpf_importe numeric(12,2) default 0;

alter table if exists public.factura_lineas
  add column if not exists iva_porcentaje numeric(5,2) not null default 21;

update public.factura_lineas
set iva_porcentaje = 21
where iva_porcentaje is null;

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

  select coalesce(sum(cantidad * precio_unitario * (iva_porcentaje / 100)), 0)
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

-- Recalcula todas las facturas existentes (backfill)
with agg as (
  select
    fl.factura_id,
    coalesce(sum(fl.cantidad * fl.precio_unitario), 0) as base,
    coalesce(sum(fl.cantidad * fl.precio_unitario * (fl.iva_porcentaje / 100)), 0) as iva
  from public.factura_lineas fl
  group by fl.factura_id
)
update public.facturas f
set
  base_imponible = coalesce(a.base, 0),
  importe_impuesto = coalesce(a.iva, 0),
  irpf_importe = coalesce(a.base, 0) * (coalesce(f.irpf_porcentaje, 0) / 100),
  total = coalesce(a.base, 0)
    + coalesce(a.iva, 0)
    - (coalesce(a.base, 0) * (coalesce(f.irpf_porcentaje, 0) / 100))
    - (coalesce(a.base, 0) * (coalesce(f.porcentaje_descuento, 0) / 100)),
  updated_at = now()
from agg a
where f.id = a.factura_id;

