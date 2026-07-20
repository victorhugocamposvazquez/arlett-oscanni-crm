import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Numeración de factura ordinaria: N-OC-AAAA (ej. 1-OC-2026)
 * Rectificativas: FR-N-OC-AAAA (ej. FR-1-OC-2026)
 * También se reconocen variantes con "-oc-" en minúsculas y el formato antiguo N/AAAA, FR-N/AAAA.
 */

export function anioEmisionFecha(fechaEmision: string | null | undefined): number {
  if (fechaEmision && /^\d{4}-\d{2}-\d{2}/.test(fechaEmision)) {
    return new Date(fechaEmision + "T12:00:00").getFullYear();
  }
  return new Date().getFullYear();
}

const reOrdinaria = (year: number) => new RegExp(`^(\\d+)-OC-${year}$`);
const reOrdinariaOcLower = (year: number) => new RegExp(`^(\\d+)-oc-${year}$`);
const reOrdinariaLegacy = (year: number) => new RegExp(`^(\\d+)/${year}$`);
const reRectificativa = (year: number) => new RegExp(`^FR-(\\d+)-OC-${year}$`);
const reRectificativaOcLower = (year: number) => new RegExp(`^FR-(\\d+)-oc-${year}$`);
const reRectificativaLegacy = (year: number) => new RegExp(`^FR-(\\d+)/${year}$`);

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

function maxCorrelativoEjercicio(numeros: string[], ordinaria: boolean, year: number): number {
  if (ordinaria) {
    return Math.max(
      maxFromMatches(numeros, reOrdinaria(year)),
      maxFromMatches(numeros, reOrdinariaOcLower(year)),
      maxFromMatches(numeros, reOrdinariaLegacy(year))
    );
  }
  return Math.max(
    maxFromMatches(numeros, reRectificativa(year)),
    maxFromMatches(numeros, reRectificativaOcLower(year)),
    maxFromMatches(numeros, reRectificativaLegacy(year))
  );
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
    const next = maxCorrelativoEjercicio(numeros, false, year) + 1;
    return `FR-${next}-OC-${y}`;
  }

  const { data, error } = await supabase
    .from("facturas")
    .select("numero")
    .or("tipo_factura.eq.ordinaria,tipo_factura.is.null");

  if (error) throw new Error(error.message);
  const numeros = (data ?? []).map((r) => (r as { numero: string }).numero);
  const next = maxCorrelativoEjercicio(numeros, true, year) + 1;
  return `${next}-OC-${y}`;
}
