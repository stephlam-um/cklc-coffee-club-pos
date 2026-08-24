# Student Coffee POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable Next.js student coffee POS backed by a Google Apps Script API and Google Spreadsheet.

**Architecture:** A client-heavy Next.js interface handles login, mode selection, cart state and checkout. A small typed API client sends JSON actions to Google Apps Script, which validates requests and writes to four spreadsheet tabs. Core pricing/cart logic is kept in pure TypeScript modules for testability.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Google Apps Script, Google Spreadsheet.

## Global Constraints
- Transaction types are exactly `NORMAL_SALE`, `STAFF`, `WASTE`.
- STAFF means staff-price purchase only; there is no free staff cup.
- Payment methods are exactly `MPAY`, `WECHAT_PAY` for paid transactions.
- Normal and staff transactions support multiple items per order.
- Products and staff are configured from Google Spreadsheet.
- Waste reasons are `MADE_WRONG`, `CALIBRATION`, `SPILLED`, `OTHER`.
- v1 excludes inventory, payroll, scheduling, customer accounts, loyalty, QR ordering, printed receipts and complex analytics.

---

### Task 1: Project scaffold and typed domain model
**Files:** create `package.json`, Next.js config/app shell, `src/lib/domain.ts`, tests.
**Interfaces:** produce Product, StaffPublic, TransactionType, PaymentMethod, WasteReason, CartLine types and pricing helpers.
- [ ] Write failing tests for normal/staff price selection and cart totals.
- [ ] Run tests and verify RED.
- [ ] Implement minimal domain/pricing helpers.
- [ ] Run tests and verify GREEN.
- [ ] Commit.

### Task 2: API client and retry-safe transaction payloads
**Files:** create `src/lib/api.ts`, `src/lib/transactions.ts`, tests.
**Interfaces:** produce `PosApi`, `buildTransactionPayload`, client-generated IDs and error normalization.
- [ ] Write failing tests for payload shape, STAFF pricing and WASTE zero total.
- [ ] Verify RED.
- [ ] Implement minimal helpers/client.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 3: POS interface
**Files:** create app page and focused components under `src/components/pos/` plus CSS.
**Interfaces:** consume domain and API modules; expose login, mode tabs, product grid, cart, checkout and waste reason controls.
- [ ] Write component tests for multi-item cart, staff pricing and failed-submit retention.
- [ ] Verify RED.
- [ ] Implement UI.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 4: Google Apps Script backend
**Files:** create `apps-script/Code.gs`, `apps-script/appsscript.json`, `apps-script/README.md` and tests for extracted validation logic where practical.
**Interfaces:** actions `getBootstrap`, `login`, `openShift`, `createTransaction`, `closeShift`.
- [ ] Write validation tests/fixtures first.
- [ ] Verify RED.
- [ ] Implement Apps Script endpoints with lock and duplicate transaction protection.
- [ ] Verify tests/static checks GREEN.
- [ ] Commit.

### Task 5: Setup docs and end-to-end verification
**Files:** create `.env.example`, root `README.md`.
**Interfaces:** document sheet headers, Apps Script deployment, API token setup, Vercel deployment and smoke test.
- [ ] Add documented test checklist.
- [ ] Run unit/component tests.
- [ ] Run `npm run build`.
- [ ] Run lint/type checks.
- [ ] Inspect git diff/status and package downloadable project.
- [ ] Commit.
