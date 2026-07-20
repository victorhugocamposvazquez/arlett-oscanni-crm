-- SMS recordatorios SimplyBook → Esendex + backoffice admin
-- -----------------------------------------------------------------------------

-- Config global (fila única)
create table if not exists public.sms_config (
  id int primary key default 1,
  enabled boolean not null default true,
  -- hours_before: N horas antes de la cita | day_before_at_hour: día anterior a esa hora (0-23)
  reminder_mode text not null default 'day_before_at_hour'
    check (reminder_mode in ('hours_before', 'day_before_at_hour')),
  reminder_hours_before int not null default 24 check (reminder_hours_before between 1 and 168),
  reminder_send_hour int not null default 21 check (reminder_send_hour between 0 and 23),
  timezone text not null default 'Europe/Madrid',
  updated_at timestamptz default now(),
  constraint sms_config_single_row check (id = 1)
);

comment on table public.sms_config is 'Configuración de recordatorios SMS (SimplyBook → Esendex). Por defecto: día anterior a las 21:00 Europe/Madrid.';

insert into public.sms_config (id, reminder_mode, reminder_send_hour, timezone)
values (1, 'day_before_at_hour', 21, 'Europe/Madrid')
on conflict (id) do nothing;

alter table public.sms_config enable row level security;

create policy "Admin sms_config"
  on public.sms_config for all
  using (public.is_admin())
  with check (public.is_admin());

-- Plantillas
create table if not exists public.sms_plantillas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  cuerpo text not null,
  activa boolean not null default true,
  updated_at timestamptz default now()
);

comment on table public.sms_plantillas is 'Plantillas SMS. Variables: {{cliente}}, {{servicio}}, {{fecha}}, {{hora}}, {{profesional}}.';

insert into public.sms_plantillas (clave, nombre, cuerpo)
values (
  'recordatorio_cita',
  'Recordatorio de cita',
  'Hola {{cliente}}, te recordamos tu cita de {{servicio}} el {{fecha}} a las {{hora}} en Arlett Beauty & Health. ¡Te esperamos!'
)
on conflict (clave) do nothing;

alter table public.sms_plantillas enable row level security;

create policy "Admin sms_plantillas"
  on public.sms_plantillas for all
  using (public.is_admin())
  with check (public.is_admin());

-- Citas sincronizadas desde SimplyBook
create table if not exists public.citas_simplybook (
  id uuid primary key default gen_random_uuid(),
  simplybook_id text not null unique,
  cliente_nombre text,
  cliente_telefono text,
  cliente_email text,
  servicio_nombre text,
  profesional_nombre text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  estado text not null default 'activa'
    check (estado in ('activa', 'cancelada', 'completada')),
  reminder_due_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_skipped_reason text,
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.citas_simplybook is 'Citas sincronizadas desde SimplyBook.me para recordatorios SMS.';

create index if not exists idx_citas_simplybook_starts_at on public.citas_simplybook (starts_at);
create index if not exists idx_citas_simplybook_reminder
  on public.citas_simplybook (reminder_due_at)
  where reminder_sent_at is null and estado = 'activa';

alter table public.citas_simplybook enable row level security;

create policy "Admin citas_simplybook"
  on public.citas_simplybook for all
  using (public.is_admin())
  with check (public.is_admin());

-- Historial de envíos SMS
create table if not exists public.sms_envios (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid references public.citas_simplybook (id) on delete set null,
  telefono text not null,
  cuerpo text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'entregado', 'fallido', 'omitido')),
  proveedor text not null default 'esendex',
  esendex_message_id text,
  esendex_batch_id text,
  error_mensaje text,
  plantilla_clave text,
  enviado_at timestamptz,
  entregado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.sms_envios is 'Registro de SMS automáticos (recordatorios SimplyBook vía Esendex).';

create index if not exists idx_sms_envios_created_at on public.sms_envios (created_at desc);
create index if not exists idx_sms_envios_estado on public.sms_envios (estado);
create index if not exists idx_sms_envios_esendex_message_id on public.sms_envios (esendex_message_id)
  where esendex_message_id is not null;

alter table public.sms_envios enable row level security;

create policy "Admin sms_envios"
  on public.sms_envios for all
  using (public.is_admin())
  with check (public.is_admin());
