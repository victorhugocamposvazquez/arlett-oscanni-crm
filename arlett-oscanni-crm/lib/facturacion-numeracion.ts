import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Numeración de factura ordinaria: N/AAAA (ej. 1/2026)
 * Rectificativas: FR-N/AAAA (ej. FR-1/2026)
 */

export function anioEmisionFecha(fechaEmision: string | null | undefined): number {
  if (fechaEmision && /^\d{4}-\d{2}-\d{2}/.test(fechaEmision)) {
    return new Date(fechaEmision + "T12:00:00").getFullYear();
  }
  return new Date().getFullYear();
}

const reOrdinaria = (year: number) => new RegExp(`^(\\d+)/${year}$`);
const reRectificativa = (year: number) => new RegExp(`^FR-(\\d+)/${year}$`);

function maxFromMatches(numeros: string[], re: RegExp): number {
  let max = 0;
  for (const n of numeros) {
    const m = n.trim().match(re);
    if (m) {
      const v = parseInt(m[1], 10);
      if (!Number.isNaN(v)) max = Math.max(max, v);
    }
  }
  return max;
}

/**
 * Calcula el siguiente número de factura (ordinaria o rectificativa) en el ejercicio `year`.
 * El correlativo se obtiene de los `numero` existentes cuyo formato coincide; no se usa orden
 * lexicográfico del texto.
 */
export async function siguienteNumeroFactura(
  supabase: SupabaseClient<Database>,
  options: { year: number; esRectificativa: boolean }
): Promise<string> {
  const { year, esRectificativa } = options;
  const y = String(year);

  if (esRectificativa) {
    const { data, error } = await supabase
      .from("facturas")
      .select("numero")
      .eq("tipo_factura", "rectificativa");

    if (error) throw new Error(error.message);
    const numeros = (data ?? []).map((r) => (r as { numero: string }).numero);
    const next = maxFromMatches(numeros, reRectificativa(year)) + 1;
    return `FR-${next}/${y}`;
  }

  const { data, error } = await supabase
    .from("facturas")
    .select("numero")
    .or("tipo_factura.eq.ordinaria,tipo_factura.is.null");

  if (error) throw new Error(error.message);
  const numeros = (data ?? []).map((r) => (r as { numero: string }).numero);
  const next = maxFromMatches(numeros, reOrdinaria(year)) + 1;
  return `${next}/${y}`;
}
