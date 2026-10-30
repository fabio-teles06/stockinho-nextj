-- Stockinho: alterações para bancos já existentes.
-- Execute uma única vez no SQL Editor do Supabase.
begin;

alter table public.sk_products
  add column if not exists image_url text;

create table if not exists public.sk_sales(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.sk_companies(id),
  location_id uuid not null,
  subtotal numeric(14,2) not null check(subtotal>=0),
  payment_method text not null check(payment_method in ('system','credit','debit')),
  installments integer not null default 1 check(installments between 1 and 12),
  external_order_id text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,location_id) references public.sk_locations(tenant_id,id)
);

create table if not exists public.sk_sale_items(
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sk_sales(id) on delete cascade,
  tenant_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,2) not null check(quantity>0),
  unit_price numeric(14,2) not null check(unit_price>=0),
  foreign key(tenant_id,product_id) references public.sk_products(tenant_id,id)
);

alter table public.sk_sales enable row level security;
alter table public.sk_sale_items enable row level security;

revoke all on public.sk_sales,public.sk_sale_items from anon,authenticated;
grant select on public.sk_sales,public.sk_sale_items to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sk_sales' and policyname='sale_read') then
    create policy sale_read on public.sk_sales for select to authenticated using(stockinho_private.member(tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sk_sale_items' and policyname='sale_item_read') then
    create policy sale_item_read on public.sk_sale_items for select to authenticated using(stockinho_private.member(tenant_id));
  end if;
end
$$;

insert into storage.buckets(id,name,public)
values('product-images','product-images',true)
on conflict(id) do update set public=true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='product_image_read') then
    create policy product_image_read on storage.objects for select to public using(bucket_id='product-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='product_image_write') then
    create policy product_image_write on storage.objects for insert to authenticated
      with check(bucket_id='product-images' and stockinho_private.member((split_part(name,'/',1))::uuid,true));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='product_image_update') then
    create policy product_image_update on storage.objects for update to authenticated
      using(bucket_id='product-images' and stockinho_private.member((split_part(name,'/',1))::uuid,true));
  end if;
end
$$;

create or replace function stockinho_private.sale(
  p_tenant uuid,
  p_location uuid,
  p_payment_method text,
  p_installments integer,
  p_external_order_id text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  sale_id uuid;
  item jsonb;
  product_row record;
  total numeric:=0;
  qty numeric;
begin
  if auth.uid() is null or not stockinho_private.member(p_tenant) then
    raise exception 'Empresa não autorizada';
  end if;
  if p_payment_method not in ('system','credit','debit') or p_installments<1 or p_installments>12 then
    raise exception 'Pagamento inválido';
  end if;
  if not exists(select 1 from public.sk_locations where id=p_location and tenant_id=p_tenant) then
    raise exception 'Unidade não autorizada';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'O carrinho está vazio';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    select p.sale_price into product_row
    from public.sk_products p
    where p.id=(item->>'product_id')::uuid and p.tenant_id=p_tenant and p.active
    for update;
    if not found then raise exception 'Produto inválido ou arquivado'; end if;
    qty:=(item->>'quantity')::numeric;
    if qty is null or qty<=0 or qty<>round(qty,2) then raise exception 'Quantidade inválida'; end if;
    total:=total+(product_row.sale_price*qty);
  end loop;
  insert into public.sk_sales(tenant_id,location_id,subtotal,payment_method,installments,external_order_id,created_by)
    values(p_tenant,p_location,total,p_payment_method,p_installments,p_external_order_id,auth.uid())
    returning id into sale_id;
  for item in select * from jsonb_array_elements(p_items) loop
    qty:=(item->>'quantity')::numeric;
    select sale_price into product_row from public.sk_products where id=(item->>'product_id')::uuid and tenant_id=p_tenant;
    perform stockinho_private.move(p_tenant,(item->>'product_id')::uuid,p_location,'saida',qty,'Venda','Venda '||sale_id::text);
    insert into public.sk_sale_items(sale_id,tenant_id,product_id,quantity,unit_price)
      values(sale_id,p_tenant,(item->>'product_id')::uuid,qty,product_row.sale_price);
  end loop;
  return sale_id;
end
$$;

create or replace function public.stockinho_sale(
  p_tenant uuid,
  p_location uuid,
  p_payment_method text,
  p_installments integer,
  p_external_order_id text,
  p_items jsonb
) returns uuid
language sql
security invoker
set search_path=''
as $$
  select stockinho_private.sale(p_tenant,p_location,p_payment_method,p_installments,p_external_order_id,p_items)
$$;

revoke all on function stockinho_private.sale(uuid,uuid,text,integer,text,jsonb) from public;
revoke all on function public.stockinho_sale(uuid,uuid,text,integer,text,jsonb) from public;
grant execute on function stockinho_private.sale(uuid,uuid,text,integer,text,jsonb) to authenticated;
grant execute on function public.stockinho_sale(uuid,uuid,text,integer,text,jsonb) to authenticated;

commit;
