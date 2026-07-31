-- Adopta el mismo texto que se venía enviando desde SimplyBook: sin el nombre
-- del cliente (en SimplyBook hay altas con nombres internos) y con la dirección
-- del centro. Solo actúa si la plantilla sigue siendo la original, para no
-- pisar ediciones hechas desde el backoffice.

update public.sms_plantillas
set
  cuerpo = 'Recordatorio: {{servicio}} en Arlett Beauty el {{fecha}} {{hora}}. A Coruña, Calle Betanzos, 5, 15004.',
  updated_at = now()
where clave = 'recordatorio_cita'
  and cuerpo like '%{{cliente}}%';
