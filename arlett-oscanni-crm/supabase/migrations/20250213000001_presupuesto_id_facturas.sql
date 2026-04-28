-- Presupuestos convertibles a facturas
alter table public.facturas
  add column if not exists presupuesto_id uuid references public.presupuestos (id) on delete set null;

comment on column public.facturas.presupuesto_id is 'Presupuesto del que se generó la factura';

create index if not exists idx_facturas_presupuesto_id on public.facturas (presupuesto_id);

-- Añadir estado 'convertido' a presupuestos
alter table public.presupuestos
  drop constraint if exists presupuestos_estado_check;

alter table public.presupuestos
  add constraint presupuestos_estado_check
  check (estado in ('borrador', 'enviado', 'aceptado', 'rechazado', 'convertido'));
