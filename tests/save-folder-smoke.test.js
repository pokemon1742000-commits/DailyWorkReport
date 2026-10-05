const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureDirectory, resolveStoredFolderPath } = require('../src/filesystem/path-utils');
const { folderDateNameFromReport, sanitizeFolderName } = require('../src/reports/report-utils');

test('folder save smoke creates dated project and no-project trees repeatedly', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Daily Work Báo Cáo-'));
    const date = folderDateNameFromReport({ ngay_thuc_hien: '2026-10-02' });
    const dated = path.join(root, date);
    const project = path.join(dated, sanitizeFolderName('Ánh Khoa'), 'AUTM260579');
    const noProject = path.join(dated, 'KhongCoMaDuAn', sanitizeFolderName('Ánh Khoa'));

    [project, noProject, project, noProject].forEach((folder) => ensureDirectory(folder));

    assert.equal(fs.statSync(resolveStoredFolderPath(path.relative(root, project), root)).isDirectory(), true);
    assert.equal(fs.statSync(noProject).isDirectory(), true);
    assert.equal(fs.readdirSync(root).filter((name) => name.includes('UnknownDate')).length, 0);
    fs.rmSync(root, { recursive: true, force: true });
});
