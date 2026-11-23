begin;
drop function if exists public.create_discounted_transaction(jsonb, jsonb);
drop function if exists public.close_shift_in_payment_currencies(text, text, numeric, numeric, text);
notify pgrst, 'reload schema';
commit;
