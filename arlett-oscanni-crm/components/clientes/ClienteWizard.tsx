"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createClient } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  clienteStep1Schema,
  clienteStep2Schema,
  type ClienteStep1Values,
  type ClienteStep2Values,
} from "@/lib/validations/cliente";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, title: "Datos básicos" },
  { id: 2, title: "Dirección y notas" },
  { id: 3, title: "Resumen" },
];

type WizardData = ClienteStep1Values & ClienteStep2Values & { activo?: boolean; etiqueta?: "fallecido" | null };

interface ClienteWizardProps {
  clienteId?: string;
  initialClientePadreId?: string;
}

export function ClienteWizard({ clienteId, initialClientePadreId }: ClienteWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<WizardData & { cliente_padre_id?: string | null }>>(
    initialClientePadreId ? { tipo_cliente: "empresa", cliente_padre_id: initialClientePadreId } : {}
  );
  const [loading, setLoading] = useState(!!clienteId);

  useEffect(() => {
    if (!clienteId) return;
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single()
      .then(({ data: row, error }) => {
        if (error || !row) {
          setLoading(false);
          return;
        }
        const r = row as { nombre: string; email: string | null; telefono: string | null; documento_fiscal: string | null; tipo_documento: string | null; tipo_cliente: "particular" | "empresa"; direccion: string | null; codigo_postal: string | null; localidad: string | null; notas: string | null; activo: boolean; etiqueta: "fallecido" | null; cliente_padre_id: string | null };
        setData({
          nombre: r.nombre,
          tipo_cliente: r.tipo_cliente ?? "particular",
          cliente_padre_id: r.cliente_padre_id ?? undefined,
          documento_fiscal: r.documento_fiscal ?? "",
          tipo_documento: (r.tipo_documento as "dni" | "nie" | "cif" | "vat") ?? null,
          email: r.email ?? "",
          telefono: r.telefono ?? "",
          direccion: r.direccion ?? "",
          codigo_postal: r.codigo_postal ?? "",
          localidad: r.localidad ?? "",
          notas: r.notas ?? "",
          activo: r.activo ?? true,
          etiqueta: r.etiqueta ?? null,
        });
        setLoading(false);
      });
  }, [clienteId]);

  const formStep1 = useForm<ClienteStep1Values>({
    resolver: zodResolver(clienteStep1Schema),
    defaultValues: {
      nombre: "",
      tipo_cliente: initialClientePadreId ? "empresa" : "particular",
      tipo_documento: (initialClientePadreId ? "cif" : "dni") as "dni" | "nie" | "cif" | "vat",
      documento_fiscal: "",
      email: "",
      telefono: "",
    },
    values: data?.nombre ? { nombre: data.nombre, tipo_cliente: (data.tipo_cliente as "particular" | "empresa") ?? "particular", tipo_documento: data.tipo_documento ?? null, documento_fiscal: data.documento_fiscal ?? "", email: data.email ?? "", telefono: data.telefono ?? "" } : undefined,
  });

  const formStep2 = useForm<ClienteStep2Values>({
    resolver: zodResolver(clienteStep2Schema),
    defaultValues: { direccion: "", codigo_postal: "", localidad: "", notas: "" },
    values: data ? { direccion: data.direccion ?? "", codigo_postal: data.codigo_postal ?? "", localidad: data.localidad ?? "", notas: data.notas ?? "" } : undefined,
  });

  const onStep1 = formStep1.handleSubmit((values) => {
    setData((p) => ({ ...p, ...values }));
    setStep(2);
  });

  const onStep2 = formStep2.handleSubmit((values) => {
    setData((p) => ({ ...p, ...values }));
    setStep(3);
  });

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaveError("Sesión expirada");
      setSaving(false);
      return;
    }
    const tipo_cliente = (data.tipo_cliente as "particular" | "empresa") ?? "particular";
    const tipo_doc = data.tipo_documento ?? (tipo_cliente === "empresa" ? "cif" : "dni");
    const payload = {
      nombre: data.nombre ?? "",
      tipo_cliente,
      documento_fiscal: data.documento_fiscal?.trim() || null,
      tipo_documento: data.documento_fiscal?.trim() ? tipo_doc : null,
      email: data.email || null,
      telefono: data.telefono || null,
      direccion: data.direccion || null,
      codigo_postal: data.codigo_postal || null,
      localidad: data.localidad || null,
      notas: data.notas || null,
      activo: data.etiqueta === "fallecido" ? false : (data.activo ?? true),
      etiqueta: data.etiqueta === "fallecido" ? "fallecido" : null,
      cliente_padre_id: tipo_cliente === "empresa" && (data.cliente_padre_id ?? initialClientePadreId) ? (data.cliente_padre_id ?? initialClientePadreId) : null,
    };
    if (clienteId) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", clienteId);
      setSaving(false);
      if (error) {
        setSaveError(error.message);
        return;
      }
      toast.success("Cliente actualizado");
      router.push(`/clientes/${clienteId}`);
      router.refresh();
      return;
    }
    const { data: inserted, error } = await supabase
      .from("clientes")
      .insert({ ...payload, user_id: user.id })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    toast.success("Cliente creado");
    router.push(`/clientes/${inserted.id}`);
    router.refresh();
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
      <div className="mb-8 flex items-center justify-between gap-2">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex flex-1 items-center gap-2",
              s.id < STEPS.length && "after:h-0.5 after:flex-1 after:bg-border"
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

      <div
        key={step}
        className="animate-[slideUp_0.3s_ease-out]"
        style={{ animationDuration: "0.3s" }}
      >
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Datos básicos</CardTitle>
            </CardHeader>
            <CardContent>
              <form id="cliente-step1-form" onSubmit={onStep1} className="space-y-4">
                {!initialClientePadreId && (
                <div className="space-y-2">
                  <Label>Tipo de cliente</Label>
                  <div className="flex rounded-lg border border-border p-1">
                    <button
                      type="button"
                      onClick={() => { formStep1.setValue("tipo_cliente", "particular"); formStep1.setValue("tipo_documento", "dni"); }}
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        formStep1.watch("tipo_cliente") === "particular"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      Particular
                    </button>
                    <button
                      type="button"
                      onClick={() => { formStep1.setValue("tipo_cliente", "empresa"); formStep1.setValue("tipo_documento", "cif"); }}
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        formStep1.watch("tipo_cliente") === "empresa"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      Empresa
                    </button>
                  </div>
                  <input type="hidden" {...formStep1.register("tipo_cliente")} />
                </div>
                )}
                {initialClientePadreId && (
                  <input type="hidden" {...formStep1.register("tipo_cliente")} />
                )}
                <div className="space-y-2">
                  <Label htmlFor="nombre">
                    {formStep1.watch("tipo_cliente") === "empresa" ? "Razón social *" : "Nombre y apellidos *"}
                  </Label>
                  <Input
                    id="nombre"
                    placeholder={formStep1.watch("tipo_cliente") === "empresa" ? "Nombre de la empresa" : "Nombre y apellidos del contacto"}
                    aria-describedby={formStep1.formState.errors.nombre ? "nombre-error" : undefined}
                    aria-invalid={!!formStep1.formState.errors.nombre}
                    {...formStep1.register("nombre")}
                  />
                  {formStep1.formState.errors.nombre && (
                    <p id="nombre-error" className="text-sm text-red-600" role="alert">
                      {formStep1.formState.errors.nombre.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo_documento">Tipo de documento</Label>
                  <select
                    id="tipo_documento"
                    className="flex h-10 w-full rounded-lg border border-border bg-white px-4 text-base"
                    {...formStep1.register("tipo_documento")}
                  >
                    {formStep1.watch("tipo_cliente") === "empresa" ? (
                      <>
                        <option value="cif">CIF</option>
                        <option value="vat">VAT</option>
                      </>
                    ) : (
                      <>
                        <option value="dni">DNI</option>
                        <option value="nie">NIE</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="documento_fiscal">
                    {formStep1.watch("tipo_cliente") === "particular" ? "DNI / NIE" : "CIF / VAT"}
                  </Label>
                  <Input
                    id="documento_fiscal"
                    placeholder={formStep1.watch("tipo_cliente") === "particular" ? "12345678A" : "B12345678"}
                    {...formStep1.register("documento_fiscal")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@ejemplo.com"
                    aria-describedby={formStep1.formState.errors.email ? "email-error" : undefined}
                    aria-invalid={!!formStep1.formState.errors.email}
                    {...formStep1.register("email")}
                  />
                  {formStep1.formState.errors.email && (
                    <p id="email-error" className="text-sm text-red-600" role="alert">
                      {formStep1.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    placeholder="+34 600 000 000"
                    {...formStep1.register("telefono")}
                  />
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Dirección y notas</CardTitle>
            </CardHeader>
            <CardContent>
              <form id="cliente-step2-form" onSubmit={onStep2} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="direccion">Dirección</Label>
                  <Input
                    id="direccion"
                    placeholder="Calle, número, piso"
                    {...formStep2.register("direccion")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo_postal">Código postal</Label>
                    <Input
                      id="codigo_postal"
                      placeholder="28001"
                      {...formStep2.register("codigo_postal")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="localidad">Localidad</Label>
                    <Input
                      id="localidad"
                      placeholder="Madrid"
                      {...formStep2.register("localidad")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notas">Notas</Label>
                  <textarea
                    id="notas"
                    className="flex min-h-[100px] w-full rounded-lg border border-border bg-white px-4 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Notas internas"
                    {...formStep2.register("notas")}
                  />
                </div>
                {clienteId && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="activo"
                        checked={data.activo ?? true}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setData((p) => ({ ...p, activo: checked, etiqueta: checked ? null : p.etiqueta }));
                        }}
                        className="h-4 w-4 rounded border-border"
                      />
                      <Label htmlFor="activo">Cliente activo</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="etiqueta-fallecido"
                        checked={data.etiqueta === "fallecido"}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setData((p) => ({ ...p, etiqueta: checked ? "fallecido" : null, activo: checked ? false : p.activo }));
                        }}
                        className="h-4 w-4 rounded border-border"
                      />
                      <Label htmlFor="etiqueta-fallecido">Fallecido</Label>
                    </div>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-neutral-500">Nombre</dt>
                  <dd className="font-medium">{data.nombre ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Tipo</dt>
                  <dd className="font-medium">{data.tipo_cliente === "empresa" ? "Empresa" : "Particular"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">{data.tipo_documento ? String(data.tipo_documento).toUpperCase() : "Documento fiscal"}</dt>
                  <dd className="font-medium">{data.documento_fiscal || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Email</dt>
                  <dd className="font-medium">{data.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Teléfono</dt>
                  <dd className="font-medium">{data.telefono || "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Dirección</dt>
                  <dd className="font-medium">
                    {[data.direccion, data.codigo_postal, data.localidad].filter(Boolean).join(", ") || "—"}
                  </dd>
                </div>
                {clienteId && (
                  <div>
                    <dt className="text-neutral-500">Estado</dt>
                    <dd className="font-medium">{data.etiqueta === "fallecido" ? "Fallecido" : data.activo !== false ? "Activo" : "Inactivo"}</dd>
                  </div>
                )}
              </dl>
              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Barra fija Atrás / Siguiente */}
      <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 flex justify-center border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0">
        <div className="flex w-full max-w-2xl justify-end gap-2">
          {step === 1 ? (
            <Button type="submit" form="cliente-step1-form">
              Siguiente
            </Button>
          ) : step === 2 ? (
            <>
              <Button variant="secondary" onClick={handleBack}>
                Atrás
              </Button>
              <Button type="submit" form="cliente-step2-form">
                Siguiente
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={handleBack} disabled={saving}>
                Atrás
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar cliente"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
