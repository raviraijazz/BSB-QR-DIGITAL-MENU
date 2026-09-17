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

2. In the Supabase SQL Editor, run `supabase/schema.sql`.

3. Install and start:

```
npm install
npm run dev
```

## Routes

Public: `/`, `/login`, `/signup`, `/menu/:slug`

Dashboard: `/dashboard`, `/dashboard/restaurant`, `/dashboard/categories`, `/dashboard/menu`, `/dashboard/qr`, `/dashboard/settings`
