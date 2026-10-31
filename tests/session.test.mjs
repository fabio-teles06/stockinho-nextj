import test from "node:test";
import assert from "node:assert/strict";
import { needsSessionRefresh, SESSION_MAX_AGE } from "../lib/stock/session-policy.ts";

const now = 1800000000000;
const token = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

test("renova sessão sem token de acesso, expirado ou próximo da expiração", () => {
  for (const access of [undefined, "invalid", token({}), token({ exp: now / 1000 - 1 }), token({ exp: now / 1000 + 30 })]) {
    assert.equal(needsSessionRefresh(access, now), true);
  }
});
test("mantém token válido e cookie persistente por 30 dias", () => {
  assert.equal(needsSessionRefresh(token({ exp: now / 1000 + 3600 }), now), false);
  assert.equal(SESSION_MAX_AGE, 2592000);
});
