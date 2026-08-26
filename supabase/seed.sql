insert into products (id, name, category, price, staff_price, active, sort_order)
values
  ('americano', 'Americano', 'Coffee', 12, 5, true, 1),
  ('latte', 'Latte', 'Coffee', 18, 9, true, 2),
  ('matcha', 'Matcha Latte', 'Matcha', 18, 9, true, 3),
  ('tea', 'Tea', 'Tea', 12, 6, true, 4)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  staff_price = excluded.staff_price,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
