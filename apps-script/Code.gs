const SHEETS = { PRODUCTS:'Products', STAFF:'Staff', TRANSACTIONS:'Transactions', SHIFTS:'Shifts' };
const TYPES = ['NORMAL_SALE','STAFF','WASTE'];
const PAYMENTS = ['MPAY','WECHAT_PAY'];
const WASTE_REASONS = ['MADE_WRONG','CALIBRATION','SPILLED','OTHER'];
const FULFILLMENT_STATUSES = ['PENDING','COMPLETED'];
const TRANSACTION_HEADERS = ['transaction_id','timestamp','shift_id','staff_id','type','items_json','total','payment_method','waste_reason','status','fulfillment_status','completed_at','completed_by'];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action;
    if (action !== 'getBootstrap') assertToken_(payload.token);
    let data;
    if (action === 'getBootstrap') data = getBootstrap_();
    else if (action === 'syncClosedShift') data = syncClosedShift_(payload);
    else if (action === 'getTodayOrders') data = getTodayOrders_();
    else if (action === 'updateOrderStatus') data = updateOrderStatus_(payload);
    else if (action === 'login') data = login_(payload.staffId, payload.pin);
    else if (action === 'openShift') data = openShift_(payload.staffId);
    else if (action === 'createTransaction') data = createTransaction_(payload.transaction);
    else if (action === 'closeShift') data = closeShift_(payload);
    else throw new Error('Unknown action');
    return json_({ ok:true, data:data });
  } catch (err) {
    return json_({ ok:false, error:String(err.message || err) });
  }
}

function assertToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('POS_API_TOKEN');
  if (!expected || token !== expected) throw new Error('Unauthorized');
}

function getBootstrap_() {
  const products = rowsAsObjects_(SHEETS.PRODUCTS).filter(r => truthy_(r.active)).map(r => ({ id:String(r.id), name:String(r.name), category:String(r.category), price:Number(r.price), staffPrice:Number(r.staff_price), active:true, sortOrder:Number(r.sort_order || 999) }));
  const staff = rowsAsObjects_(SHEETS.STAFF).filter(r => truthy_(r.active)).map(r => ({ id:String(r.id), name:String(r.name), role:String(r.role || 'STAFF'), active:true }));
  return { products:products, staff:staff };
}

function getTodayOrders_() {
  ensureTransactionColumns_();
  const timezone = Session.getScriptTimeZone();
  const dateKey = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const staff = rowsAsObjects_(SHEETS.STAFF).reduce((map, row) => { map[String(row.id)] = String(row.name); return map; }, {});
  const rows = rowsAsObjects_(SHEETS.TRANSACTIONS).filter(row => String(row.status) === 'COMPLETED' && sameDate_(row.timestamp, dateKey, timezone));
  const transactions = rows.map(row => ({
    transactionId: String(row.transaction_id),
    timestamp: new Date(row.timestamp).toISOString(),
    shiftId: String(row.shift_id),
    staffId: String(row.staff_id),
    staffName: staff[String(row.staff_id)] || String(row.staff_id),
    type: String(row.type),
    items: parseItems_(row.items_json),
    total: Number(row.total || 0),
    paymentMethod: String(row.payment_method || ''),
    wasteReason: String(row.waste_reason || ''),
    fulfillmentStatus: FULFILLMENT_STATUSES.indexOf(String(row.fulfillment_status)) >= 0 ? String(row.fulfillment_status) : 'PENDING',
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : '',
    completedBy: String(row.completed_by || ''),
  }));
  return { date: dateKey, timezone: timezone, orders: transactions, stats: dashboardStats_(transactions), syncedAt: new Date().toISOString() };
}

function updateOrderStatus_(payload) {
  ensureTransactionColumns_();
  if (FULFILLMENT_STATUSES.indexOf(String(payload.fulfillmentStatus)) < 0) throw new Error('Invalid fulfillment status');
  assertActiveStaff_(payload.staffId);
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_(SHEETS.TRANSACTIONS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const transactionIndex = headers.indexOf('transaction_id');
    const typeIndex = headers.indexOf('type');
    const fulfillmentIndex = headers.indexOf('fulfillment_status');
    const completedAtIndex = headers.indexOf('completed_at');
    const completedByIndex = headers.indexOf('completed_by');
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][transactionIndex]) !== String(payload.transactionId)) continue;
      if (String(values[i][typeIndex]) === 'WASTE') throw new Error('Waste entries do not have fulfillment status');
      const status = String(payload.fulfillmentStatus);
      sheet.getRange(i + 1, fulfillmentIndex + 1, 1, 3).setValues([[status, status === 'COMPLETED' ? new Date() : '', status === 'COMPLETED' ? String(payload.staffId) : '']]);
      return { transactionId: String(payload.transactionId), fulfillmentStatus: status };
    }
    throw new Error('Transaction not found');
  } finally { lock.releaseLock(); }
}

function login_(staffId, pin) {
  const row = rowsAsObjects_(SHEETS.STAFF).find(r => String(r.id) === String(staffId) && truthy_(r.active));
  if (!row || String(row.pin) !== String(pin)) throw new Error('Invalid PIN');
  return { staff:{ id:String(row.id), name:String(row.name), role:String(row.role || 'STAFF'), active:true } };
}

function openShift_(staffId) {
  assertActiveStaff_(staffId);
  const shiftId = 'shift-' + Utilities.getUuid();
  sheet_(SHEETS.SHIFTS).appendRow([shiftId, staffId, new Date(), '', 0, 0, '', '', '', '', 'OPEN']);
  return { shiftId:shiftId };
}

function createTransaction_(tx) {
  validateTransaction_(tx);
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const existing = rowsAsObjects_(SHEETS.TRANSACTIONS).some(r => String(r.transaction_id) === String(tx.transactionId));
    if (existing) return { transactionId:tx.transactionId, duplicate:true };
    assertOpenShift_(tx.shiftId, tx.staffId);
    ensureTransactionColumns_();
    sheet_(SHEETS.TRANSACTIONS).appendRow([tx.transactionId, new Date(), tx.shiftId, tx.staffId, tx.type, JSON.stringify(tx.items), Number(tx.total || 0), tx.paymentMethod || '', tx.wasteReason || '', 'COMPLETED', 'PENDING', '', '']);
    return { transactionId:tx.transactionId, duplicate:false };
  } finally { lock.releaseLock(); }
}

function closeShift_(payload) {
  const rows = rowsAsObjects_(SHEETS.TRANSACTIONS).filter(r => String(r.shift_id) === String(payload.shiftId) && String(r.status) === 'COMPLETED');
  const mpayExpected = rows.filter(r => r.payment_method === 'MPAY').reduce((s,r)=>s+Number(r.total||0),0);
  const wechatExpected = rows.filter(r => r.payment_method === 'WECHAT_PAY').reduce((s,r)=>s+Number(r.total||0),0);
  const mpayActual = Number(payload.mpayActual || 0), wechatActual = Number(payload.wechatActual || 0);
  const difference = (mpayActual + wechatActual) - (mpayExpected + wechatExpected);
  const sh = sheet_(SHEETS.SHIFTS); const values = sh.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (String(values[i][0]) === String(payload.shiftId) && String(values[i][1]) === String(payload.staffId)) {
      sh.getRange(i+1,4,1,8).setValues([[new Date(), mpayExpected, wechatExpected, mpayActual, wechatActual, difference, payload.note || '', 'CLOSED']]);
      return { mpayExpected:mpayExpected, wechatExpected:wechatExpected, difference:difference };
    }
  }
  throw new Error('Open shift not found');
}

function syncClosedShift_(payload) {
  const shift = payload.shift;
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  if (!shift || !shift.id || String(shift.status) !== 'CLOSED') throw new Error('Closed shift payload required');
  const ss = SpreadsheetApp.getActive();
  const shiftSheet = ensureReportSheet_(ss, 'Report_Shifts', ['shift_id','staff_id','opened_at','closed_at','mpay_expected','wechat_expected','mpay_actual','wechat_actual','difference','note','synced_at']);
  const transactionSheet = ensureReportSheet_(ss, 'Report_Transactions', ['transaction_id','shift_id','staff_id','type','total','payment_method','waste_reason','fulfillment_status','created_at','items_json','synced_at']);
  upsertReportRow_(shiftSheet, 1, String(shift.id), [String(shift.id), String(shift.staff_id || ''), shift.opened_at || '', shift.closed_at || '', Number(shift.mpay_expected || 0), Number(shift.wechat_expected || 0), Number(shift.mpay_actual || 0), Number(shift.wechat_actual || 0), Number(shift.difference || 0), String(shift.note || ''), new Date()]);
  transactions.forEach(tx => upsertReportRow_(transactionSheet, 1, String(tx.id), [String(tx.id), String(tx.shift_id || shift.id), String(tx.staff_id || ''), String(tx.type || ''), Number(tx.total || 0), String(tx.payment_method || ''), String(tx.waste_reason || ''), String(tx.fulfillment_status || ''), tx.created_at || '', JSON.stringify(tx.transaction_items || []), new Date()]));
  return { shiftId: String(shift.id), transactionCount: transactions.length, status: 'SYNCED' };
}

function ensureReportSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) { sheet.appendRow(headers); sheet.setFrozenRows(1); }
  return sheet;
}

function upsertReportRow_(sheet, keyColumn, key, row) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][keyColumn - 1]) === key) { sheet.getRange(i + 1, 1, 1, row.length).setValues([row]); return; }
  }
  sheet.appendRow(row);
}

function validateTransaction_(tx) {
  if (!tx || !tx.transactionId || !tx.shiftId || !tx.staffId) throw new Error('Missing transaction identifiers');
  if (TYPES.indexOf(tx.type) < 0) throw new Error('Invalid transaction type');
  if (!Array.isArray(tx.items) || tx.items.length === 0) throw new Error('Transaction needs at least one item');
  if (tx.type === 'WASTE') {
    if (WASTE_REASONS.indexOf(tx.wasteReason) < 0) throw new Error('Invalid waste reason');
    if (Number(tx.total) !== 0 || tx.paymentMethod) throw new Error('Waste must have zero total and no payment method');
  } else {
    if (PAYMENTS.indexOf(tx.paymentMethod) < 0) throw new Error('Invalid payment method');
    if (Number(tx.total) < 0) throw new Error('Invalid total');
  }
}

function assertActiveStaff_(staffId) { if (!rowsAsObjects_(SHEETS.STAFF).some(r => String(r.id)===String(staffId) && truthy_(r.active))) throw new Error('Inactive staff'); }
function assertOpenShift_(shiftId, staffId) { if (!rowsAsObjects_(SHEETS.SHIFTS).some(r => String(r.shift_id)===String(shiftId) && String(r.staff_id)===String(staffId) && String(r.status)==='OPEN')) throw new Error('Shift is not open'); }
function sheet_(name) { const s=SpreadsheetApp.getActive().getSheetByName(name); if(!s) throw new Error('Missing sheet: '+name); return s; }
function rowsAsObjects_(name) { const v=sheet_(name).getDataRange().getValues(); if(v.length<2)return[]; const h=v[0].map(String); return v.slice(1).map(row=>Object.fromEntries(h.map((k,i)=>[k,row[i]]))); }
function truthy_(v) { return v===true || String(v).toUpperCase()==='TRUE' || String(v)==='1'; }
function json_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
function parseItems_(value) { try { const items = JSON.parse(String(value || '[]')); return Array.isArray(items) ? items : []; } catch (err) { return []; } }
function sameDate_(value, dateKey, timezone) { return value && Utilities.formatDate(new Date(value), timezone, 'yyyy-MM-dd') === dateKey; }
function dashboardStats_(rows) {
  const orders = rows.filter(row => row.type !== 'WASTE');
  const waste = rows.filter(row => row.type === 'WASTE');
  return {
    orderCount: orders.length,
    revenue: orders.reduce((sum, row) => sum + Number(row.total || 0), 0),
    pendingCount: orders.filter(row => row.fulfillmentStatus !== 'COMPLETED').length,
    completedCount: orders.filter(row => row.fulfillmentStatus === 'COMPLETED').length,
    mpayTotal: orders.filter(row => row.paymentMethod === 'MPAY').reduce((sum, row) => sum + Number(row.total || 0), 0),
    wechatTotal: orders.filter(row => row.paymentMethod === 'WECHAT_PAY').reduce((sum, row) => sum + Number(row.total || 0), 0),
    wasteCount: waste.length,
    wasteTotal: waste.reduce((sum, row) => sum + Number(row.total || 0), 0),
  };
}
function ensureTransactionColumns_() {
  const sheet = sheet_(SHEETS.TRANSACTIONS);
  const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  TRANSACTION_HEADERS.forEach(header => {
    if (current.indexOf(header) >= 0) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue(header);
    current.push(header);
  });
}

function setupSheets() {
  const ss=SpreadsheetApp.getActive();
  ensureSheet_(ss,SHEETS.PRODUCTS,['id','name','category','price','staff_price','active','sort_order'],[
    ['americano','Americano','Coffee',12,5,true,1],['latte','Latte','Coffee',18,9,true,2],['matcha','Matcha Latte','Matcha',18,9,true,3],['tea','Tea','Tea',12,6,true,4]
  ]);
  ensureSheet_(ss,SHEETS.STAFF,['id','name','pin','role','active'],[['staff-001','Manager','1234','MANAGER',true]]);
  ensureSheet_(ss,SHEETS.TRANSACTIONS,TRANSACTION_HEADERS,[]);
  ensureTransactionColumns_();
  ensureSheet_(ss,SHEETS.SHIFTS,['shift_id','staff_id','opened_at','closed_at','mpay_expected','wechat_expected','mpay_actual','wechat_actual','difference','note','status'],[]);
}
function ensureSheet_(ss,name,headers,seed){let s=ss.getSheetByName(name)||ss.insertSheet(name);if(s.getLastRow()===0){s.appendRow(headers);seed.forEach(r=>s.appendRow(r));s.setFrozenRows(1);}}
