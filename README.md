# BSB Digital Menu

QR digital menus for restaurants. Owners manage dishes; guests scan a permanent link.

## Stack

React, Vite, Tailwind CSS, React Router, Supabase.

## Setup

1. Copy `.env.example` to `.env` and set:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

2. In the Supabase SQL Editor, run `supabase/schema.sql`. Existing projects that already have tables can run `supabase/restaurant-tables-fields.sql` to add table number and active status. For table-wise order (Phase 1 database only), run `supabase/table-wise-order-fixed.sql`. If that already ran with `waiters.auth_user_id` required, also run `supabase/waiters-nullable-auth.sql`. For one waiter per table, run `supabase/waiter-table-unique.sql`. For waiter login, run `supabase/waiter-auth.sql` and deploy `supabase/functions/provision-waiter` with `SUPABASE_SERVICE_ROLE_KEY` set only on the function.

3. Install and start:

```
npm install
npm run dev
```

## Routes

Public: `/`, `/login`, `/signup`, `/menu/:slug`, `/waiter/login`

Dashboard: `/dashboard`, `/dashboard/restaurant`, `/dashboard/categories`, `/dashboard/menu`, `/dashboard/table-wise`, `/dashboard/table-wise/tables`, `/dashboard/table-wise/waiters`, `/dashboard/qr`, `/dashboard/settings`

Waiter: `/waiter`
