-- Nombre público de cada servicio para los SMS
-- -----------------------------------------------------------------------------
-- Los nombres de SimplyBook son de uso interno ("Vacumterapia – cavi") y no
-- siempre son lo que conviene que lea el cliente. Esta tabla empareja el nombre
-- que llega de SimplyBook con el que se escribe en el recordatorio. Los servicios
-- que no estén aquí siguen saliendo con su nombre de SimplyBook.

create table if not exists public.sms_servicios (
  id uuid primary key default gen_random_uuid(),
  -- Nombre de SimplyBook normalizado (minúsculas, sin tildes): es la clave de cruce
  clave text not null unique,
  nombre_simplybook text not null,
  nombre_sms text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.sms_servicios is
  'Alias de servicios para los SMS: nombre_sms sustituye al nombre de SimplyBook en la plantilla.';

alter table public.sms_servicios enable row level security;

do $$
begin
  create policy "Admin sms_servicios"
    on public.sms_servicios for all
    using (public.is_admin())
    with check (public.is_admin());
exception
  when duplicate_object then null;
end $$;
