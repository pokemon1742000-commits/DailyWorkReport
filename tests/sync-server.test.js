const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const port = 43000 + Math.floor(Math.random() * 1000);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-work-report-sync-'));
const server = spawn(process.execPath, ['server/sync-server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        SYNC_TOKEN: 'test-token',
        SYNC_DATA_DIR: dataDir
    },
    stdio: 'ignore'
});

function url(pathname) {
    return `http://127.0.0.1:${port}${pathname}`;
}

async function waitForServer() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            const response = await fetch(url('/health'));
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Sync server did not start.');
}

test('sync server protects latest endpoint with token', async () => {
    await waitForServer();
    const response = await fetch(url('/api/sqlite/latest?deviceId=test-device'));
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.ok, false);
});

test('sync server accepts health checks without token', async () => {
    await waitForServer();
    const response = await fetch(url('/health'));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
});

after(() => {
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
});
