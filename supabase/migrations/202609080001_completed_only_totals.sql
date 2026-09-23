create or replace function close_shift(p_shift_id text, p_staff_id text, p_mpay_actual numeric, p_wechat_actual numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_row shifts%rowtype;
  v_mpay_expected numeric(10,2);
  v_wechat_expected numeric(10,2);
  v_difference numeric(10,2);
begin
  select * into shift_row from shifts where id = p_shift_id and staff_id = p_staff_id for update;
  if not found or shift_row.status <> 'OPEN' then raise exception 'Open shift not found' using errcode = 'P0001'; end if;
  select coalesce(sum(total) filter (where payment_method = 'MPAY'), 0), coalesce(sum(total) filter (where payment_method = 'WECHAT_PAY'), 0)
    into v_mpay_expected, v_wechat_expected from transactions where shift_id = p_shift_id and status = 'COMPLETED' and fulfillment_status = 'COMPLETED';
  v_difference := (coalesce(p_mpay_actual, 0) + coalesce(p_wechat_actual, 0)) - (v_mpay_expected + v_wechat_expected);
  update shifts set closed_at = now(), mpay_expected = v_mpay_expected, wechat_expected = v_wechat_expected,
    mpay_actual = coalesce(p_mpay_actual, 0), wechat_actual = coalesce(p_wechat_actual, 0), difference = v_difference,
    note = coalesce(p_note, ''), status = 'CLOSED', sheet_sync_status = 'PENDING', updated_at = now()
    where id = p_shift_id;
  return jsonb_build_object('mpayExpected', v_mpay_expected, 'wechatExpected', v_wechat_expected, 'difference', v_difference, 'sheetSyncStatus', 'PENDING');
end;
$$;

revoke execute on function close_shift(text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function close_shift(text, text, numeric, numeric, text) to service_role;
