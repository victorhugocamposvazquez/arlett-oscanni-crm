import { z } from "zod";

export const presupuestoLineaSchema = z.object({
  descripcion: z.string().min(1, "Descripción requerida"),
  cantidad: z.number().min(0.001, "Cantidad debe ser mayor que 0"),
  precioUnitario: z.number().min(0, "Precio debe ser 0 o mayor"),
});

export const presupuestoStep1Schema = z.object({
  clienteId: z.string().optional(),
  concepto: z.string().optional(),
  fecha: z.string().min(1, "Fecha requerida"),
  estado: z.enum(["borrador", "enviado", "aceptado", "rechazado"]).optional(),
});

export const presupuestoStep2Schema = z.object({
  lineas: z.array(presupuestoLineaSchema).min(1, "Añade al menos una línea"),
});

export type PresupuestoLinea = z.infer<typeof presupuestoLineaSchema>;
export type PresupuestoStep1Values = z.infer<typeof presupuestoStep1Schema>;
export type PresupuestoStep2Values = z.infer<typeof presupuestoStep2Schema>;
