-- BSB Digital Menu — Phase 18 bill/receipt printing (additive).
-- Reuses restaurant_printer_profiles and restaurant_print_jobs from
-- supabase/kot-printing.sql. Does not recreate orders, sessions, bills,
-- payments, or KOT printing. Does not store secrets. Safe to re-run.

alter table public.restaurant_print_jobs
  add column if not exists bill_id uuid references public.bills (id) on delete cascade;

create index if not exists restaurant_print_jobs_bill_idx
  on public.restaurant_print_jobs (bill_id, created_at desc);

create unique index if not exists restaurant_print_jobs_bill_idempotent_idx
  on public.restaurant_print_jobs (restaurant_id, bill_id, printer_id, print_type)
  where is_reprint = false
    and print_type in ('bill', 'receipt')
    and bill_id is not null
    and printer_id is not null;
