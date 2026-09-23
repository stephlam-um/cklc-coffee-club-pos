// Add beside Code.gs and expenses.gs in the existing reporting spreadsheet.
// Originals in Supabase, the expense tracker and the template are never edited.
function onOpen() { setupFinancialReportsMenu(); }

function setupFinancialReportsMenu() {
  SpreadsheetApp.getUi().createMenu('Financial Reports')
    .addItem('Generate / refresh monthly draft', 'promptMonthlyFinancialReport')
    .addItem('Export reviewed month (Excel + PDF)', 'promptExportMonthlyFinancialReport').addToUi();
}

function financialPromptMonth_() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('Monthly financial report', 'Enter YYYY-MM, for example 2026-09', ui.ButtonSet.OK_CANCEL);
  return result.getSelectedButton() === ui.Button.OK ? result.getResponseText().trim() : null;
}

function promptMonthlyFinancialReport() {
  const month = financialPromptMonth_();
  if (!month) return;
  const result = generateMonthlyFinancialReport(month);
  SpreadsheetApp.getUi().alert('Draft generated. Open it, review the report and complete the Review tab.\n' + result.url);
}

function promptExportMonthlyFinancialReport() {
  const month = financialPromptMonth_();
  if (!month) return;
  const result = exportMonthlyFinancialReport(month);
  SpreadsheetApp.getUi().alert('Saved reviewed exports:\nExcel: ' + result.excelUrl + '\nPDF: ' + result.pdfUrl);
}

function financialMonthBounds_(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new Error('Month must be YYYY-MM.');
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5));
  const next = number === 12 ? (year + 1) + '-01' : year + '-' + String(number + 1).padStart(2, '0');
  return { start: month + '-01T00:00:00+08:00', end: next + '-01T00:00:00+08:00' };
}

function financialDate_(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const date = new Date(String(value) + 'T00:00:00Z');
    if (!isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
    throw new Error('Invalid financial date: ' + value);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!value || isNaN(date.getTime())) throw new Error('Invalid financial date: ' + value);
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function financialCents_(value, label) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') throw new Error('Missing ' + label);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) throw new Error('Invalid ' + label);
  return Math.round(number * 100);
}

function buildMonthlyFinancialReport_(transactions, expenses, month, staffNames) {
  financialMonthBounds_(month);
  const names = staffNames || {};
  const report = { month, completedOrders: 0, income: [], expenses: [], unpaidExpenses: [], audit: [], totals: {}, expensesIncluded: expenses !== null && expenses !== undefined };
  const daily = {};
  const seen = {};
  transactions.forEach(tx => {
    if (tx.status !== 'COMPLETED' || tx.fulfillment_status !== 'COMPLETED' || tx.type === 'WASTE' || tx.type === 'STAFF_REWARD') return;
    const date = financialDate_(tx.created_at);
    if (date.slice(0, 7) !== month) return;
    if (!tx.id) throw new Error('Transaction ID is missing.');
    const serialized = JSON.stringify(tx);
    if (Object.prototype.hasOwnProperty.call(seen, tx.id)) {
      if (seen[tx.id] !== serialized) throw new Error('Conflicting duplicate transaction: ' + tx.id);
      return;
    }
    seen[tx.id] = serialized;
    if (!['MPAY', 'WECHAT_PAY'].includes(tx.payment_method)) throw new Error('Unsupported payment: ' + tx.id);
    const original = financialCents_(tx.total, 'transaction total ' + tx.id);
    const currency = tx.payment_method === 'MPAY' ? 'MOP' : 'RMB';
    let corrected = original;
    if (currency === 'RMB') {
      if (!Array.isArray(tx.transaction_items) || !tx.transaction_items.length) throw new Error('Missing RMB item prices: ' + tx.id);
      corrected = tx.transaction_items.reduce((sum, item) => {
        const unit = financialCents_(item.unit_price, 'MOP unit price ' + tx.id);
        const rmbUnit = item.rmb_unit_price == null ? unit - 200 : financialCents_(item.rmb_unit_price, 'RMB unit price ' + tx.id);
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || unit < 200 || rmbUnit < 0) throw new Error('Invalid RMB item: ' + tx.id);
        return sum + rmbUnit * quantity;
      }, 0);
    }
    const key = date + '/' + currency;
    if (!daily[key]) daily[key] = { date, currency, cents: 0, staff: [], payment: tx.payment_method };
    daily[key].cents += corrected;
    const name = names[tx.staff_id] || tx.staff_id || 'Unknown';
    if (!daily[key].staff.includes(name)) daily[key].staff.push(name);
    report.completedOrders += 1;
    report.audit.push({ id: tx.id, date, currency, originalTotal: original / 100, correctedTotal: corrected / 100, payment: tx.payment_method });
  });
  report.income = Object.keys(daily).sort().map(key => {
    const row = daily[key];
    return { date: row.date, currency: row.currency, amount: row.cents / 100, remarks: (row.payment === 'MPAY' ? 'MPAY' : 'WeChat; recalculated MOP unit price minus 2') + ', received by ' + row.staff.sort().join(', ') };
  });
  const expenseIds = {};
  (expenses || []).forEach(row => {
    if (row.status === 'PAID' && !row.paid_at) throw new Error('Missing expense payment date: ' + row.expense_id);
    const date = financialDate_(row.status === 'PAID' ? row.paid_at : row.purchase_date);
    if (date.slice(0, 7) !== month) return;
    if (['SUBMITTED', 'NEEDS_INFO', 'APPROVED'].includes(row.status)) { report.unpaidExpenses.push(row); return; }
    if (row.status !== 'PAID') return;
    if (!row.expense_id || expenseIds[row.expense_id]) throw new Error('Missing or duplicate expense ID: ' + row.expense_id);
    expenseIds[row.expense_id] = true;
    const currency = String(row.currency || 'MOP').trim().toUpperCase();
    if (!['MOP', 'RMB'].includes(currency)) throw new Error('Unsupported expense currency: ' + row.expense_id);
    report.expenses.push({ date, currency, amount: -financialCents_(row.amount, 'expense amount') / 100,
      description: row.description || row.vendor || row.category || '', reference: row.payment_reference || row.expense_id,
      paidBy: row.paid_by || row.member_name || '', issueDate: financialDate_(row.purchase_date),
      remarks: [row.vendor, row.receipt_url, row.manager_note].filter(Boolean).join('; ') });
  });
  report.expenses.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  ['MOP', 'RMB'].forEach(currency => {
    const income = report.income.filter(row => row.currency === currency).reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
    const paid = report.expenses.filter(row => row.currency === currency).reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
    report.totals[currency] = { income: income / 100, expenses: paid / 100, net: (income + paid) / 100 };
  });
  return report;
}

function buildMonthlyFinancialReportFromRpc_(financialEntries, expenses, month, auditTransactions, staffNames) {
  const report = buildMonthlyFinancialReport_([], expenses, month, staffNames);
  const seen = {};
  report.income = (financialEntries || []).map(entry => {
    const date = financialDate_(entry.pay_date);
    if (date.slice(0, 7) !== month) throw new Error('Financial RPC returned a row outside the requested month: ' + date);
    const currency = String(entry.currency || '').trim().toUpperCase();
    if (!['MOP', 'RMB'].includes(currency)) throw new Error('Unsupported financial RPC currency: ' + entry.currency);
    const amount = financialCents_(entry.amount, 'financial RPC amount');
    const key = [date, String(entry.acc_code || ''), currency].join('/');
    if (seen[key]) throw new Error('Duplicate financial RPC row: ' + key);
    seen[key] = true;
    return { date, accCode: String(entry.acc_code || ''), description: String(entry.description || '當日櫃檯銷售收入'), currency, amount: amount / 100, remarks: String(entry.remarks || '') };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency) || a.accCode.localeCompare(b.accCode));
  if (Array.isArray(auditTransactions)) {
    const audit = buildMonthlyFinancialReport_(auditTransactions, [], month, staffNames);
    report.completedOrders = audit.completedOrders;
    report.audit = audit.audit;
  }
  ['MOP', 'RMB'].forEach(currency => {
    const income = report.income.filter(row => row.currency === currency).reduce((sum, row) => sum + financialCents_(row.amount, 'financial RPC amount'), 0);
    const paid = report.expenses.filter(row => row.currency === currency).reduce((sum, row) => sum + financialCents_(Math.abs(row.amount), 'expense amount'), 0);
    const expensesTotal = paid === 0 ? 0 : -paid / 100;
    report.totals[currency] = { income: income / 100, expenses: expensesTotal, net: income / 100 + expensesTotal };
  });
  return report;
}

function financialReportLayout_(report) {
  const values = [];
  const put = (number, row) => { while (values.length < number) values.push(Array(9).fill('')); values[number - 1] = row.concat(Array(9 - row.length).fill('')); };
  const incomeEnd = 8 + Math.max(1, report.income.length);
  const expenseSection = incomeEnd + 3;
  const expenseHeader = expenseSection + 1;
  const expenseStart = expenseHeader + 1;
  const expenseEnd = expenseHeader + Math.max(1, report.expenses.length);
  const label = new Date(report.month + '-01T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  put(1, ['Financial Summary - ' + label + ' ' + report.month.slice(0, 4)]);
  put(2, ['Currency is explicit in each row; expenses are negative.']);
  put(4, ['MOP Income', 'MOP Expenses', 'MOP Net', 'RMB Income', 'RMB Expenses', 'RMB Net', 'Notes']);
  put(5, ['=SUMIF(D9:D' + incomeEnd + ',"MOP",E9:E' + incomeEnd + ')',
    '=SUMIF(D' + expenseStart + ':D' + expenseEnd + ',"MOP",E' + expenseStart + ':E' + expenseEnd + ')', '=A5+B5',
    '=SUMIF(D9:D' + incomeEnd + ',"RMB",E9:E' + incomeEnd + ')',
    '=SUMIF(D' + expenseStart + ':D' + expenseEnd + ',"RMB",E' + expenseStart + ':E' + expenseEnd + ')', '=D5+E5',
    'Completed orders only. RMB recalculated per item. ' + (report.expensesIncluded ? 'Paid expenses included.' : 'Expenses not included; income-only draft.')]);
  put(7, ['Income']);
  put(8, ['Pay Date', 'Acc Code', 'Description', 'Currency', 'Amount', 'Remarks']);
  report.income.forEach((row, i) => put(9 + i, [financialCellText_(row.date), row.accCode || '1.' + (i + 1), row.description || '當日櫃檯銷售收入', row.currency, row.amount, financialCellText_(row.remarks)]));
  put(expenseSection, ['Expenses']);
  put(expenseHeader, ['Pay Date', 'Acc Code', 'Description', 'Currency', 'Amount', 'Reference No.', 'Paid/Received By', 'Issue Date', 'Remarks']);
  report.expenses.forEach((row, i) => put(expenseStart + i, [row.date, '2.' + (i + 1), financialCellText_(row.description), row.currency, row.amount, financialCellText_(row.reference), financialCellText_(row.paidBy), row.issueDate, financialCellText_(row.remarks)]));
  put(expenseEnd, values[expenseEnd - 1] || []);
  return { values, incomeEnd, expenseSection, expenseHeader, expenseStart, expenseEnd, label };
}

function financialCellText_(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /^[=+@-]/.test(text.trimStart()) ? "'" + text : text;
}

function financialReadRows_(sheet) {
  if (!sheet) throw new Error('Expenses_Tracker is missing. Set up the expense tracker first.');
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  ['expense_id', 'status', 'purchase_date', 'amount', 'paid_at'].forEach(header => {
    if (!headers.includes(header)) throw new Error('Missing expense column: ' + header);
  });
  return values.filter(row => row.some(value => value !== '')).map(row => headers.reduce((obj, header, i) => { obj[header] = row[i]; return obj; }, {}));
}

function generateMonthlyFinancialReport(month) {
  const bounds = financialMonthBounds_(month);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const url = String(properties.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
    const key = properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
    const templateId = properties.getProperty('FINANCIAL_TEMPLATE_ID');
    const folderId = properties.getProperty('FINANCIAL_REPORT_FOLDER_ID');
    if (!url || !key || !templateId || !folderId) throw new Error('Configure Supabase, FINANCIAL_TEMPLATE_ID and FINANCIAL_REPORT_FOLDER_ID in Script Properties.');
    const template = SpreadsheetApp.openById(templateId);
    const source = template.getSheetByName(properties.getProperty('FINANCIAL_TEMPLATE_TAB') || 'AUG');
    if (!source) throw new Error('Financial template tab is missing. Use a native Google Sheets copy of the XLSM template.');
    const financialEntries = fetchSupabaseRpcRows_(url, key, 'get_financial_entries', { p_start_date: bounds.start.slice(0, 10), p_end_date: bounds.end.slice(0, 10) });
    const auditTransactions = fetchSupabaseRows_(url, key, 'transactions?status=eq.COMPLETED&fulfillment_status=eq.COMPLETED&type=neq.WASTE&created_at=gte.' + encodeURIComponent(bounds.start) + '&created_at=lt.' + encodeURIComponent(bounds.end) + '&select=id,staff_id,type,total,payment_method,status,fulfillment_status,created_at,transaction_items(unit_price,rmb_unit_price,quantity)&order=created_at.asc,id.asc');
    const names = {};
    fetchSupabaseRows_(url, key, 'staff?select=id,name&order=id.asc').forEach(staff => { names[staff.id] = staff.name; });
    const expenseTracker = SpreadsheetApp.getActive().getSheetByName('Expenses_Tracker');
    const report = buildMonthlyFinancialReportFromRpc_(financialEntries, expenseTracker ? financialReadRows_(expenseTracker) : null, month, auditTransactions, names);
    const draftKey = 'FINANCIAL_DRAFT_' + month;
    const draftId = properties.getProperty(draftKey);
    if (draftId === templateId || draftId === SpreadsheetApp.getActive().getId()) throw new Error('Draft must not be the source or template spreadsheet.');
    const draft = draftId ? SpreadsheetApp.openById(draftId) : SpreadsheetApp.create('Coffee Club Financial Report ' + month + ' DRAFT');
    draft.setSpreadsheetTimeZone('Asia/Macau');
    if (!draftId) {
      DriveApp.getFileById(draft.getId()).moveTo(DriveApp.getFolderById(folderId));
      properties.setProperty(draftKey, draft.getId());
    }
    // Build replacement before removing the previous generated tab.
    const previous = draft.getSheetByName(month);
    const sheet = source.copyTo(draft);
    financialWriteReport_(sheet, report);
    if (previous) draft.deleteSheet(previous);
    sheet.setName(month);
    const review = draft.getSheetByName('Review') || draft.insertSheet('Review');
    review.clear();
    const rows = [['Month', month], ['MPay checked', false], ['WeChat checked', false], ['Expenses checked', false], ['Expenses source', report.expensesIncluded ? 'Expenses_Tracker' : 'NOT CONFIGURED — income-only draft'], ['Approved by', ''], ['Reconciliation notes', ''],
      ['Generated at', new Date()], ['Completed orders', report.completedOrders], ['Unpaid claims excluded', report.unpaidExpenses.length],
      ['RMB calculation', 'Recorded MOP unit price minus 2, multiplied by quantity; not currency conversion.'],
      ['Review instructions', 'Check actual payment statements. This draft excludes expenses until Expenses_Tracker is configured. Add expenses, refresh the draft, verify receipts, then tick all three boxes. Refreshing resets approval.'],
      ['Unpaid expense ID', 'Status', 'Purchase date', 'Amount', 'Currency']];
    report.unpaidExpenses.forEach(row => rows.push([financialCellText_(row.expense_id), row.status, financialDate_(row.purchase_date), row.amount, row.currency || 'MOP']));
    const width = 5;
    review.getRange(1, 1, rows.length, width).setValues(rows.map(row => row.concat(Array(width - row.length).fill(''))));
    review.getRange(2, 2, 3, 1).insertCheckboxes();
    review.setColumnWidth(1, 200); review.setColumnWidth(2, 480);
    review.getDataRange().setWrap(true); review.autoResizeRows(1, rows.length);
    const audit = draft.getSheetByName('Calculation_Audit') || draft.insertSheet('Calculation_Audit');
    audit.clear();
    const auditRows = [['Transaction ID', 'Date', 'Currency', 'Original stored total', 'Report total', 'Payment']].concat(report.audit.map(row => [financialCellText_(row.id), row.date, row.currency, row.originalTotal, row.correctedTotal, row.payment]));
    audit.getRange(1, 1, auditRows.length, 6).setValues(auditRows);
    audit.getRange(2, 4, Math.max(1, report.audit.length), 2).setNumberFormat('#,##0.00');
    audit.setFrozenRows(1); audit.autoResizeColumns(1, 6); audit.hideSheet();
    // Remove only the untouched default tab of a newly-created workbook.
    if (!draftId) draft.getSheets().filter(tab => ![sheet.getSheetId(), review.getSheetId(), audit.getSheetId()].includes(tab.getSheetId())).forEach(tab => draft.deleteSheet(tab));
    SpreadsheetApp.flush();
    return { yearMonth: month, url: draft.getUrl(), completedOrders: report.completedOrders, totals: report.totals, status: 'DRAFT' };
  } finally { lock.releaseLock(); }
}

function financialWriteReport_(sheet, report) {
  const layout = financialReportLayout_(report);
  report.income.forEach((row, i) => { layout.values[8 + i][0] = new Date(row.date + 'T00:00:00+08:00'); });
  report.expenses.forEach((row, i) => {
    layout.values[layout.expenseStart - 1 + i][0] = new Date(row.date + 'T00:00:00+08:00');
    layout.values[layout.expenseStart - 1 + i][7] = new Date(row.issueDate + 'T00:00:00+08:00');
  });
  sheet.getDataRange().breakApart(); sheet.clear();
  if (sheet.getMaxRows() < layout.values.length) sheet.insertRowsAfter(sheet.getMaxRows(), layout.values.length - sheet.getMaxRows());
  sheet.getRange(1, 1, layout.values.length, 9).setValues(layout.values).setFontSize(11).setFontColor('#222222').setVerticalAlignment('top').setWrap(true);
  sheet.getRange('A1:I1').merge().setBackground('#216b59').setFontColor('#ffffff').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2:I2').merge();
  sheet.getRange('A4:G4').setBackground('#d9e2f3').setFontWeight('bold');
  sheet.getRange('A5:F5').setNumberFormat('#,##0.00');
  sheet.getRange('G5:I5').merge();
  [7, layout.expenseSection].forEach(row => sheet.getRange(row, 1, 1, row === 7 ? 6 : 9).merge().setBackground('#e2efda').setFontWeight('bold'));
  [8, layout.expenseHeader].forEach(row => sheet.getRange(row, 1, 1, row === 8 ? 6 : 9).setBackground('#d9e2f3').setFontWeight('bold'));
  sheet.getRange(9, 5, Math.max(1, report.income.length), 1).setNumberFormat('#,##0.00');
  sheet.getRange(9, 1, Math.max(1, report.income.length), 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(layout.expenseStart, 5, Math.max(1, report.expenses.length), 1).setNumberFormat('#,##0.00');
  [1, 8].forEach(column => sheet.getRange(layout.expenseStart, column, Math.max(1, report.expenses.length), 1).setNumberFormat('yyyy-mm-dd'));
  sheet.getRange(9, 2, layout.values.length - 8, 1).setNumberFormat('@');
  sheet.setHiddenGridlines(true); sheet.setFrozenRows(8);
  // Template column widths are retained by copyTo. Fit long remarks without shrinking fonts.
  sheet.autoResizeRows(1, layout.values.length);
}

function financialAssertReady_(rows, today) {
  const values = {};
  rows.forEach(row => { values[row[0]] = row[1]; });
  const month = values.Month;
  financialMonthBounds_(month);
  if (String(today).slice(0, 7) <= month) throw new Error('The reporting month is not complete. Use the draft for month-to-date figures.');
  ['MPay checked', 'WeChat checked', 'Expenses checked'].forEach(label => {
    if (values[label] !== true) throw new Error('Review required: ' + label);
  });
  if (!String(values['Approved by'] || '').trim()) throw new Error('Approved by is required.');
}

function exportMonthlyFinancialReport(month) {
  financialMonthBounds_(month);
  const properties = PropertiesService.getScriptProperties();
  const draftId = properties.getProperty('FINANCIAL_DRAFT_' + month);
  if (!draftId) throw new Error('Generate the monthly draft first.');
  const draft = SpreadsheetApp.openById(draftId);
  const review = draft.getSheetByName('Review');
  if (!review || review.getRange(1, 2).getValue() !== month) throw new Error('Draft month does not match.');
  financialAssertReady_(review.getDataRange().getValues(), Utilities.formatDate(new Date(), 'Asia/Macau', 'yyyy-MM-dd'));
  const folder = DriveApp.getFolderById(properties.getProperty('FINANCIAL_REPORT_FOLDER_ID'));
  const stamp = Utilities.formatDate(new Date(), 'Asia/Macau', 'yyyyMMdd-HHmmss');
  // A separate snapshot prevents later draft refreshes from changing approved reports.
  const snapshotFile = DriveApp.getFileById(draftId).makeCopy('Coffee Club Financial Report ' + month + ' FINAL ' + stamp, folder);
  const snapshot = SpreadsheetApp.openById(snapshotFile.getId());
  const sheet = snapshot.getSheetByName(month);
  snapshot.getSheets().filter(tab => tab.getSheetId() !== sheet.getSheetId()).forEach(tab => tab.hideSheet());
  SpreadsheetApp.flush();
  const base = 'https://docs.google.com/spreadsheets/d/' + snapshot.getId() + '/export?';
  const fetchExport = (query, mime, extension) => {
    const response = UrlFetchApp.fetch(base + query, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (response.getResponseCode() !== 200 || !String(response.getHeaders()['Content-Type'] || '').toLowerCase().includes(mime)) throw new Error('Report export failed; approved snapshot retained: ' + snapshotFile.getUrl());
    return folder.createFile(response.getBlob().setName('Financial_Report_' + month + '_' + stamp + extension)).getUrl();
  };
  const excelUrl = fetchExport('format=xlsx', 'spreadsheetml', '.xlsx');
  const pdfUrl = fetchExport('format=pdf&gid=' + sheet.getSheetId() + '&size=A4&portrait=false&fitw=true&sheetnames=false&printtitle=false&gridlines=false&fzr=false', 'application/pdf', '.pdf');
  return { yearMonth: month, excelUrl, pdfUrl, snapshotUrl: snapshotFile.getUrl(), status: 'FINAL' };
}
