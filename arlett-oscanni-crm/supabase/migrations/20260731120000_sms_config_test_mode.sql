-- Modo prueba conmutable desde el backoffice
-- -----------------------------------------------------------------------------
-- Hasta ahora el modo prueba solo se podía cambiar en la variable
-- LABSMOBILE_TEST_MODE de Vercel, lo que obligaba a un redespliegue cada vez.
-- Ahora vive en la configuración y la variable de entorno queda como candado:
-- mientras valga 1, ningún SMS sale de verdad aunque aquí se desactive.

-- Se crea a true para no cambiar el comportamiento actual (hoy se está en
-- pruebas) y acto seguido el default pasa a false, que es lo razonable para una
-- instalación nueva. Volver a ejecutar esta migración no reactiva el modo prueba.
alter table public.sms_config
  add column if not exists test_mode boolean not null default true;

alter table public.sms_config
  alter column test_mode set default false;

comment on column public.sms_config.test_mode is
  'true = los recordatorios se registran pero LabsMobile no los entrega ni los factura. LABSMOBILE_TEST_MODE=1 lo fuerza por encima de este valor.';
