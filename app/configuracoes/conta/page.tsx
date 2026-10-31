import Link from "next/link";
import { redirect } from "next/navigation";
import { session } from "@/lib/stock/server";
import AccountSettings from "@/components/billing/account-settings";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  await session().catch(() => redirect("/login"));
  return <main className="billing-app-page">
    <Link className="billing-back" href="/painel">← Voltar ao painel</Link>
    <div className="billing-management"><AccountSettings /></div>
  </main>;
}
