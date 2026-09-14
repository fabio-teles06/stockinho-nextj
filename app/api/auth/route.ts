import { cookies } from "next/headers";
import {
  config,
  supa,
  saveSession,
  failure,
  sameOrigin,
  ApiError,
} from "@/lib/stock/server";
import { z } from "zod";
export async function GET() {
  try {
    config();
    return Response.json({ configured: true });
  } catch {
    return Response.json({ configured: false });
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const b = z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(128),
        action: z.enum(["login", "signup"]),
      })
      .parse(await req.json());
    const path =
      b.action === "signup"
        ? "/auth/v1/signup"
        : "/auth/v1/token?grant_type=password";
    const s = await supa(path, config().key, {
      method: "POST",
      body: JSON.stringify({ email: b.email, password: b.password }),
    });
    if (s.access_token) {
      await saveSession(s);
      return Response.json({ ok: true });
    }
    return Response.json({
      confirmation: true,
      message:
        "Confira seu e-mail para confirmar o cadastro e depois entre na sua conta.",
    });
  } catch (e: any) {
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error:
            "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.",
        },
        { status: 400 },
      );
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const jar = await cookies(),
      token = jar.get("sk_access")?.value;
    if (token)
      try {
        await supa("/auth/v1/logout", token, { method: "POST" });
      } catch {}
    jar.delete("sk_access");
    jar.delete("sk_refresh");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
