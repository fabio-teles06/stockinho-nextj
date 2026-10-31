import test from "node:test";
import assert from "node:assert/strict";
import { addCartItem } from "../modules/stock/cart.ts";

test("scanning the same product increments one cart line without modifying previous state", () => {
  const first = addCartItem([], "product-1", 3);
  const second = addCartItem(first, "product-1", 3);
  assert.deepEqual(first, [{ product_id: "product-1", quantity: 1 }]);
  assert.deepEqual(second, [{ product_id: "product-1", quantity: 2 }]);
  assert.deepEqual(addCartItem(second, "product-2", 2), [...second, { product_id: "product-2", quantity: 1 }]);
});

test("scanning refuses unavailable stock and cart quantities already at the local stock limit", () => {
  for (const available of [0, -1, NaN, Infinity]) assert.throws(() => addCartItem([], "product-1", available), /sem estoque/);
  const items = [{ product_id: "product-1", quantity: 2 }];
  assert.throws(() => addCartItem(items, "product-1", 2), /já está no carrinho/);
  assert.throws(() => addCartItem(items, "product-1", 1), /já está no carrinho/);
  assert.deepEqual(items, [{ product_id: "product-1", quantity: 2 }]);
});

test("cart additions preserve fractional stock limits", () => {
  const items = addCartItem([], "product-1", 0.5);
  assert.equal(items[0].quantity, 0.5);
  assert.throws(() => addCartItem(items, "product-1", 0.5), /já está no carrinho/);
  assert.equal(addCartItem([{ product_id: "product-1", quantity: 1 }], "product-1", 1.25)[0].quantity, 1.25);
});
