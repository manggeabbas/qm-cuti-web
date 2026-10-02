/** Export laporan: XLSX, CSV, PDF. */
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import type { ReportTable } from "./builders";

export function toXlsxBuffer(t: ReportTable): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([t.columns, ...t.rows]);
  ws["!cols"] = t.columns.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.title.slice(0, 31));
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function toCsvString(t: ReportTable): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns, ...t.rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function toPdfBuffer(t: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text(t.title, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor("#666").text(`Dicetak: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, { align: "center" });
    doc.moveDown();

    // Tabel sederhana: lebar kolom proporsional
    const maxCols = Math.min(t.columns.length, 8);
    const cols = t.columns.slice(0, maxCols);
    const pageW = doc.page.width - 72;
    const colW = pageW / maxCols;
    const rowH = 16;
    let y = doc.y;

    const drawRow = (cells: (string | number)[], bold: boolean, fill?: string) => {
      if (y + rowH > doc.page.height - 40) {
        doc.addPage();
        y = 40;
      }
      if (fill) {
        doc.rect(36, y, pageW, rowH).fill(fill);
      }
      doc.fillColor("#000");
      cells.slice(0, maxCols).forEach((c, i) => {
        const text = String(c ?? "").slice(0, 28);
        if (bold) doc.font("Helvetica-Bold");
        else doc.font("Helvetica");
        doc.fontSize(7).text(text, 36 + i * colW + 3, y + 4, { width: colW - 6 });
      });
      doc.rect(36, y, pageW, rowH).stroke("#ccc");
      y += rowH;
    };

    drawRow(cols, true, "#e8f5e9");
    for (const r of t.rows.slice(0, 500)) drawRow(r, false);
    if (t.rows.length > 500) {
      doc.moveDown();
      doc.fontSize(8).fillColor("#666").text(`... dan ${t.rows.length - 500} baris lainnya (lihat versi Excel/CSV untuk lengkap).`);
    }
    doc.end();
  });
}

export function downloadResponse(
  body: Buffer | string,
  filename: string,
  contentType: string,
): Response {
  return new Response(body as never, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
