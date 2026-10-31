begin;
create table if not exists public.sk_ai_requests(
 id uuid primary key,tenant_id uuid not null references public.sk_companies(id) on delete cascade,
 actor uuid not null references auth.users(id),period_start date not null,
 status text not null check(status in ('reserved','completed','refunded')),
 created_at timestamptz not null default now()
);
alter table public.sk_ai_requests enable row level security;
revoke all on public.sk_ai_requests from public,anon,authenticated;

-- Only the application server can settle reservations. A browser cannot refund its own usage.
create or replace function public.stockinho_ai_usage(p_tenant uuid,p_actor uuid,p_key uuid,p_state text) returns integer
language plpgsql security definer set search_path='' as $$
declare period date:=date_trunc('month',now() at time zone 'UTC')::date;r public.sk_ai_requests;used_count integer;stale record;
begin
 if not exists(select 1 from public.sk_memberships where tenant_id=p_tenant and user_id=p_actor) then raise exception 'Empresa não autorizada'; end if;
 perform pg_advisory_xact_lock(hashtext('stock:'||p_tenant::text));
 select * into r from public.sk_ai_requests where id=p_key for update;
 if r.id is not null and (r.tenant_id<>p_tenant or r.actor<>p_actor) then raise exception 'Consulta não autorizada'; end if;
 if p_state='reserve' then
   if not stockinho_private.is_pro(p_tenant) then raise exception 'O assistente IA está disponível apenas no plano Pro'; end if;
   if r.id is not null then raise exception 'Consulta já processada. Envie uma nova pergunta'; end if;
   -- Recover abandoned reservations after a server crash without losing historical periods.
   for stale in select * from public.sk_ai_requests where tenant_id=p_tenant and status='reserved' and created_at<now()-interval '5 minutes' for update loop
     update public.sk_billing_usage set used=greatest(0,used-1) where organization_id=p_tenant and metric='ai_queries' and period_start=stale.period_start;
     update public.sk_ai_requests set status='refunded' where id=stale.id;
   end loop;
   insert into public.sk_billing_usage(organization_id,metric,period_start,used) values(p_tenant,'ai_queries',period,0) on conflict do nothing;
   update public.sk_billing_usage set used=used+1 where organization_id=p_tenant and metric='ai_queries' and period_start=period and used<50 returning used into used_count;
   if used_count is null then raise exception 'Você atingiu o limite mensal de 50 consultas da IA'; end if;
   insert into public.sk_ai_requests(id,tenant_id,actor,period_start,status) values(p_key,p_tenant,p_actor,period,'reserved');
 elsif p_state in ('complete','refund') then
   if r.id is null then raise exception 'Consulta inválida'; end if;
   period:=r.period_start;
   if r.status='reserved' then
     if p_state='refund' then update public.sk_billing_usage set used=greatest(0,used-1) where organization_id=p_tenant and metric='ai_queries' and period_start=period; end if;
     update public.sk_ai_requests set status=case when p_state='complete' then 'completed' else 'refunded' end where id=p_key;
   end if;
 else raise exception 'Estado inválido'; end if;
 select used into used_count from public.sk_billing_usage where organization_id=p_tenant and metric='ai_queries' and period_start=period;
 return greatest(0,50-coalesce(used_count,0));
end $$;
revoke all on function public.stockinho_ai_usage(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.stockinho_ai_usage(uuid,uuid,uuid,text) to service_role;

create or replace function public.stockinho_assistant_context(p_tenant uuid,p_location uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not stockinho_private.member(p_tenant) or not stockinho_private.is_pro(p_tenant) or not exists(select 1 from public.sk_locations where tenant_id=p_tenant and id=p_location) then raise exception 'Empresa ou plano não autorizado'; end if;
 return jsonb_build_object('reference_utc',now(),'finance',public.stockinho_finance(p_tenant,p_location,null,null),
 'expiring_batches',coalesce((select jsonb_agg(x) from(select p.name product,b.code,b.expires_on,b.quantity from public.sk_batches b join public.sk_products p on p.tenant_id=b.tenant_id and p.id=b.product_id where b.tenant_id=p_tenant and b.location_id=p_location and b.quantity>0 and b.expires_on<=current_date+30 order by b.expires_on limit 50)x),'[]'::jsonb),
 'supplier_prices',coalesce((select jsonb_agg(x) from(select p.name product,s.name supplier,sp.last_cost,sp.last_purchase_at from public.sk_supplier_products sp join public.sk_products p on p.tenant_id=sp.tenant_id and p.id=sp.product_id join public.sk_suppliers s on s.tenant_id=sp.tenant_id and s.id=sp.supplier_id where sp.tenant_id=p_tenant and sp.last_cost is not null order by sp.last_purchase_at desc limit 50)x),'[]'::jsonb),
 'inventory_discrepancies',coalesce((select jsonb_agg(x) from(select p.name product,i.expected,i.counted,inv.completed_at from public.sk_inventory_items i join public.sk_inventories inv on inv.tenant_id=i.tenant_id and inv.id=i.inventory_id join public.sk_products p on p.tenant_id=i.tenant_id and p.id=i.product_id where i.tenant_id=p_tenant and inv.location_id=p_location and inv.status='completed' and i.counted<>i.expected order by abs(i.counted-i.expected) desc limit 20)x),'[]'::jsonb),
 'stale_products',coalesce((select jsonb_agg(x) from(select p.name from public.sk_products p where p.tenant_id=p_tenant and p.active and not exists(select 1 from public.sk_movements m where m.tenant_id=p_tenant and m.location_id=p_location and m.product_id=p.id and m.created_at>=now()-interval '30 days') limit 50)x),'[]'::jsonb));
end $$;
revoke all on function public.stockinho_assistant_context(uuid,uuid) from public;
grant execute on function public.stockinho_assistant_context(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
