-- Reporting is now a read-only projection over operational transaction data.
-- Keep financial_entries and its refresh function for the staged rollback window;
-- the retirement migration removes them only after all consumers are verified.
create or replace function get_financial_entries(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  pay_date date,
  acc_code text,
  description text,
  currency text,
  amount numeric(10,2),
  remarks text
)
language sql
stable
security definer
set search_path = public
as $function$
  with eligible as (
    select
      t.id,
      (t.created_at at time zone 'Asia/Macau')::date as pay_date,
      t.staff_id,
      t.total,
      t.payment_method,
      coalesce(s.name, t.staff_id) as staff_name
    from transactions t
    left join staff s on s.id = t.staff_id
    where t.status = 'COMPLETED'
      and t.fulfillment_status = 'COMPLETED'
      and t.type <> 'WASTE'
      and (p_start_date is null or (t.created_at at time zone 'Asia/Macau')::date >= p_start_date)
      and (p_end_date is null or (t.created_at at time zone 'Asia/Macau')::date < p_end_date)
  ),
  daily_mop as (
    select
      pay_date,
      'MOP'::text as currency,
      round(sum(total), 2)::numeric(10,2) as amount,
      'MPAY, received by ' || string_agg(distinct staff_name, ', ' order by staff_name) as remarks
    from eligible
    where payment_method = 'MPAY'
    group by pay_date
  ),
  daily_rmb as (
    select
      e.pay_date,
      'RMB'::text as currency,
      round(sum(coalesce(i.rmb_unit_price, round(i.unit_price - 2, 2)) * i.quantity), 2)::numeric(10,2) as amount,
      'WeChat; RMB unit price is MOP unit price minus 2, received by ' || string_agg(distinct e.staff_name, ', ' order by e.staff_name) as remarks
    from eligible e
    join transaction_items i on i.transaction_id = e.id
    where e.payment_method = 'WECHAT_PAY'
    group by e.pay_date
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
  from daily_income
  order by pay_date, currency;
$function$;

revoke execute on function get_financial_entries(date, date) from public, anon, authenticated;
grant execute on function get_financial_entries(date, date) to service_role;

comment on function get_financial_entries(date, date) is
  'Read-only Macau-local financial income projection from completed fulfilled POS sales.';

create or replace function close_shift(p_shift_id text, p_staff_id text, p_mpay_actual numeric, p_wechat_actual numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  shift_row shifts%rowtype;
  v_mpay_expected numeric(10,2);
  v_wechat_expected numeric(10,2);
  v_difference numeric(10,2);
begin
  select * into shift_row from shifts where id = p_shift_id and staff_id = p_staff_id for update;
  if not found or shift_row.status <> 'OPEN' then raise exception 'Open shift not found' using errcode = 'P0001'; end if;
  select coalesce(sum(total) filter (where payment_method = 'MPAY'), 0), coalesce(sum(total) filter (where payment_method = 'WECHAT_PAY'), 0)
    into v_mpay_expected, v_wechat_expected
    from transactions
    where shift_id = p_shift_id and status = 'COMPLETED' and fulfillment_status = 'COMPLETED';
  v_difference := (coalesce(p_mpay_actual, 0) + coalesce(p_wechat_actual, 0)) - (v_mpay_expected + v_wechat_expected);
  update shifts set closed_at = now(), mpay_expected = v_mpay_expected, wechat_expected = v_wechat_expected,
    mpay_actual = coalesce(p_mpay_actual, 0), wechat_actual = coalesce(p_wechat_actual, 0), difference = v_difference,
    note = coalesce(p_note, ''), status = 'CLOSED', sheet_sync_status = 'PENDING', updated_at = now()
    where id = p_shift_id;
  return jsonb_build_object('mpayExpected', v_mpay_expected, 'wechatExpected', v_wechat_expected, 'difference', v_difference, 'sheetSyncStatus', 'PENDING');
end;
$function$;

revoke execute on function close_shift(text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function close_shift(text, text, numeric, numeric, text) to service_role;

drop trigger if exists financial_entries_transactions_refresh on transactions;
drop trigger if exists financial_entries_items_refresh on transaction_items;
drop function if exists refresh_financial_entries_trigger();
