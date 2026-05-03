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

    const isCoarseMobile =
      typeof navigator !== "undefined" &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 0 && typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches));

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
          <td class="inv-col-desc" style="padding:8px 6px;border-bottom:1px solid #e5e5e5;vertical-align:top;">${htmlEsc(l.descripcion)}</td>
          <td class="inv-col-num" style="padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap;">${Number(l.cantidad).toFixed(2)}</td>
          <td class="inv-col-num" style="padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap;">${formatCurrency(base)}</td>
          <td class="inv-col-num" style="padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap;">${formatCurrency(ivaLinea)}</td>
          <td class="inv-col-num" style="padding:8px 6px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap;">${formatCurrency(totalLinea)}</td>
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
      setPrintingPdf(false);
      return;
    }

    const empresaEmailLine = emisor.email
      ? `<p style="margin:4px 0 0 0; font-weight:600;">${htmlEsc(emisor.email)}</p>`
      : "";
    const empresaTelLine = emisor.telefono
      ? `<p style="margin:4px 0 0 0; font-weight:600;">Tel. ${htmlEsc(emisor.telefono)}</p>`
      : "";

    const facturaBodyInner = `
          <div class="invoice-root">
            <table class="invoice-header-table" style="width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed;">
              <tr>
                <td style="vertical-align:top;width:52%;padding-right:10px;">
                  <img data-invoice-logo src=${JSON.stringify(logoUrl)} alt="" style="height:44px;width:auto;max-width:200px;object-fit:contain;display:block;" />
                </td>
                <td style="vertical-align:top;width:48%;text-align:right;padding-left:8px;">
                  <p style="margin:0;font-size:13px;font-weight:700;line-height:1.35;word-break:break-word;">${esRectificativa ? "FACTURA RECTIFICATIVA" : "FACTURA"}<br/><span style="font-size:12px;font-weight:600;">N.º ${htmlEsc(factura.numero)}</span></p>
                  <p style="margin:6px 0 0 0;font-size:11px;color:#444;">${htmlEsc(fechaFormateada)}</p>
                </td>
              </tr>
            </table>

            ${esRectificativa && (facturaOriginal || factura.causa_rectificacion) ? `
            <div class="invoice-rect" style="margin-bottom:16px;padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;page-break-inside:avoid;">
              <p style="margin:0 0 4px 0;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.04em;">Documento rectificativo</p>
              ${facturaOriginal ? `<p style="margin:0;font-size:11px;color:#78350f;line-height:1.45;">Rectifica la factura n.º <strong>${htmlEsc(facturaOriginal.numero)}</strong>${fechaOriginalFormateada ? `, de fecha <strong>${htmlEsc(fechaOriginalFormateada)}</strong>` : ""}.</p>` : ""}
              ${factura.causa_rectificacion ? `<p style="margin:8px 0 0 0;font-size:11px;color:#78350f;line-height:1.45;"><strong>Causa:</strong> ${htmlEsc(factura.causa_rectificacion)}</p>` : ""}
            </div>
            ` : ""}

            <table class="invoice-parties" style="width:100%;border-collapse:collapse;margin-bottom:18px;table-layout:fixed;">
              <tr>
                <td style="vertical-align:top;width:50%;padding:0 12px 0 0;border-right:1px solid #eee;">
                  <p class="invoice-label" style="margin:0 0 6px 0;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#555;">Datos empresa</p>
                  <div style="font-size:11px;line-height:1.5;word-break:break-word;">
                    <p style="margin:0;font-weight:600;">${htmlEsc(emisor.razon_social)}</p>
                    <p style="margin:2px 0 0 0;font-weight:600;">${htmlEsc(emisor.direccion)}</p>
                    <p style="margin:2px 0 0 0;font-weight:600;">${htmlEsc(emisor.codigo_postal)} ${htmlEsc(emisor.localidad)} (${htmlEsc(emisor.provincia)})</p>
                    <p style="margin:2px 0 0 0;font-weight:600;">${htmlEsc(emisor.nif)}</p>
                    ${empresaEmailLine.replace("margin:4px", "margin:2px")}
                    ${empresaTelLine.replace("margin:4px", "margin:2px")}
                  </div>
                </td>
                <td style="vertical-align:top;width:50%;padding:0 0 0 12px;text-align:right;">
                  <p class="invoice-label" style="margin:0 0 6px 0;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#555;">Datos cliente</p>
                  <div style="font-size:11px;line-height:1.5;word-break:break-word;text-align:right;">
                    <p style="margin:0;font-weight:600;">${clienteNombre}</p>
                    <p style="margin:2px 0 0 0;font-weight:600;">${clienteDireccion}</p>
                    <p style="margin:2px 0 0 0;font-weight:600;">${docLabel}: ${clienteDoc}</p>
                    <p style="margin:2px 0 0 0;font-weight:600;">${clienteEmail}</p>
                    ${clienteTelefono ? `<p style="margin:2px 0 0 0;font-weight:600;">${clienteTelefono}</p>` : ""}
                  </div>
                </td>
              </tr>
            </table>

            <table class="invoice-lines" style="width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed;font-size:10px;">
              <colgroup>
                <col style="width:36%" />
                <col style="width:13%" />
                <col style="width:17%" />
                <col style="width:17%" />
                <col style="width:17%" />
              </colgroup>
              <thead>
                <tr>
                  <th style="padding:8px 6px;border-bottom:2px solid #bbb;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#333;background:#f6f6f6;">Concepto</th>
                  <th style="padding:8px 6px;border-bottom:2px solid #bbb;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#333;background:#f6f6f6;">Cant.</th>
                  <th style="padding:8px 6px;border-bottom:2px solid #bbb;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#333;background:#f6f6f6;">Base</th>
                  <th style="padding:8px 6px;border-bottom:2px solid #bbb;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#333;background:#f6f6f6;">IVA</th>
                  <th style="padding:8px 6px;border-bottom:2px solid #bbb;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#333;background:#f6f6f6;">Total</th>
                </tr>
              </thead>
              <tbody>${lineasHtml}</tbody>
            </table>

            <div class="invoice-totals-wrap" style="width:100%;page-break-inside:avoid;">
              <table class="invoice-totals" style="width:100%;max-width:260px;margin-left:auto;border-collapse:collapse;font-size:11px;">
                <tr>
                  <td style="padding:5px 8px 5px 0;color:#444;">Base imponible</td>
                  <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${formatCurrency(baseImponible)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 8px 5px 0;color:#444;">IVA</td>
                  <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${formatCurrency(ivaImporte)}</td>
                </tr>
                ${porcentajeDescuento > 0 ? `<tr>
                  <td style="padding:5px 8px 5px 0;color:#444;">Descuento (${porcentajeDescuento}%)</td>
                  <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">− ${formatCurrency(descuentoImporte)}</td>
                </tr>` : ""}
                ${irpfPorcentaje > 0 ? `<tr>
                  <td style="padding:5px 8px 5px 0;color:#444;">Retención (${irpfPorcentaje}%)</td>
                  <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">− ${formatCurrency(irpfImporte)}</td>
                </tr>` : ""}
                <tr>
                  <td colspan="2" style="padding:0;height:8px;"></td>
                </tr>
                <tr>
                  <td style="padding:10px 8px 0 0;border-top:2px solid #333;font-size:13px;font-weight:800;">Total</td>
                  <td style="padding:10px 0 0 0;border-top:2px solid #333;text-align:right;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;">${formatCurrency(totalConIva)}</td>
                </tr>
              </table>
            </div>

            <div class="invoice-footer" style="margin-top:22px;padding-top:14px;border-top:1px solid #ddd;page-break-inside:avoid;">
              <p style="margin:0;font-size:10px;color:#333;line-height:1.5;">
                El pago se realizará mediante <strong>transferencia bancaria</strong>. ${pagoBancoLines}
              </p>
              <p style="margin:8px 0 0 0;font-size:9px;color:#666;line-height:1.45;">
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
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; overflow: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        color: #1a1a1a;
        font-size: 12px;
        line-height: 1.45;
        padding: 12px 14px 28px;
        max-width: 190mm;
        margin: 0 auto;
      }
      img[data-invoice-logo] { height: 44px; width: auto; max-width: 200px; object-fit: contain; display: block; }
      .invoice-root { width: 100%; min-height: 0; overflow: visible; }
      .invoice-lines thead { display: table-header-group; }
      .invoice-lines tbody tr { page-break-inside: avoid; break-inside: avoid; }
      .inv-col-desc { word-break: break-word; overflow-wrap: anywhere; hyphens: auto; }
      @page { size: A4 portrait; margin: 10mm; }
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
      minHeight: "400px",
      height: "auto",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1",
      border: "0",
      overflow: "hidden",
    });
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    if (!idoc) {
      document.body.removeChild(iframe);
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
      setPrintingPdf(false);
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
      const docEl = idoc.documentElement;
      const scrollH = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        docEl.scrollHeight,
        docEl.clientHeight,
        1123
      );
      iframe.style.height = `${scrollH + 96}px`;
      iframe.style.minHeight = `${scrollH + 96}px`;

      void import("html2pdf.js")
        .then((mod) => {
          const html2pdf = mod.default;
          return html2pdf()
            .set({
              margin: [10, 10, 10, 10],
              filename: safeFilename,
              image: { type: "jpeg", quality: 0.94 },
              pagebreak: { mode: ["css", "legacy"] },
              html2canvas: {
                scale: isCoarseMobile ? 1.35 : 1.85,
                useCORS: true,
                logging: false,
                letterRendering: true,
                scrollX: 0,
                scrollY: 0,
                windowWidth: 794,
                windowHeight: Math.min(scrollH + 120, 16_000),
              },
              jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
            })
            .from(body)
            .outputPdf("blob")
            .then(async (blob: Blob) => {
              if (isCoarseMobile) {
                const file = new File([blob], safeFilename, { type: "application/pdf" });
                try {
                  const canShare =
                    typeof navigator !== "undefined" &&
                    typeof navigator.share === "function" &&
                    typeof navigator.canShare === "function" &&
                    navigator.canShare({ files: [file] });
                  if (canShare) {
                    await navigator.share({
                      files: [file],
                      title: `Factura ${factura.numero}`,
                    });
                    toast.success("Elige «Guardar en Archivos» o la app deseada.");
                    return;
                  }
                } catch (shareErr: unknown) {
                  const name = shareErr instanceof Error ? shareErr.name : "";
                  if (name === "AbortError") return;
                }

                const url = URL.createObjectURL(blob);
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (w) {
                  toast.success("Se abrió el PDF: usa Compartir o Guardar desde el visor.");
                } else {
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = safeFilename;
                  a.target = "_blank";
                  a.rel = "noopener";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  toast.info("Si no ves el PDF, permite ventanas emergentes o revisa la carpeta de descargas.");
                }
                globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
                return;
              }

              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = safeFilename;
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success("PDF descargado");
            });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Error al generar el PDF";
          toast.error(msg);
        })
        .finally(() => {
          setPrintingPdf(false);
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al preparar el PDF";
      toast.error(msg);
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
