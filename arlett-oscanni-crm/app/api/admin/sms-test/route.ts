import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sms/auth-admin";
import { sendReminderForCita } from "@/lib/sms/reminders";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Zona de pruebas: manda el recordatorio de UNA cita concreta al momento.
 * Con `real: true` el SMS sale de verdad aunque el modo prueba esté activo, para
 * poder verificar el circuito completo con una cita propia antes de abrir el
 * grifo a toda la agenda.
 */
export async function POST(request: Request) {
  try {
    const denied = await denyIfNotAdmin();
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as {
      citaId?: string;
      real?: boolean;
    } | null;

    if (!body?.citaId) {
      return NextResponse.json({ error: "Falta la cita" }, { status: 400 });
    }

    const result = await sendReminderForCita(body.citaId, { forzarReal: body.real === true });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    console.log(`[sms-test] → ${result.telefono} (real: ${!result.simulado})`);
    return NextResponse.json({
      ok: true,
      telefono: result.telefono,
      cuerpo: result.cuerpo,
      simulado: result.simulado,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[admin/sms-test]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
