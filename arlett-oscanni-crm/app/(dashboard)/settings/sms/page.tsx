"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { gsmLength, toGsmSafeText } from "@/lib/sms/gsm";
import { renderSmsTemplate } from "@/lib/sms/templates";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

type SmsConfig = {
  enabled: boolean;
  reminder_mode: "hours_before" | "day_before_at_hour";
  reminder_hours_before: number;
  reminder_send_hour: number;
  timezone: string;
};

type Plantilla = {
  id: string;
  clave: string;
  nombre: string;
  cuerpo: string;
  activa: boolean;
};

type SmsEnvio = {
  id: string;
  telefono: string;
  cuerpo: string;
  estado: string;
  error_mensaje: string | null;
  enviado_at: string | null;
  created_at: string;
  plantilla_clave: string | null;
  provider_subid: string | null;
  simulado: boolean;
  citas_simplybook: {
    cliente_nombre: string | null;
    servicio_nombre: string | null;
    starts_at: string;
  } | null;
};

type Cita = {
  id: string;
  simplybook_id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  servicio_nombre: string | null;
  starts_at: string;
  estado: string;
  reminder_due_at: string | null;
  reminder_sent_at: string | null;
  reminder_skipped_reason: string | null;
};

type Kpis = {
  total: number;
  enviado: number;
  entregado: number;
  fallido: number;
  omitido: number;
  simulados: number;
};

const ENVIO_SELECT =
  "id, telefono, cuerpo, estado, error_mensaje, enviado_at, created_at, plantilla_clave, provider_subid, simulado, citas_simplybook(cliente_nombre, servicio_nombre, starts_at)";

const PAGE_SIZE = 20;

const RANGOS = [
  { id: "1", label: "Hoy", dias: 1 },
  { id: "7", label: "7 d", dias: 7 },
  { id: "30", label: "30 d", dias: 30 },
  { id: "90", label: "90 d", dias: 90 },
  { id: "todo", label: "Todo", dias: null },
] as const;

const ESTADOS = ["todos", "enviado", "entregado", "fallido", "omitido", "pendiente"] as const;

const ESTADO_VARIANT: Record<string, "borrador" | "emitida" | "exito" | "error" | "inactivo"> = {
  pendiente: "borrador",
  enviado: "emitida",
  entregado: "exito",
  fallido: "error",
  omitido: "inactivo",
};

/** Medianoche local de hace `dias - 1` días, para que "7 d" incluya hoy. */
function desdeIso(dias: number | null): string | null {
  if (dias === null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString();
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function SettingsSmsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingEnvios, setLoadingEnvios] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingPlantilla, setSavingPlantilla] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [config, setConfig] = useState<SmsConfig>({
    enabled: true,
    reminder_mode: "day_before_at_hour",
    reminder_hours_before: 24,
    reminder_send_hour: 21,
    timezone: "Europe/Madrid",
  });
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [citasTotal, setCitasTotal] = useState(0);

  const [envios, setEnvios] = useState<SmsEnvio[]>([]);
  const [enviosTotal, setEnviosTotal] = useState(0);
  const [kpis, setKpis] = useState<Kpis>({
    total: 0,
    enviado: 0,
    entregado: 0,
    fallido: 0,
    omitido: 0,
    simulados: 0,
  });

  const [rango, setRango] = useState<(typeof RANGOS)[number]["id"]>("30");
  const [estado, setEstado] = useState<(typeof ESTADOS)[number]>("todos");
  const [page, setPage] = useState(0);

  const desde = useMemo(
    () => desdeIso(RANGOS.find((r) => r.id === rango)?.dias ?? null),
    [rango]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") router.replace("/settings");
  }, [user, authLoading, router]);

  const loadBase = useCallback(async () => {
    setLoadingBase(true);
    const supabase = createClient();
    const [cfgRes, plantRes, citasRes] = await Promise.all([
      supabase.from("sms_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("sms_plantillas").select("*").eq("clave", "recordatorio_cita").maybeSingle(),
      supabase
        .from("citas_simplybook")
        .select(
          "id, simplybook_id, cliente_nombre, cliente_telefono, servicio_nombre, starts_at, estado, reminder_due_at, reminder_sent_at, reminder_skipped_reason",
          { count: "exact" }
        )
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(25),
    ]);

    if (cfgRes.data) {
      setConfig({
        enabled: Boolean(cfgRes.data.enabled),
        reminder_mode: cfgRes.data.reminder_mode as SmsConfig["reminder_mode"],
        reminder_hours_before: Number(cfgRes.data.reminder_hours_before ?? 24),
        reminder_send_hour: Number(cfgRes.data.reminder_send_hour ?? 21),
        timezone: String(cfgRes.data.timezone ?? "Europe/Madrid"),
      });
    }
    if (plantRes.data) setPlantilla(plantRes.data as Plantilla);
    setCitas((citasRes.data ?? []) as Cita[]);
    setCitasTotal(citasRes.count ?? 0);
    setLoadingBase(false);
  }, []);

  const loadEnvios = useCallback(async () => {
    setLoadingEnvios(true);
    const supabase = createClient();

    const filtrado = () => {
      let q = supabase.from("sms_envios").select(ENVIO_SELECT, { count: "exact" });
      if (desde) q = q.gte("created_at", desde);
      if (estado !== "todos") q = q.eq("estado", estado);
      return q;
    };

    const contar = async (filtro?: { estado?: string; simulado?: boolean }) => {
      let q = supabase.from("sms_envios").select("id", { count: "exact", head: true });
      if (desde) q = q.gte("created_at", desde);
      if (filtro?.estado) q = q.eq("estado", filtro.estado);
      if (filtro?.simulado !== undefined) q = q.eq("simulado", filtro.simulado);
      const { count } = await q;
      return count ?? 0;
    };

    const [listaRes, total, enviado, entregado, fallido, omitido, simulados] = await Promise.all([
      filtrado()
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
      contar(),
      contar({ estado: "enviado" }),
      contar({ estado: "entregado" }),
      contar({ estado: "fallido" }),
      contar({ estado: "omitido" }),
      contar({ simulado: true }),
    ]);

    const raw = (listaRes.data ?? []) as Array<
      SmsEnvio & {
        citas_simplybook: SmsEnvio["citas_simplybook"] | SmsEnvio["citas_simplybook"][] | null;
      }
    >;
    setEnvios(
      raw.map((e) => ({
        ...e,
        citas_simplybook: Array.isArray(e.citas_simplybook)
          ? e.citas_simplybook[0] ?? null
          : e.citas_simplybook,
      }))
    );
    setEnviosTotal(listaRes.count ?? 0);
    setKpis({ total, enviado, entregado, fallido, omitido, simulados });
    setLoadingEnvios(false);
  }, [desde, estado, page]);

  useEffect(() => {
    if (user?.role === "admin") void loadBase();
  }, [user?.role, loadBase]);

  useEffect(() => {
    if (user?.role === "admin") void loadEnvios();
  }, [user?.role, loadEnvios]);

  const saveConfig = async () => {
    setSavingConfig(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("sms_config")
      .update({
        enabled: config.enabled,
        reminder_mode: config.reminder_mode,
        reminder_hours_before: config.reminder_hours_before,
        reminder_send_hour: config.reminder_send_hour,
        timezone: config.timezone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSavingConfig(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Configuración guardada");
  };

  const savePlantilla = async () => {
    if (!plantilla) return;
    setSavingPlantilla(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("sms_plantillas")
      .update({
        nombre: plantilla.nombre,
        cuerpo: plantilla.cuerpo,
        activa: plantilla.activa,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plantilla.id);
    setSavingPlantilla(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plantilla actualizada");
  };

  const runCronNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sms-run", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        simulado?: boolean;
        send?: { sent?: number; failed?: number; skipped?: number; errors?: string[] };
      };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al sincronizar / enviar");
      } else {
        const s = json.send;
        toast.success(
          `Enviados ${s?.sent ?? 0} · omitidos ${s?.skipped ?? 0} · fallidos ${s?.failed ?? 0}` +
            (json.simulado ? " · MODO SIMULADO: no ha salido ningún SMS real" : "")
        );
        if (s?.errors?.length) toast.message(s.errors.slice(0, 2).join(" · "));
        await Promise.all([loadBase(), loadEnvios()]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red");
    }
    setSyncing(false);
  };

  const preview = useMemo(() => {
    if (!plantilla) return null;
    const texto = toGsmSafeText(
      renderSmsTemplate(plantilla.cuerpo, {
        cliente: "Cliente",
        servicio: "Depilación láser".toUpperCase(),
        fecha: "30-07-2026",
        hora: "11:15",
        profesional: "Tere",
      })
    );
    const gsm = gsmLength(texto);
    const unicode = gsm === null;
    const chars = gsm ?? [...texto].length;
    return {
      texto,
      chars,
      unicode,
      sms: Math.max(1, Math.ceil(chars / (unicode ? 70 : 160))),
    };
  }, [plantilla]);

  if (authLoading || user?.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
      </div>
    );
  }

  const desdeIndice = enviosTotal === 0 ? 0 : page * PAGE_SIZE + 1;
  const hastaIndice = Math.min((page + 1) * PAGE_SIZE, enviosTotal);
  const ultimaPagina = hastaIndice >= enviosTotal;

  return (
    <div className="animate-[fadeIn_0.3s_ease-out]">
      <Breadcrumb
        items={[{ label: "Ajustes", href: "/settings" }, { label: "SMS / SimplyBook" }]}
        className="mb-3"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">SMS y recordatorios</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            SimplyBook → recordatorio → LabsMobile · cron diario 19:00 UTC (≈21:00 España)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Ajustes
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runCronNow()}
            disabled={syncing || loadingBase}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} strokeWidth={1.5} />
            {syncing ? "Sincronizando…" : "Sincronizar y enviar"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total", valor: kpis.total, tono: "text-foreground" },
          { label: "Enviados", valor: kpis.enviado, tono: "text-blue-700" },
          { label: "Entregados", valor: kpis.entregado, tono: "text-emerald-700" },
          { label: "Fallidos", valor: kpis.fallido, tono: "text-red-600" },
          { label: "Omitidos", valor: kpis.omitido, tono: "text-neutral-500" },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-border bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(28,25,23,0.03)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {k.label}
            </p>
            <p className={cn("mt-0.5 text-xl font-semibold tabular-nums leading-none", k.tono)}>
              {k.valor}
            </p>
          </div>
        ))}
      </div>

      {kpis.simulados > 0 && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">{kpis.simulados}</span> de estos envíos son simulados: se
          registraron con el modo de prueba activo y no llegaron a ningún teléfono.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-0 lg:col-span-2" animate={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold">Envíos</h2>
              <span className="text-[11px] tabular-nums text-neutral-400">{enviosTotal}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-neutral-50 p-0.5">
                {RANGOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRango(r.id);
                      setPage(0);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      rango === r.id
                        ? "bg-white text-foreground shadow-[0_1px_2px_rgba(28,25,23,0.08)]"
                        : "text-neutral-500 hover:text-foreground"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <select
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value as (typeof ESTADOS)[number]);
                  setPage(0);
                }}
                className="h-8 rounded-lg border border-border bg-white px-2 text-[11px] capitalize"
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="hidden grid-cols-[88px_116px_1fr_112px] gap-3 border-b border-border bg-neutral-50/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:grid">
            <span>Estado</span>
            <span>Teléfono</span>
            <span>Mensaje</span>
            <span className="text-right">Registro</span>
          </div>

          {loadingEnvios ? (
            <div className="flex justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
            </div>
          ) : envios.length === 0 ? (
            <p className="px-3 py-10 text-center text-xs text-neutral-500">
              Sin envíos en este periodo.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {envios.map((e) => (
                <li
                  key={e.id}
                  className="grid gap-1 px-3 py-2 text-[13px] transition-colors hover:bg-neutral-50 md:grid-cols-[88px_116px_1fr_112px] md:items-start md:gap-3"
                >
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={ESTADO_VARIANT[e.estado] ?? "default"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {e.estado}
                    </Badge>
                    {e.simulado && (
                      <span
                        className="text-[10px] font-semibold uppercase text-amber-600"
                        title="Envío simulado: no llegó a ningún teléfono"
                      >
                        sim
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[12px] tabular-nums text-neutral-600">
                    {e.telefono || "—"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-neutral-700" title={e.cuerpo}>
                      {e.cuerpo}
                    </p>
                    {e.citas_simplybook && (
                      <p className="truncate text-[11px] text-neutral-400">
                        {e.citas_simplybook.servicio_nombre ?? "servicio"} ·{" "}
                        {fechaCorta(e.citas_simplybook.starts_at)}
                        {e.provider_subid ? ` · ${e.provider_subid}` : ""}
                      </p>
                    )}
                    {e.error_mensaje && (
                      <p className="text-[11px] text-red-600">{e.error_mensaje}</p>
                    )}
                  </div>
                  <span className="text-[11px] tabular-nums text-neutral-400 md:text-right">
                    {fechaCorta(e.enviado_at ?? e.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-[11px] tabular-nums text-neutral-400">
              {desdeIndice}–{hastaIndice} de {enviosTotal}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loadingEnvios}
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => setPage((p) => p + 1)}
                disabled={ultimaPagina || loadingEnvios}
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-0" animate={false}>
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <h2 className="text-[13px] font-semibold">Recordatorio</h2>
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Activo
              </label>
            </div>
            <div className="space-y-2.5 px-3 py-3">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Modo
                </span>
                <select
                  className="h-8 w-full rounded-lg border border-border bg-white px-2 text-[12px]"
                  value={config.reminder_mode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      reminder_mode: e.target.value as SmsConfig["reminder_mode"],
                    }))
                  }
                >
                  <option value="hours_before">N horas antes</option>
                  <option value="day_before_at_hour">Día anterior a hora fija</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    {config.reminder_mode === "hours_before" ? "Horas antes" : "Hora envío"}
                  </span>
                  {config.reminder_mode === "hours_before" ? (
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      className="h-8 px-2 text-[12px] tabular-nums"
                      value={config.reminder_hours_before}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          reminder_hours_before: Number(e.target.value) || 24,
                        }))
                      }
                    />
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      className="h-8 px-2 text-[12px] tabular-nums"
                      value={config.reminder_send_hour}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          reminder_send_hour: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Zona
                  </span>
                  <Input
                    className="h-8 px-2 text-[12px]"
                    value={config.timezone}
                    onChange={(e) => setConfig((c) => ({ ...c, timezone: e.target.value }))}
                  />
                </div>
              </div>

              <Button
                size="sm"
                className="h-8 w-full text-xs"
                onClick={() => void saveConfig()}
                disabled={savingConfig}
              >
                {savingConfig ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </Card>

          {plantilla && (
            <Card className="p-0" animate={false}>
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <h2 className="text-[13px] font-semibold">Plantilla</h2>
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <input
                    type="checkbox"
                    checked={plantilla.activa}
                    onChange={(e) =>
                      setPlantilla((p) => (p ? { ...p, activa: e.target.checked } : p))
                    }
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Activa
                </label>
              </div>
              <div className="space-y-2 px-3 py-3">
                <textarea
                  rows={4}
                  className="w-full resize-y rounded-lg border border-border bg-white px-2 py-1.5 text-[12px] leading-relaxed"
                  value={plantilla.cuerpo}
                  onChange={(e) => setPlantilla((p) => (p ? { ...p, cuerpo: e.target.value } : p))}
                />
                <p className="font-mono text-[10px] leading-relaxed text-neutral-400">
                  {"{{servicio}} {{fecha}} {{hora}} {{profesional}} {{cliente}}"}
                </p>

                {preview && (
                  <div className="rounded-lg border border-border bg-neutral-50 px-2 py-1.5">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      <span>Previsualización</span>
                      <span className="tabular-nums">
                        {preview.chars} car · {preview.sms} SMS ·{" "}
                        <span className={preview.unicode ? "text-amber-600" : "text-emerald-600"}>
                          {preview.unicode ? "unicode" : "gsm"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-neutral-600">{preview.texto}</p>
                  </div>
                )}

                <Button
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={() => void savePlantilla()}
                  disabled={savingPlantilla}
                >
                  {savingPlantilla ? "Guardando…" : "Guardar plantilla"}
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-0" animate={false}>
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <h2 className="text-[13px] font-semibold">Próximas citas</h2>
              <span className="text-[11px] tabular-nums text-neutral-400">{citasTotal}</span>
            </div>
            {citas.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-neutral-500">
                Sin citas sincronizadas.
              </p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {citas.map((c) => (
                  <li key={c.id} className="px-3 py-2 text-[12px] hover:bg-neutral-50">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">
                        {c.servicio_nombre ?? "Servicio"}
                      </span>
                      <span className="shrink-0 tabular-nums text-neutral-500">
                        {fechaCorta(c.starts_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                      <span className="truncate font-mono">
                        {c.cliente_telefono ?? "sin teléfono"}
                      </span>
                      <span className="shrink-0">
                        {c.reminder_sent_at
                          ? "avisada"
                          : c.reminder_due_at
                            ? `aviso ${fechaCorta(c.reminder_due_at)}`
                            : "—"}
                      </span>
                    </div>
                    {c.reminder_skipped_reason && (
                      <p className="text-[10px] text-amber-600">{c.reminder_skipped_reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
