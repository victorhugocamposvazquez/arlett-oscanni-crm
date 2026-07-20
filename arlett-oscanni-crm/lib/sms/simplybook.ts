/**
 * Cliente SimplyBook.me (JSON-RPC User API / Admin).
 * Docs: https://simplybook.me/en/api/developer-api
 */

type JsonRpcResponse<T> = {
  jsonrpc: string;
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

export type SimplyBookBooking = {
  id: string | number;
  code?: string;
  client_id?: string | number;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  event_id?: string | number;
  event_name?: string;
  unit_id?: string | number;
  unit_name?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  start_datetime?: string;
  end_datetime?: string;
  is_confirmed?: number | boolean | string;
  record_date?: string;
  [key: string]: unknown;
};

function getSimplyBookEnv() {
  const companyLogin = process.env.SIMPLYBOOK_COMPANY_LOGIN?.trim();
  const userLogin = process.env.SIMPLYBOOK_USER_LOGIN?.trim();
  const userPassword = process.env.SIMPLYBOOK_USER_PASSWORD?.trim();
  const apiKey = process.env.SIMPLYBOOK_API_KEY?.trim();

  if (!companyLogin) return null;
  // Prefer user token (admin API getBookings); fallback company API key if only that exists
  if (userLogin && userPassword) {
    return { companyLogin, mode: "user" as const, userLogin, userPassword };
  }
  if (apiKey) {
    return { companyLogin, mode: "company" as const, apiKey };
  }
  return null;
}

export function isSimplyBookConfigured(): boolean {
  return getSimplyBookEnv() !== null;
}

let cachedToken: { token: string; mode: "user" | "company"; expiresAt: number } | null = null;

async function jsonRpcCall<T>(
  url: string,
  method: string,
  params: unknown[],
  headers: Record<string, string> = {}
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    }),
    cache: "no-store",
  });

  const data = (await res.json()) as JsonRpcResponse<T>;
  if (!res.ok) {
    throw new Error(`SimplyBook HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  if (data.error) {
    throw new Error(`SimplyBook ${data.error.code}: ${data.error.message}`);
  }
  return data.result as T;
}

async function getAuthHeaders(): Promise<{ companyLogin: string; headers: Record<string, string> }> {
  const env = getSimplyBookEnv();
  if (!env) {
    throw new Error(
      "SimplyBook no configurado (SIMPLYBOOK_COMPANY_LOGIN + USER_LOGIN/PASSWORD o API_KEY)"
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now && cachedToken.mode === (env.mode === "user" ? "user" : "company")) {
    if (env.mode === "user") {
      return {
        companyLogin: env.companyLogin,
        headers: {
          "X-Company-Login": env.companyLogin,
          "X-User-Token": cachedToken.token,
        },
      };
    }
    return {
      companyLogin: env.companyLogin,
      headers: {
        "X-Company-Login": env.companyLogin,
        "X-Token": cachedToken.token,
      },
    };
  }

  if (env.mode === "user") {
    const token = await jsonRpcCall<string>(
      "https://user-api.simplybook.me/login",
      "getUserToken",
      [env.companyLogin, env.userLogin, env.userPassword]
    );
    cachedToken = { token, mode: "user", expiresAt: now + 50 * 60 * 1000 };
    return {
      companyLogin: env.companyLogin,
      headers: {
        "X-Company-Login": env.companyLogin,
        "X-User-Token": token,
      },
    };
  }

  const token = await jsonRpcCall<string>(
    "https://user-api.simplybook.me/login",
    "getToken",
    [env.companyLogin, env.apiKey]
  );
  cachedToken = { token, mode: "company", expiresAt: now + 50 * 60 * 1000 };
  return {
    companyLogin: env.companyLogin,
    headers: {
      "X-Company-Login": env.companyLogin,
      "X-Token": token,
    },
  };
}

/** Lista reservas en un rango de fechas (admin API). */
export async function fetchSimplyBookBookings(dateFrom: string, dateTo: string): Promise<SimplyBookBooking[]> {
  const { headers } = await getAuthHeaders();
  const env = getSimplyBookEnv();
  if (!env) throw new Error("SimplyBook no configurado");

  // Admin endpoint (getBookings)
  const result = await jsonRpcCall<SimplyBookBooking[] | Record<string, SimplyBookBooking>>(
    "https://user-api.simplybook.me/admin",
    "getBookings",
    [
      {
        date_from: dateFrom,
        date_to: dateTo,
        booking_type: "non_cancelled",
        order: "date_start_asc",
      },
    ],
    headers
  );

  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") return Object.values(result);
  return [];
}

export function bookingStartDateTime(b: SimplyBookBooking): Date | null {
  if (b.start_datetime) {
    const d = new Date(String(b.start_datetime).replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (b.start_date && b.start_time) {
    const d = new Date(`${b.start_date}T${b.start_time}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function bookingEndDateTime(b: SimplyBookBooking): Date | null {
  if (b.end_datetime) {
    const d = new Date(String(b.end_datetime).replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (b.end_date && b.end_time) {
    const d = new Date(`${b.end_date}T${b.end_time}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function bookingPhone(b: SimplyBookBooking): string | null {
  const candidates = [b.client_phone, b.phone, (b as { client?: { phone?: string } }).client?.phone];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}
