-- Lifetime, per-staff rewards. Existing fulfilled regular sales count.
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('NORMAL_SALE','STAFF','WASTE','STAFF_REWARD'));
alter table transactions drop constraint transaction_payment_rules;
alter table transactions add constraint transaction_payment_rules check (
  (type in ('WASTE','STAFF_REWARD') and total = 0 and payment_method = '') or
  (type in ('NORMAL_SALE','STAFF') and payment_method in ('MPAY','WECHAT_PAY'))
);

create index transactions_staff_rewards on transactions(staff_id, type, fulfillment_status);

create or replace function get_staff_rewards(p_staff_id text)
returns jsonb language sql stable security definer set search_path = public
as $$
  with cups as (
    select
      coalesce(sum(i.quantity) filter (where t.type = 'NORMAL_SALE' and t.fulfillment_status = 'COMPLETED'), 0)::bigint as sold,
      coalesce(sum(i.quantity) filter (where t.type = 'STAFF_REWARD'), 0)::bigint as redeemed
    from transactions t join transaction_items i on i.transaction_id = t.id
    where t.staff_id = p_staff_id and t.status = 'COMPLETED'
  )
  select jsonb_build_object('soldCups', sold, 'redeemedCups', redeemed,
    'availableCups', greatest(0, sold / 6 - redeemed),
    'cupsToNext', greatest(redeemed + 1, sold / 6 + 1) * 6 - sold)
  from cups;
$$;
revoke execute on function get_staff_rewards(text) from public, anon, authenticated;
grant execute on function get_staff_rewards(text) to service_role;

-- Serialize status reversals/deletions with redemption for the same employee.
create or replace function lock_staff_rewards()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from staff where id = old.staff_id for update;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger staff_rewards_transaction_lock before update or delete on transactions
  for each row execute function lock_staff_rewards();
revoke execute on function lock_staff_rewards() from public, anon, authenticated;

create or replace function create_transaction(p_transaction jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  existing_fingerprint text;
  transaction_id text := p_transaction->>'id';
  requested_cups bigint;
  available_cups bigint;
begin
  -- Lock before reading balances or fingerprints so concurrent retries are safe.
  perform 1 from staff where id = p_transaction->>'staff_id' and active for update;
  if not found then raise exception 'Inactive staff'; end if;
  select payload_fingerprint into existing_fingerprint from transactions where id = transaction_id;
  if existing_fingerprint is not null then
    if existing_fingerprint <> p_transaction->>'payload_fingerprint' then
      raise exception 'CONFLICTING_TRANSACTION';
    end if;
    return jsonb_build_object('transactionId', transaction_id, 'duplicate', true);
  end if;

  perform 1 from shifts where id = p_transaction->>'shift_id'
    and staff_id = p_transaction->>'staff_id' and status = 'OPEN' for update;
  if not found then raise exception 'Shift is not open'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Transaction needs at least one item';
  end if;

  if p_transaction->>'type' = 'STAFF_REWARD' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      left join products p on p.id = item->>'product_id'
      where p.id is null or not p.active or p.name ilike '%xxl%' or p.category ilike '%xxl%'
    ) then raise exception 'XXL or inactive drinks cannot be redeemed'; end if;
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where (item->>'unit_price')::numeric is distinct from 0::numeric
        or (item->>'line_total')::numeric is distinct from 0::numeric
        or nullif(item->>'rmb_unit_price','') is not null
        or (item->>'quantity')::numeric is null
        or (item->>'quantity')::numeric <= 0
        or (item->>'quantity')::numeric <> trunc((item->>'quantity')::numeric)
    ) then raise exception 'Reward items must have positive whole quantities and zero prices'; end if;
    select sum((item->>'quantity')::bigint) into requested_cups from jsonb_array_elements(p_items) item;
    select (get_staff_rewards(p_transaction->>'staff_id')->>'availableCups')::bigint into available_cups;
    if requested_cups > available_cups then raise exception 'INSUFFICIENT_REWARDS'; end if;
  end if;

  insert into transactions (id, shift_id, staff_id, type, total, payment_method, waste_reason, payload_fingerprint)
  values (transaction_id, p_transaction->>'shift_id', p_transaction->>'staff_id', p_transaction->>'type',
    (p_transaction->>'total')::numeric, coalesce(p_transaction->>'payment_method',''),
    coalesce(p_transaction->>'waste_reason',''), p_transaction->>'payload_fingerprint');

  insert into transaction_items (transaction_id, product_id, product_name, temperature, quantity, unit_price, rmb_unit_price, line_total)
  select transaction_id, item->>'product_id',
    case when p_transaction->>'type' = 'STAFF_REWARD' then (select name from products where id = item->>'product_id') else item->>'product_name' end,
    coalesce(item->>'temperature',''), (item->>'quantity')::integer, (item->>'unit_price')::numeric,
    nullif(item->>'rmb_unit_price','')::numeric, (item->>'line_total')::numeric
  from jsonb_array_elements(p_items) item;

  return jsonb_build_object('transactionId', transaction_id, 'duplicate', false);
end;
$$;
revoke execute on function create_transaction(jsonb, jsonb) from public, anon, authenticated;
grant execute on function create_transaction(jsonb, jsonb) to service_role;
