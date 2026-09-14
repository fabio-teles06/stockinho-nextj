import { redirect } from "next/navigation";
import StockApp from "@/components/stock/stock-app";
import { session, snapshot } from "@/lib/stock/server";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const auth = await session().catch(() => redirect("/login"));
  const data = await snapshot(auth.token);

  return <StockApp initialData={data} initialEmail={auth.user.email} />;
}