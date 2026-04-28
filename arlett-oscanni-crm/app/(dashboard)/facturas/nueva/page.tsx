import { FacturaWizard } from "@/components/facturas/FacturaWizard";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NuevaFacturaPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string | string[]; from?: string; rectificativa?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params?.cliente;
  const clienteId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const rectRaw = params?.rectificativa;
  const facturaOriginalId = typeof rectRaw === "string" ? rectRaw : Array.isArray(rectRaw) ? rectRaw[0] : undefined;
  const fromRaw = params?.from;
  const fromCliente = fromRaw === "cliente" || (Array.isArray(fromRaw) && fromRaw[0] === "cliente");
  const backHref = fromCliente && clienteId ? `/clientes/${clienteId}` : facturaOriginalId ? `/facturas/${facturaOriginalId}` : "/facturas";
  const backLabel = fromCliente ? "Volver al cliente" : facturaOriginalId ? "Volver a la factura" : "Volver a facturas";
  const breadcrumb = facturaOriginalId
    ? [{ label: "Facturas", href: "/facturas" }, { label: "Rectificativa" }]
    : fromCliente && clienteId
      ? [{ label: "Clientes", href: "/clientes" }, { label: "Cliente", href: `/clientes/${clienteId}` }, { label: "Nueva factura" }]
      : [{ label: "Facturas", href: "/facturas" }, { label: "Nueva" }];

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
          {facturaOriginalId ? "Nueva factura rectificativa" : "Nueva factura"}
        </h1>
      </div>
      <FacturaWizard initialClienteId={clienteId} facturaOriginalId={facturaOriginalId} />
    </div>
  );
}
