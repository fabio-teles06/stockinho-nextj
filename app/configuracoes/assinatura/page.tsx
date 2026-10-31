import { redirect } from "next/navigation";
import { session, snapshot } from "@/lib/stock/server";
import SubscriptionManagement from "@/components/billing/subscription-management";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({ searchParams }: {
  searchParams: Promise<{ tenant_id?: string }>;
}) {
  const auth = await session().catch(() => redirect("/login"));
  const data = await snapshot(auth.token);
  const { tenant_id: requestedTenant } = await searchParams;
  const tenant = requestedTenant
    ? data.companies.find((company: { id: string }) => company.id === requestedTenant)?.id
    : data.companies[0]?.id;
  if (!tenant) redirect("/painel");
  return (
    <main className="billing-app-page">
      <a className="billing-back" href="/painel">← Voltar ao painel</a>
      <SubscriptionManagement tenantId={tenant} />
    </main>
  );
}
