create or replace function public.create_discounted_transaction(p_transaction jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_total numeric;
  priced_items jsonb;
begin
  if p_transaction is null and p_items is null then
    return jsonb_build_object('available', true);
  end if;

  perform 1 from staff
  where id = p_transaction->>'staff_id' and active and upper(role) = 'MANAGER'
  for update;
  if not found then raise exception 'Manager access required'; end if;

  if exists (select 1 from transactions where id = p_transaction->>'id') then
    return create_transaction(p_transaction, p_items);
  end if;

  if p_transaction->>'type' is distinct from 'NORMAL_SALE'
    or coalesce(p_transaction->>'payment_method', '') not in ('MPAY', 'WECHAT_PAY')
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid 8折 sale';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception '8折 sale needs at least one item'; end if;

  perform 1 from products where id in (
    select item->>'product_id' from jsonb_array_elements(p_items) item
  ) order by id for share;

  with quotes as (
    select item, p.id, p.active, p.price, round(p.price * 0.80, 2) as mop,
      round((p.price - 2) * 0.80, 2) as rmb, (item->>'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) item
    left join products p on p.id = item->>'product_id'
  )
  select sum(mop * quantity), jsonb_agg(item || jsonb_build_object(
    'unit_price', mop, 'rmb_unit_price', rmb, 'base_unit_price', price,
    'discount_unit_price', price - mop, 'line_total', mop * quantity
  )) into expected_total, priced_items
  from quotes
  having bool_and(id is not null and active and price >= 2 and
    quantity is not null and quantity > 0 and quantity = trunc(quantity) and
    item->>'campaign_id' is not distinct from 'EIGHTY_PERCENT' and
    coalesce(item->>'cup_type', 'DINE_IN') = 'DINE_IN' and
    (item->>'base_unit_price')::numeric is not distinct from price and
    (item->>'unit_price')::numeric is not distinct from mop and
    (item->>'rmb_unit_price')::numeric is not distinct from rmb and
    (item->>'discount_unit_price')::numeric is not distinct from price - mop and
    (item->>'line_total')::numeric is not distinct from mop * quantity);

  if priced_items is null or expected_total is distinct from (p_transaction->>'total')::numeric then
    raise exception '8折 prices changed or do not match the catalog';
  end if;
  return create_transaction(p_transaction || jsonb_build_object('total', expected_total), priced_items);
end;
$$;

revoke execute on function public.create_discounted_transaction(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_discounted_transaction(jsonb, jsonb) to service_role;

create or replace function public.close_shift_in_payment_currencies(p_shift_id text, p_staff_id text, p_mpay_actual numeric, p_wechat_actual numeric, p_note text)
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
  select coalesce(sum(total), 0) into v_mpay_expected
    from transactions
    where shift_id = p_shift_id and status = 'COMPLETED' and fulfillment_status = 'COMPLETED'
      and payment_method = 'MPAY';
  select coalesce(sum(coalesce(i.rmb_unit_price, round(i.unit_price - 2, 2)) * i.quantity), 0)
    into v_wechat_expected
    from transactions t join transaction_items i on i.transaction_id = t.id
    where t.shift_id = p_shift_id and t.status = 'COMPLETED' and t.fulfillment_status = 'COMPLETED'
      and t.payment_method = 'WECHAT_PAY';
  v_difference := (coalesce(p_mpay_actual, 0) + coalesce(p_wechat_actual, 0)) - (v_mpay_expected + v_wechat_expected);
  update shifts set closed_at = now(), mpay_expected = v_mpay_expected, wechat_expected = v_wechat_expected,
    mpay_actual = coalesce(p_mpay_actual, 0), wechat_actual = coalesce(p_wechat_actual, 0), difference = v_difference,
    note = coalesce(p_note, ''), status = 'CLOSED', sheet_sync_status = 'PENDING', updated_at = now()
    where id = p_shift_id;
  return jsonb_build_object('mpayExpected', v_mpay_expected, 'wechatExpected', v_wechat_expected, 'difference', v_difference, 'sheetSyncStatus', 'PENDING');
end;
$function$;

revoke execute on function public.close_shift_in_payment_currencies(text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.close_shift_in_payment_currencies(text, text, numeric, numeric, text) to service_role;
