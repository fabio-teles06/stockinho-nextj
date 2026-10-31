import { z } from "zod";
import { generateLabels } from "@/lib/stock/labels";

import {
  ApiError,
  failure,
  sameOrigin,
  session,
  supa,
} from "@/lib/stock/server";
import type { Product } from "@/modules/stock/model";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { token } = await session();
    const body = z
      .object({
        tenant_id: z.string().uuid(),
        product_ids: z.array(z.string().uuid()).min(1).max(100),
        copies: z.number().int().min(1).max(100),
        format: z.enum(["a4", "thermal"]),
        type: z.enum(["code128", "qrcode"]),
        show_price: z.boolean().default(false),
        batch_id: z.string().uuid().optional(),
      })
      .parse(await req.json());
    if (body.product_ids.length * body.copies > 500)
      throw new ApiError("Gere no máximo 500 etiquetas por vez.");
    const access = await supa("/rest/v1/rpc/stockinho_entitlements", token, {
      method: "POST",
      body: JSON.stringify({ p_tenant: body.tenant_id }),
    });
    if (
      !access.pro &&
      (body.product_ids.length > 1 ||
        body.copies > 1 ||
        body.type !== "code128" ||
        body.format !== "a4" ||
        body.show_price ||
        body.batch_id)
    )
      throw new ApiError("Personalização e etiquetas em lote exigem Pro.", 403);
    const products: Product[] = await supa(
      `/rest/v1/sk_products?tenant_id=eq.${body.tenant_id}&id=in.(${body.product_ids.join(",")})&select=*`,
      token,
    );
    if (products.length !== new Set(body.product_ids).size)
      throw new ApiError("Produto não autorizado.", 403);
    let batch:
      { code: string; expires_on: string; product_id: string } | undefined;
    if (body.batch_id) {
      batch = (
        await supa(
          `/rest/v1/sk_batches?tenant_id=eq.${body.tenant_id}&id=eq.${body.batch_id}&select=code,expires_on,product_id`,
          token,
        )
      )[0];
      if (!batch || products.some((p) => p.id !== batch?.product_id))
        throw new ApiError("Lote não autorizado.", 403);
    }
    let pdf: ArrayBuffer;
    try {
      pdf = await generateLabels(products, body, batch);
    } catch {
      throw new ApiError(
        "Não foi possível gerar a etiqueta. Confira o código ou escolha QR Code.",
      );
    }
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="stockinho-etiquetas.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        { error: "Confira os dados das etiquetas." },
        { status: 400 },
      );
    return failure(e);
  }
}
