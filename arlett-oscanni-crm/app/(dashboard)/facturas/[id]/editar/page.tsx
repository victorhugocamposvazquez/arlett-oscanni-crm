"use client";

import { useParams } from "next/navigation";
import { FacturaWizard } from "@/components/facturas/FacturaWizard";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function EditarFacturaPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Facturas", href: "/facturas" },
          { label: "Factura", href: `/facturas/${id}` },
          { label: "Editar" },
        ]}
        className="mb-4"
      />
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/facturas/${id}`}
          aria-label="Volver a la factura"
          className="flex shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Editar factura
        </h1>
      </div>
      <FacturaWizard facturaId={id} />
    </div>
  );
}
