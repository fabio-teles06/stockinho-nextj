import { z } from "zod";

const id = z.string().uuid();
const amount = z
  .number()
  .finite()
  .min(0)
  .max(100000000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use até duas casas decimais.",
  );
const text = z.string().trim().max(500);
const date = z.string().date();
export const importRow = z.object({
  location_id: id.optional(),
  supplier_id: id.optional(),
  name: z.string().trim().min(1).max(150),
  sku: z.string().trim().max(60).default(""),
  barcode: z.string().trim().max(60).default(""),
  category_id: id,
  unit: z.enum(["un", "kg", "L", "cx"]).default("un"),
  quantity: amount.default(0),
  cost_price: amount.default(0),
  sale_price: amount.default(0),
  min_quantity: amount.default(0),
});
export type ImportRow = z.infer<typeof importRow>;
const purchaseItem = z.object({
  product_id: id,
  quantity: amount.refine((n) => n > 0),
  unit_cost: amount,
});
export const operationSchemas = {
  primary_operator: z.object({ user_id: id }),
  expiry_settings: z.object({
    days: z.union([z.literal(7), z.literal(15), z.literal(30)]),
  }),
  location_default: z.object({ id }),
  barcode_associate: z.object({
    product_id: id,
    barcode: z.string().trim().min(1).max(60),
  }),
  movement: z.object({
    product_id: id,
    location_id: id,
    type: z.enum(["entrada", "saida"]),
    quantity: amount.refine((n) => n > 0),
    reason: z.enum([
      "Compra",
      "Venda",
      "Ajuste inicial",
      "Devolução",
      "Perda",
      "Ajuste de inventário",
    ]),
    note: text.default(""),
    batch_id: id.optional(),
    unit_cost: amount.optional(),
  }),
  transfer: z.object({
    product_id: id,
    location_id: id,
    destination_id: id,
    quantity: amount.refine((n) => n > 0),
    batch_id: id.optional(),
    note: text.default(""),
  }),
  inventory_create: z.object({
    location_id: id,
    notes: text.default(""),
    product_ids: z.array(id).min(1).max(2000).optional(),
    category_id: id.optional(),
  }),
  inventory_count: z.object({
    id,
    items: z
      .array(
        z.object({ product_id: id, batch_id: id.optional(), counted: amount }),
      )
      .min(1)
      .max(2000),
  }),
  inventory_review: z.object({ id }),
  inventory_complete: z.object({ id }),
  inventory_cancel: z.object({ id }),
  supplier_save: z.object({
    id: id.optional(),
    name: z.string().trim().min(1).max(150),
    trade_name: text.default(""),
    document: z
      .string()
      .max(18)
      .transform((s) => s.replace(/\D/g, ""))
      .refine((s) => !s || validDocument(s), "CPF/CNPJ inválido.")
      .default(""),
    email: z.union([z.literal(""), z.string().email().max(254)]).default(""),
    phone: text.default(""),
    address: text.default(""),
    contact: text.default(""),
    lead_days: z.number().int().min(0).max(3650).default(0),
    notes: text.default(""),
    active: z.boolean().default(true),
  }),
  supplier_link: z.object({ product_id: id, supplier_id: id }),
  purchase_create: z.object({
    id: id.optional(),
    supplier_id: id,
    location_id: id,
    items: z.array(purchaseItem).min(1).max(200),
    freight: amount.default(0),
    discount: amount.default(0),
    expected_on: date.optional(),
    notes: text.default(""),
  }),
  purchase_confirm: z.object({ id }),
  purchase_cancel: z.object({ id }),
  purchase_receive: z.object({
    id,
    note: z.string().trim().max(400).default(""),
    items: z
      .array(
        z.object({
          product_id: id,
          quantity: amount.refine((n) => n > 0),
          batch_code: z.string().trim().min(1).max(100).optional(),
          expires_on: date.optional(),
          manufactured_on: date.optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
  batch_create: z.object({
    product_id: id,
    location_id: id,
    code: z.string().trim().min(1).max(100),
    manufactured_on: date.optional(),
    expires_on: date,
  }),
  import: z.object({
    location_id: id,
    conflict: z.enum(["reject", "skip", "update"]),
    rows: z.array(importRow).min(1).max(2000),
  }),
};
export type OperationAction = keyof typeof operationSchemas;
export const operationRequest = z.object({
  tenant_id: id,
  key: id,
  action: z.enum(
    Object.keys(operationSchemas) as [OperationAction, ...OperationAction[]],
  ),
  data: z.unknown(),
});

export function validDocument(value: string) {
  if (!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digits = [...value].map(Number);
  for (let size = value.length - 2; size < value.length; size++) {
    const weights =
      value.length === 11
        ? Array.from({ length: size }, (_, i) => size + 1 - i)
        : Array.from({ length: size }, (_, i) => ((size - 1 - i) % 8) + 2);
    const sum = digits
      .slice(0, size)
      .reduce((s, n, i) => s + n * weights[i], 0);
    const check =
      value.length === 11
        ? ((sum * 10) % 11) % 10
        : sum % 11 < 2
          ? 0
          : 11 - (sum % 11);
    if (digits[size] !== check) return false;
  }
  return true;
}

export type Supplier = {
  id: string;
  tenant_id: string;
  name: string;
  trade_name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  contact: string;
  lead_days: number;
  notes: string;
  active: boolean;
};
export type Inventory = {
  id: string;
  tenant_id: string;
  location_id: string;
  status: string;
  notes: string;
  created_at: string;
  completed_at: string | null;
};
export type InventoryItem = {
  batch_id?: string | null;
  id: string;
  inventory_id: string;
  product_id: string;
  expected: number;
  counted: number | null;
  unit_cost: number;
};
export type Purchase = {
  notes: string;
  received_at: string | null;
  id: string;
  tenant_id: string;
  supplier_id: string;
  location_id: string;
  status: string;
  total: number;
  freight: number;
  discount: number;
  expected_on: string | null;
  created_at: string;
};
export type PurchaseItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  received: number;
  unit_cost: number;
};
export type Batch = {
  id: string;
  tenant_id: string;
  product_id: string;
  location_id: string;
  code: string;
  expires_on: string;
  manufactured_on: string | null;
  quantity: number;
  source_order_id: string | null;
};
export type SupplierProduct = {
  id: string;
  supplier_id: string;
  product_id: string;
  last_cost: number | null;
  last_purchase_at: string | null;
};
export type OperationsData = {
  limits: { importMaxBytes: number; importMaxRows: number };
  suppliers: Supplier[];
  supplierProducts: SupplierProduct[];
  inventories: Inventory[];
  inventoryItems: InventoryItem[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  batches: Batch[];
  entitlements: {
    can_write: boolean;
    primary_user_id: string;
    expiry_alert_days: number;
    pro: boolean;
    product_limit: number;
    location_limit: number;
    user_limit: number;
    initial_import_used: boolean;
  };
};
