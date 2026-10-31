import { jsPDF } from "jspdf";
import bwipjs from "bwip-js/node";
import QRCode from "qrcode";
import type { Product } from "../../modules/stock/model.ts";
import { labelCode } from "../../modules/stock/barcodes.ts";
export type LabelOptions = {
  format: "a4" | "thermal";
  type: "code128" | "qrcode";
  copies: number;
  show_price: boolean;
};
export type LabelBatch = {
  code: string;
  expires_on: string;
  product_id: string;
};
export async function generateLabels(
  products: Product[],
  options: LabelOptions,
  batch?: LabelBatch,
) {
  const thermal = options.format === "thermal";
  const pdf = new jsPDF({
    unit: "mm",
    format: thermal ? [60, 40] : "a4",
    orientation: thermal ? "landscape" : "portrait",
  });
  let count = 0;
  for (const p of products) {
    // Internal UUID is Code 128, never an invented commercial GTIN.
    const code = labelCode(p);
    if (options.type === "code128" && !/^[\x20-\x7e]{1,60}$/.test(code))
      throw new Error(
        "Este código contém caracteres incompatíveis com Code 128. Use QR Code.",
      );
    const png =
      options.type === "qrcode"
        ? await QRCode.toDataURL(code, { margin: 1, width: 240 })
        : "data:image/png;base64," +
          (
            await bwipjs.toBuffer({
              bcid: "code128",
              text: code,
              scale: 3,
              height: 10,
              includetext: false,
            })
          ).toString("base64");
    for (let copy = 0; copy < options.copies; copy++) {
      const slot = thermal ? 0 : count % 21;
      if (count > 0 && (thermal || slot === 0)) pdf.addPage();
      const x = thermal ? 3 : 6 + (slot % 3) * 67,
        y = thermal ? 3 : 8 + Math.floor(slot / 3) * 40;
      pdf.setFontSize(8);
      pdf.text(pdf.splitTextToSize(p.name, 54).slice(0, 2), x, y + 3);
      const qr = options.type === "qrcode";
      pdf.addImage(png, "PNG", x, y + 8, qr ? 16 : 54, 16);
      pdf.setFontSize(6);
      pdf.text(code.slice(0, 60), x, y + 27);
      if (batch)
        pdf.text(
          `Lote ${batch.code.slice(0, 18)} | Val. ${batch.expires_on.split("-").reverse().join("/")}`,
          x,
          y + 31,
        );
      else if (options.show_price)
        pdf.text(
          new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(p.sale_price),
          x,
          y + 31,
        );
      else if (p.sku) pdf.text("SKU: " + p.sku, x, y + 31);
      count++;
    }
  }

  return pdf.output("arraybuffer");
}
