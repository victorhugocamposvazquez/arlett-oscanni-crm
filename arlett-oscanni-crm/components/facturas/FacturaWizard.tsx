"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  facturaStep1Schema,
  type FacturaStep1Values,
  type FacturaStep2Values,
  type FacturaLinea,
} from "@/lib/validations/factura";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { anioEmisionFecha, siguienteNumeroFactura } from "@/lib/facturacion-numeracion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2, UserPlus } from "lucide-react";
import { ClienteQuickSheet } from "@/components/clientes/ClienteQuickSheet";
import { parseDecimalMientrasEscribe } from "@/lib/decimales-input";

/** Borradores de texto para no perder "10." al convertir a número en cada tecla */
type LineaConBorrador = FacturaLinea & { _precioDraft?: string; _cantDraft?: string };

const STEPS = [
  { id: 1, title: "Cliente y fechas" },
  { id: 2, title: "Líneas" },
  { id: 3, title: "Resumen y creación" },
];

type EstadoFactura = "borrador" | "emitida" | "pagada";

type WizardData = FacturaStep1Values & FacturaStep2Values & { estadoInicial?: EstadoFactura };

interface FacturaWizardProps {
  facturaId?: string;
  initialClienteId?: string;
  facturaOriginalId?: string;
}

export function FacturaWizard({ facturaId, initialClienteId, facturaOriginalId }: FacturaWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<WizardData>>({});
  const [estadoInicial, setEstadoInicial] = useState<EstadoFactura>("emitida");
  const [clientes, setClientes] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(!!facturaId || !!facturaOriginalId);
  const [numero, setNumero] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [irpfPorcentaje, setIrpfPorcentaje] = useState<number>(0);
  const [porcentajeDescuento, setPorcentajeDescuento] = useState<number>(0);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [step2Attempted, setStep2Attempted] = useState(false);
  const [causaRectificacion, setCausaRectificacion] = useState("");
  const [facturaOriginalNumero, setFacturaOriginalNumero] = useState<string | null>(null);
  const [rectificativaError, setRectificativaError] = useState<string | null>(null);
  const esRectificativa = !!facturaOriginalId;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("id, nombre")
      .order("nombre")
      .then(({ data: list }) => setClientes(list ?? []));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const formStep1 = useForm<FacturaStep1Values>({
    resolver: zodResolver(facturaStep1Schema),
    defaultValues: {
      clienteId: initialClienteId ?? "",
      concepto: "",
      fechaEmision: today,
      fechaVencimiento: "",
      causaRectificacion: "",
    },
  });

  useEffect(() => {
    if (!initialClienteId || facturaId) return;
    formStep1.setValue("clienteId", initialClienteId);
    setData((p) => ({ ...p, clienteId: initialClienteId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when initialClienteId or clientes change
  }, [initialClienteId, facturaId, clientes]);

  useEffect(() => {
    if (!facturaOriginalId || facturaId) return;
    setRectificativaError(null);
    const supabase = createClient();
    Promise.all([
      supabase.from("facturas").select("id, numero, estado, concepto, fecha_emision, fecha_vencimiento, irpf_porcentaje, porcentaje_descuento, cliente_id, tipo_factura").eq("id", facturaOriginalId).single(),
      supabase.from("factura_lineas").select("descripcion, cantidad, precio_unitario, iva_porcentaje").eq("factura_id", facturaOriginalId).order("orden"),
    ]).then(([fRes, lRes]) => {
      const factura = fRes.data as { numero: string; estado: string; concepto: string | null; fecha_emision: string | null; fecha_vencimiento: string | null; irpf_porcentaje: number | null; porcentaje_descuento: number | null; cliente_id: string | null; tipo_factura?: string } | null;
      const lineasData = (lRes.data ?? []) as Array<{ descripcion: string; cantidad: number; precio_unitario: number; iva_porcentaje: number | null }>;
      if (!factura) {
        setRectificativaError("Factura original no encontrada");
        setLoading(false);
        return;
      }
      if (factura.estado === "borrador") {
        setRectificativaError("Solo se puede emitir rectificativa de facturas emitidas o pagadas");
        setLoading(false);
        return;
      }
      if (factura.tipo_factura === "rectificativa") {
        setRectificativaError("No se puede rectificar una factura rectificativa");
        setLoading(false);
        return;
      }
      const fourYearsAgo = new Date();
      fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
      const fechaEmision = factura.fecha_emision ? new Date(factura.fecha_emision + "T12:00:00") : null;
      if (fechaEmision && fechaEmision < fourYearsAgo) {
        setRectificativaError("Ha pasado más de 4 años desde la factura original (RD 1619/2012)");
        setLoading(false);
        return;
      }
      setFacturaOriginalNumero(factura.numero);
      const step1Values = {
        clienteId: factura.cliente_id ?? "",
        concepto: factura.concepto ?? "",
        fechaEmision: factura.fecha_emision ?? today,
        fechaVencimiento: "",
      };
      setData({
        ...step1Values,
        lineas: lineasData.map((l) => ({
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precio_unitario),
          ivaPorcentaje: Number(l.iva_porcentaje ?? 21),
        })),
      });
      setLineas(
        lineasData.length > 0
          ? lineasData.map((l) => ({
              descripcion: l.descripcion,
              cantidad: Number(l.cantidad),
              precioUnitario: Number(l.precio_unitario),
              ivaPorcentaje: Number(l.iva_porcentaje ?? 21),
            }))
          : [{ descripcion: "", cantidad: 1, precioUnitario: 0, ivaPorcentaje: 21 }]
      );
      formStep1.reset(step1Values);
      setIrpfPorcentaje(Number(factura.irpf_porcentaje ?? 0));
      setPorcentajeDescuento(Number(factura.porcentaje_descuento ?? 0));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formStep1.reset al cargar rectificativa
  }, [facturaOriginalId, facturaId, today]);

  const [lineas, setLineas] = useState<LineaConBorrador[]>([
    { descripcion: "", cantidad: 1, precioUnitario: 0, ivaPorcentaje: 21 },
  ]);

  useEffect(() => {
    if (!facturaId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("facturas").select("id, numero, estado, concepto, fecha_emision, fecha_vencimiento, irpf_porcentaje, porcentaje_descuento, cliente_id").eq("id", facturaId).single(),
      supabase.from("factura_lineas").select("descripcion, cantidad, precio_unitario, iva_porcentaje").eq("factura_id", facturaId).order("orden"),
    ]).then(([fRes, lRes]) => {
      const factura = fRes.data as { numero: string; estado: string; concepto: string | null; fecha_emision: string | null; fecha_vencimiento: string | null; irpf_porcentaje: number | null; porcentaje_descuento: number | null; cliente_id: string | null } | null;
      const lineasData = (lRes.data ?? []) as Array<{ descripcion: string; cantidad: number; precio_unitario: number; iva_porcentaje: number | null }>;
      if (!factura) {
        setLoading(false);
        return;
      }
      setNumero(factura.numero);
      const step1Values = {
        clienteId: factura.cliente_id ?? "",
        concepto: factura.concepto ?? "",
        fechaEmision: factura.fecha_emision ?? "",
        fechaVencimiento: factura.fecha_vencimiento ?? "",
      };
      setData({
        ...step1Values,
        lineas: lineasData.map((l) => ({
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precio_unitario),
          ivaPorcentaje: Number(l.iva_porcentaje ?? 21),
        })),
      });
      setEstadoInicial(factura.estado as EstadoFactura);
      setIrpfPorcentaje(Number(factura.irpf_porcentaje ?? 0));
      setPorcentajeDescuento(Number(factura.porcentaje_descuento ?? 0));
      setLineas(
        lineasData.length > 0
          ? lineasData.map((l) => ({
              descripcion: l.descripcion,
              cantidad: Number(l.cantidad),
              precioUnitario: Number(l.precio_unitario),
              ivaPorcentaje: Number(l.iva_porcentaje ?? 21),
            }))
          : [{ descripcion: "", cantidad: 1, precioUnitario: 0, ivaPorcentaje: 21 }]
      );
      formStep1.reset(step1Values);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formStep1.reset is stable
  }, [facturaId]);

  const onStep1 = formStep1.handleSubmit((values) => {
    if (esRectificativa && !(values.causaRectificacion ?? "").trim()) {
      formStep1.setError("causaRectificacion", { message: "La causa de rectificación es obligatoria (RD 1619/2012)" });
      return;
    }
    setData((p) => ({ ...p, ...values }));
    if (esRectificativa) setCausaRectificacion(values.causaRectificacion ?? "");
    setStep(2);
  });

  const handleQuickClientSuccess = (cliente: { id: string; nombre: string }) => {
    setClientes((prev) => [...prev, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    formStep1.setValue("clienteId", cliente.id, { shouldValidate: true });
    setData((p) => ({ ...p, clienteId: cliente.id }));
  };

  const commitLineasDrafts = (rows: LineaConBorrador[]): FacturaLinea[] =>
    rows.map((l) => ({
      descripcion: l.descripcion,
      cantidad:
        l._cantDraft !== undefined
          ? parseDecimalMientrasEscribe(l._cantDraft, { allowNegative: esRectificativa })
          : l.cantidad,
      precioUnitario:
        l._precioDraft !== undefined
          ? parseDecimalMientrasEscribe(l._precioDraft, { allowNegative: false })
          : l.precioUnitario,
      ivaPorcentaje: l.ivaPorcentaje,
    }));

  const onStep2 = () => {
    const committed = commitLineasDrafts(lineas);
    const valid = committed.every((l) => {
      if (!l.descripcion.trim()) return false;
      if (esRectificativa) return l.cantidad !== 0;
      return l.cantidad > 0 && l.precioUnitario >= 0;
    });
    if (!valid) {
      setStep2Attempted(true);
      return;
    }
    setStep2Attempted(false);
    setLineas(committed);
    setData((p) => ({ ...p, lineas: committed }));
    setStep(3);
  };

  const isLineaInvalid = (l: FacturaLinea) => ({
    descripcion: !l.descripcion.trim(),
    cantidad: esRectificativa ? l.cantidad === 0 : l.cantidad <= 0,
    precioUnitario: esRectificativa ? false : l.precioUnitario < 0,
  });

  const addLinea = () =>
    setLineas((p) => [...p, { descripcion: "", cantidad: 1, precioUnitario: 0, ivaPorcentaje: 21 }]);
  const removeLinea = (i: number) =>
    setLineas((p) => p.filter((_, idx) => idx !== i));
  const updateLinea = (i: number, field: keyof FacturaLinea, value: string | number) => {
    setStep2Attempted(false);
    setLineas((p) =>
      p.map((l, idx) => (idx === i ? { ...l, [field]: value } : l))
    );
  };

  const subtotal = lineas.reduce((acc, l) => acc + l.cantidad * l.precioUnitario, 0);
  const descuentoImporte = subtotal * (porcentajeDescuento / 100);
  const ivaTotal = lineas.reduce(
    (acc, l) => acc + l.cantidad * l.precioUnitario * (l.ivaPorcentaje / 100),
    0
  );
  const irpfImporte = subtotal * (irpfPorcentaje / 100);
  const total = subtotal + ivaTotal - descuentoImporte - irpfImporte;
  const clienteNombre =
    clientes.find((c) => c.id === data.clienteId)?.nombre ?? "—";

  const handleBack = () => {
    const nextStep = Math.max(1, step - 1);
    setStep(nextStep);
    if (nextStep === 1) {
      formStep1.reset({
        clienteId: data.clienteId ?? "",
        concepto: data.concepto ?? "",
        fechaEmision: data.fechaEmision ?? today,
        fechaVencimiento: data.fechaVencimiento ?? "",
        causaRectificacion: (data as { causaRectificacion?: string }).causaRectificacion ?? causaRectificacion ?? "",
      });
    }
  };

  const handleCreate = async () => {
    setCreateError(null);
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCreateError("Sesión expirada");
      setCreating(false);
      return;
    }
    const clienteId = data.clienteId || null;
    const lineasNetas = commitLineasDrafts((data.lineas ?? lineas) as LineaConBorrador[]);
    const lineasToSave = lineasNetas.map((l, orden) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      iva_porcentaje: l.ivaPorcentaje,
      orden,
    }));

    if (facturaId) {
      const { error: errFactura } = await supabase
        .from("facturas")
        .update({
          cliente_id: clienteId,
          estado: estadoInicial,
          concepto: data.concepto || null,
          fecha_emision: data.fechaEmision || null,
          fecha_vencimiento: data.fechaVencimiento || null,
          irpf_porcentaje: irpfPorcentaje,
          porcentaje_descuento: porcentajeDescuento,
        })
        .eq("id", facturaId);

      if (errFactura) {
        setCreateError(errFactura.message);
        setCreating(false);
        return;
      }

      const { error: errDel } = await supabase.from("factura_lineas").delete().eq("factura_id", facturaId);
      if (errDel) {
        setCreateError(errDel.message);
        setCreating(false);
        return;
      }
      const { error: errLineas } = await supabase.from("factura_lineas").insert(
        lineasToSave.map((l) => ({ ...l, factura_id: facturaId }))
      );
      setCreating(false);
      if (errLineas) {
        setCreateError(errLineas.message);
        return;
      }
      toast.success("Factura actualizada");
      router.push(`/facturas/${facturaId}`);
      router.refresh();
      return;
    }

    const year = anioEmisionFecha(data.fechaEmision);
    let numero: string;
    try {
      numero = await siguienteNumeroFactura(supabase, {
        year,
        esRectificativa: esRectificativa,
      });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error al asignar el número de factura");
      setCreating(false);
      return;
    }

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      cliente_id: clienteId,
      numero,
      estado: estadoInicial,
      concepto: data.concepto || null,
      fecha_emision: data.fechaEmision || null,
      fecha_vencimiento: data.fechaVencimiento || null,
      irpf_porcentaje: irpfPorcentaje,
      porcentaje_descuento: porcentajeDescuento,
    };
    if (esRectificativa && facturaOriginalId) {
      insertPayload.tipo_factura = "rectificativa";
      insertPayload.factura_original_id = facturaOriginalId;
      insertPayload.causa_rectificacion = causaRectificacion.trim() || null;
    }

    const { data: factura, error: errFactura } = await supabase
      .from("facturas")
      .insert(insertPayload)
      .select("id")
      .single();

    if (errFactura || !factura) {
      setCreateError(errFactura?.message ?? "Error al crear factura");
      setCreating(false);
      return;
    }

    const { error: errLineas } = await supabase.from("factura_lineas").insert(
      lineasToSave.map((l) => ({ ...l, factura_id: factura.id }))
    );
    setCreating(false);
    if (errLineas) {
      setCreateError(errLineas.message);
      return;
    }
    toast.success("Factura creada");
    router.push("/facturas");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" role="status" aria-label="Cargando" />
      </div>
    );
  }

  if (rectificativaError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6">
        <p className="font-medium text-red-800">{rectificativaError}</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href={facturaOriginalId ? `/facturas/${facturaOriginalId}` : "/facturas"}>
            Volver
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative mx-auto max-w-2xl animate-[fadeIn_0.3s_ease-out] md:pb-24",
      step === 2 ? "pb-40" : "pb-28"
    )}>
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, idx) => (
          <div
            key={s.id}
            className={cn(
              "flex flex-1 items-center gap-2",
              idx < STEPS.length - 1 && "after:h-0.5 after:flex-1 after:bg-border"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                step >= s.id
                  ? "bg-foreground text-background"
                  : "bg-neutral-100 text-neutral-500"
              )}
            >
              {s.id}
            </div>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                step === s.id ? "text-foreground" : "text-neutral-500"
              )}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>

      <div key={step} className="animate-[slideUp_0.3s_ease-out]">
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{esRectificativa ? "Rectificativa" : "Cliente y fechas"}</CardTitle>
              {numero && (
                <p className="text-sm font-medium text-neutral-500">{numero}</p>
              )}
              {esRectificativa && facturaOriginalNumero && (
                <p className="text-sm text-neutral-600">
                  Rectifica factura: <span className="font-medium">{facturaOriginalNumero}</span>
                </p>
              )}
            </CardHeader>
            <CardContent className="min-w-0 overflow-x-hidden">
              <form id="factura-step1-form" onSubmit={onStep1} className="space-y-4">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <select
                    className={cn(
                      "flex h-11 w-full rounded-lg border border-border bg-white px-4 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      esRectificativa && "cursor-not-allowed bg-neutral-50"
                    )}
                    {...formStep1.register("clienteId")}
                    disabled={esRectificativa}
                  >
                    <option value="">Selecciona un cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  {formStep1.formState.errors.clienteId && (
                    <p className="text-sm text-red-600">
                      {formStep1.formState.errors.clienteId.message}
                    </p>
                  )}
                  {!esRectificativa && (
                    <button
                      type="button"
                      onClick={() => setShowQuickClient(true)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                    >
                      <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Crear cliente desde aquí
                    </button>
                  )}
                </div>

                {esRectificativa && (
                  <div className="space-y-2">
                    <Label>Causa de rectificación *</Label>
                    <Input
                      placeholder="Ej. Error en importe, devolución, descuento por volumen..."
                      {...formStep1.register("causaRectificacion")}
                    />
                    {formStep1.formState.errors.causaRectificacion && (
                      <p className="text-sm text-red-600">
                        {formStep1.formState.errors.causaRectificacion.message}
                      </p>
                    )}
                  </div>
                )}

                <ClienteQuickSheet
                  open={showQuickClient}
                  onOpenChange={setShowQuickClient}
                  onSuccess={handleQuickClientSuccess}
                />
                <div className="space-y-2">
                  <Label>Concepto</Label>
                  <Input
                    placeholder="Ej. Gestión alquiler"
                    {...formStep1.register("concepto")}
                  />
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-4">
                  <div className="min-w-0 space-y-2">
                    <Label>Fecha emisión</Label>
                    <Input
                      type="date"
                      className="w-full min-w-0 text-left"
                      {...formStep1.register("fechaEmision")}
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label>Fecha vencimiento</Label>
                    <Input
                      type="date"
                      className="w-full min-w-0 text-left"
                      {...formStep1.register("fechaVencimiento")}
                    />
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={handleBack}
                className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                Volver a cliente y fechas
              </button>
              <CardTitle>Líneas de factura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
              {lineas.map((l, i) => {
                const err = isLineaInvalid(l);
                const showErr = step2Attempted && (err.descripcion || err.cantidad || err.precioUnitario);
                return (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border p-4",
                    showErr ? "border-red-300 bg-red-50/30" : "border-border"
                  )}
                >
                  <div className="space-y-2">
                    <Label className={cn("text-sm", showErr && err.descripcion && "text-red-600")}>Descripción</Label>
                    <Input
                      placeholder="Descripción"
                      value={l.descripcion}
                      onChange={(e) =>
                        updateLinea(i, "descripcion", e.target.value)
                      }
                      className={showErr && err.descripcion ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-14 shrink-0 space-y-1">
                      <Label className={cn("text-xs", showErr && err.cantidad && "text-red-600")}>Cant.</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="1"
                        value={
                          l._cantDraft !== undefined
                            ? l._cantDraft
                            : l.cantidad === 0
                              ? ""
                              : String(l.cantidad)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLineas((p) =>
                            p.map((line, idx) =>
                              idx === i
                                ? {
                                    ...line,
                                    _cantDraft: raw,
                                    cantidad: parseDecimalMientrasEscribe(raw, {
                                      allowNegative: esRectificativa,
                                    }),
                                  }
                                : line
                            )
                          );
                          setStep2Attempted(false);
                        }}
                        onBlur={() => {
                          setLineas((p) =>
                            p.map((line, idx) => {
                              if (idx !== i) return line;
                              if (line._cantDraft === undefined) return line;
                              const n = parseDecimalMientrasEscribe(line._cantDraft, {
                                allowNegative: esRectificativa,
                              });
                              const next = { ...line };
                              delete next._cantDraft;
                              return { ...next, cantidad: n };
                            })
                          );
                        }}
                        className={cn("h-9 text-sm", showErr && err.cantidad && "border-red-500 focus-visible:ring-red-500")}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label className={cn("text-xs", showErr && err.precioUnitario && "text-red-600")}>Precio u. (€)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0,00"
                        value={
                          l._precioDraft !== undefined
                            ? l._precioDraft
                            : l.precioUnitario === 0
                              ? ""
                              : String(l.precioUnitario)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLineas((p) =>
                            p.map((line, idx) =>
                              idx === i
                                ? {
                                    ...line,
                                    _precioDraft: raw,
                                    precioUnitario: parseDecimalMientrasEscribe(raw, { allowNegative: false }),
                                  }
                                : line
                            )
                          );
                          setStep2Attempted(false);
                        }}
                        onBlur={() => {
                          setLineas((p) =>
                            p.map((line, idx) => {
                              if (idx !== i) return line;
                              if (line._precioDraft === undefined) return line;
                              const n = parseDecimalMientrasEscribe(line._precioDraft, { allowNegative: false });
                              const next = { ...line };
                              delete next._precioDraft;
                              return { ...next, precioUnitario: n };
                            })
                          );
                        }}
                        className={cn("h-9 text-sm", showErr && err.precioUnitario && "border-red-500 focus-visible:ring-red-500")}
                      />
                    </div>
                    <div className="w-14 shrink-0 space-y-1">
                      <Label className="text-xs">IVA %</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={l.ivaPorcentaje}
                        onChange={(e) =>
                          updateLinea(i, "ivaPorcentaje", Number(e.target.value))
                        }
                      >
                        <option value={21}>21</option>
                        <option value={10}>10</option>
                        <option value={4}>4</option>
                        <option value={0}>0</option>
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removeLinea(i)}
                      disabled={lineas.length === 1}
                      aria-label="Eliminar línea"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              );
              })}
              </div>
              <Button type="button" variant="secondary" onClick={addLinea}>
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Añadir línea
              </Button>

              {/* Totales: resumen en filas, actualización en tiempo real */}
              <div className="mt-6 shrink-0 rounded-xl border border-border bg-neutral-50/80 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]" role="region" aria-label="Totales de la factura">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Resumen
                </p>
                <div className="flex flex-col gap-2.5 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span className="text-neutral-600">Subtotal</span>
                    <span className="font-semibold text-foreground">{subtotal.toFixed(2)} €</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                    <Label className="shrink-0 text-neutral-600">Descuento %</Label>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        className="h-9 w-20 text-right"
                        value={porcentajeDescuento || ""}
                        onChange={(e) => setPorcentajeDescuento(Number(e.target.value) || 0)}
                      />
                      <span className="w-16 text-right text-neutral-500">-{descuentoImporte.toFixed(2)} €</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span className="text-neutral-600">IVA</span>
                    <span className="font-semibold text-foreground">{ivaTotal.toFixed(2)} €</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                    <Label className="shrink-0 text-neutral-600">IRPF %</Label>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={25}
                        step="0.5"
                        className="h-9 w-20 text-right"
                        value={irpfPorcentaje || ""}
                        onChange={(e) => setIrpfPorcentaje(Number(e.target.value) || 0)}
                      />
                      <span className="w-16 text-right text-neutral-500">-{irpfImporte.toFixed(2)} €</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border-t border-border bg-white px-3 py-3">
                    <span className="font-medium text-foreground">Total</span>
                    <span className="text-lg font-semibold text-foreground">{total.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Resumen y creación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-neutral-500">Cliente</dt>
                  <dd className="font-medium">{clienteNombre}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Concepto</dt>
                  <dd className="font-medium">{data.concepto || "—"}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-3 text-sm font-semibold text-neutral-600">Líneas desglosadas (descripción e importe por línea)</p>
                <ul className="space-y-3 rounded-lg border border-border bg-neutral-50/60 p-4">
                  {lineas.map((l, i) => {
                    const base = l.cantidad * l.precioUnitario;
                    const iva = base * (l.ivaPorcentaje / 100);
                    const importe = base + iva;
                    return (
                      <li key={i} className="flex flex-col gap-1 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                        <span className="font-medium text-foreground">{l.descripcion || "Sin descripción"}</span>
                        <span className="text-sm text-neutral-600">
                          {l.cantidad} × {l.precioUnitario.toFixed(2)} € + IVA {l.ivaPorcentaje}% = {importe.toFixed(2)} €
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex justify-end gap-4 border-t border-border pt-3 text-sm">
                  <span className="text-neutral-500">Subtotal:</span>
                  <span className="font-medium">{subtotal.toFixed(2)} €</span>
                </div>
                {porcentajeDescuento > 0 && (
                  <div className="flex justify-end gap-4 text-sm">
                    <span className="text-neutral-500">Descuento ({porcentajeDescuento}%):</span>
                    <span className="font-medium">-{descuentoImporte.toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-end gap-4 text-sm">
                  <span className="text-neutral-500">IVA:</span>
                  <span className="font-medium">{ivaTotal.toFixed(2)} €</span>
                </div>
                {irpfPorcentaje > 0 && (
                  <div className="flex justify-end gap-4 text-sm">
                    <span className="text-neutral-500">IRPF ({irpfPorcentaje}%):</span>
                    <span className="font-medium">-{irpfImporte.toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-end gap-4 border-t border-border pt-2 text-base">
                  <span className="font-medium text-neutral-600">Total</span>
                  <span className="text-lg font-semibold text-foreground">{total.toFixed(2)} €</span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-neutral-50/50 p-4">
                <p className="mb-2 text-sm font-medium text-foreground">
                  Estado inicial de la factura
                </p>
                <p className="mb-3 text-xs text-neutral-500">
                  Por defecto se crea como emitida. Puedes elegir borrador si aún no la envías, o pagada si ya la has cobrado.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={estadoInicial === "borrador" ? "default" : "borrador"}
                    className={cn(
                      "cursor-pointer transition-opacity hover:opacity-90",
                      estadoInicial === "borrador" && "ring-2 ring-foreground"
                    )}
                    onClick={() => setEstadoInicial("borrador")}
                  >
                    Borrador
                  </Badge>
                  <Badge
                    variant={estadoInicial === "emitida" ? "default" : "emitida"}
                    className={cn(
                      "cursor-pointer transition-opacity hover:opacity-90",
                      estadoInicial === "emitida" && "ring-2 ring-foreground"
                    )}
                    onClick={() => setEstadoInicial("emitida")}
                  >
                    Emitida
                  </Badge>
                  <Badge
                    variant={estadoInicial === "pagada" ? "default" : "pagada"}
                    className={cn(
                      "cursor-pointer transition-opacity hover:opacity-90",
                      estadoInicial === "pagada" && "ring-2 ring-foreground"
                    )}
                    onClick={() => setEstadoInicial("pagada")}
                  >
                    Pagada
                  </Badge>
                </div>
              </div>
              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Barra fija Atrás / Siguiente: abajo siempre; en mobile encima del menú de navegación */}
      {/* En step 2 móvil: incluye también Subtotal, IVA, Total fijos */}
      <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 flex flex-col border-t border-border bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0">
        {step === 2 && (
          <div className="grid grid-cols-3 gap-2 border-b border-border px-4 py-2.5 md:hidden">
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Subtotal</p>
              <p className="text-sm font-semibold">{subtotal.toFixed(2)} €</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">IVA</p>
              <p className="text-sm font-semibold">{ivaTotal.toFixed(2)} €</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Total</p>
              <p className="text-sm font-bold">{total.toFixed(2)} €</p>
            </div>
          </div>
        )}
        <div className="flex justify-center px-4 py-3">
          <div className="flex w-full max-w-2xl justify-end gap-2">
            {step === 1 ? (
              <Button type="submit" form="factura-step1-form">
                Siguiente
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBack}
                  disabled={creating}
                >
                  Atrás
                </Button>
                {step === 2 && <Button onClick={onStep2}>Siguiente</Button>}
                {step === 3 && (
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? (facturaId ? "Guardando…" : "Creando…") : facturaId ? "Guardar cambios" : "Crear factura"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
