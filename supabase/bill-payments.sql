-- BSB Digital Menu — Phase 11 split payments (additive).
-- Does not drop tables, does not change waiter auth, KOT, or qr_token.
-- One bill, many payments. Owner-only collection. Waiters may view.

alter table public.payments
  add column if not exists client_request_id uuid;

create unique index if not exists payments_bill_request_key
  on public.payments (bill_id, client_request_id)
  where client_request_id is not null;

create or replace function public.collect_bill_payment(
  p_restaurant_id uuid,
  p_bill_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default '',
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills;
  v_session public.table_sessions;
  v_payment public.payments;
  v_amount numeric(12, 2);
  v_paid numeric(12, 2);
  v_remaining numeric(12, 2);
  v_method text;
  v_ref text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;
  if not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Not allowed';
  end if;

  select *
    into v_bill
  from public.bills
  where id = p_bill_id
    and restaurant_id = p_restaurant_id
  for update;

  if v_bill.id is null then
    raise exception 'Running bill not found.';
  end if;
  if v_bill.status = 'cancelled' then
    raise exception 'This bill is no longer open.';
  end if;
  if v_bill.status = 'paid' then
    raise exception 'This bill is already settled.';
  end if;

  select *
    into v_session
  from public.table_sessions
  where id = v_bill.session_id
    and restaurant_id = p_restaurant_id
  for update;

  if v_session.id is null then
    raise exception 'Session not found.';
  end if;
  if v_session.status in ('closed', 'cancelled') then
    raise exception 'This table session is no longer active.';
  end if;

  if p_request_id is not null then
    select *
      into v_payment
    from public.payments
    where bill_id = v_bill.id
      and client_request_id = p_request_id
    limit 1;
    if v_payment.id is not null then
      select coalesce(sum(amount), 0) into v_paid
      from public.payments
      where bill_id = v_bill.id;
      v_remaining := round(greatest(v_bill.grand_total - v_paid, 0), 2);
      return jsonb_build_object(
        'payment', to_jsonb(v_payment),
        'bill', to_jsonb(v_bill),
        'paid', v_paid,
        'remaining', v_remaining,
        'settled', v_bill.status = 'paid',
        'session_closed', v_session.status = 'closed',
        'duplicate', true
      );
    end if;
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
  from public.payments
  where bill_id = v_bill.id;

  v_remaining := round(greatest(coalesce(v_bill.grand_total, 0) - v_paid, 0), 2);
  v_amount := round(coalesce(p_amount, 0), 2);

  if v_remaining = 0 then
    if v_amount <> 0 then
      raise exception 'This bill is already settled.';
    end if;
  else
    v_method := lower(btrim(coalesce(p_method, '')));
    if v_method not in ('cash', 'upi', 'card') then
      raise exception 'Choose Cash, UPI or Card.';
    end if;
    if v_amount <= 0 then
      raise exception 'Enter a payment amount.';
    end if;
    if v_amount > v_remaining then
      raise exception 'Payment cannot exceed remaining balance.';
    end if;

    v_ref := btrim(coalesce(p_reference, ''));
    if v_method = 'cash' then
      v_ref := '';
    end if;

    insert into public.payments (
      restaurant_id,
      session_id,
      bill_id,
      payment_method,
      amount,
      payment_reference,
      client_request_id
    )
    values (
      p_restaurant_id,
      v_bill.session_id,
      v_bill.id,
      v_method,
      v_amount,
      v_ref,
      p_request_id
    )
    returning * into v_payment;

    v_paid := round(v_paid + v_amount, 2);
    v_remaining := round(greatest(v_bill.grand_total - v_paid, 0), 2);
  end if;

  if v_remaining = 0 then
    v_status := 'paid';
    update public.bills
      set status = 'paid'
    where id = v_bill.id
      and restaurant_id = p_restaurant_id
      and status <> 'paid';

    update public.table_sessions
      set status = 'closed',
          closed_at = now()
    where id = v_session.id
      and restaurant_id = p_restaurant_id
      and status not in ('closed', 'cancelled');
  else
    v_status := 'payment_pending';
    update public.bills
      set status = 'payment_pending'
    where id = v_bill.id
      and restaurant_id = p_restaurant_id
      and status <> 'paid';
  end if;

  select * into v_bill from public.bills where id = p_bill_id;
  select * into v_session from public.table_sessions where id = v_session.id;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'bill', to_jsonb(v_bill),
    'paid', v_paid,
    'remaining', v_remaining,
    'settled', v_status = 'paid',
    'session_closed', v_session.status = 'closed',
    'duplicate', false
  );
end;
$$;

revoke all on function public.collect_bill_payment(uuid, uuid, numeric, text, text, uuid) from public;
grant execute on function public.collect_bill_payment(uuid, uuid, numeric, text, text, uuid) to authenticated;
