"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ClienteDetailSkeleton } from "@/components/clientes/ClienteDetailSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Pencil, Trash2, FileText, Building2, Plus, ClipboardList } from "lucide-react";

interface Cliente {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  tipo_cliente: "particular" | "empresa";
  documento_fiscal: string | null;
  tipo_documento: "dni" | "nie" | "cif" | "vat" | null;
  direccion: string | null;
  codigo_postal: string | null;
  localidad: string | null;
  notas: string | null;
  activo: boolean;
  cliente_padre_id?: string | null;
}

export default function DetalleClientePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [facturas, setFacturas] = useState<Array<{ id: string; numero: string; estado: string; total?: number }>>([]);
  const [empresasAsociadas, setEmpresasAsociadas] = useState<Array<{ id: string; nombre: string }>>([]);
  const [presupuestos, setPresupuestos] = useState<Array<{ id: string; numero: string; estado: string; total: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setCliente(null);
        } else {
          setCliente(data as Cliente);
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("facturas")
      .select("id, numero, estado")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setFacturas(data ?? []);
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("id, nombre")
      .eq("cliente_padre_id", id)
      .order("nombre")
      .then(({ data }) => {
        setEmpresasAsociadas(data ?? []);
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("presupuestos")
      .select("id, numero, estado, total")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPresupuestos((data ?? []) as Array<{ id: string; numero: string; estado: string; total: number }>);
      });
  }, [id]);

  const handleDelete = async () => {
    if (!cliente) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("clientes").delete().eq("id", id);
    setDeleting(false);
    if (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
      return;
    }
    router.push("/clientes");
    router.refresh();
  };

  if (loading) return <ClienteDetailSkeleton />;

  if (error || !cliente) {
    return (
      <div className="animate-[fadeIn_0.3s_ease-out]">
        <p className="text-red-600">{error ?? "Cliente no encontrado"}</p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href="/clientes">Volver a clientes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: "Clientes", href: "/clientes" },
          { label: cliente.nombre },
        ]}
        title={cliente.nombre}
        description={undefined}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="secondary" size="icon" className="md:h-9 md:w-auto md:gap-2 md:px-3" asChild>
              <Link href={`/facturas/nueva?cliente=${id}&from=cliente`} aria-label="Nueva factura">
                <FileText className="h-4 w-4" strokeWidth={1.5} />
                <span className="hidden md:inline">Nueva factura</span>
              </Link>
            </Button>
            <Button variant="secondary" size="icon" className="md:h-9 md:w-auto md:gap-2 md:px-3" asChild>
              <Link href={`/clientes/${id}/editar`} aria-label="Editar">
                <Pencil className="h-4 w-4" strokeWidth={1.5} />
                <span className="hidden md:inline">Editar</span>
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="text-red-600 hover:bg-red-50 hover:text-red-700 md:h-9 md:w-auto md:gap-2 md:px-3"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Eliminar"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden md:inline">Eliminar</span>
            </Button>
          </div>
        }
      />
      <div className="mb-6 flex items-center gap-2">
        <Badge variant={cliente.activo ? "activo" : "inactivo"}>
          {cliente.activo ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`¿Eliminar cliente ${cliente.nombre}?`}
        description={
          facturas.length > 0
            ? `Tiene ${facturas.length} factura(s) asociada(s). El cliente se eliminará y las facturas quedarán sin cliente asignado.`
            : "Esta acción no se puede deshacer."
        }
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        onConfirm={handleDelete}
        loading={deleting}
        variant="destructive"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos de contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-neutral-500">Email:</span>{" "}
              {cliente.email ?? "—"}
            </p>
            <p>
              <span className="text-neutral-500">Teléfono:</span>{" "}
              {cliente.telefono ?? "—"}
            </p>
            <p>
              <span className="text-neutral-500">{cliente.tipo_documento ? String(cliente.tipo_documento).toUpperCase() : "Documento fiscal"}:</span>{" "}
              {cliente.documento_fiscal ?? "—"}
            </p>
          </CardContent>
        </Card>
        {cliente.tipo_cliente === "particular" && (
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Empresas asociadas</CardTitle>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/clientes/nuevo?padre=${id}`} className="gap-1.5">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Añadir empresa
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {empresasAsociadas.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin empresas asociadas. Añade una para facturar a nombre de ella.</p>
            ) : (
              <ul className="space-y-2">
                {empresasAsociadas.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/clientes/${e.id}`}
                      className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.5} />
                      {e.nombre}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Dirección</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {[cliente.direccion, cliente.codigo_postal, cliente.localidad].filter(Boolean).join(", ") || "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Presupuestos</CardTitle>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/presupuestos/nuevo?cliente=${id}&from=cliente`} className="gap-1.5">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Nuevo presupuesto
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {presupuestos.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin presupuestos para este cliente.</p>
            ) : (
              <ul className="space-y-2">
                {presupuestos.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/presupuestos/${p.id}`}
                      className="flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
                    >
                      <ClipboardList className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.5} />
                      {p.numero}
                      <span className="text-neutral-500">
                        {Number(p.total ?? 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                      </span>
                    </Link>
                    <div className="ml-6">
                      <Badge variant="default" className="text-xs">
                        {p.estado}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Facturas</CardTitle>
          </CardHeader>
          <CardContent>
            {facturas.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin facturas aún.</p>
            ) : (
              <ul className="space-y-2">
                {facturas.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/facturas/${f.id}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {f.numero}
                    </Link>
                    <Badge variant={f.estado as "borrador" | "emitida" | "pagada"} className="ml-2">
                      {f.estado}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
