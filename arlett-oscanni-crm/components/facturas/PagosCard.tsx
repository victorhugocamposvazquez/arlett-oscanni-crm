"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Banknote } from "lucide-react";
import { toast } from "sonner";

const METODOS_PAGO = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "bizum", label: "Bizum" },
  { value: "domiciliacion", label: "Domiciliación" },
  { value: "otro", label: "Otro" },
] as const;

interface PagoRow {
  id: string;
  importe: number;
  fecha: string;
  metodo_pago: string | null;
  notas: string | null;
}

interface PagosCardProps {
  facturaId: string;
  totalFactura: number;
  estado: string;
  onPagoAdded?: () => void;
}

export function PagosCard({
  facturaId,
  totalFactura,
  estado,
  onPagoAdded,
}: PagosCardProps) {
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importe, setImporte] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState<string>("transferencia");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("pagos")
      .select("id, importe, fecha, metodo_pago, notas")
      .eq("factura_id", facturaId)
      .order("fecha", { ascending: false })
      .then(({ data }) => {
        setPagos((data ?? []) as PagoRow[]);
        setLoading(false);
      });
  }, [facturaId]);

  const totalPagado = pagos.reduce((acc, p) => acc + Number(p.importe), 0);
  const pendiente = Math.max(0, totalFactura - totalPagado);
  const puedeAnadirPago = estado !== "borrador" && pendiente > 0;

  const handleAddPago = async () => {
    const importeNum = parseFloat(importe.replace(",", "."));
    if (isNaN(importeNum) || importeNum <= 0) {
      toast.error("Introduce un importe válido");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sesión expirada");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("pagos").insert({
      factura_id: facturaId,
      user_id: user.id,
      importe: importeNum,
      fecha,
      metodo_pago: metodoPago || null,
      notas: notas.trim() || null,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Pago registrado");
    setImporte("");
    setFecha(new Date().toISOString().slice(0, 10));
    setNotas("");
    setShowForm(false);

    const { data: newPagos } = await supabase
      .from("pagos")
      .select("id, importe, fecha, metodo_pago, notas")
      .eq("factura_id", facturaId)
      .order("fecha", { ascending: false });
    setPagos((newPagos ?? []) as PagoRow[]);

    const nuevoTotal = totalPagado + importeNum;
    if (nuevoTotal >= totalFactura - 0.01) {
      await supabase.from("facturas").update({ estado: "pagada" }).eq("id", facturaId);
      toast.success("Factura marcada como pagada");
    }
    onPagoAdded?.();
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const labelMetodo = (v: string | null) =>
    METODOS_PAGO.find((m) => m.value === v)?.label ?? (v ?? "—");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-neutral-500" strokeWidth={1.5} />
          Pagos
        </CardTitle>
        {puedeAnadirPago && (
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => setShowForm((s) => !s)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Registrar pago
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-neutral-100" />
            <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 rounded-xl bg-neutral-50/80 px-4 py-3 text-sm">
              <span>
                <span className="text-neutral-500">Pagado:</span>{" "}
                <span className="font-semibold">{formatCurrency(totalPagado)}</span>
              </span>
              <span>
                <span className="text-neutral-500">Pendiente:</span>{" "}
                <span className={pendiente > 0 ? "font-semibold text-amber-600" : "font-semibold text-amber-800"}>
                  {formatCurrency(pendiente)}
                </span>
              </span>
            </div>

            {showForm && puedeAnadirPago && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddPago();
                }}
                className="space-y-4 rounded-xl border border-border bg-white p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pago-importe">Importe (€) *</Label>
                    <Input
                      id="pago-importe"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={importe}
                      onChange={(e) => setImporte(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pago-fecha">Fecha *</Label>
                    <Input
                      id="pago-fecha"
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pago-metodo">Método de pago</Label>
                  <select
                    id="pago-metodo"
                    className="flex h-10 w-full rounded-lg border border-border bg-white px-4 text-base"
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pago-notas">Notas</Label>
                  <Input
                    id="pago-notas"
                    placeholder="Referencia, número de operación..."
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Guardando…" : "Registrar"}
                  </Button>
                </div>
              </form>
            )}

            {pagos.length === 0 && !showForm ? (
              <p className="text-sm text-neutral-500">
                {estado === "borrador"
                  ? "Emite la factura para poder registrar pagos."
                  : "Sin pagos registrados."}
              </p>
            ) : (
              <ul className="space-y-2">
                {pagos.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    <span className="font-medium">{formatCurrency(Number(p.importe))}</span>
                    <span className="text-neutral-500">
                      {p.fecha} · {labelMetodo(p.metodo_pago)}
                    </span>
                    {p.notas && (
                      <span className="w-full text-xs text-neutral-400">{p.notas}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
