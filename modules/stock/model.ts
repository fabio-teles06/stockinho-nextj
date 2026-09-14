export type Company = { id: string; name: string };
export type Location = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  address: string;
};
export type Category = {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
};
export type Product = {
  id: string;
  tenant_id: string;
  name: string;
  barcode: string;
  category_id: string;
  unit: string;
  cost_price: number;
  sale_price: number;
  min_quantity: number;
  active: boolean;
};
export type Balance = {
  tenant_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
};
export type Movement = {
  id: string;
  tenant_id: string;
  product_id: string;
  location_id: string;
  type: "entrada" | "saida";
  quantity: number;
  reason: string;
  note: string;
  created_at: string;
};
export type Data = {
  companies: Company[];
  locations: Location[];
  categories: Category[];
  products: Product[];
  balances: Balance[];
  movements: Movement[];
};
export const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
export const number = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
export const uid = () => crypto.randomUUID();
export function seed(): Data {
  const tenant_id = "demo-mercado";
  const categories = [
    "Alimentos",
    "Bebidas",
    "Laticínios",
    "Higiene",
    "Limpeza",
    "Hortifruti",
  ].map((name, i) => ({
    id: "c" + i,
    tenant_id,
    name,
    color: ["#179c72", "#679ae5", "#efb85e", "#b498d9", "#df96a7", "#80ae5e"][
      i
    ],
  }));
  const rows: [string, string, number, number, number, number, number][] = [
    ["Arroz branco Tio João 5kg", "7893500020014", 0, 22.9, 29.9, 20, 8],
    ["Leite integral Italac 1L", "7898080640013", 2, 4.2, 5.99, 24, 12],
    ["Café Pilão tradicional 500g", "7896089012345", 0, 18.5, 24.9, 15, 0],
    ["Óleo de soja Soya 900ml", "7891107100019", 0, 5.4, 7.99, 20, 6],
    ["Açúcar refinado União 1kg", "7891910000197", 0, 3.2, 4.99, 15, 10],
    ["Feijão carioca Camil 1kg", "7896006744113", 0, 6.8, 9.49, 20, 64],
    ["Coca-Cola original 2L", "7894900011517", 1, 7.4, 10.99, 24, 82],
    ["Detergente Ypê neutro 500ml", "7896098900013", 4, 1.5, 2.79, 20, 48],
    ["Sabonete Dove original 90g", "7891150033210", 3, 2.9, 4.79, 12, 36],
    ["Banana prata (kg)", "2000000000012", 5, 3.8, 6.99, 10, 32],
    ["Água mineral Crystal 500ml", "7894900531008", 1, 1.1, 2.5, 24, 120],
    ["Manteiga Qualy 500g", "7893000394110", 2, 6.7, 9.99, 12, 28],
  ];
  const products = rows.map((r, i) => ({
    id: "p" + i,
    tenant_id,
    name: r[0],
    barcode: r[1],
    category_id: "c" + r[2],
    unit: i === 9 ? "kg" : "un",
    cost_price: r[3],
    sale_price: r[4],
    min_quantity: r[5],
    active: true,
  }));
  const locations = [
    {
      id: "l1",
      tenant_id,
      name: "Loja Centro",
      type: "Loja",
      address: "Rua das Flores, 125 · Centro",
    },
    {
      id: "l2",
      tenant_id,
      name: "Depósito principal",
      type: "Depósito",
      address: "Rua das Flores, 130 · Centro",
    },
  ];
  const balances = products.flatMap((p, i) =>
    locations.map((l, j) => ({
      tenant_id,
      product_id: p.id,
      location_id: l.id,
      quantity: j ? rows[i][6] + 25 : rows[i][6],
    })),
  );
  const movements: Movement[] = [];
  for (let day = 0; day < 60; day++)
    for (let i = 0; i < products.length; i++) {
      const d = new Date();
      d.setDate(d.getDate() - day);
      d.setHours(9 + (i % 9), 15, 0, 0);
      movements.push({
        id: "m" + day + "-" + i,
        tenant_id,
        product_id: "p" + i,
        location_id: "l1",
        type: i % 4 === day % 4 ? "entrada" : "saida",
        quantity: ((i * 3 + day * 7) % 14) + 1,
        reason: i % 4 === day % 4 ? "Compra" : "Venda",
        note: "Movimentação de demonstração",
        created_at: d.toISOString(),
      });
    }
  // Reconstituir saldos iniciais para que o histórico feche com o saldo atual.
  for (const p of products) {
    let prior = balances.find(
      (b) => b.product_id === p.id && b.location_id === "l1",
    )!.quantity;
    for (const m of movements.filter((m) => m.product_id === p.id)) {
      if (m.type === "entrada" && prior < m.quantity) {
        m.type = "saida";
        m.reason = "Venda";
      }
      prior += m.type === "saida" ? m.quantity : -m.quantity;
    }
    const date = new Date();
    date.setDate(date.getDate() - 61);
    for (const l of locations) {
      const quantity =
        l.id === "l1"
          ? prior
          : balances.find(
              (b) => b.product_id === p.id && b.location_id === l.id,
            )!.quantity;
      if (quantity > 0)
        movements.push({
          id: "opening-" + p.id + "-" + l.id,
          tenant_id,
          product_id: p.id,
          location_id: l.id,
          type: "entrada",
          quantity,
          reason: "Ajuste inicial",
          note: "Saldo inicial de demonstração",
          created_at: date.toISOString(),
        });
    }
  }
  return {
    companies: [{ id: tenant_id, name: "Mercadinho Boa Vizinhança" }],
    locations,
    categories,
    products,
    balances,
    movements,
  };
}
export function analyze(
  question: string,
  data: Data,
  tenant: string,
  location: string,
) {
  const ps = data.products.filter((p) => p.tenant_id === tenant && p.active);
  const qty = (id: string) =>
    data.balances
      .filter(
        (b) => b.product_id === id && (!location || b.location_id === location),
      )
      .reduce((s, b) => s + Number(b.quantity), 0);
  const q = question.toLowerCase();
  if (/vend|saíd|said/.test(q)) {
    const now = new Date(),
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end = new Date(now.getFullYear(), now.getMonth(), 1);
    const sales = ps
      .map((p) => ({
        p,
        n: data.movements
          .filter(
            (m) =>
              m.product_id === p.id &&
              m.type === "saida" &&
              m.reason === "Venda" &&
              (!location || m.location_id === location) &&
              new Date(m.created_at) >= start &&
              new Date(m.created_at) < end,
          )
          .reduce((s, m) => s + Number(m.quantity), 0),
      }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
    return (
      `Produtos mais vendidos em ${start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}:\n\n` +
      (sales.length
        ? sales
            .map((x, i) => `${i + 1}. ${x.p.name}: ${number(x.n)} ${x.p.unit}`)
            .join("\n")
        : "Nenhuma venda registrada nesse período.") +
      "\n\nConsidero apenas saídas com motivo Venda na unidade selecionada."
    );
  }
  if (/valor|custo|capital/.test(q))
    return `O valor do estoque a preço de custo é ${money(ps.reduce((s, p) => s + qty(p.id) * Number(p.cost_price), 0))}. O valor potencial a preço de venda é ${money(ps.reduce((s, p) => s + qty(p.id) * Number(p.sale_price), 0))}. Este segundo valor não representa lucro realizado.`;
  if (/reabaste|baix|zer|compr|repor|reposi|estoque/.test(q)) {
    const low = ps
      .filter((p) => qty(p.id) <= p.min_quantity)
      .sort((a, b) => qty(a.id) - qty(b.id));
    return low.length
      ? `Encontrei ${low.length} produtos que precisam de atenção:\n\n` +
          low
            .map(
              (p) =>
                `• ${p.name}: ${number(qty(p.id))} ${p.unit} em estoque. Sugestão: repor ${number(Math.max(1, p.min_quantity * 2 - qty(p.id)))} ${p.unit}.`,
            )
            .join("\n") +
          "\n\nA sugestão busca atingir duas vezes o estoque mínimo cadastrado; ajuste conforme a demanda e o prazo do fornecedor."
      : "Tudo certo! Nenhum produto está abaixo ou no limite mínimo nesta unidade.";
  }
  return "Posso consultar os dados da unidade selecionada. Pergunte quais produtos reabastecer, quais foram os mais vendidos no último mês ou qual é o valor do estoque.";
}
