import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError, config, supa } from "@/lib/stock/server";

export type JsonRecord = Record<string, unknown>;
export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  billing_cycle: string;
  product_limit: number;
  user_limit: number;
  location_limit: number;
  ai_monthly_limit: number;
  features: JsonRecord;
  is_active: boolean;
};

export function billingConfig() {
  const apiKey = process.env.ASAAS_API_KEY;
  const environment = process.env.ASAAS_ENVIRONMENT === "production"
    ? "production"
    : "sandbox";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !serviceRole) {
    throw new ApiError(
      "A cobrança ainda não foi configurada no servidor.",
      503,
    );
  }
  return {
    apiKey,
    serviceRole,
    baseUrl: environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3",
  };
}

export async function billingSupa(
  path: string,
  init: RequestInit = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // Supabase REST responses are intentionally decoded at the route boundary.
  const { url } = config();
  const serviceRole = billingConfig().serviceRole;
  const response = await fetch(url + path, {
    ...init,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error("[billing] Supabase request failed", {
      path,
      status: response.status,
      message: body?.message,
    });
    throw new ApiError("Não foi possível consultar os dados de cobrança.", 502);
  }
  return body;
}

export async function asaas(
  path: string,
  init: RequestInit = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { apiKey, baseUrl } = billingConfig();
  let response: Response;
  try {
    response = await fetch(baseUrl + path, {
      ...init,
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError("O provedor de pagamentos está indisponível.", 503);
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error("[billing] Asaas request failed", {
      path,
      status: response.status,
      errors: body?.errors?.map((error: JsonRecord) => error.description),
    });
    throw new ApiError(
      "Não foi possível concluir a operação de cobrança.",
      response.status >= 500 ? 503 : 400,
    );
  }
  return body;
}

export function sameSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function billingIdempotencyKey(organizationId: string, planCode: string) {
  return createHash("sha256")
    .update(`${organizationId}:${planCode}`)
    .digest("hex");
}

export async function assertAdmin(token: string, userId: string, tenantId: string) {
  const rows = await supa(
    `/rest/v1/sk_memberships?tenant_id=eq.${tenantId}&user_id=eq.${userId}&select=role`,
    token,
  );
  if (rows[0]?.role !== "admin") {
    throw new ApiError("Apenas administradores podem gerenciar a assinatura.", 403);
  }
}
