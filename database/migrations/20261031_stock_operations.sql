-- Apply after all existing migrations. Additive; never consolidates existing balances.
begin;

update public.sk_billing_plans set location_limit=3,
 features=features || '{"suppliers":true,"purchases":true,"batches":true,"transfers":true,"labels":true}'::jsonb
 where code in ('pro','pro_founder');
alter table public.sk_companies add column if not exists expiry_alert_days integer not null default 30 check(expiry_alert_days in (7,15,30));
alter table public.sk_companies add column if not exists primary_user_id uuid references auth.users(id);
update public.sk_companies c set primary_user_id=(select user_id from public.sk_memberships m where m.tenant_id=c.id and m.role='admin' order by m.id limit 1) where primary_user_id is null;

alter table public.sk_products add column if not exists sku text not null default '';
alter table public.sk_products add column if not exists track_batches boolean not null default false;
-- Retain fractional weighted-average costs without rounding each receipt to cents.
create unique index if not exists sk_products_sku on public.sk_products(tenant_id,sku) where sku<>'';
alter table public.sk_locations add column if not exists active boolean not null default true;
alter table public.sk_locations add column if not exists is_default boolean not null default false;
-- Pick an existing location deterministically. Do not move any balance.
update public.sk_locations l set is_default=true where l.id=(select x.id from public.sk_locations x where x.tenant_id=l.tenant_id order by x.id limit 1)
 and not exists(select 1 from public.sk_locations x where x.tenant_id=l.tenant_id and x.is_default);
create unique index if not exists sk_location_default on public.sk_locations(tenant_id) where is_default;

create or replace function stockinho_private.is_pro(t uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sk_billing_subscriptions s join public.sk_billing_plans p on p.id=s.plan_id
 where s.organization_id=t and p.code in ('pro','pro_founder') and
 (s.status='active' or (s.status='past_due' and s.past_due_until>=now())))
$$;
revoke all on function stockinho_private.is_pro(uuid) from public;
create or replace function stockinho_private.can_write(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sk_memberships m join public.sk_companies c on c.id=m.tenant_id where m.tenant_id=t and m.user_id=auth.uid() and (stockinho_private.is_pro(t) or c.primary_user_id=auth.uid()))
$$;
revoke all on function stockinho_private.can_write(uuid) from public;
-- Read membership remains unchanged; administrative write policies also enforce the seat limit.
create or replace function stockinho_private.member(t uuid,admin_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.sk_memberships where tenant_id=t and user_id=auth.uid() and (not admin_only or (role='admin' and stockinho_private.can_write(t))))
$$;
create or replace function stockinho_private.primary_member() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid:=coalesce(new.tenant_id,old.tenant_id);
begin
 update public.sk_companies c set primary_user_id=(select user_id from public.sk_memberships m where m.tenant_id=t and m.role='admin' order by m.id limit 1)
 where c.id=t and not exists(select 1 from public.sk_memberships m where m.tenant_id=t and m.user_id=c.primary_user_id and m.role='admin');
 return null;
end $$;
revoke all on function stockinho_private.primary_member() from public;
drop trigger if exists sk_primary_member on public.sk_memberships;
create trigger sk_primary_member after insert or update or delete on public.sk_memberships for each row execute function stockinho_private.primary_member();

-- All quantity limits share the same transaction lock, including direct REST writes.
create or replace function stockinho_private.enforce_product_limit() returns trigger
language plpgsql security definer set search_path='' as $$
declare lim integer;
begin
 perform pg_advisory_xact_lock(hashtext('stock:'||new.tenant_id::text));
 lim:=case when stockinho_private.is_pro(new.tenant_id) then 2000 else 50 end;
 if new.active and (tg_op='INSERT' or not old.active) and
 (select count(*) from public.sk_products where tenant_id=new.tenant_id and active and id<>new.id)>=lim
 then raise exception 'Limite de produtos ativos atingido para o plano atual'; end if;
 if new.track_batches and (tg_op='INSERT' or not old.track_batches) then
   if not stockinho_private.is_pro(new.tenant_id) then raise exception 'Lotes exigem o plano Pro'; end if;
   if exists(select 1 from public.sk_balances where tenant_id=new.tenant_id and product_id=new.id and quantity>0)
   then raise exception 'Zere o saldo por ajuste auditado antes de ativar lotes'; end if;
 end if;
 if tg_op='UPDATE' and old.track_batches and not new.track_batches then raise exception 'O controle de lotes não pode ser desativado'; end if;
 return new;
end $$;
drop trigger if exists sk_products_plan_limit on public.sk_products;
create trigger sk_products_plan_limit before insert or update on public.sk_products for each row execute function stockinho_private.enforce_product_limit();

create or replace function stockinho_private.enforce_location_limit() returns trigger
language plpgsql security definer set search_path='' as $$
declare lim integer;
begin
 perform pg_advisory_xact_lock(hashtext('stock:'||new.tenant_id::text));
 lim:=case when stockinho_private.is_pro(new.tenant_id) then 3 else 1 end;
 if new.active and (tg_op='INSERT' or not old.active) and
 (select count(*) from public.sk_locations where tenant_id=new.tenant_id and active and id<>new.id)>=lim
 then raise exception 'Limite de locais atingido para o plano atual'; end if;
   if tg_op='UPDATE' and old.is_default and not new.active then raise exception 'Defina outro local padrão antes de arquivar'; end if;
   if tg_op='UPDATE' and new.is_default<>old.is_default and not stockinho_private.is_pro(new.tenant_id) then raise exception 'Alterar o local padrão exige Pro'; end if;
   if tg_op='UPDATE' and not new.active and exists(select 1 from public.sk_balances where tenant_id=new.tenant_id and location_id=new.id and quantity>0)
 then raise exception 'O local ainda possui saldo'; end if;
 if not exists(select 1 from public.sk_locations where tenant_id=new.tenant_id and id<>new.id) then new.is_default:=true; end if;
 return new;
end $$;
create or replace function stockinho_private.enforce_member_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('stock:'||new.tenant_id::text));
 if not exists(select 1 from public.sk_memberships where tenant_id=new.tenant_id and user_id=new.user_id) and
 (select count(*) from public.sk_memberships where tenant_id=new.tenant_id)>=(case when stockinho_private.is_pro(new.tenant_id) then 3 else 1 end)
 then raise exception 'Limite de membros atingido para o plano atual'; end if;
 return new;
end $$;
drop trigger if exists sk_locations_plan_limit on public.sk_locations;
create trigger sk_locations_plan_limit before insert or update of active,is_default on public.sk_locations for each row execute function stockinho_private.enforce_location_limit();
create or replace function stockinho_private.require_default_location() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.sk_locations where tenant_id=new.tenant_id and active) and not exists(select 1 from public.sk_locations where tenant_id=new.tenant_id and active and is_default) then raise exception 'A empresa precisa de um local padrão ativo'; end if;
 return null;
end $$;
revoke all on function stockinho_private.require_default_location() from public;
drop trigger if exists sk_location_default_required on public.sk_locations;
create constraint trigger sk_location_default_required after insert or update on public.sk_locations deferrable initially deferred for each row execute function stockinho_private.require_default_location();

create table if not exists public.sk_operations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),
 request_key uuid not null,action text not null,payload jsonb not null,result jsonb,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(tenant_id,request_key)
);
create table if not exists public.sk_suppliers(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),
 name text not null check(length(trim(name)) between 1 and 150),trade_name text not null default '',
 document text not null default '',email text not null default '',phone text not null default '',
 address text not null default '',contact text not null default '',lead_days integer not null default 0 check(lead_days between 0 and 3650),
 notes text not null default '',active boolean not null default true,unique(tenant_id,id)
);
create table if not exists public.sk_supplier_products(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,product_id uuid not null,supplier_id uuid not null,
 last_cost numeric(14,2) check(last_cost>=0),last_purchase_at timestamptz,
 unique(tenant_id,product_id,supplier_id),
 foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id),
 foreign key(tenant_id,supplier_id) references public.sk_suppliers(tenant_id,id)
);
create table if not exists public.sk_purchase_orders(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),
 supplier_id uuid not null,location_id uuid not null,
 status text not null default 'draft' check(status in ('draft','confirmed','partially_received','received','canceled')),
 freight numeric(14,2) not null default 0 check(freight>=0),discount numeric(14,2) not null default 0 check(discount>=0),
 total numeric(14,2) not null check(total>=0),expected_on date,notes text not null default '',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(tenant_id,id),
 foreign key(tenant_id,supplier_id) references public.sk_suppliers(tenant_id,id),
 foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id)
);
create table if not exists public.sk_purchase_items(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,order_id uuid not null,product_id uuid not null,
 quantity numeric(14,2) not null check(quantity>0),received numeric(14,2) not null default 0 check(received>=0 and received<=quantity),
 unit_cost numeric(14,2) not null check(unit_cost>=0),unique(tenant_id,order_id,product_id),
 foreign key(tenant_id,order_id) references public.sk_purchase_orders(tenant_id,id),
 foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id)
);
alter table public.sk_purchase_orders add column if not exists received_at timestamptz;
create table if not exists public.sk_batches(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,product_id uuid not null,location_id uuid not null,
 code text not null check(length(trim(code)) between 1 and 100),manufactured_on date,expires_on date not null,
 quantity numeric(14,2) not null default 0 check(quantity>=0),source_order_id uuid,
 check(manufactured_on is null or manufactured_on<=expires_on),unique(tenant_id,id),unique(tenant_id,product_id,location_id,code),
 foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id),
 foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id),
 foreign key(tenant_id,source_order_id) references public.sk_purchase_orders(tenant_id,id)
);
create index if not exists sk_batch_expiry on public.sk_batches(tenant_id,expires_on) where quantity>0;
create table if not exists public.sk_inventories(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),location_id uuid not null,
 status text not null default 'draft' check(status in ('draft','in_progress','pending_review','completed','canceled')),
 notes text not null default '',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 completed_at timestamptz,unique(tenant_id,id),foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id)
);
create table if not exists public.sk_inventory_items(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,inventory_id uuid not null,product_id uuid not null,
 expected numeric(14,2) not null check(expected>=0),counted numeric(14,2) check(counted>=0),
 counted_by uuid references auth.users(id),counted_at timestamptz,unit_cost numeric(14,2) not null,
 unique(tenant_id,inventory_id,product_id),
 foreign key(tenant_id,inventory_id) references public.sk_inventories(tenant_id,id),
 foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id)
);
alter table public.sk_inventory_items add column if not exists batch_id uuid;
alter table public.sk_inventory_items drop constraint if exists sk_inventory_items_tenant_id_inventory_id_product_id_key;
create unique index if not exists sk_inventory_item_identity on public.sk_inventory_items(tenant_id,inventory_id,product_id,coalesce(batch_id,'00000000-0000-0000-0000-000000000000'::uuid));
do $$begin
 if not exists(select 1 from pg_constraint where conname='sk_inventory_item_batch_fk') then
 alter table public.sk_inventory_items add constraint sk_inventory_item_batch_fk foreign key(tenant_id,batch_id) references public.sk_batches(tenant_id,id);
 end if;
end $$;
alter table public.sk_movements add column if not exists batch_id uuid;
alter table public.sk_movements add column if not exists document_id uuid;
alter table public.sk_movements add column if not exists movement_kind text not null default 'manual';
alter table public.sk_movements add column if not exists unit_cost numeric(14,2);
do $$declare col record;begin
 for col in select * from (values('sk_products','cost_price'),('sk_supplier_products','last_cost'),('sk_inventory_items','unit_cost'),('sk_movements','unit_cost')) x(tab,field) loop
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name=col.tab and column_name=col.field and (numeric_scale<>6 or numeric_precision<>18)) then
 execute format('alter table public.%I alter column %I type numeric(18,6)',col.tab,col.field);
 end if;
 end loop;
end $$;
alter table public.sk_movements add column if not exists balance_after numeric(14,2);
alter table public.sk_movements add column if not exists valuation_after numeric(18,2);
do $$begin
 if not exists(select 1 from pg_constraint where conname='sk_movements_batch_fk') then
 alter table public.sk_movements add constraint sk_movements_batch_fk foreign key(tenant_id,batch_id) references public.sk_batches(tenant_id,id);
 end if;
end $$;

-- Read/export remains available after downgrade. All writes use the RPC below.
do $$declare tab text;begin
 foreach tab in array array['sk_operations','sk_suppliers','sk_supplier_products','sk_purchase_orders','sk_purchase_items','sk_batches','sk_inventories','sk_inventory_items'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='tenant_read') then
 execute format('create policy tenant_read on public.%I for select to authenticated using(stockinho_private.member(tenant_id))',tab);
 end if;
 execute format('create index if not exists %I on public.%I(tenant_id)',tab||'_tenant',tab);
 end loop;
end $$;

-- Central stock service: numeric arithmetic, tenant lock, lot balance and journal are atomic.
create or replace function stockinho_private.move_core(t uuid,p uuid,l uuid,typ text,q numeric,reason text,note text,
 batch uuid default null,kind text default 'manual',doc uuid default null,cost numeric default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare prod public.sk_products;loc public.sk_locations;b public.sk_batches;qty numeric;mid uuid;total_qty numeric;new_cost numeric;
begin
 if not stockinho_private.member(t) then raise exception 'Empresa não autorizada'; end if;
 if not stockinho_private.can_write(t) then raise exception 'No Free apenas o usuário principal pode operar. Seus dados continuam disponíveis para consulta'; end if;
 perform pg_advisory_xact_lock(hashtext('stock:'||t::text));
 if q is null or q<=0 or q>100000000 or q<>round(q,2) or typ is null or typ not in ('entrada','saida') then raise exception 'Quantidade ou tipo inválido'; end if;
 if cost is not null and (cost<0 or cost>100000000 or cost<>round(cost,6)) then raise exception 'Custo inválido'; end if;
 if reason is null or reason not in ('Compra','Venda','Ajuste inicial','Devolução','Perda','Ajuste de inventário') or
 (typ='entrada' and reason in ('Venda','Perda')) or (typ='saida' and reason in ('Compra','Ajuste inicial')) then raise exception 'Motivo incompatível com o tipo'; end if;
 if (reason in ('Ajuste de inventário','Ajuste inicial') or cost is not null or kind<>'manual') and not stockinho_private.member(t,true) then raise exception 'Apenas administradores podem ajustar estoque ou custos'; end if;
 select * into prod from public.sk_products where tenant_id=t and id=p and active for update;
 if prod.id is null then raise exception 'Produto inválido ou arquivado'; end if;
 select * into loc from public.sk_locations where tenant_id=t and id=l and active;
 if loc.id is null then raise exception 'Local inválido ou arquivado'; end if;
 if not stockinho_private.is_pro(t) and not loc.is_default then raise exception 'Local excedente disponível somente para leitura no Free'; end if;
 if prod.track_batches then
   if batch is null then raise exception 'Selecione um lote para este produto'; end if;
   if not stockinho_private.is_pro(t) then raise exception 'Movimentações de lotes exigem Pro'; end if;
   select * into b from public.sk_batches where tenant_id=t and id=batch and product_id=p and location_id=l for update;
   if b.id is null then raise exception 'Lote inválido'; end if;
   if b.expires_on<current_date and (typ='entrada' or reason<>'Perda') then raise exception 'Lote vencido: somente descarte autorizado'; end if;
   if typ='saida' and b.quantity<q then raise exception 'Saldo insuficiente no lote'; end if;
 elsif batch is not null then raise exception 'Produto não controla lotes'; end if;
 insert into public.sk_balances(tenant_id,product_id,location_id,quantity) values(t,p,l,0) on conflict do nothing;
 select quantity into qty from public.sk_balances where tenant_id=t and product_id=p and location_id=l for update;
 if typ='saida' and qty<q then raise exception 'Estoque insuficiente'; end if;
 new_cost:=prod.cost_price;
 if typ='entrada' and cost is not null then
   select coalesce(sum(quantity),0) into total_qty from public.sk_balances where tenant_id=t and product_id=p;
   new_cost:=round((total_qty*prod.cost_price+q*cost)/(total_qty+q),6);
   update public.sk_products set cost_price=new_cost where tenant_id=t and id=p;
 end if;
 qty:=qty+case when typ='entrada' then q else -q end;
 update public.sk_balances set quantity=qty where tenant_id=t and product_id=p and location_id=l;
 if batch is not null then update public.sk_batches set quantity=quantity+case when typ='entrada' then q else -q end where tenant_id=t and id=batch; end if;
 insert into public.sk_movements(tenant_id,product_id,location_id,type,quantity,reason,note,created_by,batch_id,movement_kind,document_id,unit_cost,balance_after,valuation_after)
 values(t,p,l,typ,q,reason,coalesce(note,''),auth.uid(),batch,kind,doc,coalesce(cost,prod.cost_price),qty,round(qty*new_cost,2)) returning id into mid;
 return mid;
end $$;
revoke all on function stockinho_private.move_core(uuid,uuid,uuid,text,numeric,text,text,uuid,text,uuid,numeric) from public,authenticated;

-- Existing callers keep their signature and use the same central stock rules.
create or replace function stockinho_private.move(p_tenant uuid,p_product uuid,p_location uuid,p_type text,p_quantity numeric,p_reason text,p_note text)
returns uuid language sql security definer set search_path='' as $$
 select stockinho_private.move_core(p_tenant,p_product,p_location,p_type,p_quantity,p_reason,p_note)
$$;

-- Internal modules are called only from stockinho_operate, after authorization/idempotency.
create or replace function stockinho_private.valid_document(d text) returns boolean language plpgsql immutable set search_path='' as $$
declare sz integer;i integer;sm integer;w integer;digit integer;
begin
 if d='' then return true; end if;
 if d is null or length(d) not in (11,14) or d!~'^[0-9]+$' or d=repeat(left(d,1),length(d)) then return false; end if;
 for sz in length(d)-2..length(d)-1 loop
   sm:=0;
   for i in 1..sz loop
     w:=case when length(d)=11 then sz+2-i else mod(sz-i,8)+2 end;
     sm:=sm+substring(d,i,1)::integer*w;
   end loop;
   digit:=case when length(d)=11 then mod(mod(sm*10,11),10) when mod(sm,11)<2 then 0 else 11-mod(sm,11) end;
   if substring(d,sz+1,1)::integer<>digit then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function stockinho_private.valid_document(text) from public;
create or replace function stockinho_private.stock_operation(t uuid,a text,d jsonb,op uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
<<operation_vars>>
declare rid uuid;rowid uuid;item jsonb;prod public.sk_products;inv public.sk_inventories;ord public.sk_purchase_orders;
 line public.sk_purchase_items;cnt numeric;delta numeric;batch uuid;dest_batch uuid;b public.sk_batches;
 subtotal numeric:=0;freight numeric;discount numeric;unit_cost numeric;total_qty numeric;loc uuid;target uuid;
 created_count integer:=0;updated_count integer:=0;skipped_count integer:=0;row_index integer:=1;
begin
 if a='primary_operator' then
   rid:=(d->>'user_id')::uuid;
   if not exists(select 1 from public.sk_memberships where tenant_id=t and user_id=rid and role='admin') then raise exception 'Escolha um administrador da empresa'; end if;
   update public.sk_companies set primary_user_id=rid where id=t;
 elsif a='expiry_settings' then
   if not stockinho_private.is_pro(t) then raise exception 'Configurações de validade exigem Pro'; end if;
   update public.sk_companies set expiry_alert_days=(d->>'days')::integer where id=t;
   rid:=t;
 elsif a='location_default' then
   if not stockinho_private.is_pro(t) then raise exception 'Alterar o local padrão exige Pro'; end if;
   rid:=(d->>'id')::uuid;
   if not exists(select 1 from public.sk_locations where tenant_id=t and id=rid and active) then raise exception 'Local inválido'; end if;
   update public.sk_locations set is_default=false where tenant_id=t and is_default;
   update public.sk_locations set is_default=true where tenant_id=t and id=rid;
 elsif a='barcode_associate' then
   if length(trim(d->>'barcode')) not between 1 and 60 then raise exception 'Código inválido'; end if;
   update public.sk_products set barcode=trim(d->>'barcode') where tenant_id=t and id=(d->>'product_id')::uuid and active returning id into rid;
   if rid is null then raise exception 'Produto inválido'; end if;
 elsif a='movement' then
   rid:=stockinho_private.move_core(t,(d->>'product_id')::uuid,(d->>'location_id')::uuid,d->>'type',(d->>'quantity')::numeric,d->>'reason',d->>'note',nullif(d->>'batch_id','')::uuid,'manual',op,nullif(d->>'unit_cost','')::numeric);
 elsif a='transfer' then
   if not stockinho_private.is_pro(t) then raise exception 'Transferências exigem Pro'; end if;
   loc:=(d->>'location_id')::uuid;target:=(d->>'destination_id')::uuid;
   if loc=target or loc is null or target is null then raise exception 'Origem e destino devem ser diferentes'; end if;
   batch:=nullif(d->>'batch_id','')::uuid;
   if batch is not null then
     select * into b from public.sk_batches where tenant_id=t and id=batch and product_id=(d->>'product_id')::uuid and location_id=loc;
     if b.id is null then raise exception 'Lote inválido'; end if;
     insert into public.sk_batches(tenant_id,product_id,location_id,code,manufactured_on,expires_on,source_order_id)
     values(t,b.product_id,target,b.code,b.manufactured_on,b.expires_on,b.source_order_id) on conflict do nothing;
     select id into dest_batch from public.sk_batches where tenant_id=t and product_id=b.product_id and location_id=target and code=b.code
       and expires_on=b.expires_on and manufactured_on is not distinct from b.manufactured_on and source_order_id is not distinct from b.source_order_id;
     if dest_batch is null then raise exception 'Lote de destino possui origem ou validade diferente'; end if;
   end if;
   perform stockinho_private.move_core(t,(d->>'product_id')::uuid,loc,'saida',(d->>'quantity')::numeric,'Devolução',d->>'note',batch,'transfer_out',op);
   perform stockinho_private.move_core(t,(d->>'product_id')::uuid,target,'entrada',(d->>'quantity')::numeric,'Devolução',d->>'note',dest_batch,'transfer_in',op);
   rid:=op;
 elsif a='inventory_create' then
   loc:=(d->>'location_id')::uuid;
   if not exists(select 1 from public.sk_locations where tenant_id=t and id=loc and active and (is_default or stockinho_private.is_pro(t))) then raise exception 'Local não autorizado'; end if;
   if exists(select 1 from public.sk_inventories where tenant_id=t and location_id=loc and status not in ('completed','canceled')) then raise exception 'Já existe inventário aberto neste local'; end if;
   insert into public.sk_inventories(tenant_id,location_id,notes,created_by) values(t,loc,coalesce(d->>'notes',''),auth.uid()) returning id into rid;
   insert into public.sk_inventory_items(tenant_id,inventory_id,product_id,expected,unit_cost,batch_id)
   select t,rid,p.id,case when p.track_batches then lot.quantity else coalesce(bal.quantity,0) end,p.cost_price,lot.id from public.sk_products p
   left join public.sk_balances bal on bal.tenant_id=t and bal.product_id=p.id and bal.location_id=loc
   left join public.sk_batches lot on lot.tenant_id=t and lot.product_id=p.id and lot.location_id=loc and p.track_batches
   where p.tenant_id=t and p.active and (not p.track_batches or (stockinho_private.is_pro(t) and lot.id is not null)) and
   (not (d ? 'product_ids') or d->'product_ids' @> to_jsonb(p.id::text)) and
   (not (d ? 'category_id') or p.category_id=(d->>'category_id')::uuid);
   if not found then raise exception 'Nenhum produto elegível para contagem'; end if;
 elsif a in ('inventory_count','inventory_review','inventory_complete','inventory_cancel') then
   select * into inv from public.sk_inventories where tenant_id=t and id=(d->>'id')::uuid for update;
   if inv.id is null or inv.status in ('completed','canceled') then raise exception 'Inventário encerrado ou inválido'; end if;
   if not stockinho_private.is_pro(t) and not exists(select 1 from public.sk_locations where tenant_id=t and id=inv.location_id and is_default) then raise exception 'Local excedente somente leitura'; end if;
   rid:=inv.id;
   if a='inventory_count' then
     if inv.status='pending_review' then raise exception 'Inventário em revisão'; end if;
     for item in select * from jsonb_array_elements(d->'items') loop
       cnt:=(item->>'counted')::numeric;
       if cnt is null or cnt<0 or cnt>100000000 or cnt<>round(cnt,2) then raise exception 'Contagem inválida'; end if;
       update public.sk_inventory_items set counted=cnt,counted_by=auth.uid(),counted_at=now()
       where tenant_id=t and inventory_id=inv.id and product_id=(item->>'product_id')::uuid and batch_id is not distinct from nullif(item->>'batch_id','')::uuid;
       if not found then raise exception 'Produto fora do inventário'; end if;
     end loop;
     update public.sk_inventories set status='in_progress' where id=inv.id;
   elsif a='inventory_cancel' then update public.sk_inventories set status='canceled' where id=inv.id;
   else
     if exists(select 1 from public.sk_inventory_items where inventory_id=inv.id and counted is null) then raise exception 'Conte todos os produtos antes de revisar'; end if;
     if a='inventory_review' then update public.sk_inventories set status='pending_review' where id=inv.id;
     else
       if inv.status<>'pending_review' then raise exception 'Revise as divergências antes de confirmar'; end if;
       -- Optimistic snapshot: any intervening movement on a counted product invalidates completion.
       -- Restart instead of overwriting a balance or guessing the time of physical counting.
       if exists(select 1 from public.sk_movements m join public.sk_inventory_items i on i.tenant_id=t and i.inventory_id=inv.id and i.product_id=m.product_id
         where m.tenant_id=t and m.location_id=inv.location_id and m.created_at>=inv.created_at) then raise exception 'Houve movimentações após o início. Cancele e reinicie a contagem'; end if;
       for item in select to_jsonb(i) from public.sk_inventory_items i where inventory_id=inv.id order by product_id loop
         delta:=(item->>'counted')::numeric-(item->>'expected')::numeric;
         if delta<>0 then perform stockinho_private.move_core(t,(item->>'product_id')::uuid,inv.location_id,case when delta>0 then 'entrada' else 'saida' end,abs(delta),'Ajuste de inventário',inv.notes,(item->>'batch_id')::uuid,'inventory',inv.id); end if;
       end loop;
       update public.sk_inventories set status='completed',completed_at=now() where id=inv.id;
     end if;
   end if;
 elsif a='supplier_save' then
   if not stockinho_private.is_pro(t) then raise exception 'Fornecedores exigem Pro'; end if;
   if not stockinho_private.valid_document(coalesce(d->>'document','')) then raise exception 'CPF/CNPJ inválido'; end if;
   rid:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());
   if exists(select 1 from public.sk_suppliers where id=rid and tenant_id<>t) then raise exception 'Fornecedor inválido'; end if;
   insert into public.sk_suppliers(id,tenant_id,name,trade_name,document,email,phone,address,contact,lead_days,notes,active)
   values(rid,t,d->>'name',coalesce(d->>'trade_name',''),coalesce(d->>'document',''),coalesce(d->>'email',''),coalesce(d->>'phone',''),coalesce(d->>'address',''),coalesce(d->>'contact',''),coalesce((d->>'lead_days')::integer,0),coalesce(d->>'notes',''),coalesce((d->>'active')::boolean,true))
   on conflict(id) do update set name=excluded.name,trade_name=excluded.trade_name,document=excluded.document,email=excluded.email,phone=excluded.phone,address=excluded.address,contact=excluded.contact,lead_days=excluded.lead_days,notes=excluded.notes,active=excluded.active where sk_suppliers.tenant_id=t;
 elsif a='supplier_link' then
   if not stockinho_private.is_pro(t) then raise exception 'Fornecedores exigem Pro'; end if;
   insert into public.sk_supplier_products(tenant_id,product_id,supplier_id) values(t,(d->>'product_id')::uuid,(d->>'supplier_id')::uuid) on conflict do nothing;
   rid:=op;
 elsif a='purchase_create' then
   if not stockinho_private.is_pro(t) then raise exception 'Pedidos de compra exigem Pro'; end if;
   if not exists(select 1 from public.sk_suppliers where tenant_id=t and id=(d->>'supplier_id')::uuid and active) then raise exception 'Fornecedor inválido'; end if;
   if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') not between 1 and 200 then raise exception 'Itens inválidos'; end if;
   for item in select * from jsonb_array_elements(d->'items') loop
     cnt:=(item->>'quantity')::numeric;unit_cost:=(item->>'unit_cost')::numeric;
     if cnt is null or cnt<=0 or cnt>100000000 or cnt<>round(cnt,2) or unit_cost is null or unit_cost<0 or unit_cost>100000000 or unit_cost<>round(unit_cost,2) then raise exception 'Quantidade ou custo inválido'; end if;
     if not exists(select 1 from public.sk_products where tenant_id=t and id=(item->>'product_id')::uuid and active) then raise exception 'Produto inválido'; end if;
     subtotal:=subtotal+round(cnt*unit_cost,2);
   end loop;
   freight:=coalesce((d->>'freight')::numeric,0);discount:=coalesce((d->>'discount')::numeric,0);
   if discount>subtotal or freight<0 or discount<0 then raise exception 'Frete ou desconto inválido'; end if;
   if d ? 'id' then
     select * into ord from public.sk_purchase_orders where tenant_id=t and id=(d->>'id')::uuid for update;
     if ord.id is null or ord.status<>'draft' then raise exception 'Somente rascunhos podem ser editados'; end if;
     rid:=ord.id;
     delete from public.sk_purchase_items where tenant_id=t and order_id=rid;
     update public.sk_purchase_orders set supplier_id=(d->>'supplier_id')::uuid,location_id=(d->>'location_id')::uuid,
       freight=operation_vars.freight,discount=operation_vars.discount,total=subtotal+operation_vars.freight-operation_vars.discount,
       expected_on=nullif(d->>'expected_on','')::date,notes=coalesce(d->>'notes','') where id=rid and tenant_id=t;
   else
   insert into public.sk_purchase_orders(tenant_id,supplier_id,location_id,freight,discount,total,expected_on,notes,created_by)
   values(t,(d->>'supplier_id')::uuid,(d->>'location_id')::uuid,freight,discount,subtotal+freight-discount,nullif(d->>'expected_on','')::date,coalesce(d->>'notes',''),auth.uid()) returning id into rid;
   end if;
   for item in select * from jsonb_array_elements(d->'items') loop
     insert into public.sk_purchase_items(tenant_id,order_id,product_id,quantity,unit_cost) values(t,rid,(item->>'product_id')::uuid,(item->>'quantity')::numeric,(item->>'unit_cost')::numeric);
   end loop;
 elsif a in ('purchase_confirm','purchase_cancel','purchase_receive') then
   if not stockinho_private.is_pro(t) then raise exception 'Pedidos de compra exigem Pro'; end if;
   select * into ord from public.sk_purchase_orders where tenant_id=t and id=(d->>'id')::uuid for update;
   if ord.id is null then raise exception 'Pedido inválido'; end if;
   rid:=ord.id;
   if a='purchase_confirm' then
     if ord.status<>'draft' then raise exception 'Somente rascunhos podem ser confirmados'; end if;
     update public.sk_purchase_orders set status='confirmed' where id=ord.id;
   elsif a='purchase_cancel' then
     if ord.status not in ('draft','confirmed') then raise exception 'Pedido recebido não pode ser cancelado. Registre devolução auditada'; end if;
     update public.sk_purchase_orders set status='canceled' where id=ord.id;
   else
     if ord.status not in ('confirmed','partially_received') then raise exception 'Pedido não pode receber mercadorias neste estado'; end if;
     if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') not between 1 and 200 then raise exception 'Recebimento vazio'; end if;
     select sum(pi.quantity*pi.unit_cost) into subtotal from public.sk_purchase_items pi where pi.order_id=ord.id;
     select sum(quantity) into total_qty from public.sk_purchase_items where order_id=ord.id;
     for item in select * from jsonb_array_elements(d->'items') loop
       select * into line from public.sk_purchase_items where tenant_id=t and order_id=ord.id and product_id=(item->>'product_id')::uuid for update;
       cnt:=(item->>'quantity')::numeric;
       if line.id is null or cnt is null or cnt<=0 or cnt<>round(cnt,2) or cnt>line.quantity-line.received then raise exception 'Quantidade recebida excede o saldo do pedido'; end if;
       batch:=null;
       if exists(select 1 from public.sk_products where id=line.product_id and track_batches) then
         insert into public.sk_batches(tenant_id,product_id,location_id,code,manufactured_on,expires_on,source_order_id)
         values(t,line.product_id,ord.location_id,item->>'batch_code',nullif(item->>'manufactured_on','')::date,(item->>'expires_on')::date,ord.id)
         on conflict(tenant_id,product_id,location_id,code) do nothing;
         select id into batch from public.sk_batches where tenant_id=t and product_id=line.product_id and location_id=ord.location_id and code=item->>'batch_code' and expires_on=(item->>'expires_on')::date and source_order_id=ord.id;
         if batch is null then raise exception 'Lote possui origem ou validade diferente'; end if;
       end if;
       -- Allocate freight/discount by line value; zero-value orders use quantity.
       unit_cost:=round(line.unit_cost+case when subtotal>0 then (ord.freight-ord.discount)*line.unit_cost/subtotal else ord.freight/total_qty end,6);
       if unit_cost<0 then raise exception 'Desconto gera custo negativo em um item'; end if;
       perform stockinho_private.move_core(t,line.product_id,ord.location_id,'entrada',cnt,'Compra',left('Recebimento '||ord.id||' · '||coalesce(d->>'note',''),500),batch,'purchase',ord.id,unit_cost);
       update public.sk_purchase_items set received=received+cnt where id=line.id;
       insert into public.sk_supplier_products(tenant_id,product_id,supplier_id,last_cost,last_purchase_at) values(t,line.product_id,ord.supplier_id,unit_cost,now())
       on conflict(tenant_id,product_id,supplier_id) do update set last_cost=excluded.last_cost,last_purchase_at=excluded.last_purchase_at;
     end loop;
     update public.sk_purchase_orders set status=case when exists(select 1 from public.sk_purchase_items where order_id=ord.id and received<quantity) then 'partially_received' else 'received' end,received_at=now() where id=ord.id;
   end if;
 elsif a='batch_create' then
   if not stockinho_private.is_pro(t) then raise exception 'Lotes exigem Pro'; end if;
   if not exists(select 1 from public.sk_products where tenant_id=t and id=(d->>'product_id')::uuid and track_batches and active) then raise exception 'Produto sem controle de lotes'; end if;
   insert into public.sk_batches(tenant_id,product_id,location_id,code,manufactured_on,expires_on)
   values(t,(d->>'product_id')::uuid,(d->>'location_id')::uuid,d->>'code',nullif(d->>'manufactured_on','')::date,(d->>'expires_on')::date) returning id into rid;
 elsif a='import' then
   if jsonb_typeof(d->'rows') is distinct from 'array' or jsonb_array_length(d->'rows') not between 1 and 2000 then raise exception 'Importe de 1 a 2.000 linhas'; end if;
   if not stockinho_private.is_pro(t) and (jsonb_array_length(d->'rows')>50 or exists(select 1 from public.sk_operations where tenant_id=t and action='import' and result is not null)) then raise exception 'Free permite uma importação inicial de até 50 produtos'; end if;
   for item in select * from jsonb_array_elements(d->'rows') loop
     row_index:=row_index+1;
     begin
     rowid:=null;
     loc:=coalesce(nullif(item->>'location_id','')::uuid,(d->>'location_id')::uuid);
     if coalesce(item->>'sku','')<>'' then select id into rowid from public.sk_products where tenant_id=t and sku=item->>'sku'; end if;
     if rowid is null and coalesce(item->>'barcode','')<>'' then select id into rowid from public.sk_products where tenant_id=t and barcode=item->>'barcode'; end if;
     if rowid is not null then
       if d->>'conflict'='skip' then skipped_count:=skipped_count+1;continue; end if;
       if d->>'conflict'<>'update' or not stockinho_private.is_pro(t) then raise exception 'SKU ou código já cadastrado'; end if;
       if coalesce((item->>'quantity')::numeric,0)<>0 then raise exception 'Atualizações não podem redefinir saldo inicial'; end if;
       update public.sk_products set name=item->>'name',sku=coalesce(item->>'sku',''),barcode=coalesce(item->>'barcode',''),category_id=(item->>'category_id')::uuid,
         unit=item->>'unit',sale_price=coalesce((item->>'sale_price')::numeric,0),min_quantity=coalesce((item->>'min_quantity')::numeric,0) where tenant_id=t and id=rowid;
       updated_count:=updated_count+1;
     else
       insert into public.sk_products(tenant_id,name,sku,barcode,category_id,unit,cost_price,sale_price,min_quantity)
       values(t,item->>'name',coalesce(item->>'sku',''),coalesce(item->>'barcode',''),(item->>'category_id')::uuid,item->>'unit',coalesce((item->>'cost_price')::numeric,0),coalesce((item->>'sale_price')::numeric,0),coalesce((item->>'min_quantity')::numeric,0)) returning id into rowid;
       cnt:=coalesce((item->>'quantity')::numeric,0);
       if cnt<0 then raise exception 'Quantidade inicial inválida'; end if;
       if cnt>0 then perform stockinho_private.move_core(t,rowid,loc,'entrada',cnt,'Ajuste inicial','Importação de planilha',null,'import',op); end if;
       created_count:=created_count+1;
     end if;
     if nullif(item->>'supplier_id','') is not null then
       if not stockinho_private.is_pro(t) then raise exception 'Relacionar fornecedores exige Pro'; end if;
       if not exists(select 1 from public.sk_suppliers where tenant_id=t and id=(item->>'supplier_id')::uuid and active) then raise exception 'Fornecedor inválido'; end if;
       insert into public.sk_supplier_products(tenant_id,product_id,supplier_id) values(t,rowid,(item->>'supplier_id')::uuid) on conflict do nothing;
     end if;
     exception when others then raise exception 'Linha %: %',row_index,sqlerrm; end;
   end loop;
   rid:=op;
 else raise exception 'Operação desconhecida'; end if;
 if a='import' then return jsonb_build_object('id',rid,'created',created_count,'updated',updated_count,'skipped',skipped_count); end if;
 return jsonb_build_object('id',rid);
end $$;
revoke all on function stockinho_private.stock_operation(uuid,text,jsonb,uuid) from public,authenticated;

create or replace function public.stockinho_operate(p_tenant uuid,p_action text,p_key uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prev public.sk_operations;op uuid;res jsonb;
begin
 if not stockinho_private.member(p_tenant,p_action<>'movement') then raise exception 'Empresa não autorizada ou ação exige administrador'; end if;
 if not stockinho_private.can_write(p_tenant) then raise exception 'No Free apenas o usuário principal pode operar'; end if;
 if p_key is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2000000 then raise exception 'Requisição inválida'; end if;
 perform pg_advisory_xact_lock(hashtext('stock:'||p_tenant::text));
 select * into prev from public.sk_operations where tenant_id=p_tenant and request_key=p_key;
 if prev.id is not null then
   if prev.action<>p_action or (prev.payload<>p_data and prev.payload<>jsonb_build_object('sha256',encode(sha256(convert_to(p_data::text,'UTF8')),'hex'))) then raise exception 'Chave já utilizada para outra operação'; end if;
   return prev.result;
 end if;
 insert into public.sk_operations(tenant_id,request_key,action,payload,created_by) values(p_tenant,p_key,p_action,jsonb_build_object('sha256',encode(sha256(convert_to(p_data::text,'UTF8')),'hex')),auth.uid()) returning id into op;
 res:=stockinho_private.stock_operation(p_tenant,p_action,p_data,op);
 update public.sk_operations set result=res where id=op;
 return res;
end $$;
revoke all on function public.stockinho_operate(uuid,text,uuid,jsonb) from public;
grant execute on function public.stockinho_operate(uuid,text,uuid,jsonb) to authenticated;

create or replace function public.stockinho_entitlements(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pro boolean;
begin
 if not stockinho_private.member(p_tenant) then raise exception 'Empresa não autorizada'; end if;
 pro:=stockinho_private.is_pro(p_tenant);
 return jsonb_build_object('pro',pro,'can_write',stockinho_private.can_write(p_tenant),'primary_user_id',(select primary_user_id from public.sk_companies where id=p_tenant),'product_limit',case when pro then 2000 else 50 end,'location_limit',case when pro then 3 else 1 end,
 'user_limit',case when pro then 3 else 1 end,
 'product_count',(select count(*) from public.sk_products where tenant_id=p_tenant and active),
 'member_count',(select count(*) from public.sk_memberships where tenant_id=p_tenant),
 'location_count',(select count(*) from public.sk_locations where tenant_id=p_tenant and active),
 'ai_used',coalesce((select used from public.sk_billing_usage where organization_id=p_tenant and metric='ai_queries' and period_start=date_trunc('month',now() at time zone 'UTC')::date),0),
 'expiry_alert_days',(select expiry_alert_days from public.sk_companies where id=p_tenant),
 'initial_import_used',exists(select 1 from public.sk_operations where tenant_id=p_tenant and action='import' and result is not null));
end $$;
revoke all on function public.stockinho_entitlements(uuid) from public;
grant execute on function public.stockinho_entitlements(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
