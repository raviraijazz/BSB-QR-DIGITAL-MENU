-- BSB Digital Menu — Phase 6A waiter authentication (additive).
-- Does not drop tables, does not change waiter_id or qr_token, does not weaken owner RLS.

alter table public.waiters
  alter column auth_user_id drop not null;

-- Waiter can read the one restaurant bound to their waiter row.
drop policy if exists "waiters read own restaurant" on public.restaurants;
create policy "waiters read own restaurant"
  on public.restaurants for select
  to authenticated
  using (id = public.current_waiter_restaurant_id());

-- Owner restaurant writes require profiles.role = owner. Waiters cannot create restaurants.
drop policy if exists "owners manage restaurants" on public.restaurants;
create policy "owners manage restaurants"
  on public.restaurants for all
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

-- Waiter can read tables assigned to them (QR token still unused in waiter UI).
drop policy if exists "waiters read assigned tables" on public.restaurant_tables;
create policy "waiters read assigned tables"
  on public.restaurant_tables for select
  to authenticated
  using (public.waiter_assigned_to_table(id));
