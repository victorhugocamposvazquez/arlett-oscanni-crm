import { createAdminClient } from "@/lib/supabase/admin";
import {
  bookingEndDateTime,
  bookingPhone,
  bookingStartDateTime,
  fetchSimplyBookBookings,
  isSimplyBookConfigured,
  type SimplyBookBooking,
} from "@/lib/sms/simplybook";
import { sendSmsEsendex, isEsendexConfigured } from "@/lib/sms/esendex";
import { normalizePhoneE164 } from "@/lib/sms/phone";
import { renderSmsTemplate } from "@/lib/sms/templates";

export type SmsConfigRow = {
  id: number;
  enabled: boolean;
  reminder_mode: "hours_before" | "day_before_at_hour";
  reminder_hours_before: number;
  reminder_send_hour: number;
  timezone: string;
};

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
  const tz = config.timezone || "Europe/Madrid";
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

  const asUtcGuess = new Date(`${by}-${bm}-${bd}T${hh}:00:00Z`);
  const offsetMin = getTimeZoneOffsetMinutes(asUtcGuess, tz);
  return new Date(asUtcGuess.getTime() - offsetMin * 60 * 1000);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // GMT+2 / GMT-5 / UTC
  const m = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/i) || tzName.match(/UTC([+-])(\d+)/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  return sign * (hours * 60 + mins);
}

function mapBookingEstado(b: SimplyBookBooking): "activa" | "cancelada" {
  const confirmed = b.is_confirmed;
  if (confirmed === 0 || confirmed === "0" || confirmed === false) return "cancelada";
  return "activa";
}

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

  for (const b of bookings) {
    const startsAt = bookingStartDateTime(b);
    if (!startsAt) continue;
    const endsAt = bookingEndDateTime(b);
    const simplybookId = String(b.id);
    const estado = mapBookingEstado(b);
    const reminderDueAt =
      estado === "activa" ? computeReminderDueAt(startsAt, config) : null;

    const { error } = await supabase.from("citas_simplybook").upsert(
      {
        simplybook_id: simplybookId,
        cliente_nombre: b.client_name ? String(b.client_name) : null,
        cliente_telefono: bookingPhone(b),
        cliente_email: b.client_email ? String(b.client_email) : null,
        servicio_nombre: b.event_name ? String(b.event_name) : null,
        profesional_nombre: b.unit_name ? String(b.unit_name) : null,
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
  estado: string;
};

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
  if (!isEsendexConfigured()) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: ["Esendex no configurado (falta ESENDEX_*)"],
    };
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: plantilla, error: plantillaErr } = await supabase
    .from("sms_plantillas")
    .select("clave, cuerpo, activa")
    .eq("clave", "recordatorio_cita")
    .maybeSingle();

  if (plantillaErr || !plantilla?.activa || !plantilla.cuerpo) {
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
    .select(
      "id, simplybook_id, cliente_nombre, cliente_telefono, servicio_nombre, profesional_nombre, starts_at, reminder_due_at, reminder_sent_at, estado"
    )
    .eq("estado", "activa")
    .is("reminder_sent_at", null)
    .lte("reminder_due_at", nowIso)
    .gt("starts_at", nowIso)
    .order("reminder_due_at", { ascending: true })
    .limit(40);

  if (citasErr) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [citasErr.message] };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const list = (citas ?? []) as CitaRow[];

  for (const cita of list) {
    const phone = normalizePhoneE164(cita.cliente_telefono);
    const startsAt = new Date(cita.starts_at);
    const fecha = formatInTimeZone(startsAt, config.timezone, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const hora = formatInTimeZone(startsAt, config.timezone, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const cuerpo = renderSmsTemplate(plantilla.cuerpo, {
      cliente: cita.cliente_nombre ?? undefined,
      servicio: cita.servicio_nombre ?? undefined,
      fecha,
      hora,
      profesional: cita.profesional_nombre ?? undefined,
    });

    if (!phone) {
      skipped += 1;
      await supabase
        .from("citas_simplybook")
        .update({
          reminder_sent_at: nowIso,
          reminder_skipped_reason: "Sin teléfono válido",
          updated_at: nowIso,
        })
        .eq("id", cita.id);

      await supabase.from("sms_envios").insert({
        cita_id: cita.id,
        telefono: cita.cliente_telefono ?? "",
        cuerpo,
        estado: "omitido",
        error_mensaje: "Sin teléfono válido",
        plantilla_clave: plantilla.clave,
        enviado_at: nowIso,
      });
      continue;
    }

    const result = await sendSmsEsendex(phone, cuerpo);
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
        updated_at: nowIso,
      })
      .eq("id", cita.id);

    await supabase.from("sms_envios").insert({
      cita_id: cita.id,
      telefono: phone,
      cuerpo,
      estado: "enviado",
      esendex_message_id: result.messageId,
      esendex_batch_id: result.batchId,
      plantilla_clave: plantilla.clave,
      enviado_at: nowIso,
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
    client_name: String(payload.client_name ?? payload.clientName ?? payload.name ?? "") || undefined,
    client_phone: String(payload.client_phone ?? payload.clientPhone ?? payload.phone ?? "") || undefined,
    client_email: String(payload.client_email ?? payload.clientEmail ?? payload.email ?? "") || undefined,
    event_name: String(payload.event_name ?? payload.service_name ?? payload.service ?? "") || undefined,
    unit_name: String(payload.unit_name ?? payload.provider ?? payload.professional ?? "") || undefined,
    start_datetime: String(payload.start_datetime ?? payload.start ?? "") || undefined,
    end_datetime: String(payload.end_datetime ?? payload.end ?? "") || undefined,
    start_date: String(payload.start_date ?? payload.date ?? "") || undefined,
    start_time: String(payload.start_time ?? payload.time ?? "") || undefined,
    is_confirmed: payload.is_confirmed as number | boolean | undefined,
  };

  const eventType = String(payload.notification_type ?? payload.event ?? payload.type ?? "").toLowerCase();
  const cancelled =
    eventType.includes("cancel") ||
    payload.cancelled === true ||
    mapBookingEstado(pseudo) === "cancelada";

  const startsAt = bookingStartDateTime(pseudo);
  if (!startsAt && !cancelled) {
    throw new Error("Webhook sin fecha/hora de inicio");
  }

  const estado = cancelled ? "cancelada" : "activa";
  const reminderDueAt =
    estado === "activa" && startsAt ? computeReminderDueAt(startsAt, config) : null;

  await supabase.from("citas_simplybook").upsert(
    {
      simplybook_id: simplybookId,
      cliente_nombre: pseudo.client_name ?? null,
      cliente_telefono: bookingPhone(pseudo),
      cliente_email: pseudo.client_email ?? null,
      servicio_nombre: pseudo.event_name ?? null,
      profesional_nombre: pseudo.unit_name ?? null,
      starts_at: (startsAt ?? new Date()).toISOString(),
      ends_at: bookingEndDateTime(pseudo)?.toISOString() ?? null,
      estado,
      reminder_due_at: reminderDueAt?.toISOString() ?? null,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "simplybook_id" }
  );
}
