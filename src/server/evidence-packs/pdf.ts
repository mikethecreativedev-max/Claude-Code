import PDFDocument from "pdfkit";

import type { EvidencePackData } from "@/server/evidence-packs/query";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders an EvidencePackData structure (already fully org-scoped by the
 * query layer — see src/server/evidence-packs/query.ts) into a real PDF
 * file, buffered in memory. Intended to be inspection-presentable: org
 * identification, the selected date range/domain printed at the top, a
 * clear heading per source module, and per-record detail (not a raw field
 * dump).
 *
 * pdfkit is used for server-side rendering (Node.js runtime only — the
 * route handler that calls this must set `export const runtime =
 * "nodejs"`, since pdfkit relies on Node's fs/stream APIs and does not
 * run on the Edge runtime).
 */
export function renderEvidencePackPdf(data: EvidencePackData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // compress: false keeps content streams uncompressed.
    // The Info dict (Title/Subject) is written as plain literal strings
    // — not hex-encoded like content stream text — so automated tests
    // can grep the raw PDF bytes for orgId/orgName to verify cross-tenant
    // isolation end-to-end at the byte level without needing a PDF parser.
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      compress: false,
      info: {
        // ASCII-only fields: pdfkit writes these as plain literal strings
        // in the PDF Info dict, searchable in raw bytes. A non-ASCII char
        // (e.g. an em-dash) in the value would trigger UTF-16 encoding
        // for the whole string, defeating the byte-level leak test.
        Title: data.orgName,
        Subject: data.orgId,
        Author: data.generatedByLabel,
        Creator: "BNCL Compliance Platform",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Cover / header block ────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(20).text("Evidence Pack", { align: "left" });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(14).text(data.orgName);
    doc.font("Helvetica").fontSize(10).fillColor("#444444");
    doc.text(`Organisation ID: ${data.orgId}`);
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text("Report parameters");
    doc.font("Helvetica").fontSize(10).fillColor("#222222");
    doc.text(`Date range: ${formatDate(data.dateFrom)} to ${formatDate(data.dateTo)}`);
    doc.text(`Domain filter: ${data.domainLabel}`);
    doc.text(`Generated: ${data.generatedAt.toISOString()} by ${data.generatedByLabel}`);
    doc.text(`Total matching records: ${data.totalRecordCount}`);

    doc.moveDown(0.4);
    doc
      .strokeColor("#888888")
      .lineWidth(1)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.6);

    if (data.totalRecordCount === 0) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(11)
        .fillColor("#444444")
        .text(
          "No tagged records were found for the selected date range and domain filter."
        );
    }

    // ── Per-module sections ─────────────────────────────────────────────
    for (const section of data.sections) {
      if (section.records.length === 0) continue;

      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage();
      }

      doc.moveDown(0.6);
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#000000")
        .text(`${section.moduleLabel} (${section.records.length})`);
      doc
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.3);

      for (const record of section.records) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 100) {
          doc.addPage();
        }

        doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(record.title);
        doc.font("Helvetica").fontSize(9).fillColor("#333333");
        for (const line of record.detailLines) {
          doc.text(line, { indent: 12 });
        }

        if (record.tagLabels.length > 0) {
          doc
            .font("Helvetica-Oblique")
            .fontSize(9)
            .fillColor("#555555")
            .text(`Tagged to: ${record.tagLabels.join(", ")}`, { indent: 12 });
        }

        if (record.attachments.length > 0) {
          doc.font("Helvetica-Oblique").fontSize(9).fillColor("#555555");
          for (const att of record.attachments) {
            doc.text(
              `Attachment: ${att.fileName} (${att.mimeType}, ${formatBytes(att.sizeBytes)})`,
              { indent: 12 }
            );
          }
        }

        doc.moveDown(0.5);
      }
    }

    // ── Footer: page numbers ────────────────────────────────────────────
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - doc.page.margins.bottom + 20;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#888888")
        .text(`${data.orgName} — Evidence Pack — Page ${i + 1} of ${pageRange.count}`, doc.page.margins.left, bottom, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: "center",
        });
    }

    doc.end();
  });
}
