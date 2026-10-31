import { z } from "zod";
import {
  allRows,
  ApiError,
  failure,
  sameOrigin,
  session,
  supa,
} from "@/lib/stock/server";
import { operationRequest, operationSchemas } from "@/modules/stock/operations";
import { readLimitedJSON } from "@/lib/stock/request";
const limits = {
  importMaxBytes: Math.min(
    2_000_000,
    Math.max(1024, Number(process.env.STOCK_IMPORT_MAX_BYTES) || 2_000_000),
  ),
  importMaxRows: Math.min(
    2000,
    Math.max(1, Math.floor(Number(process.env.STOCK_IMPORT_MAX_ROWS) || 2000)),
  ),
};

export async function GET(req: Request) {
  try {
    const { token } = await session();
    const tenant = z
      .string()
      .uuid()
      .parse(new URL(req.url).searchParams.get("tenant_id"));
    const entitlements = await supa(
      "/rest/v1/rpc/stockinho_entitlements",
      token,
      { method: "POST", body: JSON.stringify({ p_tenant: tenant }) },
    );
    if (new URL(req.url).searchParams.get("usage") === "1")
      return Response.json(
        { entitlements },
        { headers: { "Cache-Control": "no-store" } },
      );
    const keys = [
      "suppliers",
      "supplierProducts",
      "inventories",
      "inventoryItems",
      "purchases",
      "purchaseItems",
      "batches",
    ];
    const tables = [
      "sk_suppliers",
      "sk_supplier_products",
      "sk_inventories",
      "sk_inventory_items",
      "sk_purchase_orders",
      "sk_purchase_items",
      "sk_batches",
    ];
    const rows = await Promise.all(
      tables.map((table) => allRows(table, token, tenant)),
    );
    return Response.json(
      {
        ...Object.fromEntries(keys.map((key, i) => [key, rows[i]])),
        entitlements,
        limits,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { token } = await session();
    const body = operationRequest.parse(
      await readLimitedJSON(req, limits.importMaxBytes),
    );
    const data = operationSchemas[body.action].parse(body.data);
    if (
      body.action === "import" &&
      "rows" in data &&
      data.rows.length > limits.importMaxRows
    )
      throw new ApiError(
        `O limite configurado é de ${limits.importMaxRows} linhas por importação.`,
        413,
      );
    const result = await supa("/rest/v1/rpc/stockinho_operate", token, {
      method: "POST",
      body: JSON.stringify({
        p_tenant: body.tenant_id,
        p_action: body.action,
        p_key: body.key,
        p_data: data,
      }),
    });
    return Response.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleError(e);
  }
}
function handleError(e: unknown) {
  if (e instanceof z.ZodError)
    return Response.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (e instanceof SyntaxError)
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  return failure(e);
}
