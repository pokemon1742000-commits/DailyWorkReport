const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { waitForLauncherReady } = require('../src/update/launcher-readiness');

test('launcher readiness waits until PowerShell writes its startup log', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'DailyWorkReport-launcher-'));
    const logFile = path.join(directory, 'update.log');
    const childProcess = { exitCode: null, signalCode: null };

    try {
        fs.writeFileSync(logFile, 'Waiting for launcher.\n');
        const ready = waitForLauncherReady(logFile, childProcess, { timeoutMs: 1000, pollIntervalMs: 5 });
        setTimeout(() => fs.appendFileSync(logFile, 'Launcher started.\n'), 15);
        await ready;
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('launcher readiness fails explicitly if PowerShell exits before startup', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'DailyWorkReport-launcher-'));
    const logFile = path.join(directory, 'update.log');

    try {
        await assert.rejects(
            waitForLauncherReady(logFile, { exitCode: 2, signalCode: null }, { timeoutMs: 100, pollIntervalMs: 5 }),
            /PowerShell đã đóng/
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
