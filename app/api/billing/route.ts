import { z } from "zod";
import { accountSchema } from "@/lib/billing/account";
import { ApiError, failure, sameOrigin, session, supa } from "@/lib/stock/server";
import {
  assertAdmin,
  asaas,
  billingIdempotencyKey,
  billingSupa,
  type BillingPlan,
} from "@/lib/billing/server";

const tenantId = z.string().uuid();
const planCode = z.enum(["pro", "pro_founder"]);

async function plans(): Promise<BillingPlan[]> {
  const available: BillingPlan[] = await billingSupa(
    "/rest/v1/sk_billing_plans?is_active=eq.true&order=price.asc&select=*",
  );
  const settings = await billingSupa(
    "/rest/v1/sk_billing_settings?key=eq.founder_offer&select=value",
  );
  const founderEnabled = settings[0]?.value?.enabled === true;
  return available.filter((plan) => plan.code !== "pro_founder" || founderEnabled);
}

async function usage(tenant: string, plan: BillingPlan) {
  const [products, members, usageRows] = await Promise.all([
    billingSupa(`/rest/v1/sk_products?tenant_id=eq.${tenant}&active=eq.true&select=id`),
    billingSupa(`/rest/v1/sk_memberships?tenant_id=eq.${tenant}&select=id`),
    billingSupa(`/rest/v1/sk_billing_usage?organization_id=eq.${tenant}&metric=eq.ai_queries&select=used,period_start&order=period_start.desc&limit=1`),
  ]);
  return {
    products: { used: products.length, limit: plan.product_limit },
    members: { used: members.length, limit: plan.user_limit },
    ai: {
      used: usageRows[0]?.used ?? 0,
      limit: plan.ai_monthly_limit,
      periodStart: usageRows[0]?.period_start ?? null,
    },
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenant = url.searchParams.get("tenant_id");
    const availablePlans = await plans();
    if (!tenant) return Response.json({ plans: availablePlans });
    const { token, user } = await session();
    const organizationId = tenantId.parse(tenant);
    const memberships = await supa(
      `/rest/v1/sk_memberships?tenant_id=eq.${organizationId}&user_id=eq.${user.id}&select=role`,
      token,
    );
    if (!memberships.length) throw new ApiError("Empresa não autorizada.", 403);
    const subscriptions: Array<{ sk_billing_plans?: BillingPlan; status: string; past_due_until?: string | null }> = await billingSupa(
      `/rest/v1/sk_billing_subscriptions?organization_id=eq.${organizationId}&select=*,sk_billing_plans(*)&limit=1`,
    );
    const subscription = subscriptions[0] ?? null;
    const paidAccess = subscription?.status === "active" ||
      (subscription?.status === "past_due" && subscription.past_due_until &&
        new Date(subscription.past_due_until).getTime() >= Date.now());
    const plan = paidAccess
      ? subscription?.sk_billing_plans
      : availablePlans.find((p) => p.code === "free");
    if (!plan) throw new ApiError("Os planos ainda não foram configurados.", 503);
    return Response.json({
      plans: availablePlans,
      subscription,
      pendingPayments: await billingSupa(
        `/rest/v1/sk_billing_payments?organization_id=eq.${organizationId}&status=in.(PENDING,OVERDUE)&select=id,status,value,due_date,invoice_url&order=due_date.asc.nullslast,created_at.asc`,
      ),
      usage: await usage(organizationId, plan),
      canManage: memberships[0].role === "admin",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { token, user } = await session();
    const body = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("checkout"),
        tenant_id: tenantId,
        plan: planCode,
      }),
      z.object({ action: z.literal("cancel"), tenant_id: tenantId }),
    ]).parse(await req.json());
    await assertAdmin(token, user.id, body.tenant_id);
    if (body.action === "cancel") {
      const current = (await billingSupa(
        `/rest/v1/sk_billing_subscriptions?organization_id=eq.${body.tenant_id}&select=id,provider_subscription_id,status,sk_billing_plans(code)`,
      ))[0];
      if (current?.sk_billing_plans?.code === "free") {
        throw new ApiError("A empresa está no plano Free e não possui assinatura paga.", 409);
      }
      if (!current?.provider_subscription_id) {
        return Response.json({ ok: true, message: "Não há cobrança recorrente ativa." });
      }
      await asaas(`/subscriptions/${current.provider_subscription_id}`, { method: "DELETE" });
      await billingSupa(`/rest/v1/sk_billing_subscriptions?organization_id=eq.${body.tenant_id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }),
      });
      return Response.json({ ok: true });
    }

    const profiles = await billingSupa(`/rest/v1/sk_account_profiles?user_id=eq.${user.id}&select=name,email,cpf_cnpj`);
    const parsedProfile = accountSchema.safeParse(profiles[0]);
    if (!parsedProfile.success) throw new ApiError("Configure os dados da sua conta antes de contratar a assinatura.", 400);
    const profile = parsedProfile.data;

    const claim = (await billingSupa("/rest/v1/rpc/stockinho_claim_billing_checkout", {
      method: "POST",
      body: JSON.stringify({ p_tenant: body.tenant_id, p_plan_code: body.plan }),
    }))[0];
    if (!claim?.claimed) {
      if (claim?.provider_subscription_id) {
        return Response.json({ pending: true, providerSubscriptionId: claim.provider_subscription_id });
      }
      throw new ApiError(claim?.reason || "Não foi possível iniciar a contratação.", 409);
    }
    const storedCustomer = (await billingSupa(
      `/rest/v1/sk_billing_customers?organization_id=eq.${body.tenant_id}&select=provider_customer_id,cpf_cnpj`,
    ))[0];
    let customer = storedCustomer?.provider_customer_id;
    if (!customer) {
      const created = await asaas("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          cpfCnpj: profile.cpf_cnpj,
        }),
      });
      customer = created.id;
      await billingSupa("/rest/v1/sk_billing_customers", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          organization_id: body.tenant_id,
          provider_customer_id: customer,
          cpf_cnpj: profile.cpf_cnpj,
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      await asaas(`/customers/${customer}`, {
        method: "PUT",
        body: JSON.stringify({ name: profile.name, email: profile.email, cpfCnpj: profile.cpf_cnpj }),
      });
      await billingSupa(`/rest/v1/sk_billing_customers?organization_id=eq.${body.tenant_id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ cpf_cnpj: profile.cpf_cnpj, updated_at: new Date().toISOString() }),
      });
    }
    const selectedPlan = (await billingSupa(
      `/rest/v1/sk_billing_plans?code=eq.${body.plan}&select=code,price,billing_cycle`,
    ))[0];
    const subscription = await asaas("/subscriptions", {
      method: "POST",
      headers: { "Idempotency-Key": billingIdempotencyKey(body.tenant_id, body.plan) },
      body: JSON.stringify({
        customer,
        billingType: "UNDEFINED",
        value: selectedPlan.price,
        cycle: selectedPlan.billing_cycle,
        description: `Stockinho ${body.plan === "pro" ? "Pro" : "Pro Fundador"}`,
        externalReference: body.tenant_id,
      }),
    });
    await billingSupa(`/rest/v1/sk_billing_subscriptions?organization_id=eq.${body.tenant_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        provider_customer_id: customer,
        provider_subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      }),
    });
    const payments = await asaas(`/subscriptions/${subscription.id}/payments`);
    const firstPayment = payments?.data?.[0];
    if (firstPayment) {
      await billingSupa("/rest/v1/sk_billing_payments", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          organization_id: body.tenant_id,
          subscription_id: claim.subscription_id,
          provider_payment_id: firstPayment.id,
          status: firstPayment.status,
          value: firstPayment.value,
          due_date: firstPayment.dueDate,
          invoice_url: firstPayment.invoiceUrl ?? firstPayment.bankSlipUrl,
          billing_type: firstPayment.billingType,
        }),
      });
    }
    return Response.json({
      pending: true,
      providerSubscriptionId: subscription.id,
      paymentUrl: firstPayment?.invoiceUrl ?? firstPayment?.bankSlipUrl ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}
