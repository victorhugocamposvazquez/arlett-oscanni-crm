"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveInvoiceLogoUrl } from "@/lib/empresa-facturacion";
import { useAuth } from "@/lib/auth/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

const empty = {
  razon_social: "",
  nif: "",
  direccion: "",
  codigo_postal: "",
  localidad: "",
  provincia: "",
  telefono: "",
  email: "",
  iban: "",
  numero_cuenta_bancaria: "",
  logo_url: "",
};

export default function EmpresaFacturacionPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "admin") {
      router.replace("/settings");
      return;
    }
    const supabase = createClient();
    supabase
      .from("empresa_facturacion")
      .select(
        "razon_social, nif, direccion, codigo_postal, localidad, provincia, telefono, email, iban, numero_cuenta_bancaria, logo_url"
      )
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
        } else if (data) {
          setForm({
            razon_social: data.razon_social ?? "",
            nif: data.nif ?? "",
            direccion: data.direccion ?? "",
            codigo_postal: data.codigo_postal ?? "",
            localidad: data.localidad ?? "",
            provincia: data.provincia ?? "",
            telefono: data.telefono ?? "",
            email: data.email ?? "",
            iban: data.iban ?? "",
            numero_cuenta_bancaria: data.numero_cuenta_bancaria ?? "",
            logo_url: data.logo_url ?? "",
          });
        }
        setLoading(false);
      });
  }, [user?.role, authLoading, router]);

  if (authLoading) {
    return (
      <div>
        <PageHeader
          breadcrumb={[
            { label: "Ajustes", href: "/settings" },
            { label: "Datos de empresa" },
          ]}
          title="Datos de empresa (facturación)"
        />
        <p className="mt-6 text-sm text-neutral-500">Cargando…</p>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return null;
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("empresa_facturacion")
      .update({
        razon_social: form.razon_social.trim(),
        nif: form.nif.trim(),
        direccion: form.direccion.trim(),
        codigo_postal: form.codigo_postal.trim(),
        localidad: form.localidad.trim(),
        provincia: form.provincia.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        iban: form.iban.trim() || null,
        numero_cuenta_bancaria: form.numero_cuenta_bancaria.trim() || null,
        logo_url: form.logo_url.trim() || null,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Datos guardados. Se usarán al imprimir facturas.");
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: "Ajustes", href: "/settings" },
          { label: "Datos de empresa" },
        ]}
        title="Datos de empresa (facturación)"
        description="Rellenar los campos visibles en facturas. Si dejas un campo vacío, se usan los valores por defecto (variables de entorno públicas) cuando apliquen."
      />

      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" strokeWidth={1.5} />
            Emisor y cobro
          </CardTitle>
          <CardDescription>
            Estos datos aparecen al imprimir o guardar en PDF la factura. El IBAN y el número de
            cuenta bancaria se muestran en el pie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-neutral-500">Cargando…</p>
          ) : (
            <form onSubmit={onSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logo">Logotipo (factura)</Label>
                <Input
                  id="logo"
                  value={form.logo_url}
                  onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://… o /images/mi-logo.png (vacío = logo por defecto)"
                  autoComplete="off"
                />
                <p className="text-xs text-neutral-500">
                  URL pública o ruta bajo el mismo sitio. Si está vacío, se usa <code className="text-xs">/images/logo-arlett.png</code> o la variable
                  pública de entorno.
                </p>
                {form.logo_url.trim() && typeof window !== "undefined" ? (
                  <Image
                    src={resolveInvoiceLogoUrl(form.logo_url, window.location.origin)}
                    alt="Vista previa logo"
                    width={200}
                    height={48}
                    unoptimized
                    className="mt-2 h-12 w-auto max-w-[200px] object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="razon">Razón social</Label>
                <Input
                  id="razon"
                  value={form.razon_social}
                  onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))}
                  placeholder="Ej. Rehabinco S.L."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nif">NIF / CIF</Label>
                <Input
                  id="nif"
                  value={form.nif}
                  onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dir">Dirección</Label>
                <Input
                  id="dir"
                  value={form.direccion}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cp">Código postal</Label>
                  <Input
                    id="cp"
                    value={form.codigo_postal}
                    onChange={(e) => setForm((f) => ({ ...f, codigo_postal: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc">Localidad</Label>
                  <Input
                    id="loc"
                    value={form.localidad}
                    onChange={(e) => setForm((f) => ({ ...f, localidad: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prov">Provincia</Label>
                <Input
                  id="prov"
                  value={form.provincia}
                  onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tel">Teléfono</Label>
                  <Input
                    id="tel"
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="em">Email</Label>
                  <Input
                    id="em"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN (transferencia)</Label>
                <Input
                  id="iban"
                  value={form.iban}
                  onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ncta">Número de cuenta bancaria (CCC u otra referencia)</Label>
                <Input
                  id="ncta"
                  value={form.numero_cuenta_bancaria}
                  onChange={(e) => setForm((f) => ({ ...f, numero_cuenta_bancaria: e.target.value }))}
                  placeholder="Opcional, además del IBAN"
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
                <Button type="button" variant="secondary" asChild>
                  <Link href="/settings">Volver a ajustes</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
