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

export type PhoneRejectReason = "sin_telefono" | "formato" | "no_movil" | "ficticio";

/** Motivos legibles para el histórico y el backoffice. */
export const PHONE_REJECT_LABEL: Record<PhoneRejectReason, string> = {
  sin_telefono: "Sin teléfono",
  formato: "Formato no válido",
  no_movil: "No es un móvil",
  ficticio: "Número ficticio",
};

export type PhoneCheck =
  | { ok: true; phone: string }
  | { ok: false; reason: PhoneRejectReason; label: string };

/**
 * Números de relleno que se cuelan en las reservas (+34 000 000 000,
 * 666666666, 612345678…). LabsMobile los factura igual que uno bueno, así que
 * conviene descartarlos antes de llamar a la API.
 */
function isFakeNumber(national: string): boolean {
  if (national.startsWith("0")) return true;
  if (new Set(national).size <= 2) return true;
  const ascendente = [...national].every(
    (d, i, arr) => i === 0 || Number(d) === Number(arr[i - 1]) + 1
  );
  const descendente = [...national].every(
    (d, i, arr) => i === 0 || Number(d) === Number(arr[i - 1]) - 1
  );
  return ascendente || descendente;
}

/**
 * Decide si merece la pena gastar un SMS en este teléfono. Los fijos españoles
 * (9xx, 8xx) no reciben SMS pero se cobran igual, así que se descartan.
 */
export function checkPhoneForSms(
  raw: string | null | undefined,
  defaultCountry = "34"
): PhoneCheck {
  const reject = (reason: PhoneRejectReason): PhoneCheck => ({
    ok: false,
    reason,
    label: PHONE_REJECT_LABEL[reason],
  });

  if (!raw || !raw.trim()) return reject("sin_telefono");

  const phone = normalizePhoneE164(raw, defaultCountry);
  if (!phone) return reject("formato");

  const national = phone.startsWith("34") && phone.length === 11 ? phone.slice(2) : phone;
  if (isFakeNumber(national)) return reject("ficticio");

  if (phone.startsWith("34") && phone.length === 11 && !/^[67]/.test(national)) {
    return reject("no_movil");
  }

  return { ok: true, phone };
}
