-- Billing domain for Stockinho. Execute after database/schema.sql.
begin;

create table if not exists public.sk_billing_plans(
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code in ('free','pro','pro_founder')),
  name text not null,
  price numeric(14,2) not null check(price>=0),
  currency text not null default 'BRL',
  billing_cycle text not null default 'MONTHLY' check(billing_cycle='MONTHLY'),
  product_limit integer not null check(product_limit>0),
  user_limit integer not null check(user_limit>0),
  location_limit integer not null check(location_limit>0),
  ai_monthly_limit integer not null default 0 check(ai_monthly_limit>=0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sk_billing_plans(code,name,price,product_limit,user_limit,location_limit,ai_monthly_limit,features)
values
  ('free','Free',0,50,1,1,0,'{"csv_export":true,"advanced_reports":false,"ai":false}'),
  ('pro','Pro',29.90,2000,3,1,50,'{"csv_export":true,"csv_import":true,"advanced_reports":true,"ai":true}'),
  ('pro_founder','Pro Fundador',19.90,2000,3,1,50,'{"csv_export":true,"csv_import":true,"advanced_reports":true,"ai":true}')
on conflict(code) do update set
  name=excluded.name, price=excluded.price, product_limit=excluded.product_limit,
  user_limit=excluded.user_limit, location_limit=excluded.location_limit,
  ai_monthly_limit=excluded.ai_monthly_limit, features=excluded.features,
  updated_at=now();

create table if not exists public.sk_billing_customers(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.sk_companies(id) on delete cascade,
  provider text not null default 'asaas',
  provider_customer_id text not null unique,
  cpf_cnpj text not null check(length(cpf_cnpj) in (11,14)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sk_billing_subscriptions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.sk_companies(id) on delete cascade,
  plan_id uuid not null references public.sk_billing_plans(id),
  provider text not null default 'asaas',
  provider_customer_id text,
  provider_subscription_id text unique,
  status text not null check(status in ('pending','active','past_due','canceled','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_date date,
  past_due_until timestamptz,
  canceled_at timestamptz,
  cancel_at_period_end boolean not null default false,
  checkout_key text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sk_billing_subscriptions_status
  on public.sk_billing_subscriptions(status, past_due_until);
create unique index if not exists sk_billing_subscriptions_checkout_key
  on public.sk_billing_subscriptions(checkout_key) where checkout_key is not null;

create table if not exists public.sk_billing_payments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sk_companies(id) on delete cascade,
  subscription_id uuid references public.sk_billing_subscriptions(id) on delete set null,
  provider_payment_id text not null unique,
  status text not null,
  value numeric(14,2),
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  billing_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sk_billing_payments_organization
  on public.sk_billing_payments(organization_id, created_at desc);

create table if not exists public.sk_billing_webhook_events(
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  occurred_at timestamptz,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.sk_billing_usage(
  organization_id uuid not null references public.sk_companies(id) on delete cascade,
  metric text not null check(metric in ('ai_queries')),
  period_start date not null,
  used integer not null default 0 check(used>=0),
  primary key(organization_id,metric,period_start)
);

create table if not exists public.sk_billing_settings(
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.sk_billing_settings(key,value)
values('founder_offer','{"enabled":false,"max_companies":30}')
on conflict(key) do nothing;

create or replace function stockinho_private.claim_billing_checkout(
  p_tenant uuid,
  p_plan_code text
) returns table(claimed boolean, subscription_id uuid, provider_subscription_id text, reason text)
language plpgsql security definer set search_path=''
as $$
declare
  current_sub public.sk_billing_subscriptions;
  selected_plan uuid;
  founder_enabled boolean;
  founder_max integer;
  founder_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));
  select id into selected_plan from public.sk_billing_plans
    where code=p_plan_code and is_active;
  if selected_plan is null or p_plan_code='free' then
    return query select false, null::uuid, null::text, 'Plano inválido';
    return;
  end if;
  select * into current_sub from public.sk_billing_subscriptions
    where organization_id=p_tenant for update;
  if current_sub.provider_subscription_id is not null and current_sub.status='pending' then
    return query select false, current_sub.id, current_sub.provider_subscription_id, 'Contratação já aguardando pagamento';
    return;
  end if;
  if current_sub.status='active' and current_sub.plan_id=selected_plan then
    return query select false, current_sub.id, current_sub.provider_subscription_id, 'Este plano já está ativo';
    return;
  end if;
  if p_plan_code='pro_founder' then
    select coalesce((value->>'enabled')::boolean,false),
           coalesce((value->>'max_companies')::integer,30)
      into founder_enabled, founder_max
      from public.sk_billing_settings where key='founder_offer';
    if not founder_enabled then
      return query select false, null::uuid, null::text, 'A oferta Fundador está indisponível';
      return;
    end if;
    select count(*) into founder_count from public.sk_billing_subscriptions s
      join public.sk_billing_plans p on p.id=s.plan_id
      where p.code='pro_founder' and s.status in ('pending','active','past_due');
    if founder_count >= founder_max then
      return query select false, null::uuid, null::text, 'As vagas do plano Fundador foram preenchidas';
      return;
    end if;
  end if;
  update public.sk_billing_subscriptions
    set plan_id=selected_plan,status='pending',provider_subscription_id=null,
        cancel_at_period_end=false,updated_at=now()
    where organization_id=p_tenant
    returning id into subscription_id;
  return query select true, subscription_id, null::text, null::text;
end
$$;
create or replace function public.stockinho_claim_billing_checkout(p_tenant uuid,p_plan_code text)
returns table(claimed boolean,subscription_id uuid,provider_subscription_id text,reason text)
language sql security definer set search_path=''
as $$ select * from stockinho_private.claim_billing_checkout(p_tenant,p_plan_code) $$;

create or replace function stockinho_private.claim_ai_query(p_tenant uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare plan_limit integer; current_used integer; period date:=date_trunc('month',current_date)::date;
begin
  select p.ai_monthly_limit into plan_limit
  from public.sk_billing_subscriptions s join public.sk_billing_plans p on p.id=s.plan_id
  where s.organization_id=p_tenant
    and (s.status='active' or (s.status='past_due' and (s.past_due_until is null or s.past_due_until>=now())));
  if plan_limit is null or plan_limit=0 then raise exception 'O assistente IA está disponível apenas no plano Pro'; end if;
  insert into public.sk_billing_usage(organization_id,metric,period_start,used)
    values(p_tenant,'ai_queries',period,0) on conflict do nothing;
  update public.sk_billing_usage set used=used+1
    where organization_id=p_tenant and metric='ai_queries' and period_start=period and used<plan_limit
    returning used into current_used;
  if current_used is null then raise exception 'Você atingiu o limite mensal de consultas da IA'; end if;
  return plan_limit-current_used;
end
$$;
create or replace function public.stockinho_claim_ai_query(p_tenant uuid)
returns integer language sql security definer set search_path=''
as $$ select stockinho_private.claim_ai_query(p_tenant) $$;

create or replace function stockinho_private.enforce_member_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare member_limit integer; member_count integer;
begin
  select p.user_limit into member_limit
  from public.sk_billing_subscriptions s join public.sk_billing_plans p on p.id=s.plan_id
  where s.organization_id=new.tenant_id
    and (s.status='active' or (s.status='past_due' and (s.past_due_until is null or s.past_due_until>=now())));
  select count(*) into member_count from public.sk_memberships where tenant_id=new.tenant_id;
  if member_limit is not null and member_count >= member_limit then
    raise exception 'Limite de membros atingido para o plano atual';
  end if;
  return new;
end
$$;
drop trigger if exists sk_memberships_plan_limit on public.sk_memberships;
create trigger sk_memberships_plan_limit before insert on public.sk_memberships
for each row execute function stockinho_private.enforce_member_limit();

create or replace function stockinho_private.enforce_location_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare location_limit integer; location_count integer;
begin
  select p.location_limit into location_limit
  from public.sk_billing_subscriptions s join public.sk_billing_plans p on p.id=s.plan_id
  where s.organization_id=new.tenant_id
    and (s.status='active' or (s.status='past_due' and (s.past_due_until is null or s.past_due_until>=now())));
  select count(*) into location_count from public.sk_locations where tenant_id=new.tenant_id;
  if location_limit is not null and location_count >= location_limit then
    raise exception 'Limite de locais atingido para o plano atual';
  end if;
  return new;
end
$$;
drop trigger if exists sk_locations_plan_limit on public.sk_locations;
create trigger sk_locations_plan_limit before insert on public.sk_locations
for each row execute function stockinho_private.enforce_location_limit();

create or replace function stockinho_private.add_member(p_tenant uuid,p_email text,p_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare member_id uuid;
begin
  if auth.uid() is null or not stockinho_private.member(p_tenant,true) then raise exception 'Apenas administradores podem adicionar membros'; end if;
  if p_role not in ('admin','operator') then raise exception 'Papel inválido'; end if;
  select id into member_id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if member_id is null then raise exception 'O usuário deve criar e confirmar sua conta primeiro'; end if;
  if member_id=auth.uid() then raise exception 'Não é possível alterar seu próprio papel'; end if;
  insert into public.sk_memberships(tenant_id,user_id,role) values(p_tenant,member_id,p_role)
    on conflict(tenant_id,user_id) do update set role=excluded.role;
end
$$;

insert into public.sk_billing_subscriptions(organization_id,plan_id,status)
select c.id,p.id,'active'
from public.sk_companies c
cross join public.sk_billing_plans p
where p.code='free'
on conflict(organization_id) do nothing;

-- A product limit is enforced in the database, so direct API calls cannot bypass it.
create or replace function stockinho_private.enforce_product_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare product_limit integer; active_count integer; plan_status text;
begin
  if new.active and (tg_op='INSERT' or not old.active) then
    select p.product_limit, s.status
      into product_limit, plan_status
      from public.sk_billing_subscriptions s
      join public.sk_billing_plans p on p.id=s.plan_id
      where s.organization_id=new.tenant_id
        and (s.status='active' or (s.status='past_due' and (s.past_due_until is null or s.past_due_until>=now())));
    if product_limit is null then
      select p.product_limit into product_limit from public.sk_billing_plans p where p.code='free';
    end if;
    select count(*) into active_count from public.sk_products
      where tenant_id=new.tenant_id and active
        and (tg_op='INSERT' or id<>new.id);
    if active_count >= product_limit then
      raise exception 'Limite de produtos ativos atingido para o plano atual';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists sk_products_plan_limit on public.sk_products;
create trigger sk_products_plan_limit before insert or update of active on public.sk_products
for each row execute function stockinho_private.enforce_product_limit();

-- A new organization always starts on Free.
create or replace function stockinho_private.create_company(company_name text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare t uuid; free_plan uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  insert into public.sk_companies(name) values(trim(company_name)) returning id into t;
  insert into public.sk_memberships(tenant_id,user_id,role) values(t,auth.uid(),'admin');
  select id into free_plan from public.sk_billing_plans where code='free' and is_active;
  if free_plan is not null then
    insert into public.sk_billing_subscriptions(organization_id,plan_id,status)
    values(t,free_plan,'active');
  end if;
  return t;
end
$$;

alter table public.sk_billing_plans enable row level security;
alter table public.sk_billing_customers enable row level security;
alter table public.sk_billing_subscriptions enable row level security;
alter table public.sk_billing_payments enable row level security;
alter table public.sk_billing_webhook_events enable row level security;
alter table public.sk_billing_usage enable row level security;
alter table public.sk_billing_settings enable row level security;
revoke all on public.sk_billing_plans,public.sk_billing_customers,public.sk_billing_subscriptions,
  public.sk_billing_payments,public.sk_billing_webhook_events,public.sk_billing_usage,
  public.sk_billing_settings from anon,authenticated;
grant select on public.sk_billing_plans to authenticated;
revoke all on function stockinho_private.claim_billing_checkout(uuid,text) from public;
revoke all on function public.stockinho_claim_billing_checkout(uuid,text) from public;
revoke all on function public.stockinho_claim_ai_query(uuid) from public;
grant execute on function public.stockinho_claim_billing_checkout(uuid,text) to service_role;
grant execute on function public.stockinho_claim_ai_query(uuid) to service_role;

commit;
