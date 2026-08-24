# Today Orders Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staff-accessible “Today’s Orders” dashboard that syncs today’s non-waste transactions from Google Sheets and lets staff mark order fulfillment as pending or completed.

**Architecture:** Keep payment/transaction `status` unchanged and add separate fulfillment fields to the `Transactions` sheet: `fulfillment_status`, `completed_at`, and `completed_by`. Add Apps Script actions `getTodayOrders` and `updateOrderStatus`; the Next.js client calls them through the existing shared-token API. Add a dashboard view inside the existing POS app, available to all authenticated staff, with manual refresh and a visible last-synced timestamp.

**Tech Stack:** Next.js App Router, React, plain CSS, Google Apps Script, Google Sheets, Node built-in test runner.

**Spec:** Approved in chat on 2026-08-19: staff and managers can view today’s order dashboard; orders can be marked completed or not completed; Waste remains separate from fulfillment orders.

## Global Constraints

- Existing transaction types remain `NORMAL_SALE`, `STAFF`, and `WASTE`.
- Existing payment methods remain `MPAY` and `WECHAT_PAY`.
- Existing transaction `status` remains the payment/record status and is not reused for fulfillment.
- Fulfillment status values are exactly `PENDING` and `COMPLETED`.
- Only non-Waste transactions appear in the fulfillment queue; Waste appears in dashboard statistics.
- Today is calculated using the Apps Script project timezone.
- All authenticated active staff may read today’s dashboard and update fulfillment status.
- Existing POS checkout, close-shift, and duplicate transaction behavior must remain unchanged.

---

### Task 1: Fulfillment domain helpers and API contracts

**Files:**
- Create: `src/lib/dashboard.mjs`
- Modify: `src/lib/api.mjs`
- Test: `tests/dashboard.test.mjs`

**Interfaces:**
- `FULFILLMENT_STATUS = ['PENDING', 'COMPLETED']`
- `normalizeDashboardOrder(row)` returns a display-safe order object with `transactionId`, `timestamp`, `staffName`, `items`, `total`, `paymentMethod`, and `fulfillmentStatus`.
- `dashboardStats(orders)` returns `{ orderCount, revenue, pendingCount, completedCount, mpayTotal, wechatTotal, wasteCount, wasteTotal }`.
- `posApi.getTodayOrders()` calls action `getTodayOrders`.
- `posApi.updateOrderStatus(transactionId, fulfillmentStatus, staffId)` calls action `updateOrderStatus`.

- [ ] Write failing tests for defaulting missing fulfillment status to `PENDING`, excluding Waste from fulfillment orders, calculating totals, and building update payloads.
- [ ] Run `pnpm test` and verify the new tests fail because `src/lib/dashboard.mjs` and API methods are missing.
- [ ] Implement the minimal pure helpers and API methods.
- [ ] Run `pnpm test` and verify all dashboard and existing tests pass.

### Task 2: Apps Script schema and synchronized order endpoints

**Files:**
- Modify: `apps-script/Code.gs`
- Modify: `README.md`

**Interfaces:**
- `getTodayOrders` returns `{ date, timezone, orders, stats, syncedAt }`.
- `updateOrderStatus` validates the transaction ID, active staff ID, and status, then updates only the fulfillment columns for the matching transaction.

- [ ] Extend the Transactions header setup with `fulfillment_status`, `completed_at`, and `completed_by`.
- [ ] Add a header migration helper that appends missing columns to an existing Transactions sheet without deleting data.
- [ ] Implement timezone-aware today filtering using the Apps Script project timezone and return normalized items from `items_json`.
- [ ] Exclude Waste from `orders` while including it in `wasteCount` and `wasteTotal`.
- [ ] Require the shared API token for both new actions.
- [ ] Use a document lock around fulfillment updates to prevent concurrent overwrite.
- [ ] Document the new columns, migration behavior, and deployment update steps in `README.md`.

### Task 3: Staff dashboard UI

**Files:**
- Create: `src/components/pos/TodayDashboard.jsx`
- Modify: `src/app/page.jsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Dashboard props include authenticated staff, `dashboardData`, `loading`, `error`, `onRefresh`, and `onUpdateStatus`.
- The dashboard renders summary cards, a pending/completed queue, Waste statistics, last-synced time, refresh action, and per-order completion toggle.

- [ ] Add an authenticated view switch between `POS` and `Today’s Orders`.
- [ ] Load dashboard data after staff authentication and on manual refresh.
- [ ] Render pending orders first, then completed orders, with newest orders first within each group.
- [ ] Make status updates explicit and server-confirmed; preserve the previous status if the API fails.
- [ ] Add empty, loading, error, and stale-sync states with actionable copy.
- [ ] Reuse Campus Counter styling: ticket queue cards, orange pending state, mint completed state, responsive mobile queue, visible keyboard focus, and `aria-live` status updates.

### Task 4: End-to-end verification

**Files:**
- Modify: `tests/dashboard.test.mjs` if additional regression coverage is needed.

- [ ] Run `pnpm test` and confirm all tests pass.
- [ ] Run `pnpm run check:core` and confirm all modules pass syntax checks.
- [ ] Run `pnpm run build` and confirm the Next.js production build passes.
- [ ] Run a live Apps Script `getTodayOrders` request and verify the response shape without printing the API token.
- [ ] Verify the authenticated POS still loads staff and products.
- [ ] Verify the dashboard renders staff access, refresh state, pending/completed status, and mobile layout in the browser.
- [ ] Review the final diff for accidental credential exposure and unrelated changes.
