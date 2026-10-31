-- Adiciona o documento fiscal exigido pelo Asaas para clientes de cobrança.
begin;

alter table public.sk_billing_customers
  add column if not exists cpf_cnpj text;

alter table public.sk_billing_customers
  drop constraint if exists sk_billing_customers_cpf_cnpj_check;

alter table public.sk_billing_customers
  add constraint sk_billing_customers_cpf_cnpj_check
  check (cpf_cnpj is null or length(cpf_cnpj) in (11,14));

commit;
