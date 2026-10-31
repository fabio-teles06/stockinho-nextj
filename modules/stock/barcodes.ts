import type { Product } from "./model.ts";
export function labelCode(product: Pick<Product, "id" | "barcode">) {
  return product.barcode || "STK:" + product.id;
}
export function findScannedProduct(products: Product[], code: string) {
  if (!code) return undefined;
  const matches = products.filter(
    (p) =>
      p.barcode === code ||
      p.sku === code ||
      p.id === code ||
      code === "STK:" + p.id,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
