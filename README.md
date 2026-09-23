# Student Coffee POS

A tablet/mobile-first POS for a student coffee shop. It supports Normal Sale, Staff Price, and Waste transactions, with MPay and WeChat Pay reconciliation.

## Architecture

- Next.js UI and same-origin Route Handlers.
- Supabase PostgreSQL as the live source of truth.
- Google Sheets as an on-demand reporting destination; it is independent of checkout and shift closure.
- Idempotent transaction IDs so network retries cannot create duplicate sales.
- iPad Safari Web App; no Swift app is required.

## 1. Create Supabase

Create a Supabase project in a region close to the shop. In the Supabase SQL editor, run these files in order:

1. `supabase/migrations/202608260001_initial_pos.sql`
2. `supabase/seed.sql`

For an existing deployment, apply the versioned migrations in `supabase/migrations/` in timestamp order. Apply `202609160001_reporting_rpc_decouple.sql` before deploying the application and Apps Script changes. Keep `202609160002_retire_legacy_financial_entries.sql` unapplied until the production RPC, daily export, monthly report, and manual sync have been verified and a recoverable database backup is confirmed.

Copy `.env.example` to `.env.local` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `SESSION_SECRET`. These are server-only values; never prefix them with `NEXT_PUBLIC_`.

Create the first staff account after setting the environment variables:

```bash
node scripts/create-staff.mjs staff-001 Manager 1234 MANAGER
```

Use a real PIN for the shop. The command stores a hash, not the plaintext PIN.

## 2. Configure Google Sheets reporting

Create or open the existing reporting spreadsheet and open **Extensions → Apps Script**. Add the daily-export functions from `apps-script/Code.gs` (`exportSupabaseReports`, `setupDailySupabaseExport`, `fetchSupabaseRows_`, `replaceFinancialEntries_`, and `ensureReportSheet_`) to the existing project. If `ensureReportSheet_` already exists, keep the existing copy. Do not run `setupSheets()` and do not recreate or replace your existing `Products` or `Staff` tabs; the financial export only creates or replaces the `Financial_Entries` tab.

In Apps Script project settings, add a random `POS_API_TOKEN`. Add the URL and token to `.env.local`:

```text
GOOGLE_SHEETS_SYNC_URL=<your /exec URL>
GOOGLE_SHEETS_SYNC_TOKEN=<the Apps Script POS_API_TOKEN>
```

The Apps Script deployment is now a reporting receiver. The browser never sends this token.

### Daily Supabase export

The same Apps Script project runs a nightly financial backfill from the read-only Supabase RPC into `Financial_Entries`. This is a reporting job only; Supabase remains the live source of truth.

1. In Apps Script, open **Project Settings → Script properties** and add:

   ```text
   SUPABASE_URL=https://reyaftglfoskqtxuhfrd.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<server-only Supabase service-role key>
   ```

   Keep the service-role key in Script Properties only. Do not put it in `Code.gs`, a sheet cell, or the browser bundle.
2. Run `exportSupabaseReports()` once from the Apps Script editor and approve the requested permissions. The function replaces the derived `Financial_Entries` snapshot, so retries are deterministic and do not create duplicate report rows.
3. Run `setupDailySupabaseExport()` once. It creates one daily trigger for 03:00 in `Asia/Singapore` and removes duplicate triggers for the same handler.

The export calls the read-only `get_financial_entries` RPC in pages of 500 rows and replaces the `Financial_Entries` tab with the current six-column accounting view. Supabase remains the source of truth; the sheet is a reporting copy. The legacy `financial_entries` table is retained only during the staged rollback window and is not a reporting dependency.

## 3. Run locally

```bash
npm install
npm run dev
```

Open the local URL in Safari on the iPad or in a desktop browser.

## 4. Deploy

Deploy the Next.js project to Vercel. Add every value from `.env.local` to the Vercel project environment settings. Keep `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and `GOOGLE_SHEETS_SYNC_TOKEN` server-only.

## 5. Install on iPad

Open the deployed URL in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**. The POS launches from the Home Screen in standalone mode.

Checkout and shift close are disabled while offline. Offline order queuing is intentionally not supported.

## Migration and daily operation

Perform cutover between shifts. Import historical transactions into Supabase, reconcile totals, and then use the new `/api` routes. Keep the old Apps Script write deployment available only during a short rollback window.

1. Staff taps their name and enters the 4-digit PIN.
2. A shift opens automatically.
3. Select Normal Sale, Staff Price, or Waste.
4. Choose Hot or Iced on each drink.
5. For paid orders, tap MPay or WeChat Pay. For Waste, select a reason.
6. At the end of the shift, tap Close shift and enter actual MPay and WeChat totals.

After close, the shift is durable in Supabase even if Sheets is unavailable. The sync endpoint can retry the same stable shift and transaction IDs.

If a payment request times out, retry the same payment action. The original transaction ID is reused and the database returns the original result instead of creating another sale.

## 6. Google Forms expense claims

Expense entry is intentionally not in the POS UI. Use a Google Form connected to the existing reporting spreadsheet for expense claims.

### Create the expense Form

1. Create a Google Form named `Student Coffee Expense Claim`.
2. In **Settings → Responses**, turn on **Collect email addresses** and require sign-in to the organization account. Do not allow anonymous responses.
3. Add these questions with the exact titles and types:

   - `Member name` — Short answer, required.
   - `Purchase date` — Date, required.
   - `Vendor` — Short answer, required.
   - `Amount` — Short answer, required. Enter a positive amount in MOP.
   - `Category` — Dropdown, required; options exactly `Ingredients`, `Supplies`, and `Other`.
   - `Description` — Paragraph, optional.
   - `Receipt` — File upload, required; allow exactly one image or PDF file per response, with a maximum of 10 MB.

   The email collected by Forms is submitted as `Email Address`; do not add a separate email question. The raw response sheet must remain the Form's linked response destination. Do not rename, reorder, delete, or manually edit its response columns: the automation uses that sheet's form-submit event and source row as its idempotency key.

### Configure Drive and Apps Script

1. Create a restricted Google Drive folder named `Expenses`. Share it only with the managers and the account that owns the Apps Script project. Copy the folder ID from its URL.
2. Open the existing reporting spreadsheet's **Extensions → Apps Script** project and add the complete contents of `apps-script/expenses.gs` as a new script file. Keep the existing `Code.gs` and other reporting code unchanged.
3. In **Project Settings → Script properties**, add:

   ```text
   EXPENSE_ROOT_FOLDER_ID=<the ID of the restricted Expenses folder>
   ```

4. Save the project and run `setupExpenseAutomation()` once from the Apps Script editor. Approve the requested Google Sheets, Drive, and Forms permissions.
5. Verify that the linked spreadsheet contains an `Expenses_Tracker` sheet with its header row and that Apps Script has exactly one spreadsheet **On form submit** installable trigger for `onExpenseFormSubmit`.

When a claim is submitted, the script moves uploaded receipts into `Expenses/<year>/<month>/<expense_id>_<vendor>_<member>`, renames them with the expense ID, and writes the claim to `Expenses_Tracker`. If the root folder is not configured or a receipt cannot be organized, the claim remains recorded and the issue is placed in `manager_note`.

### Test one claim

Submit one real or disposable test response with a valid member name, organization email, purchase date, vendor, positive MOP amount, one of the three categories, and one image or PDF receipt. Confirm that:

- the raw Form response appears in the linked response sheet;
- one row appears in `Expenses_Tracker` with an `EXP-YYYYMMDD-####` ID and status `SUBMITTED`;
- the receipt is in the restricted `Expenses` folder under the expected year, month, and claim folder; and
- the tracker has not received a duplicate row after refreshing or retrying the test.

Incomplete or invalid claims are still recorded with status `NEEDS_INFO`; they are not silently discarded.

### Daily expense operations

The manager reviews the receipt and claim in `Expenses_Tracker` and updates the `status` column using the allowed workflow:

1. New complete claims start at `SUBMITTED`.
2. Change `SUBMITTED` to `NEEDS_INFO` when information or a usable receipt is missing, and put the request or explanation in `manager_note`.
3. Change a verified claim to `APPROVED`, recording `approved_by` and `approved_at`.
4. Change an invalid or non-reimbursable claim to `REJECTED`, recording the reason in `manager_note`.
5. If more information is supplied for a `NEEDS_INFO` claim, change it back to `SUBMITTED`; if it cannot be reimbursed, change it to `REJECTED`.
6. After an approved claim is paid, record `paid_by`, `paid_at`, and `payment_reference`, then change its status to `PAID`.

`REJECTED` and `PAID` are terminal statuses. Do not move claims out of either status.

Do not delete tracker rows or alter the raw response sheet. Google Sheets remains the source of truth for claim status, approval, payment, and audit history.

### Generate a monthly report

For the combined MOP/RMB monthly financial workbook matching the financial template, see [Monthly financial reports](docs/monthly-financial-reports.md). Add `apps-script/financial-reports.gs` to the existing reporting Apps Script project. The workflow generates a reusable draft, recalculates RMB prices per unit, requires review, and exports approved Excel/PDF snapshots. The setup requires a native Google Sheets copy of the supplied XLSM template. This is separate from the expense-only Markdown report below.

From the Apps Script editor, run the function below with the required month in `YYYY-MM` format:

```javascript
generateExpenseMarkdownReport('YYYY-MM')
```

The script creates or replaces `Expense_Report_YYYY-MM.md` in the restricted `Expenses` folder and returns an object containing `fileName`, `yearMonth`, and `rowCount`; use `result.rowCount` for the number of matching rows. The report is a snapshot for review and sharing; update the tracker in Sheets when correcting a claim, because Sheets remains the source of truth.

## Today’s Orders dashboard

After staff sign in, use Today’s Orders to view completed transactions. Paid orders appear in the fulfillment queue; Waste entries appear in the waste summary. Fulfillment states are `PENDING` and `COMPLETED` and are separate from the transaction record status.

## Important v1 limits

This version has no cash, Alipay, free staff drinks, inventory tracking, scheduling, loyalty system, receipts, customer accounts, or offline transaction queue.

## Tests

```bash
npm test
npm run check:core
npm run build
```
