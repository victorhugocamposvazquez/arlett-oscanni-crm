"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchEmisorFacturacion, resolveInvoiceLogoUrl } from "@/lib/empresa-facturacion";
import { toast } from "sonner";
import { FacturaDetailSkeleton } from "@/components/facturas/FacturaDetailSkeleton";
import { PagosCard } from "@/components/facturas/PagosCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Pencil, FileDown, Trash2, FileEdit } from "lucide-react";

interface FacturaRow {
  id: string;
  numero: string;
  estado: string;
  concepto: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  irpf_porcentaje?: number | null;
  irpf_importe?: number | null;
  porcentaje_descuento?: number | null;
  importe_descuento?: number | null;
  cliente_id: string | null;
  tipo_factura?: "ordinaria" | "rectificativa";
  factura_original_id?: string | null;
  causa_rectificacion?: string | null;
  clientes: {
    id: string;
    nombre: string;
    documento_fiscal: string | null;
    tipo_cliente: "particular" | "empresa";
    tipo_documento: "dni" | "nie" | "cif" | "vat" | null;
    direccion: string | null;
    codigo_postal?: string | null;
    localidad?: string | null;
    email: string | null;
    telefono?: string | null;
  } | null;
}

interface LineaRow {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_porcentaje?: number | null;
}

export default function DetalleFacturaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [factura, setFactura] = useState<FacturaRow | null>(null);
  const [facturaOriginal, setFacturaOriginal] = useState<{ id: string; numero: string; fecha_emision: string | null } | null>(null);
  const [rectificativas, setRectificativas] = useState<Array<{ id: string; numero: string }>>([]);
  const [lineas, setLineas] = useState<LineaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);

  const formatCurrency = (value: number) =>
    value.toLocaleString("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("facturas")
      .select(
        "id, numero, estado, concepto, fecha_emision, fecha_vencimiento, irpf_porcentaje, irpf_importe, porcentaje_descuento, importe_descuento, cliente_id, tipo_factura, factura_original_id, causa_rectificacion, clientes(id, nombre, documento_fiscal, tipo_cliente, tipo_documento, direccion, codigo_postal, localidad, email, telefono)"
      )
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setFactura(null);
        } else {
          const raw = data as {
            id: string;
            numero: string;
            estado: string;
            concepto: string | null;
            fecha_emision: string | null;
            fecha_vencimiento: string | null;
            irpf_porcentaje?: number | null;
            irpf_importe?: number | null;
            porcentaje_descuento?: number | null;
            importe_descuento?: number | null;
            cliente_id: string | null;
            clientes:
              | {
                  id: string;
                  nombre: string;
                  documento_fiscal: string | null;
                  tipo_cliente: "particular" | "empresa";
                  tipo_documento: "dni" | "nie" | "cif" | "vat" | null;
                  direccion: string | null;
                  codigo_postal: string | null;
                  localidad: string | null;
                  email: string | null;
                  telefono?: string | null;
                }
              | {
                  id: string;
                  nombre: string;
                  documento_fiscal: string | null;
                  tipo_cliente: "particular" | "empresa";
                  tipo_documento: "dni" | "nie" | "cif" | "vat" | null;
                  direccion: string | null;
                  codigo_postal: string | null;
                  localidad: string | null;
                  email: string | null;
                  telefono?: string | null;
                }[]
              | null;
          };

          const cliente = Array.isArray(raw.clientes)
            ? (raw.clientes[0] ?? null)
            : raw.clientes;

          setFactura({
            ...raw,
            clientes: cliente,
          });
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("factura_lineas")
      .select("id, descripcion, cantidad, precio_unitario, iva_porcentaje")
      .eq("factura_id", id)
      .order("orden")
      .then(({ data }) => setLineas(data ?? []));
  }, [id]);

  useEffect(() => {
    if (!factura?.factura_original_id) return;
    const supabase = createClient();
    supabase
      .from("facturas")
      .select("id, numero, fecha_emision")
      .eq("id", factura.factura_original_id)
      .single()
      .then(({ data }) => setFacturaOriginal(data as { id: string; numero: string; fecha_emision: string | null } | null));
  }, [factura?.factura_original_id]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("facturas")
      .select("id, numero")
      .eq("factura_original_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRectificativas((data ?? []) as Array<{ id: string; numero: string }>));
  }, [id]);

  const baseImponible = lineas.reduce(
    (acc, l) => acc + Number(l.cantidad) * Number(l.precio_unitario),
    0
  );
  const ivaImporte = lineas.reduce(
    (acc, l) =>
      acc +
      Number(l.cantidad) *
        Number(l.precio_unitario) *
        ((Number(l.iva_porcentaje ?? 21) || 0) / 100),
    0
  );
  const irpfPorcentaje = Number(factura?.irpf_porcentaje ?? 0);
  const irpfImporte = (baseImponible * irpfPorcentaje) / 100;
  const porcentajeDescuento = Number(factura?.porcentaje_descuento ?? 0);
  const descuentoImporte = baseImponible * (porcentajeDescuento / 100);
  const totalConIva = baseImponible + ivaImporte - descuentoImporte - irpfImporte;

  const handleDelete = async () => {
    if (!factura) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("facturas").delete().eq("id", id);
    setDeleting(false);
    if (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
      return;
    }
    router.push("/facturas");
    router.refresh();
  };

  const htmlEsc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const handleDownloadPdf = async () => {
    if (!factura) return;
    setPrintingPdf(true);
    try {
    const supabase = createClient();
    const emisor = await fetchEmisorFacturacion(supabase);

    const clienteNombre = htmlEsc(factura.clientes?.nombre ?? "Cliente");
    const clienteDoc = htmlEsc(factura.clientes?.documento_fiscal ?? "-");
    const docLabel = htmlEsc(
      factura.clientes?.tipo_documento
        ? String(factura.clientes.tipo_documento).toUpperCase()
        : (factura.clientes?.tipo_cliente === "empresa" ? "NIF" : "DNI")
    );
    const dirParts = [
      factura.clientes?.direccion,
      factura.clientes?.codigo_postal,
      factura.clientes?.localidad,
    ].filter(Boolean);
    const clienteDireccion = htmlEsc(dirParts.length > 0 ? dirParts.join(", ") : "-");
    const clienteEmail = htmlEsc(factura.clientes?.email ?? "-");
    const clienteTelefono = factura.clientes?.telefono ? htmlEsc(factura.clientes.telefono) : "";

    const lineasHtml = lineas
      .map((l, i) => {
        const base = Number(l.cantidad) * Number(l.precio_unitario);
        const ivaPct = Number(l.iva_porcentaje ?? 21) || 0;
        const ivaLinea = base * (ivaPct / 100);
        const totalLinea = base + ivaLinea;
        const bg = i % 2 === 1 ? "background:#f5f5f5;" : "";
        return `
        <tr style="${bg}">
          <td style="padding:12px 10px;border-bottom:1px solid #e5e5e5;">${htmlEsc(l.descripcion)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e5e5;text-align:right;">${Number(l.cantidad).toFixed(2)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e5e5;text-align:right;">${formatCurrency(base)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e5e5;text-align:right;">${formatCurrency(ivaLinea)}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e5e5e5;text-align:right;">${formatCurrency(totalLinea)}</td>
        </tr>
      `;
      })
      .join("");

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const logoUrl = resolveInvoiceLogoUrl(emisor.logo_url, origin);
    const fechaFormateada = factura.fecha_emision
      ? new Date(factura.fecha_emision + "T12:00:00").toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";
    const esRectificativa = factura.tipo_factura === "rectificativa";
    const fechaOriginalFormateada = facturaOriginal?.fecha_emision
      ? new Date(facturaOriginal.fecha_emision + "T12:00:00").toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "";

    const pagoBancoLines = (() => {
      const parts: string[] = [];
      if (emisor.iban) {
        parts.push(`IBAN: <strong>${htmlEsc(emisor.iban)}</strong>`);
      }
      if (emisor.numero_cuenta_bancaria) {
        parts.push(`N.º de cuenta: <strong>${htmlEsc(emisor.numero_cuenta_bancaria)}</strong>`);
      }
      if (parts.length === 0) {
        toast.error("Falta IBAN o número de cuenta en ajustes de empresa. Configúralo en Ajustes → Datos de empresa.");
        return null;
      }
      return parts.join(" · ");
    })();

    if (pagoBancoLines === null) {
      return;
    }

    const empresaEmailLine = emisor.email
      ? `<p style="margin:4px 0 0 0; font-weight:600;">${htmlEsc(emisor.email)}</p>`
      : "";
    const empresaTelLine = emisor.telefono
      ? `<p style="margin:4px 0 0 0; font-weight:600;">Tel. ${htmlEsc(emisor.telefono)}</p>`
      : "";

    const facturaBodyInner = `
          <div style="max-width:100%; padding:0 4px;">
            <table style="width:100%; margin-bottom:24px; border-collapse:collapse;">
              <tr>
                <td style="vertical-align:top; width:50%;">
                  <img data-invoice-logo src=${JSON.stringify(logoUrl)} alt="" style="height:48px; width:auto; max-width:220px; object-fit:contain;" />
                </td>
                <td style="vertical-align:top; width:50%; text-align:right;">
                  <p style="margin:0; font-size:14px; font-weight:600;">${esRectificativa ? "FACTURA RECTIFICATIVA Nº" : "FACTURA Nº"}: ${htmlEsc(factura.numero)}</p>
                  <p style="margin:4px 0 0 0; font-size:13px; color:#444;">${htmlEsc(fechaFormateada)}</p>
                </td>
              </tr>
            </table>

            ${esRectificativa && (facturaOriginal || factura.causa_rectificacion) ? `
            <div style="margin-bottom:24px; padding:12px 16px; background:#fef3c7; border:1px solid #fcd34d; border-radius:8px;">
              <p style="margin:0 0 6px 0; font-size:12px; font-weight:700; color:#92400e;">DOCUMENTO RECTIFICATIVO</p>
              ${facturaOriginal ? `<p style="margin:0; font-size:12px; color:#78350f;">Rectifica la factura nº ${htmlEsc(facturaOriginal.numero)}${fechaOriginalFormateada ? `, de fecha ${htmlEsc(fechaOriginalFormateada)}` : ""}.</p>` : ""}
              ${factura.causa_rectificacion ? `<p style="margin:6px 0 0 0; font-size:12px; color:#78350f;"><strong>Causa:</strong> ${htmlEsc(factura.causa_rectificacion)}</p>` : ""}
            </div>
            ` : ""}

            <table style="width:100%; margin-bottom:24px; border-collapse:collapse;">
              <tr>
                <td style="vertical-align:top; width:50%; padding-right:20px;">
                  <p style="margin:0 0 8px 0; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#333;">Datos empresa</p>
                  <p style="margin:0; font-weight:600;">${htmlEsc(emisor.razon_social)}</p>
                  <p style="margin:0; font-weight:600;">${htmlEsc(emisor.direccion)}</p>
                  <p style="margin:0; font-weight:600;">${htmlEsc(emisor.codigo_postal)} ${htmlEsc(emisor.localidad)} (${htmlEsc(emisor.provincia)})</p>
                  <p style="margin:0; font-weight:600;">${htmlEsc(emisor.nif)}</p>
                  ${empresaEmailLine}
                  ${empresaTelLine}
                </td>
                <td style="vertical-align:top; width:50%; text-align:right;">
                  <p style="margin:0 0 8px 0; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#333;">Datos cliente</p>
                  <p style="margin:0; font-weight:600;">${clienteNombre}</p>
                  <p style="margin:0; font-weight:600;">${clienteDireccion}</p>
                  <p style="margin:0; font-weight:600;">${docLabel}: ${clienteDoc}</p>
                  <p style="margin:0; font-weight:600;">${clienteEmail}</p>
                  ${clienteTelefono ? `<p style="margin:0; font-weight:600;">${clienteTelefono}</p>` : ""}
                </td>
              </tr>
            </table>

            <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
              <thead>
                <tr>
                  <th style="padding:10px 8px; border-bottom:1px solid #ccc; text-align:left; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#444;">Descripción / Producto</th>
                  <th style="padding:10px 8px; border-bottom:1px solid #ccc; text-align:right; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#444;">Cantidad</th>
                  <th style="padding:10px 8px; border-bottom:1px solid #ccc; text-align:right; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#444;">Base</th>
                  <th style="padding:10px 8px; border-bottom:1px solid #ccc; text-align:right; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#444;">IVA</th>
                  <th style="padding:10px 8px; border-bottom:1px solid #ccc; text-align:right; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; color:#444;">Total</th>
                </tr>
              </thead>
              <tbody>${lineasHtml}</tbody>
            </table>

            <div style="margin-left:auto; width:260px; font-size:14px;">
              <p style="display:flex; justify-content:space-between; margin:6px 0;"><span>Base Imponible</span><span>${formatCurrency(baseImponible)}</span></p>
              <p style="display:flex; justify-content:space-between; margin:6px 0;"><span>IVA</span><span>${formatCurrency(ivaImporte)}</span></p>
              ${porcentajeDescuento > 0 ? `<p style="display:flex; justify-content:space-between; margin:6px 0;"><span>Descuento (${porcentajeDescuento}%)</span><span>- ${formatCurrency(descuentoImporte)}</span></p>` : ""}
              ${irpfPorcentaje > 0 ? `<p style="display:flex; justify-content:space-between; margin:6px 0;"><span>Retención (${irpfPorcentaje}%)</span><span>- ${formatCurrency(irpfImporte)}</span></p>` : ""}
              <p style="display:flex; justify-content:space-between; margin:12px 0 0 0; padding-top:10px; border-top:1px solid #ccc; font-weight:700; font-size:16px;">
                <span>Total</span><span>${formatCurrency(totalConIva)}</span>
              </p>
            </div>

            <div style="margin-top:48px; padding-top:20px; border-top:1px solid #ddd;">
              <p style="margin:0; font-size:12px; color:#444; font-weight:500;">
                El pago se realizará mediante <strong>transferencia bancaria</strong>. ${pagoBancoLines}
              </p>
              <p style="margin:10px 0 0 0; font-size:11px; color:#666;">
                Documento emitido conforme al Reglamento por el que se regulan las obligaciones de facturación (Real Decreto 1619/2012).
              </p>
            </div>
          </div>
    `;

    const facturaDocumentHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${htmlEsc(factura.numero)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#222; font-size:14px; line-height:1.5; margin:0; padding:8px; max-width:100%; box-sizing:border-box; }
      img[data-invoice-logo] { height:48px; width:auto; max-width:220px; object-fit:contain; }
    </style>
  </head>
  <body>
    ${facturaBodyInner}
  </body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "PDF factura");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "794px",
      minHeight: "1123px",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1",
      border: "0",
    });
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    if (!idoc) {
      document.body.removeChild(iframe);
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
      return;
    }
    idoc.open();
    idoc.write(facturaDocumentHtml);
    idoc.close();

    // Mismo identificador que la factura; caracteres reservados del sistema → guiones (p. ej. 1/2026 → 1-2026)
    const safeBase = factura.numero.replace(/[\\/:*?"<>|]+/g, "-");
    const safeFilename = `Factura-${safeBase}.pdf`;

    const generateFile = () => {
      const body = idoc.body;
      void import("html2pdf.js")
        .then((mod) => {
          const html2pdf = mod.default;
          return html2pdf()
            .set({
              margin: [8, 8, 8, 8],
              filename: safeFilename,
              image: { type: "jpeg", quality: 0.92 },
              html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
              jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            })
            .from(body)
            .save()
            .then(() => {
              toast.success("PDF descargado");
            });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Error al generar el PDF";
          toast.error(msg);
        })
        .finally(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        });
    };

    const logoInFrame = idoc.querySelector("img[data-invoice-logo]") as HTMLImageElement | null;
    if (logoInFrame) {
      if (logoInFrame.complete && logoInFrame.naturalHeight > 0) {
        setTimeout(generateFile, 100);
      } else {
        logoInFrame.addEventListener("load", () => setTimeout(generateFile, 100), { once: true });
        logoInFrame.addEventListener("error", () => setTimeout(generateFile, 100), { once: true });
      }
    } else {
      setTimeout(generateFile, 100);
    }
    } finally {
      setPrintingPdf(false);
    }
  };

  if (loading) return <FacturaDetailSkeleton />;

  if (error || !factura) {
    return (
      <div className="animate-[fadeIn_0.3s_ease-out]">
        <p className="text-red-600">{error ?? "Factura no encontrada"}</p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href="/facturas">Volver a facturas</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: "Facturas", href: "/facturas" },
          { label: factura.numero },
        ]}
        title={factura.numero}
        description={undefined}
        actions={
          <div className="flex shrink-0 items-center gap-1">
          {(factura.tipo_factura !== "rectificativa") && (factura.estado === "emitida" || factura.estado === "pagada") && (
            <Button variant="secondary" size="icon" className="md:h-9 md:w-auto md:gap-2 md:px-3" asChild>
              <Link href={`/facturas/nueva?rectificativa=${id}`} aria-label="Emitir rectificativa">
                <FileEdit className="h-4 w-4" strokeWidth={1.5} />
                <span className="hidden md:inline">Rectificativa</span>
              </Link>
            </Button>
          )}
          <Button variant="secondary" size="icon" className="md:h-9 md:w-auto md:gap-2 md:px-3" asChild>
            <Link href={`/facturas/${id}/editar`} aria-label="Editar">
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden md:inline">Editar</span>
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="md:h-9 md:w-auto md:gap-2 md:px-3"
            onClick={() => void handleDownloadPdf()}
            disabled={printingPdf}
            aria-label="Descargar PDF"
          >
            <FileDown className="h-4 w-4" strokeWidth={1.5} />
            <span className="hidden md:inline">{printingPdf ? "Preparando…" : "Descargar PDF"}</span>
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
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={factura.estado as "borrador" | "emitida" | "pagada"}>
          {factura.estado.charAt(0).toUpperCase() + factura.estado.slice(1)}
        </Badge>
        {factura.tipo_factura === "rectificativa" && (
          <Badge variant="borrador" className="bg-amber-100 text-amber-800 border-amber-300">
            Rectificativa
          </Badge>
        )}
      </div>

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`¿Eliminar factura ${factura.numero}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        onConfirm={handleDelete}
        loading={deleting}
        variant="destructive"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {(factura.tipo_factura === "rectificativa" && facturaOriginal) || factura.causa_rectificacion ? (
          <Card>
            <CardHeader>
              <CardTitle>Rectificativa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {facturaOriginal && (
                <p>
                  <span className="text-neutral-500">Rectifica factura:</span>{" "}
                  <Link href={`/facturas/${factura.factura_original_id}`} className="font-medium hover:underline">
                    {facturaOriginal.numero}
                  </Link>
                </p>
              )}
              {factura.causa_rectificacion && (
                <p>
                  <span className="text-neutral-500">Causa:</span>{" "}
                  {factura.causa_rectificacion}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
        {rectificativas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Rectificativas</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {rectificativas.map((r) => (
                  <li key={r.id}>
                    <Link href={`/facturas/${r.id}`} className="font-medium hover:underline">
                      {r.numero}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Cliente y fechas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-neutral-500">Cliente:</span>{" "}
              {factura.clientes ? (
                <Link href={`/clientes/${factura.clientes.id}`} className="font-medium hover:underline">
                  {factura.clientes.nombre}
                </Link>
              ) : (
                "—"
              )}
            </p>
            <p>
              <span className="text-neutral-500">Emisión:</span>{" "}
              {factura.fecha_emision ?? "—"}
            </p>
            <p>
              <span className="text-neutral-500">Vencimiento:</span>{" "}
              {factura.fecha_vencimiento ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalConIva.toFixed(2)} €</p>
            <p className="mt-2 text-sm text-neutral-500">
              Base: {baseImponible.toFixed(2)} € · IVA: {ivaImporte.toFixed(2)} € · IRPF: -{irpfImporte.toFixed(2)} €
            </p>
          </CardContent>
        </Card>
        <PagosCard
          facturaId={id}
          totalFactura={totalConIva}
          estado={factura.estado}
          onPagoAdded={() => {
            setFactura((prev) => (prev ? { ...prev, estado: "pagada" } : prev));
          }}
        />
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Líneas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {lineas.map((l) => (
                <li
                  key={l.id}
                  className="flex justify-between border-b border-border pb-2 last:border-0"
                >
                  <span>{l.descripcion}</span>
                  <span>
                    IVA {Number(l.iva_porcentaje ?? 21).toFixed(0)}% ·{" "}
                    {Number(l.cantidad)} × {Number(l.precio_unitario)} € ={" "}
                    {(Number(l.cantidad) * Number(l.precio_unitario)).toFixed(2)} €
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
