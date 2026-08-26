create extension if not exists pgcrypto;

create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(10,2) not null check (price >= 0),
  staff_price numeric(10,2) not null check (staff_price >= 0),
  active boolean not null default true,
  sort_order integer not null default 999,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists staff (
  id text primary key,
  name text not null,
  pin_hash text not null,
  role text not null default 'STAFF',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shifts (
  id text primary key,
  staff_id text not null references staff(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  mpay_expected numeric(10,2) not null default 0,
  wechat_expected numeric(10,2) not null default 0,
  mpay_actual numeric(10,2),
  wechat_actual numeric(10,2),
  difference numeric(10,2),
  note text not null default '',
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  sheet_sync_status text not null default 'NOT_READY' check (sheet_sync_status in ('NOT_READY','PENDING','SYNCED','FAILED')),
  sheet_synced_at timestamptz,
  sheet_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_open_shift_per_staff on shifts(staff_id) where status = 'OPEN';

create table if not exists transactions (
  id text primary key,
  shift_id text not null references shifts(id),
  staff_id text not null references staff(id),
  type text not null check (type in ('NORMAL_SALE','STAFF','WASTE')),
  total numeric(10,2) not null check (total >= 0),
  payment_method text not null default '' check (payment_method in ('','MPAY','WECHAT_PAY')),
  waste_reason text not null default '' check (waste_reason in ('','MADE_WRONG','CALIBRATION','SPILLED','OTHER')),
  status text not null default 'COMPLETED' check (status = 'COMPLETED'),
  fulfillment_status text not null default 'PENDING' check (fulfillment_status in ('PENDING','COMPLETED')),
  completed_at timestamptz,
  completed_by text references staff(id),
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint transaction_payment_rules check ((type = 'WASTE' and total = 0 and payment_method = '') or (type <> 'WASTE' and payment_method in ('MPAY','WECHAT_PAY'))),
  constraint transaction_waste_rules check ((type = 'WASTE' and waste_reason <> '') or (type <> 'WASTE' and waste_reason = ''))
);

create table if not exists transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null references transactions(id) on delete cascade,
  product_id text not null references products(id),
  product_name text not null,
  temperature text not null default '' check (temperature in ('','HOT','ICED')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);

create table if not exists shift_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  shift_id text not null references shifts(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  status text not null check (status in ('SYNCED','FAILED')),
  response_message text not null default ''
);

create index if not exists transactions_shift_created on transactions(shift_id, created_at);
create index if not exists transactions_created on transactions(created_at);

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

  insert into transaction_items (transaction_id, product_id, product_name, temperature, quantity, unit_price, line_total)
  select transaction_id, item->>'product_id', item->>'product_name', coalesce(item->>'temperature', ''),
    (item->>'quantity')::integer, (item->>'unit_price')::numeric, (item->>'line_total')::numeric
  from jsonb_array_elements(p_items) item;

  return jsonb_build_object('transactionId', transaction_id, 'duplicate', false);
end;
$$;
