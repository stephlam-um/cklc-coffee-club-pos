alter table transaction_items
  add column if not exists rmb_unit_price numeric(10,2);

update transaction_items i
set rmb_unit_price = round(i.unit_price - 2, 2)
from transactions t
where t.id = i.transaction_id
  and t.type <> 'WASTE'
  and i.rmb_unit_price is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transaction_items_rmb_unit_price_nonnegative'
  ) then
    alter table transaction_items
      add constraint transaction_items_rmb_unit_price_nonnegative
      check (rmb_unit_price is null or rmb_unit_price >= 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transaction_items_rmb_price_minus_two'
  ) then
    alter table transaction_items
      add constraint transaction_items_rmb_price_minus_two
      check (rmb_unit_price is null or rmb_unit_price = round(unit_price - 2, 2));
  end if;
end;
$$;

comment on column transaction_items.rmb_unit_price is
  'Explicit RMB unit price snapshot; for paid POS items this is the MOP unit price minus 2.';

create or replace function create_transaction(p_transaction jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_fingerprint text;
  transaction_id text := p_transaction->>'id';
begin
  select payload_fingerprint into existing_fingerprint from transactions where id = transaction_id;
  if existing_fingerprint is not null then
    if existing_fingerprint <> p_transaction->>'payload_fingerprint' then
      raise exception 'CONFLICTING_TRANSACTION' using errcode = 'P0001';
    end if;
    return jsonb_build_object('transactionId', transaction_id, 'duplicate', true);
  end if;

  if not exists (
    select 1 from shifts where id = p_transaction->>'shift_id'
      and staff_id = p_transaction->>'staff_id' and status = 'OPEN'
  ) then
    raise exception 'Shift is not open' using errcode = 'P0001';
  end if;

  insert into transactions (id, shift_id, staff_id, type, total, payment_method, waste_reason, payload_fingerprint)
  values (
    transaction_id, p_transaction->>'shift_id', p_transaction->>'staff_id', p_transaction->>'type',
    (p_transaction->>'total')::numeric, coalesce(p_transaction->>'payment_method', ''),
    coalesce(p_transaction->>'waste_reason', ''), p_transaction->>'payload_fingerprint'
  );

  insert into transaction_items (transaction_id, product_id, product_name, temperature, quantity, unit_price, rmb_unit_price, line_total)
  select transaction_id, item->>'product_id', item->>'product_name', coalesce(item->>'temperature', ''),
    (item->>'quantity')::integer, (item->>'unit_price')::numeric,
    nullif(item->>'rmb_unit_price', '')::numeric, (item->>'line_total')::numeric
  from jsonb_array_elements(p_items) item;

  return jsonb_build_object('transactionId', transaction_id, 'duplicate', false);
end;
$$;

create or replace function refresh_financial_entries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from financial_entries;

  insert into financial_entries (pay_date, acc_code, description, currency, amount, remarks)
  with eligible as (
    select
      t.id,
      t.created_at,
      t.staff_id,
      t.total,
      t.payment_method,
      coalesce(s.name, t.staff_id) as staff_name
    from transactions t
    left join staff s on s.id = t.staff_id
    where t.status = 'COMPLETED'
      and t.fulfillment_status = 'COMPLETED'
      and t.type <> 'WASTE'
  ),
  daily_mop as (
    select
      (created_at at time zone 'Asia/Macau')::date as pay_date,
      'MOP'::text as currency,
      round(sum(total), 2) as amount,
      'MPAY, received by ' || string_agg(distinct staff_name, ', ' order by staff_name) as remarks
    from eligible
    where payment_method = 'MPAY'
    group by (created_at at time zone 'Asia/Macau')::date
  ),
  daily_rmb as (
    select
      (e.created_at at time zone 'Asia/Macau')::date as pay_date,
      'RMB'::text as currency,
      round(sum(coalesce(i.rmb_unit_price, i.unit_price - 2) * i.quantity), 2) as amount,
      'WeChat; RMB unit price is MOP unit price minus 2, received by ' || string_agg(distinct e.staff_name, ', ' order by e.staff_name) as remarks
    from eligible e
    join transaction_items i on i.transaction_id = e.id
    where e.payment_method = 'WECHAT_PAY'
    group by (e.created_at at time zone 'Asia/Macau')::date
  ),
  daily_income as (
    select pay_date, currency, amount, remarks from daily_mop
    union all
    select pay_date, currency, amount, remarks from daily_rmb
  )
  select
    pay_date,
    '1.' || row_number() over (order by pay_date, currency),
    '當日櫃檯銷售收入',
    currency,
    amount,
    remarks
  from daily_income;
end;
$$;

select refresh_financial_entries();
