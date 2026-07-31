-- Cambio de proveedor SMS: Esendex → LabsMobile.
-- Columnas de proveedor genéricas y default 'labsmobile'.
-- Idempotente: solo renombra si existen los nombres antiguos.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sms_envios' and column_name = 'esendex_message_id'
  ) then
    alter table public.sms_envios rename column esendex_message_id to provider_message_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sms_envios' and column_name = 'esendex_batch_id'
  ) then
    alter table public.sms_envios rename column esendex_batch_id to provider_subid;
  end if;
end $$;

alter table public.sms_envios
  add column if not exists provider_message_id text,
  add column if not exists provider_subid text;

alter table public.sms_envios
  alter column proveedor set default 'labsmobile';

update public.sms_envios
set proveedor = 'labsmobile'
where proveedor = 'esendex';

-- El ACK de LabsMobile identifica el mensaje por subid + msisdn
drop index if exists idx_sms_envios_esendex_message_id;

create index if not exists idx_sms_envios_provider_subid
  on public.sms_envios (provider_subid)
  where provider_subid is not null;

comment on table public.sms_envios is 'Registro de SMS automáticos (recordatorios SimplyBook vía LabsMobile).';
comment on column public.sms_envios.provider_subid is 'subid enviado a LabsMobile; permite cruzar los ACK de entrega.';
comment on table public.sms_config is 'Configuración de recordatorios SMS (SimplyBook → LabsMobile). Por defecto: día anterior a las 21:00 Europe/Madrid.';
