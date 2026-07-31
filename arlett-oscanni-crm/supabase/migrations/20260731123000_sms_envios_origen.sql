-- Distinguir los envíos automáticos de los lanzados a mano desde Pruebas
-- -----------------------------------------------------------------------------
-- La zona de pruebas del backoffice permite mandar un SMS real a una cita
-- concreta para verificar el circuito completo (LabsMobile → entrega → ACK) sin
-- abrir el grifo a toda la agenda. Esos envíos se marcan como 'prueba'.

alter table public.sms_envios
  add column if not exists origen text not null default 'automatico';

do $$
begin
  alter table public.sms_envios
    add constraint sms_envios_origen_check check (origen in ('automatico', 'prueba'));
exception
  when duplicate_object then null;
end $$;

comment on column public.sms_envios.origen is
  'automatico = lo envió el cron de recordatorios. prueba = envío manual desde la zona de pruebas del backoffice.';
