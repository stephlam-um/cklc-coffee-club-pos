# Student Coffee POS

A small tablet/mobile-first POS for a student coffee shop. It supports only three transaction types: **Normal Sale**, **Staff Price**, and **Waste**. Paid transactions use **MPay** or **WeChat Pay**. Staff drinks are paid at `staff_price`; there is no free-cup workflow.

## What is included
- Next.js POS UI with large product buttons and multi-item cart.
- Staff name + 4-digit PIN login.
- Normal and staff-price checkout.
- Waste logging with four reasons.
- Close-shift reconciliation for MPay and WeChat Pay.
- Google Apps Script backend with duplicate transaction protection.
- Spreadsheet bootstrap function that creates the four required tabs.

## 1. Create the Google Sheet
Create a blank Google Spreadsheet, then open **Extensions → Apps Script**.

Copy `apps-script/Code.gs` into the Apps Script editor. Run `setupSheets()` once and authorize it. It creates:

- `Products`: `id | name | category | price | staff_price | active | sort_order`
- `Staff`: `id | name | pin | role | active`
- `Transactions`: `transaction_id | timestamp | shift_id | staff_id | type | items_json | total | payment_method | waste_reason | status | fulfillment_status | completed_at | completed_by`
- `Shifts`: `shift_id | staff_id | opened_at | closed_at | mpay_expected | wechat_expected | mpay_actual | wechat_actual | difference | note | status`

Replace the sample Manager record and PIN immediately.

## 2. Add the API token
In Apps Script, open **Project Settings → Script Properties** and add:

`POS_API_TOKEN = <a long random secret>`

The same value goes into the frontend environment variable below. This is adequate for a low-risk student-shop v1, but it is a shared secret exposed to the browser and should not be treated as strong authentication.

## 3. Deploy Apps Script
Use **Deploy → New deployment → Web app**.

- Execute as: Me
- Who has access: Anyone with the link / the least-permissive option that still allows your POS browsers to call it

Copy the `/exec` URL.

## 4. Configure the frontend
Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set:

```text
NEXT_PUBLIC_APPS_SCRIPT_URL=<your /exec URL>
NEXT_PUBLIC_POS_API_TOKEN=<same token as Script Properties>
```

## 5. Run locally

```bash
npm install
npm run dev
```

Open the local URL on a tablet or phone browser.

## 6. Deploy
Deploy the Next.js project to Vercel and add the same two environment variables in the Vercel project settings.

## Daily operation
1. Staff taps their name and enters the 4-digit PIN.
2. A shift opens automatically.
3. Select Normal Sale, Staff Price, or Waste.
4. Tap product buttons to add multiple drinks.
5. For paid orders, tap MPay or WeChat Pay. For Waste, select a reason and record it.
6. At the end of the shift, tap **Close shift**, enter the actual MPay and WeChat totals, and submit.

## Today’s Orders dashboard

After staff sign in, use the **Today’s Orders** view to sync today’s completed transactions from the `Transactions` sheet. Paid orders appear in the fulfillment queue; Waste entries appear only in the waste summary.

Every paid order has a separate fulfillment state:

- `PENDING`: the order still needs to be made or handed over.
- `COMPLETED`: staff has confirmed the order was made or handed over.

The dashboard records `completed_at` and `completed_by` when a staff member marks an order complete. Existing transaction `status` values remain unchanged and continue to represent the transaction record itself.

If the Transactions tab already existed before this feature, run `setupSheets()` once after updating `Code.gs`. The script appends any missing fulfillment columns to the end of the tab without deleting existing data.

After editing Apps Script, deploy a new version through **Deploy → Manage deployments → Edit → New version → Deploy**.

## Editing prices or staff
Edit `Products` or `Staff` directly in Google Sheet. The POS reloads active entries from the sheet when the page opens. No frontend redeploy is required for price/name changes.

## Important v1 limits
This version intentionally has no cash, Alipay, free staff drinks, inventory tracking, scheduling, loyalty system, receipts, or customer accounts.

## Tests
Core transaction and pricing logic uses Node's built-in test runner:

```bash
npm test
npm run check:core
```

A full Next.js build additionally requires the npm dependencies to be installed:

```bash
npm install
npm run build
```
