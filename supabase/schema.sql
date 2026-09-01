-- Kasa keeps one JSON ledger (account hash, PIN hash, transactions).
-- The Node server calls kasa_load / kasa_save with KASA_STORE_SECRET.
-- Do not put that secret or the service_role key in the browser.

create table if not exists public.kasa_ledger (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.kasa_meta (
  id smallint primary key default 1 check (id = 1),
  store_secret text not null
);

alter table public.kasa_ledger enable row level security;
alter table public.kasa_meta enable row level security;

-- No table policies for anon or authenticated. Access is via the RPCs below.

create or replace function public.kasa_load(secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.kasa_meta
    where id = 1 and store_secret = kasa_load.secret
  ) then
    raise exception 'denied' using errcode = '42501';
  end if;
  return (select data from public.kasa_ledger where id = 1);
end;
$$;

create or replace function public.kasa_save(secret text, ledger jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.kasa_meta
    where id = 1 and store_secret = kasa_save.secret
  ) then
    raise exception 'denied' using errcode = '42501';
  end if;
  insert into public.kasa_ledger (id, data, updated_at)
  values (1, ledger, now())
  on conflict (id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.kasa_load(text) from public;
revoke all on function public.kasa_save(text, jsonb) from public;
grant execute on function public.kasa_load(text) to anon, authenticated, service_role;
grant execute on function public.kasa_save(text, jsonb) to anon, authenticated, service_role;
