# Fixed MOP Price Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce every regular and staff MOP product price by exactly MOP 2.00 so the menu, ticket, checkout, and future reporting all use the fixed prices.

**Architecture:** Keep Supabase `products.price` and `products.staff_price` as the single pricing source. Apply one tracked SQL migration to existing products and update seed/fallback fixtures for fresh installations; no runtime exchange-rate or presentation-layer discount is introduced.

**Tech Stack:** Supabase PostgreSQL migrations, Next.js 16 App Router, Node.js built-in test runner, Google Apps Script fallback.

**Spec:** Approved in chat on 2026-09-15: subtract MOP 2.00 from all regular and staff prices.

## Global Constraints

- Subtract exactly `2.00` from both `products.price` and `products.staff_price`.
- Continue displaying and recording prices in MOP; do not add RMB formatting or live exchange-rate logic.
- Apply the adjustment once through Supabase migration tracking; never rerun the raw `UPDATE` manually.
- Reject migration execution if any existing regular or staff price is below MOP 2.00, rather than silently clamping or creating a negative price.
- Existing transaction and transaction-item snapshots remain unchanged; the new prices apply only to future orders.
- Preserve all unrelated working-tree changes and stage only files named by each task.

---

### Task 1: Add the one-time live product price migration

**Files:**
- Create: `supabase/migrations/202609150001_reduce_product_prices_by_two.sql`
- Create: `tests/product-price-migration.test.mjs`

**Interfaces:**
- Consumes: existing `products(id, price, staff_price)` table with non-negative numeric price constraints.
- Produces: every existing product row with `price = previous price - 2.00` and `staff_price = previous staff_price - 2.00`.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/product-price-migration.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(new URL('../supabase/migrations/202609150001_reduce_product_prices_by_two.sql', import.meta.url), 'utf8')

test('product price migration rejects prices below the fixed adjustment', () => {
  assert.match(sql, /price < 2\.00 or staff_price < 2\.00/i)
  assert.match(sql, /raise exception 'Cannot reduce product prices below zero'/i)
})

test('product price migration subtracts two MOP from regular and staff prices', () => {
  assert.match(sql, /set\s+price\s*=\s*price\s*-\s*2\.00/i)
  assert.match(sql, /staff_price\s*=\s*staff_price\s*-\s*2\.00/i)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/product-price-migration.test.mjs`

Expected: FAIL with `ENOENT` because the migration file does not exist.

- [ ] **Step 3: Create the guarded migration**

Create `supabase/migrations/202609150001_reduce_product_prices_by_two.sql`:

```sql
do $$
begin
  if exists (
    select 1
    from products
    where price < 2.00 or staff_price < 2.00
  ) then
    raise exception 'Cannot reduce product prices below zero';
  end if;
end;
$$;

update products
set price = price - 2.00,
    staff_price = staff_price - 2.00,
    updated_at = now();
```

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `node --test tests/product-price-migration.test.mjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the migration contract**

```bash
git add supabase/migrations/202609150001_reduce_product_prices_by_two.sql tests/product-price-migration.test.mjs
git commit -m "feat: reduce fixed product prices by two MOP"
```

---

### Task 2: Keep fresh-install and Apps Script fallback prices consistent

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `apps-script/Code.gs`
- Modify: `tests/apps-script-daily-export.test.mjs`

**Interfaces:**
- Consumes: the four existing fallback products in `supabase/seed.sql` and `setupSheets()`.
- Produces: fresh-install/fallback values reduced from `12/5`, `18/9`, `18/9`, `12/6` to `10/3`, `16/7`, `16/7`, `10/4` respectively.

- [ ] **Step 1: Add failing assertions for fallback prices**

In `tests/apps-script-daily-export.test.mjs`, add:

```js
test('fallback product setup uses the fixed prices reduced by two MOP', () => {
  const { context, sheets } = createHarness()
  context.setupSheets()
  assert.deepEqual(sheets.get('Products').rows.slice(1).map(row => [row[0], row[3], row[4]]), [
    ['americano', 10, 3],
    ['latte', 16, 7],
    ['matcha', 16, 7],
    ['tea', 10, 4],
  ])
})
```

- [ ] **Step 2: Run the fallback test to verify it fails**

Run: `node --test tests/apps-script-daily-export.test.mjs`

Expected: FAIL because `setupSheets()` still seeds the old prices.

- [ ] **Step 3: Update the fresh-install Supabase seed**

Change `supabase/seed.sql` product values to:

```sql
  ('americano', 'Americano', 'Coffee', 10, 3, true, 1),
  ('latte', 'Latte', 'Coffee', 16, 7, true, 2),
  ('matcha', 'Matcha Latte', 'Matcha', 16, 7, true, 3),
  ('tea', 'Tea', 'Tea', 10, 4, true, 4)
```

- [ ] **Step 4: Update the Apps Script fallback seed**

In `apps-script/Code.gs`, change the `setupSheets()` product rows to:

```js
['americano','Americano','Coffee',10,3,true,1],
['latte','Latte','Coffee',16,7,true,2],
['matcha','Matcha Latte','Matcha',16,7,true,3],
['tea','Tea','Tea',10,4,true,4]
```

- [ ] **Step 5: Run the fallback and core tests**

Run: `node --test tests/apps-script-daily-export.test.mjs tests/domain.test.mjs tests/transactions.test.mjs`

Expected: all tests pass; the existing domain and transaction tests confirm the POS continues to use product-provided prices without a second subtraction.

- [ ] **Step 6: Commit fixture consistency changes**

```bash
git add supabase/seed.sql apps-script/Code.gs tests/apps-script-daily-export.test.mjs
git commit -m "test: align fallback menu prices"
```

---

### Task 3: Document rollout and verify the complete pricing path

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: migration `202609150001_reduce_product_prices_by_two.sql` and the existing Supabase-backed bootstrap endpoint.
- Produces: an operator-safe deployment sequence and verified MOP values from database through menu and checkout.

- [ ] **Step 1: Add the migration to the setup order**

In `README.md`, list the migrations in execution order:

```text
1. supabase/migrations/202608260001_initial_pos.sql
2. supabase/migrations/202609080001_completed_only_totals.sql
3. supabase/migrations/202609150001_reduce_product_prices_by_two.sql
4. supabase/seed.sql (fresh installations only)
```

Add this rollout note:

```text
The fixed-price migration is one-time and reduces both regular and staff prices by MOP 2.00. Do not run the raw UPDATE twice. Existing transaction snapshots are unchanged; only future orders use the new prices.
```

- [ ] **Step 2: Run the full automated verification**

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `npm run check:core`

Expected: exit code 0 with no syntax errors.

Run: `npm run build`

Expected: Next.js production build completes successfully.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 3: Apply the migration once to the linked Supabase project**

Use the project’s migration mechanism so Supabase records the migration as applied:

```bash
supabase db push
```

Expected: `202609150001_reduce_product_prices_by_two.sql` is applied once. If the project is not linked, stop and link the correct project before continuing; do not paste or rerun only the `UPDATE` statement ad hoc.

- [ ] **Step 4: Verify live product prices without exposing credentials**

Start the app with `npm run dev`, then request `GET /api/bootstrap`. Confirm every returned `price` and `staffPrice` is exactly MOP 2.00 below its pre-migration value. Open the menu and verify regular and staff views display those same values; add one item and verify the ticket total and payment button use the adjusted amount.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: document fixed MOP price rollout"
```
