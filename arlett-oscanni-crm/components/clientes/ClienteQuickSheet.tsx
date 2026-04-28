"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ClienteQuickData {
  id: string;
  nombre: string;
}

interface ClienteQuickSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (cliente: ClienteQuickData) => void;
}

export function ClienteQuickSheet({
  open,
  onOpenChange,
  onSuccess,
}: ClienteQuickSheetProps) {
  const [tipoCliente, setTipoCliente] = useState<"particular" | "empresa">("particular");
  const [tipoDocumento, setTipoDocumento] = useState<"dni" | "nie" | "cif" | "vat">("dni");
  const [nombre, setNombre] = useState("");
  const [documentoFiscal, setDocumentoFiscal] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTipoCliente("particular");
    setTipoDocumento("dni");
    setNombre("");
    setDocumentoFiscal("");
    setEmail("");
    setTelefono("");
    setDireccion("");
    setCodigoPostal("");
    setLocalidad("");
    setError(null);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setError(null);
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada");
      setCreating(false);
      return;
    }

    const tipoDoc = tipoCliente === "empresa"
      ? (tipoDocumento === "vat" ? "vat" : "cif")
      : (tipoDocumento === "nie" ? "nie" : "dni");

    const { data: inserted, error: err } = await supabase
      .from("clientes")
      .insert({
        user_id: user.id,
        nombre: nombre.trim(),
        tipo_cliente: tipoCliente,
        documento_fiscal: documentoFiscal.trim() || null,
        tipo_documento: documentoFiscal.trim() ? tipoDoc : null,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        codigo_postal: codigoPostal.trim() || null,
        localidad: localidad.trim() || null,
        activo: true,
      })
      .select("id, nombre")
      .single();

    setCreating(false);
    if (err || !inserted) {
      setError(err?.message ?? "No se pudo crear el cliente.");
      return;
    }

    onSuccess(inserted as ClienteQuickData);
    handleClose(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={handleClose}
      fullScreenOnMobile
      showCloseButton
    >
      <div className="px-4 pb-8 pt-2">
        <h2 className="mb-6 text-xl font-semibold">Nuevo cliente</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de cliente</Label>
            <div className="flex rounded-lg border border-border p-1">
              <button
                type="button"
                onClick={() => {
                  setTipoCliente("particular");
                  setTipoDocumento("dni");
                }}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tipoCliente === "particular"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                Particular
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipoCliente("empresa");
                  setTipoDocumento("cif");
                }}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tipoCliente === "empresa"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                Empresa
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-nombre">
              {tipoCliente === "empresa" ? "Razón social *" : "Nombre y apellidos *"}
            </Label>
            <Input
              id="quick-nombre"
              placeholder={tipoCliente === "empresa" ? "Nombre de la empresa" : "Nombre y apellidos del contacto"}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-tipo-doc">Tipo de documento</Label>
            <select
              id="quick-tipo-doc"
              className="flex h-10 w-full rounded-lg border border-border bg-white px-4 text-base"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value as "dni" | "nie" | "cif" | "vat")}
            >
              {tipoCliente === "empresa" ? (
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
            <Label htmlFor="quick-doc">
              {tipoCliente === "particular" ? "DNI / NIE" : "CIF / VAT"}
            </Label>
            <Input
              id="quick-doc"
              placeholder={tipoCliente === "particular" ? "12345678A" : "B12345678"}
              value={documentoFiscal}
              onChange={(e) => setDocumentoFiscal(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-email">Email</Label>
              <Input
                id="quick-email"
                type="email"
                placeholder="email@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-telefono">Teléfono</Label>
              <Input
                id="quick-telefono"
                placeholder="+34 600 000 000"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-direccion">Dirección</Label>
            <Input
              id="quick-direccion"
              placeholder="Calle, número, piso"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-cp">Código postal</Label>
              <Input
                id="quick-cp"
                placeholder="28001"
                value={codigoPostal}
                onChange={(e) => setCodigoPostal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-localidad">Localidad</Label>
              <Input
                id="quick-localidad"
                placeholder="Madrid"
                value={localidad}
                onChange={(e) => setLocalidad(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleClose(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creando…" : "Crear cliente"}
            </Button>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
