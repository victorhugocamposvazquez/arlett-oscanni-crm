export type SmsTemplateVars = {
  cliente?: string;
  servicio?: string;
  fecha?: string;
  hora?: string;
  profesional?: string;
};

export function renderSmsTemplate(body: string, vars: SmsTemplateVars): string {
  return body
    .replaceAll("{{cliente}}", vars.cliente?.trim() || "cliente")
    .replaceAll("{{servicio}}", vars.servicio?.trim() || "tu cita")
    .replaceAll("{{fecha}}", vars.fecha?.trim() || "—")
    .replaceAll("{{hora}}", vars.hora?.trim() || "—")
    .replaceAll("{{profesional}}", vars.profesional?.trim() || "");
}
