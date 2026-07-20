/** Normaliza teléfonos ES a E.164 sin +: 34600111222 */
export function normalizePhoneE164(raw: string | null | undefined, defaultCountry = "34"): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  digits = digits.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);

  // Móvil España 9 dígitos empezando por 6/7
  if (digits.length === 9 && /^[67]/.test(digits)) {
    return `${defaultCountry}${digits}`;
  }
  // Ya con prefijo 34
  if (digits.length === 11 && digits.startsWith("34")) {
    return digits;
  }
  // Internacional genérico (mín. 10 dígitos)
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}
