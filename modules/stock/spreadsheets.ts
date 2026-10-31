import Papa from "papaparse";
import { importRow, type ImportRow } from "./operations.ts";

export const importFields = [
  "name",
  "sku",
  "barcode",
  "unit",
  "quantity",
  "min_quantity",
  "cost_price",
  "sale_price",
  "category",
  "location",
  "supplier",
] as const;
export type ImportField = (typeof importFields)[number];
export const fieldLabels: Record<ImportField, string> = {
  name: "Nome",
  sku: "SKU",
  barcode: "Código de barras",
  unit: "Unidade",
  quantity: "Quantidade inicial",
  min_quantity: "Estoque mínimo",
  cost_price: "Custo",
  sale_price: "Preço de venda",
  category: "Categoria",
  location: "Local de estoque",
  supplier: "Fornecedor",
};
export function parseCSV(text: string) {
  if (text.includes("\uFFFD")) throw Error("Use CSV com codificação UTF-8.");
  let result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (result.errors.some((e) => e.code === "UndetectableDelimiter"))
    result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
      skipEmptyLines: "greedy",
      delimiter: text.split(/[\r\n]/)[0].includes(";") ? ";" : ",",
    });
  if (result.errors.length)
    throw Error("CSV inválido: " + result.errors[0].message);
  const [headers, ...rows] = result.data;
  if (!headers?.length || !rows.length)
    throw Error("Informe um cabeçalho e ao menos uma linha.");
  if (rows.length > 2000)
    throw Error("O limite é de 2.000 linhas por importação.");
  if (new Set(headers).size !== headers.length)
    throw Error("As colunas do cabeçalho devem ter nomes diferentes.");
  if (rows.some((row) => row.length !== headers.length))
    throw Error("Há linhas com quantidade de colunas diferente do cabeçalho.");
  return { headers, rows };
}
export function parseDecimal(value: string) {
  const s = value.trim();
  if (!s) return 0;
  if (s.includes(",") && !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s))
    return NaN;
  // Accept Brazilian grouping/decimal or an ungrouped decimal point.
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
}
export function mapRows(
  rows: string[][],
  mapping: Partial<Record<ImportField, string>>,
  headers: string[],
  category_id: string,
  lookups: {
    categories: { id: string; name: string }[];
    locations: { id: string; name: string }[];
    suppliers: { id: string; name: string }[];
  } = { categories: [], locations: [], suppliers: [] },
) {
  const errors: { line: number; message: string }[] = [],
    valid: ImportRow[] = [],
    skus = new Set<string>(),
    codes = new Set<string>();
  rows.forEach((row, index) => {
    const data: Record<string, unknown> = { category_id };
    for (const field of importFields) {
      const column = mapping[field];
      const value = column ? (row[headers.indexOf(column)] ?? "") : "";
      data[field] = [
        "quantity",
        "min_quantity",
        "cost_price",
        "sale_price",
      ].includes(field)
        ? parseDecimal(value)
        : value.trim();
    }
    if (!data.unit) data.unit = "un";
    const resolve = (value: unknown, rows: { id: string; name: string }[]) =>
      rows.find(
        (r) =>
          r.id === value ||
          r.name.toLocaleLowerCase("pt-BR") ===
            String(value).toLocaleLowerCase("pt-BR"),
      )?.id || "";
    if (data.category)
      data.category_id = resolve(data.category, lookups.categories);
    if (data.location)
      data.location_id = resolve(data.location, lookups.locations);
    if (data.supplier)
      data.supplier_id = resolve(data.supplier, lookups.suppliers);
    const parsed = importRow.safeParse(data);
    if (!parsed.success) {
      errors.push({
        line: index + 2,
        message: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    const p = parsed.data;
    if ((p.sku && skus.has(p.sku)) || (p.barcode && codes.has(p.barcode))) {
      errors.push({
        line: index + 2,
        message: "SKU ou código repetido no arquivo.",
      });
      return;
    }
    if (p.sku) skus.add(p.sku);
    if (p.barcode) codes.add(p.barcode);
    valid.push(p);
  });
  return { valid, errors };
}
export {csvCell,toCSV} from './csv-export.ts';
