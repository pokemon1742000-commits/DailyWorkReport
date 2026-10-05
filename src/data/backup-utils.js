const fs = require('fs');
const path = require('path');

function sanitizeSnapshotLabel(label) {
    return String(label || 'before_change')
        .replace(/[^a-zA-Z0-9_.-]+/g, '_')
        .replace(/^\.+|\.+$/g, '') || 'before_change';
}

function snapshotPath(sqliteFile, label, timestamp = Date.now()) {
    return path.join(path.dirname(sqliteFile), `work_reports.${sanitizeSnapshotLabel(label)}.${timestamp}.sqlite`);
}

function assertSqliteIntegrity(SQL, source, label = 'SQLite') {
    const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source || []);
    if (!bytes.length) throw new Error(`${label} rỗng.`);
    let db;
    try {
        db = new SQL.Database(bytes);
        const result = db.exec('PRAGMA integrity_check;');
        const value = result[0] && result[0].values[0] && result[0].values[0][0];
        if (String(value || '').toLowerCase() !== 'ok') {
            throw new Error(`${label} không vượt qua kiểm tra integrity.`);
        }
        return true;
    } catch (error) {
        throw new Error(`${label} không hợp lệ: ${error.message || error}`);
    } finally {
        if (db) db.close();
    }
}

function assertSnapshotFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) throw new Error(`Không tìm thấy file snapshot: ${filePath}`);
    if (fs.statSync(filePath).size <= 0) throw new Error(`File snapshot rỗng: ${filePath}`);
    return filePath;
}

module.exports = { sanitizeSnapshotLabel, snapshotPath, assertSqliteIntegrity, assertSnapshotFile };
