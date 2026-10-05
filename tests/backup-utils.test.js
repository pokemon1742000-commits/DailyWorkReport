const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const initSqlJs = require('sql.js');
const {
    sanitizeSnapshotLabel,
    snapshotPath,
    assertSqliteIntegrity,
    assertSnapshotFile
} = require('../src/data/backup-utils');

test('backup utilities sanitize labels and validate SQLite files', async () => {
    const SQL = await initSqlJs({ locateFile: (file) => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), file) });
    const db = new SQL.Database();
    db.run('CREATE TABLE reports (id TEXT); INSERT INTO reports VALUES (\'one\');');
    const sqlite = Buffer.from(db.export());
    db.close();

    assert.equal(sanitizeSnapshotLabel('before restore / dữ liệu'), 'before_restore_d_li_u');
    assert.equal(assertSqliteIntegrity(SQL, sqlite), true);
    assert.throws(() => assertSqliteIntegrity(SQL, Buffer.from('not sqlite')), /không hợp lệ|không hợp lệ/i);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-work-report-backup-'));
    const target = snapshotPath(path.join(root, 'work_reports.sqlite'), 'before/restore', 123);
    fs.writeFileSync(target, sqlite);
    assert.equal(assertSnapshotFile(target), target);
    fs.rmSync(root, { recursive: true, force: true });
});
