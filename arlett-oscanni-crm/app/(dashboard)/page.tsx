"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Clock, ClipboardList, UserPlus, Plus } from "lucide-react";

interface MesFacturado {
  mes: string;
  total: number;
}

interface DashboardStats {
  totalClientes: number;
  facturadoMes: number;
  pendienteCobro: number;
  ultimasFacturas: Array<{ id: string; numero: string; total: number; estado: string }>;
  facturacionMeses: MesFacturado[];
  totalPresupuestos: number;
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)] sm:p-4 md:p-5">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-neutral-100" />
        <div className="h-4 w-16 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-4 h-8 w-20 animate-pulse rounded bg-neutral-100" />
      <div className="mt-2 h-4 w-24 animate-pulse rounded bg-neutral-100" />
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="h-4 flex-1 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-16 animate-pulse rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const meses: { start: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({
        start: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
      });
    }

    Promise.all([
      supabase.from("clientes").select("id", { count: "exact", head: true }).eq("activo", true),
      supabase.from("facturas").select("id, numero, total, fecha_emision").eq("estado", "pagada").gte("fecha_emision", meses[0].start),
      supabase.from("facturas").select("id, numero, total").eq("estado", "emitida"),
      supabase.from("facturas").select("id, numero, total, estado").order("created_at", { ascending: false }).limit(5),
      supabase.from("presupuestos").select("id", { count: "exact", head: true }),
    ]).then(([clientesRes, facturasPagadasRes, emitidasRes, ultimasRes, presupRes]) => {
      const totalClientes = clientesRes.count ?? 0;
      const totalPresupuestos = presupRes.count ?? 0;
      const facturasPagadas = (facturasPagadasRes.data ?? []) as Array<{ total: number; fecha_emision: string }>;
      const facturadoMes = facturasPagadas
        .filter((f) => f.fecha_emision && f.fecha_emision >= startOfMonth)
        .reduce((acc, f) => acc + Number(f.total ?? 0), 0);
      const facturacionMeses = meses.map(({ start, label }) => {
        const next = new Date(start);
        next.setMonth(next.getMonth() + 1);
        const end = next.toISOString().slice(0, 10);
        const total = facturasPagadas
          .filter((f) => f.fecha_emision && f.fecha_emision >= start && f.fecha_emision < end)
          .reduce((acc, f) => acc + Number(f.total ?? 0), 0);
        return { mes: label, total };
      });
      const emitidas = (emitidasRes.data ?? []) as Array<{ total: number }>;
      const pendienteCobro = emitidas.reduce((acc, f) => acc + Number(f.total ?? 0), 0);
      const ultimasFacturas = (ultimasRes.data ?? []) as Array<{ id: string; numero: string; total: number; estado: string }>;
      setStats({
        totalClientes,
        facturadoMes,
        pendienteCobro,
        ultimasFacturas,
        facturacionMeses,
        totalPresupuestos,
      });
      setLoading(false);
    });
  }, []);

  return (
    <div className="animate-[fadeIn_0.3s_ease-out]">
      <PageHeader
        breadcrumb={[{ label: "Inicio" }]}
        title="Inicio"
        description="Resumen y acceso rápido"
      />

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : stats ? (
          <>
            <Link href="/clientes">
              <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-all hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] hover:border-accent/30">
                <CardContent className="p-3 sm:p-4 md:p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <Users className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                    {stats.totalClientes}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">Clientes activos</p>
                  <p className="mt-2 text-xs font-medium text-accent">Ver clientes →</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/facturas">
              <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-all hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] hover:border-accent/30">
                <CardContent className="p-3 sm:p-4 md:p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <TrendingUp className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                    {stats.facturadoMes.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">Facturado este mes</p>
                  <p className="mt-2 text-xs font-medium text-accent">Ver facturas →</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/facturas?estado=emitida">
              <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-all hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] hover:border-accent/30">
                <CardContent className="p-3 sm:p-4 md:p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <Clock className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                    {stats.pendienteCobro.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">Pendiente de cobro</p>
                  <p className="mt-2 text-xs font-medium text-accent">Ver facturas emitidas →</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/presupuestos">
              <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-all hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] hover:border-accent/30">
                <CardContent className="p-3 sm:p-4 md:p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <ClipboardList className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                    {stats.totalPresupuestos}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">Presupuestos</p>
                  <p className="mt-2 text-xs font-medium text-accent">Ver presupuestos →</p>
                </CardContent>
              </Card>
            </Link>
          </>
        ) : null}
      </div>

      {/* Acciones rápidas */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/clientes/nuevo" className="gap-2">
              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
              Nuevo cliente
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/facturas/nueva" className="gap-2">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Nueva factura
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/presupuestos/nuevo" className="gap-2">
              <ClipboardList className="h-4 w-4" strokeWidth={1.5} />
              Nuevo presupuesto
            </Link>
          </Button>
        </div>
      </div>

      {/* Gráfico facturación + contenido */}
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {stats?.facturacionMeses && stats.facturacionMeses.length > 0 && (
            <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Facturación últimos 6 meses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-32 items-end gap-2">
                  {stats.facturacionMeses.map(({ mes, total }) => {
                    const max = Math.max(...stats!.facturacionMeses.map((m) => m.total), 1);
                    const pct = max > 0 ? (total / max) * 100 : 0;
                    return (
                      <div key={mes} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t-md bg-accent/80 transition-all"
                          style={{ height: `${Math.max(pct, 4)}%`, minHeight: "4px" }}
                          title={total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                        />
                        <span className="text-[10px] font-medium uppercase text-neutral-500">{mes}</span>
                        <span className="text-[11px] font-semibold text-foreground">
                          {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {loading ? (
                <ListSkeleton rows={4} />
              ) : stats ? (
                <>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50/80 px-4 py-3">
                    <span className="text-neutral-600">Clientes activos</span>
                    <span className="font-semibold text-foreground">{stats.totalClientes}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50/80 px-4 py-3">
                    <span className="text-neutral-600">Facturado este mes</span>
                    <span className="font-semibold text-foreground">
                      {stats.facturadoMes.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50/80 px-4 py-3">
                    <span className="text-neutral-600">Pendiente de cobro</span>
                    <span className="font-semibold text-foreground">
                      {stats.pendienteCobro.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50/80 px-4 py-3">
                    <span className="text-neutral-600">Presupuestos</span>
                    <span className="font-semibold text-foreground">{stats.totalPresupuestos}</span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Últimas facturas</CardTitle>
            <Link
              href="/facturas"
              className="text-sm font-medium text-accent hover:underline"
            >
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ListSkeleton rows={5} />
            ) : stats && stats.ultimasFacturas.length > 0 ? (
              <ul className="space-y-2">
                {stats.ultimasFacturas.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/facturas/${f.id}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-neutral-50"
                    >
                      <span className="font-medium text-foreground">{f.numero}</span>
                      <span className="text-sm text-neutral-500">
                        {Number(f.total ?? 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-neutral-500">Sin facturas aún.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
