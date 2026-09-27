-- BSB Digital Menu — waiter Start Session (additive).
-- Does not drop tables, does not change qr_token, does not weaken owner RLS.

create or replace function public.waiter_assigned_to_table(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.waiter_table_assignments a
    join public.waiters w on w.id = a.waiter_id
    join public.restaurant_tables t on t.id = a.table_id
    where w.auth_user_id = auth.uid()
      and w.is_active = true
      and a.table_id = p_table_id
      and a.restaurant_id = w.restaurant_id
      and t.restaurant_id = w.restaurant_id
  );
$$;

drop policy if exists "waiters insert assigned sessions" on public.table_sessions;
create policy "waiters insert assigned sessions"
  on public.table_sessions for insert
  to authenticated
  with check (
    restaurant_id = public.current_waiter_restaurant_id()
    and primary_table_id is not null
    and public.waiter_assigned_to_table(primary_table_id)
    and exists (
      select 1
      from public.restaurant_tables t
      where t.id = primary_table_id
        and t.restaurant_id = restaurant_id
    )
  );

drop policy if exists "waiters insert session_tables" on public.session_tables;
create policy "waiters insert session_tables"
  on public.session_tables for insert
  to authenticated
  with check (
    public.waiter_can_access_session(session_id)
    and public.waiter_assigned_to_table(table_id)
    and exists (
      select 1
      from public.table_sessions ts
      join public.restaurant_tables t on t.id = session_tables.table_id
      where ts.id = session_id
        and ts.restaurant_id = public.current_waiter_restaurant_id()
        and t.restaurant_id = ts.restaurant_id
    )
  );

create or replace function public.sync_primary_session_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.primary_table_id is null then
    return new;
  end if;

  insert into public.session_tables (session_id, table_id)
  values (new.id, new.primary_table_id)
  on conflict (session_id, table_id) do nothing;

  return new;
end;
$$;

create or replace function public.start_waiter_table_session(
  p_restaurant_id uuid,
  p_table_id uuid
)
returns public.table_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waiter public.waiters;
  v_table public.restaurant_tables;
  v_session public.table_sessions;
  v_number text;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;

  select *
    into v_waiter
  from public.waiters w
  where w.auth_user_id = auth.uid()
  limit 1;

  if v_waiter.id is null then
    raise exception 'Not allowed';
  end if;
  if v_waiter.is_active is not true then
    raise exception 'This waiter login is disabled. Contact the restaurant owner.';
  end if;
  if v_waiter.restaurant_id is distinct from p_restaurant_id then
    raise exception 'Not allowed';
  end if;

  select *
    into v_table
  from public.restaurant_tables t
  where t.id = p_table_id;

  if v_table.id is null or v_table.restaurant_id is distinct from p_restaurant_id then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.waiter_table_assignments a
    where a.waiter_id = v_waiter.id
      and a.table_id = p_table_id
      and a.restaurant_id = p_restaurant_id
  ) then
    raise exception 'You can only start sessions on tables assigned to you.';
  end if;

  select ts.*
    into v_session
  from public.table_sessions ts
  where ts.restaurant_id = p_restaurant_id
    and public.session_is_open(ts.status)
    and (
      ts.primary_table_id = p_table_id
      or exists (
        select 1
        from public.session_tables st
        where st.session_id = ts.id
          and st.table_id = p_table_id
      )
    )
  order by ts.started_at
  limit 1;

  if v_session.id is not null then
    return v_session;
  end if;

  v_number := public.next_session_number(p_restaurant_id);

  insert into public.table_sessions (
    restaurant_id,
    session_number,
    primary_table_id,
    status
  )
  values (
    p_restaurant_id,
    v_number,
    p_table_id,
    'active'
  )
  returning * into v_session;

  insert into public.session_tables (session_id, table_id)
  values (v_session.id, p_table_id)
  on conflict (session_id, table_id) do nothing;

  return v_session;
end;
$$;

revoke all on function public.start_waiter_table_session(uuid, uuid) from public;
grant execute on function public.start_waiter_table_session(uuid, uuid) to authenticated;
