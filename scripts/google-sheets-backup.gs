const SCRIPT_PROP = PropertiesService.getScriptProperties();
const SHEET_NAME = 'DailyWorkReport_Backup';
const NO_PROJECT_SHEET_NAME = 'Không mã dự án';
const META_SHEET_NAME = '_Meta';

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents || '{}');
  }
  return {};
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

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function asArray_(value) {
  return Array.isArray(value) ? value : [];
}

function personText_(people) {
  return asArray_(people)
    .map(function(person) {
      if (typeof person === 'string') return person;
      return person && (person.displayName || person.name || person.folderName || '');
    })
    .filter(Boolean)
    .join(', ');
}

function joinLines_(value) {
  return asArray_(value).join('\n');
}

function isNoProjectReport_(report) {
  const rawProject = String(report && report.ma_du_an || '').trim().toUpperCase();
  const project = rawProject.replace(/[^A-Z0-9]/g, '');
  return !project
    || /^CHUA[_ ]?XAC[_ ]?DINH/.test(rawProject)
    || /^KHONG[_ ]?CO[_ ]?MA[_ ]?DU[_ ]?AN/.test(rawProject)
    || project.indexOf('CHUAXACDINH') === 0
    || project.indexOf('KHONGCOMADUAN') === 0;
}

function reportToRow_(report, index) {
  return [
    index + 1,
    report.id || '',
    report.ma_du_an || '',
    report.ngay_thuc_hien || '',
    joinLines_(report.thoi_gian),
    personText_(report.nguoi_thuc_hien),
    joinLines_(report.noi_dung_cong_viec),
    joinLines_(report.trang_thai),
    report.folder_ngay || '',
    joinLines_(report.folder_nguoi),
    report.created_at || '',
    JSON.stringify(report || {})
  ];
}

function writeMeta_(spreadsheet, meta) {
  const sheet = getOrCreateSheet_(spreadsheet, META_SHEET_NAME);
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]);
  sheet.getRange(2, 1, 7, 2).setValues([
    ['uploadedAt', meta.uploadedAt || ''],
    ['count', meta.count || 0],
    ['deviceId', meta.deviceId || ''],
    ['appVersion', meta.appVersion || ''],
    ['spreadsheetId', meta.spreadsheetId || ''],
    ['spreadsheetUrl', meta.spreadsheetUrl || ''],
    ['sheetName', meta.sheetName || '']
  ]);
  sheet.hideSheet();
}

function writeBackup_(payload) {
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const explicitNoProjectReports = Array.isArray(payload.noProjectReports) ? payload.noProjectReports : null;
  const spreadsheet = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(spreadsheet, SHEET_NAME);
  const noProjectSheet = getOrCreateSheet_(spreadsheet, NO_PROJECT_SHEET_NAME);
  const headers = [
    'STT',
    'ID',
    'Ma du an',
    'Ngay thuc hien',
    'Thoi gian',
    'Nguoi thuc hien',
    'Noi dung cong viec',
    'Trang thai',
    'Thu muc ngay',
    'Thu muc nguoi',
    'Created At',
    'JSON'
  ];

  const noProjectReports = explicitNoProjectReports || reports.filter(function(report) {
    return isNoProjectReport_(report);
  });
  const noProjectIds = {};
  noProjectReports.forEach(function(report) {
    const id = String(report && report.id || '').trim();
    if (id) noProjectIds[id] = true;
  });
  const projectReports = reports.filter(function(report) {
    const id = String(report && report.id || '').trim();
    return !isNoProjectReport_(report) && (!id || !noProjectIds[id]);
  });

  [
    [sheet, projectReports, '#f97316'],
    [noProjectSheet, noProjectReports, '#dc2626']
  ].forEach(function(entry) {
    const targetSheet = entry[0];
    const targetReports = entry[1];
    targetSheet.clear();
    targetSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    targetSheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground(entry[2])
      .setFontColor('#ffffff');

    if (targetReports.length) {
      targetSheet.getRange(2, 1, targetReports.length, headers.length)
        .setValues(targetReports.map(reportToRow_));
    }

    const existingFilter = targetSheet.getFilter();
    if (existingFilter) existingFilter.remove();
    targetSheet.setFrozenRows(1);
    targetSheet.getRange(1, 1, Math.max(1, targetReports.length + 1), headers.length).createFilter();
    targetSheet.autoResizeColumns(1, headers.length);
  });

  const meta = {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: SHEET_NAME,
    noProjectSheetName: NO_PROJECT_SHEET_NAME,
    count: reports.length,
    deviceId: payload.deviceId || '',
    appVersion: payload.appVersion || '',
    uploadedAt: new Date().toISOString()
  };
  SCRIPT_PROP.setProperty('LAST_BACKUP_META', JSON.stringify(meta));
  writeMeta_(spreadsheet, meta);
  return meta;
}

function readBackup_() {
  const spreadsheet = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(spreadsheet, SHEET_NAME);
  const noProjectSheet = spreadsheet.getSheetByName(NO_PROJECT_SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const headers = values.length ? values[0].map(function(value) {
    return String(value || '').trim().toUpperCase();
  }) : [];
  const jsonColumn = headers.indexOf('JSON');
  if (values.length && jsonColumn < 0) {
    throw new Error('Khong tim thay cot JSON trong sheet backup.');
  }

  const readReportsFromValues = function(rows) {
    return rows.slice(1)
    .map(function(row) {
      const raw = row[jsonColumn];
      if (!raw) return null;
      try {
        return JSON.parse(String(raw));
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
  };
  const reports = jsonColumn >= 0 ? readReportsFromValues(values) : [];
  if (noProjectSheet) {
    const noProjectValues = noProjectSheet.getDataRange().getValues();
    const noProjectHeaders = noProjectValues[0] ? noProjectValues[0].map(function(value) {
      return String(value || '').trim().toUpperCase();
    }) : [];
    const noProjectJsonColumn = noProjectHeaders.indexOf('JSON');
    if (noProjectJsonColumn >= 0) {
      noProjectValues.slice(1).forEach(function(row) {
        const raw = row[noProjectJsonColumn];
        if (!raw) return;
        try {
          reports.push(JSON.parse(String(raw)));
        } catch (error) {}
      });
    }
  }

  const uniqueReports = [];
  const seenIds = {};
  reports.forEach(function(report) {
    const id = String(report && report.id || '').trim();
    if (id && seenIds[id]) return;
    if (id) seenIds[id] = true;
    uniqueReports.push(report);
  });
  const noProjectCount = uniqueReports.filter(isNoProjectReport_).length;

  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: SHEET_NAME,
    noProjectSheetName: NO_PROJECT_SHEET_NAME,
    count: uniqueReports.length,
    projectCount: uniqueReports.length - noProjectCount,
    noProjectCount: noProjectCount,
    reports: uniqueReports
  };
}

function handle_(payload) {
  if (!checkToken_(payload)) {
    return { ok: false, error: 'Sai token.' };
  }
  if (payload.action === 'restore') {
    return readBackup_();
  }
  return writeBackup_(payload);
}

function doPost(e) {
  try {
    return jsonOutput_(handle_(parsePayload_(e)));
  } catch (error) {
    return jsonOutput_({ ok: false, error: error.message || String(error) });
  }
}

function doGet(e) {
  try {
    const payload = {
      action: e && e.parameter && e.parameter.action,
      token: e && e.parameter && e.parameter.token
    };
    if (payload.action === 'restore') {
      return jsonOutput_(handle_(payload));
    }

    if (!checkToken_(payload)) {
      return jsonOutput_({ ok: false, error: 'Sai token.' });
    }

    const spreadsheet = getOrCreateSpreadsheet_();
    const lastMeta = JSON.parse(SCRIPT_PROP.getProperty('LAST_BACKUP_META') || '{}');
    return jsonOutput_({
      ok: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      sheetName: SHEET_NAME,
      count: lastMeta.count || 0,
      uploadedAt: lastMeta.uploadedAt || '',
      deviceId: lastMeta.deviceId || '',
      appVersion: lastMeta.appVersion || ''
    });
  } catch (error) {
    return jsonOutput_({ ok: false, error: error.message || String(error) });
  }
}
