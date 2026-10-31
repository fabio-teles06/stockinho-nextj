import { accountSchema } from "@/lib/billing/account";
import { billingSupa } from "@/lib/billing/server";
import { failure, sameOrigin, session } from "@/lib/stock/server";

export async function GET() {
  try {
    const { user } = await session();
    const rows = await billingSupa(`/rest/v1/sk_account_profiles?user_id=eq.${user.id}&select=name,email,cpf_cnpj`);
    return Response.json({ profile: rows[0] ?? { name: "", email: user.email ?? "", cpf_cnpj: "" } }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return failure(error); }
}

export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const { user } = await session();
    const parsed = accountSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    await billingSupa("/rest/v1/sk_account_profiles?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...parsed.data, user_id: user.id, updated_at: new Date().toISOString() }),
    });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
