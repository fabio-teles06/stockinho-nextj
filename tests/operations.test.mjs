import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
process.on("uncaughtException", (e) => {
  console.error(e.message, e.where || "", e.position || "");
  process.exit(1);
});

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;`);
for (const file of [
  "schema.sql",
  "migrations/20261030_billing.sql",
  "migrations/20261031_stock_operations.sql",
  "migrations/20261031_stock_reports.sql",
  "migrations/20261031_stock_usage.sql",
]) {
  await db.exec(
    await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
  );
}
// Migration can be reapplied without duplicating data or resetting prices.
await db.exec(
  await readFile(
    new URL(
      "../database/migrations/20261031_stock_operations.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const A = crypto.randomUUID(),
  B = crypto.randomUUID(),
  O = crypto.randomUUID();
await db.query(
  "insert into auth.users values($1,'a@test.com',now()),($2,'b@test.com',now()),($3,'operator@test.com',now())",
  [A, B, O],
);
async function as(id) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function op(action, data, key = crypto.randomUUID(), tenant = t) {
  return scalar("select public.stockinho_operate($1,$2,$3,$4)", [
    tenant,
    action,
    key,
    JSON.stringify(data),
  ]);
}
async function qty(product = p, location = l) {
  return Number(
    await scalar(
      "select quantity from public.sk_balances where product_id=$1 and location_id=$2",
      [product, location],
    ),
  );
}
await as(A);
const t = await scalar("select public.stockinho_create_company('Empresa A')");
const l = await scalar(
  "insert into public.sk_locations(tenant_id,name,type) values($1,'Loja','Loja') returning id",
  [t],
);
const c = await scalar(
  "insert into public.sk_categories(tenant_id,name) values($1,'Categoria') returning id",
  [t],
);
const p = await scalar(
  "insert into public.sk_products(tenant_id,category_id,name,unit,cost_price) values($1,$2,'Produto','un',10) returning id",
  [t, c],
);
await assert.rejects(
  () =>
    db.query(
      "insert into public.sk_locations(tenant_id,name,type) values($1,'Excesso','Loja')",
      [t],
    ),
  /Limite de locais/,
);
const payload = {
  product_id: p,
  location_id: l,
  type: "entrada",
  quantity: 10,
  reason: "Compra",
  unit_cost: 10,
};
const key = crypto.randomUUID();
await op("movement", payload, key);
await op("movement", payload, key);
assert.equal(await qty(), 10);
await assert.rejects(
  () => op("movement", { ...payload, quantity: 11 }, key),
  /Chave já utilizada/,
);
await assert.rejects(
  () =>
    op("movement", {
      ...payload,
      type: "saida",
      reason: "Venda",
      quantity: 11,
    }),
  /Estoque insuficiente/,
);
// Inventory equal, positive and negative deltas; completed records immutable.
for (const counted of [10, 12, 8]) {
  const inv = await op("inventory_create", { location_id: l });
  await op("inventory_count", {
    id: inv.id,
    items: [{ product_id: p, counted }],
  });
  await op("inventory_review", { id: inv.id });
  const k = crypto.randomUUID();
  await op("inventory_complete", { id: inv.id }, k);
  await op("inventory_complete", { id: inv.id }, k);
  assert.equal(await qty(), counted);
  await assert.rejects(
    () => op("inventory_complete", { id: inv.id }),
    /encerrado/,
  );
}
const stale = await op("inventory_create", { location_id: l });
await op("inventory_count", {
  id: stale.id,
  items: [{ product_id: p, counted: 8 }],
});
await op("movement", payload);
await op("inventory_review", { id: stale.id });
await assert.rejects(
  () => op("inventory_complete", { id: stale.id }),
  /Houve movimentações/,
);
assert.equal(await qty(), 18);
await op("inventory_cancel", { id: stale.id });
await assert.rejects(
  () => op("supplier_save", { name: "Fornecedor" }),
  /exigem Pro/,
);
const importData = {
  location_id: l,
  conflict: "reject",
  rows: [
    {
      name: "Importado",
      sku: "I1",
      barcode: "01234567",
      category_id: c,
      unit: "un",
      quantity: 2,
    },
  ],
};
const ik = crypto.randomUUID();
await op("import", importData, ik);
await op("import", importData, ik);
await assert.rejects(() => op("import", importData), /uma importação inicial/);
await db.exec("reset role");
await db.query(
  "update public.sk_billing_subscriptions set plan_id=(select id from public.sk_billing_plans where code='pro_founder') where organization_id=$1",
  [t],
);
await as(A);
const l2 = await scalar(
  "insert into public.sk_locations(tenant_id,name,type) values($1,'Depósito','Depósito') returning id",
  [t],
);
const transfer = {
  product_id: p,
  location_id: l,
  destination_id: l2,
  quantity: 3,
};
const tk = crypto.randomUUID();
await op("transfer", transfer, tk);
await op("transfer", transfer, tk);
assert.equal(await qty(), 15);
assert.equal(await qty(p, l2), 3);
await assert.rejects(
  () => op("transfer", { ...transfer, destination_id: l }),
  /diferentes/,
);
await assert.rejects(
  () => op("transfer", { ...transfer, quantity: 99 }),
  /Estoque insuficiente/,
);
assert.equal(await qty(), 15);
const supplier = await op("supplier_save", { name: "Fornecedor" });
const po = await op("purchase_create", {
  location_id: l,
  supplier_id: supplier.id,
  freight: 4,
  items: [{ product_id: p, quantity: 4, unit_cost: 20 }],
});
assert.equal(await qty(), 15);
await assert.rejects(
  () =>
    op("purchase_receive", {
      id: po.id,
      items: [{ product_id: p, quantity: 1 }],
    }),
  /estado/,
);
await op("purchase_create", {
  id: po.id,
  location_id: l,
  supplier_id: supplier.id,
  freight: 4,
  items: [{ product_id: p, quantity: 4, unit_cost: 20 }],
});
await op("purchase_confirm", { id: po.id });
const rk = crypto.randomUUID(),
  receipt = { id: po.id, items: [{ product_id: p, quantity: 2 }] };
await op("purchase_receive", receipt, rk);
await op("purchase_receive", receipt, rk);
assert.equal(await qty(), 17);
await assert.rejects(
  () => op("purchase_cancel", { id: po.id }),
  /não pode ser cancelado/,
);
await assert.rejects(
  () =>
    op("purchase_receive", {
      id: po.id,
      items: [{ product_id: p, quantity: 3 }],
    }),
  /excede/,
);
await op("purchase_receive", receipt);
assert.equal(await qty(), 19);
assert.equal(
  Number(
    await scalar("select cost_price from public.sk_products where id=$1", [p]),
  ),
  12,
);
const bp = await scalar(
  "insert into public.sk_products(tenant_id,category_id,name,unit,track_batches) values($1,$2,'Por lote','un',true) returning id",
  [t, c],
);
const batch = await op("batch_create", {
  product_id: bp,
  location_id: l,
  code: "LOTE1",
  expires_on: "2099-01-01",
});
await assert.rejects(
  () => op("movement", { ...payload, product_id: bp }),
  /Selecione um lote/,
);
await op("movement", {
  ...payload,
  product_id: bp,
  batch_id: batch.id,
  quantity: 5,
});
await op("transfer", {
  ...transfer,
  product_id: bp,
  batch_id: batch.id,
  quantity: 2,
});
assert.equal(await qty(bp, l), 3);
assert.equal(await qty(bp, l2), 2);
assert.equal(
  Number(
    await scalar(
      "select sum(quantity) from public.sk_batches where tenant_id=$1 and product_id=$2",
      [t, bp],
    ),
  ),
  5,
);
await assert.rejects(
  () =>
    op("movement", {
      ...payload,
      product_id: bp,
      batch_id: batch.id,
      type: "saida",
      reason: "Venda",
      quantity: 4,
    }),
  /lote/,
);
const fi = await scalar("select public.stockinho_finance($1,$2,null,null)", [
  t,
  l,
]);
assert.equal(fi.value, 19 * 12 + 2 * 0 + 3 * 10);
assert.ok(fi.history.length > 0);
await assert.rejects(
  () =>
    db.query("select public.stockinho_finance($1,$2,null,null)", [
      t,
      crypto.randomUUID(),
    ]),
  /não autorizado/,
);
const context = await scalar(
  "select public.stockinho_assistant_context($1,$2)",
  [t, l],
);
assert.ok(context.supplier_prices.length > 0);
const precise=await scalar("insert into public.sk_products(tenant_id,category_id,name,unit) values($1,$2,'Precisão decimal','un') returning id",[t,c]);
await op('movement',{...payload,product_id:precise,location_id:l2,quantity:3,unit_cost:0.1});
await op('movement',{...payload,product_id:precise,location_id:l2,quantity:1,unit_cost:0.11});
assert.equal(Number(await scalar('select cost_price from public.sk_products where id=$1',[precise])),0.1025);
assert.equal(Number(await scalar('select round(b.quantity*p.cost_price,2) from public.sk_balances b join public.sk_products p on p.id=b.product_id where p.id=$1',[precise])),0.41);
const atomic = await op("purchase_create", {
  location_id: l,
  supplier_id: supplier.id,
  items: [
    { product_id: p, quantity: 2, unit_cost: 1 },
    { product_id: bp, quantity: 2, unit_cost: 1 },
  ],
});
await op("purchase_confirm", { id: atomic.id });
const priorQty = await qty();
await assert.rejects(
  () =>
    op("purchase_receive", {
      id: atomic.id,
      items: [
        { product_id: p, quantity: 1 },
        { product_id: bp, quantity: 1 },
      ],
    }),
  /null value/,
);
assert.equal(await qty(), priorQty);
assert.equal(
  Number(
    await scalar(
      "select received from public.sk_purchase_items where order_id=$1 and product_id=$2",
      [atomic.id, p],
    ),
  ),
  0,
);
const countBeforeImport = Number(
  await scalar("select count(*) from public.sk_products where tenant_id=$1", [
    t,
  ]),
);
await assert.rejects(
  () =>
    op("import", {
      location_id: l,
      conflict: "reject",
      rows: [
        {
          name: "Transacional",
          unit: "un",
          category_id: c,
          sku: "ATOMIC-IMPORT",
          quantity: 1,
        },
        {
          name: "Inválido",
          unit: "un",
          category_id: crypto.randomUUID(),
          quantity: 1,
        },
      ],
    }),
  /Linha 3/,
);
assert.equal(
  Number(
    await scalar("select count(*) from public.sk_products where tenant_id=$1", [
      t,
    ]),
  ),
  countBeforeImport,
);
await assert.rejects(
  () =>
    op("purchase_create", {
      id: atomic.id,
      location_id: l,
      supplier_id: supplier.id,
      items: [{ product_id: p, quantity: 1, unit_cost: 1 }],
    }),
  /rascunhos/,
);
await assert.rejects(
  () =>
    op("supplier_save", {
      name: "Documento inválido",
      document: "11111111111",
    }),
  /CPF\/CNPJ inválido/,
);
await op("supplier_save", {
  name: "Documento válido",
  document: "52998224725",
});
// Count batch balances separately and retain product/location/batch consistency.
const bi = await op("inventory_create", { location_id: l, product_ids: [bp] });
await op("inventory_count", {
  id: bi.id,
  items: [{ product_id: bp, batch_id: batch.id, counted: 4 }],
});
await op("inventory_review", { id: bi.id });
await op("inventory_complete", { id: bi.id });
assert.equal(await qty(bp, l), 4);
assert.equal(
  Number(
    await scalar("select quantity from public.sk_batches where id=$1", [
      batch.id,
    ]),
  ),
  4,
);
await assert.rejects(
  () => op("barcode_associate", { product_id: bp, barcode: "01234567" }),
  /duplicate key/,
);
const expired = await op("batch_create", {
  product_id: bp,
  location_id: l,
  code: "VENCIDO",
  expires_on: "2000-01-01",
});
await assert.rejects(
  () =>
    op("movement", {
      ...payload,
      product_id: bp,
      batch_id: expired.id,
      quantity: 1,
    }),
  /vencido/,
);
await assert.rejects(
  () =>
    db.query("select public.stockinho_ai_usage($1,$2,$3,'reserve')", [
      t,
      A,
      crypto.randomUUID(),
    ]),
  /permission denied/,
);
await db.exec("reset role;set role service_role");
for (let count = 0; count < 50; count++) {
  const qk = crypto.randomUUID();
  assert.equal(
    Number(
      await scalar("select public.stockinho_ai_usage($1,$2,$3,'reserve')", [
        t,
        A,
        qk,
      ]),
    ),
    49 - count,
  );
  if (count === 0) {
    await scalar("select public.stockinho_ai_usage($1,$2,$3,'refund')", [
      t,
      A,
      qk,
    ]);
    await scalar("select public.stockinho_ai_usage($1,$2,$3,'refund')", [
      t,
      A,
      qk,
    ]);
    const retry = crypto.randomUUID();
    await scalar("select public.stockinho_ai_usage($1,$2,$3,'reserve')", [
      t,
      A,
      retry,
    ]);
  }
}
await assert.rejects(
  () =>
    db.query("select public.stockinho_ai_usage($1,$2,$3,'reserve')", [
      t,
      A,
      crypto.randomUUID(),
    ]),
  /limite mensal/,
);
await as(B);
const tb = await scalar("select public.stockinho_create_company('Empresa B')");
assert.equal(
  Number(
    await scalar(
      "select count(*) from public.sk_suppliers where tenant_id=$1",
      [t],
    ),
  ),
  0,
);
await assert.rejects(() => op("transfer", transfer), /não autorizada/);
await assert.rejects(
  () =>
    db.query("select stockinho_private.stock_operation($1,$2,$3,$4)", [
      t,
      "transfer",
      "{}",
      crypto.randomUUID(),
    ]),
  /permission denied/,
);
await as(A);
await db.query(
  "select public.stockinho_add_member($1,'operator@test.com','operator')",
  [t],
);
await as(O);
await assert.rejects(
  () => op("inventory_create", { location_id: l }),
  /administrador/,
);
await assert.rejects(
  () => op("movement", { ...payload, reason: "Ajuste de inventário" }),
  /administradores/,
);
await op("movement", { ...payload, unit_cost: undefined });
await db.exec("reset role");
await db.query(
  "update public.sk_billing_subscriptions set status='canceled' where organization_id=$1",
  [t],
);
await as(A);
assert.ok(
  Number(
    await scalar("select count(*) from public.sk_batches where tenant_id=$1", [
      t,
    ]),
  ) > 0,
);
await as(O);
assert.ok(
  (await scalar("select public.stockinho_entitlements($1)", [t])).can_write ===
    false,
);
await assert.rejects(
  () => op("movement", { ...payload, unit_cost: undefined }),
  /usuário principal/,
);
await as(A);
await assert.rejects(
  () => op("movement", { ...payload, location_id: l2 }),
  /somente para leitura/,
);
await op("movement", payload);
await assert.rejects(() => op("transfer", transfer), /exigem Pro/);
assert.equal(
  (await scalar("select public.stockinho_entitlements($1)", [t])).pro,
  false,
);
assert.equal(
  (await scalar("select public.stockinho_finance($1,$2,null,null)", [t, l]))
    .categories.length,
  0,
);
await assert.rejects(
  () => db.query("select public.stockinho_assistant_context($1,$2)", [t, l]),
  /não autorizado/,
);
await assert.rejects(
  () =>
    db.query("update public.sk_locations set is_default=false where id=$1", [
      l,
    ]),
  /exige Pro/,
);
await assert.rejects(
  () =>
    db.query("select public.stockinho_add_member($1,'b@test.com','operator')", [
      t,
    ]),
  /Limite de membros/,
);
const activeCount = Number(
  await scalar(
    "select count(*) from public.sk_products where tenant_id=$1 and active",
    [t],
  ),
);
await db.query(
  "insert into public.sk_products(tenant_id,category_id,name,unit) select $1,$2,'Produto '||i,'un' from generate_series(1,$3::integer) i",
  [t, c, 50 - activeCount],
);
await assert.rejects(
  () =>
    db.query(
      "insert into public.sk_products(tenant_id,category_id,name,unit) values($1,$2,'Excesso','un')",
      [t, c],
    ),
  /Limite de produtos/,
);
const before = Number(
  await scalar("select count(*) from public.sk_movements where tenant_id=$1", [
    t,
  ]),
);
await assert.rejects(
  () =>
    op("import", {
      location_id: l,
      conflict: "reject",
      rows: [
        {
          name: "Primeiro inválido por limite",
          unit: "un",
          category_id: c,
          sku: "ATOMIC1",
          quantity: 1,
        },
        {
          name: "Outro",
          unit: "un",
          category_id: c,
          sku: "ATOMIC2",
          quantity: 1,
        },
      ],
    }),
  /uma importação inicial/,
);
assert.equal(
  Number(
    await scalar(
      "select count(*) from public.sk_movements where tenant_id=$1",
      [t],
    ),
  ),
  before,
);
assert.ok(
  Number(
    await scalar(
      "select count(*) from public.sk_audit_events where tenant_id=$1",
      [t],
    ),
  ) > 0,
);
assert.equal(
  Number(
    await scalar(
      "select count(*) from public.sk_audit_events where tenant_id=$1 and (after_data ? 'document' or after_data ? 'email')",
      [t],
    ),
  ),
  0,
);
await db.exec("reset role");
for (const migration of ["stock_operations", "stock_reports", "stock_usage"])
  await db.exec(
    await readFile(
      new URL(
        "../database/migrations/20261031_" + migration + ".sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
assert.equal(
  Number(
    await scalar(
      "select price from public.sk_billing_plans where code='pro_founder'",
    ),
  ),
  19.9,
);
await as(A);
await db.query("select stockinho_private.delete_company($1)", [t]);
await db.exec("reset role");
assert.equal(
  Number(
    await scalar("select count(*) from public.sk_companies where id=$1", [t]),
  ),
  0,
);
assert.equal(
  Number(
    await scalar("select count(*) from public.sk_companies where id=$1", [tb]),
  ),
  1,
);
assert.ok(tb);
console.log(
  "PASS: migration reexecutável, idempotência, inventários, snapshot, importação Free, compras parciais, custo médio, transferências, lotes, RLS, papéis e downgrade.",
);
await db.close();
