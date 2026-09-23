alter table transaction_items add column cup_type text not null default 'DINE_IN'
  check (cup_type in ('DINE_IN','PERSONAL_CUP'));
alter table transaction_items add column base_unit_price numeric(10,2) not null default 0 check (base_unit_price >= 0);
alter table transaction_items add column discount_unit_price numeric(10,2) not null default 0 check (discount_unit_price >= 0);
alter table transaction_items add column campaign_id text not null default '';
update transaction_items set base_unit_price = unit_price;

create or replace function create_transaction(p_transaction jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  existing_fingerprint text;
  transaction_id text := p_transaction->>'id';
  requested_cups bigint;
  available_cups bigint;
begin
  perform 1 from staff where id = p_transaction->>'staff_id' and active for update;
  if not found then raise exception 'Inactive staff'; end if;
  select payload_fingerprint into existing_fingerprint from transactions where id = transaction_id;
  if existing_fingerprint is not null then
    if existing_fingerprint <> p_transaction->>'payload_fingerprint' then raise exception 'CONFLICTING_TRANSACTION'; end if;
    return jsonb_build_object('transactionId', transaction_id, 'duplicate', true);
  end if;
  perform 1 from shifts where id = p_transaction->>'shift_id' and staff_id = p_transaction->>'staff_id' and status = 'OPEN' for update;
  if not found then raise exception 'Shift is not open'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Transaction needs at least one item'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
    left join products p on p.id = item->>'product_id'
    where coalesce(item->>'cup_type','DINE_IN') = 'PERSONAL_CUP' and (
      p.id is null or not p.active or p_transaction->>'type' <> 'NORMAL_SALE'
      or item->>'campaign_id' <> 'PERSONAL_CUP_2026'
      or (item->>'base_unit_price')::numeric is distinct from p.price
      or (item->>'discount_unit_price')::numeric is distinct from 3::numeric
      or (item->>'unit_price')::numeric is distinct from greatest(0::numeric, p.price - 3)
      or (item->>'rmb_unit_price')::numeric is distinct from greatest(0::numeric, p.price - 3) - 2
      or (item->>'line_total')::numeric is distinct from greatest(0::numeric, p.price - 3) * (item->>'quantity')::numeric
    )
  ) then raise exception 'Invalid personal cup campaign pricing'; end if;
  if p_transaction->>'type' = 'STAFF_REWARD' then
    if exists (select 1 from jsonb_array_elements(p_items) item left join products p on p.id = item->>'product_id' where p.id is null or not p.active or p.name ilike '%xxl%' or p.category ilike '%xxl%') then raise exception 'XXL or inactive drinks cannot be redeemed'; end if;
    if exists (select 1 from jsonb_array_elements(p_items) item where (item->>'unit_price')::numeric is distinct from 0::numeric or (item->>'line_total')::numeric is distinct from 0::numeric or nullif(item->>'rmb_unit_price','') is not null or (item->>'quantity')::numeric is null or (item->>'quantity')::numeric <= 0 or (item->>'quantity')::numeric <> trunc((item->>'quantity')::numeric)) then raise exception 'Reward items must have positive whole quantities and zero prices'; end if;
    select sum((item->>'quantity')::bigint) into requested_cups from jsonb_array_elements(p_items) item;
    select (get_staff_rewards(p_transaction->>'staff_id')->>'availableCups')::bigint into available_cups;
    if requested_cups > available_cups then raise exception 'INSUFFICIENT_REWARDS'; end if;
  end if;

  insert into transactions (id, shift_id, staff_id, type, total, payment_method, waste_reason, payload_fingerprint)
  values (transaction_id, p_transaction->>'shift_id', p_transaction->>'staff_id', p_transaction->>'type', (p_transaction->>'total')::numeric, coalesce(p_transaction->>'payment_method',''), coalesce(p_transaction->>'waste_reason',''), p_transaction->>'payload_fingerprint');
  insert into transaction_items (transaction_id, product_id, product_name, temperature, cup_type, quantity, base_unit_price, discount_unit_price, campaign_id, unit_price, rmb_unit_price, line_total)
  select transaction_id, item->>'product_id', case when p_transaction->>'type' = 'STAFF_REWARD' then (select name from products where id = item->>'product_id') else item->>'product_name' end,
    coalesce(item->>'temperature',''), coalesce(item->>'cup_type','DINE_IN'), (item->>'quantity')::integer,
    coalesce((item->>'base_unit_price')::numeric,(item->>'unit_price')::numeric), coalesce((item->>'discount_unit_price')::numeric,0), coalesce(item->>'campaign_id',''),
    (item->>'unit_price')::numeric, nullif(item->>'rmb_unit_price','')::numeric, (item->>'line_total')::numeric
  from jsonb_array_elements(p_items) item;
  return jsonb_build_object('transactionId', transaction_id, 'duplicate', false);
end;
$$;
revoke execute on function create_transaction(jsonb, jsonb) from public, anon, authenticated;
grant execute on function create_transaction(jsonb, jsonb) to service_role;
