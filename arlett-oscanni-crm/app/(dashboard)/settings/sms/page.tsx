"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, RefreshCw, ChevronLeft } from "lucide-react";

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
  esendex_message_id: string | null;
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

const ESTADO_VARIANT: Record<string, "borrador" | "emitida" | "pagada"> = {
  pendiente: "borrador",
  omitido: "borrador",
  enviado: "emitida",
  entregado: "pagada",
  fallido: "borrador",
};

export default function SettingsSmsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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
  const [envios, setEnvios] = useState<SmsEnvio[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/settings");
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [cfgRes, plantRes, envRes, citasRes] = await Promise.all([
      supabase.from("sms_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("sms_plantillas").select("*").eq("clave", "recordatorio_cita").maybeSingle(),
      supabase
        .from("sms_envios")
        .select(
          "id, telefono, cuerpo, estado, error_mensaje, enviado_at, created_at, plantilla_clave, esendex_message_id, citas_simplybook(cliente_nombre, servicio_nombre, starts_at)"
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("citas_simplybook")
        .select(
          "id, simplybook_id, cliente_nombre, cliente_telefono, servicio_nombre, starts_at, estado, reminder_due_at, reminder_sent_at, reminder_skipped_reason"
        )
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(40),
    ]);

    if (cfgRes.data) {
      setConfig({
        enabled: Boolean(cfgRes.data.enabled),
        reminder_mode: cfgRes.data.reminder_mode as SmsConfig["reminder_mode"],
        reminder_hours_before: Number(cfgRes.data.reminder_hours_before ?? 24),
        reminder_send_hour: Number(cfgRes.data.reminder_send_hour ?? 10),
        timezone: String(cfgRes.data.timezone ?? "Europe/Madrid"),
      });
    }
    if (plantRes.data) setPlantilla(plantRes.data as Plantilla);

    const enviosRaw = (envRes.data ?? []) as Array<
      SmsEnvio & {
        citas_simplybook:
          | SmsEnvio["citas_simplybook"]
          | SmsEnvio["citas_simplybook"][]
          | null;
      }
    >;
    setEnvios(
      enviosRaw.map((e) => ({
        ...e,
        citas_simplybook: Array.isArray(e.citas_simplybook)
          ? e.citas_simplybook[0] ?? null
          : e.citas_simplybook,
      }))
    );
    setCitas((citasRes.data ?? []) as Cita[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role, load]);

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
    toast.success("Configuración SMS guardada");
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
        sync?: unknown;
        send?: { sent?: number; failed?: number; skipped?: number; errors?: string[] };
      };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al sincronizar / enviar");
      } else {
        const s = json.send;
        toast.success(
          `Sync OK. Enviados: ${s?.sent ?? 0}, omitidos: ${s?.skipped ?? 0}, fallidos: ${s?.failed ?? 0}`
        );
        if (s?.errors?.length) toast.message(s.errors.slice(0, 2).join(" · "));
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red");
    }
    setSyncing(false);
  };

  if (authLoading || user?.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          Volver a ajustes
        </Link>
      </div>

      <PageHeader
        breadcrumb={[
          { label: "Ajustes", href: "/settings" },
          { label: "SMS / SimplyBook" },
        ]}
        title="SMS y recordatorios"
        description="SimplyBook → recordatorio automático → Esendex. Cron diario ~21:00 (hora española). Solo administración."
        actions={
          <Button variant="secondary" onClick={() => void runCronNow()} disabled={syncing || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            {syncing ? "Sincronizando…" : "Sincronizar y enviar ahora"}
          </Button>
        }
      />

      {loading ? (
        <div className="mt-10 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
                Configuración del recordatorio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                Recordatorios activos
              </label>

              <div className="space-y-2">
                <Label>Modo</Label>
                <select
                  className="flex h-11 w-full max-w-md rounded-lg border border-border bg-white px-4 text-base"
                  value={config.reminder_mode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      reminder_mode: e.target.value as SmsConfig["reminder_mode"],
                    }))
                  }
                >
                  <option value="hours_before">N horas antes de la cita (p. ej. 24 h)</option>
                  <option value="day_before_at_hour">Día anterior a una hora fija</option>
                </select>
              </div>

              {config.reminder_mode === "hours_before" ? (
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="hours-before">Horas antes</Label>
                  <Input
                    id="hours-before"
                    type="number"
                    min={1}
                    max={168}
                    value={config.reminder_hours_before}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        reminder_hours_before: Number(e.target.value) || 24,
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="send-hour">Hora de envío (día anterior)</Label>
                  <Input
                    id="send-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={config.reminder_send_hour}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        reminder_send_hour: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              )}

              <div className="max-w-md space-y-2">
                <Label htmlFor="tz">Zona horaria</Label>
                <Input
                  id="tz"
                  value={config.timezone}
                  onChange={(e) => setConfig((c) => ({ ...c, timezone: e.target.value }))}
                />
              </div>

              <Button onClick={() => void saveConfig()} disabled={savingConfig}>
                {savingConfig ? "Guardando…" : "Guardar configuración"}
              </Button>
              <p className="text-xs text-neutral-500">
                El cron de Vercel corre cada día a las 19:00 UTC (≈ 21:00 en España en horario de verano).
                Credenciales SimplyBook y Esendex van en variables de entorno del servidor.
              </p>
            </CardContent>
          </Card>

          {plantilla && (
            <Card>
              <CardHeader>
                <CardTitle>Plantilla: {plantilla.nombre}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={plantilla.activa}
                    onChange={(e) =>
                      setPlantilla((p) => (p ? { ...p, activa: e.target.checked } : p))
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  Plantilla activa
                </label>
                <div className="space-y-2">
                  <Label htmlFor="tpl-body">Texto SMS</Label>
                  <textarea
                    id="tpl-body"
                    rows={4}
                    className="w-full rounded-lg border border-border bg-white px-4 py-3 text-base"
                    value={plantilla.cuerpo}
                    onChange={(e) =>
                      setPlantilla((p) => (p ? { ...p, cuerpo: e.target.value } : p))
                    }
                  />
                  <p className="text-xs text-neutral-500">
                    Variables: {"{{cliente}}"}, {"{{servicio}}"}, {"{{fecha}}"}, {"{{hora}}"},{" "}
                    {"{{profesional}}"}
                  </p>
                </div>
                <Button onClick={() => void savePlantilla()} disabled={savingPlantilla}>
                  {savingPlantilla ? "Guardando…" : "Guardar plantilla"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Próximas citas (SimplyBook)</CardTitle>
            </CardHeader>
            <CardContent>
              {citas.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No hay citas sincronizadas. Configura SimplyBook y pulsa «Sincronizar y enviar ahora».
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {citas.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">
                          {c.cliente_nombre ?? "Cliente"} · {c.servicio_nombre ?? "Servicio"}
                        </p>
                        <p className="text-neutral-500">
                          {new Date(c.starts_at).toLocaleString("es-ES")} · {c.cliente_telefono ?? "sin teléfono"}
                        </p>
                        <p className="text-xs text-neutral-400">
                          Recordatorio:{" "}
                          {c.reminder_sent_at
                            ? `enviado ${new Date(c.reminder_sent_at).toLocaleString("es-ES")}`
                            : c.reminder_due_at
                              ? `programado ${new Date(c.reminder_due_at).toLocaleString("es-ES")}`
                              : "—"}
                          {c.reminder_skipped_reason ? ` (${c.reminder_skipped_reason})` : ""}
                        </p>
                      </div>
                      <Badge variant={c.estado === "activa" ? "emitida" : "borrador"}>
                        {c.estado}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial de envíos SMS</CardTitle>
            </CardHeader>
            <CardContent>
              {envios.length === 0 ? (
                <p className="text-sm text-neutral-500">Aún no hay envíos registrados.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {envios.map((e) => (
                    <li key={e.id} className="space-y-1 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={ESTADO_VARIANT[e.estado] ?? "borrador"}>{e.estado}</Badge>
                        <span className="font-medium">{e.telefono || "—"}</span>
                        <span className="text-neutral-400">
                          {e.enviado_at
                            ? new Date(e.enviado_at).toLocaleString("es-ES")
                            : new Date(e.created_at).toLocaleString("es-ES")}
                        </span>
                      </div>
                      {e.citas_simplybook && (
                        <p className="text-neutral-500">
                          {e.citas_simplybook.cliente_nombre} · {e.citas_simplybook.servicio_nombre} ·{" "}
                          {new Date(e.citas_simplybook.starts_at).toLocaleString("es-ES")}
                        </p>
                      )}
                      <p className="text-neutral-700">{e.cuerpo}</p>
                      {e.error_mensaje && (
                        <p className="text-red-600">{e.error_mensaje}</p>
                      )}
                      {e.esendex_message_id && (
                        <p className="text-xs text-neutral-400">ID Esendex: {e.esendex_message_id}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
