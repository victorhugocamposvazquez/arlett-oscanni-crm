import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWebhookSecret } from "@/lib/sms/auth-cron";

export const runtime = "nodejs";

/**
 * Push de estado de entrega Esendex (MessageEvents / Push Notifications).
 * Header: x-webhook-secret: ESENDEX_WEBHOOK_SECRET (opcional en prod).
 */
export async function POST(req: Request) {
  if (!authorizeWebhookSecret(req, "ESENDEX_WEBHOOK_SECRET")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
    const events = Array.isArray(body) ? body : [body];
    const supabase = createAdminClient();
    let updated = 0;

    for (const ev of events) {
      const messageId = String(
        ev.id ?? ev.messageId ?? ev.MessageId ?? (ev.message as { id?: string } | undefined)?.id ?? ""
      );
      if (!messageId || messageId === "undefined") continue;

      const statusRaw = String(
        ev.status ?? ev.Status ?? ev.type ?? ev.eventType ?? ""
      ).toLowerCase();

      let estado: "entregado" | "fallido" | null = null;
      if (
        statusRaw.includes("delivered") ||
        statusRaw.includes("entreg") ||
        statusRaw === "delivered"
      ) {
        estado = "entregado";
      } else if (
        statusRaw.includes("fail") ||
        statusRaw.includes("undeliver") ||
        statusRaw.includes("expired") ||
        statusRaw.includes("reject")
      ) {
        estado = "fallido";
      }

      if (!estado) continue;

      const patch: Record<string, unknown> = {
        estado,
        updated_at: new Date().toISOString(),
      };
      if (estado === "entregado") patch.entregado_at = new Date().toISOString();
      if (estado === "fallido" && ev.reason) {
        patch.error_mensaje = String(ev.reason);
      }

      const { error } = await supabase
        .from("sms_envios")
        .update(patch)
        .eq("esendex_message_id", messageId);

      if (!error) updated += 1;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error webhook Esendex";
    console.error("[webhooks/esendex]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
