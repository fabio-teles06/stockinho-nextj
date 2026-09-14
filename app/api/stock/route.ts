import {
  session,
  snapshot,
  supa,
  failure,
  sameOrigin,
  ApiError,
} from "@/lib/stock/server";
import { z } from "zod";
const id = z.string().uuid(),
  num = z.number().finite().min(0).max(100000000),
  name = z.string().trim().min(1).max(150);
export async function GET() {
  try {
    const { token, user } = await session();
    return Response.json(
      { data: await snapshot(token), email: user.email },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { token } = await session();
    const b: any = await req.json();
    const action = z
      .enum([
        "company",
        "product",
        "category",
        "location",
        "movement",
        "delete",
        "member",
      ])
      .parse(b.action);
    if (action === "company") {
      const item = z.object({ id, name }).parse(b.item);
      await supa("/rest/v1/rpc/stockinho_create_company", token, {
        method: "POST",
        body: JSON.stringify({ company_name: item.name }),
      });
      return Response.json({ ok: true });
    }
    const tenant = id.parse(b.tenant_id);
    const memberships = await supa(
      "/rest/v1/sk_memberships?tenant_id=eq." + tenant + "&select=role",
      token,
    );
    if (!memberships.length)
      throw new ApiError("Você não tem acesso a esta empresa.", 403);
    if (action !== "movement" && memberships[0].role !== "admin")
      throw new ApiError(
        "Apenas administradores podem realizar esta ação.",
        403,
      );
    let item: any,
      table = "";
    if (action === "product") {
      item = z
        .object({
          id,
          name,
          barcode: z.string().max(60),
          category_id: id,
          unit: z.enum(["un", "kg", "L", "cx"]),
          cost_price: num,
          sale_price: num,
          min_quantity: num,
          active: z.boolean(),
        })
        .parse(b.item);
      table = "sk_products";
    }
    if (action === "category") {
      item = z
        .object({ id, name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
        .parse(b.item);
      table = "sk_categories";
    }
    if (action === "location") {
      item = z
        .object({
          id,
          name,
          type: z.enum(["Loja", "Depósito"]),
          address: z.string().max(250),
        })
        .parse(b.item);
      table = "sk_locations";
    }
    if (table) {
      await supa("/rest/v1/" + table, token, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({ ...item, tenant_id: tenant }),
      });
    }
    if (action === "movement") {
      item = z
        .object({
          product_id: id,
          location_id: id,
          type: z.enum(["entrada", "saida"]),
          quantity: num.positive(),
          reason: z.enum([
            "Compra",
            "Venda",
            "Ajuste inicial",
            "Devolução",
            "Perda",
            "Ajuste de inventário",
          ]),
          note: z.string().max(500),
        })
        .parse(b.item);
      if (
        (item.type === "entrada" && ["Venda", "Perda"].includes(item.reason)) ||
        (item.type === "saida" &&
          ["Compra", "Ajuste inicial"].includes(item.reason))
      )
        throw new ApiError(
          "O motivo selecionado não corresponde ao tipo de movimentação.",
        );
      await supa("/rest/v1/rpc/stockinho_move", token, {
        method: "POST",
        body: JSON.stringify({
          p_tenant: tenant,
          p_product: item.product_id,
          p_location: item.location_id,
          p_type: item.type,
          p_quantity: item.quantity,
          p_reason: item.reason,
          p_note: item.note,
        }),
      });
    }
    if (action === "delete") {
      const row = id.parse(b.id);
      const type = z.enum(["product", "category"]).parse(b.type);
      await supa(
        "/rest/v1/" +
          (type === "product" ? "sk_products" : "sk_categories") +
          "?id=eq." +
          row +
          "&tenant_id=eq." +
          tenant,
        token,
        {
          method: type === "product" ? "PATCH" : "DELETE",
          ...(type === "product"
            ? { body: JSON.stringify({ active: false }) }
            : {}),
          headers: { Prefer: "return=representation" },
        },
      );
    }
    if (action === "member") {
      await supa("/rest/v1/rpc/stockinho_add_member", token, {
        method: "POST",
        body: JSON.stringify({
          p_tenant: tenant,
          p_email: z.string().email().parse(b.email),
          p_role: z.enum(["admin", "operator"]).parse(b.role),
        }),
      });
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error:
            "Confira os campos informados. " +
            e.issues.map((x) => x.path.join(".") + ": " + x.message).join("; "),
        },
        { status: 400 },
      );
    return failure(e);
  }
}
