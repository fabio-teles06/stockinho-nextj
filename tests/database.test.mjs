import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
);
await db.exec(`create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;`);
await db.exec(
  await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
);
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
await db.query(
  "insert into auth.users values($1,$2,now()),($3,$4,now()),($5,$6,now())",
  [A, "admin@a.test", B, "admin@b.test", C, "operator@a.test"],
);
async function as(id) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar(sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0];
}
async function rejects(sql, params, pattern) {
  await assert.rejects(() => db.query(sql, params), pattern);
}
await as(A);
const ta = await scalar("select public.stockinho_create_company('Mercado A')");
const ca = await scalar(
  "insert into public.sk_categories(tenant_id,name) values($1,'Alimentos') returning id",
  [ta],
);
const la = await scalar(
  "insert into public.sk_locations(tenant_id,name,type) values($1,'Loja A','Loja') returning id",
  [ta],
);
const ld = await scalar(
  "insert into public.sk_locations(tenant_id,name,type) values($1,'Depósito A','Depósito') returning id",
  [ta],
);
const pa = await scalar(
  "insert into public.sk_products(tenant_id,category_id,name,unit) values($1,$2,'Arroz','un') returning id",
  [ta, ca],
);
const move = "select public.stockinho_move($1,$2,$3,$4,$5,$6,$7)";
await db.query(move, [ta, pa, la, "entrada", 10, "Compra", ""]);
await rejects(
  move,
  [ta, pa, la, "saida", 11, "Venda", ""],
  /Estoque insuficiente/,
);
assert.equal(
  Number(
    await scalar(
      "select quantity from public.sk_balances where product_id=$1 and location_id=$2",
      [pa, la],
    ),
  ),
  10,
);
await rejects(
  move,
  [ta, pa, ld, "saida", 1, "Venda", ""],
  /Estoque insuficiente/,
);
await rejects(
  "update public.sk_products set active=false where id=$1",
  [pa],
  /ainda possui saldo/,
);
await rejects(
  "delete from public.sk_categories where id=$1",
  [ca],
  /foreign key/,
);
await rejects(
  "update public.sk_balances set quantity=99 where product_id=$1",
  [pa],
  /permission denied/,
);
await rejects(
  "delete from public.sk_movements where product_id=$1",
  [pa],
  /permission denied/,
);
await db.query("select public.stockinho_add_member($1,$2,$3)", [
  ta,
  "operator@a.test",
  "operator",
]);
await as(C);
await rejects(
  "insert into public.sk_categories(tenant_id,name) values($1,$2)",
  [ta, "Não permitido"],
  /row-level security/,
);
await rejects(
  "insert into public.sk_memberships(tenant_id,user_id,role) values($1,$2,$3)",
  [ta, C, "admin"],
  /permission denied/,
);
await db.query(move, [ta, pa, la, "saida", 3, "Venda", ""]);
assert.equal(
  Number(
    await scalar(
      "select quantity from public.sk_balances where product_id=$1",
      [pa],
    ),
  ),
  7,
);
await as(B);
const tb = await scalar("select public.stockinho_create_company('Mercado B')");
assert.equal(
  Number(
    await scalar("select count(*) from public.sk_products where tenant_id=$1", [
      ta,
    ]),
  ),
  0,
);
assert.equal(
  Number(
    await scalar("select count(*) from public.sk_companies where id=$1", [ta]),
  ),
  0,
);
await rejects(
  move,
  [ta, pa, la, "entrada", 5, "Compra", ""],
  /Empresa não autorizada/,
);
await rejects(
  "insert into public.sk_products(tenant_id,category_id,name,unit) values($1,$2,$3,$4)",
  [tb, ca, "Cross tenant", "un"],
  /foreign key/,
);
await as(A);
assert.equal(
  Number(
    await scalar(
      "select count(*) from public.sk_movements where tenant_id=$1",
      [ta],
    ),
  ),
  2,
);
await db.query(move, [ta, pa, la, "saida", 7, "Venda", ""]);
await db.query("update public.sk_products set active=false where id=$1", [pa]);
await rejects(move, [ta, pa, la, "entrada", 1, "Compra", ""], /arquivado/);
console.log(
  "PASS: esquema SQL, RLS entre empresas, papéis, estoque por unidade, saldo negativo, imutabilidade, FK composta e arquivamento.",
);
await db.exec("reset role");
await db.exec(await readFile(new URL("../database/migrations/20261031_company_and_member_removal.sql", import.meta.url), "utf8"));
await as(B);
await rejects("select public.stockinho_delete_company($1)", [ta], /Apenas administradores/);
await as(A);
const ownMembership = await scalar("select id from public.sk_memberships where tenant_id=$1 and user_id=$2", [ta, A]);
await rejects("select public.stockinho_remove_member($1,$2)", [ta, ownMembership], /próprio acesso/);
await db.query("select public.stockinho_add_member($1,$2,$3)", [ta, "operator@a.test", "operator"]);
const memberRows = (await db.query("select * from public.stockinho_list_members($1)", [ta])).rows;
const operatorMembership = memberRows.find((member) => member.user_id === C).id;
await as(C);
await rejects("select public.stockinho_delete_company($1)", [ta], /Apenas administradores/);
await rejects("select public.stockinho_remove_member($1,$2)", [ta, ownMembership], /Apenas administradores/);
await as(A);
await rejects("select public.stockinho_remove_member($1,$2)", [tb, operatorMembership], /Apenas administradores/);
await db.query("select public.stockinho_remove_member($1,$2)", [ta, operatorMembership]);
await as(C);
assert.equal(Number(await scalar("select count(*) from public.sk_companies where id=$1", [ta])), 0);
await as(A);
await db.exec("reset role");
await db.exec("create table public.sk_billing_subscriptions(organization_id uuid references public.sk_companies(id) on delete cascade,provider_subscription_id text,status text)");
await db.query("insert into public.sk_billing_subscriptions values($1,'sub_test','active')", [ta]);
await as(A);
await rejects("select public.stockinho_delete_company($1)", [ta], /Cancele a assinatura/);
await db.exec("reset role");
await db.query("update public.sk_billing_subscriptions set status='canceled' where organization_id=$1", [ta]);
await as(A);
await db.query("select public.stockinho_delete_company($1)", [ta]);
await db.exec("reset role");
assert.equal(Number(await scalar("select count(*) from public.sk_companies where id=$1", [ta])), 0);
assert.equal(Number(await scalar("select count(*) from public.sk_products where tenant_id=$1", [ta])), 0);
assert.equal(Number(await scalar("select count(*) from public.sk_companies where id=$1", [tb])), 1);
console.log("PASS: remoção de membros, revogação de acesso, proteção do administrador e exclusão isolada de empresas com histórico.");
await db.exec("reset role; create role service_role");
await db.exec(await readFile(new URL("../database/migrations/20261031_account_profiles.sql", import.meta.url), "utf8"));
await db.query("insert into public.sk_account_profiles(user_id,name,email,cpf_cnpj) values($1,'Maria Silva','maria@example.com','12345678901')", [A]);
await as(B);
await rejects("select * from public.sk_account_profiles", [], /permission denied/);
await rejects("insert into public.sk_account_profiles(user_id,name,email,cpf_cnpj) values($1,'Outro','outro@example.com','12345678901')", [B], /permission denied/);
console.log("PASS: dados pessoais da conta protegidos contra acesso direto de outros usuários.");
await db.close();
