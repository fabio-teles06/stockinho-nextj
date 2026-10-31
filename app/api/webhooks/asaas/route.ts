import { z } from "zod";
import { billingSupa, sameSecret } from "@/lib/billing/server";

const eventSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  dateCreated: z.string().nullish(),
  subscription: z.object({ id: z.string() }).passthrough().nullish(),
  payment: z.object({
    id: z.string(),
    subscription: z.string().nullish(),
    status: z.string().nullish(),
    value: z.number().nullish(),
    dueDate: z.string().nullish(),
    paymentDate: z.string().nullish(),
    invoiceUrl: z.string().nullish(),
    bankSlipUrl: z.string().nullish(),
    billingType: z.string().nullish(),
  }).passthrough().nullish(),
}).passthrough();

export async function POST(req: Request) {
  const token = req.headers.get("asaas-access-token");
  if (!sameSecret(token, process.env.ASAAS_WEBHOOK_TOKEN)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Payload inválido." }, { status: 400 });
  const event = parsed.data;
  const existing = (await billingSupa(
    `/rest/v1/sk_billing_webhook_events?provider_event_id=eq.${encodeURIComponent(event.id)}&select=processed_at`,
  ))[0];
  if (existing?.processed_at) return Response.json({ received: true, duplicate: true });
  const inserted = await billingSupa("/rest/v1/sk_billing_webhook_events", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      provider_event_id: event.id,
      event_type: event.event,
      occurred_at: event.dateCreated ? new Date(event.dateCreated).toISOString() : new Date().toISOString(),
      payload: event,
    }),
  }).catch((error) => {
    console.error("[billing] Could not persist webhook event", { message: error.message });
    throw error;
  });
  void inserted;

  const payment = event.payment;
  const providerSubscriptionId = event.subscription?.id ?? payment?.subscription;
  const subscription = providerSubscriptionId
    ? (await billingSupa(`/rest/v1/sk_billing_subscriptions?provider_subscription_id=eq.${providerSubscriptionId}&select=id,organization_id,status,last_event_at,plan_id`))[0]
    : null;
  const occurredAt = event.dateCreated
    ? new Date(event.dateCreated).toISOString()
    : new Date().toISOString();
  const stale = Boolean(
    subscription?.last_event_at &&
    new Date(subscription.last_event_at).getTime() >= new Date(occurredAt).getTime(),
  );
  if (subscription && payment && !stale) {
    const financialStatus = payment.status ?? event.event.replace("PAYMENT_", "");
    await billingSupa("/rest/v1/sk_billing_payments", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        organization_id: subscription.organization_id,
        subscription_id: subscription.id,
        provider_payment_id: payment.id,
        status: financialStatus,
        value: payment.value ?? null,
        due_date: payment.dueDate ?? null,
        paid_at: payment.paymentDate ?? null,
        invoice_url: payment.invoiceUrl ?? payment.bankSlipUrl ?? null,
        billing_type: payment.billingType ?? null,
        updated_at: new Date().toISOString(),
      }),
    });
    const paid = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event.event);
    const overdue = ["PAYMENT_OVERDUE", "PAYMENT_DUNNING_RECEIVED"].includes(event.event);
    const canceled = ["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(event.event);
    if (paid || overdue || canceled) {
      await billingSupa(`/rest/v1/sk_billing_subscriptions?id=eq.${subscription.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: paid ? "active" : canceled ? "past_due" : "past_due",
          past_due_until: overdue || canceled
            ? new Date(`${payment.dueDate ?? new Date().toISOString()}T23:59:59Z`).getTime() + 3 * 86400000
            : null,
          current_period_start: paid ? new Date().toISOString() : undefined,
          next_billing_date: payment.dueDate ?? null,
          last_event_at: occurredAt,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  }
  if (subscription && !stale && event.event.startsWith("SUBSCRIPTION_")) {
    const inactive = ["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"].includes(event.event);
    await billingSupa(`/rest/v1/sk_billing_subscriptions?id=eq.${subscription.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: inactive ? "canceled" : subscription.status,
        last_event_at: occurredAt,
        updated_at: new Date().toISOString(),
      }),
    });
  }
  await billingSupa(`/rest/v1/sk_billing_webhook_events?provider_event_id=eq.${event.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ processed_at: new Date().toISOString() }),
  });
  return Response.json({ received: true });
}
