# Google Forms Expense Reimbursement Automation

**Date:** 2026-09-01  
**Status:** Draft — awaiting user review

## Goal

Replace screenshot-based, manually reconstructed expense claims with a lightweight Google Forms workflow that captures the receipt and claim details once, stores the receipt in Google Drive, tracks reimbursement state in Google Sheets, and produces a reviewable monthly Markdown snapshot.

The expense workflow is separate from POS sales, transactions, and shift reconciliation. Google Sheets is the operational tracker for this first version; the existing Supabase POS remains unchanged.

## Scope

### Included

- A Google Form intake flow for staff/member expense claims.
- Receipt image upload through the Form's file-upload question.
- A linked Google Form response sheet as the immutable raw intake record.
- An `Expenses_Tracker` sheet with normalized claim fields and review/payment fields.
- An Apps Script form-submit trigger that creates a stable expense ID, copies claim data into the tracker, and organizes uploaded files under a year/month Drive folder.
- Manual manager review using a constrained status workflow: `SUBMITTED`, `NEEDS_INFO`, `APPROVED`, `REJECTED`, `PAID`.
- Manual transfer execution; the tracker records who paid, when, and the transfer reference.
- An optional Apps Script function that generates a read-only monthly Markdown report in Drive from the tracker.
- Tests for normalization, stable IDs, Drive file organization, status/report generation, and duplicate trigger handling.

### Deferred

- OCR or AI receipt extraction.
- Automatic bank or wallet transfers.
- Multiple approval levels or approval thresholds.
- Inventory deduction or accounting-system integration.
- A public unauthenticated upload endpoint.
- A new expense UI inside the Next.js POS.
- Treating Markdown as the source of truth.
- Importing expenses into Supabase; the stable `expense_id` and `source_key` leave an extension point for that later.

## Recommended workflow

```text
Member submits Google Form
        |
        v
Raw Form response + receipt stored in Google Drive
        |
        v
Apps Script creates tracker row and organizes receipt
        |
        v
Manager reviews receipt and edits tracker status
        |
        +--> NEEDS_INFO / REJECTED
        |
        v
APPROVED -> treasurer transfers money -> PAID
        |
        v
Monthly Sheet review and optional Markdown/PDF export
```

Any logged-in staff member can submit. A manager is responsible for approval and may also record payment. Payment remains manual because integrating a bank or wallet is not necessary to remove the current bookkeeping pain.

## Form contract

The Form should use these exact question titles so the script can read responses safely:

- `Member name`
- `Purchase date`
- `Vendor`
- `Amount`
- `Category` — `Ingredients`, `Supplies`, or `Other`
- `Description`
- `Receipt` — required file upload, limited to image/PDF files and one file for the MVP

The Form should collect the respondent's email address. Google Forms file uploads require the respondent to sign in to a Google Account, so this constraint must be accepted during rollout.

The Form's linked response spreadsheet remains the raw intake record. It should not be sorted or manually edited. Review and payment changes happen only in `Expenses_Tracker`.

## Tracker contract

The Apps Script creates or validates an `Expenses_Tracker` sheet with these columns:

```text
expense_id
source_key
submitted_at
member_name
member_email
purchase_date
vendor
amount
category
description
receipt_url
status
manager_note
approved_by
approved_at
paid_by
paid_at
payment_reference
updated_at
```

`expense_id` is the human-facing stable identifier, formatted like `EXP-20260901-0007`. `source_key` identifies the raw Form response row and makes the submit trigger idempotent if it is run more than once. The script must not create a second tracker row for an existing `source_key`.

The tracker is append-oriented. Once a claim reaches `APPROVED` or `PAID`, the claim details and receipt URL should not be changed casually. Corrections should be recorded in `manager_note`; a materially incorrect claim should be marked `VOIDED` in a later enhancement rather than deleted.

## Status rules

Allowed status transitions:

- New claim: `SUBMITTED`.
- `SUBMITTED` → `NEEDS_INFO`, `APPROVED`, or `REJECTED`.
- `NEEDS_INFO` → `SUBMITTED` or `REJECTED`.
- `APPROVED` → `PAID`.
- `REJECTED` and `PAID` are terminal in the MVP.

The sheet should use data validation for the allowed status values. The script should preserve existing review/payment fields when it refreshes a row and should never reset an approved or paid claim to `SUBMITTED`.

## Drive organization

Google Forms already stores file-upload responses in a Drive folder associated with the Form. The Apps Script organization step moves each uploaded file into a configured root folder using this structure:

```text
Expenses/
  2026/
    09/
      EXP-20260901-0007_Vendor_Member/
        receipt-original.jpg
```

The tracker stores the Drive URL for the file. The script should preserve the original extension, sanitize names for Drive, and continue the tracker submission if file organization fails; the error should be written to the tracker or execution log for follow-up.

The root folder ID is stored in Apps Script Properties as `EXPENSE_ROOT_FOLDER_ID`, not in the Form or a visible sheet cell.

## Markdown report

Markdown is a generated review artifact, not an editable database. `generateExpenseMarkdownReport()` reads `Expenses_Tracker`, filters by a requested `YYYY-MM` period, and writes or updates `Expense_Report_YYYY-MM.md` in the configured root Drive folder.

The report contains:

- Period and generation timestamp.
- Totals grouped by status and category.
- One table row per claim with expense ID, date, member, vendor, amount, status, and a Drive receipt link.
- Rejected and unpaid claims called out separately.

The first implementation exposes this as a manually run function. A time-based trigger can be added after the team is comfortable with the tracker. This avoids making every submission depend on report generation and keeps report refresh failures from blocking intake.

## Apps Script components

Add an isolated `apps-script/expenses.gs` module to the existing Apps Script project. It should provide:

- `setupExpenseAutomation()` — creates/validates the tracker sheet, applies headers and validation, and installs one spreadsheet form-submit trigger.
- `onExpenseFormSubmit(e)` — normalizes the submitted response, deduplicates by `source_key`, organizes the receipt, and appends the tracker row.
- `generateExpenseMarkdownReport(yearMonth)` — generates the monthly Drive Markdown artifact.

The module must use namespaced constants/functions or distinctive names so it does not collide with the existing POS reporting code in `apps-script/Code.gs`. It must not modify the existing `Products`, `Staff`, `Transactions`, `Shifts`, `Report_Shifts`, or `Report_Transactions` sheets.

## Error handling and safety

- Missing required form fields: create a `NEEDS_INFO` tracker row if the trigger receives an incomplete response; do not silently discard the submission.
- Invalid amount: keep the raw response, write a safe error/note, and mark `NEEDS_INFO`.
- Missing receipt link: mark `NEEDS_INFO` and retain the row.
- Drive move failure: retain the original receipt URL and mark a manager note; do not lose the claim.
- Duplicate trigger invocation: detect the existing `source_key` and return the existing `expense_id`.
- Markdown generation failure: leave tracker data untouched and surface the error in the Apps Script execution log.
- Do not put service credentials, private folder IDs, or unrestricted sharing links in the Form description or repository.

## Setup and permissions

1. Create the Form with the exact question titles above and enable email collection.
2. Link the Form to a dedicated response spreadsheet, preferably alongside the existing reporting workbook but with raw responses kept separate from POS report sheets.
3. Create a restricted `Expenses` Drive folder and grant access only to members who submit claims and managers/treasurers who review them.
4. Add the Apps Script module to the existing project and set `EXPENSE_ROOT_FOLDER_ID` in Script Properties.
5. Run `setupExpenseAutomation()` once and authorize the requested Sheets, Forms, and Drive permissions.
6. Submit one test claim, verify the raw response, tracker row, receipt location, and Drive permissions, then remove or mark the test claim before production use.

## Testing and acceptance criteria

Automated tests should verify:

- Form response fields normalize into the expected tracker columns.
- Expense IDs are stable and human-readable.
- Reprocessing the same source response does not create a duplicate row.
- Existing approval/payment fields survive tracker reprocessing.
- Receipt file URLs are parsed and destination paths are sanitized.
- Status validation accepts only the defined values and transitions.
- Markdown output includes totals, claim rows, and receipt links.
- Setup does not create duplicate form-submit triggers.

Manual acceptance:

- A member can submit a receipt from a phone.
- A manager can review the receipt from the tracker without searching through chat screenshots.
- A manager can see all unpaid approved claims and total amounts.
- A reviewer can trace every paid claim from tracker row to original Drive receipt and transfer reference.
- Existing POS sales, shifts, and Sheets exports continue to function unchanged.

## Decision summary

Implement the expense MVP in Google Workspace first. Use Form responses plus Drive for intake/archive, `Expenses_Tracker` as the operational record, and generated Markdown only as an optional monthly snapshot. Keep the integration isolated from the POS so the team can validate the workflow before adding native UI or Supabase persistence.
