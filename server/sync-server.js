const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || process.env.SYNC_PORT || 3959);
const HOST = process.env.HOST || '0.0.0.0';
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const DATA_DIR = process.env.SYNC_DATA_DIR || path.join(__dirname, '..', 'server_data');
const MAX_BODY_SIZE = Number(process.env.SYNC_MAX_BODY_SIZE || 80 * 1024 * 1024);

function jsonResponse(res, status, payload) {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function safeName(value) {
    return String(value || 'default')
        .replace(/[^a-zA-Z0-9_.-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'default';
}

function ensureAuthorized(req, res) {
    if (!SYNC_TOKEN) return true;
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    if (token === SYNC_TOKEN) return true;
    jsonResponse(res, 401, { ok: false, error: 'Unauthorized' });
    return false;
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > MAX_BODY_SIZE) {
                reject(new Error('Body quá lớn.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve(text ? JSON.parse(text) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function deviceDir(deviceId) {
    return path.join(DATA_DIR, 'devices', safeName(deviceId));
}

function latestMetaPath(deviceId) {
    return path.join(deviceDir(deviceId), 'latest.json');
}

function latestSqlitePath(deviceId) {
    return path.join(deviceDir(deviceId), 'work_reports.sqlite');
}

function backupSqlitePath(deviceId, timestamp) {
    return path.join(deviceDir(deviceId), 'backups', `${timestamp}.sqlite`);
}

function writeBackup(deviceId, sqliteBuffer, metadata) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = deviceDir(deviceId);
    const backupDir = path.join(dir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const latestFile = latestSqlitePath(deviceId);
    const backupFile = backupSqlitePath(deviceId, timestamp);
    fs.writeFileSync(latestFile, sqliteBuffer);
    fs.writeFileSync(backupFile, sqliteBuffer);

    const hash = crypto.createHash('sha256').update(sqliteBuffer).digest('hex');
    const meta = {
        ok: true,
        deviceId: safeName(deviceId),
        uploadedAt: new Date().toISOString(),
        size: sqliteBuffer.length,
        sha256: hash,
        latestFile,
        backupFile,
        ...metadata
    };
    fs.writeFileSync(latestMetaPath(deviceId), JSON.stringify(meta, null, 2), 'utf8');
    return meta;
}

async function handleUpload(req, res) {
    if (!ensureAuthorized(req, res)) return;
    const body = await readJsonBody(req);
    const deviceId = body.deviceId || 'default';
    if (!body.sqliteBase64) {
        jsonResponse(res, 400, { ok: false, error: 'Thiếu sqliteBase64.' });
        return;
    }

    const sqliteBuffer = Buffer.from(body.sqliteBase64, 'base64');
    if (!sqliteBuffer.length) {
        jsonResponse(res, 400, { ok: false, error: 'File SQLite rỗng.' });
        return;
    }

    const meta = writeBackup(deviceId, sqliteBuffer, {
        appVersion: body.appVersion || '',
        machineName: body.machineName || '',
        note: body.note || ''
    });
    jsonResponse(res, 200, meta);
}

function handleLatest(req, res, url) {
    if (!ensureAuthorized(req, res)) return;
    const deviceId = url.searchParams.get('deviceId') || 'default';
    const metaFile = latestMetaPath(deviceId);
    if (!fs.existsSync(metaFile)) {
        jsonResponse(res, 404, { ok: false, error: 'Chưa có backup cho thiết bị này.' });
        return;
    }
    jsonResponse(res, 200, JSON.parse(fs.readFileSync(metaFile, 'utf8')));
}

function handleDownload(req, res, url) {
    if (!ensureAuthorized(req, res)) return;
    const deviceId = url.searchParams.get('deviceId') || 'default';
    const sqliteFile = latestSqlitePath(deviceId);
    if (!fs.existsSync(sqliteFile)) {
        jsonResponse(res, 404, { ok: false, error: 'Chưa có file SQLite để tải.' });
        return;
    }
    const stat = fs.statSync(sqliteFile);
    res.writeHead(200, {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="work_reports.sqlite"'
    });
    fs.createReadStream(sqliteFile).pipe(res);
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (req.method === 'GET' && url.pathname === '/health') {
            jsonResponse(res, 200, { ok: true, name: 'Daily Work Report Sync Server', time: new Date().toISOString() });
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/sqlite/upload') {
            await handleUpload(req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/sqlite/latest') {
            handleLatest(req, res, url);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/sqlite/download') {
            handleDownload(req, res, url);
            return;
        }
        jsonResponse(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
        jsonResponse(res, 500, { ok: false, error: error.message || String(error) });
    }
});

fs.mkdirSync(DATA_DIR, { recursive: true });
server.listen(PORT, HOST, () => {
    console.log(`Daily Work Report Sync Server đang chạy: http://${HOST}:${PORT}`);
    console.log(`Dữ liệu server: ${DATA_DIR}`);
    console.log(SYNC_TOKEN ? 'Đã bật token bảo vệ.' : 'Chưa bật token. Chỉ nên dùng trong mạng nội bộ hoặc test.');
});
