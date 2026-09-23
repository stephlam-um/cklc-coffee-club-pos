create table if not exists financial_entries (
  pay_date date not null,
  acc_code text not null,
  description text not null default '當日櫃檯銷售收入',
  currency text not null check (currency in ('MOP', 'RMB')),
  amount numeric(10,2) not null check (amount >= 0),
  remarks text not null default '',
  primary key (pay_date, acc_code, currency)
);

alter table financial_entries enable row level security;
alter table financial_entries alter column acc_code drop default;

comment on table financial_entries is 'Daily accounting income entries derived from completed POS transactions.';
comment on column financial_entries.pay_date is 'Macau-local calendar date derived from transactions.created_at.';
comment on column financial_entries.amount is 'Daily amount in the row currency; WeChat/RMB applies the established per-item minus-2 correction.';

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
      round(sum((i.unit_price - 2) * i.quantity), 2) as amount,
      'WeChat; recalculated MOP unit price minus 2, received by ' || string_agg(distinct e.staff_name, ', ' order by e.staff_name) as remarks
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

revoke execute on function refresh_financial_entries() from public, anon, authenticated;
grant execute on function refresh_financial_entries() to service_role;

create or replace function refresh_financial_entries_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_financial_entries();
  return null;
end;
$$;

drop trigger if exists financial_entries_transactions_refresh on transactions;
create trigger financial_entries_transactions_refresh
after insert or update or delete on transactions
for each statement execute function refresh_financial_entries_trigger();

drop trigger if exists financial_entries_items_refresh on transaction_items;
create trigger financial_entries_items_refresh
after insert or update or delete on transaction_items
for each statement execute function refresh_financial_entries_trigger();

select refresh_financial_entries();
