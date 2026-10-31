import { NextRequest, NextResponse } from "next/server";
import { needsSessionRefresh, SESSION_MAX_AGE } from "./lib/stock/session-policy";

export async function middleware(request: NextRequest) {
  const access = request.cookies.get("sk_access")?.value;
  const refresh = request.cookies.get("sk_refresh")?.value;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!refresh || !needsSessionRefresh(access) || !url || !key) return NextResponse.next();

  try {
    const result = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const session = await result.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!result.ok || !session.access_token || !session.refresh_token) return NextResponse.next();

    // Forward the renewed cookies to this render as well as to the browser.
    request.cookies.set("sk_access", session.access_token);
    request.cookies.set("sk_refresh", session.refresh_token);
    const response = NextResponse.next({ request: { headers: request.headers } });
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
    response.cookies.set("sk_access", session.access_token, { ...options, maxAge: session.expires_in || 3600 });
    response.cookies.set("sk_refresh", session.refresh_token, { ...options, maxAge: SESSION_MAX_AGE });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    // Keep the refresh cookie so a temporary outage does not erase the session.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/painel/:path*", "/configuracoes/:path*", "/api/stock/:path*", "/api/account/:path*", "/api/billing/:path*", "/api/chat/:path*", "/api/reports/:path*"],
};
