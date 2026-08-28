# Supabase Backend Migration Design

**Date:** 2026-08-26  
**Status:** Approved

## Goal

Replace Google Apps Script and Google Sheets as the live POS backend with a faster, transactional backend while preserving the existing Next.js user interface and staff workflow. The application will run on iPad as an installable web app. Google Sheets will remain a reporting destination and receive a shift snapshot after each successful close.

Expense reporting is explicitly deferred. The design leaves a clean extension point for expenses entered in Google Sheets to be imported into Supabase later, without adding expense controls to the POS interface now.

## Scope

### Included

- Keep the existing Next.js POS interface.
- Add server-only Next.js Route Handlers for POS operations.
- Store products, staff, shifts, transactions, transaction items, and synchronization state in Supabase PostgreSQL.
- Preserve the existing login, sale, staff-price sale, waste, order dashboard, fulfillment, and shift-closing flows.
- Make transaction creation idempotent so retries cannot create duplicate sales.
- Synchronize a closed shift to Google Sheets after the database close succeeds.
- Support installation on an iPad Home Screen as a web app.
- Refuse checkout while offline; offline order queuing is not included.

### Deferred

- Expense entry in the POS UI.
- Importing Google Sheets expenses into Supabase.
- Full offline transaction capture.
- Native Swift/iPadOS application.
- App Store distribution and native payment or printer SDK integrations.

## Architecture

The browser communicates only with same-origin Next.js APIs. Route Handlers validate the staff session, enforce business rules, and access Supabase using server-only credentials. The browser never receives a database password or privileged Supabase key.

```text
iPad Next.js web app
        |
        | HTTPS, authenticated same-origin requests
        v
Next.js Route Handlers on Vercel
        |
        | server-only PostgreSQL connection
        v
Supabase PostgreSQL (live source of truth)
        |
        | after a shift is closed
        v
Google Sheets reporting workbook
```

Supabase is the authoritative operational datastore. A Google Sheets sync failure must never roll back or invalidate a successfully closed shift. The failed export remains visible as pending and can be retried safely.

## API Boundaries

The current `posApi` abstraction remains the frontend boundary, but its endpoint changes from the public Apps Script URL to same-origin Next.js routes. The initial API surface is:

- `GET /api/bootstrap` — active products and non-sensitive staff display data.
- `POST /api/login` — verify a staff PIN and establish a secure session.
- `POST /api/shifts/open` — create or return the staff member's current open shift.
- `POST /api/transactions` — create an idempotent sale, staff sale, or waste record.
- `GET /api/orders/today` — return the current business day's orders and dashboard totals.
- `PATCH /api/orders/:transactionId/status` — update fulfillment state.
- `POST /api/shifts/:shiftId/close` — calculate expected totals and atomically close a shift.
- `POST /api/shifts/:shiftId/sync` — retry the Google Sheets export for an already closed shift.

API errors use stable machine-readable codes plus safe user messages. Internal database or credential details are logged server-side and are not returned to the browser.

## Data Model

### `products`

- `id` text primary key
- `name` text
- `category` text
- `price` numeric
- `staff_price` numeric
- `active` boolean
- `sort_order` integer
- timestamps

### `staff`

- `id` text primary key
- `name` text
- `pin_hash` text; plaintext PINs are never stored
- `role` text
- `active` boolean
- timestamps

### `shifts`

- `id` UUID primary key
- `staff_id` foreign key
- `opened_at`, `closed_at`
- expected and actual MPay/WeChat totals
- `difference` numeric
- `note` text
- `status` constrained to `OPEN` or `CLOSED`
- `sheet_sync_status` constrained to `NOT_READY`, `PENDING`, `SYNCED`, or `FAILED`
- `sheet_synced_at`, `sheet_sync_error`, and timestamps

Only one open shift per staff member is allowed by a database constraint.

### `transactions`

- `id` text primary key, generated once by the client
- `shift_id` and `staff_id` foreign keys
- `type` constrained to `NORMAL_SALE`, `STAFF`, or `WASTE`
- `total` numeric
- payment method and waste reason with constraints appropriate to the transaction type
- payment status
- fulfillment status, completion time, and completing staff member
- `created_at`

### `transaction_items`

- UUID primary key
- `transaction_id` foreign key
- product reference plus immutable snapshots of product name and unit price
- temperature, quantity, and line total

Snapshots preserve historical receipts even after a product is renamed or repriced.

### Future `expenses`

The namespace is reserved conceptually but the table and import job are not created in the first migration. A later extension can add expense date, category, supplier, amount, payment method, notes, source row ID, and import timestamps. A unique source row ID will make Sheets-to-Supabase imports idempotent.

## Duplicate Transaction Prevention

The current duplicate path occurs when a request is committed by Apps Script but its response is lost. Retrying checkout builds a new transaction ID, so the existing duplicate scan sees it as a different sale.

The migrated flow is:

1. Generate the transaction ID when the checkout attempt begins.
2. Retain that ID with the pending ticket until a definitive result is received.
3. Submit the transaction and items in one database transaction.
4. Enforce uniqueness with the `transactions.id` primary key.
5. When the same ID and equivalent payload are submitted again, return the existing successful result.
6. When the same ID is submitted with conflicting content, reject it and log the mismatch.
7. Clear the cart only after the server confirms the stored transaction.

The submit button remains disabled while a request is active. If the result is ambiguous, the UI offers a retry/check action that reuses the retained transaction ID rather than constructing another sale.

## Shift Closing and Google Sheets Sync

Shift closing is split into two durability boundaries:

1. In one PostgreSQL transaction, verify that the shift is open, compute expected totals from stored transactions, save actual totals and the difference, close the shift, and set `sheet_sync_status` to `PENDING`.
2. After commit, export the shift, transactions, line items, and waste summary to Google Sheets.

Each Sheets row includes stable Supabase identifiers. The export performs an upsert or checks those identifiers before appending, so retrying cannot duplicate report rows. On success, the shift becomes `SYNCED`; on failure it becomes `FAILED` with a safe diagnostic message. An authorized retry endpoint repeats only the export.

The initial implementation may run the export directly after close because this is a small POS. Its code is isolated behind a sync service so it can later move to a background queue or scheduled retry without changing the close-shift API contract.

## Authentication and Security

- Replace `NEXT_PUBLIC_POS_API_TOKEN`; no shared privileged secret is shipped to the browser.
- Store PINs as slow password hashes and verify them only on the server.
- Establish an HTTP-only, secure, same-site staff session after login.
- Authorize every mutation using the server session and active-staff status.
- Validate prices and totals on the server using current product data; do not trust totals sent by the browser.
- Keep Supabase service credentials and Google export credentials in server-only environment variables.
- Rate-limit login attempts and avoid logging PINs, tokens, or database credentials.

## iPad Web App

The existing responsive Next.js UI remains the application. PWA metadata, icons, standalone display mode, safe-area handling, and an iPad-friendly viewport make it installable through Safari's Add to Home Screen flow.

Because offline sales are out of scope, the app monitors connectivity and disables checkout when it cannot reach the API. Product browsing and the current cart may remain visible, but the UI must clearly state that payment cannot be recorded until the connection returns.

Swift is unnecessary for this scope. A native application should be reconsidered only if the project later requires native printer/payment SDKs, deep hardware integration, App Store distribution, or robust offline transactions.

## Migration Strategy

1. Create the Supabase schema and seed products and staff from the existing workbook.
2. Implement and test the new Next.js APIs while Apps Script remains available.
3. Point the frontend API abstraction at the Next.js endpoints in a staging environment.
4. Import historical shifts and transactions, preserving existing IDs where possible.
5. Reconcile counts and payment totals between PostgreSQL and Google Sheets.
6. Perform an end-to-end test on the target iPad.
7. Switch production traffic to the new API.
8. Keep the Apps Script deployment read-only for a short rollback window, then retire its live write endpoints.

The cutover occurs between shifts. No open shift is migrated while staff are actively entering transactions.

## Error Handling

- Database write failure: leave the cart intact and allow retry with the same transaction ID.
- Ambiguous network result: query/retry using the same ID; never generate another ID for that ticket.
- Offline state: disable checkout and shift close with a clear connection message.
- Sheets export failure: keep the shift closed in Supabase, expose failed sync status, and permit an idempotent retry.
- Invalid or expired session: return an authorization error and request staff login without exposing backend details.
- Conflicting duplicate ID: reject, preserve both the stored record and local cart, and flag the event for investigation.

## Testing and Acceptance Criteria

### Automated tests

- Domain tests for normal, staff, and waste pricing rules.
- API validation and authorization tests.
- Database integration tests for constraints and atomic shift closing.
- Idempotency tests that send the same transaction twice and assert one stored transaction.
- Lost-response simulation: commit once, retry the same request, and assert one stored transaction and the same response identity.
- Conflicting-payload test for reuse of an existing transaction ID.
- Sheets export retry test proving stable IDs prevent duplicate report rows.
- Authentication tests proving invalid PINs and inactive staff cannot mutate data.

### End-to-end acceptance

- Staff can open a shift, record each transaction type, update fulfillment, and close the shift on iPad.
- Dashboard reads are materially faster than the current full-sheet scans under representative data volume.
- Rapid taps and network retries do not create duplicate transactions.
- A closed shift remains valid when Sheets is unavailable and synchronizes successfully after retry.
- Payment and waste totals match between Supabase and the exported Google Sheets report.
- The site installs and launches from the iPad Home Screen in standalone mode.
- Checkout is visibly unavailable when the API cannot be reached.

## Success Criteria

The migration is complete when Supabase is the sole live source of truth, all POS operations use authenticated Next.js APIs, retry scenarios cannot create duplicate transactions, shift-close exports are recoverable and idempotent, and staff can reliably operate the installed web app on the target iPad without a native Swift application.
