// ============================================================
//  DRAGON FARM — GOOGLE SHEET LOG (Apps Script)
//
//  Paste this into the log spreadsheet (Extensions → Apps Script) and
//  deploy it as a web app. The n8n workflow's "Add row to sheet" step
//  posts { tab, row } here, and the row is added under the matching
//  column names of that tab (Shows, Payments or Fans). Unknown columns
//  are left blank, so you can add or reorder columns freely.
// ============================================================

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(body.tab);
    if (!sheet) return reply({ ok: false, error: 'No tab named ' + body.tab });
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = body.row || {};
    sheet.appendRow(head.map(name => row[name] !== undefined ? row[name] : ''));
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
