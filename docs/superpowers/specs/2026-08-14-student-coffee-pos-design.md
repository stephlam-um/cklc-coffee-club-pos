# Student Coffee POS v1 Design

## Goal
Build a tablet/mobile-first POS for a small student coffee shop. It must make normal sales, staff-price drinks, and waste logging fast, while keeping Google Spreadsheet as the source of operational data.

## Architecture
- Next.js standalone web app deployed to Vercel or any Node-compatible host.
- Google Apps Script web app acts as the lightweight API.
- Google Spreadsheet stores Products, Staff, Transactions, and Shifts.
- Menu and staff configuration are read from the spreadsheet rather than hard-coded into the UI.

## User flow
### Login
- Staff selects their name and enters a 4-digit PIN.
- Session is stored locally for the current browser session.

### Normal Sale
- Large product buttons add items to a multi-item cart.
- Staff can increment/decrement quantities.
- Checkout payment methods: MPay or WeChat Pay only.
- Submission writes one transaction containing line items, total, payment method, staff ID, timestamp, and transaction ID.

### Staff
- STAFF is staff-price purchase only. There is no free staff drink.
- The current logged-in staff member is automatically the beneficiary.
- Uses each product's staff_price.
- Payment methods: MPay or WeChat Pay.

### Waste
- Staff chooses product/raw item and quantity.
- Reasons: Made Wrong, Calibration, Spilled, Other.
- Waste total is zero and payment method is blank.

### Close Shift
- Shows expected MPay and WeChat Pay totals from transactions in the current shift.
- Staff enters actual MPay and WeChat Pay totals.
- Stores expected, actual, difference, note, opened_at, and closed_at.

## Spreadsheet schema
### Products
`id | name | category | price | staff_price | active | sort_order`

### Staff
`id | name | pin | role | active`

Roles: `STAFF`, `MANAGER`.

### Transactions
`transaction_id | timestamp | shift_id | staff_id | type | items_json | total | payment_method | waste_reason | status`

Transaction types: `NORMAL_SALE`, `STAFF`, `WASTE`.
Status: `COMPLETED`, `VOIDED` (v1 creates completed records only; schema reserves VOIDED).

### Shifts
`shift_id | staff_id | opened_at | closed_at | mpay_expected | wechat_expected | mpay_actual | wechat_actual | difference | note | status`

## API
Google Apps Script accepts JSON requests with `action`:
- `getBootstrap`: returns active products and staff.
- `login`: verifies staff ID + PIN.
- `openShift`: creates a shift.
- `createTransaction`: validates and appends one transaction.
- `closeShift`: calculates expected payment totals from transactions and appends/updates closing data.

All mutating calls require a shared API token. PIN values never need to be sent back to the frontend bootstrap payload.

## UI
- Tablet-first responsive layout, usable on mobile.
- Large high-contrast buttons; minimal text.
- Top-level mode switch: Normal Sale / Staff / Waste.
- Cart remains visible on wider screens and becomes a bottom section on mobile.
- Submission buttons lock while submitting to prevent accidental duplicates.
- Failed submissions keep the cart intact and provide Retry.

## Reliability
- Client generates transaction IDs before submission, enabling idempotent duplicate protection in Apps Script.
- Apps Script rejects duplicate transaction IDs.
- Successful submission clears cart only after API confirmation.
- Apps Script uses a document lock during append operations.

## v1 exclusions
No free staff cups, Alipay, cash, inventory deduction, payroll, customer accounts, loyalty points, QR ordering, receipt printer, complex analytics, or scheduling.
