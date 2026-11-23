alter table public.transactions
  add column reminder_until timestamptz,
  add column review_requested_at timestamptz,
  add column review_requested_by text references public.staff(id);
