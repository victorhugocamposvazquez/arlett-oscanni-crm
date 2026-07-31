/**
 * Cliente SimplyBook.me (JSON-RPC User API / Admin).
 * Docs: https://simplybook.me/en/api/developer-api
 */

import { DEFAULT_TIMEZONE, zonedNaiveToDate } from "@/lib/sms/tz";

type JsonRpcResponse<T> = {
  jsonrpc: string;
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

/**
 * Reserva devuelta por getBookings. La API entrega `client`, `event` y `unit`
 * con los nombres, `is_confirm` como estado y las fechas en `start_date` /
 * `end_date` ya con la hora incluida y en la zona horaria del negocio. Se
 * mantienen los alias `*_name`, `*_datetime` y `is_confirmed` porque los usan
 * otras versiones de la API y los payloads de webhook.
 */
export type SimplyBookBooking = {
  id: string | number;
  code?: string;
  client_id?: string | number;
  client?: string | { name?: string; phone?: string };
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  event_id?: string | number;
  event?: string;
  event_name?: string;
  unit_id?: string | number;
  unit?: string;
  unit_name?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  start_datetime?: string;
  end_datetime?: string;
  is_confirm?: number | boolean | string;
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

/** `start_date` puede venir como "2026-07-31 10:30:00" o partido en fecha + hora. */
function parseBookingMoment(
  datetime: string | undefined,
  date: string | undefined,
  time: string | undefined,
  timeZone: string
): Date | null {
  const candidates = [datetime, date && time ? `${date.slice(0, 10)} ${time}` : undefined, date];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const d = zonedNaiveToDate(String(candidate), timeZone);
    if (d) return d;
  }
  return null;
}

export function bookingStartDateTime(
  b: SimplyBookBooking,
  timeZone: string = DEFAULT_TIMEZONE
): Date | null {
  return parseBookingMoment(b.start_datetime, b.start_date, b.start_time, timeZone);
}

export function bookingEndDateTime(
  b: SimplyBookBooking,
  timeZone: string = DEFAULT_TIMEZONE
): Date | null {
  return parseBookingMoment(b.end_datetime, b.end_date, b.end_time, timeZone);
}

function firstNonEmptyName(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const name = (value as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return null;
}

export function bookingClientName(b: SimplyBookBooking): string | null {
  return firstNonEmptyName(b.client_name, b.client);
}

export function bookingServiceName(b: SimplyBookBooking): string | null {
  return firstNonEmptyName(b.event_name, b.event);
}

export function bookingProviderName(b: SimplyBookBooking): string | null {
  return firstNonEmptyName(b.unit_name, b.unit);
}

export function bookingPhone(b: SimplyBookBooking): string | null {
  const nested = typeof b.client === "object" ? b.client?.phone : undefined;
  const candidates = [b.client_phone, b.phone, nested];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/** `is_confirm` a 0 significa cita cancelada. */
export function bookingIsCancelled(b: SimplyBookBooking): boolean {
  const flag = b.is_confirmed ?? b.is_confirm;
  return flag === 0 || flag === "0" || flag === false;
}
