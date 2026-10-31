"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CreditCard, LoaderCircle, X } from "lucide-react";
import { PendingInvoices, type PendingPayment } from "./pending-invoices";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notice, setNotice] = useState("");
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
    setNotice("");
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
      sessionStorage.removeItem("stockinho-plan");
      if (body.paymentUrl) window.location.assign(body.paymentUrl);
      else setNotice("Contratação criada. Aguardando a primeira cobrança. Confira suas cobranças abaixo.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a contratação.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", tenant_id: tenantId }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
      setCancelOpen(false);
      setNotice("Assinatura cancelada. A cobrança recorrente foi encerrada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cancelar a assinatura.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <section className="billing-panel"><p className="billing-error" role="alert">{error}</p><button className="billing-action" onClick={() => { setError(""); void load(); }}>Tentar novamente</button></section>;
  if (!data) return <section className="billing-panel billing-loading" role="status"><LoaderCircle className="spin" /> Carregando assinatura...</section>;
  const plan = data.subscription?.sk_billing_plans ?? data.plans.find((item) => item.code === "free");
  if (!plan) return <section className="billing-panel"><p className="billing-error">Os planos ainda não foram configurados.</p></section>;
  const paidPlan = plan.code !== "free";
  const status = data.subscription?.status ?? "active";
  const statusLabel: Record<string, string> = { active: "Ativa", pending: "Aguardando pagamento", past_due: "Pagamento em atraso", canceled: "Cancelada", expired: "Expirada", suspended: "Suspensa" };
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
          <p>{status === "past_due" ? "Existe um pagamento em atraso. Confira suas cobranças." : active ? "Sua assinatura está ativa." : status === "pending" ? "Aguardando confirmação do pagamento." : "Recursos básicos disponíveis."}</p>
        </div>
        <strong className="billing-current-price">R$ {Number(plan.price).toFixed(2).replace(".", ",")}<small>/mês</small></strong>
        <span className={"billing-status " + (status === "active" ? "active" : "")}>{statusLabel[status] ?? "Em processamento"}</span>
      </section>
      {error && <p role="alert" className="billing-error">{error}</p>}
      {notice && <p role="status" className="form-success">{notice}</p>}
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
              <p>Usaremos os dados salvos na sua conta para a cobrança.</p>
              <a className="billing-action" href="/configuracoes/conta">Configurar dados da conta</a>
              <button className="billing-action primary" disabled={busy} onClick={checkout}>
                {busy ? <LoaderCircle className="spin" /> : <CreditCard size={16} />} Fazer upgrade para Pro <ArrowRight size={16} />
              </button>
            </div>
          )}
          {active && <button className="billing-action danger" disabled={busy} onClick={() => setCancelOpen(true)}><X size={16} /> Cancelar assinatura</button>}
          <p><Check size={15} /> O Pro só libera recursos depois da confirmação financeira do Asaas.</p>
        </section>
      )}
      <AlertDialog open={cancelOpen} onOpenChange={(open) => { if (!busy) setCancelOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura Pro?</AlertDialogTitle>
            <AlertDialogDescription>A cobrança recorrente será encerrada e a assinatura será cancelada imediatamente. Os recursos do Pro deixarão de estar disponíveis. Seus dados e o histórico de estoque serão mantidos. Cobranças já emitidas podem continuar pendentes.</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="billing-error" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Manter assinatura</AlertDialogCancel>
            <button className="billing-action danger" disabled={busy} onClick={cancel}>{busy ? "Cancelando…" : "Confirmar cancelamento"}</button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
