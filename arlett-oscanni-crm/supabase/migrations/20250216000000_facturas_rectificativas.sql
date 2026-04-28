-- =============================================================================
-- Facturas rectificativas (RD 1619/2012 Art. 15)
-- Serie específica obligatoria. Referencia a factura original.
-- =============================================================================

alter table if exists public.facturas
  add column if not exists tipo_factura text not null default 'ordinaria' check (tipo_factura in ('ordinaria', 'rectificativa')),
  add column if not exists factura_original_id uuid references public.facturas (id) on delete set null,
  add column if not exists causa_rectificacion text;

comment on column public.facturas.tipo_factura is 'ordinaria o rectificativa. Serie obligatoria distinta para rectificativas.';
comment on column public.facturas.factura_original_id is 'Factura rectificada por esta rectificativa.';
comment on column public.facturas.causa_rectificacion is 'Motivo de la rectificación (RD 1619/2012 Art. 15).';

create index if not exists idx_facturas_tipo_factura on public.facturas (tipo_factura);
create index if not exists idx_facturas_factura_original_id on public.facturas (factura_original_id) where factura_original_id is not null;
