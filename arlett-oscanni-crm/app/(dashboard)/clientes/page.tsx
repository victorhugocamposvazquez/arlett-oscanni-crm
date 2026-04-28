"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ClienteCard } from "@/components/clientes/ClienteCard";
import { ClienteListSkeleton } from "@/components/clientes/ClienteListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Fab } from "@/components/ui/fab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Search } from "lucide-react";

export default function ClientesPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterActivo, setFilterActivo] = useState<"todos" | "activos" | "inactivos">("todos");
  const [clientes, setClientes] = useState<Array<{
    id: string;
    nombre: string;
    email: string | null;
    telefono: string | null;
    activo: boolean;
  }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("id, nombre, email, telefono, activo")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setClientes([]);
        } else {
          setClientes(data ?? []);
        }
        setLoading(false);
      });
  }, []);

  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.telefono?.includes(q));
      const matchActivo =
        filterActivo === "todos" ||
        (filterActivo === "activos" && c.activo) ||
        (filterActivo === "inactivos" && !c.activo);
      return matchSearch && matchActivo;
    });
  }, [clientes, search, filterActivo]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Clientes", href: "/clientes" }]}
        title="Clientes"
        description="Gestiona tus clientes y contactos"
        actions={
          <Button asChild size="sm">
            <Link href="/clientes/nuevo" className="gap-2">
              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
              Crear cliente
            </Link>
          </Button>
        }
      />

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && clientes.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={1.5} aria-hidden />
            <Input
              type="search"
              placeholder="Buscar por nombre, email o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar clientes"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(["todos", "activos", "inactivos"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterActivo(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterActivo === f
                    ? "bg-foreground text-background"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {f === "todos" ? "Todos" : f === "activos" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        {loading ? (
          <ClienteListSkeleton />
        ) : clientes.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
            <p className="text-neutral-500">Aún no hay clientes.</p>
            <Button asChild className="mt-4">
              <Link href="/clientes/nuevo" className="gap-2">
                <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                Añadir primer cliente
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredClientes.length === 0 ? (
              <p className="rounded-2xl border border-border bg-white p-6 text-center text-neutral-500">
                No hay clientes que coincidan con la búsqueda.
              </p>
            ) : (
              filteredClientes.map((c) => (
                <ClienteCard
                  key={c.id}
                  id={c.id}
                  nombre={c.nombre}
                  email={c.email}
                  telefono={c.telefono}
                  activo={c.activo}
                />
              )))}
          </div>
        )}
      </div>

      <Fab href="/clientes/nuevo" label="Añadir cliente" />
    </div>
  );
}
