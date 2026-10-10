-- Separate from publicly readable products: no anonymous table privileges.
create table public.product_admin_notes (
 product_id bigint primary key references public.products(id) on delete cascade,
 note text not null check(char_length(note)<=5000),
 revision bigint not null default 1
);
alter table public.product_admin_notes enable row level security;
revoke all on public.product_admin_notes from public,anon,authenticated;
grant select,insert,update,delete on public.product_admin_notes to authenticated;
create policy "Store admins manage internal notes" on public.product_admin_notes
 for all to authenticated
 using(exists(select 1 from public.store_admins where user_id=(select auth.uid())) and (select store_private.admin_mfa_satisfied()))
 with check(exists(select 1 from public.store_admins where user_id=(select auth.uid())) and (select store_private.admin_mfa_satisfied()));
create trigger bump_admin_note_revision before update on public.product_admin_notes
 for each row execute function public.bump_product_revision();
