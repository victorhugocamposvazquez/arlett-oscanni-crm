import { NextResponse } from "next/server";
import { authorizeWebhookSecret } from "@/lib/sms/auth-cron";
import { upsertCitaFromWebhookPayload } from "@/lib/sms/reminders";

export const runtime = "nodejs";

/**
 * Webhook SimplyBook / Zapier (create, change, cancel).
 * Header: x-webhook-secret: SIMPLYBOOK_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  if (!authorizeWebhookSecret(req, "SIMPLYBOOK_WEBHOOK_SECRET")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const payload = (await req.json()) as Record<string, unknown>;
    await upsertCitaFromWebhookPayload(payload);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error webhook SimplyBook";
    console.error("[webhooks/simplybook]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
