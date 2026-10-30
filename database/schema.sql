-- Stockinho: execute uma vez em um projeto Supabase dedicado.
-- Esquema inicial versionado. Não requer chave service_role na aplicação.
begin;
create schema if not exists stockinho_private;
revoke all on schema stockinho_private from public;
grant usage on schema stockinho_private to authenticated;
create table public.sk_companies(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 150),created_at timestamptz not null default now());
create table public.sk_memberships(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),user_id uuid not null references auth.users(id),role text not null check(role in ('admin','operator')),unique(tenant_id,user_id));
create index sk_memberships_user on public.sk_memberships(user_id,tenant_id);
create table public.sk_locations(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),name text not null check(length(trim(name)) between 1 and 150),type text not null check(type in ('Loja','Depósito')),address text not null default '',unique(tenant_id,id));
create table public.sk_categories(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),name text not null check(length(trim(name)) between 1 and 150),color text not null default '#179c72' check(color ~ '^#[0-9a-fA-F]{6}$'),unique(tenant_id,id),unique(tenant_id,name));
create table public.sk_products(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),category_id uuid not null,name text not null check(length(trim(name)) between 1 and 150),barcode text not null default '',unit text not null check(unit in ('un','kg','L','cx')),cost_price numeric(14,2) not null default 0 check(cost_price>=0),sale_price numeric(14,2) not null default 0 check(sale_price>=0),min_quantity numeric(14,2) not null default 0 check(min_quantity>=0),image_url text,active boolean not null default true,unique(tenant_id,id),foreign key(tenant_id,category_id) references public.sk_categories(tenant_id,id));
create unique index sk_products_barcode on public.sk_products(tenant_id,barcode) where barcode<>'';
create index sk_products_category on public.sk_products(tenant_id,category_id);
create table public.sk_balances(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,product_id uuid not null,location_id uuid not null,quantity numeric(14,2) not null default 0 check(quantity>=0),unique(tenant_id,product_id,location_id),foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id),foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id));
create table public.sk_movements(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,product_id uuid not null,location_id uuid not null,type text not null check(type in ('entrada','saida')),quantity numeric(14,2) not null check(quantity>0),reason text not null check(reason in ('Compra','Venda','Ajuste inicial','Devolução','Perda','Ajuste de inventário')),note text not null default '' check(length(note)<=500),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id),foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id));
create index sk_movements_tenant_date on public.sk_movements(tenant_id,location_id,created_at desc);
create index sk_movements_product on public.sk_movements(tenant_id,product_id);
create table public.sk_sales(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.sk_companies(id),location_id uuid not null,subtotal numeric(14,2) not null check(subtotal>=0),payment_method text not null check(payment_method in ('system','credit','debit')),installments integer not null default 1 check(installments between 1 and 12),external_order_id text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id));
create table public.sk_sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid not null references public.sk_sales(id) on delete cascade,tenant_id uuid not null,product_id uuid not null,quantity numeric(14,2) not null check(quantity>0),unit_price numeric(14,2) not null check(unit_price>=0),foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id));
alter table public.sk_sales enable row level security;
alter table public.sk_sale_items enable row level security;
revoke all on public.sk_sales,public.sk_sale_items from anon,authenticated;
grant select on public.sk_sales,public.sk_sale_items to authenticated;
-- Consulta de associação interna: evita recursão RLS e não usa metadados editáveis.
create function stockinho_private.member(t uuid,admin_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.sk_memberships where tenant_id=t and user_id=auth.uid() and (not admin_only or role='admin'));
$$;
create policy sale_read on public.sk_sales for select to authenticated using(stockinho_private.member(tenant_id));
create policy sale_item_read on public.sk_sale_items for select to authenticated using(stockinho_private.member(tenant_id));
insert into storage.buckets(id,name,public) values('product-images','product-images',true) on conflict(id) do update set public=true;
create policy product_image_read on storage.objects for select to public using(bucket_id='product-images');
create policy product_image_write on storage.objects for insert to authenticated with check(bucket_id='product-images' and stockinho_private.member((split_part(name,'/',1))::uuid,true));
create policy product_image_update on storage.objects for update to authenticated using(bucket_id='product-images' and stockinho_private.member((split_part(name,'/',1))::uuid,true));
revoke all on function stockinho_private.member(uuid,boolean) from public;
grant execute on function stockinho_private.member(uuid,boolean) to authenticated;
alter table public.sk_companies enable row level security;
alter table public.sk_memberships enable row level security;
alter table public.sk_locations enable row level security;
alter table public.sk_categories enable row level security;
alter table public.sk_products enable row level security;
alter table public.sk_balances enable row level security;
alter table public.sk_movements enable row level security;
create policy company_read on public.sk_companies for select to authenticated using(stockinho_private.member(id));
create policy membership_self on public.sk_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy location_read on public.sk_locations for select to authenticated using(stockinho_private.member(tenant_id));
create policy location_insert on public.sk_locations for insert to authenticated with check(stockinho_private.member(tenant_id,true));
create policy location_update on public.sk_locations for update to authenticated using(stockinho_private.member(tenant_id,true)) with check(stockinho_private.member(tenant_id,true));
create policy category_read on public.sk_categories for select to authenticated using(stockinho_private.member(tenant_id));
create policy category_insert on public.sk_categories for insert to authenticated with check(stockinho_private.member(tenant_id,true));
create policy category_update on public.sk_categories for update to authenticated using(stockinho_private.member(tenant_id,true)) with check(stockinho_private.member(tenant_id,true));
create policy category_delete on public.sk_categories for delete to authenticated using(stockinho_private.member(tenant_id,true));
create policy product_read on public.sk_products for select to authenticated using(stockinho_private.member(tenant_id));
create policy product_insert on public.sk_products for insert to authenticated with check(stockinho_private.member(tenant_id,true));
create policy product_update on public.sk_products for update to authenticated using(stockinho_private.member(tenant_id,true)) with check(stockinho_private.member(tenant_id,true));
create policy balance_read on public.sk_balances for select to authenticated using(stockinho_private.member(tenant_id));
create policy movement_read on public.sk_movements for select to authenticated using(stockinho_private.member(tenant_id));
revoke all on public.sk_companies,public.sk_memberships,public.sk_locations,public.sk_categories,public.sk_products,public.sk_balances,public.sk_movements from anon,authenticated;
grant select on public.sk_companies,public.sk_memberships,public.sk_locations,public.sk_categories,public.sk_products,public.sk_balances,public.sk_movements to authenticated;
grant insert,update on public.sk_products,public.sk_locations,public.sk_categories to authenticated;
grant delete on public.sk_categories to authenticated;
-- Impede reatribuição de registros e alteração dos identificadores de empresa.
create function stockinho_private.fixed_tenant() returns trigger language plpgsql set search_path='' as $$begin if new.tenant_id<>old.tenant_id or new.id<>old.id then raise exception 'A empresa e o identificador não podem ser alterados.';end if;return new;end$$;
create trigger sk_products_tenant before update on public.sk_products for each row execute function stockinho_private.fixed_tenant();
create trigger sk_categories_tenant before update on public.sk_categories for each row execute function stockinho_private.fixed_tenant();
create trigger sk_locations_tenant before update on public.sk_locations for each row execute function stockinho_private.fixed_tenant();
create function stockinho_private.archive_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin if not new.active and exists(select 1 from public.sk_balances where product_id=old.id and quantity>0) then raise exception 'O produto ainda possui saldo em uma unidade.';end if;return new;end$$;
create trigger sk_products_archive before update on public.sk_products for each row execute function stockinho_private.archive_guard();
create function stockinho_private.create_company(company_name text) returns uuid language plpgsql security definer set search_path='' as $$declare t uuid;begin
if auth.uid() is null then raise exception 'Autenticação obrigatória';end if;
insert into public.sk_companies(name) values(trim(company_name)) returning id into t;
insert into public.sk_memberships(tenant_id,user_id,role) values(t,auth.uid(),'admin');
return t;end$$;
create function public.stockinho_create_company(company_name text) returns uuid language sql security invoker set search_path='' as $$select stockinho_private.create_company(company_name)$$;
-- Escrita atômica: lock do produto e do saldo, com auditoria na mesma transação.
create function stockinho_private.move(p_tenant uuid,p_product uuid,p_location uuid,p_type text,p_quantity numeric,p_reason text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$declare current_qty numeric;movement_id uuid;begin
if auth.uid() is null or not stockinho_private.member(p_tenant) then raise exception 'Empresa não autorizada';end if;
if p_type not in ('entrada','saida') or p_quantity is null or p_quantity<=0 or p_quantity>100000000 or p_quantity<>round(p_quantity,2) then raise exception 'Tipo ou quantidade inválida';end if;
if (p_type='entrada' and p_reason in ('Venda','Perda')) or (p_type='saida' and p_reason in ('Compra','Ajuste inicial')) then raise exception 'Motivo incompatível com o tipo';end if;
perform 1 from public.sk_products where id=p_product and tenant_id=p_tenant and active for update;
if not found then raise exception 'Produto inválido ou arquivado';end if;
if not exists(select 1 from public.sk_locations where id=p_location and tenant_id=p_tenant) then raise exception 'Unidade não autorizada';end if;
insert into public.sk_balances(tenant_id,product_id,location_id,quantity) values(p_tenant,p_product,p_location,0) on conflict(tenant_id,product_id,location_id) do nothing;
select quantity into current_qty from public.sk_balances where tenant_id=p_tenant and product_id=p_product and location_id=p_location for update;
if p_type='saida' and current_qty<p_quantity then raise exception 'Estoque insuficiente';end if;
update public.sk_balances set quantity=quantity+case when p_type='entrada' then p_quantity else -p_quantity end where tenant_id=p_tenant and product_id=p_product and location_id=p_location;
insert into public.sk_movements(tenant_id,product_id,location_id,type,quantity,reason,note,created_by) values(p_tenant,p_product,p_location,p_type,p_quantity,p_reason,coalesce(p_note,''),auth.uid()) returning id into movement_id;
return movement_id;end$$;
create function public.stockinho_move(p_tenant uuid,p_product uuid,p_location uuid,p_type text,p_quantity numeric,p_reason text,p_note text default '') returns uuid language sql security invoker set search_path='' as $$select stockinho_private.move(p_tenant,p_product,p_location,p_type,p_quantity,p_reason,p_note)$$;
create function stockinho_private.sale(p_tenant uuid,p_location uuid,p_payment_method text,p_installments integer,p_external_order_id text,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare sale_id uuid;item jsonb;product_row record;total numeric:=0;qty numeric;begin
if auth.uid() is null or not stockinho_private.member(p_tenant) then raise exception 'Empresa não autorizada';end if;
if p_payment_method not in ('system','credit','debit') or p_installments<1 or p_installments>12 then raise exception 'Pagamento inválido';end if;
if not exists(select 1 from public.sk_locations where id=p_location and tenant_id=p_tenant) then raise exception 'Unidade não autorizada';end if;
if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'O carrinho está vazio';end if;
for item in select * from jsonb_array_elements(p_items) loop
select p.sale_price into product_row from public.sk_products p where p.id=(item->>'product_id')::uuid and p.tenant_id=p_tenant and p.active for update;
if not found then raise exception 'Produto inválido ou arquivado';end if;
qty:=(item->>'quantity')::numeric;
if qty is null or qty<=0 or qty<>round(qty,2) then raise exception 'Quantidade inválida';end if;
total:=total+(product_row.sale_price*qty);
end loop;
insert into public.sk_sales(tenant_id,location_id,subtotal,payment_method,installments,external_order_id,created_by) values(p_tenant,p_location,total,p_payment_method,p_installments,p_external_order_id,auth.uid()) returning id into sale_id;
for item in select * from jsonb_array_elements(p_items) loop
qty:=(item->>'quantity')::numeric;
select sale_price into product_row from public.sk_products where id=(item->>'product_id')::uuid and tenant_id=p_tenant;
perform stockinho_private.move(p_tenant,(item->>'product_id')::uuid,p_location,'saida',qty,'Venda','Venda '||sale_id::text);
insert into public.sk_sale_items(sale_id,tenant_id,product_id,quantity,unit_price) values(sale_id,p_tenant,(item->>'product_id')::uuid,qty,product_row.sale_price);
end loop;
return sale_id;end$$;
create function public.stockinho_sale(p_tenant uuid,p_location uuid,p_payment_method text,p_installments integer,p_external_order_id text,p_items jsonb) returns uuid language sql security invoker set search_path='' as $$select stockinho_private.sale(p_tenant,p_location,p_payment_method,p_installments,p_external_order_id,p_items)$$;
create function stockinho_private.list_members(p_tenant uuid) returns table(id uuid,tenant_id uuid,user_id uuid,email text,role text) language sql security definer set search_path='' as $$select m.id,m.tenant_id,m.user_id,u.email,m.role from public.sk_memberships m join auth.users u on u.id=m.user_id where m.tenant_id=p_tenant and stockinho_private.member(p_tenant)$$;
create function public.stockinho_list_members(p_tenant uuid) returns table(id uuid,tenant_id uuid,user_id uuid,email text,role text) language sql security invoker set search_path='' as $$select * from stockinho_private.list_members(p_tenant)$$;
create function stockinho_private.add_member(p_tenant uuid,p_email text,p_role text) returns void language plpgsql security definer set search_path='' as $$declare member_id uuid;begin
if auth.uid() is null or not stockinho_private.member(p_tenant,true) then raise exception 'Apenas administradores podem adicionar membros';end if;
if p_role not in ('admin','operator') then raise exception 'Papel inválido';end if;
select id into member_id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
if member_id is null then raise exception 'O usuário deve criar e confirmar sua conta primeiro';end if;
if member_id=auth.uid() then raise exception 'Não é possível alterar seu próprio papel';end if;
insert into public.sk_memberships(tenant_id,user_id,role) values(p_tenant,member_id,p_role) on conflict(tenant_id,user_id) do update set role=excluded.role;
end$$;
create function public.stockinho_add_member(p_tenant uuid,p_email text,p_role text) returns void language sql security invoker set search_path='' as $$select stockinho_private.add_member(p_tenant,p_email,p_role)$$;
revoke all on function stockinho_private.create_company(text),stockinho_private.move(uuid,uuid,uuid,text,numeric,text,text),stockinho_private.sale(uuid,uuid,text,integer,text,jsonb),stockinho_private.add_member(uuid,text,text),stockinho_private.fixed_tenant(),stockinho_private.archive_guard() from public;
revoke all on function stockinho_private.list_members(uuid),public.stockinho_list_members(uuid),public.stockinho_create_company(text),public.stockinho_move(uuid,uuid,uuid,text,numeric,text,text),public.stockinho_add_member(uuid,text,text) from public;
grant execute on function stockinho_private.create_company(text),stockinho_private.move(uuid,uuid,uuid,text,numeric,text,text),stockinho_private.sale(uuid,uuid,text,integer,text,jsonb),stockinho_private.add_member(uuid,text,text) to authenticated;
grant execute on function stockinho_private.list_members(uuid),public.stockinho_list_members(uuid),public.stockinho_create_company(text),public.stockinho_move(uuid,uuid,uuid,text,numeric,text,text),public.stockinho_add_member(uuid,text,text) to authenticated;
commit;
