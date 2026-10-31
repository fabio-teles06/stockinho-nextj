"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";

export type PendingPayment = {
  id: string;
  status: string;
  value: number | null;
  due_date: string | null;
  invoice_url: string | null;
};

export function PendingInvoices({ payments }: { payments: PendingPayment[] }) {
  if (!payments.length) return null;
  return (
    <section className="billing-pending" aria-label="Faturas pendentes">
      {payments.map((payment) => {
        let paymentUrl: string | null = null;
        try {
          const url = new URL(payment.invoice_url ?? "");
          if (url.protocol === "https:") paymentUrl = url.href;
        } catch { /* A cobrança pode ainda não ter um link disponível. */ }
        return (
          <div className="billing-pending-invoice" key={payment.id}>
            <CreditCard size={22} aria-hidden="true" />
            <div>
              <strong>{payment.status === "OVERDUE" ? "Você tem uma fatura vencida" : "Você tem uma fatura pendente"}</strong>
              <p>
                {payment.value != null && Number(payment.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                {payment.due_date && ` · Vencimento: ${new Date(`${payment.due_date}T12:00:00`).toLocaleDateString("pt-BR")}`}
              </p>
            </div>
            {paymentUrl ? (
              <a className="billing-action primary" href={paymentUrl} target="_blank" rel="noopener noreferrer">
                Abrir fatura e pagar <ExternalLink size={16} />
              </a>
            ) : <span>O link de pagamento estará disponível em breve.</span>}
          </div>
        );
      })}
    </section>
  );
}

export default function PendingInvoiceNotice({ tenantId }: { tenantId: string }) {
  const [result, setResult] = useState<{ tenantId: string; payments: PendingPayment[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(`/api/billing?tenant_id=${encodeURIComponent(tenantId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const data: { pendingPayments?: PendingPayment[] } = await response.json();
        if (!controller.signal.aborted) setResult({ tenantId, payments: data.pendingPayments ?? [] });
      } catch { /* A indisponibilidade da cobrança não deve bloquear o painel. */ }
    }
    if (!tenantId) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [tenantId]);
  return <PendingInvoices payments={result?.tenantId === tenantId ? result.payments : []} />;
}
