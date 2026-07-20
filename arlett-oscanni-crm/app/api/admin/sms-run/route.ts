import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processDueReminders, syncSimplyBookAppointments } from "@/lib/sms/reminders";
import { isSimplyBookConfigured } from "@/lib/sms/simplybook";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Disparo manual (solo admin autenticado) desde el backoffice SMS. */
export async function POST() {
  try {
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

    let sync: { upserted: number } | { skipped: string } = { skipped: "SimplyBook no configurado" };
    if (isSimplyBookConfigured()) {
      sync = await syncSimplyBookAppointments(14);
    }
    const send = await processDueReminders();

    return NextResponse.json({ ok: true, sync, send });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[admin/sms-run]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
