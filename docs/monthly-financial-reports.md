# Monthly financial report workflow

This workflow runs in the existing reporting Google spreadsheet, not in the POS UI. It reads the read-only `get_financial_entries` Supabase RPC for the selected month, so it does not depend on manually exporting orders or on stale `Report_Transactions` rows. A bounded transaction query is retained only for the hidden `Calculation_Audit` order count; RPC income is authoritative. The original template, transaction amounts and expense tracker remain unchanged.

## One-time setup

1. Open the supplied [financial template](https://docs.google.com/spreadsheets/d/1n28usOL0CG10D2kMzwUC7D1dwcZrRaTZ/edit). It is an Excel `.xlsm` file. Use **File → Save as Google Sheets** to create a separate native Google Sheets copy. Keep the original unchanged. Excel macros are not used by this workflow.
2. In the existing reporting spreadsheet, open **Extensions → Apps Script**. Add `financial-reports.gs` alongside the existing `Code.gs` and `expenses.gs`. If the live project already defines `onOpen`, merge the call to `setupFinancialReportsMenu()` into that handler rather than keeping duplicate handlers.
3. Configure these Script Properties:

   | Property | Value |
   | --- | --- |
   | `SUPABASE_URL` | Existing Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only key. Never put this in spreadsheet cells or client code. |
   | `FINANCIAL_TEMPLATE_ID` | ID of the new native template copy, not the XLSM file |
   | `FINANCIAL_TEMPLATE_TAB` | `AUG`, or another monthly tab with the same column layout |
   | `FINANCIAL_REPORT_FOLDER_ID` | ID of a restricted Drive folder for drafts and approved reports |

4. Set up `Expenses_Tracker` using the existing expense workflow. A blank tracker is valid when there are no expenses. Existing claims are MOP as specified by the original form. To record RMB expenses, add a `currency` column to the tracker and enter `RMB` explicitly for those claims. Do not relabel old MOP claims as RMB without checking receipts.
5. Run `setupFinancialReportsMenu()` once and authorize the required spreadsheet, Drive and fetch permissions. Reopening the reporting spreadsheet also installs the menu.

## Every month

1. Choose **Financial Reports → Generate / refresh monthly draft**, enter `YYYY-MM`, and open the returned draft link.
2. Review the monthly sheet. It follows the template's title, separate MOP/RMB income, expenses and net summary, Income columns and Expenses columns. The source tab is copied to retain column widths. Historical dates and values are replaced in the generated copy only. Section positions grow with the number of rows. No old template month data or misleading annual totals are carried into the report.
3. In the **Review** tab, reconcile MPay and WeChat against payment statements, verify paid expenses and receipts, record discrepancies or corrections in the notes, and enter the approver. Tick all three review boxes. Unpaid claims are listed separately and do not reduce cash-basis net income.
4. After the month ends, choose **Financial Reports → Export reviewed month (Excel + PDF)** in the original reporting spreadsheet. The script saves an approved spreadsheet snapshot plus `.xlsx` and landscape A4 `.pdf` files in the configured folder. The PDF prints the monthly financial sheet only. The Excel workbook also retains hidden review/audit evidence.
5. Visually check the first exported report's page breaks, wrapping and totals before sharing. The Apps Script/Drive export still needs live verification after installation. No recurring scheduling is installed.

## Calculation rules

- Reporting dates are Macau time (UTC+8), using the transaction creation date, not fulfillment completion date. A September report covers September 1 inclusive through October 1 exclusive.
- Only `status=COMPLETED` and `fulfillment_status=COMPLETED` sales count. Pending orders and waste do not.
- MPay income uses the original MOP transaction total.
- WeChat/RMB income uses the explicit transaction-item `rmb_unit_price`, which is **recorded MOP unit_price − 2** for every paid item. Older rows without that field use the same fallback. Staff orders use their recorded staff unit prices. The correction is per item, not per transaction, and is not an exchange-rate conversion.
- Missing/invalid RMB item prices, unsupported payments, invalid dates or conflicting duplicate transaction IDs stop generation instead of silently producing incomplete totals.
- Income rows group by local date and currency. MOP and RMB are never added together into a mixed-currency total.
- Only `PAID` expenses count, using `paid_at` for the reporting date, negative amounts and the receipt's currency. Purchase date is retained as Issue Date. Claims marked `PAID` must have a payment date.
- `Calculation_Audit` records original and corrected transaction totals separately. Differences are expected for RMB recalculation; the reviewer must check actual collections rather than treating recalculation as proof of money received.
- Refreshing reuses the same monthly draft and resets review approval. Exporting creates a new timestamped snapshot, so later draft refreshes cannot change an approved report. Export does not update or lock Supabase records.

## Technical references

The native template tab is copied using [Apps Script Sheet.copyTo](https://developers.google.com/apps-script/reference/spreadsheet/sheet#copyTo(Spreadsheet)). PDF export uses the spreadsheet export endpoint illustrated in Google's [PDF generation sample](https://developers.google.com/apps-script/samples/automations/generate-pdfs). Google Sheets supports [Excel and PDF exports](https://developers.google.com/workspace/drive/api/guides/ref-export-formats).
