alter table public.transaction_items
  drop constraint transaction_items_rmb_price_minus_two,
  add constraint transaction_items_rmb_price_by_campaign check (
    case when campaign_id = 'EIGHTY_PERCENT' then
      base_unit_price >= 2
      and rmb_unit_price is not null
      and rmb_unit_price = round((base_unit_price - 2) * 0.80, 2)
      and unit_price = round(base_unit_price * 0.80, 2)
      and discount_unit_price = base_unit_price - unit_price
    else
      rmb_unit_price is null or rmb_unit_price = round(unit_price - 2, 2)
    end
  );

comment on column public.transaction_items.rmb_unit_price is
  'RMB unit price at checkout. Regular items use MOP minus 2. 8折 items use 80 percent of the regular RMB price.';
