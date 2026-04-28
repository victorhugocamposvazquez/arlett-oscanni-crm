"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FacturaCard } from "@/components/facturas/FacturaCard";
import { FacturaListSkeleton } from "@/components/facturas/FacturaListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Fab } from "@/components/ui/fab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface FacturaRow {
  id: string;
  numero: string;
  estado: string;
  cliente_id: string | null;
  total?: number | null;
  tipo_factura?: "ordinaria" | "rectificativa";
  clientes: { nombre: string } | { nombre: string }[] | null;
}

export default function FacturasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const estadoFromUrl = searchParams.get("estado") as "borrador" | "emitida" | "pagada" | null;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<"todos" | "borrador" | "emitida" | "pagada">(
    estadoFromUrl && ["borrador", "emitida", "pagada"].includes(estadoFromUrl) ? estadoFromUrl : "todos"
  );
  const [filterTipo, setFilterTipo] = useState<"todas" | "ordinaria" | "rectificativa">("todas");
  const [facturas, setFacturas] = useState<Array<{
    id: string;
    numero: string;
    clienteNombre: string;
    importe: string;
    estado: "borrador" | "emitida" | "pagada";
    tipoFactura?: "ordinaria" | "rectificativa";
  }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("facturas")
      .select("id, numero, estado, cliente_id, total, tipo_factura, clientes(nombre)")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setFacturas([]);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as FacturaRow[];
        Promise.all(
          rows.map(async (row) => {
            const cliente = Array.isArray(row.clientes)
              ? (row.clientes[0] ?? null)
              : row.clientes;
            return {
              id: row.id,
              numero: row.numero,
              clienteNombre: cliente?.nombre ?? "—",
              importe: Number(row.total ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €",
              estado: row.estado as "borrador" | "emitida" | "pagada",
              tipoFactura: (row.tipo_factura as "ordinaria" | "rectificativa") ?? "ordinaria",
            };
          })
        ).then(setFacturas);
        setLoading(false);
      });
  }, []);

  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        f.numero.toLowerCase().includes(q) ||
        f.clienteNombre.toLowerCase().includes(q);
      const matchEstado =
        filterEstado === "todos" || f.estado === filterEstado;
      const matchTipo =
        filterTipo === "todas" || f.tipoFactura === filterTipo;
      return matchSearch && matchEstado && matchTipo;
    });
  }, [facturas, search, filterEstado, filterTipo]);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filteredFacturas.map((f) => f.id)));
  }, [filteredFacturas]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    const supabase = createClient();
    const { error: delErr } = await supabase.from("facturas").delete().in("id", ids);
    setBulkDeleting(false);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    setFacturas((prev) => prev.filter((f) => !ids.includes(f.id)));
    exitSelectionMode();
    setBulkDeleteOpen(false);
    toast.success(
      ids.length === 1 ? "1 factura eliminada" : `${ids.length} facturas eliminadas`
    );
    router.refresh();
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Facturas", href: "/facturas" }]}
        title="Facturas"
        description="Gestiona facturas y cobros"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!loading && facturas.length > 0 && (
              <Button
                type="button"
                variant={selectionMode ? "default" : "secondary"}
                size="sm"
                onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                className="gap-2"
              >
                <ListChecks className="h-4 w-4" strokeWidth={1.5} />
                {selectionMode ? "Cancelar selección" : "Seleccionar"}
              </Button>
            )}
            <Button asChild size="sm">
              <Link href="/facturas/nueva" className="gap-2">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Crear factura
              </Link>
            </Button>
          </div>
        }
      />

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && facturas.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={1.5} aria-hidden />
            <Input
              type="search"
              placeholder="Buscar por número o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar facturas"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
              {(["todos", "borrador", "emitida", "pagada"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setFilterEstado(e)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filterEstado === e
                      ? "bg-foreground text-background"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {e === "todos" ? "Todas" : e.charAt(0).toUpperCase() + e.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
              {(["todas", "ordinaria", "rectificativa"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterTipo(t)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filterTipo === t
                      ? "bg-foreground text-background"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {t === "todas" ? "Todas" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && facturas.length > 0 && selectionMode && (
        <div
          className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-neutral-50/90 p-3 sm:flex-row sm:items-center sm:justify-between"
          role="region"
          aria-label="Acciones de selección en masa"
        >
          <p className="text-sm text-neutral-700">
            <span className="font-medium">{selectedIds.size}</span>{" "}
            seleccionada{selectedIds.size !== 1 ? "s" : ""}
            <span className="text-neutral-500">
              {filteredFacturas.length > 0
                ? ` · ${filteredFacturas.length} en la lista actual`
                : ""}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={selectAllVisible}
              disabled={filteredFacturas.length === 0}
            >
              Seleccionar todas (visibles)
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0}>
              Quitar selección
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={selectedIds.size === 0}
              className="gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              Eliminar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-10">
        {loading ? (
          <FacturaListSkeleton />
        ) : facturas.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
            <p className="text-neutral-500">Aún no hay facturas.</p>
            <Button asChild className="mt-4">
              <Link href="/facturas/nueva" className="gap-2">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Crear primera factura
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredFacturas.length === 0 ? (
              <p className="rounded-2xl border border-border bg-white p-6 text-center text-neutral-500">
                No hay facturas que coincidan con la búsqueda.
              </p>
            ) : (
              filteredFacturas.map((f) => (
                <FacturaCard
                  key={f.id}
                  id={f.id}
                  numero={f.numero}
                  clienteNombre={f.clienteNombre}
                  importe={f.importe}
                  estado={f.estado}
                  tipoFactura={f.tipoFactura}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(f.id)}
                  onToggleSelected={toggleSelectId}
                  onDeleted={() => {
                    setFacturas((prev) => prev.filter((x) => x.id !== f.id));
                    setSelectedIds((prev) => {
                      if (!prev.has(f.id)) return prev;
                      const n = new Set(prev);
                      n.delete(f.id);
                      return n;
                    });
                  }}
                />
              )))}
          </div>
        )}
      </div>

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`¿Eliminar ${selectedIds.size} factura${selectedIds.size !== 1 ? "s" : ""}?`}
        description="Se eliminarán de forma permanente, incluidas las líneas y los pagos asociados. Esta acción no se puede deshacer."
        confirmLabel={bulkDeleting ? "Eliminando…" : "Eliminar definitivamente"}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
        variant="destructive"
      />

      <Fab href="/facturas/nueva" label="Nueva factura" />
    </div>
  );
}
