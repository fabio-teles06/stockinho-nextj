import { cookies } from "next/headers";
import { isAllowedOrigin } from "./origin";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function config() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiError(
      "A conexão com o Supabase ainda não foi configurada.",
      503,
    );
  return { url, key };
}
export async function supa(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<any> {
  const { url, key } = config();
  let r: Response;

  try {
    r = await fetch(url + path, {
      ...init,
      headers: {
        apikey: key,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    const cause = (error as {
      cause?: { code?: string; message?: string };
    }).cause;
  
    console.error("[supabase] Falha de conexão", {
      code: cause?.code,
      message: cause?.message,
    });
  
    throw new ApiError(
      "Não foi possível conectar ao Supabase. Tente novamente.",
      503,
    );
  }
}
export async function session() {
  const jar = await cookies();
  let token = jar.get("sk_access")?.value;
  const refresh = jar.get("sk_refresh")?.value;
  if (!token && refresh) {
    try {
      const s = await supa(
        "/auth/v1/token?grant_type=refresh_token",
        config().key,
        { method: "POST", body: JSON.stringify({ refresh_token: refresh }) },
      );
      await saveSession(s);
      token = s.access_token;
    } catch {
      throw new ApiError("Sua sessão expirou. Entre novamente.", 401);
    }
  }
  if (!token) throw new ApiError("Entre na sua conta para continuar.", 401);
  try {
    const user = await supa("/auth/v1/user", token);
    return { token, user };
  } catch (e) {
    if (!refresh) throw new ApiError("Sessão inválida.", 401);
    try {
      const s = await supa(
        "/auth/v1/token?grant_type=refresh_token",
        config().key,
        { method: "POST", body: JSON.stringify({ refresh_token: refresh }) },
      );
      await saveSession(s);
      return {
        token: s.access_token,
        user: await supa("/auth/v1/user", s.access_token),
      };
    } catch {
      throw new ApiError("Sua sessão expirou. Entre novamente.", 401);
    }
  }
}
export async function saveSession(s: any) {
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  jar.set("sk_access", s.access_token, {
    ...opts,
    maxAge: s.expires_in || 3600,
  });
  jar.set("sk_refresh", s.refresh_token, {
    ...opts,
    maxAge: 60 * 60 * 24 * 30,
  });
}
export function sameOrigin(req: Request) {
  const allowed = isAllowedOrigin(req, process.env.APP_URL);

  if (!allowed) {
    console.warn("[auth] Origem rejeitada", {
      receivedOrigin: req.headers.get("origin"),
      configuredAppUrl: process.env.APP_URL ?? "(não configurada)",
      requestUrl: req.url,
    });

    throw new ApiError("Origem da requisição inválida.", 403);
  }
}
export async function allRows(table: string, token: string) {
  let rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supa(
      "/rest/v1/" +
        table +
        "?select=*&order=id&offset=" +
        offset +
        "&limit=1000",
      token,
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
    if (rows.length >= 100000)
      throw new ApiError(
        "O volume de dados excedeu o limite desta consulta. Contate o administrador.",
        413,
      );
  }
}
export async function snapshot(token: string) {
  const [companies, locations, categories, products, balances, movements] =
    await Promise.all(
      [
        "sk_companies",
        "sk_locations",
        "sk_categories",
        "sk_products",
        "sk_balances",
        "sk_movements",
      ].map((t) => allRows(t, token)),
    );
  return { companies, locations, categories, products, balances, movements };
}
export function failure(e: any) {
  return Response.json(
    { error: e.message || "Erro inesperado." },
    { status: e.status || 500, headers: { "Cache-Control": "no-store" } },
  );
}
