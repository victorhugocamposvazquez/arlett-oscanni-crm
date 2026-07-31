import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sms/auth-admin";
import { fetchSimplyBookServices, isSimplyBookConfigured } from "@/lib/sms/simplybook";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Catálogo de servicios de SimplyBook, para que el backoffice pueda ponerles
 * nombre propio aunque todavía no tengan ninguna cita en la agenda.
 */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  if (!isSimplyBookConfigured()) {
    return NextResponse.json({ ok: true, servicios: [], aviso: "SimplyBook no configurado" });
  }

  try {
    const servicios = await fetchSimplyBookServices();
    return NextResponse.json({
      ok: true,
      // Varios nombres llegan con espacios sobrantes ("Hifu - 1 Hora ")
      servicios: servicios
        .map((s) => (s.name ? String(s.name).replace(/\s+/g, " ").trim() : ""))
        .filter((n) => n.length > 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[admin/sms-servicios]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
