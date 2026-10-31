import test from "node:test";
import assert from "node:assert/strict";
import { accountSchema } from "../lib/billing/account.ts";

test("normaliza os dados da conta usados na cobrança", () => {
  assert.deepEqual(accountSchema.parse({ name: "  Maria Silva  ", email: " maria@example.com ", cpf_cnpj: "123.456.789-01", user_id: "outro-usuario" }), {
    name: "Maria Silva", email: "maria@example.com", cpf_cnpj: "12345678901",
  });
  assert.equal(accountSchema.parse({ name: "Empresa", email: "contato@example.com", cpf_cnpj: "12.345.678/0001-90" }).cpf_cnpj, "12345678000190");
});

test("exige dados completos antes da contratação", () => {
  for (const profile of [undefined, {}, { name: "Maria", email: "inválido", cpf_cnpj: "12345678901" }, { name: "Maria", email: "maria@example.com", cpf_cnpj: "123" }]) {
    assert.equal(accountSchema.safeParse(profile).success, false);
  }
});
