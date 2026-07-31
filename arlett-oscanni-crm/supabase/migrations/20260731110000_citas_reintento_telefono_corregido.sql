-- Reintento del recordatorio cuando se corrige un teléfono no válido
-- -----------------------------------------------------------------------------
-- Hasta ahora, omitir una cita por teléfono no válido marcaba reminder_sent_at,
-- así que corregir el número en SimplyBook no servía de nada: la cita quedaba
-- cerrada para siempre. Ahora la omisión solo anota el número rechazado y el
-- aviso vuelve a la cola en cuanto ese número cambia.

alter table public.citas_simplybook
  add column if not exists reminder_skipped_phone text;

comment on column public.citas_simplybook.reminder_skipped_phone is
  'Teléfono que se rechazó al omitir el recordatorio. Mientras no cambie no se reintenta ni se duplica el histórico.';

-- Las citas futuras ya omitidas vuelven a evaluarse en la próxima ejecución
update public.citas_simplybook
set
  reminder_sent_at = null,
  reminder_skipped_phone = cliente_telefono,
  updated_at = now()
where reminder_skipped_reason is not null
  and reminder_sent_at is not null
  and starts_at > now();
