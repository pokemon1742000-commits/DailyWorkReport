const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    normalizeRootFolder,
    resolveStoredFolderPath,
    ensureDirectory
} = require('../src/filesystem/path-utils');

test('path utilities resolve relative folders from a Unicode root', () => {
    const root = path.join(os.tmpdir(), 'Daily Work Báo Cáo');
    const relative = '2026October02/KhongCoMaDuAn/AnhKhoa';
    const resolved = resolveStoredFolderPath(relative, root);
    assert.equal(resolved, path.join(root, '2026October02', 'KhongCoMaDuAn', 'AnhKhoa'));
    assert.equal(normalizeRootFolder(`  ${root}  `), path.normalize(root));
});

test('path utilities create and validate nested folders', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-work-report-path-'));
    const target = path.join(root, '2026October02', 'Person', 'AUTM260579');
    assert.equal(ensureDirectory(target, 'thư mục dự án'), target);
    assert.equal(fs.statSync(target).isDirectory(), true);
    fs.rmSync(root, { recursive: true, force: true });
});
