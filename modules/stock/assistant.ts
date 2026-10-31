import { z } from "zod";
import { money, number } from "./model.ts";
export const assistantContextSchema = z.object({
  reference_utc: z.string(),
  finance: z.object({
    value: z.number(),
    active_products: z.number(),
    low_stock: z.number(),
    units: z.array(z.object({ unit: z.string(), quantity: z.number() })),
  }),
  expiring_batches: z
    .array(
      z.object({
        product: z.string(),
        code: z.string(),
        expires_on: z.string(),
        quantity: z.number(),
      }),
    )
    .max(50),
  supplier_prices: z
    .array(
      z.object({
        product: z.string(),
        supplier: z.string(),
        last_cost: z.number(),
        last_purchase_at: z.string(),
      }),
    )
    .max(50),
  inventory_discrepancies: z
    .array(
      z.object({
        product: z.string(),
        expected: z.number(),
        counted: z.number(),
        completed_at: z.string(),
      }),
    )
    .max(20),
  stale_products: z.array(z.object({ name: z.string() })).max(50),
});
export type AssistantContext = z.infer<typeof assistantContextSchema>;
export function advancedAnalysis(
  question: string,
  c: AssistantContext,
): string | null {
  const q = question.toLocaleLowerCase("pt-BR");
  if (/venc|validade/.test(q))
    return c.expiring_batches.length
      ? "Lotes vencidos ou que vencem em até 30 dias (até 50 resultados):\n" +
          c.expiring_batches
            .map(
              (b) =>
                `• ${b.product}: lote ${b.code}, validade ${b.expires_on.split("-").reverse().join("/")}, saldo ${number(b.quantity)}.`,
            )
            .join("\n")
      : "Nenhum lote com saldo vence nos próximos 30 dias neste local.";
  if (/fornecedor|menor.*preço/.test(q))
    return c.supplier_prices.length
      ? "Últimos custos registrados por fornecedor (amostra das 50 compras mais recentes; não é cotação atual):\n" +
          [...c.supplier_prices]
            .sort((a, b) => a.last_cost - b.last_cost)
            .map(
              (p) =>
                `• ${p.product} — ${p.supplier}: ${money(p.last_cost)} em ${new Date(p.last_purchase_at).toLocaleDateString("pt-BR")}.`,
            )
            .join("\n")
      : "Não há custos de fornecedores registrados.";
  if (/diverg|inventário|inventario/.test(q))
    return c.inventory_discrepancies.length
      ? "Maiores divergências de inventários concluídos (até 20 resultados):\n" +
          c.inventory_discrepancies
            .map(
              (i) =>
                `• ${i.product}: esperado ${number(i.expected)}, contado ${number(i.counted)}, diferença ${number(i.counted - i.expected)}.`,
            )
            .join("\n")
      : "Não há divergências de inventários concluídos neste local.";
  if (/sem mov|parad|30 dias/.test(q))
    return c.stale_products.length
      ? "Sem movimentação há 30 dias neste local (até 50 resultados):\n" +
          c.stale_products.map((p) => "• " + p.name).join("\n")
      : "Todos os produtos tiveram movimentação nos últimos 30 dias.";
  if (/invest|imobiliz|valor|custo/.test(q))
    return `O estoque deste local está avaliado em ${money(c.finance.value)}, usando o custo atual cadastrado de cada produto. Custos zero e histórico anterior ao início dos registros podem limitar a avaliação.`;
  if (/total|resumo/.test(q))
    return `${c.finance.active_products} produtos ativos e ${c.finance.low_stock} abaixo ou no mínimo. Saldos por unidade de medida: ${c.finance.units.map((u) => `${number(u.quantity)} ${u.unit}`).join(", ") || "nenhum saldo"}. Valor a custo: ${money(c.finance.value)}.`;
  return null;
}
