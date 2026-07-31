import { gsmLength } from "@/lib/sms/gsm";

export type LabsMobileSendResult =
  | { ok: true; subid: string | null; code: string }
  | { ok: false; error: string; code?: string; status?: number };

function getLabsMobileConfig() {
  const username = process.env.LABSMOBILE_USERNAME?.trim();
  const apiToken = process.env.LABSMOBILE_API_TOKEN?.trim();
  const sender = process.env.LABSMOBILE_SENDER?.trim() || undefined;
  const ackUrl = process.env.LABSMOBILE_ACK_URL?.trim() || undefined;
  const testMode = process.env.LABSMOBILE_TEST_MODE?.trim() === "1";

  if (!username || !apiToken) {
    return null;
  }
  return { username, apiToken, sender, ackUrl, testMode };
}

export function isLabsMobileConfigured(): boolean {
  return getLabsMobileConfig() !== null;
}

export function isLabsMobileTestMode(): boolean {
  return getLabsMobileConfig()?.testMode ?? false;
}

/** Identificador propio para cruzar los ACK de entrega (máx. 20 caracteres en LabsMobile). */
export function generateSubid(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `a${Date.now().toString(36)}${rand}`.slice(0, 20);
}


/**
 * Envía un SMS con la API http/POST de LabsMobile.
 * La API responde HTTP 200 incluso en error: hay que comprobar `code` ("0" = enviado).
 */
export async function sendSmsLabsMobile(
  toE164: string,
  body: string,
  options: { subid?: string } = {}
): Promise<LabsMobileSendResult> {
  const cfg = getLabsMobileConfig();
  if (!cfg) {
    return {
      ok: false,
      error: "LabsMobile no configurado (LABSMOBILE_USERNAME, LABSMOBILE_API_TOKEN)",
    };
  }

  const auth = Buffer.from(`${cfg.username}:${cfg.apiToken}`).toString("base64");
  const payload: Record<string, unknown> = {
    message: body,
    recipient: [{ msisdn: toE164 }],
  };
  const gsmChars = gsmLength(body);
  const needsUnicode = gsmChars === null;
  // Unicode reduce la capacidad de 160 a 70 caracteres por SMS
  const usedChars = gsmChars ?? [...body].length;
  if (needsUnicode) payload.ucs2 = 1;
  if (usedChars > (needsUnicode ? 70 : 160)) payload.long = 1;

  if (cfg.sender) payload.tpoa = cfg.sender;
  if (options.subid) payload.subid = options.subid;
  if (cfg.ackUrl) payload.ackurl = cfg.ackUrl;
  if (cfg.testMode) payload.test = 1;

  let res: Response;
  try {
    res = await fetch("https://api.labsmobile.com/json/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red con LabsMobile" };
  }

  type LabsMobileResponse = { code?: string | number; message?: string; subid?: string };
  const text = await res.text();
  let json: LabsMobileResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as LabsMobileResponse) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error: json?.message ?? text.slice(0, 300) ?? `HTTP ${res.status}`,
      code: json?.code !== undefined ? String(json.code) : undefined,
      status: res.status,
    };
  }

  const code = json?.code !== undefined ? String(json.code) : "";
  if (code !== "0") {
    return {
      ok: false,
      error: json?.message ?? `LabsMobile código ${code || "desconocido"}`,
      code: code || undefined,
      // 401/403 de LabsMobile llegan como code en el cuerpo; se propaga para cortar el bucle
      status: code === "401" || code === "403" ? Number(code) : undefined,
    };
  }

  return { ok: true, subid: json?.subid ?? options.subid ?? null, code };
}
