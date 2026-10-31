begin;
create table if not exists public.sk_account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 150),
  email text not null check(length(email) <= 254),
  cpf_cnpj text not null check(cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  updated_at timestamptz not null default now()
);
alter table public.sk_account_profiles enable row level security;
revoke all on public.sk_account_profiles from anon,authenticated;
grant all on public.sk_account_profiles to service_role;
commit;
