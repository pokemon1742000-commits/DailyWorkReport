const SCRIPT_PROP = PropertiesService.getScriptProperties();
const SHEET_NAME = 'DailyWorkReport_Backup';

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(payload) {
  const token = SCRIPT_PROP.getProperty('SYNC_TOKEN') || '';
  if (!token) return true;
  return payload && payload.token === token;
}

function getOrCreateSpreadsheet_() {
  const existingId = SCRIPT_PROP.getProperty('SPREADSHEET_ID');
  if (existingId) {
    return SpreadsheetApp.openById(existingId);
  }

  const spreadsheet = SpreadsheetApp.create('Daily Work Report Backup');
  SCRIPT_PROP.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  return spreadsheet;
}

function getBackupSheet_(spreadsheet) {
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function reportToRow_(report, index) {
  const people = Array.isArray(report.nguoi_thuc_hien)
    ? report.nguoi_thuc_hien.map((person) => {
        if (typeof person === 'string') return person;
        return person && (person.displayName || person.name || person.folderName || '');
      }).filter(Boolean).join(', ')
    : '';

  const content = Array.isArray(report.noi_dung_cong_viec) ? report.noi_dung_cong_viec.join('\n') : '';
  const time = Array.isArray(report.thoi_gian) ? report.thoi_gian.join('\n') : '';
  const status = Array.isArray(report.trang_thai) ? report.trang_thai.join('\n') : '';
  const folders = Array.isArray(report.folder_nguoi) ? report.folder_nguoi.join('\n') : '';

  return [
    index + 1,
    report.id || '',
    report.ma_du_an || '',
    report.ngay_thuc_hien || '',
    time,
    people,
    content,
    status,
    report.folder_ngay || '',
    folders,
    report.created_at || '',
    JSON.stringify(report)
  ];
}

function writeBackup_(payload) {
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const spreadsheet = getOrCreateSpreadsheet_();
  const sheet = getBackupSheet_(spreadsheet);
  const headers = [
    'STT',
    'ID',
    'Mã dự án',
    'Ngày thực hiện',
    'Thời gian',
    'Người thực hiện',
    'Nội dung công việc',
    'Trạng thái',
    'Thư mục ngày',
    'Thư mục người',
    'Created At',
    'JSON'
  ];

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#f97316')
    .setFontColor('#ffffff');

  if (reports.length) {
    sheet.getRange(2, 1, reports.length, headers.length)
      .setValues(reports.map(reportToRow_));
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, Math.min(headers.length, 10));
  sheet.getRange(1, 1, Math.max(1, reports.length + 1), headers.length).createFilter();

  const meta = {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: SHEET_NAME,
    count: reports.length,
    deviceId: payload.deviceId || '',
    appVersion: payload.appVersion || '',
    uploadedAt: new Date().toISOString()
  };
  SCRIPT_PROP.setProperty('LAST_BACKUP_META', JSON.stringify(meta));
  return meta;
}

function readBackup_() {
  const spreadsheet = getOrCreateSpreadsheet_();
  const sheet = getBackupSheet_(spreadsheet);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  const reports = rows.map((row) => {
    try {
      return JSON.parse(row[11] || '{}');
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: SHEET_NAME,
    count: reports.length,
    reports
  };
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkToken_(payload)) {
      return jsonOutput({ ok: false, error: 'Sai token.' });
    }
    if (payload.action === 'restore') {
      return jsonOutput(readBackup_());
    }
    return jsonOutput(writeBackup_(payload));
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}

function doGet(e) {
  try {
    const payload = {
      token: e && e.parameter && e.parameter.token,
      action: e && e.parameter && e.parameter.action
    };
    if (!checkToken_(payload)) {
      return jsonOutput({ ok: false, error: 'Sai token.' });
    }
    if (payload.action === 'restore') {
      return jsonOutput(readBackup_());
    }
    const spreadsheet = getOrCreateSpreadsheet_();
    const lastMeta = JSON.parse(SCRIPT_PROP.getProperty('LAST_BACKUP_META') || '{}');
    return jsonOutput({
      ok: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      sheetName: SHEET_NAME,
      ...lastMeta
    });
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}
