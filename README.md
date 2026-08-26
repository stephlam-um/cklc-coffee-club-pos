# Student Coffee POS

A tablet/mobile-first POS for a student coffee shop. It supports Normal Sale, Staff Price, and Waste transactions, with MPay and WeChat Pay reconciliation.

## Architecture

- Next.js UI and same-origin Route Handlers.
- Supabase PostgreSQL as the live source of truth.
- Google Sheets as a reporting destination after a shift closes.
- Idempotent transaction IDs so network retries cannot create duplicate sales.
- iPad Safari Web App; no Swift app is required.

## 1. Create Supabase

Create a Supabase project in a region close to the shop. In the Supabase SQL editor, run these files in order:

1. `supabase/migrations/202608260001_initial_pos.sql`
2. `supabase/seed.sql`

Copy `.env.example` to `.env.local` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `SESSION_SECRET`. These are server-only values; never prefix them with `NEXT_PUBLIC_`.

Create the first staff account after setting the environment variables:

```bash
node scripts/create-staff.mjs staff-001 Manager 1234 MANAGER
```

Use a real PIN for the shop. The command stores a hash, not the plaintext PIN.

## 2. Configure Google Sheets reporting

Create a reporting spreadsheet and open **Extensions → Apps Script**. Copy `apps-script/Code.gs` into the editor and deploy it as a Web App. Run `setupSheets()` once to create the reporting tabs.

In Apps Script project settings, add a random `POS_API_TOKEN`. Add the URL and token to `.env.local`:

```text
GOOGLE_SHEETS_SYNC_URL=<your /exec URL>
GOOGLE_SHEETS_SYNC_TOKEN=<the Apps Script POS_API_TOKEN>
```

The Apps Script deployment is now a reporting receiver. The browser never sends this token.

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

## Future expenses

Expense entry is intentionally not in the POS UI. A later addition can import expenses entered in Google Sheets into a dedicated `expenses` table using a unique source-row ID, without changing the checkout interface.

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
