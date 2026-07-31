import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/sms/auth-cron";

export const runtime = "nodejs";

/**
 * Keep-alive del proyecto Supabase (plan Free).
 * Una consulta ligera al día evita la pausa por inactividad (~7 días).
 * Proteger con CRON_SECRET.
 */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      console.error("[cron/keepalive]", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error keep-alive";
    console.error("[cron/keepalive]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
