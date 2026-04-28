"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ClienteQuickSheet } from "@/components/clientes/ClienteQuickSheet";
import { parseDecimalMientrasEscribe } from "@/lib/decimales-input";

interface Linea {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

type LineaBorrador = Linea & { _precioDraft?: string; _cantDraft?: string };

interface PresupuestoWizardProps {
  presupuestoId?: string;
  initialClienteId?: string;
}

export function PresupuestoWizard({ presupuestoId, initialClienteId }: PresupuestoWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [clientes, setClientes] = useState<Array<{ id: string; nombre: string }>>([]);
  const [clienteId, setClienteId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [lineas, setLineas] = useState<LineaBorrador[]>([
    { descripcion: "", cantidad: 0, precioUnitario: 0 },
  ]);
  const [porcentajeImpuesto, setPorcentajeImpuesto] = useState(21);
  const [porcentajeDescuento, setPorcentajeDescuento] = useState(0);
  const [estado, setEstado] = useState("borrador");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(!!presupuestoId);
  const [error, setError] = useState<string | null>(null);
  const [showQuickClient, setShowQuickClient] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("id, nombre")
      .order("nombre")
      .then(({ data }) => setClientes(data ?? []));
  }, []);

  useEffect(() => {
    if (presupuestoId || !initialClienteId) return;
    setClienteId(initialClienteId);
  }, [presupuestoId, initialClienteId]);

  useEffect(() => {
    if (!presupuestoId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("presupuestos").select("cliente_id, concepto, fecha, porcentaje_impuesto, porcentaje_descuento, estado").eq("id", presupuestoId).single(),
      supabase.from("presupuesto_lineas").select("descripcion, cantidad, precio_unitario").eq("presupuesto_id", presupuestoId).order("orden"),
    ]).then(([pRes, lRes]) => {
      const p = pRes.data as { cliente_id: string | null; concepto: string | null; fecha: string | null; porcentaje_impuesto: number; porcentaje_descuento: number; estado: string } | null;
      const l = (lRes.data ?? []) as Array<{ descripcion: string; cantidad: number; precio_unitario: number }>;
      if (p) {
        setClienteId(p.cliente_id ?? "");
        setConcepto(p.concepto ?? "");
        setFecha(p.fecha ?? new Date().toISOString().slice(0, 10));
        setPorcentajeImpuesto(p.porcentaje_impuesto ?? 21);
        setPorcentajeDescuento(p.porcentaje_descuento ?? 0);
        setEstado(p.estado ?? "borrador");
      }
      setLineas(l.length > 0 ? l.map((x) => ({ descripcion: x.descripcion, cantidad: x.cantidad, precioUnitario: x.precio_unitario })) : [{ descripcion: "", cantidad: 0, precioUnitario: 0 }]);
      setLoading(false);
    });
  }, [presupuestoId]);

  const addLinea = () =>
    setLineas((p) => [...p, { descripcion: "", cantidad: 0, precioUnitario: 0 }]);
  const removeLinea = (i: number) =>
    setLineas((p) => p.filter((_, idx) => idx !== i));
  const updateLinea = (i: number, field: keyof Linea, value: string | number) =>
    setLineas((p) =>
      p.map((l, idx) => (idx === i ? { ...l, [field]: value } : l))
    );

  const commitLineasBorrador = (rows: LineaBorrador[]): Linea[] =>
    rows.map((l) => ({
      descripcion: l.descripcion,
      cantidad:
        l._cantDraft !== undefined
          ? parseDecimalMientrasEscribe(l._cantDraft, { allowNegative: false })
          : l.cantidad,
      precioUnitario:
        l._precioDraft !== undefined
          ? parseDecimalMientrasEscribe(l._precioDraft, { allowNegative: false })
          : l.precioUnitario,
    }));

  const lineasFijas = commitLineasBorrador(lineas);
  const lineasValidas = lineasFijas.filter((l) => l.descripcion.trim() && l.cantidad > 0 && l.precioUnitario >= 0);
  const step2Valid = z.array(z.object({
    descripcion: z.string().min(1),
    cantidad: z.number().min(0.001),
    precioUnitario: z.number().min(0),
  })).min(1).safeParse(lineasValidas).success;

  const baseImponible = lineasFijas.reduce(
    (acc, l) => acc + Number(l.cantidad) * Number(l.precioUnitario),
    0
  );
  const impuesto = (baseImponible * (porcentajeImpuesto / 100));
  const descuento = (baseImponible * (porcentajeDescuento / 100));
  const total = baseImponible + impuesto - descuento;


  const handleSave = async () => {
    setError(null);
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setCreating(false);
      return;
    }

    if (presupuestoId) {
      const { error: errUpd } = await supabase
        .from("presupuestos")
        .update({
          cliente_id: clienteId || null,
          concepto: concepto || null,
          fecha,
          porcentaje_impuesto: porcentajeImpuesto,
          porcentaje_descuento: porcentajeDescuento,
          estado,
        })
        .eq("id", presupuestoId);

      if (errUpd) {
        setError(errUpd.message);
        setCreating(false);
        return;
      }

      await supabase.from("presupuesto_lineas").delete().eq("presupuesto_id", presupuestoId);

      const lineasNetas = commitLineasBorrador(lineas);
      const lineasToInsert = lineasNetas
        .filter((l) => l.descripcion.trim() && l.cantidad > 0)
        .map((l, orden) => ({
          presupuesto_id: presupuestoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          orden,
        }));

      if (lineasToInsert.length > 0) {
        const { error: errLineas } = await supabase.from("presupuesto_lineas").insert(lineasToInsert);
        if (errLineas) {
          setError(errLineas.message);
          setCreating(false);
          return;
        }
      }

      toast.success("Presupuesto actualizado");
      router.push(`/presupuestos/${presupuestoId}`);
      router.refresh();
      setCreating(false);
      return;
    }

    const serie = process.env.NEXT_PUBLIC_BILLING_SERIE ?? "PRS";
    const year = new Date().getFullYear();
    const prefix = `${serie}-${year}-`;
    const { data: existing } = await supabase
      .from("presupuestos")
      .select("numero")
      .like("numero", `${prefix}%`)
      .order("numero", { ascending: false })
      .limit(1);
    const last = existing?.[0]?.numero;
    const lastCorrelative = last ? Number(last.split("-").pop() ?? "0") : 0;
    const numero = `${prefix}${String(lastCorrelative + 1).padStart(4, "0")}`;

    const { data: presupuesto, error: errPresup } = await supabase
      .from("presupuestos")
      .insert({
        user_id: user.id,
        cliente_id: clienteId || null,
        numero,
        estado: "borrador",
        fecha,
        concepto: concepto || null,
        porcentaje_impuesto: porcentajeImpuesto,
        porcentaje_descuento: porcentajeDescuento,
      })
      .select("id")
      .single();

    if (errPresup || !presupuesto) {
      setError(errPresup?.message ?? "Error al crear presupuesto");
      setCreating(false);
      return;
    }

    const lineasNetasNueva = commitLineasBorrador(lineas);
    const lineasToInsert = lineasNetasNueva
      .filter((l) => l.descripcion.trim() && l.cantidad > 0)
      .map((l, orden) => ({
        presupuesto_id: presupuesto.id,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
        orden,
      }));

    const { error: errLineas } = await supabase
      .from("presupuesto_lineas")
      .insert(lineasToInsert);

    if (errLineas) {
      setError(errLineas.message);
      setCreating(false);
      return;
    }

    toast.success("Presupuesto creado");
    router.push(`/presupuestos/${presupuesto.id}`);
    router.refresh();
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" role="status" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-2xl animate-[fadeIn_0.3s_ease-out] pb-28 md:pb-24">
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={cn(
              "flex flex-1 items-center gap-2",
              s < 3 && "after:h-0.5 after:flex-1 after:bg-border"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                step >= s ? "bg-foreground text-background" : "bg-neutral-100 text-neutral-500"
              )}
            >
              {s}
            </div>
            <span className={cn("hidden text-sm sm:inline", step === s ? "text-foreground" : "text-neutral-500")}>
              {s === 1 ? "Cliente y datos" : s === 2 ? "Líneas" : "Resumen"}
            </span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Cliente y datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-white px-4 text-base"
              >
                <option value="">Selecciona un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowQuickClient(true)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Crear cliente desde aquí
              </button>
              <ClienteQuickSheet
                open={showQuickClient}
                onOpenChange={setShowQuickClient}
                onSuccess={(cliente) => {
                  setClientes((prev) => [...prev, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                  setClienteId(cliente.id);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                placeholder="Ej. Reforma integral"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            {presupuestoId && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-border bg-white px-4 text-base"
                >
                  <option value="borrador">Borrador</option>
                  <option value="enviado">Enviado</option>
                  <option value="aceptado">Aceptado</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Líneas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lineas.map((l, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-4"
              >
                <div className="flex-1 min-w-[200px] space-y-2">
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Descripción"
                    value={l.descripcion}
                    onChange={(e) => updateLinea(i, "descripcion", e.target.value)}
                  />
                </div>
                <div className="w-24 space-y-2">
                  <Label>Cant.</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
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
                                cantidad: parseDecimalMientrasEscribe(raw, { allowNegative: false }),
                              }
                            : line
                        )
                      );
                    }}
                    onBlur={() => {
                      setLineas((p) =>
                        p.map((line, idx) => {
                          if (idx !== i) return line;
                          if (line._cantDraft === undefined) return line;
                          const n = parseDecimalMientrasEscribe(line._cantDraft, { allowNegative: false });
                          const next = { ...line };
                          delete next._cantDraft;
                          return { ...next, cantidad: n };
                        })
                      );
                    }}
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label>Precio</Label>
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
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => removeLinea(i)}
                  disabled={lineas.length === 1}
                  aria-label="Eliminar línea"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
            <Button variant="secondary" onClick={addLinea} className="gap-2">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Añadir línea
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-neutral-500">Cliente:</span>{" "}
                {clientes.find((c) => c.id === clienteId)?.nombre ?? "—"}
              </p>
              <p>
                <span className="text-neutral-500">Concepto:</span> {concepto || "—"}
              </p>
              <p>
                <span className="text-neutral-500">Base:</span>{" "}
                {baseImponible.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
              </p>
              <p>
                <span className="text-neutral-500">IVA ({porcentajeImpuesto}%):</span>{" "}
                {impuesto.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
              </p>
              <p className="font-semibold">
                <span className="text-neutral-500">Total:</span>{" "}
                {total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>
      )}

      {/* Barra fija Atrás / Siguiente */}
      <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 flex justify-center border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0">
        <div className="flex w-full max-w-2xl justify-end gap-2">
          {step === 1 ? (
            <Button onClick={() => setStep(2)}>Siguiente</Button>
          ) : step === 2 ? (
            <>
              <Button variant="secondary" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button onClick={() => setStep(3)} disabled={!step2Valid}>
                Siguiente
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(2)} disabled={creating}>
                Atrás
              </Button>
              <Button onClick={handleSave} disabled={creating}>
                {creating ? "Creando…" : "Crear presupuesto"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
