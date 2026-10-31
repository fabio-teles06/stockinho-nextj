// Authenticated HTTP integration against the built application and an ephemeral PostgreSQL.
// The local adapter emulates only the Supabase transport/auth boundary; stock rules run in SQL.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
for (const file of [
  "schema.sql",
  "migrations/20261030_billing.sql",
  "migrations/20261031_stock_operations.sql",
  "migrations/20261031_stock_reports.sql",
  "migrations/20261031_stock_usage.sql",
])
  await db.exec(
    await readFile(new URL("../database/" + file, import.meta.url), "utf8"),
  );
await db.exec(
  "grant usage on schema public to service_role;grant all on all tables in schema public to service_role;",
);
const actor = crypto.randomUUID(),
  other = crypto.randomUUID();
await db.query(
  "insert into auth.users values($1,'http@test.local',now()),($2,'other@test.local',now())",
  [actor, other],
);
async function scalar(sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0];
}
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
const tenant = await scalar(
  "select public.stockinho_create_company('Integração HTTP')",
);
const location = await scalar(
  "insert into public.sk_locations(tenant_id,name,type) values($1,'Loja de teste','Loja') returning id",
  [tenant],
);
const category = await scalar(
  "insert into public.sk_categories(tenant_id,name) values($1,'Alimentos') returning id",
  [tenant],
);
const product = await scalar(
  "insert into public.sk_products(tenant_id,category_id,name,unit,barcode) values($1,$2,'Café HTTP','un','7891234567895') returning id",
  [tenant, category],
);
await db.query(
  "update public.sk_billing_subscriptions set plan_id=(select id from public.sk_billing_plans where code='pro') where organization_id=$1",
  [tenant],
);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
const otherTenant = await scalar(
  "select public.stockinho_create_company('Outra empresa HTTP')",
);
const otherLocation = await scalar(
  "insert into public.sk_locations(tenant_id,name,type) values($1,'Outra loja','Loja') returning id",
  [otherTenant],
);
const otherCategory = await scalar(
  "insert into public.sk_categories(tenant_id,name) values($1,'Outra categoria') returning id",
  [otherTenant],
);
const otherProduct = await scalar(
  "insert into public.sk_products(tenant_id,category_id,name,unit) values($1,$2,'Produto privado','un') returning id",
  [otherTenant, otherCategory],
);
const jwt = (id) =>
  Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".local-test-only";
const access = jwt(actor),
  otherAccess = jwt(other);
const tables = new Set([
  "sk_companies",
  "sk_memberships",
  "sk_locations",
  "sk_categories",
  "sk_products",
  "sk_balances",
  "sk_movements",
  "sk_suppliers",
  "sk_supplier_products",
  "sk_inventories",
  "sk_inventory_items",
  "sk_purchase_orders",
  "sk_purchase_items",
  "sk_batches",
  "sk_billing_plans",
  "sk_billing_settings",
  "sk_billing_subscriptions",
  "sk_billing_payments",
]);
const rpc = {
  stockinho_list_members: ["p_tenant"],
  stockinho_operate: ["p_tenant", "p_action", "p_key", "p_data"],
  stockinho_entitlements: ["p_tenant"],
  stockinho_finance: ["p_tenant", "p_location", "p_from", "p_to"],
  stockinho_assistant_context: ["p_tenant", "p_location"],
  stockinho_ai_usage: ["p_tenant", "p_actor", "p_key", "p_state"],
};
const adapter = createServer(async (req, res) => {
  const reply = (status, value) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  try {
    const url = new URL(req.url, "http://local.test"),
      auth = req.headers.authorization;
    const user =
      auth === "Bearer " + access
        ? actor
        : auth === "Bearer " + otherAccess
          ? other
          : null;
    const service = auth === "Bearer local-service-test-only";
    if (url.pathname === "/auth/v1/user") {
      reply(
        user ? 200 : 401,
        user
          ? {
              id: user,
              email: user === actor ? "http@test.local" : "other@test.local",
            }
          : { error: "Sessão inválida" },
      );
      return;
    }
    if (!user && !service) {
      reply(401, { message: "Não autenticado" });
      return;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    const value = await db.transaction(async (tx) => {
      await tx.exec(
        "set local role " + (service ? "service_role" : "authenticated"),
      );
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user || "",
      ]);
      const name = url.pathname.split("/").at(-1);
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        assert.ok(rpc[name], "RPC não permitida no adaptador");
        const columns = rpc[name],
          params = columns.map((k) =>
            typeof body[k] === "object" && body[k] !== null
              ? JSON.stringify(body[k])
              : (body[k] ?? null),
          );
        if (name === "stockinho_list_members")
          return (
            await tx.query(
              "select * from public.stockinho_list_members($1)",
              params,
            )
          ).rows;
        return Object.values(
          (
            await tx.query(
              `select public.${name}(${columns.map((_, i) => "$" + (i + 1)).join(",")})`,
              params,
            )
          ).rows[0],
        )[0];
      }
      assert.ok(tables.has(name), "Tabela não permitida no adaptador");
      assert.equal(req.method, "GET");
      const params = [],
        where = [];
      for (const key of [
        "tenant_id",
        "user_id",
        "id",
        "organization_id",
        "is_active",
        "key",
      ]) {
        const filter = url.searchParams.get(key);
        if (!filter) continue;
        if (filter.startsWith("eq.")) {
          params.push(filter.slice(3));
          where.push(`"${key}"=$${params.length}`);
        } else if (filter.startsWith("in.(") && key === "id") {
          params.push(filter.slice(4, -1).split(","));
          where.push(`id=any($${params.length}::uuid[])`);
        }
      }
      const rows = (
        await tx.query(
          `select * from public.${name}${where.length ? " where " + where.join(" and ") : ""} order by ${name === "sk_billing_settings" ? "key" : "id"} limit 1000 offset ${Math.max(0, Number(url.searchParams.get("offset")) || 0)}`,
          params,
        )
      ).rows;
      if (
        name === "sk_billing_subscriptions" &&
        url.searchParams.get("select")?.includes("sk_billing_plans")
      )
        for (const r of rows)
          r.sk_billing_plans = (
            await tx.query(
              "select * from public.sk_billing_plans where id=$1",
              [r.plan_id],
            )
          ).rows[0];
      return rows;
    });
    reply(200, value);
  } catch (e) {
    reply(400, { message: e.message, code: e.code || "TEST_ADAPTER" });
  }
});
await new Promise((resolve) => adapter.listen(0, "127.0.0.1", resolve));
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  APP_URL: origin,
  NODE_ENV: "production",
  SUPABASE_URL: "http://127.0.0.1:" + adapter.address().port,
  SUPABASE_PUBLISHABLE_KEY: "local-test-only",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-test-only",
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "",
};
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (x) => (logs += x));
server.stderr.on("data", (x) => (logs += x));
async function request(path, body, token = access) {
  return fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin,
      cookie: "sk_access=" + token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function operation(action, data, key = crypto.randomUUID()) {
  const response = await request("/api/stock/operations", {
    tenant_id: tenant,
    key,
    action,
    data,
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value.result;
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  const panel = await request("/painel");
  assert.equal(panel.status, 200);
  assert.match(await panel.text(), /Café HTTP/);
  const payload = {
    product_id: product,
    location_id: location,
    type: "entrada",
    quantity: 10,
    reason: "Compra",
    unit_cost: 2,
  };
  const key = crypto.randomUUID();
  await operation("movement", payload, key);
  await operation("movement", payload, key);
  assert.equal(
    Number(
      await scalar(
        "select quantity from public.sk_balances where tenant_id=$1 and product_id=$2",
        [tenant, product],
      ),
    ),
    10,
  );
  const inventory = await operation("inventory_create", {
    location_id: location,
  });
  await operation("inventory_count", {
    id: inventory.id,
    items: [{ product_id: product, counted: 8 }],
  });
  await operation("inventory_review", { id: inventory.id });
  await operation("inventory_complete", { id: inventory.id });
  const supplier = await operation("supplier_save", {
    name: "Fornecedor HTTP",
  });
  const order = await operation("purchase_create", {
    location_id: location,
    supplier_id: supplier.id,
    items: [{ product_id: product, quantity: 4, unit_cost: 4 }],
  });
  await operation("purchase_confirm", { id: order.id });
  await operation("purchase_receive", {
    id: order.id,
    items: [{ product_id: product, quantity: 2 }],
  });
  const finance = await request(
    `/api/stock/finance?tenant_id=${tenant}&location_id=${location}`,
  );
  assert.equal(finance.status, 200);
  assert.equal((await finance.json()).value, 24);
  const pdf = await request("/api/stock/labels", {
    tenant_id: tenant,
    product_ids: [product],
    copies: 1,
    format: "a4",
    type: "code128",
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.ok(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .equals(Buffer.from("%PDF-")),
  );
  const forbidden = await request("/api/stock/labels", {
    tenant_id: tenant,
    product_ids: [otherProduct],
    copies: 1,
    format: "a4",
    type: "code128",
  });
  assert.equal(forbidden.status, 403);
  const crossTenant = await request(
    "/api/stock/operations?tenant_id=" + tenant,
    undefined,
    otherAccess,
  );
  assert.ok(crossTenant.status >= 400);
  const chat = await request("/api/chat", {
    tenant_id: tenant,
    location_id: location,
    question: "Quanto tenho investido?",
  });
  assert.equal(chat.status, 200);
  const answer = await chat.json();
  assert.equal(answer.mode, "local");
  assert.equal(answer.remaining, 49);
  assert.match(answer.answer, /24,00/);
  const billing = await request("/api/billing?tenant_id=" + tenant);
  assert.equal(billing.status, 200);
  assert.equal((await billing.json()).usage.ai.used, 1);
  await operation("purchase_receive", {
    id: order.id,
    items: [{ product_id: product, quantity: 2 }],
  });
  assert.equal(
    (
      await (
        await request(
          `/api/stock/finance?tenant_id=${tenant}&location_id=${location}`,
        )
      ).json()
    ).value,
    32,
  );
  const invalid = await request("/api/stock/operations", {
    tenant_id: tenant,
    key: crypto.randomUUID(),
    action: "transfer",
    data: {
      product_id: product,
      location_id: location,
      destination_id: otherLocation,
      quantity: -1,
    },
  });
  assert.equal(invalid.status, 400);
  console.log(
    "PASS: HTTP autenticado, SSR do painel, idempotência, inventário, compras parciais, financeiro, PDF, isolamento, validação, chat local e cota com PostgreSQL efêmero.",
  );
  if (process.argv.includes("--serve")) {
    console.log(JSON.stringify({ origin, access, tenant, location }));
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => adapter.close(resolve));
  await db.close();
}
