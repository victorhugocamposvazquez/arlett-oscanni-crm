import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type EmisorFacturacion = {
  razon_social: string;
  nif: string;
  direccion: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono: string;
  email: string;
  iban: string;
  numero_cuenta_bancaria: string;
  /** URL absoluta o ruta con /; vacío = logo por defecto de la app */
  logo_url: string;
};

const envDefaults = (): EmisorFacturacion => ({
  razon_social: process.env.NEXT_PUBLIC_BILLING_COMPANY_NAME ?? "Tu Empresa S.L.",
  nif: process.env.NEXT_PUBLIC_BILLING_COMPANY_NIF ?? "B00000000",
  direccion:
    process.env.NEXT_PUBLIC_BILLING_COMPANY_ADDRESS ?? "Calle Ejemplo 1, 28001 Madrid, España",
  codigo_postal: process.env.NEXT_PUBLIC_BILLING_COMPANY_CP ?? "28001",
  localidad: process.env.NEXT_PUBLIC_BILLING_COMPANY_CITY ?? "Madrid",
  provincia: process.env.NEXT_PUBLIC_BILLING_COMPANY_PROVINCE ?? "Madrid",
  telefono: "",
  email: "",
  iban: process.env.NEXT_PUBLIC_BILLING_COMPANY_IBAN ?? "ES00 0000 0000 0000 0000 0000",
  numero_cuenta_bancaria: "",
  logo_url: (process.env.NEXT_PUBLIC_BILLING_LOGO_URL ?? "").trim(),
});

function pick(row: {
  razon_social: string;
  nif: string;
  direccion: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono: string | null;
  email: string | null;
  iban: string | null;
  numero_cuenta_bancaria: string | null;
  logo_url: string | null;
} | null): EmisorFacturacion {
  const d = envDefaults();
  if (!row) return d;
  const t = (s: string | null | undefined) => (s?.trim() ? s.trim() : "");
  return {
    razon_social: t(row.razon_social) || d.razon_social,
    nif: t(row.nif) || d.nif,
    direccion: t(row.direccion) || d.direccion,
    codigo_postal: t(row.codigo_postal) || d.codigo_postal,
    localidad: t(row.localidad) || d.localidad,
    provincia: t(row.provincia) || d.provincia,
    telefono: t(row.telefono) || d.telefono,
    email: t(row.email) || d.email,
    iban: t(row.iban) || d.iban,
    numero_cuenta_bancaria: t(row.numero_cuenta_bancaria) || d.numero_cuenta_bancaria,
    logo_url: t(row.logo_url) || d.logo_url,
  };
}

/**
 * Carga los datos de emisor: primero fila 1 de empresa_facturación, rellenando vacíos con env/defaults.
 */
export async function fetchEmisorFacturacion(
  supabase: SupabaseClient<Database>
): Promise<EmisorFacturacion> {
  const { data, error } = await supabase
    .from("empresa_facturacion")
    .select(
      "razon_social, nif, direccion, codigo_postal, localidad, provincia, telefono, email, iban, numero_cuenta_bancaria, logo_url"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return envDefaults();
  }
  return pick(data);
}

/** Construye la URL final del logotipo en la ventana de impresión. */
export function resolveInvoiceLogoUrl(logoUrl: string, origin: string): string {
  const fallback = `${origin}/images/logo-web.png`;
  const raw = logoUrl.trim();
  if (!raw) return fallback;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${origin}${raw}`;
  return fallback;
}
