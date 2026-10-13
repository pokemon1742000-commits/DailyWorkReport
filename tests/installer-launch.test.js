const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDownloadedInstaller } = require('../src/update/installer-launch');

test('installer launch uses the Windows shell with the completed installer file', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'DailyWorkReport-installer-'));
    const installerPath = path.join(directory, 'Daily Work Report Setup.exe');
    fs.writeFileSync(installerPath, 'installer');
    const openedPaths = [];

    try {
        await openDownloadedInstaller({
            openPath: async (filePath) => {
                openedPaths.push(filePath);
                return '';
            }
        }, installerPath);
        assert.deepEqual(openedPaths, [installerPath]);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('installer launch surfaces Windows shell failures instead of reporting success', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'DailyWorkReport-installer-'));
    const installerPath = path.join(directory, 'setup.exe');
    fs.writeFileSync(installerPath, 'installer');

    try {
        await assert.rejects(
            openDownloadedInstaller({ openPath: async () => 'Access denied' }, installerPath),
            /Windows báo lỗi khi mở bộ cài: Access denied/
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('installer launch rejects missing or empty downloads before closing the app', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'DailyWorkReport-installer-'));
    const installerPath = path.join(directory, 'empty.exe');
    fs.writeFileSync(installerPath, '');
    let openAttempted = false;

    try {
        await assert.rejects(
            openDownloadedInstaller({ openPath: async () => { openAttempted = true; return ''; } }, installerPath),
            /không hợp lệ hoặc rỗng/
        );
        assert.equal(openAttempted, false);
        await assert.rejects(
            openDownloadedInstaller({ openPath: async () => '' }, path.join(directory, 'missing.exe')),
            /Không tìm thấy file cài đặt/
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
