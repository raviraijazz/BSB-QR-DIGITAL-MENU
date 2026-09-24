-- Additive. Lets owners create waiter records without browser Auth admin APIs.
-- Does not drop waiters, does not change waiter_id, does not recreate tables.

alter table public.waiters
  alter column auth_user_id drop not null;
