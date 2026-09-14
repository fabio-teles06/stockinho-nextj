import test from "node:test";
import assert from "node:assert/strict";
import { seed, analyze } from "../modules/stock/model.ts";
test("o histórico da demonstração fecha com os saldos, sem saldos negativos", () => {
  const d = seed();
  for (const b of d.balances) {
    let qty = 0;
    for (const m of d.movements
      .filter(
        (m) => m.product_id === b.product_id && m.location_id === b.location_id,
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      qty += m.type === "entrada" ? m.quantity : -m.quantity;
      assert.ok(qty >= 0, "saldo negativo em " + b.product_id);
    }
    assert.equal(qty, b.quantity);
  }
});
test("reposição considera somente a unidade selecionada", () => {
  const d = seed();
  assert.match(
    analyze("Quais produtos devo reabastecer?", d, "demo-mercado", "l1"),
    /Café Pilão/,
  );
  assert.match(
    analyze("Quais produtos devo reabastecer?", d, "demo-mercado", "l2"),
    /Nenhum produto/,
  );
});
test("ranking usa mês anterior e exclui perdas, entradas e outras unidades", () => {
  const d = seed(),
    now = new Date(),
    date = new Date(now.getFullYear(), now.getMonth() - 1, 10).toISOString();
  d.movements = [
    {
      id: "t",
      tenant_id: "demo-mercado",
      product_id: "p0",
      location_id: "l1",
      type: "saida",
      quantity: 3,
      reason: "Venda",
      note: "",
      created_at: date,
    },
    {
      id: "x",
      tenant_id: "demo-mercado",
      product_id: "p1",
      location_id: "l1",
      type: "saida",
      quantity: 99,
      reason: "Perda",
      note: "",
      created_at: date,
    },
    {
      id: "z",
      tenant_id: "demo-mercado",
      product_id: "p2",
      location_id: "l2",
      type: "saida",
      quantity: 99,
      reason: "Venda",
      note: "",
      created_at: date,
    },
  ];
  const a = analyze("Quais mais vendem?", d, "demo-mercado", "l1");
  assert.match(a, /Arroz branco Tio João 5kg: 3 un/);
  assert.doesNotMatch(a, /Leite|Café/);
});
test("empresa sem produtos não recebe dados de outra empresa", () => {
  assert.match(
    analyze("reabastecer", seed(), "another-tenant", "l1"),
    /Nenhum produto/,
  );
});
