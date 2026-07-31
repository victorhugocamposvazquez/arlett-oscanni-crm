/**
 * Emparejado entre el nombre de servicio que llega de SimplyBook y el que se
 * escribe en el SMS. La clave se normaliza para que un cambio de tildes, de
 * mayúsculas o de tipo de guion en SimplyBook no rompa el alias configurado.
 */

export function normalizeServicioKey(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2012-\u2015\u2212]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombre configurado para el cliente, o null si ese servicio no tiene alias. */
export function aliasServicio(
  nombre: string | null | undefined,
  alias: Record<string, string>
): string | null {
  if (!nombre) return null;
  const propio = alias[normalizeServicioKey(nombre)];
  return propio?.trim() ? propio.trim() : null;
}
