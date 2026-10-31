"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CreditCard, LoaderCircle, X } from "lucide-react";
import { PendingInvoices, type PendingPayment } from "./pending-invoices";

type BillingPlan = { code: string; name: string; price: number };
type BillingData = {
  plans: BillingPlan[];
  pendingPayments: PendingPayment[];
  subscription: { status: string; sk_billing_plans?: BillingPlan } | null;
  usage: {
    products: { used: number; limit: number };
    members: { used: number; limit: number };
    ai: { used: number; limit: number };
  };
  canManage: boolean;
};

export default function SubscriptionManagement({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`/api/billing?tenant_id=${tenantId}`).then(async (response) => {
    const body: unknown = await response.json();
    const result = body as BillingData & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar a assinatura.")), [tenantId]);
  useEffect(() => { void load(); }, [load]);

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          tenant_id: tenantId,
          plan: "pro",
        }),
      });
      const body: { error?: string; paymentUrl?: string } = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (body.paymentUrl) window.location.assign(body.paymentUrl);
      else setError("Contratação criada. Aguardando a primeira cobrança do Asaas.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a contratação.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Deseja cancelar a assinatura Pro?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", tenant_id: tenantId }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cancelar a assinatura.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <section className="billing-panel"><p className="billing-error">{error}</p></section>;
  if (!data) return <section className="billing-panel billing-loading"><LoaderCircle className="spin" /> Carregando assinatura...</section>;
  const plan = data.subscription?.sk_billing_plans ?? data.plans.find((item) => item.code === "free");
  if (!plan) return <section className="billing-panel"><p className="billing-error">Os planos ainda não foram configurados.</p></section>;
  const paidPlan = plan.code !== "free";
  const active = paidPlan && (
    data.subscription?.status === "active" ||
    data.subscription?.status === "past_due"
  );
  return (
    <div className="billing-management">
      <PendingInvoices payments={data.pendingPayments} />
      <section className="billing-panel billing-current">
        <div>
          <span className="billing-eyebrow">PLANO ATUAL</span>
          <h1>{plan.name}</h1>
          <p>{active ? "Sua assinatura está ativa." : data.subscription?.status === "pending" ? "Aguardando confirmação do pagamento." : "Recursos básicos disponíveis."}</p>
        </div>
        <strong className="billing-current-price">R$ {Number(plan.price).toFixed(2).replace(".", ",")}<small>/mês</small></strong>
        <span className={"billing-status " + (active ? "active" : "")}>{data.subscription?.status ?? "active"}</span>
      </section>
      {error && <p className="billing-error">{error}</p>}
      <section className="billing-usage-grid">
        {[
          ["Produtos ativos", data.usage.products.used, data.usage.products.limit],
          ["Membros", data.usage.members.used, data.usage.members.limit],
          ["IA no mês", data.usage.ai.used, data.usage.ai.limit],
        ].map(([label, used, limit]) => (
          <div className="billing-usage" key={label as string}>
            <span>{label}</span><strong>{used} <small>/ {limit}</small></strong>
            <div><i style={{ width: `${Math.min(100, Number(limit) ? Number(used) / Number(limit) * 100 : 0)}%` }} /></div>
          </div>
        ))}
      </section>
      {data.canManage && (
        <section className="billing-panel billing-actions-panel">
          {plan.code === "free" && (
            <div className="billing-checkout">
              <p>Usaremos os dados salvos na sua conta para a cobran?a.</p>
              <a className="billing-action" href="/configuracoes/conta">Configurar dados da conta</a>
              <button className="billing-action primary" disabled={busy} onClick={checkout}>
                {busy ? <LoaderCircle className="spin" /> : <CreditCard size={16} />} Fazer upgrade para Pro <ArrowRight size={16} />
              </button>
            </div>
          )}
          {active && <button className="billing-action danger" disabled={busy} onClick={cancel}>{busy ? <LoaderCircle className="spin" /> : <X size={16} />} Cancelar assinatura</button>}
          <p><Check size={15} /> O Pro só libera recursos depois da confirmação financeira do Asaas.</p>
        </section>
      )}
    </div>
  );
}
