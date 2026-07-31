"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { gsmLength, toGsmSafeText } from "@/lib/sms/gsm";
import { renderSmsTemplate } from "@/lib/sms/templates";
import { checkPhoneForSms } from "@/lib/sms/phone";
import { aliasServicio, normalizeServicioKey } from "@/lib/sms/servicios";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

type SmsConfig = {
  enabled: boolean;
  reminder_mode: "hours_before" | "day_before_at_hour";
  reminder_hours_before: number;
  reminder_send_hour: number;
  timezone: string;
  test_mode: boolean;
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
  origen: string;
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
  profesional_nombre: string | null;
  starts_at: string;
  estado: string;
  reminder_due_at: string | null;
  reminder_sent_at: string | null;
  reminder_skipped_reason: string | null;
  reminder_skipped_phone: string | null;
};

type CitaEstadoId =
  | "en_cola"
  | "programada"
  | "avisada"
  | "simulada"
  | "no_enviable"
  | "omitida"
  | "cancelada"
  | "sin_programar";

/** Último envío registrado de una cita, para saber si fue real o simulado. */
type UltimoEnvio = { estado: string; simulado: boolean };

type CitaClasificada = Cita & {
  estadoId: CitaEstadoId;
  telefonoOk: boolean;
  telefonoMotivo: string | null;
  telefonoE164: string | null;
  telefonoCorregido: boolean;
};

type Tono = "neutral" | "blue" | "green" | "red" | "amber";

const ENVIO_SELECT =
  "id, telefono, cuerpo, estado, error_mensaje, enviado_at, created_at, plantilla_clave, provider_subid, simulado, origen, citas_simplybook(cliente_nombre, servicio_nombre, starts_at)";

const PAGE_SIZE = 20;

/** El cron de Vercel corre a las 19:00 UTC (≈21:00 en España). */
const CRON_HOUR_UTC = 19;

const TABS = [
  { id: "citas", label: "Próximas citas" },
  { id: "envios", label: "Envíos" },
  { id: "pruebas", label: "Pruebas" },
  { id: "config", label: "Configuración" },
] as const;

const RANGOS = [
  { id: "1", label: "Hoy", dias: 1 },
  { id: "7", label: "7 días", dias: 7 },
  { id: "30", label: "30 días", dias: 30 },
  { id: "90", label: "90 días", dias: 90 },
  { id: "todo", label: "Todo", dias: null },
] as const;

const ESTADOS_ENVIO = ["todos", "enviado", "entregado", "fallido", "omitido", "pendiente"] as const;

const ENVIO_PILL: Record<string, { label: string; tono: Tono }> = {
  pendiente: { label: "Pendiente", tono: "neutral" },
  enviado: { label: "Enviado", tono: "blue" },
  entregado: { label: "Entregado", tono: "green" },
  fallido: { label: "Fallido", tono: "red" },
  omitido: { label: "Omitido", tono: "amber" },
};

const CITA_PILL: Record<CitaEstadoId, { label: string; tono: Tono }> = {
  en_cola: { label: "En cola", tono: "blue" },
  programada: { label: "Programada", tono: "neutral" },
  avisada: { label: "Enviado", tono: "green" },
  simulada: { label: "Simulada", tono: "amber" },
  no_enviable: { label: "No enviable", tono: "red" },
  omitida: { label: "Omitida", tono: "amber" },
  cancelada: { label: "Cancelada", tono: "neutral" },
  sin_programar: { label: "Sin programar", tono: "neutral" },
};

const FILTROS_CITA = [
  { id: "todas", label: "Todas" },
  { id: "en_cola", label: "En cola" },
  { id: "programada", label: "Programadas" },
  { id: "no_enviable", label: "No enviables" },
  { id: "avisada", label: "Enviados" },
] as const;

/** Medianoche local de hace `dias - 1` días, para que "7 días" incluya hoy. */
function desdeIso(dias: number | null): string | null {
  if (dias === null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString();
}

/** La zona horaria la escribe el usuario, así que puede ser inválida. */
function formatTz(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("es-ES", { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat("es-ES", options).format(date);
  }
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function diaRelativo(iso: string): string | null {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = new Date(iso);
  dia.setHours(0, 0, 0, 0);
  const diff = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return null;
}

function clasificarCita(c: Cita, ahora: number, envio?: UltimoEnvio): CitaClasificada {
  const tel = checkPhoneForSms(c.cliente_telefono);
  const base = {
    ...c,
    telefonoOk: tel.ok,
    telefonoMotivo: tel.ok ? null : tel.label,
    telefonoE164: tel.ok ? tel.phone : null,
    // Se rechazó un número y ahora hay otro válido: el aviso se reintenta
    telefonoCorregido: tel.ok && c.reminder_skipped_phone !== null && !c.reminder_sent_at,
  };

  // Un recordatorio "enviado" en modo de prueba no ha llegado a ningún móvil, así
  // que se distingue del real; y si lo último que hubo fue una omisión, manda esa
  const estadoId: CitaEstadoId =
    c.estado === "cancelada"
      ? "cancelada"
      : c.reminder_sent_at
        ? c.reminder_skipped_reason || envio?.estado === "omitido"
          ? "omitida"
          : envio?.simulado
            ? "simulada"
            : "avisada"
        : !tel.ok
          ? "no_enviable"
          : c.reminder_due_at && new Date(c.reminder_due_at).getTime() <= ahora
            ? "en_cola"
            : c.reminder_due_at
              ? "programada"
              : "sin_programar";
  return { ...base, estadoId };
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
        className
      )}
    >
      {children}
    </section>
  );
}

function PanelHead({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {meta != null && <span className="text-xs tabular-nums text-neutral-400">{meta}</span>}
      </div>
      {children}
    </header>
  );
}

const PILL_BG: Record<Tono, string> = {
  neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200/70",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-100",
};

const PILL_DOT: Record<Tono, string> = {
  neutral: "bg-neutral-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
};

function Pill({
  tono,
  children,
  title,
}: {
  tono: Tono;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        PILL_BG[tono]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", PILL_DOT[tono])} aria-hidden />
      {children}
    </span>
  );
}

function Metrics({
  items,
}: {
  items: { label: string; valor: number | string; hint?: string; tono?: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <div className="-ml-px -mt-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((m) => (
          <div key={m.label} className="border-l border-t border-border px-4 py-3">
            <p className="text-[11px] font-medium text-neutral-500">{m.label}</p>
            <p
              className={cn(
                "mt-1 text-[22px] font-semibold leading-none tabular-nums",
                m.tono ?? "text-foreground"
              )}
            >
              {m.valor}
            </p>
            <p className="mt-1 h-3.5 text-[11px] leading-none text-neutral-400">{m.hint ?? ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-neutral-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            value === o.id
              ? "bg-white text-foreground shadow-[0_1px_2px_rgba(28,25,23,0.10)]"
              : "text-neutral-500 hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Pager({
  desde,
  hasta,
  total,
  onPrev,
  onNext,
  disabled,
  atStart,
  atEnd,
}: {
  desde: number;
  hasta: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  atStart: boolean;
  atEnd: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
      <span className="text-[11px] tabular-nums text-neutral-500">
        {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={onPrev}
          disabled={atStart || disabled}
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Anterior
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={onNext}
          disabled={atEnd || disabled}
        >
          Siguiente
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

export default function SettingsSmsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("citas");

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
    test_mode: true,
  });
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [enviosPorCita, setEnviosPorCita] = useState<Record<string, UltimoEnvio>>({});
  const [modoPrueba, setModoPrueba] = useState<boolean | null>(null);
  const [forzadoPorEntorno, setForzadoPorEntorno] = useState(false);
  const [errorEsquema, setErrorEsquema] = useState<string | null>(null);

  const [envios, setEnvios] = useState<SmsEnvio[]>([]);
  const [enviosTotal, setEnviosTotal] = useState(0);
  const [kpis, setKpis] = useState({
    total: 0,
    enviado: 0,
    entregado: 0,
    fallido: 0,
    omitido: 0,
    simulados: 0,
  });

  const [rango, setRango] = useState<(typeof RANGOS)[number]["id"]>("30");
  const [estadoEnvio, setEstadoEnvio] = useState<(typeof ESTADOS_ENVIO)[number]>("todos");
  const [pageEnvios, setPageEnvios] = useState(0);

  const [filtroCita, setFiltroCita] = useState<(typeof FILTROS_CITA)[number]["id"]>("todas");
  const [pageCitas, setPageCitas] = useState(0);

  const [aliasServicios, setAliasServicios] = useState<Record<string, string>>({});
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [nombresSimplybook, setNombresSimplybook] = useState<Record<string, string>>({});
  const [savingServicios, setSavingServicios] = useState(false);

  const [citaPrueba, setCitaPrueba] = useState<string>("");
  const [confirmandoPrueba, setConfirmandoPrueba] = useState(false);
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);

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
    setErrorEsquema(null);
    const supabase = createClient();
    const [cfgRes, plantRes, citasRes, serviciosRes] = await Promise.all([
      supabase.from("sms_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("sms_plantillas").select("*").eq("clave", "recordatorio_cita").maybeSingle(),
      supabase
        .from("citas_simplybook")
        .select(
          "id, simplybook_id, cliente_nombre, cliente_telefono, servicio_nombre, profesional_nombre, starts_at, estado, reminder_due_at, reminder_sent_at, reminder_skipped_reason, reminder_skipped_phone"
        )
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(500),
      supabase.from("sms_servicios").select("clave, nombre_simplybook, nombre_sms"),
    ]);

    if (serviciosRes.error) setErrorEsquema(serviciosRes.error.message);
    const alias: Record<string, string> = {};
    const nombres: Record<string, string> = {};
    for (const row of serviciosRes.data ?? []) {
      alias[row.clave] = row.nombre_sms;
      nombres[row.clave] = row.nombre_simplybook;
    }
    setAliasServicios(alias);
    setAliasDraft(alias);
    setNombresSimplybook(nombres);

    if (cfgRes.data) {
      setConfig({
        enabled: Boolean(cfgRes.data.enabled),
        reminder_mode: cfgRes.data.reminder_mode as SmsConfig["reminder_mode"],
        reminder_hours_before: Number(cfgRes.data.reminder_hours_before ?? 24),
        reminder_send_hour: Number(cfgRes.data.reminder_send_hour ?? 21),
        timezone: String(cfgRes.data.timezone ?? "Europe/Madrid"),
        test_mode: Boolean(cfgRes.data.test_mode),
      });
    }
    if (plantRes.data) setPlantilla(plantRes.data as Plantilla);
    if (citasRes.error) setErrorEsquema(citasRes.error.message);
    const listaCitas = (citasRes.data ?? []) as Cita[];
    setCitas(listaCitas);

    // Último envío de cada cita: es lo único que dice si el aviso fue real o simulado
    if (listaCitas.length > 0) {
      const { data: envios, error: enviosError } = await supabase
        .from("sms_envios")
        .select("cita_id, estado, simulado, created_at")
        .in(
          "cita_id",
          listaCitas.map((c) => c.id)
        )
        .order("created_at", { ascending: false });

      if (enviosError) setErrorEsquema(enviosError.message);
      const mapa: Record<string, UltimoEnvio> = {};
      for (const e of envios ?? []) {
        if (!e.cita_id || mapa[e.cita_id]) continue;
        mapa[e.cita_id] = { estado: e.estado, simulado: Boolean(e.simulado) };
      }
      setEnviosPorCita(mapa);
    } else {
      setEnviosPorCita({});
    }

    setLoadingBase(false);
  }, []);

  const loadEnvios = useCallback(async () => {
    setLoadingEnvios(true);
    const supabase = createClient();

    const filtrado = () => {
      let q = supabase.from("sms_envios").select(ENVIO_SELECT, { count: "exact" });
      if (desde) q = q.gte("created_at", desde);
      if (estadoEnvio !== "todos") q = q.eq("estado", estadoEnvio);
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
        .range(pageEnvios * PAGE_SIZE, pageEnvios * PAGE_SIZE + PAGE_SIZE - 1),
      contar(),
      contar({ estado: "enviado" }),
      contar({ estado: "entregado" }),
      contar({ estado: "fallido" }),
      contar({ estado: "omitido" }),
      contar({ simulado: true }),
    ]);

    if (listaRes.error) setErrorEsquema(listaRes.error.message);
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
  }, [desde, estadoEnvio, pageEnvios]);

  useEffect(() => {
    if (user?.role === "admin") void loadBase();
  }, [user?.role, loadBase]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    void (async () => {
      try {
        const res = await fetch("/api/admin/sms-run");
        const json = (await res.json()) as { simulado?: boolean; forzadoPorEntorno?: boolean };
        setModoPrueba(Boolean(json.simulado));
        setForzadoPorEntorno(Boolean(json.forzadoPorEntorno));
      } catch {
        setModoPrueba(null);
      }
    })();
  }, [user?.role]);

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
        test_mode: config.test_mode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSavingConfig(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setModoPrueba(config.test_mode || forzadoPorEntorno);
    toast.success(
      config.test_mode || forzadoPorEntorno
        ? "Configuración guardada · modo prueba activo"
        : "Configuración guardada · los recordatorios saldrán de verdad"
    );
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

  const citasClasificadas = useMemo(() => {
    const ahora = Date.now();
    return citas.map((c) => clasificarCita(c, ahora, enviosPorCita[c.id]));
  }, [citas, enviosPorCita]);

  const resumenCitas = useMemo(() => {
    const conteo = (id: CitaEstadoId) =>
      citasClasificadas.filter((c) => c.estadoId === id).length;
    return {
      total: citasClasificadas.length,
      enCola: conteo("en_cola"),
      programadas: conteo("programada"),
      avisadas: conteo("avisada"),
      simuladas: conteo("simulada"),
      noEnviables: conteo("no_enviable") + conteo("omitida"),
    };
  }, [citasClasificadas]);

  const citasFiltradas = useMemo(
    () =>
      filtroCita === "todas"
        ? citasClasificadas
        : citasClasificadas.filter((c) =>
            filtroCita === "no_enviable"
              ? c.estadoId === "no_enviable" || c.estadoId === "omitida"
              : filtroCita === "avisada"
                ? c.estadoId === "avisada" || c.estadoId === "simulada"
                : c.estadoId === filtroCita
          ),
    [citasClasificadas, filtroCita]
  );

  const citasPagina = useMemo(
    () => citasFiltradas.slice(pageCitas * PAGE_SIZE, pageCitas * PAGE_SIZE + PAGE_SIZE),
    [citasFiltradas, pageCitas]
  );

  const proximaEjecucion = useMemo(() => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(CRON_HOUR_UTC, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }, []);

  /** Servicios vistos en la agenda más los que ya tengan nombre configurado. */
  const catalogoServicios = useMemo(() => {
    const porClave = new Map<string, string>();
    for (const c of citas) {
      if (!c.servicio_nombre) continue;
      const clave = normalizeServicioKey(c.servicio_nombre);
      if (!porClave.has(clave)) porClave.set(clave, c.servicio_nombre);
    }
    for (const [clave, nombre] of Object.entries(nombresSimplybook)) {
      if (!porClave.has(clave)) porClave.set(clave, nombre);
    }
    return [...porClave.entries()]
      .map(([clave, nombre]) => ({ clave, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [citas, nombresSimplybook]);

  /** Coste del recordatorio con ese nombre de servicio, para avisar del 2º SMS. */
  const medirConServicio = useCallback(
    (servicio: string) => {
      if (!plantilla) return null;
      const texto = toGsmSafeText(
        renderSmsTemplate(plantilla.cuerpo, {
          cliente: "Cliente",
          servicio,
          fecha: "31-07-2026",
          hora: "11:30",
          profesional: "Tere",
        })
      );
      const gsm = gsmLength(texto);
      const unicode = gsm === null;
      const chars = gsm ?? [...texto].length;
      return { chars, unicode, sms: Math.max(1, Math.ceil(chars / (unicode ? 70 : 160))) };
    },
    [plantilla]
  );

  const saveServicios = async () => {
    setSavingServicios(true);
    const supabase = createClient();
    const ahora = new Date().toISOString();

    const conNombre = catalogoServicios
      .filter((s) => (aliasDraft[s.clave] ?? "").trim())
      .map((s) => ({
        clave: s.clave,
        nombre_simplybook: s.nombre,
        nombre_sms: aliasDraft[s.clave].trim(),
        updated_at: ahora,
      }));
    // Vaciar el campo equivale a volver al nombre de SimplyBook
    const sinNombre = catalogoServicios
      .filter((s) => !(aliasDraft[s.clave] ?? "").trim())
      .map((s) => s.clave);

    let error: string | null = null;
    if (conNombre.length > 0) {
      const res = await supabase.from("sms_servicios").upsert(conNombre, { onConflict: "clave" });
      if (res.error) error = res.error.message;
    }
    if (!error && sinNombre.length > 0) {
      const res = await supabase.from("sms_servicios").delete().in("clave", sinNombre);
      if (res.error) error = res.error.message;
    }

    setSavingServicios(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Nombres de servicios guardados");
    await loadBase();
  };

  /** Mismo texto que compondría el cron para esa cita, con sus reglas GSM. */
  const cuerpoParaCita = useCallback(
    (c: Cita): string => {
      if (!plantilla) return "";
      const inicio = new Date(c.starts_at);
      const fecha = formatTz(inicio, config.timezone, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).replace(/\//g, "-");
      const hora = formatTz(inicio, config.timezone, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return toGsmSafeText(
        renderSmsTemplate(plantilla.cuerpo, {
          cliente: c.cliente_nombre ?? undefined,
          servicio:
            aliasServicio(c.servicio_nombre, aliasServicios) ??
            c.servicio_nombre?.toUpperCase() ??
            undefined,
          fecha,
          hora,
          profesional: c.profesional_nombre ?? undefined,
        })
      );
    },
    [plantilla, config.timezone, aliasServicios]
  );

  const citaSeleccionada = useMemo(
    () => citasClasificadas.find((c) => c.id === citaPrueba) ?? null,
    [citasClasificadas, citaPrueba]
  );

  const enviarPrueba = async () => {
    if (!citaSeleccionada) return;
    setEnviandoPrueba(true);
    try {
      const res = await fetch("/api/admin/sms-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citaId: citaSeleccionada.id, real: true }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; telefono?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "No se pudo enviar el SMS de prueba");
      } else {
        toast.success(`SMS real enviado a ${json.telefono}`);
        await Promise.all([loadBase(), loadEnvios()]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red");
    }
    setEnviandoPrueba(false);
    setConfirmandoPrueba(false);
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

  const envioDesde = enviosTotal === 0 ? 0 : pageEnvios * PAGE_SIZE + 1;
  const envioHasta = Math.min((pageEnvios + 1) * PAGE_SIZE, enviosTotal);
  const citaDesde = citasFiltradas.length === 0 ? 0 : pageCitas * PAGE_SIZE + 1;
  const citaHasta = Math.min((pageCitas + 1) * PAGE_SIZE, citasFiltradas.length);

  const proximaEjecucionTexto = formatTz(proximaEjecucion, config.timezone, {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="animate-[fadeIn_0.3s_ease-out]">
      <Breadcrumb
        items={[{ label: "Ajustes", href: "/settings" }, { label: "SMS / SimplyBook" }]}
        className="mb-3"
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">SMS</h1>
            <Pill tono={config.enabled ? "green" : "neutral"}>
              {config.enabled ? "Activo" : "Pausado"}
            </Pill>
            {modoPrueba && <Pill tono="amber">Modo prueba</Pill>}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            SimplyBook → recordatorio → LabsMobile · próxima ejecución {proximaEjecucionTexto}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Ajustes
          </Link>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={() => void runCronNow()}
            disabled={syncing || loadingBase}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} strokeWidth={1.5} />
            {syncing ? "Sincronizando…" : "Sincronizar y enviar"}
          </Button>
        </div>
      </div>

      {errorEsquema && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-800">
          <span className="font-semibold">Faltan migraciones por aplicar en Supabase.</span> La
          consulta ha fallado con: {errorEsquema}. Ejecuta los SQL pendientes de{" "}
          <code className="rounded bg-red-100 px-1 font-mono text-[12px]">supabase/migrations</code>{" "}
          o esta pantalla mostrará datos incompletos.
        </div>
      )}

      {modoPrueba && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <span className="font-semibold">Modo de prueba activo.</span> LabsMobile acepta los
          envíos, pero no entrega nada: ningún SMS marcado como enviado ha llegado a un móvil.{" "}
          {forzadoPorEntorno ? (
            <>
              Está forzado por la variable{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[12px]">
                LABSMOBILE_TEST_MODE
              </code>{" "}
              en Vercel, así que el interruptor de Configuración no puede desactivarlo: quita la
              variable y vuelve a desplegar.
            </>
          ) : (
            <>
              Puedes desactivarlo en{" "}
              <button
                type="button"
                onClick={() => setTab("config")}
                className="font-semibold underline underline-offset-2"
              >
                Configuración
              </button>
              .
            </>
          )}
        </div>
      )}

      <nav className="mt-4 flex gap-5 border-b border-border" role="tablist" aria-label="Secciones">
        {TABS.map((t) => {
          const activa = tab === t.id;
          const contador =
            t.id === "citas" ? resumenCitas.total : t.id === "envios" ? enviosTotal : null;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-0.5 pb-2.5 text-[13px] font-medium transition-colors",
                activa
                  ? "border-accent text-foreground"
                  : "border-transparent text-neutral-500 hover:text-foreground"
              )}
            >
              {t.label}
              {contador !== null && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                    activa ? "bg-accent/10 text-accent" : "bg-neutral-100 text-neutral-500"
                  )}
                >
                  {contador}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "citas" && (
        <div className="mt-4 space-y-3">
          <Metrics
            items={[
              { label: "Próximas citas", valor: resumenCitas.total, hint: "sincronizadas" },
              {
                label: "En cola",
                valor: resumenCitas.enCola,
                hint: "saldrán en la próxima",
                tono: resumenCitas.enCola > 0 ? "text-blue-700" : undefined,
              },
              { label: "Programadas", valor: resumenCitas.programadas, hint: "aviso más adelante" },
              {
                label: "Enviados",
                valor: resumenCitas.avisadas,
                hint:
                  resumenCitas.simuladas > 0
                    ? `+${resumenCitas.simuladas} simuladas`
                    : "SMS real entregado",
                tono: "text-emerald-700",
              },
              {
                label: "No enviables",
                valor: resumenCitas.noEnviables,
                hint: "teléfono no válido",
                tono: resumenCitas.noEnviables > 0 ? "text-red-600" : undefined,
              },
            ]}
          />

          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-[13px]",
              resumenCitas.enCola > 0
                ? "border-blue-100 bg-blue-50/70 text-blue-900"
                : "border-border bg-neutral-50 text-neutral-600"
            )}
          >
            {resumenCitas.enCola > 0 ? (
              <>
                <span className="font-semibold">
                  {resumenCitas.enCola} recordatorio{resumenCitas.enCola === 1 ? "" : "s"}
                </span>{" "}
                a la espera: saldrá{resumenCitas.enCola === 1 ? "" : "n"} el{" "}
                {proximaEjecucionTexto}, o ahora mismo si pulsas «Sincronizar y enviar».
              </>
            ) : (
              <>
                No hay recordatorios pendientes de salir. El siguiente repaso es el{" "}
                {proximaEjecucionTexto}.
              </>
            )}
          </div>

          <Panel>
            <PanelHead title="Agenda" meta={`${citasFiltradas.length} citas`}>
              <Segmented value={filtroCita} options={FILTROS_CITA} onChange={(id) => {
                setFiltroCita(id);
                setPageCitas(0);
              }} />
            </PanelHead>

            <div className="hidden grid-cols-[1fr_170px_140px_1fr] gap-3 border-b border-border bg-neutral-50/60 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:grid">
              <span>Cita</span>
              <span>Cuándo</span>
              <span>Teléfono</span>
              <span>Recordatorio</span>
            </div>

            {loadingBase ? (
              <div className="flex justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
              </div>
            ) : citasPagina.length === 0 ? (
              <p className="px-4 py-12 text-center text-[13px] text-neutral-500">
                {citasClasificadas.length === 0
                  ? "Sin citas sincronizadas. Pulsa «Sincronizar y enviar» para traerlas de SimplyBook."
                  : "Ninguna cita en este filtro."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {citasPagina.map((c) => {
                  const pill = CITA_PILL[c.estadoId];
                  const relativo = diaRelativo(c.starts_at);
                  return (
                    <li
                      key={c.id}
                      className="grid gap-1.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-neutral-50/80 md:grid-cols-[1fr_170px_140px_1fr] md:items-center md:gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {c.servicio_nombre ?? "Servicio sin nombre"}
                        </p>
                        <p className="truncate text-[11px] text-neutral-400">
                          {c.cliente_nombre ?? "Sin cliente"} · #{c.simplybook_id}
                        </p>
                      </div>

                      <div className="tabular-nums text-neutral-600">
                        <span className="md:hidden text-neutral-400">Cita: </span>
                        {fechaLarga(c.starts_at)}
                        {relativo && (
                          <span className="ml-1.5 rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium text-neutral-500">
                            {relativo}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate font-mono text-[12px] tabular-nums",
                            c.telefonoOk ? "text-neutral-600" : "text-red-600 line-through"
                          )}
                        >
                          {c.cliente_telefono || "—"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tono={pill.tono}>{pill.label}</Pill>
                        <span className="min-w-0 truncate text-[11px] text-neutral-500">
                          {c.reminder_sent_at
                            ? c.estadoId === "omitida"
                              ? (c.reminder_skipped_reason ?? c.telefonoMotivo ?? "omitida")
                              : c.estadoId === "simulada"
                                ? `simulado ${fechaCorta(c.reminder_sent_at)} · no salió`
                                : `enviado ${fechaCorta(c.reminder_sent_at)}`
                            : (c.telefonoMotivo ??
                              (c.telefonoCorregido
                                ? "teléfono corregido, se reintenta"
                                : c.reminder_due_at
                                  ? `previsto ${fechaCorta(c.reminder_due_at)}`
                                  : "sin fecha de aviso"))}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Pager
              desde={citaDesde}
              hasta={citaHasta}
              total={citasFiltradas.length}
              onPrev={() => setPageCitas((p) => Math.max(0, p - 1))}
              onNext={() => setPageCitas((p) => p + 1)}
              atStart={pageCitas === 0}
              atEnd={citaHasta >= citasFiltradas.length}
              disabled={loadingBase}
            />
          </Panel>
        </div>
      )}

      {tab === "envios" && (
        <div className="mt-4 space-y-3">
          <Metrics
            items={[
              { label: "Registros", valor: kpis.total },
              { label: "Entregados", valor: kpis.entregado, tono: "text-emerald-700" },
              { label: "Enviados", valor: kpis.enviado, hint: "sin confirmar", tono: "text-blue-700" },
              { label: "Fallidos", valor: kpis.fallido, tono: "text-red-600" },
              { label: "Omitidos", valor: kpis.omitido, hint: "sin coste", tono: "text-amber-700" },
            ]}
          />

          {kpis.simulados > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
              <span className="font-semibold">{kpis.simulados}</span> de estos envíos son simulados:
              se registraron con el modo de prueba activo y no llegaron a ningún teléfono.
            </p>
          )}

          <Panel>
            <PanelHead title="Historial" meta={`${enviosTotal} envíos`}>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={rango}
                  options={RANGOS}
                  onChange={(id) => {
                    setRango(id);
                    setPageEnvios(0);
                  }}
                />
                <select
                  value={estadoEnvio}
                  onChange={(e) => {
                    setEstadoEnvio(e.target.value as (typeof ESTADOS_ENVIO)[number]);
                    setPageEnvios(0);
                  }}
                  className="h-[26px] rounded-lg border border-border bg-white px-2 text-[11px] capitalize"
                  aria-label="Filtrar por estado"
                >
                  {ESTADOS_ENVIO.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </PanelHead>

            <div className="hidden grid-cols-[110px_130px_1fr_120px] gap-3 border-b border-border bg-neutral-50/60 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:grid">
              <span>Estado</span>
              <span>Teléfono</span>
              <span>Mensaje</span>
              <span className="text-right">Registro</span>
            </div>

            {loadingEnvios ? (
              <div className="flex justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
              </div>
            ) : envios.length === 0 ? (
              <p className="px-4 py-12 text-center text-[13px] text-neutral-500">
                Sin envíos en este periodo.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {envios.map((e) => {
                  const pill = ENVIO_PILL[e.estado] ?? { label: e.estado, tono: "neutral" as Tono };
                  return (
                    <li
                      key={e.id}
                      className="grid gap-1.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-neutral-50/80 md:grid-cols-[110px_130px_1fr_120px] md:items-start md:gap-3"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <Pill tono={pill.tono}>{pill.label}</Pill>
                        {e.simulado && (
                          <span
                            className="text-[10px] font-semibold uppercase text-amber-600"
                            title="Envío simulado: no llegó a ningún teléfono"
                          >
                            sim
                          </span>
                        )}
                        {e.origen === "prueba" && (
                          <span
                            className="text-[10px] font-semibold uppercase text-neutral-400"
                            title="Enviado a mano desde la zona de pruebas"
                          >
                            prueba
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
                        <p className="truncate text-[11px] text-neutral-400">
                          {e.citas_simplybook
                            ? `${e.citas_simplybook.servicio_nombre ?? "servicio"} · ${fechaCorta(
                                e.citas_simplybook.starts_at
                              )}`
                            : "cita eliminada"}
                          {e.provider_subid ? ` · ${e.provider_subid}` : ""}
                        </p>
                        {e.error_mensaje && (
                          <p className="text-[11px] text-red-600">{e.error_mensaje}</p>
                        )}
                      </div>
                      <span className="text-[11px] tabular-nums text-neutral-400 md:text-right">
                        {fechaCorta(e.enviado_at ?? e.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <Pager
              desde={envioDesde}
              hasta={envioHasta}
              total={enviosTotal}
              onPrev={() => setPageEnvios((p) => Math.max(0, p - 1))}
              onNext={() => setPageEnvios((p) => p + 1)}
              atStart={pageEnvios === 0}
              atEnd={envioHasta >= enviosTotal}
              disabled={loadingEnvios}
            />
          </Panel>
        </div>
      )}

      {tab === "pruebas" && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Envío real a una sola cita" />
            <div className="space-y-3 px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-neutral-600">
                Crea una cita a tu nombre en SimplyBook, sincroniza y mándate el recordatorio aquí.
                Este envío sale <span className="font-semibold">de verdad</span> aunque el modo
                prueba esté activo, así compruebas el circuito completo (LabsMobile, entrega y
                estado en el historial) sin que salga nada al resto de la agenda.
              </p>

              <div className="space-y-1">
                <span className="text-[11px] font-medium text-neutral-500">Cita</span>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-white px-2 text-[13px]"
                  value={citaPrueba}
                  onChange={(e) => setCitaPrueba(e.target.value)}
                >
                  <option value="">Selecciona una cita…</option>
                  {citasClasificadas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fechaLarga(c.starts_at)} · {c.servicio_nombre ?? "Servicio"} ·{" "}
                      {c.cliente_nombre ?? "sin cliente"} · {c.cliente_telefono ?? "sin teléfono"}
                    </option>
                  ))}
                </select>
                {citasClasificadas.length === 0 && (
                  <p className="text-[11px] text-neutral-400">
                    No hay citas sincronizadas. Pulsa «Sincronizar y enviar» primero.
                  </p>
                )}
              </div>

              {citaSeleccionada && (
                <div className="space-y-2 rounded-lg border border-border bg-neutral-50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-neutral-500">
                    <span>Destino</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        citaSeleccionada.telefonoOk ? "text-neutral-700" : "text-red-600"
                      )}
                    >
                      {citaSeleccionada.telefonoE164
                        ? `+${citaSeleccionada.telefonoE164}`
                        : (citaSeleccionada.telefonoMotivo ?? "sin teléfono")}
                    </span>
                  </div>
                  <p className="text-[13px] leading-snug text-neutral-700">
                    {cuerpoParaCita(citaSeleccionada) || "Sin plantilla activa"}
                  </p>
                  {citaSeleccionada.reminder_sent_at && (
                    <p className="text-[11px] text-amber-700">
                      Esta cita ya tiene un recordatorio registrado; se enviará otra vez.
                    </p>
                  )}
                </div>
              )}

              <Button
                size="sm"
                className="h-9 w-full bg-red-600 text-xs text-white hover:bg-red-700"
                onClick={() => setConfirmandoPrueba(true)}
                disabled={!citaSeleccionada?.telefonoOk || !plantilla || enviandoPrueba}
              >
                {enviandoPrueba ? "Enviando…" : "Enviar SMS real ahora"}
              </Button>

              <p className="text-[11px] leading-relaxed text-neutral-400">
                Se registra en el historial con la marca <span className="font-semibold">prueba</span>{" "}
                y marca la cita como avisada, para que el cron no repita el mensaje esta noche.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Qué comprobar" />
            <ul className="space-y-2.5 px-4 py-3.5 text-[13px] leading-relaxed text-neutral-600">
              <li>
                <span className="font-medium text-foreground">Llega el SMS</span> al móvil, con el
                remitente correcto y el texto sin tildes raras ni cortado a mitad.
              </li>
              <li>
                <span className="font-medium text-foreground">Aparece en Envíos</span> como Enviado
                y sin la marca de simulado.
              </li>
              <li>
                <span className="font-medium text-foreground">Pasa a Entregado</span> en un par de
                minutos: eso confirma que LabsMobile está llamando al webhook de acuse.
              </li>
              <li>
                <span className="font-medium text-foreground">Un solo SMS</span> por recordatorio en
                la previsualización de la plantilla; si marca dos, el texto es demasiado largo.
              </li>
            </ul>
          </Panel>
        </div>
      )}

      {tab === "config" && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Recordatorio">
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Activo
              </label>
            </PanelHead>
            <div className="space-y-3 px-4 py-3.5">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-neutral-500">Cuándo se avisa</span>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-white px-2 text-[13px]"
                  value={config.reminder_mode}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      reminder_mode: e.target.value as SmsConfig["reminder_mode"],
                    }))
                  }
                >
                  <option value="hours_before">N horas antes de la cita</option>
                  <option value="day_before_at_hour">El día anterior, a hora fija</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-neutral-500">
                    {config.reminder_mode === "hours_before" ? "Horas antes" : "Hora de envío"}
                  </span>
                  {config.reminder_mode === "hours_before" ? (
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      className="h-9 px-2 text-[13px] tabular-nums"
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
                      className="h-9 px-2 text-[13px] tabular-nums"
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
                  <span className="text-[11px] font-medium text-neutral-500">Zona horaria</span>
                  <Input
                    className="h-9 px-2 text-[13px]"
                    value={config.timezone}
                    onChange={(e) => setConfig((c) => ({ ...c, timezone: e.target.value }))}
                  />
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-neutral-400">
                El cron repasa la agenda una vez al día a las {CRON_HOUR_UTC}:00 UTC, así que la
                hora de envío solo se cumple si coincide con ese repaso.
              </p>

              <div
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  config.test_mode || forzadoPorEntorno
                    ? "border-amber-200 bg-amber-50"
                    : "border-border bg-neutral-50"
                )}
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={config.test_mode || forzadoPorEntorno}
                    disabled={forzadoPorEntorno}
                    onChange={(e) => setConfig((c) => ({ ...c, test_mode: e.target.checked }))}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-border disabled:opacity-60"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">
                      Modo prueba
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">
                      {forzadoPorEntorno
                        ? "Forzado por LABSMOBILE_TEST_MODE en Vercel. Quita esa variable para poder cambiarlo desde aquí."
                        : config.test_mode
                          ? "Los recordatorios se registran pero LabsMobile no los entrega ni los cobra. Desactívalo cuando quieras enviar de verdad."
                          : "Los recordatorios saldrán de verdad a los móviles de los clientes y LabsMobile los facturará."}
                    </span>
                  </span>
                </label>
              </div>

              <Button
                size="sm"
                className="h-9 w-full text-xs"
                onClick={() => void saveConfig()}
                disabled={savingConfig}
              >
                {savingConfig ? "Guardando…" : "Guardar configuración"}
              </Button>
            </div>
          </Panel>

          {plantilla && (
            <Panel>
              <PanelHead title="Plantilla del recordatorio">
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
              </PanelHead>
              <div className="space-y-3 px-4 py-3.5">
                <textarea
                  rows={4}
                  className="w-full resize-y rounded-lg border border-border bg-white px-2.5 py-2 text-[13px] leading-relaxed"
                  value={plantilla.cuerpo}
                  onChange={(e) => setPlantilla((p) => (p ? { ...p, cuerpo: e.target.value } : p))}
                />
                <p className="font-mono text-[11px] leading-relaxed text-neutral-400">
                  {"{{servicio}} {{fecha}} {{hora}} {{profesional}} {{cliente}}"}
                </p>

                {preview && (
                  <div className="rounded-lg border border-border bg-neutral-50 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500">
                      <span>Previsualización</span>
                      <span className="tabular-nums">
                        {preview.chars} car · {preview.sms} SMS ·{" "}
                        <span className={preview.unicode ? "text-amber-600" : "text-emerald-600"}>
                          {preview.unicode ? "unicode" : "gsm"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug text-neutral-700">
                      {preview.texto}
                    </p>
                  </div>
                )}

                <Button
                  size="sm"
                  className="h-9 w-full text-xs"
                  onClick={() => void savePlantilla()}
                  disabled={savingPlantilla}
                >
                  {savingPlantilla ? "Guardando…" : "Guardar plantilla"}
                </Button>
              </div>
            </Panel>
          )}

          <Panel className="lg:col-span-2">
            <PanelHead title="Nombres de los servicios" meta={catalogoServicios.length}>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => void saveServicios()}
                disabled={savingServicios || catalogoServicios.length === 0}
              >
                {savingServicios ? "Guardando…" : "Guardar nombres"}
              </Button>
            </PanelHead>

            <p className="border-b border-border px-4 py-2 text-[12px] leading-relaxed text-neutral-500">
              Lo que escribas aquí es lo que lee el cliente, tal cual. Si lo dejas vacío se usa el
              nombre de SimplyBook en mayúsculas. La columna de la derecha avisa si el recordatorio
              se pasa de un SMS con ese nombre.
            </p>

            <div className="hidden grid-cols-[1fr_1fr_130px] gap-3 border-b border-border bg-neutral-50/60 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 md:grid">
              <span>En SimplyBook</span>
              <span>Nombre para el cliente</span>
              <span className="text-right">Coste del aviso</span>
            </div>

            {catalogoServicios.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-neutral-500">
                Aún no hay servicios. Sincroniza la agenda y aparecerán aquí.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {catalogoServicios.map((s) => {
                  const valor = aliasDraft[s.clave] ?? "";
                  const medida = medirConServicio(valor.trim() || s.nombre.toUpperCase());
                  return (
                    <li
                      key={s.clave}
                      className="grid gap-1.5 px-4 py-2 md:grid-cols-[1fr_1fr_130px] md:items-center md:gap-3"
                    >
                      <span className="truncate text-[13px] text-neutral-500" title={s.nombre}>
                        {s.nombre}
                      </span>
                      <Input
                        value={valor}
                        placeholder={s.nombre.toUpperCase()}
                        onChange={(e) =>
                          setAliasDraft((d) => ({ ...d, [s.clave]: e.target.value }))
                        }
                        className="h-8 px-2 text-[13px]"
                        aria-label={`Nombre en el SMS para ${s.nombre}`}
                      />
                      <span
                        className={cn(
                          "text-[11px] tabular-nums md:text-right",
                          medida && medida.sms > 1 ? "font-semibold text-red-600" : "text-neutral-400"
                        )}
                      >
                        {medida ? `${medida.chars} car · ${medida.sms} SMS` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <AlertDialog
        open={confirmandoPrueba}
        onOpenChange={setConfirmandoPrueba}
        title="Enviar un SMS real"
        variant="destructive"
        confirmLabel="Enviar de verdad"
        loading={enviandoPrueba}
        onConfirm={() => void enviarPrueba()}
        description={
          citaSeleccionada ? (
            <span className="block space-y-2">
              <span className="block">
                Va a salir un SMS real a{" "}
                <span className="font-mono font-medium text-foreground">
                  +{citaSeleccionada.telefonoE164}
                </span>
                , con coste en LabsMobile. Asegúrate de que es tu número.
              </span>
              <span className="block rounded-lg bg-neutral-50 px-3 py-2 text-[13px] text-neutral-700">
                {cuerpoParaCita(citaSeleccionada)}
              </span>
            </span>
          ) : (
            "Selecciona una cita."
          )
        }
      />
    </div>
  );
}
