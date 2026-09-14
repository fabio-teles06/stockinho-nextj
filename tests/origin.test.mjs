import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from '../lib/stock/origin.ts';
test('aceita a origem pública mesmo atrás do proxy Railway', () => {
  const req = new Request('http://localhost:3000/api/auth', {headers: {origin: 'https://stockinho.example.com'}});
  assert.equal(isAllowedOrigin(req, 'https://stockinho.example.com'), true);
});
test('rejeita outra origem mesmo quando o host encaminhado foi falsificado', () => {
  const req = new Request('http://localhost:3000/api/stock', {headers: {origin: 'https://evil.example', 'x-forwarded-host': 'evil.example'}});
  assert.equal(isAllowedOrigin(req, 'https://stockinho.example.com'), false);
});
test('continua aceitando o desenvolvimento local', () => {
  assert.equal(isAllowedOrigin(new Request('http://localhost:3000/api/auth', {headers: {origin: 'http://localhost:3000'}})), true);
});
