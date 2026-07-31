import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isTestMode,
  loadSmsConfig,
  processDueReminders,
  syncSimplyBookAppointments,
} from "@/lib/sms/reminders";
import { isSimplyBookConfigured } from "@/lib/sms/simplybook";
import { isLabsMobileConfigured, isLabsMobileTestModeForced } from "@/lib/sms/labsmobile";

export const runtime = "nodejs";
export const maxDuration = 60;

async function denyIfNotAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  return null;
}

/** Estado del proveedor, para que el backoffice avise si está en modo de prueba. */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const config = await loadSmsConfig();
  return NextResponse.json({
    ok: true,
    simulado: isTestMode(config),
    // Con el candado echado el interruptor del backoffice no puede desactivarlo
    forzadoPorEntorno: isLabsMobileTestModeForced(),
    labsmobile: isLabsMobileConfigured(),
    simplybook: isSimplyBookConfigured(),
  });
}

/** Disparo manual (solo admin autenticado) desde el backoffice SMS. */
export async function POST() {
  try {
    const denied = await denyIfNotAdmin();
    if (denied) return denied;

    let sync: { upserted: number } | { skipped: string } = { skipped: "SimplyBook no configurado" };
    if (isSimplyBookConfigured()) {
      sync = await syncSimplyBookAppointments(14);
    }
    const send = await processDueReminders();

    return NextResponse.json({
      ok: true,
      sync,
      send,
      simulado: isTestMode(await loadSmsConfig()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[admin/sms-run]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
