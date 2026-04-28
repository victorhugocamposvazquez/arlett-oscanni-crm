/** Normaliza comas a punto (formato ES en inputs de texto) */
export function normalizarSeparadorDecimal(s: string): string {
  return s.replace(/,/g, ".").trim();
}

/**
 * Parseo tolerante mientras el usuario escribe (permite "10." sin perder el punto en el estado de borrador).
 */
export function parseDecimalMientrasEscribe(
  s: string,
  options?: { allowNegative?: boolean; min?: number }
): number {
  const t = normalizarSeparadorDecimal(s);
  if (t === "" || t === "." || t === "-") return 0;
  const n = parseFloat(t);
  if (Number.isNaN(n)) return 0;
  if (options?.allowNegative) {
    if (options.min !== undefined) return n < options.min ? options.min : n;
    return n;
  }
  let v = Math.max(0, n);
  if (options?.min !== undefined) v = Math.max(options.min, v);
  return v;
}
