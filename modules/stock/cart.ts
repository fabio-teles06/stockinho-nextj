export type CartItem = { product_id: string; quantity: number };

export function addCartItem(items: CartItem[], productId: string, available: number): CartItem[] {
  if (!Number.isFinite(available) || available <= 0)
    throw new Error("Este produto está sem estoque nesta unidade.");
  const existing = items.find((item) => item.product_id === productId);
  if (existing && existing.quantity >= available)
    throw new Error("Toda a quantidade disponível deste produto já está no carrinho.");
  const quantity = Math.min((existing?.quantity || 0) + 1, available);
  return existing
    ? items.map((item) => item.product_id === productId ? { ...item, quantity } : item)
    : [...items, { product_id: productId, quantity }];
}
