-- Run only after the RPC, server sync, Apps Script daily export, and monthly
-- report have been verified in production. The RPC remains the rollback target.
do $verification$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_financial_entries'
      and pg_get_function_identity_arguments(p.oid) = 'p_start_date date, p_end_date date'
  ) then
    raise exception 'get_financial_entries RPC must exist before retiring financial_entries';
  end if;

  if exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not tg.tgisinternal
      and tg.tgname in ('financial_entries_transactions_refresh', 'financial_entries_items_refresh')
  ) then
    raise exception 'Financial reporting triggers must be removed before retiring financial_entries';
  end if;
end;
$verification$;

drop function if exists refresh_financial_entries_trigger();
drop function if exists refresh_financial_entries();
drop table if exists financial_entries;
