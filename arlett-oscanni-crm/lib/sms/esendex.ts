export type EsendexSendResult =
  | { ok: true; messageId: string | null; batchId: string | null }
  | { ok: false; error: string; status?: number };

function getEsendexConfig() {
  const accountRef = process.env.ESENDEX_ACCOUNT_REF?.trim();
  const username = process.env.ESENDEX_USERNAME?.trim();
  const apiPassword = process.env.ESENDEX_API_PASSWORD?.trim();
  const from = process.env.ESENDEX_FROM?.trim() || undefined;

  if (!accountRef || !username || !apiPassword) {
    return null;
  }
  return { accountRef, username, apiPassword, from };
}

export function isEsendexConfigured(): boolean {
  return getEsendexConfig() !== null;
}

/** Envía un SMS vía Esendex REST (messagedispatcher). */
export async function sendSmsEsendex(toE164: string, body: string): Promise<EsendexSendResult> {
  const cfg = getEsendexConfig();
  if (!cfg) {
    return {
      ok: false,
      error: "Esendex no configurado (ESENDEX_ACCOUNT_REF, ESENDEX_USERNAME, ESENDEX_API_PASSWORD)",
    };
  }

  const auth = Buffer.from(`${cfg.username}:${cfg.apiPassword}`).toString("base64");
  const message: Record<string, string> = {
    to: toE164,
    body,
  };
  if (cfg.from) {
    message.from = cfg.from;
  }

  const res = await fetch("https://api.esendex.com/v1.0/messagedispatcher", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      accountreference: cfg.accountRef,
      messages: [message],
    }),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errMsg =
      typeof json === "object" && json && "errors" in json
        ? JSON.stringify((json as { errors: unknown }).errors)
        : text.slice(0, 500) || res.statusText;
    return { ok: false, error: errMsg || `HTTP ${res.status}`, status: res.status };
  }

  const batch = (json as { batch?: { batchid?: string; messageheaders?: Array<{ id?: string }> } })?.batch;
  const messageId = batch?.messageheaders?.[0]?.id ?? null;
  const batchId = batch?.batchid ?? null;
  return { ok: true, messageId, batchId };
}
