-- Corrige o acesso dos wrappers RPC usados pelo servidor de billing.
begin;

create or replace function public.stockinho_claim_billing_checkout(p_tenant uuid,p_plan_code text)
returns table(claimed boolean,subscription_id uuid,provider_subscription_id text,reason text)
language sql security definer set search_path=''
as $$ select * from stockinho_private.claim_billing_checkout(p_tenant,p_plan_code) $$;

create or replace function public.stockinho_claim_ai_query(p_tenant uuid)
returns integer language sql security definer set search_path=''
as $$ select stockinho_private.claim_ai_query(p_tenant) $$;

revoke all on function public.stockinho_claim_billing_checkout(uuid,text) from public;
revoke all on function public.stockinho_claim_ai_query(uuid) from public;
grant execute on function public.stockinho_claim_billing_checkout(uuid,text) to service_role;
grant execute on function public.stockinho_claim_ai_query(uuid) to service_role;

commit;
