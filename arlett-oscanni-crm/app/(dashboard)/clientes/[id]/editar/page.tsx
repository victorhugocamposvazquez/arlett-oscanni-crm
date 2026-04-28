"use client";

import { useParams } from "next/navigation";
import { ClienteWizard } from "@/components/clientes/ClienteWizard";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function EditarClientePage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Clientes", href: "/clientes" },
          { label: "Cliente", href: `/clientes/${id}` },
          { label: "Editar" },
        ]}
        className="mb-4"
      />
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/clientes/${id}`}
          aria-label="Volver al cliente"
          className="flex shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Editar cliente
        </h1>
      </div>
      <ClienteWizard clienteId={id} />
    </div>
  );
}
