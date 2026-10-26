import { z } from "zod";
import { ApiError, failure, sameOrigin, session, snapshot } from "@/lib/stock/server";

const requestSchema = z.object({
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  email: z.string().email(),
});

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { token, user } = await session();
    const input = requestSchema.parse(await req.json());
    const data = await snapshot(token);
    const membership = data.memberships.find(
      (item) => item.tenant_id === input.tenant_id && item.user_id === user.id,
    );
    if (!membership) throw new ApiError("Você não tem acesso a esta empresa.", 403);

    const company = data.companies.find((item) => item.id === input.tenant_id);
    const location = data.locations.find((item) => item.id === input.location_id);
    if (!company || !location || location.tenant_id !== input.tenant_id)
      throw new ApiError("Empresa ou unidade inválida.", 400);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const movements = data.movements.filter(
      (item) =>
        item.tenant_id === input.tenant_id &&
        item.location_id === input.location_id &&
        new Date(item.created_at) >= monthStart,
    );
    const rows = [
      [
        "Produto",
        "Código de barras",
        "Unidade",
        "Saldo atual",
        "Estoque mínimo",
        "Custo unitário",
        "Valor em estoque",
        "Entradas no mês",
        "Saídas no mês",
      ],
      ...data.products
        .filter((item) => item.tenant_id === input.tenant_id && item.active)
        .map((product) => {
          const quantity = data.balances
            .filter(
              (item) =>
                item.tenant_id === input.tenant_id &&
                item.location_id === input.location_id &&
                item.product_id === product.id,
            )
            .reduce((sum, item) => sum + Number(item.quantity), 0);
          const productMovements = movements.filter(
            (item) => item.product_id === product.id,
          );
          return [
            product.name,
            product.barcode,
            product.unit,
            quantity,
            product.min_quantity,
            product.cost_price,
            quantity * product.cost_price,
            productMovements
              .filter((item) => item.type === "entrada")
              .reduce((sum, item) => sum + Number(item.quantity), 0),
            productMovements
              .filter((item) => item.type === "saida")
              .reduce((sum, item) => sum + Number(item.quantity), 0),
          ];
        }),
    ];
    const csv =
      "\ufeff" +
      rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const month = now.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!resendKey || !from)
      throw new ApiError(
        "O envio de e-mail ainda não está configurado. Defina RESEND_API_KEY e RESEND_FROM_EMAIL.",
        503,
      );

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: `Fechamento de estoque — ${company.name} — ${month}`,
        html: `<p>Olá!</p><p>Segue o fechamento de estoque de <strong>${company.name}</strong>, unidade <strong>${location.name}</strong>, referente a ${month}.</p><p>O relatório completo está anexado em CSV.</p>`,
        attachments: [
          {
            filename: `fechamento-estoque-${now.toISOString().slice(0, 7)}.csv`,
            content: base64(csv),
          },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[reports] Falha ao enviar fechamento", {
        status: response.status,
        body,
      });
      throw new ApiError("Não foi possível enviar o relatório por e-mail.", 502);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
