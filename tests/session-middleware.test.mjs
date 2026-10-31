import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const nextServerUrl = pathToFileURL(require.resolve("next/server")).href;
const source = (await readFile(new URL("../middleware.ts", import.meta.url), "utf8"))
  .replace('"next/server"', JSON.stringify(nextServerUrl))
  .replace('"./lib/stock/session-policy"', JSON.stringify(new URL("../lib/stock/session-policy.ts", import.meta.url).href));
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { middleware } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const { NextRequest } = await import(nextServerUrl);

test("renova os cookies para a página atual e persiste a sessão no navegador", async (context) => {
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).refresh_token, "refresh-original");
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
  });
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://auth.example.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  context.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  });
  const request = new NextRequest("https://stockinho.test/painel", { headers: { cookie: "sk_refresh=refresh-original" } });
  const response = await middleware(request);
  assert.equal(response.cookies.get("sk_access").value, "new-access");
  assert.equal(response.cookies.get("sk_refresh").maxAge, 2592000);
  assert.match(response.headers.get("x-middleware-request-cookie"), /sk_access=new-access/);
  assert.match(response.headers.get("x-middleware-request-cookie"), /sk_refresh=new-refresh/);
  context.mock.method(globalThis, "fetch", async () => Response.json({ message: "Unavailable" }, { status: 503 }));
  const failed = await middleware(new NextRequest("https://stockinho.test/painel", { headers: { cookie: "sk_refresh=refresh-original" } }));
  assert.equal(failed.headers.get("set-cookie"), null);
});
