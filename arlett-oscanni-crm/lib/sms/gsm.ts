/**
 * Alfabeto GSM 03.38, el único que admite un SMS estándar. Todo lo que se sale
 * de aquí obliga a enviar el mensaje en Unicode, donde la capacidad baja de 160
 * a 70 caracteres y un recordatorio normal pasa a costar dos SMS.
 */

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Cuentan como dos caracteres al ir precedidos de un escape. */
const GSM_EXTENDED = "^{}\\[~]|€\f";

function isGsmChar(char: string): boolean {
  return GSM_BASIC.includes(char) || GSM_EXTENDED.includes(char);
}

/** Longitud en caracteres GSM, o null si el texto necesita Unicode. */
export function gsmLength(text: string): number | null {
  let length = 0;
  for (const char of text) {
    if (GSM_BASIC.includes(char)) length += 1;
    else if (GSM_EXTENDED.includes(char)) length += 2;
    else return null;
  }
  return length;
}

/**
 * Sustituye por su equivalente sin acento los caracteres que no caben en GSM,
 * para que un servicio como "Depilación láser" no duplique el coste del envío.
 * Respeta los acentos que sí existen en GSM (é, è, à, ñ, ü, ç…), así que
 * "Coruña" se mantiene intacto.
 */
export function toGsmSafeText(text: string): string {
  let out = "";
  for (const char of text) {
    if (isGsmChar(char)) {
      out += char;
      continue;
    }
    const stripped = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const replaceable = stripped.length > 0 && [...stripped].every(isGsmChar);
    out += replaceable ? stripped : char;
  }
  return out;
}
