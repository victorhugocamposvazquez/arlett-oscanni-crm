/** Utilidades de zona horaria basadas en Intl, sin dependencias externas. */

export const DEFAULT_TIMEZONE = "Europe/Madrid";

/** Desplazamiento de la zona respecto a UTC, en minutos, para un instante dado. */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const tzName = dtf.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tzName.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2] || 0) * 60 + Number(m[3] || 0));
}

/**
 * Convierte una fecha-hora sin zona al instante que representa en `timeZone`.
 * SimplyBook devuelve las reservas así ("2026-07-31 10:30:00"), en la hora
 * local del negocio, de modo que interpretarlas como UTC desplazaría la cita.
 */
export function zonedNaiveToDate(naive: string, timeZone: string): Date | null {
  const m = naive
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;

  const asIfUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? "0"),
    Number(m[5] ?? "0"),
    Number(m[6] ?? "0")
  );

  const firstPass = asIfUtc - getTimeZoneOffsetMinutes(new Date(asIfUtc), timeZone) * 60_000;
  // En los cambios de hora el offset del instante real difiere del estimado
  const secondPass = asIfUtc - getTimeZoneOffsetMinutes(new Date(firstPass), timeZone) * 60_000;

  const d = new Date(secondPass);
  return Number.isNaN(d.getTime()) ? null : d;
}
