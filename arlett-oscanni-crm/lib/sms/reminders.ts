import { createAdminClient } from "@/lib/supabase/admin";
import {
  bookingClientName,
  bookingEndDateTime,
  bookingIsCancelled,
  bookingPhone,
  bookingProviderName,
  bookingServiceName,
  bookingStartDateTime,
  fetchSimplyBookBookings,
  isSimplyBookConfigured,
  type SimplyBookBooking,
} from "@/lib/sms/simplybook";
import { DEFAULT_TIMEZONE, zonedNaiveToDate } from "@/lib/sms/tz";
import {
  generateSubid,
  isLabsMobileConfigured,
  isLabsMobileTestModeForced,
  sendSmsLabsMobile,
} from "@/lib/sms/labsmobile";
import { checkPhoneForSms, normalizePhoneE164 } from "@/lib/sms/phone";
import { aliasServicio } from "@/lib/sms/servicios";
import { renderSmsTemplate } from "@/lib/sms/templates";
import { toGsmSafeText } from "@/lib/sms/gsm";

export type SmsConfigRow = {
  id: number;
  enabled: boolean;
  reminder_mode: "hours_before" | "day_before_at_hour";
  reminder_hours_before: number;
  reminder_send_hour: number;
  timezone: string;
  test_mode: boolean;
};

/**
 * El modo prueba se decide en la configuración, pero el entorno puede forzarlo.
 * Si la columna test_mode todavía no existe (migración sin aplicar) se asume que
 * sí: más vale un recordatorio que no sale que una factura sorpresa.
 */
export function isTestMode(config: Partial<Pick<SmsConfigRow, "test_mode">>): boolean {
  if (typeof config.test_mode !== "boolean") return true;
  return config.test_mode || isLabsMobileTestModeForced();
}

function formatInTimeZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone, ...options }).format(date);
}

/** Calcula cuándo debe enviarse el recordatorio. */
export function computeReminderDueAt(
  startsAt: Date,
  config: Pick<SmsConfigRow, "reminder_mode" | "reminder_hours_before" | "reminder_send_hour" | "timezone">
): Date {
  if (config.reminder_mode === "hours_before") {
    return new Date(startsAt.getTime() - config.reminder_hours_before * 60 * 60 * 1000);
  }

  // Día anterior a reminder_send_hour en la zona configurada
  const tz = config.timezone || DEFAULT_TIMEZONE;
  const ymdParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(startsAt);
  const yy = ymdParts.find((p) => p.type === "year")!.value;
  const mm = ymdParts.find((p) => p.type === "month")!.value;
  const dd = ymdParts.find((p) => p.type === "day")!.value;
  const civil = new Date(`${yy}-${mm}-${dd}T00:00:00Z`);
  civil.setUTCDate(civil.getUTCDate() - 1);
  const by = civil.getUTCFullYear();
  const bm = String(civil.getUTCMonth() + 1).padStart(2, "0");
  const bd = String(civil.getUTCDate()).padStart(2, "0");
  const hh = String(config.reminder_send_hour).padStart(2, "0");

  return zonedNaiveToDate(`${by}-${bm}-${bd} ${hh}:00:00`, tz) ?? startsAt;
}

function mapBookingEstado(b: SimplyBookBooking): "activa" | "cancelada" {
  return bookingIsCancelled(b) ? "cancelada" : "activa";
}

/**
 * Un aviso ya enviado se reabre si el teléfono de la cita pasa a ser otro
 * distinto: el cliente nuevo no ha recibido nada. Se comparan los números
 * normalizados para que un simple cambio de formato ("600111222" →
 * "+34 600 111 222") no provoque un segundo SMS al mismo móvil.
 */
function telefonoCambiado(anterior: string | null, actual: string | null): boolean {
  return normalizePhoneE164(anterior) !== normalizePhoneE164(actual);
}

/** Campos que reabren el recordatorio cuando el teléfono deja de ser el mismo. */
const RESET_AVISO = {
  reminder_sent_at: null,
  reminder_skipped_reason: null,
  reminder_skipped_phone: null,
} as const;

export async function loadSmsConfig(): Promise<SmsConfigRow> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("sms_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      id: 1,
      enabled: true,
      reminder_mode: "day_before_at_hour",
      reminder_hours_before: 24,
      reminder_send_hour: 21,
      timezone: "Europe/Madrid",
      test_mode: true,
    };
  }
  return data as SmsConfigRow;
}

/** Sincroniza citas de SimplyBook (próximos días) en citas_simplybook. */
export async function syncSimplyBookAppointments(daysAhead = 14): Promise<{ upserted: number }> {
  if (!isSimplyBookConfigured()) {
    throw new Error("SimplyBook no configurado");
  }
  const config = await loadSmsConfig();
  const supabase = createAdminClient();

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const to = toDate.toISOString().slice(0, 10);

  const bookings = await fetchSimplyBookBookings(from, to);
  let upserted = 0;

  const tz = config.timezone || DEFAULT_TIMEZONE;

  // Estado previo, para detectar los teléfonos que se han corregido
  const previaPorId = new Map<string, { cliente_telefono: string | null; reminder_sent_at: string | null }>();
  if (bookings.length > 0) {
    const { data: previas } = await supabase
      .from("citas_simplybook")
      .select("simplybook_id, cliente_telefono, reminder_sent_at")
      .in(
        "simplybook_id",
        bookings.map((b) => String(b.id))
      );
    for (const p of previas ?? []) previaPorId.set(p.simplybook_id, p);
  }

  for (const b of bookings) {
    const startsAt = bookingStartDateTime(b, tz);
    if (!startsAt) continue;
    const endsAt = bookingEndDateTime(b, tz);
    const simplybookId = String(b.id);
    const estado = mapBookingEstado(b);
    const reminderDueAt =
      estado === "activa" ? computeReminderDueAt(startsAt, config) : null;

    const telefono = bookingPhone(b);
    const previa = previaPorId.get(simplybookId);
    const reabrirAviso =
      previa?.reminder_sent_at != null && telefonoCambiado(previa.cliente_telefono, telefono);

    const { error } = await supabase.from("citas_simplybook").upsert(
      {
        ...(reabrirAviso ? RESET_AVISO : {}),
        simplybook_id: simplybookId,
        cliente_nombre: bookingClientName(b),
        cliente_telefono: telefono,
        cliente_email: b.client_email ? String(b.client_email) : null,
        servicio_nombre: bookingServiceName(b),
        profesional_nombre: bookingProviderName(b),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() ?? null,
        estado,
        reminder_due_at: reminderDueAt?.toISOString() ?? null,
        raw_payload: b as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "simplybook_id" }
    );

    if (!error) upserted += 1;
    else console.error("[sms] upsert cita", simplybookId, error.message);
  }

  return { upserted };
}

type CitaRow = {
  id: string;
  simplybook_id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  servicio_nombre: string | null;
  profesional_nombre: string | null;
  starts_at: string;
  reminder_due_at: string | null;
  reminder_sent_at: string | null;
  reminder_skipped_reason: string | null;
  reminder_skipped_phone: string | null;
  estado: string;
};

const CITA_SELECT =
  "id, simplybook_id, cliente_nombre, cliente_telefono, servicio_nombre, profesional_nombre, starts_at, reminder_due_at, reminder_sent_at, reminder_skipped_reason, reminder_skipped_phone, estado";

type PlantillaRow = { clave: string; cuerpo: string; activa: boolean };

async function loadPlantillaRecordatorio(): Promise<PlantillaRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sms_plantillas")
    .select("clave, cuerpo, activa")
    .eq("clave", "recordatorio_cita")
    .maybeSingle();
  if (error || !data?.activa || !data.cuerpo) return null;
  return data as PlantillaRow;
}

/** Alias de servicios configurados en el backoffice, por clave normalizada. */
export async function loadAliasServicios(): Promise<Record<string, string>> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("sms_servicios").select("clave, nombre_sms");
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.nombre_sms?.trim()) out[row.clave] = row.nombre_sms.trim();
  }
  return out;
}

/**
 * Texto final del recordatorio. Si el servicio tiene nombre propio configurado se
 * respeta tal cual; si no, se usa el de SimplyBook en mayúsculas, que destaca y
 * disimula las tildes que se pierden al pasar a GSM ("DEPILACION LASER"). La
 * fecha lleva guiones como en los avisos que ya mandaba SimplyBook (30-07-2026).
 */
export function renderReminderBody(
  cita: Pick<CitaRow, "cliente_nombre" | "servicio_nombre" | "profesional_nombre" | "starts_at">,
  timeZone: string,
  cuerpoPlantilla: string,
  aliasServicios: Record<string, string> = {}
): string {
  const startsAt = new Date(cita.starts_at);
  const fecha = formatInTimeZone(startsAt, timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).replace(/\//g, "-");
  const hora = formatInTimeZone(startsAt, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const servicio =
    aliasServicio(cita.servicio_nombre, aliasServicios) ??
    cita.servicio_nombre?.toUpperCase() ??
    undefined;

  return toGsmSafeText(
    renderSmsTemplate(cuerpoPlantilla, {
      cliente: cita.cliente_nombre ?? undefined,
      servicio,
      fecha,
      hora,
      profesional: cita.profesional_nombre ?? undefined,
    })
  );
}

export type EnvioPuntualResultado =
  | { ok: true; telefono: string; cuerpo: string; simulado: boolean }
  | { ok: false; error: string };

/**
 * Envía el recordatorio de una sola cita al momento, desde la zona de pruebas.
 * Con `forzarReal` el SMS sale de verdad aunque el modo prueba esté activo, que
 * es justo el sentido de la zona: comprobar el circuito con una cita propia.
 * Marca la cita como avisada para que el cron no repita el mensaje.
 */
export async function sendReminderForCita(
  citaId: string,
  opciones: { forzarReal?: boolean } = {}
): Promise<EnvioPuntualResultado> {
  if (!isLabsMobileConfigured()) {
    return { ok: false, error: "LabsMobile no configurado" };
  }

  const config = await loadSmsConfig();
  const plantilla = await loadPlantillaRecordatorio();
  if (!plantilla) {
    return { ok: false, error: "Plantilla recordatorio_cita no disponible o inactiva" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("citas_simplybook")
    .select(CITA_SELECT)
    .eq("id", citaId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "La cita no existe" };

  const cita = data as CitaRow;
  const telefono = checkPhoneForSms(cita.cliente_telefono);
  if (!telefono.ok) {
    return { ok: false, error: `Teléfono no válido: ${telefono.label}` };
  }

  const simulado = opciones.forzarReal ? false : isTestMode(config);
  const cuerpo = renderReminderBody(
    cita,
    config.timezone,
    plantilla.cuerpo,
    await loadAliasServicios()
  );
  const subid = generateSubid();
  const nowIso = new Date().toISOString();
  const result = await sendSmsLabsMobile(telefono.phone, cuerpo, { subid, test: simulado });

  if (!result.ok) {
    await supabase.from("sms_envios").insert({
      cita_id: cita.id,
      telefono: telefono.phone,
      cuerpo,
      estado: "fallido",
      error_mensaje: result.error,
      plantilla_clave: plantilla.clave,
      enviado_at: nowIso,
      simulado,
      origen: "prueba",
    });
    return { ok: false, error: result.error };
  }

  await supabase
    .from("citas_simplybook")
    .update({
      reminder_sent_at: nowIso,
      reminder_skipped_reason: null,
      reminder_skipped_phone: null,
      updated_at: nowIso,
    })
    .eq("id", cita.id);

  await supabase.from("sms_envios").insert({
    cita_id: cita.id,
    telefono: telefono.phone,
    cuerpo,
    estado: "enviado",
    proveedor: "labsmobile",
    provider_subid: result.subid ?? subid,
    plantilla_clave: plantilla.clave,
    enviado_at: nowIso,
    simulado,
    origen: "prueba",
  });

  return { ok: true, telefono: telefono.phone, cuerpo, simulado };
}

/** Procesa recordatorios vencidos y envía SMS. */
export async function processDueReminders(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const config = await loadSmsConfig();
  const errors: string[] = [];
  if (!config.enabled) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, errors: ["Recordatorios desactivados en sms_config"] };
  }
  if (!isLabsMobileConfigured()) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["LabsMobile no configurado (falta LABSMOBILE_USERNAME / LABSMOBILE_API_TOKEN)"],
    };
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const plantilla = await loadPlantillaRecordatorio();
  if (!plantilla) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["Plantilla recordatorio_cita no disponible o inactiva"],
    };
  }

  const { data: citas, error: citasErr } = await supabase
    .from("citas_simplybook")
    .select(CITA_SELECT)
    .eq("estado", "activa")
    .is("reminder_sent_at", null)
    .lte("reminder_due_at", nowIso)
    .gt("starts_at", nowIso)
    .order("reminder_due_at", { ascending: true })
    // Las citas con teléfono no válido siguen en la cola hasta que pasa su hora,
    // así que el margen es holgado para que no tapen a las que sí se pueden enviar
    .limit(100);

  if (citasErr) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [citasErr.message] };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const list = (citas ?? []) as CitaRow[];
  const simulado = isTestMode(config);
  const alias = await loadAliasServicios();

  for (const cita of list) {
    const telefono = checkPhoneForSms(cita.cliente_telefono);
    const cuerpo = renderReminderBody(cita, config.timezone, plantilla.cuerpo, alias);

    // Nada de llamar a LabsMobile con un fijo o un +34000000000: se factura igual.
    // La cita no se cierra: se anota el número rechazado, de modo que corregirlo
    // en SimplyBook basta para que el aviso vuelva a la cola. Mientras siga
    // siendo el mismo número, se omite en silencio y no se duplica el histórico.
    if (!telefono.ok) {
      skipped += 1;
      const yaRegistrado =
        cita.reminder_skipped_phone !== null &&
        cita.reminder_skipped_phone === (cita.cliente_telefono ?? "");
      if (yaRegistrado) continue;

      await supabase
        .from("citas_simplybook")
        .update({
          reminder_skipped_reason: telefono.label,
          reminder_skipped_phone: cita.cliente_telefono ?? "",
          updated_at: nowIso,
        })
        .eq("id", cita.id);

      await supabase.from("sms_envios").insert({
        cita_id: cita.id,
        telefono: cita.cliente_telefono ?? "",
        cuerpo,
        estado: "omitido",
        error_mensaje: telefono.label,
        plantilla_clave: plantilla.clave,
        enviado_at: nowIso,
      });
      continue;
    }

    const phone = telefono.phone;
    const subid = generateSubid();
    const result = await sendSmsLabsMobile(phone, cuerpo, { subid, test: simulado });
    if (!result.ok) {
      failed += 1;
      errors.push(`${cita.simplybook_id}: ${result.error}`);
      await supabase.from("sms_envios").insert({
        cita_id: cita.id,
        telefono: phone,
        cuerpo,
        estado: "fallido",
        error_mensaje: result.error,
        plantilla_clave: plantilla.clave,
        enviado_at: nowIso,
        simulado,
      });
      // No marcar sent_at para reintentar en el siguiente cron (salvo errores permanentes de config)
      if (result.status === 401 || result.status === 403) {
        // Credenciales malas: no spamear
        break;
      }
      continue;
    }

    sent += 1;
    await supabase
      .from("citas_simplybook")
      .update({
        reminder_sent_at: nowIso,
        reminder_skipped_reason: null,
        reminder_skipped_phone: null,
        updated_at: nowIso,
      })
      .eq("id", cita.id);

    await supabase.from("sms_envios").insert({
      cita_id: cita.id,
      telefono: phone,
      cuerpo,
      estado: "enviado",
      proveedor: "labsmobile",
      provider_subid: result.subid ?? subid,
      plantilla_clave: plantilla.clave,
      enviado_at: nowIso,
      simulado,
    });
  }

  return {
    processed: list.length,
    sent,
    skipped,
    failed,
    errors,
  };
}

/** Upsert de una cita desde webhook SimplyBook/Zapier. */
export async function upsertCitaFromWebhookPayload(payload: Record<string, unknown>): Promise<void> {
  const config = await loadSmsConfig();
  const supabase = createAdminClient();

  const simplybookId = String(
    payload.id ?? payload.booking_id ?? payload.bookingId ?? payload.code ?? ""
  );
  if (!simplybookId || simplybookId === "undefined") {
    throw new Error("Webhook sin id de cita");
  }

  const pseudo: SimplyBookBooking = {
    id: simplybookId,
    client_name:
      String(payload.client_name ?? payload.clientName ?? payload.client ?? payload.name ?? "") ||
      undefined,
    client_phone: String(payload.client_phone ?? payload.clientPhone ?? payload.phone ?? "") || undefined,
    client_email: String(payload.client_email ?? payload.clientEmail ?? payload.email ?? "") || undefined,
    event_name:
      String(payload.event_name ?? payload.event ?? payload.service_name ?? payload.service ?? "") ||
      undefined,
    unit_name:
      String(payload.unit_name ?? payload.unit ?? payload.provider ?? payload.professional ?? "") ||
      undefined,
    start_datetime: String(payload.start_datetime ?? payload.start ?? "") || undefined,
    end_datetime: String(payload.end_datetime ?? payload.end ?? "") || undefined,
    start_date: String(payload.start_date ?? payload.date ?? "") || undefined,
    start_time: String(payload.start_time ?? payload.time ?? "") || undefined,
    is_confirmed: (payload.is_confirmed ?? payload.is_confirm) as number | boolean | undefined,
  };

  const eventType = String(payload.notification_type ?? payload.event ?? payload.type ?? "").toLowerCase();
  const cancelled =
    eventType.includes("cancel") ||
    payload.cancelled === true ||
    mapBookingEstado(pseudo) === "cancelada";

  const tz = config.timezone || DEFAULT_TIMEZONE;
  const startsAt = bookingStartDateTime(pseudo, tz);
  if (!startsAt && !cancelled) {
    throw new Error("Webhook sin fecha/hora de inicio");
  }

  const estado = cancelled ? "cancelada" : "activa";
  const reminderDueAt =
    estado === "activa" && startsAt ? computeReminderDueAt(startsAt, config) : null;

  const telefono = bookingPhone(pseudo);
  const { data: previa } = await supabase
    .from("citas_simplybook")
    .select("cliente_telefono, reminder_sent_at")
    .eq("simplybook_id", simplybookId)
    .maybeSingle();
  const reabrirAviso =
    previa?.reminder_sent_at != null && telefonoCambiado(previa.cliente_telefono, telefono);

  await supabase.from("citas_simplybook").upsert(
    {
      ...(reabrirAviso ? RESET_AVISO : {}),
      simplybook_id: simplybookId,
      cliente_nombre: bookingClientName(pseudo),
      cliente_telefono: telefono,
      cliente_email: pseudo.client_email ?? null,
      servicio_nombre: bookingServiceName(pseudo),
      profesional_nombre: bookingProviderName(pseudo),
      starts_at: (startsAt ?? new Date()).toISOString(),
      ends_at: bookingEndDateTime(pseudo, tz)?.toISOString() ?? null,
      estado,
      reminder_due_at: reminderDueAt?.toISOString() ?? null,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "simplybook_id" }
  );
}
