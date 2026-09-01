# Google Forms Expense Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Forms/Sheets/Drive expense-reimbursement MVP beside the existing POS reporting automation.

**Architecture:** Add an isolated `apps-script/expenses.gs` module to the existing Apps Script project. A spreadsheet form-submit trigger will read raw Form responses, create an idempotent tracker row, and organize uploaded files under a configured Drive folder. Google Sheets remains the workflow record; a pure Markdown builder and Drive writer provide an optional monthly review snapshot.

**Tech Stack:** Google Apps Script JavaScript, Google Sheets, Google Drive, Google Forms, Node.js built-in test runner, Node.js `vm` test harness.

**Spec:** `docs/superpowers/specs/2026-09-01-expense-form-drive-automation-design.md`

## Global Constraints

- Use the exact Form question titles `Member name`, `Purchase date`, `Vendor`, `Amount`, `Category`, `Description`, and `Receipt`.
- Keep the linked Form response sheet raw; all review/payment fields live in `Expenses_Tracker`.
- Use `Expenses_Tracker` headers exactly as defined in the spec.
- Use statuses `SUBMITTED`, `NEEDS_INFO`, `APPROVED`, `REJECTED`, and `PAID`.
- Deduplicate trigger reprocessing with `source_key`; never create a second tracker row for the same raw response.
- Store the configured root folder ID only in Apps Script Properties as `EXPENSE_ROOT_FOLDER_ID`.
- Do not modify the existing POS sheets or the existing functions in `apps-script/Code.gs`.
- Do not add OCR, automatic payment, native POS UI, or Supabase persistence in this change.
- Keep receipt organization failures non-blocking: retain the original receipt URL and record a manager note.
- Run `npm test` and `npm run check:core` after implementation; the existing 36-test baseline must continue to pass.

## File map

- Create: `apps-script/expenses.gs` — expense constants, Form response normalization, tracker setup, Drive organization, and Markdown report generation.
- Create: `tests/apps-script-expenses.test.mjs` — isolated VM harness and tests for the Apps Script module.
- Modify: `README.md` — setup and operating instructions for the Google Form expense workflow.
- Reference only: `docs/superpowers/specs/2026-09-01-expense-form-drive-automation-design.md` — approved requirements; do not edit unless the user requests a design change.

### Task 1: Add the failing Apps Script expense tests

**Files:**
- Create: `tests/apps-script-expenses.test.mjs`
- Read: `apps-script/expenses.gs` after Task 2

**Interfaces:**
- Tests will call the global Apps Script functions `expenseNormalizeResponse_`, `expenseBuildTrackerRow_`, `buildExpenseMarkdownReport_`, `onExpenseFormSubmit`, `setupExpenseAutomation`, and `generateExpenseMarkdownReport` through a Node `vm` context.
- The harness will model only the Apps Script services needed by those functions: `SpreadsheetApp`, `DriveApp`, `PropertiesService`, `ScriptApp`, `LockService`, and `Utilities`.

- [ ] **Step 1: Create the VM harness and valid-response fixture**

Create a `createHarness()` helper with in-memory `Sheet`, `Folder`, and `File` objects. The valid Form event must provide `range.getSheet()`, `range.getRow()`, `range.getSheet().getSheetId()`, `namedValues`, and `values`, including a Drive URL such as `https://drive.google.com/file/d/receipt-1/view`.

Use this fixture shape so the test is explicit about the Form contract:

```js
const event = {
  range: { getRow: () => 7, getSheet: () => ({ getSheetId: () => 99, getName: () => 'Form Responses 1' }) },
  namedValues: {
    Timestamp: ['9/1/2026 10:30:00'],
    'Member name': ['Cici'],
    'Email Address': ['cici@example.com'],
    'Purchase date': ['9/1/2026'],
    Vendor: ['Market'],
    Amount: ['MOP 123.40'],
    Category: ['Ingredients'],
    Description: ['Milk and beans'],
    Receipt: ['https://drive.google.com/file/d/receipt-1/view'],
  },
  values: ['9/1/2026 10:30:00', 'cici@example.com', 'Cici', '9/1/2026', 'Market', 'MOP 123.40', 'Ingredients', 'Milk and beans', 'https://drive.google.com/file/d/receipt-1/view'],
}
```

- [ ] **Step 2: Write failing normalization and Markdown tests**

Add tests with these exact assertions:

```js
test('normalizes a valid Form response into the tracker contract', () => {
  const claim = context.expenseNormalizeResponse_(event)
  assert.equal(claim.sourceKey, '99:7')
  assert.equal(claim.memberName, 'Cici')
  assert.equal(claim.memberEmail, 'cici@example.com')
  assert.equal(claim.amount, 123.4)
  assert.equal(claim.category, 'Ingredients')
  assert.deepEqual(claim.receiptUrls, ['https://drive.google.com/file/d/receipt-1/view'])
  assert.equal(claim.status, 'SUBMITTED')
})

test('marks an incomplete response as NEEDS_INFO instead of dropping it', () => {
  const incomplete = { ...event, namedValues: { ...event.namedValues, Amount: ['not money'], Receipt: [''] } }
  const claim = context.expenseNormalizeResponse_(incomplete)
  assert.equal(claim.status, 'NEEDS_INFO')
  assert.match(claim.managerNote, /amount|receipt/i)
})

test('builds a monthly Markdown report with totals and receipt links', () => {
  const markdown = context.buildExpenseMarkdownReport_([
    { expense_id: 'EXP-20260901-0007', purchase_date: '2026-09-01', member_name: 'Cici', vendor: 'Market', amount: 123.4, category: 'Ingredients', receipt_url: 'https://drive.google.com/receipt-1', status: 'PAID' },
  ], '2026-09', '2026-09-01T12:00:00.000Z')
  assert.match(markdown, /Expense Report — 2026-09/)
  assert.match(markdown, /MOP 123\.40/)
  assert.match(markdown, /EXP-20260901-0007/)
  assert.match(markdown, /https:\/\/drive\.google\.com\/receipt-1/)
})
```

- [ ] **Step 3: Run the new test file and verify it fails**

Run: `node --test tests/apps-script-expenses.test.mjs`  
Expected: FAIL because `apps-script/expenses.gs` does not exist yet and the VM context has no expense functions.

- [ ] **Step 4: Commit the failing tests**

Run:

```bash
git add tests/apps-script-expenses.test.mjs
git commit -m "test: define expense form automation contract"
```

### Task 2: Implement normalization, IDs, and tracker-row construction

**Files:**
- Create: `apps-script/expenses.gs`
- Test: `tests/apps-script-expenses.test.mjs`

**Interfaces:**
- `expenseNormalizeResponse_(event)` returns a claim object with `sourceKey`, `submittedAt`, `memberName`, `memberEmail`, `purchaseDate`, `vendor`, `amount`, `category`, `description`, `receiptUrls`, `status`, and `managerNote`.
- `expenseBuildTrackerRow_(claim, expenseId, receiptUrl)` returns an array in the exact `EXPENSE_HEADERS` order.
- `buildExpenseId_(submittedAt, sourceRow)` returns IDs such as `EXP-20260901-0007`.

- [ ] **Step 1: Add expense constants and aliases**

Define distinctive globals so they cannot collide with `apps-script/Code.gs`:

```js
const EXPENSE_TRACKER_SHEET_NAME = 'Expenses_Tracker'
const EXPENSE_STATUSES = ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'PAID']
const EXPENSE_CATEGORIES = ['Ingredients', 'Supplies', 'Other']
const EXPENSE_HEADERS = ['expense_id', 'source_key', 'submitted_at', 'member_name', 'member_email', 'purchase_date', 'vendor', 'amount', 'category', 'description', 'receipt_url', 'status', 'manager_note', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'payment_reference', 'updated_at']
```

Use aliases only for generated response headers (`Email Address`, `Email`) and keep the seven user-entered question titles exact.

- [ ] **Step 2: Implement response parsing and validation**

Read each field from `event.namedValues`, trim strings, parse amounts by removing currency text and commas, accept only positive finite amounts, accept only the three allowed categories, and parse one or more Drive URLs from the receipt response. Build `sourceKey` as `${sheetId}:${row}` before generating an expense ID. Set `status` to `NEEDS_INFO` and list the missing/invalid fields in `managerNote` when amount, category, member, vendor, purchase date, or receipt is invalid; otherwise set `SUBMITTED`.

- [ ] **Step 3: Implement stable IDs and tracker rows**

Use the submitted date in `YYYYMMDD` form and the raw response row padded to four digits. Preserve the normalized receipt URL string and initialize review/payment fields to empty strings. Set `updated_at` to the processing timestamp.

- [ ] **Step 4: Run normalization tests and make them pass**

Run: `node --test tests/apps-script-expenses.test.mjs`  
Expected: the normalization, incomplete-response, and Markdown tests still fail only for the not-yet-implemented Markdown builder; normalization assertions pass.

- [ ] **Step 5: Commit the normalization implementation**

Run:

```bash
git add apps-script/expenses.gs tests/apps-script-expenses.test.mjs
git commit -m "feat: normalize expense form responses"
```

### Task 3: Implement tracker setup, idempotent submit handling, and Drive organization

**Files:**
- Modify: `apps-script/expenses.gs`
- Modify: `tests/apps-script-expenses.test.mjs`

**Interfaces:**
- `setupExpenseAutomation()` returns `{ trackerSheet: 'Expenses_Tracker', triggerCount: 1 }` and installs exactly one `onExpenseFormSubmit` spreadsheet trigger.
- `onExpenseFormSubmit(event)` returns `{ expenseId, duplicate }` and appends at most one tracker row for a given `sourceKey`.
- `organizeExpenseReceipts_(claim, expenseId)` returns `{ urls, error }` and never throws for a single Drive move failure.

- [ ] **Step 1: Add failing submit/setup tests**

Add tests that assert:

```js
test('form submit appends one tracker row and organizes the receipt', () => {
  const first = context.onExpenseFormSubmit(event)
  const second = context.onExpenseFormSubmit(event)
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(harness.sheets.get('Expenses_Tracker').rows.length, 2)
  assert.equal(harness.sheets.get('Expenses_Tracker').rows[1][0], 'EXP-20260901-0007')
  assert.equal(harness.files.get('receipt-1').parentName, 'EXP-20260901-0007_Market_Cici')
})

test('setup removes duplicate triggers and creates one form-submit trigger', () => {
  const result = context.setupExpenseAutomation()
  assert.equal(result.trackerSheet, 'Expenses_Tracker')
  assert.equal(result.triggerCount, 1)
  assert.equal(harness.createdTriggers, 1)
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/apps-script-expenses.test.mjs`  
Expected: FAIL because tracker setup, submit handling, and Drive mocks/functions are not implemented.

- [ ] **Step 3: Implement tracker-sheet setup**

Create `Expenses_Tracker` if missing, append `EXPENSE_HEADERS` only when the sheet is empty, freeze row 1, and apply a non-invalidating data validation list containing `EXPENSE_STATUSES` to the status column for rows 2 through 1000. Do not inspect or mutate any existing POS sheet.

Install one spreadsheet trigger for `onExpenseFormSubmit`; remove only duplicate triggers with that handler name, retaining one existing trigger when present.

- [ ] **Step 4: Implement idempotent submit handling**

Acquire `LockService.getDocumentLock()` before checking and writing the tracker. Ensure the tracker exists, search column 2 (`source_key`) for an existing claim, and return its existing ID with `duplicate: true` when found. Otherwise, normalize the response, create the stable ID, organize the receipt, append one row, and return `duplicate: false`. Always release the lock in `finally`.

- [ ] **Step 5: Implement Drive organization**

Read `EXPENSE_ROOT_FOLDER_ID` from Script Properties. Create or reuse `YYYY` and `MM` folders, then create a claim folder named `${expenseId}_${sanitizedVendor}_${sanitizedMember}`. Extract file IDs from Forms' Drive URLs, move each file into the claim folder, preserve its extension, and return the moved URLs. If the property is missing or a file move fails, retain the original URLs and return a concise error for `manager_note` without aborting tracker creation.

- [ ] **Step 6: Run focused tests and make them pass**

Run: `node --test tests/apps-script-expenses.test.mjs`  
Expected: normalization, duplicate protection, Drive organization, and setup tests pass.

- [ ] **Step 7: Commit the submit workflow**

Run:

```bash
git add apps-script/expenses.gs tests/apps-script-expenses.test.mjs
git commit -m "feat: automate expense tracker intake"
```

### Task 4: Implement monthly Markdown generation

**Files:**
- Modify: `apps-script/expenses.gs`
- Modify: `tests/apps-script-expenses.test.mjs`

**Interfaces:**
- `buildExpenseMarkdownReport_(rows, yearMonth, generatedAt)` returns a Markdown string without Drive side effects.
- `generateExpenseMarkdownReport(yearMonth)` reads `Expenses_Tracker`, writes `Expense_Report_YYYY-MM.md` in the configured root folder, and returns `{ fileName, yearMonth, rowCount }`.

- [ ] **Step 1: Add failing Drive-report tests**

Assert that the report writer creates a new file on the first run, updates the same named file on the second run, filters rows to the requested month, includes status/category totals, and escapes pipe characters in vendor/description text.

- [ ] **Step 2: Implement the pure Markdown builder**

Sort matching rows by `purchase_date` then `expense_id`. Render the period, generation time, totals by status and category, and a table with `expense_id`, date, member, vendor, amount, status, and receipt link. Format amounts as `MOP 0.00` and use `-` for missing values.

- [ ] **Step 3: Implement the Drive writer**

Validate `yearMonth` against `/^\d{4}-\d{2}$/`, read tracker rows using the header indexes, and find or create the named Markdown file in the configured root folder. Use `setContent` when the file exists and `createFile` when it does not. Do not change tracker rows.

- [ ] **Step 4: Run focused tests and make them pass**

Run: `node --test tests/apps-script-expenses.test.mjs`  
Expected: all expense tests pass.

- [ ] **Step 5: Commit the report generator**

Run:

```bash
git add apps-script/expenses.gs tests/apps-script-expenses.test.mjs
git commit -m "feat: generate monthly expense reports"
```

### Task 5: Document setup and operating procedure

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documentation must tell a new operator exactly how to create the Form, link its response Sheet, configure Drive, install the Apps Script module, run setup, test one claim, and generate a monthly report.

- [ ] **Step 1: Add a Google Forms expense section**

Document the exact question titles, email collection/sign-in requirement, receipt file restrictions, raw response sheet rule, and `Expenses_Tracker` status workflow.

- [ ] **Step 2: Add Drive and Apps Script setup instructions**

Document creating a restricted `Expenses` root folder, adding `apps-script/expenses.gs` to the existing Apps Script project, setting `EXPENSE_ROOT_FOLDER_ID` in Script Properties, running `setupExpenseAutomation()` once, and verifying the tracker/trigger.

- [ ] **Step 3: Add daily operations and report instructions**

Document the manager process: review the receipt, change `SUBMITTED` to `NEEDS_INFO`, `APPROVED`, or `REJECTED`, record transfer details, then mark approved claims `PAID`. Document running `generateExpenseMarkdownReport('YYYY-MM')` for a monthly snapshot and explain that Sheets remains the source of truth.

- [ ] **Step 4: Commit the documentation**

Run:

```bash
git add README.md
git commit -m "docs: add expense form setup guide"
```

### Task 6: Run full verification and inspect the branch

**Files:**
- Read: `apps-script/expenses.gs`
- Read: `tests/apps-script-expenses.test.mjs`
- Read: `README.md`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run check:core
npm run build
```

Expected: all tests pass, core syntax checks pass, and the Next.js build completes without changes to the POS UI.

- [ ] **Step 2: Run the unfinished-text and scope scans**

Run:

```bash
rg -n 'TBD|TODO|FIXME|placeholder' apps-script/expenses.gs tests/apps-script-expenses.test.mjs README.md
git diff --check
git status --short --branch
```

Expected: no unfinished placeholder text, no whitespace errors, and only the intended expense module/tests/documentation are changed.

- [ ] **Step 3: Perform a final manual code review**

Confirm that no service-role key, Form URL, Drive folder ID, or unrestricted receipt URL is hard-coded; duplicate submissions are keyed by `source_key`; and existing POS functions/sheets are untouched.

- [ ] **Step 4: Commit any final verification-only fixes**

If verification finds a formatting or documentation-only issue, fix it with `apply_patch`, rerun the relevant check, and commit it with:

```bash
git add apps-script/expenses.gs tests/apps-script-expenses.test.mjs README.md
git commit -m "chore: polish expense automation"
```
