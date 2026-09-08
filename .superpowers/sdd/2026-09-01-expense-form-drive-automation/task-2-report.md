# Task 2 Implementation Report

Date: 2026-09-01

## Changed files

- `apps-script/expenses.gs`

## Commit hash

- `5d447d88a56dc7e2d925058994dc55125544de5e`

## Tests run with output

### Command

```powershell
node --test tests/apps-script-expenses.test.mjs
```

### Output

```text
✔ normalizes a valid Form response into the tracker contract (8.2873ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (3.7266ms)
✖ builds a monthly Markdown report with totals and receipt links (1.7076ms)
ℹ tests 3
ℹ suites 0
ℹ pass 2
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 266.9465

✖ failing tests:

test at tests\apps-script-expenses.test.mjs:192:1
✖ builds a monthly Markdown report with totals and receipt links (1.7076ms)
  TypeError: context.buildExpenseMarkdownReport_ is not a function
      at TestContext.<anonymous> (file:///C:/Users/steph/Downloads/student-coffee-pos/tests/apps-script-expenses.test.mjs:194:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)
```

## Concerns

- `buildExpenseMarkdownReport_` remains intentionally unimplemented for Task 2, so the Markdown test still fails by design.

## Fix round 1

### Changes

- Replaced UTC-based date-only normalization with local-form date formatting for `purchaseDate` and `buildExpenseId_` date keys.
- Updated receipt parsing to preserve every uploaded Drive URL when Forms supplies multiple receipt values.
- Added regression tests for local date preservation and multi-receipt preservation.

### Tests

#### Command

```powershell
node --test tests/apps-script-expenses.test.mjs
```

#### Output

```text
✔ normalizes a valid Form response into the tracker contract (8.8387ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (1.4677ms)
✔ preserves the local purchase date and expense ID date key for date-only values (1.1742ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.0745ms)
✖ builds a monthly Markdown report with totals and receipt links (1.3002ms)
ℹ tests 5
ℹ suites 0
ℹ pass 4
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 251.3511

✖ failing tests:

test at tests\apps-script-expenses.test.mjs:231:1
✖ builds a monthly Markdown report with totals and receipt links (1.3002ms)
  TypeError: context.buildExpenseMarkdownReport_ is not a function
      at TestContext.<anonymous> (file:///C:/Users/steph/Downloads/student-coffee-pos/tests/apps-script-expenses.test.mjs:233:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)
```

#### Command

```powershell
npm test
```

#### Output

```text
> student-coffee-pos@0.1.0 test
> node --test tests/*.test.mjs

✔ daily Supabase export upserts closed shifts and their transactions without duplicates (8.0155ms)
✔ setupDailySupabaseExport creates one Singapore trigger at 03:00 (2.041ms)
✔ normalizes a valid Form response into the tracker contract (9.655ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (2.1748ms)
✔ preserves the local purchase date and expense ID date key for date-only values (1.3288ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.2635ms)
✖ builds a monthly Markdown report with totals and receipt links (1.64ms)
✔ normalizeDashboardOrder defaults missing fulfillment status to pending (1.7124ms)
✔ dashboardStats separates waste from fulfillment orders (1.5253ms)
✔ buildOrderStatusPayload includes the authenticated staff actor (0.3559ms)
✔ NORMAL_SALE uses the normal product price (1.2538ms)
✔ STAFF uses the staff product price (0.2097ms)
✔ cart total supports multiple products and quantities (0.2148ms)
✔ cart keeps hot and iced versions of the same drink separate (1.7454ms)
✔ successResponse uses the shared API envelope (48.1919ms)
✔ errorResponse uses a stable code and status (0.8545ms)
✔ manifest configures a standalone Student Coffee POS web app (8.4438ms)
✔ formatMop presents POS totals as Macau patacas with two decimals (2.0828ms)
✔ paymentActionLabel names the amount and payment method (0.3599ms)
✔ formatTemperature gives drink choices a readable label (0.1829ms)
✔ getInitials creates a compact staff-card label (1.2244ms)
✔ possessiveName keeps staff names ending in s readable (0.3011ms)
✔ parseShiftAmount accepts non-negative decimal totals (0.3335ms)
✔ parseShiftAmount rejects malformed and negative totals (0.6376ms)
✔ readServerEnv rejects missing server-only credentials (2.2115ms)
✔ hashPin verifies the original PIN and rejects another PIN (105.8788ms)
✔ idempotencyResult returns duplicate for the same transaction fingerprint (2.4505ms)
✔ idempotencyResult rejects a conflicting transaction fingerprint (0.6208ms)
✔ validateTransactionInput accepts a normal paid sale (1.5975ms)
✔ validateTransactionInput rejects a paid waste record (0.8974ms)
✔ fingerprintTransaction is stable for equivalent payloads (1.7816ms)
✔ session token round-trips staff identity (3.2788ms)
✔ expired or tampered session token is rejected (0.8891ms)
✔ buildShiftSyncPayload preserves stable shift and transaction identifiers (1.83ms)
✔ buildShiftSyncPayload is deterministic for retries (0.2903ms)
✔ normal sale payload contains normal-priced line items and payment method (2.0954ms)
✔ staff payload uses staff price only (0.216ms)
✔ waste payload has zero total and no payment method (1.0367ms)
✔ checkout draft keeps one transaction ID for retries (5.2035ms)
✔ pending checkout survives reload and stays isolated by staff and shift (0.6244ms)
✔ restoreCheckoutDraft rebuilds the cart from a pending transaction (0.3659ms)
ℹ tests 41
ℹ suites 0
ℹ pass 40
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1009.0704

✖ failing tests:

test at tests\apps-script-expenses.test.mjs:231:1
✖ builds a monthly Markdown report with totals and receipt links (1.64ms)
  TypeError: context.buildExpenseMarkdownReport_ is not a function
      at TestContext.<anonymous> (file:///C:/Users/steph/Downloads/student-coffee-pos/tests/apps-script-expenses.test.mjs:233:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)
```

#### Command

```powershell
npm run check:core
```

#### Output

```text
> student-coffee-pos@0.1.0 check:core
> node --check src/lib/domain.mjs && node --check src/lib/transactions.mjs && node --check src/lib/api.mjs && node --check src/lib/presentation.mjs && node --check src/lib/dashboard.mjs
```

## Fix round 2

### Changes

- Updated `submittedAt` normalization to emit a local script-timezone timestamp string instead of a UTC-shifted ISO string.
- Updated the regression to build the expense ID from `claim.submittedAt`, covering the real production path for near-midnight local submissions.
- Kept the multi-receipt preservation and baseline checks intact.

### Tests

#### Command

```powershell
node --test tests/apps-script-expenses.test.mjs
```

#### Output

```text
✔ normalizes a valid Form response into the tracker contract (9.4941ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (2.0456ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (1.4039ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.2728ms)
✖ builds a monthly Markdown report with totals and receipt links (1.3451ms)
ℹ tests 5
ℹ suites 0
ℹ pass 4
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 252.9199

✖ failing tests:

test at tests\apps-script-expenses.test.mjs:248:1
✖ builds a monthly Markdown report with totals and receipt links (1.3451ms)
  TypeError: context.buildExpenseMarkdownReport_ is not a function
      at TestContext.<anonymous> (file:///C:/Users/steph/Downloads/student-coffee-pos/tests/apps-script-expenses.test.mjs:250:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)
```

#### Command

```powershell
npm test
```

#### Output

```text
> student-coffee-pos@0.1.0 test
> node --test tests/*.test.mjs

✔ daily Supabase export upserts closed shifts and their transactions without duplicates (11.7805ms)
✔ setupDailySupabaseExport creates one Singapore trigger at 03:00 (1.6999ms)
✔ normalizes a valid Form response into the tracker contract (10.7651ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (2.3788ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (2.0037ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (2.7763ms)
✖ builds a monthly Markdown report with totals and receipt links (2.0815ms)
✔ normalizeDashboardOrder defaults missing fulfillment status to pending (1.8367ms)
✔ dashboardStats separates waste from fulfillment orders (1.6855ms)
✔ buildOrderStatusPayload includes the authenticated staff actor (0.3275ms)
✔ NORMAL_SALE uses the normal product price (1.9482ms)
✔ STAFF uses the staff product price (0.9138ms)
✔ cart total supports multiple products and quantities (0.398ms)
✔ cart keeps hot and iced versions of the same drink separate (2.0469ms)
✔ successResponse uses the shared API envelope (52.1006ms)
✔ errorResponse uses a stable code and status (0.8443ms)
✔ manifest configures a standalone Student Coffee POS web app (7.6958ms)
✔ formatMop presents POS totals as Macau patacas with two decimals (2.8127ms)
✔ paymentActionLabel names the amount and payment method (0.5042ms)
✔ formatTemperature gives drink choices a readable label (0.2413ms)
✔ getInitials creates a compact staff-card label (1.9985ms)
✔ possessiveName keeps staff names ending in s readable (0.5357ms)
✔ parseShiftAmount accepts non-negative decimal totals (0.6059ms)
✔ parseShiftAmount rejects malformed and negative totals (1.1509ms)
✔ readServerEnv rejects missing server-only credentials (1.3542ms)
✔ hashPin verifies the original PIN and rejects another PIN (106.3099ms)
✔ idempotencyResult returns duplicate for the same transaction fingerprint (1.8988ms)
✔ idempotencyResult rejects a conflicting transaction fingerprint (0.5624ms)
✔ validateTransactionInput accepts a normal paid sale (1.4463ms)
✔ validateTransactionInput rejects a paid waste record (0.6419ms)
✔ fingerprintTransaction is stable for equivalent payloads (0.9873ms)
✔ session token round-trips staff identity (2.7919ms)
✔ expired or tampered session token is rejected (0.4724ms)
✔ buildShiftSyncPayload preserves stable shift and transaction identifiers (1.761ms)
✔ buildShiftSyncPayload is deterministic for retries (0.2836ms)
✔ normal sale payload contains normal-priced line items and payment method (2.035ms)
✔ staff payload uses staff price only (0.1975ms)
✔ waste payload has zero total and no payment method (1.0532ms)
✔ checkout draft keeps one transaction ID for retries (4.1046ms)
✔ pending checkout survives reload and stays isolated by staff and shift (0.52ms)
✔ restoreCheckoutDraft rebuilds the cart from a pending transaction (0.3306ms)
ℹ tests 41
ℹ suites 0
ℹ pass 40
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1004.5708

✖ failing tests:

test at tests\apps-script-expenses.test.mjs:248:1
✖ builds a monthly Markdown report with totals and receipt links (2.0815ms)
  TypeError: context.buildExpenseMarkdownReport_ is not a function
      at TestContext.<anonymous> (file:///C:/Users/steph/Downloads/student-coffee-pos/tests/apps-script-expenses.test.mjs:250:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)
```

#### Command

```powershell
npm run check:core
```

#### Output

```text
> student-coffee-pos@0.1.0 check:core
> node --check src/lib/domain.mjs && node --check src/lib/transactions.mjs && node --check src/lib/api.mjs && node --check src/lib/presentation.mjs && node --check src/lib/dashboard.mjs
```
