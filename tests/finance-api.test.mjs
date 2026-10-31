import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const moduleURL = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const transpile = (source) => moduleURL(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const serverSource = (await readFile(new URL("../lib/stock/server.ts", import.meta.url), "utf8"))
  .replace('"next/headers"', JSON.stringify(moduleURL(`export async function cookies() {
    return { get: (name) => name === 'sk_access' ? { value: 'test-access' } : undefined };
  }`)))
  .replace('"./origin"', JSON.stringify(new URL("../lib/stock/origin.ts", import.meta.url).href))
  .replace('"./session-policy"', JSON.stringify(new URL("../lib/stock/session-policy.ts", import.meta.url).href));
const serverURL = transpile(serverSource);
const { ApiError, supa } = await import(serverURL);
const require = createRequire(import.meta.url);
const routeSource = (await readFile(new URL("../app/api/stock/finance/route.ts", import.meta.url), "utf8"))
  .replace('"@/lib/stock/server"', JSON.stringify(serverURL))
  .replace('"zod"', JSON.stringify(pathToFileURL(require.resolve("zod")).href));
const { GET } = await import(transpile(routeSource));
const request = () => new Request(`https://stockinho.test/api/stock/finance?tenant_id=${crypto.randomUUID()}&location_id=${crypto.randomUUID()}`);

function configure(context, rpcResponse) {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  };
  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  context.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  context.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: "test-user" });
    return rpcResponse();
  });
}

test("finance API identifies a missing database function without exposing the raw schema error", async (context) => {
  configure(context, () => Response.json({ code: "PGRST202", message: "Could not find the function public.stockinho_finance in the schema cache" }, { status: 404 }));
  await assert.rejects(supa("/rest/v1/rpc/stockinho_finance", "test-access"), (error) => error instanceof ApiError && error.code === "PGRST202");
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).error, /atualização do banco de dados/);
});

test("finance API preserves permission failures and successful financial data", async (context) => {
  configure(context, () => Response.json({ code: "42501", message: "Local não autorizado" }, { status: 403 }));
  const forbidden = await GET(request());
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error, "Local não autorizado");
  configure(context, () => Response.json({ value: 42, pro: false }));
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { value: 42, pro: false });
});
