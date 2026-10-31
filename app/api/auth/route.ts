import { cookies } from "next/headers";
import {
  config,
  supa,
  session,
  saveSession,
  failure,
  sameOrigin,
  ApiError,
} from "@/lib/stock/server";
import { z } from "zod";
export async function GET() {
  try {
    config();
    try {
      const current = await session();
      return Response.json({
        configured: true,
        authenticated: true,
        user: { id: current.user.id, email: current.user.email },
      });
    } catch {
      return Response.json({ configured: true, authenticated: false });
    }
  } catch {
    return Response.json({ configured: false, authenticated: false });
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const b = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("reset"),
          email: z.string().email(),
        }),
        z.object({
          action: z.enum(["login", "signup"]),
          email: z.string().email(),
          password: z.string().min(8).max(128),
        }),
      ])
      .parse(await req.json());
    if (b.action === "reset") {
      const s = await supa("/auth/v1/recover", config().key, {
        method: "POST",
        body: JSON.stringify({ email: b.email }),
      });
      if (s?.error || s?.error_description || s?.msg)
        throw new ApiError(
          s.error_description || s.msg || s.error || "Não foi possível enviar o reset.",
        );
      return Response.json({
        confirmation: true,
        message: "Confira seu e-mail para redefinir sua senha.",
      });
    }
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
