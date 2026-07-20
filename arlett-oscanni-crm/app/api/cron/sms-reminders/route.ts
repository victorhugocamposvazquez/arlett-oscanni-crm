import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/sms/auth-cron";
import { processDueReminders, syncSimplyBookAppointments } from "@/lib/sms/reminders";
import { isSimplyBookConfigured } from "@/lib/sms/simplybook";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron diario (Hobby): 19:00 UTC ≈ 21:00 Europe/Madrid en horario de verano (CEST).
 * En invierno (CET) equivale a 20:00 Madrid; si quieres 21:00 exactas todo el año, cambia a "0 20 * * *" en invierno.
 * Proteger con CRON_SECRET (Authorization: Bearer …).
 */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    let sync: { upserted: number } | { skipped: string } = { skipped: "SimplyBook no configurado" };
    if (isSimplyBookConfigured()) {
      sync = await syncSimplyBookAppointments(14);
    }

    const send = await processDueReminders();

    console.info("[cron/sms-reminders]", { sync, send });
    return NextResponse.json({ ok: true, sync, send });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en cron SMS";
    console.error("[cron/sms-reminders]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
