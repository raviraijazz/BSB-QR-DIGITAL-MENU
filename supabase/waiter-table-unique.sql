-- Additive. One physical table may have only one current waiter assignment.
-- Does not drop waiter_table_assignments or change restaurant_tables / qr_token.

create unique index if not exists waiter_table_assignments_table_id_key
  on public.waiter_table_assignments (table_id);
