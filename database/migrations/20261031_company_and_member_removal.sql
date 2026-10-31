begin;

create or replace function stockinho_private.remove_member(p_tenant uuid, p_member uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target_user uuid;
begin
  perform 1 from public.sk_companies where id=p_tenant for update;
  if not stockinho_private.member(p_tenant,true) then
    raise exception 'Apenas administradores podem remover membros';
  end if;
  select user_id into target_user from public.sk_memberships where id=p_member and tenant_id=p_tenant;
  if target_user is null then raise exception 'Membro não encontrado nesta empresa'; end if;
  if target_user=auth.uid() then raise exception 'Não é possível remover seu próprio acesso'; end if;
  delete from public.sk_memberships where id=p_member and tenant_id=p_tenant;
end $$;

create or replace function stockinho_private.delete_company(p_tenant uuid)
returns void language plpgsql security definer set search_path='' as $$
declare has_subscription boolean := false;
begin
  perform 1 from public.sk_companies where id=p_tenant for update;
  if not stockinho_private.member(p_tenant,true) then
    raise exception 'Apenas administradores podem excluir empresas';
  end if;
  if to_regclass('public.sk_billing_subscriptions') is not null then
    execute 'select exists(select 1 from public.sk_billing_subscriptions where organization_id=$1 and provider_subscription_id is not null and status not in (''canceled'',''expired''))'
      into has_subscription using p_tenant;
    if has_subscription then raise exception 'Cancele a assinatura da empresa antes de excluí-la'; end if;
  end if;
  delete from public.sk_sale_items where tenant_id=p_tenant;
  delete from public.sk_sales where tenant_id=p_tenant;
  delete from public.sk_movements where tenant_id=p_tenant;
  delete from public.sk_balances where tenant_id=p_tenant;
  delete from public.sk_products where tenant_id=p_tenant;
  delete from public.sk_categories where tenant_id=p_tenant;
  delete from public.sk_locations where tenant_id=p_tenant;
  delete from public.sk_memberships where tenant_id=p_tenant;
  delete from public.sk_companies where id=p_tenant;
end $$;

create or replace function public.stockinho_remove_member(p_tenant uuid,p_member uuid)
returns void language sql security invoker set search_path='' as $$select stockinho_private.remove_member(p_tenant,p_member)$$;
create or replace function public.stockinho_delete_company(p_tenant uuid)
returns void language sql security invoker set search_path='' as $$select stockinho_private.delete_company(p_tenant)$$;
revoke all on function stockinho_private.remove_member(uuid,uuid),stockinho_private.delete_company(uuid),public.stockinho_remove_member(uuid,uuid),public.stockinho_delete_company(uuid) from public;
grant execute on function stockinho_private.remove_member(uuid,uuid),stockinho_private.delete_company(uuid),public.stockinho_remove_member(uuid,uuid),public.stockinho_delete_company(uuid) to authenticated;
-- Atualiza as funções disponíveis na API REST após o commit.
notify pgrst, 'reload schema';
commit;
