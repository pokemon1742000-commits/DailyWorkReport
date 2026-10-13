const assert = require('node:assert/strict');
const test = require('node:test');
const {
    selectReleaseUpdateAsset,
    canAutoInstallUpdate
} = require('../src/update/release-assets');

const assets = [
    { name: 'Daily-Work-Report-Setup-v1.8.7.exe', browser_download_url: 'https://example.test/x64.exe' },
    { name: 'Daily Work Report-Setup-v1.8.7-ia32.exe', browser_download_url: 'https://example.test/ia32.exe' },
    { name: 'Daily Work Report-v1.8.7-x64-win-unpacked.zip', browser_download_url: 'https://example.test/x64.zip' },
    { name: 'Daily Work Report-v1.8.7-ia32-win-unpacked.zip', browser_download_url: 'https://example.test/ia32.zip' }
];

test('release update selects the installer matching the app architecture', () => {
    assert.equal(selectReleaseUpdateAsset(assets, 'x64'), assets[0]);
    assert.equal(selectReleaseUpdateAsset(assets, 'ia32'), assets[1]);
});

test('release update uses only the matching unpacked archive when no installer is available', () => {
    assert.equal(selectReleaseUpdateAsset(assets.slice(2), 'x64'), assets[2]);
    assert.equal(selectReleaseUpdateAsset(assets.slice(2), 'ia32'), assets[3]);
});

test('release update does not choose an installer for a different architecture', () => {
    assert.equal(selectReleaseUpdateAsset([assets[0]], 'ia32'), undefined);
    assert.equal(selectReleaseUpdateAsset([assets[1]], 'x64'), undefined);
});

test('automatic installation is limited to packaged Windows installer builds', () => {
    assert.equal(canAutoInstallUpdate({ platform: 'win32', packaged: true, portable: false }), true);
    assert.equal(canAutoInstallUpdate({ platform: 'win32', packaged: true, portable: true }), false);
    assert.equal(canAutoInstallUpdate({ platform: 'win32', packaged: false, portable: false }), false);
    assert.equal(canAutoInstallUpdate({ platform: 'darwin', packaged: true, portable: false }), false);
});
