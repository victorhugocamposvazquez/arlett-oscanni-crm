"use client";

import { useParams } from "next/navigation";
import { PresupuestoWizard } from "@/components/presupuestos/PresupuestoWizard";
import { PageHeader } from "@/components/layout/PageHeader";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function EditarPresupuestoPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: "Presupuestos", href: "/presupuestos" },
          { label: "Presupuesto", href: `/presupuestos/${id}` },
          { label: "Editar" },
        ]}
        title="Editar presupuesto"
        description="Modifica los datos del presupuesto"
      />
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/presupuestos/${id}`}
          aria-label="Volver al presupuesto"
          className="flex shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
        </Link>
      </div>
      <PresupuestoWizard presupuestoId={id} />
    </div>
  );
}
