-- Public merchandising flag. Existing product RLS, MFA, revision and audit triggers apply.
set lock_timeout = '3s';
alter table public.products add column if not exists team_pick boolean not null default false;
comment on column public.products.team_pick is 'Team-curated item promoted in the recommended catalogue order.';
grant select (team_pick) on public.products to anon, authenticated;
grant insert (team_pick), update (team_pick) on public.products to authenticated;
