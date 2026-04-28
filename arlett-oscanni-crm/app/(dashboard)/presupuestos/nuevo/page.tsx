import { PresupuestoWizard } from "@/components/presupuestos/PresupuestoWizard";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NuevoPresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string | string[]; from?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params?.cliente;
  const clienteId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const fromRaw = params?.from;
  const fromCliente = fromRaw === "cliente" || (Array.isArray(fromRaw) && fromRaw[0] === "cliente");
  const backHref = fromCliente && clienteId ? `/clientes/${clienteId}` : "/presupuestos";
  const backLabel = fromCliente ? "Volver al cliente" : "Volver a presupuestos";
  const breadcrumb =
    fromCliente && clienteId
      ? [{ label: "Clientes", href: "/clientes" }, { label: "Cliente", href: `/clientes/${clienteId}` }, { label: "Nuevo presupuesto" }]
      : [{ label: "Presupuestos", href: "/presupuestos" }, { label: "Nuevo" }];

  return (
    <div>
      <Breadcrumb items={breadcrumb} className="mb-4" />
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Nuevo presupuesto
        </h1>
      </div>
      <PresupuestoWizard initialClienteId={clienteId} />
    </div>
  );
}
