import { z } from "zod";
import { failure, session, supa } from "@/lib/stock/server";
export async function GET(req: Request) {
  try {
    const { token } = await session(),
      url = new URL(req.url);
    const tenant = z.string().uuid().parse(url.searchParams.get("tenant_id"));
    const location = z
      .string()
      .uuid()
      .parse(url.searchParams.get("location_id"));
    const from = z
      .string()
      .date()
      .optional()
      .parse(url.searchParams.get("from") || undefined);
    const to = z
      .string()
      .date()
      .optional()
      .parse(url.searchParams.get("to") || undefined);
    const data = await supa("/rest/v1/rpc/stockinho_finance", token, {
      method: "POST",
      body: JSON.stringify({
        p_tenant: tenant,
        p_location: location,
        p_from: from || null,
        p_to: to || null,
      }),
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        { error: "Confira o local e as datas." },
        { status: 400 },
      );
    return failure(e);
  }
}
