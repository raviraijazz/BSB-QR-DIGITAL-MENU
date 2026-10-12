-- BSB Digital Menu — Phase 21 restaurant support & maintenance (additive).
-- Restaurant-scoped tickets, replies, reminders, feedback, and export logs.
-- Published release notes are read-only for restaurant owners.
-- Does not change orders, KOTs, bills, payments, settings, or waiter auth.
-- Does not grant platform-admin, deploy, backup, secret, or global infra access.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  ticket_number text not null,
  subject text not null,
  category text not null,
  description text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_subject_not_blank check (btrim(subject) <> ''),
  constraint support_tickets_subject_len check (char_length(subject) <= 120),
  constraint support_tickets_description_not_blank check (btrim(description) <> ''),
  constraint support_tickets_description_len check (char_length(description) <= 4000),
  constraint support_tickets_category_check check (
    category in (
      'orders_tables',
      'waiter_login',
      'kot_kitchen',
      'billing_payments',
      'printing',
      'reports_exports',
      'menu_categories',
      'settings',
      'other'
    )
  ),
  constraint support_tickets_priority_check check (priority in ('low', 'medium', 'high')),
  constraint support_tickets_status_check check (
    status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')
  ),
  constraint support_tickets_number_unique unique (restaurant_id, ticket_number)
);

create index if not exists support_tickets_restaurant_idx
  on public.support_tickets (restaurant_id, updated_at desc);

create index if not exists support_tickets_restaurant_status_idx
  on public.support_tickets (restaurant_id, status);

create table if not exists public.support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  author_role text not null default 'owner',
  author_user_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_ticket_replies_body_not_blank check (btrim(body) <> ''),
  constraint support_ticket_replies_body_len check (char_length(body) <= 4000),
  constraint support_ticket_replies_role_check check (author_role in ('owner', 'support'))
);

create index if not exists support_ticket_replies_ticket_idx
  on public.support_ticket_replies (ticket_id, created_at);

create index if not exists support_ticket_replies_restaurant_idx
  on public.support_ticket_replies (restaurant_id, created_at desc);

create table if not exists public.maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  task text not null,
  description text not null default '',
  due_at timestamptz not null,
  recurrence text not null default 'none',
  status text not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_reminders_task_not_blank check (btrim(task) <> ''),
  constraint maintenance_reminders_task_len check (char_length(task) <= 120),
  constraint maintenance_reminders_description_len check (char_length(description) <= 2000),
  constraint maintenance_reminders_recurrence_check check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  constraint maintenance_reminders_status_check check (status in ('open', 'completed', 'cancelled'))
);

create index if not exists maintenance_reminders_restaurant_idx
  on public.maintenance_reminders (restaurant_id, due_at);

create table if not exists public.restaurant_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  feedback_type text not null default 'suggestion',
  rating integer,
  message text not null,
  related_module text not null default 'other',
  created_at timestamptz not null default now(),
  constraint restaurant_feedback_message_not_blank check (btrim(message) <> ''),
  constraint restaurant_feedback_message_len check (char_length(message) <= 4000),
  constraint restaurant_feedback_type_check check (
    feedback_type in ('suggestion', 'issue', 'praise', 'other')
  ),
  constraint restaurant_feedback_rating_check check (rating is null or (rating >= 1 and rating <= 5)),
  constraint restaurant_feedback_module_check check (
    related_module in (
      'getting_started',
      'menu',
      'tables',
      'waiters',
      'orders_kot',
      'billing',
      'reports',
      'qr',
      'printers',
      'settings',
      'other'
    )
  )
);

create index if not exists restaurant_feedback_restaurant_idx
  on public.restaurant_feedback (restaurant_id, created_at desc);

create table if not exists public.restaurant_data_exports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  export_type text not null,
  status text not null default 'generated',
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint restaurant_data_exports_type_check check (export_type in ('order_history', 'collections')),
  constraint restaurant_data_exports_status_check check (status in ('generated', 'failed'))
);

create index if not exists restaurant_data_exports_restaurant_idx
  on public.restaurant_data_exports (restaurant_id, created_at desc);

create table if not exists public.release_notes (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  released_at date not null,
  title text not null,
  features text not null default '',
  bug_fixes text not null default '',
  maintenance_notices text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint release_notes_version_not_blank check (btrim(version) <> ''),
  constraint release_notes_title_not_blank check (btrim(title) <> '')
);

create index if not exists release_notes_published_idx
  on public.release_notes (is_published, released_at desc);

create or replace function public.assign_support_ticket_number()
returns trigger
language plpgsql
as $$
declare
  n integer;
begin
  if new.ticket_number is null or btrim(new.ticket_number) = '' then
    select coalesce(max(substring(ticket_number from '([0-9]+)$')::int), 0) + 1
      into n
    from public.support_tickets
    where restaurant_id = new.restaurant_id;
    new.ticket_number := 'TKT-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_assign_number on public.support_tickets;
create trigger support_tickets_assign_number
  before insert on public.support_tickets
  for each row execute function public.assign_support_ticket_number();

create or replace function public.stamp_support_ticket_reply()
returns trigger
language plpgsql
as $$
begin
  select restaurant_id into new.restaurant_id
  from public.support_tickets
  where id = new.ticket_id;
  if new.restaurant_id is null then
    raise exception 'Ticket not found';
  end if;
  update public.support_tickets
    set updated_at = now()
    where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_ticket_replies_stamp on public.support_ticket_replies;
create trigger support_ticket_replies_stamp
  before insert on public.support_ticket_replies
  for each row execute function public.stamp_support_ticket_reply();

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

drop trigger if exists maintenance_reminders_set_updated_at on public.maintenance_reminders;
create trigger maintenance_reminders_set_updated_at
  before update on public.maintenance_reminders
  for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_replies enable row level security;
alter table public.maintenance_reminders enable row level security;
alter table public.restaurant_feedback enable row level security;
alter table public.restaurant_data_exports enable row level security;
alter table public.release_notes enable row level security;

drop policy if exists "owners manage support tickets" on public.support_tickets;
create policy "owners manage support tickets"
  on public.support_tickets for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "owners read ticket replies" on public.support_ticket_replies;
create policy "owners read ticket replies"
  on public.support_ticket_replies for select
  to authenticated
  using (public.is_restaurant_owner(restaurant_id));

drop policy if exists "owners insert ticket replies" on public.support_ticket_replies;
create policy "owners insert ticket replies"
  on public.support_ticket_replies for insert
  to authenticated
  with check (
    public.is_restaurant_owner(restaurant_id)
    and author_role = 'owner'
  );

drop policy if exists "owners manage maintenance reminders" on public.maintenance_reminders;
create policy "owners manage maintenance reminders"
  on public.maintenance_reminders for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "owners manage restaurant feedback" on public.restaurant_feedback;
create policy "owners manage restaurant feedback"
  on public.restaurant_feedback for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "owners manage data exports" on public.restaurant_data_exports;
create policy "owners manage data exports"
  on public.restaurant_data_exports for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

drop policy if exists "owners read published releases" on public.release_notes;
create policy "owners read published releases"
  on public.release_notes for select
  to authenticated
  using (is_published = true);

-- Waiters and anonymous users have no policies on these tables.
-- Platform-admin publish/restore/deploy privileges are not granted here.
