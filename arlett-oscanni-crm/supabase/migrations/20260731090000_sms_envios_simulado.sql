-- Distingue los envíos hechos con LABSMOBILE_TEST_MODE de los reales.
-- En modo de prueba LabsMobile responde código 0 igual que en un envío válido,
-- así que sin esta marca el historial mostraba "enviado" para SMS que nunca
-- salieron ni consumieron crédito.

alter table public.sms_envios
  add column if not exists simulado boolean not null default false;

comment on column public.sms_envios.simulado is
  'true cuando el SMS se registró en modo de prueba: LabsMobile lo aceptó pero no lo entregó.';
