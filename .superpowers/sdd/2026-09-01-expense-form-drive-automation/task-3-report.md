# Task 3 Report

Date: 2026-09-01

Changed files:
- `apps-script/expenses.gs`
- `tests/apps-script-expenses.test.mjs`

Commit hash:
- `d1993b165fba4a1c623ee5515b61d61a28256061`

Tests run:
- `node --test tests/apps-script-expenses.test.mjs`

Test output:
```text
✔ normalizes a valid Form response into the tracker contract (8.1946ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (2.3823ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (1.666ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.0943ms)
✔ form submit appends one tracker row and organizes every receipt once per source key (2.8835ms)
✔ submit keeps the tracker row when drive setup is unavailable (1.2546ms)
✔ setup removes duplicate triggers and creates one form-submit trigger (1.1924ms)
✔ setup applies status validation and deduplicates existing submit triggers (2.8646ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 212.2146
```

Concerns:
- No live Apps Script execution was available here, so trigger installation and Drive moves were verified through the local harness rather than against Google services directly.
- The receipt move logic preserves file extensions by renaming moved Drive files to an `expenseId_index.ext` pattern; if downstream automation expects original filenames, that assumption should be checked before Task 4 or rollout.

## Fix round 1

Date: 2026-09-01

Changed files:
- `apps-script/expenses.gs`
- `tests/apps-script-expenses.test.mjs`

Reviewer findings addressed:
- Trigger deduplication now validates handler name, trigger source, and event type before retaining a trigger, and replaces incompatible same-name triggers with a spreadsheet `ON_FORM_SUBMIT` trigger.
- Added regression coverage for incompatible same-name triggers in the Apps Script harness tests.
- Completed the required verification commands and recorded their exact outputs below.

Commands run:
- `node --test tests/apps-script-expenses.test.mjs`
- `npm test`
- `npm run check:core`

Command output for `node --test tests/apps-script-expenses.test.mjs`:
```text
✔ normalizes a valid Form response into the tracker contract (9.7519ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (1.8912ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (1.7522ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.2494ms)
✔ form submit appends one tracker row and organizes every receipt once per source key (3.3026ms)
✔ submit keeps the tracker row when drive setup is unavailable (2.1367ms)
✔ setup removes duplicate triggers and creates one form-submit trigger (1.4744ms)
✔ setup applies status validation and deduplicates existing submit triggers (2.6591ms)
✔ setup replaces an incompatible same-name trigger with one spreadsheet form-submit trigger (1.5899ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 241.3879
```

Command output for `npm test`:
```text
> student-coffee-pos@0.1.0 test
> node --test tests/*.test.mjs

✔ daily Supabase export upserts closed shifts and their transactions without duplicates (9.383ms)
✔ setupDailySupabaseExport creates one Singapore trigger at 03:00 (1.8182ms)
✔ normalizes a valid Form response into the tracker contract (9.5065ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (1.6628ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (2.064ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.552ms)
✔ form submit appends one tracker row and organizes every receipt once per source key (4.0971ms)
✔ submit keeps the tracker row when drive setup is unavailable (2.7654ms)
✔ setup removes duplicate triggers and creates one form-submit trigger (2.0864ms)
✔ setup applies status validation and deduplicates existing submit triggers (3.5205ms)
✔ setup replaces an incompatible same-name trigger with one spreadsheet form-submit trigger (3.094ms)
✔ normalizeDashboardOrder defaults missing fulfillment status to pending (1.405ms)
✔ dashboardStats separates waste from fulfillment orders (2.1545ms)
✔ buildOrderStatusPayload includes the authenticated staff actor (0.3881ms)
✔ NORMAL_SALE uses the normal product price (1.1121ms)
✔ STAFF uses the staff product price (0.2559ms)
✔ cart total supports multiple products and quantities (0.3063ms)
✔ cart keeps hot and iced versions of the same drink separate (1.6839ms)
✔ successResponse uses the shared API envelope (49.0045ms)
✔ errorResponse uses a stable code and status (0.8001ms)
✔ manifest configures a standalone Student Coffee POS web app (9.079ms)
✔ formatMop presents POS totals as Macau patacas with two decimals (2.9189ms)
✔ paymentActionLabel names the amount and payment method (0.5877ms)
✔ formatTemperature gives drink choices a readable label (0.3269ms)
✔ getInitials creates a compact staff-card label (1.6621ms)
✔ possessiveName keeps staff names ending in s readable (0.4549ms)
✔ parseShiftAmount accepts non-negative decimal totals (0.4403ms)
✔ parseShiftAmount rejects malformed and negative totals (0.9059ms)
✔ readServerEnv rejects missing server-only credentials (2.1539ms)
✔ hashPin verifies the original PIN and rejects another PIN (118.0741ms)
✔ idempotencyResult returns duplicate for the same transaction fingerprint (2.2245ms)
✔ idempotencyResult rejects a conflicting transaction fingerprint (0.7866ms)
✔ validateTransactionInput accepts a normal paid sale (1.9452ms)
✔ validateTransactionInput rejects a paid waste record (0.8833ms)
✔ fingerprintTransaction is stable for equivalent payloads (1.3009ms)
✔ session token round-trips staff identity (3.1634ms)
✔ expired or tampered session token is rejected (0.5624ms)
✔ buildShiftSyncPayload preserves stable shift and transaction identifiers (1.8662ms)
✔ buildShiftSyncPayload is deterministic for retries (0.2704ms)
✔ normal sale payload contains normal-priced line items and payment method (3.8691ms)
✔ staff payload uses staff price only (0.2869ms)
✔ waste payload has zero total and no payment method (1.0719ms)
✔ checkout draft keeps one transaction ID for retries (3.8518ms)
✔ pending checkout survives reload and stays isolated by staff and shift (0.4588ms)
✔ restoreCheckoutDraft rebuilds the cart from a pending transaction (0.3415ms)
ℹ tests 45
ℹ suites 0
ℹ pass 45
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 900.3026
```

Command output for `npm run check:core`:
```text
> student-coffee-pos@0.1.0 check:core
> node --check src/lib/domain.mjs && node --check src/lib/transactions.mjs && node --check src/lib/api.mjs && node --check src/lib/presentation.mjs && node --check src/lib/dashboard.mjs
```

Concerns:
- No live Apps Script execution was available here, so trigger source and event-type verification still relies on the local harness rather than Google’s runtime objects.
- The reviewer’s deferred coverage gap for single-file Drive move failure remains open by instruction and was not addressed in this fix round.

## Fix round 2

Date: 2026-09-01

Changed files:
- `apps-script/expenses.gs`
- `tests/apps-script-expenses.test.mjs`

Reviewer finding addressed:
- `setupExpenseAutomation()` now collects same-name triggers to delete before mutating the trigger list, so adjacent incompatible `onExpenseFormSubmit` triggers cannot be skipped and exactly one valid spreadsheet `ON_FORM_SUBMIT` trigger remains.

Commands run:
- `node --test tests/apps-script-expenses.test.mjs`
- `npm test`
- `npm run check:core`

Command output for `node --test tests/apps-script-expenses.test.mjs`:
```text
✔ normalizes a valid Form response into the tracker contract (12.9075ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (1.998ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (1.9007ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.6222ms)
✔ form submit appends one tracker row and organizes every receipt once per source key (3.4679ms)
✔ submit keeps the tracker row when drive setup is unavailable (1.4441ms)
✔ setup removes duplicate triggers and creates one form-submit trigger (1.7223ms)
✔ setup applies status validation and deduplicates existing submit triggers (2.6005ms)
✔ setup replaces an incompatible same-name trigger with one spreadsheet form-submit trigger (1.4368ms)
✔ setup removes adjacent incompatible same-name triggers and leaves one valid spreadsheet form-submit trigger (1.2818ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 256.5691
```

Command output for `npm test`:
```text
> student-coffee-pos@0.1.0 test
> node --test tests/*.test.mjs

✔ daily Supabase export upserts closed shifts and their transactions without duplicates (8.5122ms)
✔ setupDailySupabaseExport creates one Singapore trigger at 03:00 (2.4503ms)
✔ normalizes a valid Form response into the tracker contract (9.8171ms)
✔ marks an incomplete response as NEEDS_INFO instead of dropping it (1.9671ms)
✔ preserves the local purchase date and expense ID date key for near-midnight local timestamps (2.0094ms)
✔ preserves every uploaded receipt URL when Forms supplies multiple values (1.7703ms)
✔ form submit appends one tracker row and organizes every receipt once per source key (4.2456ms)
✔ submit keeps the tracker row when drive setup is unavailable (2.0991ms)
✔ setup removes duplicate triggers and creates one form-submit trigger (1.9974ms)
✔ setup applies status validation and deduplicates existing submit triggers (3.2619ms)
✔ setup replaces an incompatible same-name trigger with one spreadsheet form-submit trigger (1.8828ms)
✔ setup removes adjacent incompatible same-name triggers and leaves one valid spreadsheet form-submit trigger (1.8817ms)
✔ normalizeDashboardOrder defaults missing fulfillment status to pending (1.1492ms)
✔ dashboardStats separates waste from fulfillment orders (1.2072ms)
✔ buildOrderStatusPayload includes the authenticated staff actor (0.1944ms)
✔ NORMAL_SALE uses the normal product price (1.3394ms)
✔ STAFF uses the staff product price (0.203ms)
✔ cart total supports multiple products and quantities (0.2256ms)
✔ cart keeps hot and iced versions of the same drink separate (1.2983ms)
✔ successResponse uses the shared API envelope (45.9743ms)
✔ errorResponse uses a stable code and status (1.0483ms)
✔ manifest configures a standalone Student Coffee POS web app (7.5716ms)
✔ formatMop presents POS totals as Macau patacas with two decimals (3.1959ms)
✔ paymentActionLabel names the amount and payment method (0.5837ms)
✔ formatTemperature gives drink choices a readable label (0.2831ms)
✔ getInitials creates a compact staff-card label (1.8418ms)
✔ possessiveName keeps staff names ending in s readable (0.629ms)
✔ parseShiftAmount accepts non-negative decimal totals (0.6989ms)
✔ parseShiftAmount rejects malformed and negative totals (0.9623ms)
✔ readServerEnv rejects missing server-only credentials (2.3892ms)
✔ hashPin verifies the original PIN and rejects another PIN (112.0765ms)
✔ idempotencyResult returns duplicate for the same transaction fingerprint (2.4428ms)
✔ idempotencyResult rejects a conflicting transaction fingerprint (0.6095ms)
✔ validateTransactionInput accepts a normal paid sale (1.8029ms)
✔ validateTransactionInput rejects a paid waste record (0.8025ms)
✔ fingerprintTransaction is stable for equivalent payloads (1.1541ms)
✔ session token round-trips staff identity (2.5635ms)
✔ expired or tampered session token is rejected (0.4467ms)
✔ buildShiftSyncPayload preserves stable shift and transaction identifiers (1.7201ms)
✔ buildShiftSyncPayload is deterministic for retries (0.2961ms)
✔ normal sale payload contains normal-priced line items and payment method (1.8747ms)
✔ staff payload uses staff price only (0.2057ms)
✔ waste payload has zero total and no payment method (0.9805ms)
✔ checkout draft keeps one transaction ID for retries (3.9379ms)
✔ pending checkout survives reload and stays isolated by staff and shift (0.4845ms)
✔ restoreCheckoutDraft rebuilds the cart from a pending transaction (0.3823ms)
ℹ tests 46
ℹ suites 0
ℹ pass 46
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 922.4009
```

Command output for `npm run check:core`:
```text
> student-coffee-pos@0.1.0 check:core
> node --check src/lib/domain.mjs && node --check src/lib/transactions.mjs && node --check src/lib/api.mjs && node --check src/lib/presentation.mjs && node --check src/lib/dashboard.mjs
```

Concerns:
- No live Apps Script execution was available here, so trigger cleanup still relies on the local harness rather than live Google runtime trigger objects.
- The deferred minor coverage gap for single-file Drive move failure remains unchanged by instruction.
