import {
  session,
  snapshot,
  supa,
  failure,
  sameOrigin,
  ApiError,
  config,
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
    const { token, user } = await session();
    const b: any = await req.json();
    const action = z
      .enum([
        "company",
        "product",
        "category",
        "location",
        "movement",
        "sale",
        "delete",
        "member",
        "delete_company",
        "remove_member",
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
      "/rest/v1/sk_memberships?tenant_id=eq." + tenant + "&user_id=eq." + user.id + "&select=role",
      token,
    );
    if (!memberships.length)
      throw new ApiError("Você não tem acesso a esta empresa.", 403);
    if (!["movement", "sale"].includes(action) && memberships[0].role !== "admin")
      throw new ApiError(
        "Apenas administradores podem realizar esta ação.",
        403,
      );
    if (action === "delete_company" || action === "remove_member") {
      await supa(`/rest/v1/rpc/stockinho_${action}`, token, {
        method: "POST",
        body: JSON.stringify({
          p_tenant: tenant,
          ...(action === "remove_member" ? { p_member: id.parse(b.member_id) } : {}),
        }),
      });
      return Response.json({ ok: true });
    }
    let item: any,
      table = "";
    if (action === "product") {
      item = z
        .object({
          id,
          name,
          barcode: z.string().max(60),
          sku: z.string().trim().max(60).optional(),
          track_batches: z.boolean().optional(),
          category_id: id,
          unit: z.enum(["un", "kg", "L", "cx"]),
          cost_price: num,
          sale_price: num,
          min_quantity: num,
          image_url: z.string().url().max(1000).nullable().optional(),
          active: z.boolean(),
        })
        .parse(b.item);
      if (b.image_data) {
        const match = String(b.image_data).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!match || match[2].length > 7_000_000)
          throw new ApiError("A foto deve ser JPG, PNG ou WEBP e ter no máximo 5 MB.");
        const { url, key } = config();
        const imagePath = `${tenant}/${item.id}.${match[1].split("/")[1]}`;
        const upload = await fetch(`${url}/storage/v1/object/product-images/${imagePath}`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: "Bearer " + token,
            "Content-Type": match[1],
            "x-upsert": "true",
          },
          body: Buffer.from(match[2], "base64"),
        });
        if (!upload.ok) throw new ApiError("Não foi possível salvar a foto do produto.", 502);
        item.image_url = `${url}/storage/v1/object/public/product-images/${imagePath}`;
      }
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
          active: z.boolean().optional(),
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
      await supa("/rest/v1/rpc/stockinho_operate", token, {
        method: "POST",
        body: JSON.stringify({
          p_tenant: tenant,
          p_action: "movement",
          p_key: id.parse(b.key || b.item.id),
          p_data: item,
        }),
      });
    }
    if (action === "sale") {
      const sale = z.object({
        location_id: id,
        payment_method: z.enum(["system", "credit", "debit"]),
        installments: z.number().int().min(1).max(12),
        external_order_id: z.string().max(100).optional(),
        items: z.array(z.object({ product_id: id, quantity: num.positive() })).min(1).max(100),
      }).parse(b.sale);
      await supa("/rest/v1/rpc/stockinho_sale", token, {
        method: "POST",
        body: JSON.stringify({
          p_tenant: tenant,
          p_location: sale.location_id,
          p_payment_method: sale.payment_method,
          p_installments: sale.installments,
          p_external_order_id: sale.external_order_id || null,
          p_items: sale.items,
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
      const resendKey = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM_EMAIL;
      if (!resendKey || !from)
        throw new ApiError(
          "O envio de convite ainda não está configurado. Defina RESEND_API_KEY e RESEND_FROM_EMAIL.",
          503,
        );
      const companyRows = await supa(
        "/rest/v1/sk_companies?id=eq." + tenant + "&select=name",
        token,
      );
      const companyName = companyRows[0]?.name;
      if (!companyName) throw new ApiError("Empresa inválida.", 400);
      const email = z.string().email().parse(b.email);
      const role = z.enum(["admin", "operator"]).parse(b.role);
      await supa("/rest/v1/rpc/stockinho_add_member", token, {
        method: "POST",
        body: JSON.stringify({
          p_tenant: tenant,
          p_email: email,
          p_role: role,
        }),
      });
      const appUrl = process.env.APP_URL || new URL(req.url).origin;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `Você foi adicionado à equipe da ${companyName}`,
          html: `<p>Você foi adicionado à equipe da <strong>${companyName}</strong> como <strong>${role === "admin" ? "administrador" : "operador"}</strong>.</p><p>Acesse o Stockinho para começar: <a href="${appUrl}/login">${appUrl}/login</a></p>`,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("[members] Falha ao enviar convite", {
          status: response.status,
          body,
        });
        throw new ApiError("Membro adicionado, mas não foi possível enviar o e-mail.", 502);
      }
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
