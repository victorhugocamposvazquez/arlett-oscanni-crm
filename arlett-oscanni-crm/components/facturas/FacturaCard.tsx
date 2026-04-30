"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { MoreVertical, Eye, Pencil, Trash2 } from "lucide-react";

type EstadoFactura = "borrador" | "emitida" | "pagada";

interface FacturaCardProps {
  id: string;
  numero: string;
  clienteNombre: string;
  importe: string;
  estado: EstadoFactura;
  tipoFactura?: "ordinaria" | "rectificativa";
  onDeleted?: () => void;
  /** Muestra checkbox a la izquierda para borrado en masa */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
}

const estadoVariant: Record<EstadoFactura, "borrador" | "emitida" | "pagada"> = {
  borrador: "borrador",
  emitida: "emitida",
  pagada: "pagada",
};

export function FacturaCard({
  id,
  numero,
  clienteNombre,
  importe,
  estado,
  tipoFactura,
  onDeleted,
  selectionMode = false,
  selected = false,
  onToggleSelected,
}: FacturaCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const closeActions = () => setActionsOpen(false);

  useEffect(() => {
    if (!actionsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActions();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsOpen]);

  const handleViewDetail = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeActions();
    router.push(`/facturas/${id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeActions();
    router.push(`/facturas/${id}/editar`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeActions();
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.from("facturas").delete().eq("id", id);
    setDeleting(false);
    setShowDeleteConfirm(false);
    if (!error) {
      onDeleted?.();
      router.refresh();
    }
  };

  const cardRect = actionsOpen && cardRef.current ? cardRef.current.getBoundingClientRect() : null;

  return (
    <>
      <Card ref={cardRef} className={cn("relative overflow-hidden bg-white/95 py-0", actionsOpen && "z-[200]")}>
        <div className="relative flex flex-col gap-3 py-4 pl-1 pr-11 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-4">
          <div className="flex min-w-0 items-start gap-2 sm:flex-1 sm:items-center">
            {selectionMode && (
              <div
                className="flex shrink-0 pl-1 pr-1"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelected?.(id)}
                  className="h-4 w-4 cursor-pointer rounded border-border text-accent"
                  aria-label={`Seleccionar factura ${numero}`}
                />
              </div>
            )}
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                if (actionsOpen) {
                  e.preventDefault();
                  closeActions();
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && actionsOpen) {
                  e.preventDefault();
                  closeActions();
                }
              }}
              className="min-w-0 flex-1 cursor-pointer overflow-hidden"
            >
              <Link
                href={`/facturas/${id}`}
                onClick={(e) => actionsOpen && e.preventDefault()}
                className="block"
              >
                <p className="break-words font-semibold leading-snug text-foreground">{numero}</p>
                <p className="truncate text-sm text-neutral-500">{clienteNombre}</p>
              </Link>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0 sm:flex-nowrap">
            <p className="text-lg font-semibold tabular-nums tracking-tight">{importe}</p>
            <div className="flex flex-wrap items-center gap-2">
              {tipoFactura === "rectificativa" && (
                <Badge variant="borrador" className="border-amber-300 bg-amber-100 text-[10px] text-amber-800">
                  Rectificativa
                </Badge>
              )}
              <Badge variant={estadoVariant[estado]}>
                {estado.charAt(0).toUpperCase() + estado.slice(1)}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActionsOpen((v) => !v);
            }}
            className="absolute right-1 top-4 flex shrink-0 items-center justify-center rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-foreground sm:relative sm:right-auto sm:top-auto sm:translate-y-0"
            aria-label="Abrir acciones"
            aria-expanded={actionsOpen}
          >
            <MoreVertical className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {actionsOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-[9998] bg-black/[0.04]"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeActions();
                }}
                aria-hidden
              />
              {cardRect && (
                <div
                  className="fixed z-[9999] flex flex-row items-center gap-0.5 rounded-l-lg border-l border-y border-border bg-white px-1.5 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                  style={{
                    top: cardRect.top + 4,
                    right: window.innerWidth - cardRect.right + 4,
                    height: cardRect.height - 8,
                    animation: "slideInFromRight 0.2s ease-out",
                  }}
                  role="dialog"
                  aria-label="Acciones"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={handleViewDetail}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-600 transition-colors hover:bg-blue-50"
                    aria-label="Ver detalle"
                  >
                    <Eye className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-700 transition-colors hover:bg-amber-50"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-600 transition-colors hover:bg-red-50"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              )}
            </>,
            document.body
          )}
      </Card>

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`¿Eliminar factura ${numero}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        onConfirm={handleDeleteConfirm}
        loading={deleting}
        variant="destructive"
      />
    </>
  );
}
