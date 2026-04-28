"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PresupuestoCard } from "@/components/presupuestos/PresupuestoCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Fab } from "@/components/ui/fab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ClipboardList, Search } from "lucide-react";

type EstadoPresupuesto = "borrador" | "enviado" | "aceptado" | "rechazado" | "convertido";

export default function PresupuestosPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<"todos" | EstadoPresupuesto>("todos");
  const [presupuestos, setPresupuestos] = useState<
    Array<{
      id: string;
      numero: string;
      clienteNombre: string;
      importe: string;
      estado: EstadoPresupuesto;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("presupuestos")
      .select("id, numero, estado, total, clientes(nombre)")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setPresupuestos([]);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as Array<{
          id: string;
          numero: string;
          estado: string;
          total?: number | null;
          clientes: { nombre: string } | { nombre: string }[] | null;
        }>;
        setPresupuestos(
          rows.map((r) => {
            const cliente = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes;
            return {
              id: r.id,
              numero: r.numero,
              clienteNombre: cliente?.nombre ?? "—",
              importe:
                Number(r.total ?? 0).toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) + " €",
              estado: r.estado as EstadoPresupuesto,
            };
          })
        );
        setLoading(false);
      });
  }, []);

  const filteredPresupuestos = useMemo(() => {
    return presupuestos.filter((p) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.numero.toLowerCase().includes(q) ||
        p.clienteNombre.toLowerCase().includes(q);
      const matchEstado =
        filterEstado === "todos" || p.estado === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [presupuestos, search, filterEstado]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Presupuestos", href: "/presupuestos" }]}
        title="Presupuestos"
        description="Gestiona presupuestos y conviértelos en facturas"
        actions={
          <Button asChild size="sm">
            <Link href="/presupuestos/nuevo" className="gap-2">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Crear presupuesto
            </Link>
          </Button>
        }
      />

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {!loading && presupuestos.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={1.5} aria-hidden />
            <Input
              type="search"
              placeholder="Buscar por número o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar presupuestos"
            />
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
            {(["todos", "borrador", "enviado", "aceptado", "rechazado", "convertido"] as const).map((e) => (
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
                {e === "todos" ? "Todos" : e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} animate={false} className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-40 animate-pulse rounded bg-neutral-100" />
                    <div className="h-4 w-56 animate-pulse rounded bg-neutral-100" />
                  </div>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-100" />
                </div>
              </Card>
            ))}
          </div>
        ) : presupuestos.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
            <p className="text-neutral-500">Aún no hay presupuestos.</p>
            <Button asChild className="mt-4">
              <Link href="/presupuestos/nuevo" className="gap-2">
                <ClipboardList className="h-4 w-4" strokeWidth={1.5} />
                Crear primer presupuesto
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredPresupuestos.length === 0 ? (
              <p className="rounded-2xl border border-border bg-white p-6 text-center text-neutral-500">
                No hay presupuestos que coincidan con la búsqueda.
              </p>
            ) : (
              filteredPresupuestos.map((p) => (
                <PresupuestoCard
                  key={p.id}
                  id={p.id}
                  numero={p.numero}
                  clienteNombre={p.clienteNombre}
                  importe={p.importe}
                  estado={p.estado}
                />
              ))
            )}
          </div>
        )}
      </div>

      <Fab href="/presupuestos/nuevo" label="Nuevo presupuesto" />
    </div>
  );
}
