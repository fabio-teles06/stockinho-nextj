begin;
create table if not exists public.sk_audit_events(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id) on delete cascade,
 actor uuid references auth.users(id),entity text not null,entity_id uuid not null,action text not null,
 before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
create index if not exists sk_audit_date on public.sk_audit_events(tenant_id,created_at desc);
alter table public.sk_audit_events enable row level security;
revoke all on public.sk_audit_events from anon,authenticated;
grant select on public.sk_audit_events to authenticated;
drop policy if exists tenant_read on public.sk_audit_events;
create policy tenant_read on public.sk_audit_events for select to authenticated using(stockinho_private.member(tenant_id,true));
create or replace function stockinho_private.audit_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare prev jsonb;next jsonb;
begin
 if tg_op='UPDATE' then prev:=to_jsonb(old); end if;
 next:=to_jsonb(new);
 -- Exclude contact/document/note fields from the audit journal.
 prev:=prev-array['document','email','phone','address','contact','notes','note'];
 next:=next-array['document','email','phone','address','contact','notes','note'];
 if tg_op='UPDATE' and prev=next then return new; end if;
 insert into public.sk_audit_events(tenant_id,actor,entity,entity_id,action,before_data,after_data)
 values(new.tenant_id,auth.uid(),tg_table_name,new.id,tg_op,prev,next);
 return new;
end $$;
revoke all on function stockinho_private.audit_stock() from public;
do $$declare tab text;begin
 foreach tab in array array['sk_products','sk_locations','sk_suppliers','sk_purchase_orders','sk_purchase_items','sk_batches','sk_inventories','sk_inventory_items'] loop
 execute format('drop trigger if exists stock_audit on public.%I',tab);
 execute format('create trigger stock_audit after insert or update on public.%I for each row execute function stockinho_private.audit_stock()',tab);
 end loop;
end $$;
create table if not exists public.sk_valuations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),location_id uuid not null,
 value numeric(18,2) not null,recorded_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id)
);
create index if not exists sk_valuations_date on public.sk_valuations(tenant_id,location_id,recorded_at desc);
alter table public.sk_valuations enable row level security;
revoke all on public.sk_valuations from anon,authenticated;
grant select on public.sk_valuations to authenticated;
drop policy if exists tenant_read on public.sk_valuations;
create policy tenant_read on public.sk_valuations for select to authenticated using(stockinho_private.member(tenant_id));

create or replace function stockinho_private.record_valuation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.sk_valuations(tenant_id,location_id,value)
 select l.tenant_id,l.id,coalesce(sum(b.quantity*p.cost_price),0) from public.sk_locations l
 left join public.sk_balances b on b.tenant_id=l.tenant_id and b.location_id=l.id
 left join public.sk_products p on p.tenant_id=b.tenant_id and p.id=b.product_id
 where l.tenant_id=new.tenant_id group by l.tenant_id,l.id;
 return new;
end $$;
revoke all on function stockinho_private.record_valuation() from public;
drop trigger if exists sk_movement_valuation on public.sk_movements;
create trigger sk_movement_valuation after insert on public.sk_movements for each row execute function stockinho_private.record_valuation();
drop trigger if exists sk_product_valuation on public.sk_products;
create trigger sk_product_valuation after update of cost_price on public.sk_products for each row when(old.cost_price is distinct from new.cost_price) execute function stockinho_private.record_valuation();
insert into public.sk_valuations(tenant_id,location_id,value)
select l.tenant_id,l.id,coalesce(sum(b.quantity*p.cost_price),0) from public.sk_locations l
left join public.sk_balances b on b.tenant_id=l.tenant_id and b.location_id=l.id
left join public.sk_products p on p.tenant_id=b.tenant_id and p.id=b.product_id
where not exists(select 1 from public.sk_valuations v where v.tenant_id=l.tenant_id and v.location_id=l.id)
group by l.tenant_id,l.id;

create or replace function public.stockinho_finance(p_tenant uuid,p_location uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare summary jsonb;premium jsonb;pro boolean;
begin
 if not stockinho_private.member(p_tenant) or not exists(select 1 from public.sk_locations where tenant_id=p_tenant and id=p_location) then raise exception 'Local não autorizado'; end if;
 if p_from>p_to then raise exception 'Período inválido'; end if;
 pro:=stockinho_private.is_pro(p_tenant);
 select jsonb_build_object('value',round(coalesce(sum(coalesce(b.quantity,0)*p.cost_price),0),2),'active_products',count(*),
 'low_stock',count(*) filter(where coalesce(b.quantity,0)<=p.min_quantity),
 'zero_cost_products',count(*) filter(where p.cost_price=0),
 'stale_products',count(*) filter(where not exists(select 1 from public.sk_movements m where m.tenant_id=p_tenant and m.product_id=p.id and m.location_id=p_location and m.created_at>=now()-interval '30 days')))
 into summary from public.sk_products p left join public.sk_balances b on b.tenant_id=p_tenant and b.product_id=p.id and b.location_id=p_location where p.tenant_id=p_tenant and p.active;
 summary:=summary||jsonb_build_object('units',coalesce((select jsonb_agg(x) from(select p.unit,sum(b.quantity) quantity from public.sk_balances b join public.sk_products p on p.id=b.product_id and p.tenant_id=b.tenant_id where b.tenant_id=p_tenant and b.location_id=p_location group by p.unit)x),'[]'::jsonb));
 if pro then
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(x) from(select c.name,round(coalesce(sum(b.quantity*p.cost_price),0),2) value from public.sk_categories c join public.sk_products p on p.tenant_id=c.tenant_id and p.category_id=c.id left join public.sk_balances b on b.tenant_id=p_tenant and b.product_id=p.id and b.location_id=p_location where c.tenant_id=p_tenant group by c.id,c.name)x),'[]'::jsonb),
 'locations',coalesce((select jsonb_agg(x) from(select l.name,round(coalesce(sum(b.quantity*p.cost_price),0),2) value from public.sk_locations l left join public.sk_balances b on b.tenant_id=l.tenant_id and b.location_id=l.id left join public.sk_products p on p.tenant_id=b.tenant_id and p.id=b.product_id where l.tenant_id=p_tenant group by l.id,l.name)x),'[]'::jsonb),
 'top',coalesce((select jsonb_agg(x) from(select p.name,round(b.quantity*p.cost_price,2) value from public.sk_balances b join public.sk_products p on p.tenant_id=b.tenant_id and p.id=b.product_id where b.tenant_id=p_tenant and b.location_id=p_location order by value desc limit 10)x),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(x order by x.day) from(select distinct on((v.recorded_at at time zone 'UTC')::date) (v.recorded_at at time zone 'UTC')::date as day,v.value from public.sk_valuations v where v.tenant_id=p_tenant and v.location_id=p_location and (p_from is null or v.recorded_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or v.recorded_at<(p_to+1)::timestamp at time zone 'UTC') order by (v.recorded_at at time zone 'UTC')::date,v.recorded_at desc,v.id desc)x),'[]'::jsonb),
 'incoming',round(coalesce((select sum(m.quantity*m.unit_cost) from public.sk_movements m where m.tenant_id=p_tenant and m.location_id=p_location and m.type='entrada' and (p_from is null or m.created_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or m.created_at<(p_to+1)::timestamp at time zone 'UTC')),0),2),
 'outgoing',round(coalesce((select sum(m.quantity*m.unit_cost) from public.sk_movements m where m.tenant_id=p_tenant and m.location_id=p_location and m.type='saida' and (p_from is null or m.created_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or m.created_at<(p_to+1)::timestamp at time zone 'UTC')),0),2),
 'unknown_cost_movements',(select count(*) from public.sk_movements m where m.tenant_id=p_tenant and m.location_id=p_location and m.unit_cost is null and (p_from is null or m.created_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or m.created_at<(p_to+1)::timestamp at time zone 'UTC')),
 'expiring_batches',(select count(*) from public.sk_batches b where b.tenant_id=p_tenant and b.location_id=p_location and b.quantity>0 and b.expires_on<=current_date+30),
 'discrepancies',coalesce((select sum((i.counted-i.expected)*i.unit_cost) from public.sk_inventory_items i join public.sk_inventories inv on inv.tenant_id=i.tenant_id and inv.id=i.inventory_id where inv.tenant_id=p_tenant and inv.location_id=p_location and inv.status='completed' and (p_from is null or inv.completed_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or inv.completed_at<(p_to+1)::timestamp at time zone 'UTC')),0)
 ) into premium;
 else premium:='{"categories":[],"locations":[],"top":[],"history":[],"incoming":0,"outgoing":0,"expiring_batches":0,"discrepancies":0}'::jsonb;
 end if;
 return summary||premium;
end $$;
revoke all on function public.stockinho_finance(uuid,uuid,date,date) from public;
grant execute on function public.stockinho_finance(uuid,uuid,date,date) to authenticated;

-- Preserve the existing explicit company removal flow with the added dependencies.
create or replace function stockinho_private.delete_company(p_tenant uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('stock:'||p_tenant::text));
 perform 1 from public.sk_companies where id=p_tenant for update;
 if not stockinho_private.member(p_tenant,true) then raise exception 'Apenas administradores podem excluir empresas'; end if;
 if exists(select 1 from public.sk_billing_subscriptions where organization_id=p_tenant and provider_subscription_id is not null and status not in ('canceled','expired')) then raise exception 'Cancele a assinatura da empresa antes de excluí-la'; end if;
 delete from public.sk_inventory_items where tenant_id=p_tenant;
 delete from public.sk_inventories where tenant_id=p_tenant;
 delete from public.sk_movements where tenant_id=p_tenant;
 delete from public.sk_batches where tenant_id=p_tenant;
 delete from public.sk_purchase_items where tenant_id=p_tenant;
 delete from public.sk_purchase_orders where tenant_id=p_tenant;
 delete from public.sk_supplier_products where tenant_id=p_tenant;
 delete from public.sk_suppliers where tenant_id=p_tenant;
 delete from public.sk_operations where tenant_id=p_tenant;
 delete from public.sk_valuations where tenant_id=p_tenant;
 delete from public.sk_sale_items where tenant_id=p_tenant;
 delete from public.sk_sales where tenant_id=p_tenant;
 delete from public.sk_balances where tenant_id=p_tenant;
 delete from public.sk_products where tenant_id=p_tenant;
 delete from public.sk_categories where tenant_id=p_tenant;
 delete from public.sk_locations where tenant_id=p_tenant;
 delete from public.sk_memberships where tenant_id=p_tenant;
 delete from public.sk_companies where id=p_tenant;
end $$;
-- Archive checks must use the same serialization as movements.
revoke all on function stockinho_private.delete_company(uuid) from public;
grant execute on function stockinho_private.delete_company(uuid) to authenticated;
create or replace function stockinho_private.archive_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('stock:'||new.tenant_id::text));
 if not new.active and exists(select 1 from public.sk_balances where tenant_id=old.tenant_id and product_id=old.id and quantity>0) then raise exception 'O produto ainda possui saldo em uma unidade'; end if;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
