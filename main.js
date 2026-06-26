const { app, BrowserWindow, Notification, dialog, ipcMain, protocol, session, shell } = require('electron');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFile, spawn } = require('child_process');
const initSqlJs = require('sql.js');
const ExcelJS = require('exceljs');

const DEFAULT_WEEKLY_LOGO = path.join(__dirname, 'assets', 'meiko-automation-logo.png');
const APP_ICON_FILE = path.join(__dirname, 'assets', 'daily-work-report-icon.png');
const MACHINE_REFERENCE_FILE = path.join(__dirname, 'reference_files', 'Thamkhao.xlsm');
const SETUP_TRACKING_TEMPLATE_FILE = path.join(__dirname, 'reference_files', 'Theo_doi_setup_may_cho_khach_hang.xlsx');
const MACHINE_REFERENCE_SHEET_KEY = 'danhsachmay';
const GITHUB_OWNER = 'pokemon1742000-commits';
const GITHUB_REPO = 'DailyWorkReport';
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

let sqlPromise = null;
let machineReferenceCache = null;
const ZALO_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.heic', '.tif', '.tiff']);
const zaloAutoMoveState = {
    enabled: false,
    timer: null,
    busy: false,
    sourceFolder: '',
    fallbackFolder: '',
    useActiveExplorer: true,
    seen: new Set(),
    pending: new Map(),
    watcher: null,
    pollRequested: false,
    pollAgain: false,
    movedCount: 0,
    lastDestination: '',
    activeExplorerFolder: '',
    openExplorerFolders: [],
    lastExplorerScanAt: 0,
    lastMessage: 'Chưa bật tự chuyển ảnh Zalo.',
    lastError: ''
};

protocol.registerSchemesAsPrivileged([{
    scheme: 'app-resource',
    privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
    }
}]);

function mediaPipeContentType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.js') return 'application/javascript; charset=utf-8';
    if (extension === '.wasm') return 'application/wasm';
    if (extension === '.json') return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}

function mediaPipeAssetBody(assetPath, fileName) {
    const content = fs.readFileSync(assetPath);
    if (path.extname(fileName).toLowerCase() !== '.js') return content;
    return content.toString('utf8')
        .replace(
            /var ENVIRONMENT_IS_NODE=typeof process=="object"&&typeof process\.versions=="object"&&typeof process\.versions\.node=="string";/g,
            'var ENVIRONMENT_IS_NODE=false;'
        )
        .replace(
            /if \(typeof process === 'object' && typeof process\.versions === 'object' && typeof process\.versions\.node === 'string'\) \{/g,
            'if (false) {'
        );
}

function registerAppResourceProtocol() {
    protocol.handle('app-resource', async (request) => {
        const requestUrl = new URL(request.url);
        if (requestUrl.hostname !== 'mediapipe') {
            return new Response('Not found', { status: 404 });
        }
        const fileName = path.basename(decodeURIComponent(requestUrl.pathname));
        const assetPath = path.join(__dirname, 'node_modules', '@mediapipe', 'hands', fileName);
        if (!fileName || !fs.existsSync(assetPath)) {
            return new Response('Not found', { status: 404 });
        }
        return new Response(mediaPipeAssetBody(assetPath, fileName), {
            status: 200,
            headers: {
                'Content-Type': mediaPipeContentType(fileName),
                'Access-Control-Allow-Origin': '*'
            }
        });
    });
}

function execFileText(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(command, args, {
            cwd: __dirname,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            ...options
        }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseExplorerFolderLines(output) {
    const folders = String(output || '')
        .trim()
        .split(/\r?\n/)
        .map((folder) => folder.trim())
        .filter(Boolean);
    let detectedActiveFolder = '';
    const cleanedFolders = folders
        .map((folder) => {
            const active = folder.startsWith('__ACTIVE__|');
            const cleanFolder = active ? folder.replace(/^__ACTIVE__\|/, '') : folder;
            if (active) detectedActiveFolder = cleanFolder;
            return cleanFolder;
        })
        .filter((folder, index, list) => (
            folder
            && list.findIndex((item) => path.resolve(item).toLowerCase() === path.resolve(folder).toLowerCase()) === index
            && fs.existsSync(folder)
            && fs.statSync(folder).isDirectory()
        ));
    if (detectedActiveFolder && cleanedFolders.some((folder) => path.resolve(folder).toLowerCase() === path.resolve(detectedActiveFolder).toLowerCase())) {
        zaloAutoMoveState.activeExplorerFolder = detectedActiveFolder;
    } else if (
        zaloAutoMoveState.activeExplorerFolder
        && !cleanedFolders.some((folder) => path.resolve(folder).toLowerCase() === path.resolve(zaloAutoMoveState.activeExplorerFolder).toLowerCase())
    ) {
        zaloAutoMoveState.activeExplorerFolder = '';
    }
    return cleanedFolders;
}

async function getGitInfo() {
    try {
        const inside = await execFileText('git', ['rev-parse', '--is-inside-work-tree']);
        if (!inside.stdout.trim().includes('true')) {
            return { isRepo: false, remoteUrl: '', branch: '', commit: '' };
        }
        const [remote, branch, commit] = await Promise.all([
            execFileText('git', ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' })),
            execFileText('git', ['branch', '--show-current']).catch(() => ({ stdout: '' })),
            execFileText('git', ['rev-parse', '--short', 'HEAD']).catch(() => ({ stdout: '' }))
        ]);
        return {
            isRepo: true,
            remoteUrl: remote.stdout.trim(),
            branch: branch.stdout.trim(),
            commit: commit.stdout.trim()
        };
    } catch {
        return { isRepo: false, remoteUrl: '', branch: '', commit: '' };
    }
}

function githubRemoteToUrl(remoteUrl) {
    const value = String(remoteUrl || '').trim();
    if (!value) return '';
    const sshMatch = value.match(/^git@github\.com:(.+?)(?:\.git)?$/i);
    if (sshMatch) return `https://github.com/${sshMatch[1]}`;
    return value.replace(/\.git$/i, '');
}

function requestGithubJson(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'DailyWorkReportUpdater'
            }
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                requestGithubJson(response.headers.location).then(resolve, reject);
                return;
            }

            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`GitHub tra ve loi ${response.statusCode}: ${body.slice(0, 200)}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
        request.on('error', reject);
    });
}

function downloadFile(url, destinationFile) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
        const file = fs.createWriteStream(destinationFile);
        const request = https.get(url, {
            headers: { 'User-Agent': 'DailyWorkReportUpdater' }
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.rmSync(destinationFile, { force: true });
                response.resume();
                downloadFile(response.headers.location, destinationFile).then(resolve, reject);
                return;
            }

            if (response.statusCode < 200 || response.statusCode >= 300) {
                file.close();
                fs.rmSync(destinationFile, { force: true });
                response.resume();
                reject(new Error(`Khong tai duoc file cap nhat. GitHub tra ve loi ${response.statusCode}.`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(destinationFile));
            });
        });
        request.on('error', (error) => {
            file.close();
            fs.rmSync(destinationFile, { force: true });
            reject(error);
        });
    });
}

function normalizeVersion(version) {
    return String(version || '').replace(/^v/i, '').trim();
}

function compareVersions(left, right) {
    const leftParts = normalizeVersion(left).split('.').map((part) => Number(part) || 0);
    const rightParts = normalizeVersion(right).split('.').map((part) => Number(part) || 0);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

async function updateFromGithubRelease() {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const currentVersion = normalizeVersion(pkg.version || app.getVersion() || '0.0.0');
    const release = await requestGithubJson(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
    const latestVersion = normalizeVersion(release.tag_name || release.name || '');
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((item) => /setup.*\.exe$/i.test(item.name || '') && item.browser_download_url)
        || assets.find((item) => /\.exe$/i.test(item.name || '') && item.browser_download_url)
        || assets.find((item) => /win-unpacked\.zip$/i.test(item.name || '') && item.browser_download_url)
        || assets.find((item) => /\.zip$/i.test(item.name || '') && item.browser_download_url);

    if (!asset) {
        throw new Error('Khong tim thay file .exe hoac .zip trong GitHub Releases.');
    }

    if (latestVersion && compareVersions(latestVersion, currentVersion) <= 0) {
        return {
            mode: 'release',
            currentVersion,
            latestVersion,
            releaseUrl: release.html_url || GITHUB_REPO_URL,
            message: `Ban dang dung phien ban moi nhat (${currentVersion}).`
        };
    }

    const updatesDir = path.join(app.getPath('downloads'), 'DailyWorkReportUpdates');
    const safeAssetName = String(asset.name || `Daily Work Report-v${latestVersion || 'latest'}.exe`).replace(/[<>:"/\\|?*]/g, '_');
    const destinationFile = path.join(updatesDir, safeAssetName);
    await downloadFile(asset.browser_download_url, destinationFile);
    const assetType = /\.zip$/i.test(asset.name || '') ? 'zip' : 'exe';
    let installerStarted = false;
    if (assetType === 'exe') {
        spawn(destinationFile, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        }).unref();
        installerStarted = true;
        setTimeout(() => app.quit(), 1200);
    } else {
        shell.showItemInFolder(destinationFile);
    }

    return {
        mode: 'release',
        assetType,
        installerStarted,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url || GITHUB_REPO_URL,
        downloadedFile: destinationFile,
        assetName: asset.name,
        message: assetType === 'zip'
            ? `Da tai goi win-unpacked ${latestVersion || ''} ve: ${destinationFile}. Hay giai nen va chay Daily Work Report.exe.`
            : `Da tai ban cap nhat ${latestVersion || ''} ve: ${destinationFile}. Dang mo trinh cai dat va dong phan mem hien tai.`
    };
}

async function checkGithubReleaseUpdate() {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const currentVersion = normalizeVersion(pkg.version || app.getVersion() || '0.0.0');
    const release = await requestGithubJson(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
    const latestVersion = normalizeVersion(release.tag_name || release.name || '');
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((item) => /setup.*\.exe$/i.test(item.name || '') && item.browser_download_url)
        || assets.find((item) => /\.exe$/i.test(item.name || '') && item.browser_download_url)
        || assets.find((item) => /win-unpacked\.zip$/i.test(item.name || '') && item.browser_download_url)
        || assets.find((item) => /\.zip$/i.test(item.name || '') && item.browser_download_url);

    return {
        currentVersion,
        latestVersion,
        hasUpdate: Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0),
        releaseUrl: release.html_url || GITHUB_REPO_URL,
        releaseName: release.name || release.tag_name || '',
        body: release.body || '',
        assetName: asset && asset.name || '',
        assetType: asset && /\.zip$/i.test(asset.name || '') ? 'zip' : 'exe'
    };
}

async function updateFromGithub() {
    return updateFromGithubRelease();

    const before = await getGitInfo();
    const packageBefore = fs.existsSync(path.join(__dirname, 'package-lock.json'))
        ? fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8')
        : '';
    const pull = await execFileText('git', ['pull', '--ff-only']);
    const packageAfter = fs.existsSync(path.join(__dirname, 'package-lock.json'))
        ? fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8')
        : '';
    let installOutput = '';
    if (packageBefore !== packageAfter) {
        const install = await execFileText('npm.cmd', ['install'], { timeout: 120000 });
        installOutput = install.stdout || install.stderr || '';
    }
    const after = await getGitInfo();
    return {
        before,
        after,
        message: pull.stdout || pull.stderr || 'Đã kiểm tra cập nhật.',
        installOutput
    };
}

function getDataDir() {
    return path.join(app.getPath('userData'), 'data');
}

function getJsonFile() {
    return path.join(getDataDir(), 'work_reports.json');
}

function getSqliteFile() {
    return path.join(getDataDir(), 'work_reports.sqlite');
}

async function getSql() {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: (file) => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), file)
        });
    }

    return sqlPromise;
}

async function openReportsDb() {
    const SQL = await getSql();
    const sqliteFile = getSqliteFile();
    fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });

    const db = fs.existsSync(sqliteFile)
        ? new SQL.Database(fs.readFileSync(sqliteFile))
        : new SQL.Database();

    ensureReportsSchema(db);

    return { db, sqliteFile };
}

function ensureReportsSchema(db) {
    const tableInfo = db.exec("PRAGMA table_info(reports);");
    const columns = tableInfo[0] ? tableInfo[0].values.map((row) => row[1]) : [];

    if (columns.length && !columns.includes('report_index')) {
        db.run('ALTER TABLE reports RENAME TO reports_legacy;');
        createReportsTable(db);
        migrateLegacyReports(db);
        db.run('DROP TABLE reports_legacy;');
        createReportsIndexes(db);
        return;
    }

    createReportsTable(db);

    const updatedTableInfo = db.exec("PRAGMA table_info(reports);");
    const updatedColumns = updatedTableInfo[0] ? updatedTableInfo[0].values.map((row) => row[1]) : [];
    if (!updatedColumns.includes('thoi_gian')) {
        db.run('ALTER TABLE reports ADD COLUMN thoi_gian TEXT NOT NULL DEFAULT "[]";');
    }
    if (!updatedColumns.includes('thoi_gian_text')) {
        db.run('ALTER TABLE reports ADD COLUMN thoi_gian_text TEXT NOT NULL DEFAULT "";');
    }
    createReportsIndexes(db);
}

function createReportsTable(db) {
    db.run(`
        CREATE TABLE IF NOT EXISTS reports (
            report_index INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT UNIQUE,
            ma_du_an TEXT NOT NULL,
            noi_dung_cong_viec TEXT NOT NULL,
            noi_dung_text TEXT NOT NULL,
            thoi_gian TEXT NOT NULL DEFAULT '[]',
            thoi_gian_text TEXT NOT NULL DEFAULT '',
            nguoi_thuc_hien TEXT NOT NULL,
            nguoi_text TEXT NOT NULL,
            trang_thai TEXT NOT NULL,
            trang_thai_text TEXT NOT NULL,
            ngay_thuc_hien TEXT,
            folder_ngay TEXT,
            folder_nguoi TEXT,
            folder_nguoi_text TEXT,
            raw_text TEXT,
            excel_exported INTEGER DEFAULT 0,
            excel_file TEXT,
            excel_sheet TEXT,
            created_at TEXT
        );
    `);

}

function createReportsIndexes(db) {
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_ma_du_an ON reports(ma_du_an);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_ngay ON reports(ngay_thuc_hien);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_nguoi_text ON reports(nguoi_text);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_noi_dung_text ON reports(noi_dung_text);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_thoi_gian_text ON reports(thoi_gian_text);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_trang_thai_text ON reports(trang_thai_text);');
}

function migrateLegacyReports(db) {
    const result = db.exec('SELECT * FROM reports_legacy;');
    if (!result[0]) return;

    const columns = result[0].columns;
    const insert = db.prepare(`
        INSERT INTO reports (
            id, ma_du_an, noi_dung_cong_viec, noi_dung_text,
            thoi_gian, thoi_gian_text, nguoi_thuc_hien, nguoi_text, trang_thai, trang_thai_text,
            ngay_thuc_hien, folder_ngay, folder_nguoi, folder_nguoi_text,
            raw_text, excel_exported, excel_file, excel_sheet, created_at
        ) VALUES (
            $id, $ma_du_an, $noi_dung_cong_viec, $noi_dung_text,
            $thoi_gian, $thoi_gian_text, $nguoi_thuc_hien, $nguoi_text, $trang_thai, $trang_thai_text,
            $ngay_thuc_hien, $folder_ngay, $folder_nguoi, $folder_nguoi_text,
            $raw_text, $excel_exported, $excel_file, $excel_sheet, $created_at
        );
    `);

    result[0].values.forEach((values) => {
        const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
        insert.run(reportToDbParams(rowToReport(row)));
    });

    insert.free();
}

function saveDb(db, sqliteFile) {
    fs.writeFileSync(sqliteFile, Buffer.from(db.export()));
    db.close();
}

function serializeList(value) {
    return JSON.stringify(Array.isArray(value) ? value : []);
}

function deserializeList(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function listText(value, mapper = (item) => item) {
    const list = Array.isArray(value) ? value : [];
    return list.map(mapper).filter(Boolean).join('; ');
}

function comparableText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function comparableList(value) {
    return (Array.isArray(value) ? value : [value])
        .map((item) => comparableText(item))
        .filter(Boolean)
        .join('\n');
}

function comparablePeople(value) {
    return (Array.isArray(value) ? value : [value])
        .map((person) => {
            if (typeof person === 'string') return person;
            return person && (person.displayName || person.name || person.folderName || '');
        })
        .map(comparableText)
        .filter(Boolean)
        .sort()
        .join('\n');
}

function reportDuplicateFingerprint(report) {
    return [
        normalizeProjectCode(report && report.ma_du_an),
        comparableList(report && report.noi_dung_cong_viec),
        comparableList(report && report.thoi_gian),
        comparablePeople(report && report.nguoi_thuc_hien),
        comparableList(report && report.trang_thai),
        comparableText(report && report.ngay_thuc_hien)
    ].join('||');
}

function sanitizeFolderName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .trim();
}

function reportToDbParams(report) {
    const peopleText = listText(report.nguoi_thuc_hien, (person) => person.displayName || person);
    const contentText = listText(report.noi_dung_cong_viec);
    const timeText = listText(report.thoi_gian);
    const statusText = listText(report.trang_thai);
    const folderPeopleText = listText(report.folder_nguoi);

    return {
        $id: report.id,
        $ma_du_an: report.ma_du_an || '',
        $noi_dung_cong_viec: serializeList(report.noi_dung_cong_viec),
        $noi_dung_text: contentText,
        $thoi_gian: serializeList(report.thoi_gian),
        $thoi_gian_text: timeText,
        $nguoi_thuc_hien: serializeList(report.nguoi_thuc_hien),
        $nguoi_text: peopleText,
        $trang_thai: serializeList(report.trang_thai),
        $trang_thai_text: statusText,
        $ngay_thuc_hien: report.ngay_thuc_hien || '',
        $folder_ngay: report.folder_ngay || '',
        $folder_nguoi: serializeList(report.folder_nguoi),
        $folder_nguoi_text: folderPeopleText,
        $raw_text: report.raw_text || '',
        $excel_exported: report.excel_exported ? 1 : 0,
        $excel_file: report.excel_file || null,
        $excel_sheet: report.excel_sheet || null,
        $created_at: report.created_at || new Date().toISOString()
    };
}

function rowToReport(row) {
    return {
        report_index: row.report_index,
        id: row.id,
        ma_du_an: row.ma_du_an,
        noi_dung_cong_viec: deserializeList(row.noi_dung_cong_viec),
        thoi_gian: deserializeList(row.thoi_gian),
        nguoi_thuc_hien: deserializeList(row.nguoi_thuc_hien),
        trang_thai: deserializeList(row.trang_thai),
        ngay_thuc_hien: row.ngay_thuc_hien,
        folder_ngay: row.folder_ngay,
        folder_nguoi: deserializeList(row.folder_nguoi),
        raw_text: row.raw_text,
        excel_exported: Boolean(row.excel_exported),
        excel_file: row.excel_file,
        excel_sheet: row.excel_sheet,
        created_at: row.created_at
    };
}

async function insertReportsSqlite(reports) {
    const { db, sqliteFile } = await openReportsDb();
    const stmt = db.prepare(`
        INSERT INTO reports (
            id, ma_du_an, noi_dung_cong_viec, noi_dung_text,
            thoi_gian, thoi_gian_text, nguoi_thuc_hien, nguoi_text, trang_thai, trang_thai_text,
            ngay_thuc_hien, folder_ngay, folder_nguoi, folder_nguoi_text, raw_text,
            excel_exported, excel_file, excel_sheet, created_at
        ) VALUES (
            $id, $ma_du_an, $noi_dung_cong_viec, $noi_dung_text,
            $thoi_gian, $thoi_gian_text, $nguoi_thuc_hien, $nguoi_text, $trang_thai, $trang_thai_text,
            $ngay_thuc_hien, $folder_ngay, $folder_nguoi, $folder_nguoi_text, $raw_text,
            $excel_exported, $excel_file, $excel_sheet, $created_at
        );
    `);

    db.run('BEGIN TRANSACTION;');
    reports.forEach((report) => stmt.run(reportToDbParams(report)));
    stmt.free();
    db.run('COMMIT;');
    saveDb(db, sqliteFile);
    return sqliteFile;
}

async function loadReportsSqlite() {
    const { db, sqliteFile } = await openReportsDb();
    const result = db.exec(`
        SELECT *
        FROM reports
        ORDER BY report_index DESC;
    `);
    const rows = result[0]
        ? result[0].values.map((values) => Object.fromEntries(result[0].columns.map((column, index) => [column, values[index]])))
        : [];
    db.close();
    return { sqliteFile, reports: rows.map(rowToReport) };
}

async function queryReportsSqlite(query = {}) {
    const { db, sqliteFile } = await openReportsDb();
    const clauses = [];
    const params = {};

    if (query.ma_du_an) {
        clauses.push('ma_du_an LIKE $ma_du_an');
        params.$ma_du_an = `%${query.ma_du_an}%`;
    }
    if (query.nguoi) {
        clauses.push('nguoi_text LIKE $nguoi');
        params.$nguoi = `%${query.nguoi}%`;
    }
    if (query.noi_dung) {
        clauses.push('noi_dung_text LIKE $noi_dung');
        params.$noi_dung = `%${query.noi_dung}%`;
    }
    if (query.thoi_gian) {
        clauses.push('thoi_gian_text LIKE $thoi_gian');
        params.$thoi_gian = `%${query.thoi_gian}%`;
    }
    if (query.trang_thai) {
        clauses.push('trang_thai_text LIKE $trang_thai');
        params.$trang_thai = `%${query.trang_thai}%`;
    }
    if (query.ngay) {
        clauses.push('ngay_thuc_hien = $ngay');
        params.$ngay = query.ngay;
    }

    const sql = `
        SELECT *
        FROM reports
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY report_index DESC;
    `;
    const stmt = db.prepare(sql);
    stmt.bind(params);

    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    db.close();
    return { sqliteFile, reports: rows.map(rowToReport) };
}

async function queryReportsByExactProject(project) {
    const result = await queryReportsSqlite({});
    const projectKey = normalizeProjectCode(project);
    return {
        sqliteFile: result.sqliteFile,
        reports: result.reports.filter((report) => normalizeProjectCode(report.ma_du_an) === projectKey)
    };
}

async function queryReportsByDateRange(dateFrom, dateTo) {
    const { db, sqliteFile } = await openReportsDb();
    const stmt = db.prepare(`
        SELECT *
        FROM reports
        WHERE ngay_thuc_hien >= $dateFrom
          AND ngay_thuc_hien <= $dateTo
        ORDER BY ngay_thuc_hien ASC, report_index ASC;
    `);
    stmt.bind({ $dateFrom: dateFrom, $dateTo: dateTo });

    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    db.close();
    return { sqliteFile, reports: rows.map(rowToReport) };
}

async function deleteReportsData(options = {}) {
    const dataFile = getJsonFile();
    const { db, sqliteFile } = await openReportsDb();
    const deleteAll = Boolean(options.all);
    const ids = Array.isArray(options.ids) ? options.ids.map((id) => String(id || '')).filter(Boolean) : [];
    const beforeCountResult = db.exec('SELECT COUNT(*) AS count FROM reports;');
    const beforeCount = beforeCountResult[0] ? Number(beforeCountResult[0].values[0][0]) || 0 : 0;

    if (deleteAll) {
        db.run('DELETE FROM reports;');
    } else if (ids.length) {
        const stmt = db.prepare('DELETE FROM reports WHERE id = $id;');
        db.run('BEGIN TRANSACTION;');
        ids.forEach((id) => stmt.run({ $id: id }));
        stmt.free();
        db.run('COMMIT;');
    }

    saveDb(db, sqliteFile);

    const result = await loadReportsSqlite();
    return {
        dataFile,
        sqliteFile: result.sqliteFile,
        reports: result.reports,
        deleted: deleteAll ? beforeCount : ids.length
    };
}

function formatReportFileDate(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}`;
}

function formatReportTitleDate(isoDate) {
    const date = new Date(`${isoDate}T00:00:00`);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}`;
}

function normalizeProjectCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cellDisplayText(cell) {
    const value = cell && cell.value;
    if (value && typeof value === 'object') {
        if (value.result !== undefined && value.result !== null) return String(value.result);
        if (value.text) return String(value.text);
        if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
        if (value.hyperlink && value.text) return String(value.text);
    }
    return value === undefined || value === null ? '' : String(value);
}

function normalizeReferenceSheetName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0111/g, 'd')
        .replace(/\u0110/g, 'D')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
}

async function loadMachineReference() {
    if (machineReferenceCache) return machineReferenceCache;
    const reference = {};
    if (!fs.existsSync(MACHINE_REFERENCE_FILE)) {
        machineReferenceCache = reference;
        return reference;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(MACHINE_REFERENCE_FILE);
    const sheet = workbook.worksheets.find((worksheet) => (
        normalizeReferenceSheetName(worksheet.name) === MACHINE_REFERENCE_SHEET_KEY
    )) || workbook.worksheets[0];
    if (!sheet) {
        machineReferenceCache = reference;
        return reference;
    }

    for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const code = cellDisplayText(row.getCell('B')).trim();
        const key = normalizeProjectCode(code);
        if (!key || key === '-') continue;
        reference[key] = {
            machineName: cellDisplayText(row.getCell('AD')).trim(),
            projectName: cellDisplayText(row.getCell('AC')).trim()
        };
    }

    machineReferenceCache = reference;
    return reference;
}

async function enrichReportsWithMachineReference(reports) {
    const reference = await loadMachineReference();
    return reports.map((report) => {
        const info = reference[normalizeProjectCode(report.ma_du_an)] || {};
        return {
            ...report,
            ten_may: info.machineName || '',
            ghi_chu: info.projectName || ''
        };
    });
}

async function lookupMachineReferenceByProjects(projects) {
    const reference = await loadMachineReference();
    const referenceCodes = Object.keys(reference);
    return (projects || []).map((project) => {
        const code = String(project || '').trim();
        const key = normalizeProjectCode(code);
        const info = reference[key] || {};
        const lookupKeys = projectLookupCandidates(code);
        return {
            project: code,
            found: Boolean(reference[key]),
            ten_may: info.machineName || '',
            ghi_chu: info.projectName || '',
            suggestions: reference[key] ? [] : buildProjectSuggestions(lookupKeys, referenceCodes, reference)
        };
    });
}

function buildProjectSuggestions(projectKeys, referenceCodes, reference) {
    const keys = (Array.isArray(projectKeys) ? projectKeys : [projectKeys])
        .map(normalizeProjectCode)
        .filter(Boolean);
    if (!keys.length) return [];
    return referenceCodes
        .map((code) => {
            const score = Math.max(...keys.map((projectKey) => projectSimilarityScore(projectKey, code)));
            return {
                code,
                score,
                info: reference[code] || {}
            };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
        .slice(0, 8)
        .map((item) => ({
            project: item.code,
            ten_may: item.info.machineName || '',
            ghi_chu: item.info.projectName || ''
        }));
}

function projectLookupCandidates(text) {
    const raw = String(text || '').toUpperCase();
    const candidates = new Set();
    const direct = normalizeProjectCode(raw);
    if (direct && direct.length <= 24) candidates.add(direct);

    const codePattern = /\b(?:AUT[A-Z]?|MEC)\s*[:\-]?\s*[A-Z0-9]{4,12}\b/gi;
    let match;
    while ((match = codePattern.exec(raw)) !== null) {
        const code = normalizeProjectCode(match[0]);
        if (code) candidates.add(code);
    }

    const prefixGroupPattern = /\b(AUT[A-Z]?|MEC)\s*[:：]\s*([A-Z0-9,\s.\-]{4,60})/gi;
    while ((match = prefixGroupPattern.exec(raw)) !== null) {
        const prefix = normalizeProjectCode(match[1]);
        String(match[2] || '')
            .split(/[,;.\s]+/)
            .map(normalizeProjectCode)
            .filter((part) => part.length >= 4 && part.length <= 12)
            .forEach((part) => candidates.add(`${prefix}${part}`));
    }

    if (!candidates.size && direct) candidates.add(direct.slice(0, 24));
    return [...candidates];
}

function projectSimilarityScore(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1000;
    const prefixA = (a.match(/^[A-Z]+/) || [''])[0];
    const prefixB = (b.match(/^[A-Z]+/) || [''])[0];
    const digitA = a.replace(/^[A-Z]+/, '');
    const digitB = b.replace(/^[A-Z]+/, '');
    const compactA = projectComparableCore(a);
    const compactB = projectComparableCore(b);
    const commonPrefix = commonPrefixLength(a, b);
    const commonDigitPrefix = commonPrefixLength(digitA, digitB);
    const commonCorePrefix = commonPrefixLength(compactA, compactB);
    const commonCoreSuffix = commonSuffixLength(compactA, compactB);
    const contains = a.includes(b) || b.includes(a) ? 80 : 0;
    const coreContains = compactA && compactB && (compactA.includes(compactB) || compactB.includes(compactA)) ? 180 : 0;
    const coreExact = compactA && compactB && compactA === compactB ? 520 : 0;
    const coreVariantExact = !coreExact ? projectCoreVariantExactScore(compactA, compactB) : 0;
    const samePrefix = prefixA && prefixA === prefixB ? 70 : 0;
    const crossKnownPrefix = prefixA && prefixB && prefixA !== prefixB && isKnownProjectPrefix(prefixA) && isKnownProjectPrefix(prefixB) ? 35 : 0;
    const distance = levenshteinDistance(a, b);
    const distanceScore = Math.max(0, 80 - distance * 10);
    const coreDistance = compactA && compactB ? projectCoreDistance(compactA, compactB) : 99;
    const coreDistanceScore = Math.max(0, 220 - coreDistance * 36);
    const lengthPenalty = Math.abs(String(compactA).length - String(compactB).length) * 8;
    return samePrefix
        + crossKnownPrefix
        + coreExact
        + coreVariantExact
        + commonPrefix * 8
        + commonDigitPrefix * 16
        + commonCorePrefix * 22
        + commonCoreSuffix * 18
        + contains
        + coreContains
        + distanceScore
        + coreDistanceScore
        - lengthPenalty;
}

function commonPrefixLength(a, b) {
    let index = 0;
    while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
    return index;
}

function commonSuffixLength(a, b) {
    let count = 0;
    while (
        count < a.length
        && count < b.length
        && a[a.length - 1 - count] === b[b.length - 1 - count]
    ) {
        count += 1;
    }
    return count;
}

function isKnownProjectPrefix(prefix) {
    return /^(?:AUT[A-Z]?|MEC)$/.test(String(prefix || '').toUpperCase());
}

function projectComparableCore(project) {
    const text = String(project || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const withoutPrefix = text.replace(/^(?:AUT[A-Z]?|MEC)/, '');
    const digits = withoutPrefix.replace(/[^0-9]/g, '');
    if (digits.length >= 4) return digits;
    return withoutPrefix || text;
}

function projectCoreVariantExactScore(a, b) {
    if (!a || !b) return 0;
    return Math.max(projectCoreDeletionScore(a, b), projectCoreDeletionScore(b, a));
}

function projectCoreDeletionScore(longer, target) {
    if (!longer || !target || longer.length <= target.length) return 0;
    let best = 0;
    for (let index = 0; index < longer.length; index += 1) {
        const variant = `${longer.slice(0, index)}${longer.slice(index + 1)}`;
        if (variant === target) {
            best = Math.max(best, longer[index] === '0' ? 620 : 360);
        }
    }
    return best;
}

function projectCoreDistance(a, b) {
    const variantsA = projectCoreVariants(a);
    const variantsB = projectCoreVariants(b);
    let best = levenshteinDistance(a, b);
    variantsA.forEach((variant) => {
        best = Math.min(best, levenshteinDistance(variant, b));
    });
    variantsB.forEach((variant) => {
        best = Math.min(best, levenshteinDistance(a, variant));
    });
    return best;
}

function projectCoreVariants(core) {
    const text = String(core || '');
    const variants = new Set([text]);
    for (let index = 0; index < text.length; index += 1) {
        variants.add(`${text.slice(0, index)}${text.slice(index + 1)}`);
    }
    return variants;
}

function levenshteinDistance(a, b) {
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length];
}

function normalizeWeeklyRows(rows) {
    const projectSeen = new Set();
    const normalizedRows = [];
    rows.forEach((row) => {
        const project = row.ma_du_an || row.du_an || '';
        const projectKey = String(project || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!projectKey || projectSeen.has(projectKey)) return;
        if (projectKey) projectSeen.add(projectKey);
        normalizedRows.push({
            ...row,
            stt: normalizedRows.length + 1,
            hang_muc: normalizeWeeklyCategory(row.hang_muc || 'Lắp máy mới'),
            ten_may: row.ten_may || '',
            du_an: project,
            noi_dung: Array.isArray(row.noi_dung_cong_viec) ? row.noi_dung_cong_viec : (Array.isArray(row.noi_dung) ? row.noi_dung : []),
            tien_do: Array.isArray(row.trang_thai) ? row.trang_thai : (Array.isArray(row.tien_do) ? row.tien_do : []),
            kho_khan: row.kho_khan || '',
            huong_giai_quyet: row.huong_giai_quyet || '',
            ghi_chu: row.ghi_chu || '',
            thong_tin_khac: row.thong_tin_khac || '',
            row_height: Number(row.row_height) || 0
        });
    });
    return normalizedRows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => weeklyCategoryOrder(a.row.hang_muc) - weeklyCategoryOrder(b.row.hang_muc) || a.index - b.index)
        .map((item, index) => ({
            ...item.row,
            stt: index + 1
        }));
}

function normalizeWeeklyCategory(category) {
    const normalized = String(category || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
    if (normalized === 'setup' || normalized === 'lap dat' || normalized === 'lap dat tai line') return 'Lắp đặt tại line';
    if (normalized === 'chinh may') return 'Chỉnh máy';
    if (normalized === 'sua' || normalized === 'sua may') return 'Sửa máy';
    if (normalized === 'ho tro') return 'Hỗ trợ';
    if (normalized === 'lap moi' || normalized === 'lap may moi') return 'Lắp máy mới';
    return 'Lắp máy mới';
}

function weeklyCategoryOrder(category) {
    const normalized = normalizeWeeklyCategory(category);
    return ['Lắp máy mới', 'Chỉnh máy', 'Lắp đặt tại line', 'Sửa máy', 'Hỗ trợ'].indexOf(normalized);
}

function normalizeWeeklyColumns(columns) {
    const fallback = [
        { id: 'stt', label: 'STT', width: 44 },
        { id: 'hang_muc', label: 'HẠNG\nMỤC', width: 132 },
        { id: 'ten_may', label: 'TÊN MÁY', width: 190 },
        { id: 'du_an', label: 'DỰ ÁN', width: 210 },
        { id: 'noi_dung', label: 'NỘI DUNG CÔNG VIỆC', width: 322 },
        { id: 'tien_do', label: 'TIẾN ĐỘ CÔNG VIỆC', width: 170 },
        { id: 'kho_khan', label: 'KHÓ KHĂN', width: 230 },
        { id: 'huong_giai_quyet', label: 'HƯỚNG GIẢI QUYẾT', width: 230 },
        { id: 'ghi_chu', label: 'GHI CHÚ', width: 240 },
        { id: 'thong_tin_khac', label: 'THÔNG TIN KHÁC', width: 214 }
    ];
    const source = Array.isArray(columns) && columns.length ? columns : fallback;
    return source
        .filter((column) => column && column.id && column.label)
        .map((column) => ({
            id: String(column.id),
            label: String(column.label),
            width: Math.min(Math.max(Number(column.width) || 160, 52), 520)
        }));
}

function excelColumnLetter(index) {
    let value = index;
    let letter = '';
    while (value > 0) {
        const mod = (value - 1) % 26;
        letter = String.fromCharCode(65 + mod) + letter;
        value = Math.floor((value - mod) / 26);
    }
    return letter;
}

function listToNumberedText(items) {
    return (items || [])
        .map((item, index) => `${index + 1}. ${normalizeSentence(item)}`)
        .join('\n');
}

function excelFallbackValue(value) {
    if (Array.isArray(value)) {
        const text = value.filter(Boolean).join('\n').trim();
        return text || 'N/A';
    }
    const text = String(value ?? '').trim();
    return text || 'N/A';
}

function normalizeSentence(text) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function applyCellBaseStyle(cell, options = {}) {
    cell.font = {
        name: 'Times New Roman',
        size: options.size || 12,
        bold: Boolean(options.bold),
        color: options.color ? { argb: options.color } : undefined
    };
    cell.alignment = {
        vertical: 'middle',
        horizontal: options.horizontal || 'center',
        wrapText: true
    };
    cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };
}

function categoryFillColor(category) {
    const normalized = String(category || '').trim().toLowerCase();
    if (normalized === 'chỉnh máy' || normalized === 'chinh may') return 'FFFFFF00';
    if (normalized === 'sửa' || normalized === 'sua' || normalized === 'sửa máy' || normalized === 'sua may') return 'FFFF0000';
    if (normalized === 'setup' || normalized === 'lắp đặt' || normalized === 'lap dat' || normalized === 'lắp đặt tại line' || normalized === 'lap dat tai line') return 'FFFFA500';
    if (normalized === 'hỗ trợ' || normalized === 'ho tro') return 'FFD9D9D9';
    if (normalized === 'lắp mới' || normalized === 'lap moi' || normalized === 'lắp máy mới' || normalized === 'lap may moi') return 'FF5B9BD5';
    return 'FFFFFFFF';
}

function categoryFontColor(category) {
    const normalized = String(category || '').trim().toLowerCase();
    return normalized === 'sửa' || normalized === 'sua' || normalized === 'sửa máy' || normalized === 'sua may'
        || normalized === 'lắp mới' || normalized === 'lap moi' || normalized === 'lắp máy mới' || normalized === 'lap may moi'
        ? 'FFFFFFFF'
        : 'FF000000';
}

function weeklyCategoryKey(category) {
    return normalizeReferenceSheetName(category);
}

function isSetupLineInstallCategory(category) {
    const key = weeklyCategoryKey(category);
    return key === 'lapdattailine' || key === 'lapdat' || key === 'setup';
}

function isSetupRepairCategory(category) {
    const key = weeklyCategoryKey(category);
    return key === 'suamay' || key === 'sua';
}

function setMergedTitle(sheet, dateFrom, dateTo) {
    safeMergeCells(sheet, 'C1:H3');
    const title = sheet.getCell('C1');
    title.value = `BÁO CÁO SẢN XUẤT TUẦN (${formatReportTitleDate(dateFrom)} ~ ${formatReportTitleDate(dateTo)})`;
    title.font = { name: 'Times New Roman', size: 20, bold: true, color: { argb: 'FFFF0000' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
}

function safeMergeCells(sheet, range) {
    try {
        sheet.mergeCells(range);
    } catch (error) {
        if (!String(error && error.message).includes('already merged')) {
            throw error;
        }
    }
}

async function addImageToSheet(workbook, sheet, imagePath, range) {
    if (!imagePath || !fs.existsSync(imagePath)) return;
    const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'png';
    const imageId = workbook.addImage({ filename: imagePath, extension: ext === 'jpg' ? 'jpeg' : ext });
    sheet.addImage(imageId, range);
}

function keepOnlyWorksheet(workbook, worksheet) {
    [...workbook.worksheets].forEach((sheet) => {
        if (sheet.id !== worksheet.id) {
            workbook.removeWorksheet(sheet.id);
        }
    });
}

function clearTemplateDataRows(sheet) {
    const firstDataRow = 5;
    const lastRow = Math.max(sheet.rowCount, 120);
    for (let rowNumber = firstDataRow; rowNumber <= lastRow; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        for (let col = 1; col <= 8; col += 1) {
            const cell = row.getCell(col);
            cell.value = null;
        }
    }
}

function cloneStyle(style) {
    return JSON.parse(JSON.stringify(style || {}));
}

function captureRowStyle(row) {
    const styles = [];
    for (let col = 1; col <= 8; col += 1) {
        styles[col] = cloneStyle(row.getCell(col).style);
    }
    return {
        height: row.height,
        styles
    };
}

function applyRowStyle(row, templateStyle) {
    if (!templateStyle) return;
    if (templateStyle.height) {
        row.height = templateStyle.height;
    }
    for (let col = 1; col <= 8; col += 1) {
        row.getCell(col).style = cloneStyle(templateStyle.styles[col]);
    }
}

function groupWeeklyExportImages(images, imageGroups) {
    const groupMap = new Map((imageGroups || []).map((group) => [group.id, {
        id: group.id,
        title: group.title || '',
        description: group.description || '',
        images: []
    }]));

    images.forEach((image) => {
        const groupId = image.groupId || 'ungrouped';
        if (!groupMap.has(groupId)) {
            groupMap.set(groupId, {
                id: groupId,
                title: groupId === 'ungrouped' ? 'Chưa phân nhóm' : 'Nhóm ảnh',
                description: image.description || '',
                images: []
            });
        }
        const group = groupMap.get(groupId);
        if (!group.description && image.description) group.description = image.description;
        group.images.push(image);
    });

    return [...groupMap.values()]
        .filter((group) => group.images.length)
        .sort((a, b) => {
            if (a.id === 'ungrouped') return -1;
            if (b.id === 'ungrouped') return 1;
            return 0;
        });
}

function getUniqueOutputPath(outputDir, fileName) {
    const parsed = path.parse(fileName);
    let candidate = path.join(outputDir, fileName);
    let index = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(outputDir, `${parsed.name} (${index})${parsed.ext}`);
        index += 1;
    }
    return candidate;
}

function defaultZaloDownloadCandidates() {
    const home = app.getPath('home');
    return [
        path.join(app.getPath('downloads'), 'Zalo Received Files'),
        path.join(app.getPath('documents'), 'Zalo Received Files'),
        path.join(home, 'OneDrive', 'Documents', 'Zalo Received Files'),
        path.join(home, 'OneDrive', 'Downloads', 'Zalo Received Files')
    ];
}

function findDefaultZaloDownloadFolder() {
    return defaultZaloDownloadCandidates().find((folder) => fs.existsSync(folder) && fs.statSync(folder).isDirectory()) || '';
}

function isZaloImageFile(filePath) {
    try {
        return fs.statSync(filePath).isFile() && ZALO_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    } catch {
        return false;
    }
}

function uniqueMoveTarget(destinationFolder, fileName) {
    const parsed = path.parse(fileName);
    let candidate = path.join(destinationFolder, fileName);
    let index = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(destinationFolder, `${parsed.name} (${index})${parsed.ext}`);
        index += 1;
    }
    return candidate;
}

function moveFileSafe(sourceFile, destinationFolder) {
    fs.mkdirSync(destinationFolder, { recursive: true });
    const target = uniqueMoveTarget(destinationFolder, path.basename(sourceFile));
    try {
        fs.renameSync(sourceFile, target);
    } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        fs.copyFileSync(sourceFile, target);
        fs.unlinkSync(sourceFile);
    }
    return target;
}

function notifyRenderer(channel, payload) {
    BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
            window.webContents.send(channel, payload);
        }
    });
}

function notifyZaloImageMoved(payload) {
    notifyRenderer('zalo-image-moved', payload);
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: 'Daily Work Report',
            body: 'Đã chuyển',
            icon: APP_ICON_FILE,
            silent: false
        });
        notification.show();
    }
}

const EXPLORER_FOLDER_PROBE_SCRIPT = String.raw`
$signature = @"
using System;
using System.Runtime.InteropServices;
public static class Win32Foreground {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
"@
try { Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue } catch {}
$foreground = [Win32Foreground]::GetForegroundWindow().ToInt64()
$shell = New-Object -ComObject Shell.Application
$items = @()
foreach ($window in @($shell.Windows())) {
    try {
        $path = $window.Document.Folder.Self.Path
        if ($path) {
            $isActive = ([int64]$window.HWND -eq $foreground)
            $items += [pscustomobject]@{
                Active = $isActive
                Path = $path
            }
        }
    } catch {}
}
$items | Sort-Object @{ Expression = 'Active'; Descending = $true }, Path | ForEach-Object {
    if ($_.Active) { "__ACTIVE__|$($_.Path)" } else { $_.Path }
}
`;

async function runExplorerFolderProbeThroughShell() {
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tempDir = app.getPath('temp');
    const ps1Path = path.join(tempDir, `daily-work-report-explorer-probe-${token}.ps1`);
    const vbsPath = path.join(tempDir, `daily-work-report-explorer-probe-${token}.vbs`);
    const outputPath = path.join(tempDir, `daily-work-report-explorer-probe-${token}.txt`);
    const ps1 = `
param([string]$OutputFile)
${EXPLORER_FOLDER_PROBE_SCRIPT}
$lines = @($items | Sort-Object @{ Expression = 'Active'; Descending = $true }, Path | ForEach-Object {
    if ($_.Active) { "__ACTIVE__|$($_.Path)" } else { $_.Path }
})
$encoding = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($OutputFile, [string[]]$lines, $encoding)
`;
    const vbs = `
Option Explicit
Function Q(value)
    Q = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
Dim shell, command
Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File " & Q("${ps1Path.replace(/\\/g, '\\\\')}") & " " & Q("${outputPath.replace(/\\/g, '\\\\')}")
shell.Run command, 0, True
`;
    try {
        fs.writeFileSync(ps1Path, ps1, 'utf8');
        fs.writeFileSync(vbsPath, vbs, 'utf8');
        spawn('explorer.exe', [vbsPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        }).unref();
        const startedAt = Date.now();
        while (Date.now() - startedAt < 2200) {
            if (fs.existsSync(outputPath)) {
                const output = fs.readFileSync(outputPath, 'utf8');
                return output;
            }
            await wait(80);
        }
    } catch {
        // Fall back to the direct probe result.
    } finally {
        setTimeout(() => {
            [ps1Path, vbsPath, outputPath].forEach((filePath) => {
                try {
                    fs.rmSync(filePath, { force: true });
                } catch {}
            });
        }, 5000);
    }
    return '';
}

async function getOpenExplorerFolders() {
    if (process.platform !== 'win32') return [];
    try {
        const result = await execFileText('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-Command', EXPLORER_FOLDER_PROBE_SCRIPT], { timeout: 4000 });
        const directFolders = parseExplorerFolderLines(result.stdout);
        if (directFolders.length) return directFolders;
        const brokerOutput = await runExplorerFolderProbeThroughShell();
        return parseExplorerFolderLines(brokerOutput);
    } catch {
        const brokerOutput = await runExplorerFolderProbeThroughShell();
        return parseExplorerFolderLines(brokerOutput);
    }
}

async function getCurrentExplorerDestination(sourceFolder) {
    const folders = await getOpenExplorerFolders();
    zaloAutoMoveState.openExplorerFolders = folders;
    zaloAutoMoveState.lastExplorerScanAt = Date.now();
    const source = sourceFolder ? path.resolve(sourceFolder) : '';
    const validFolders = folders.filter((folder) => {
        try {
            return fs.existsSync(folder) && fs.statSync(folder).isDirectory() && path.resolve(folder) !== source;
        } catch {
            return false;
        }
    });

    if (
        zaloAutoMoveState.activeExplorerFolder
        && validFolders.some((folder) => path.resolve(folder).toLowerCase() === path.resolve(zaloAutoMoveState.activeExplorerFolder).toLowerCase())
    ) {
        return zaloAutoMoveState.activeExplorerFolder;
    }

    return validFolders[0] || '';
}

function getZaloAutoMoveStatus() {
    return {
        enabled: zaloAutoMoveState.enabled,
        sourceFolder: zaloAutoMoveState.sourceFolder,
        fallbackFolder: zaloAutoMoveState.fallbackFolder,
        useActiveExplorer: zaloAutoMoveState.useActiveExplorer,
        movedCount: zaloAutoMoveState.movedCount,
        lastDestination: zaloAutoMoveState.lastDestination,
        activeExplorerFolder: zaloAutoMoveState.activeExplorerFolder,
        openExplorerFolders: zaloAutoMoveState.openExplorerFolders,
        lastMessage: zaloAutoMoveState.lastMessage,
        lastError: zaloAutoMoveState.lastError
    };
}

function stopZaloAutoMove() {
    if (zaloAutoMoveState.timer) clearInterval(zaloAutoMoveState.timer);
    if (zaloAutoMoveState.watcher) {
        try {
            zaloAutoMoveState.watcher.close();
        } catch {}
    }
    zaloAutoMoveState.timer = null;
    zaloAutoMoveState.watcher = null;
    zaloAutoMoveState.pollRequested = false;
    zaloAutoMoveState.pollAgain = false;
    zaloAutoMoveState.enabled = false;
    zaloAutoMoveState.busy = false;
    zaloAutoMoveState.lastMessage = 'Đã tắt tự chuyển ảnh Zalo.';
    return getZaloAutoMoveStatus();
}

function requestZaloPoll(delayMs = 0) {
    if (!zaloAutoMoveState.enabled) return;
    if (zaloAutoMoveState.pollRequested || zaloAutoMoveState.busy) {
        zaloAutoMoveState.pollAgain = true;
        return;
    }
    zaloAutoMoveState.pollRequested = true;
    setTimeout(async () => {
        zaloAutoMoveState.pollRequested = false;
        await pollZaloDownloadFolder();
    }, delayMs);
}

function seedZaloSeenFiles(sourceFolder) {
    zaloAutoMoveState.seen = new Set();
    zaloAutoMoveState.pending = new Map();
    if (!sourceFolder || !fs.existsSync(sourceFolder)) return;
    const now = Date.now();
    fs.readdirSync(sourceFolder).forEach((fileName) => {
        const filePath = path.join(sourceFolder, fileName);
        if (!isZaloImageFile(filePath)) return;
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 15000) {
            zaloAutoMoveState.seen.add(path.resolve(filePath));
        } else {
            zaloAutoMoveState.pending.set(path.resolve(filePath), {
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                firstSeenAt: now - 300
            });
        }
    });
}

async function refreshZaloExplorerCache() {
    if (!zaloAutoMoveState.enabled) return;
    const folders = await getOpenExplorerFolders();
    zaloAutoMoveState.openExplorerFolders = folders;
    zaloAutoMoveState.lastExplorerScanAt = Date.now();
    const source = zaloAutoMoveState.sourceFolder ? path.resolve(zaloAutoMoveState.sourceFolder) : '';
    const validFolders = folders.filter((folder) => {
        try {
            return fs.existsSync(folder) && fs.statSync(folder).isDirectory() && path.resolve(folder) !== source;
        } catch {
            return false;
        }
    });
    if (validFolders.length === 1) {
        zaloAutoMoveState.lastDestination = validFolders[0];
    } else if (zaloAutoMoveState.lastDestination && !validFolders.some((folder) => path.resolve(folder) === path.resolve(zaloAutoMoveState.lastDestination))) {
        zaloAutoMoveState.lastDestination = '';
    }
}

async function pollZaloDownloadFolder() {
    if (zaloAutoMoveState.busy || !zaloAutoMoveState.enabled) return;
    zaloAutoMoveState.busy = true;
    try {
        const sourceFolder = zaloAutoMoveState.sourceFolder;
        if (!sourceFolder || !fs.existsSync(sourceFolder)) {
            zaloAutoMoveState.lastError = 'Không tìm thấy thư mục tải Zalo.';
            return;
        }

        const destination = await getCurrentExplorerDestination(sourceFolder);
        if (destination) {
            zaloAutoMoveState.lastDestination = destination;
        }

        const now = Date.now();
        fs.readdirSync(sourceFolder).forEach((fileName) => {
            const filePath = path.join(sourceFolder, fileName);
            const key = path.resolve(filePath);
            if (zaloAutoMoveState.seen.has(key) || !isZaloImageFile(filePath)) return;

            const stat = fs.statSync(filePath);
            const pending = zaloAutoMoveState.pending.get(key);
            if (!pending || pending.size !== stat.size || pending.mtimeMs !== stat.mtimeMs) {
                zaloAutoMoveState.pending.set(key, { size: stat.size, mtimeMs: stat.mtimeMs, firstSeenAt: now });
                return;
            }
            if (now - pending.firstSeenAt < 250 || stat.size <= 0) return;
            if (!destination || !fs.existsSync(destination)) {
                zaloAutoMoveState.lastError = 'Chưa xác định được thư mục Explorer đang mở. Hãy mở thư mục ảnh đích trong File Explorer rồi tải ảnh Zalo.';
                return;
            }

            const movedTo = moveFileSafe(filePath, destination);
            zaloAutoMoveState.seen.add(key);
            zaloAutoMoveState.pending.delete(key);
            zaloAutoMoveState.movedCount += 1;
            zaloAutoMoveState.lastDestination = destination;
            zaloAutoMoveState.lastError = '';
            zaloAutoMoveState.lastMessage = `Đã chuyển ${fileName} -> ${movedTo}`;
            notifyZaloImageMoved({
                fileName,
                from: filePath,
                to: movedTo,
                destination
            });
        });
    } catch (error) {
        zaloAutoMoveState.lastError = error.message || String(error);
    } finally {
        zaloAutoMoveState.busy = false;
        if (zaloAutoMoveState.enabled && zaloAutoMoveState.pollAgain) {
            zaloAutoMoveState.pollAgain = false;
            requestZaloPoll(80);
        }
    }
}

function startZaloAutoMove(config = {}) {
    if (zaloAutoMoveState.timer) clearInterval(zaloAutoMoveState.timer);
    const sourceFolder = config.sourceFolder || findDefaultZaloDownloadFolder();
    if (!sourceFolder || !fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) {
        throw new Error('Không tìm thấy thư mục tải ảnh Zalo. Hãy chọn thư mục Zalo Received Files.');
    }
    const fallbackFolder = config.fallbackFolder || '';
    zaloAutoMoveState.enabled = true;
    zaloAutoMoveState.sourceFolder = sourceFolder;
    zaloAutoMoveState.fallbackFolder = fallbackFolder;
    zaloAutoMoveState.useActiveExplorer = true;
    zaloAutoMoveState.lastDestination = '';
    zaloAutoMoveState.lastError = '';
    zaloAutoMoveState.pollRequested = false;
    zaloAutoMoveState.pollAgain = false;
    zaloAutoMoveState.lastMessage = 'Đang chạy ngầm tự chuyển ảnh Zalo.';
    if (path.resolve(sourceFolder).toLowerCase() === path.resolve(app.getPath('desktop')).toLowerCase()) {
        zaloAutoMoveState.lastMessage = 'Đang chạy ngầm tự chuyển ảnh Zalo. Lưu ý: thư mục Zalo đang là Desktop, nên hãy mở riêng thư mục ảnh đích trong File Explorer.';
    }
    seedZaloSeenFiles(sourceFolder);
    if (zaloAutoMoveState.watcher) {
        try {
            zaloAutoMoveState.watcher.close();
        } catch {}
    }
    try {
        zaloAutoMoveState.watcher = fs.watch(sourceFolder, () => requestZaloPoll(80));
    } catch (error) {
        zaloAutoMoveState.lastError = `Không theo dõi được thư mục Zalo: ${error.message || error}`;
    }
    zaloAutoMoveState.timer = setInterval(() => {
        requestZaloPoll(0);
    }, Math.max(Number(config.intervalMs) || 500, 350));
    refreshZaloExplorerCache();
    requestZaloPoll(120);
    return getZaloAutoMoveStatus();
}

function isExcelFileLockError(error) {
    const code = String(error && error.code || '').toUpperCase();
    const message = String(error && error.message || '').toLowerCase();
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
        || message.includes('ebusy') || message.includes('eperm') || message.includes('eacces')
        || message.includes('permission denied') || message.includes('used by another process');
}

function runPowerShellFile(script, args) {
    return new Promise((resolve, reject) => {
        const ps1Path = path.join(app.getPath('temp'), `daily-work-report-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
        fs.writeFileSync(ps1Path, script, 'utf8');
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, ...args], {
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 4
        }, (error, stdout, stderr) => {
            try {
                fs.unlinkSync(ps1Path);
            } catch (_cleanupError) {
                // Temp cleanup failure should not hide the real export result.
            }
            if (error) {
                const detail = stderr || stdout || error.message;
                reject(new Error(detail.trim() || error.message));
                return;
            }
            resolve(stdout);
        });
    });
}

async function copyWorkbookToOpenExcelWorkbook(tempPath, targetPath) {
    const script = String.raw`
param(
    [Parameter(Mandatory=$true)][string]$TargetPath,
    [Parameter(Mandatory=$true)][string]$TempPath
)

$ErrorActionPreference = "Stop"
$targetFull = [System.IO.Path]::GetFullPath($TargetPath)
$tempFull = [System.IO.Path]::GetFullPath($TempPath)
$createdExcel = $false

try {
    $excel = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
} catch {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $createdExcel = $true
}

$excel.DisplayAlerts = $false
$targetWb = $null
$openedTarget = $false

foreach ($wb in @($excel.Workbooks)) {
    try {
        if ([System.IO.Path]::GetFullPath($wb.FullName).Equals($targetFull, [System.StringComparison]::OrdinalIgnoreCase)) {
            $targetWb = $wb
            break
        }
    } catch {}
}

if ($null -eq $targetWb) {
    $targetWb = $excel.Workbooks.Open($targetFull)
    $openedTarget = $true
}

$tempWb = $null
try {
    $tempWb = $excel.Workbooks.Open($tempFull, $null, $true)
    $src = $tempWb.Worksheets.Item(1)
    $dst = $targetWb.Worksheets.Item(1)

    try { $dst.Cells.UnMerge() } catch {}
    foreach ($shape in @($dst.Shapes)) {
        try { $shape.Delete() } catch {}
    }
    $dst.Cells.Clear()

    $used = $src.UsedRange
    $used.Copy($dst.Range("A1"))

    $colCount = [Math]::Min([int]$used.Columns.Count, 200)
    for ($i = 1; $i -le $colCount; $i++) {
        try { $dst.Columns.Item($i).ColumnWidth = $src.Columns.Item($i).ColumnWidth } catch {}
    }

    $rowCount = [Math]::Min([int]$used.Rows.Count, 2000)
    for ($i = 1; $i -le $rowCount; $i++) {
        try { $dst.Rows.Item($i).RowHeight = $src.Rows.Item($i).RowHeight } catch {}
    }

    foreach ($shape in @($src.Shapes)) {
        try {
            $shape.Copy()
            $dst.Paste() | Out-Null
            $newShape = $dst.Shapes.Item($dst.Shapes.Count)
            $newShape.Left = $shape.Left
            $newShape.Top = $shape.Top
            $newShape.Width = $shape.Width
            $newShape.Height = $shape.Height
        } catch {}
    }

    $targetWb.Save()
} finally {
    if ($null -ne $tempWb) {
        $tempWb.Close($false)
    }
    if ($openedTarget -and $createdExcel -and $null -ne $targetWb) {
        $targetWb.Close($true)
    }
    if ($createdExcel) {
        $excel.Quit()
    }
}
`;

    await runPowerShellFile(script, ['-TargetPath', targetPath, '-TempPath', tempPath]);
}

async function writeWorkbookAllowingOpenExcel(workbook, outputPath) {
    try {
        await workbook.xlsx.writeFile(outputPath);
        return;
    } catch (error) {
        if (!isExcelFileLockError(error) || process.platform !== 'win32') {
            throw error;
        }
    }

    const tempPath = path.join(app.getPath('temp'), `daily-work-report-open-excel-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`);
    try {
        await workbook.xlsx.writeFile(tempPath);
        await copyWorkbookToOpenExcelWorkbook(tempPath, outputPath);
    } finally {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_cleanupError) {
            // The OS temp folder can clean this up later.
        }
    }
}

async function exportWeeklyReport(payload) {
    const dateFrom = payload.dateFrom;
    const dateTo = payload.dateTo;
    const outputDir = payload.outputDir;
    const rows = normalizeWeeklyRows(payload.rows || []);
    const columns = normalizeWeeklyColumns(payload.columns);
    const images = Array.isArray(payload.images) ? payload.images : [];
    const imageGroups = Array.isArray(payload.imageGroups) ? payload.imageGroups : [];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo tuần');
    sheet.views = [{ showGridLines: false }];

    sheet.columns = columns.map((column) => ({ width: Math.max(6, Math.round(column.width / 8)) }));

    setMergedTitle(sheet, dateFrom, dateTo);
    await addImageToSheet(workbook, sheet, DEFAULT_WEEKLY_LOGO, {
        tl: { col: 0.25, row: 0.35 },
        ext: { width: 210, height: 46 }
    });

    const headers = columns.map((column) => column.label);
    const headerRow = sheet.getRow(4);
    headerRow.values = headers;
    headerRow.height = 34;
    headerRow.eachCell((cell) => {
        applyCellBaseStyle(cell, { bold: true });
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    let rowIndex = 5;
    rows.forEach((item) => {
        const row = sheet.getRow(rowIndex);
        columns.forEach((column, index) => {
            const cell = row.getCell(index + 1);
            if (column.id === 'stt') cell.value = item.stt;
            else if (column.id === 'noi_dung') cell.value = excelFallbackValue(listToNumberedText(item.noi_dung));
            else if (column.id === 'tien_do') cell.value = excelFallbackValue(item.tien_do || []);
            else cell.value = excelFallbackValue(item[column.id]);
        });
        row.height = item.row_height ? Math.max(32, Math.round(item.row_height * 0.75)) : Math.max(52, 24 * Math.max(item.noi_dung.length, item.tien_do.length, 2));
        row.eachCell((cell, colNumber) => {
            const column = columns[colNumber - 1];
            applyCellBaseStyle(cell, {
                horizontal: ['stt', 'hang_muc', 'du_an'].includes(column && column.id) ? 'center' : 'left',
                color: column && column.id === 'tien_do' ? 'FFFF0000' : undefined,
                bold: column && column.id === 'hang_muc'
            });
            cell.font = { ...(cell.font || {}), name: 'Times New Roman' };
            cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: 'middle' };
        });
        const categoryIndex = columns.findIndex((column) => column.id === 'hang_muc') + 1;
        if (categoryIndex > 0) {
            sheet.getCell(rowIndex, categoryIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: categoryFillColor(item.hang_muc) } };
            sheet.getCell(rowIndex, categoryIndex).font = {
                ...(sheet.getCell(rowIndex, categoryIndex).font || {}),
                name: 'Times New Roman',
                bold: true,
                color: { argb: categoryFontColor(item.hang_muc) }
            };
        }
        rowIndex += 1;
    });

    const categoryIndex = columns.findIndex((column) => column.id === 'hang_muc') + 1;
    if (categoryIndex > 0) {
        const categoryLetter = excelColumnLetter(categoryIndex);
        const categoryRange = `${categoryLetter}5:${categoryLetter}${Math.max(rowIndex + 40, 80)}`;
        sheet.dataValidations.add(categoryRange, {
            type: 'list',
            allowBlank: true,
            formulae: ['"Lắp máy mới,Chỉnh máy,Lắp đặt tại line,Sửa máy,Hỗ trợ"']
        });
    }

    if (images.length) {
        let imageRow = rowIndex + 2;
        const lastLetter = excelColumnLetter(columns.length);

        safeMergeCells(sheet, `A${imageRow}:${lastLetter}${imageRow + 1}`);
        const detailTitleCell = sheet.getCell(imageRow, 1);
        detailTitleCell.value = 'HÌNH ẢNH CHI TIẾT';
        detailTitleCell.font = { name: 'Times New Roman', size: 20, bold: true, color: { argb: 'FFFF0000' } };
        detailTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(imageRow).height = 34;
        sheet.getRow(imageRow + 1).height = 10;
        imageRow += 3;

        for (const group of groupWeeklyExportImages(images, imageGroups)) {
            const blockStartRow = imageRow;
            safeMergeCells(sheet, `A${imageRow}:${lastLetter}${imageRow}`);
            const titleCell = sheet.getCell(imageRow, 1);
            titleCell.value = group.description || group.title || '';
            titleCell.font = { name: 'Times New Roman', size: 18 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            sheet.getRow(imageRow).height = 24;
            imageRow += 1;

            const imagesPerRow = 3;
            const slotWidth = Math.max(1.6, columns.length / imagesPerRow);
            const imageStartRow = imageRow;
            for (let index = 0; index < group.images.length; index += 1) {
                const image = group.images[index];
                const slot = index % imagesPerRow;
                const col = slot * slotWidth + 0.02;
                if (slot === 0 && index > 0) imageRow += 8;

                await addImageToSheet(workbook, sheet, image.path, {
                    tl: { col, row: imageRow - 1 },
                    ext: { width: 300, height: 168 }
                });

                for (let r = imageRow; r <= imageRow + 7; r += 1) {
                    sheet.getRow(r).height = 20;
                }
            }

            const imageEndRow = imageStartRow + Math.ceil(group.images.length / imagesPerRow) * 8 - 1;
            const blockEndRow = Math.max(imageEndRow, blockStartRow);
            for (let r = blockStartRow; r <= blockEndRow; r += 1) {
                for (let c = 1; c <= columns.length; c += 1) {
                    const cell = sheet.getCell(r, c);
                    cell.border = {
                        top: r === blockStartRow ? { style: 'thin' } : cell.border && cell.border.top,
                        left: c === 1 ? { style: 'thin' } : cell.border && cell.border.left,
                        bottom: r === blockEndRow ? { style: 'thin' } : cell.border && cell.border.bottom,
                        right: c === columns.length ? { style: 'thin' } : cell.border && cell.border.right
                    };
                }
            }

            imageRow = blockEndRow + 2;
        }
    }

    workbook.eachSheet((ws) => {
        ws.eachRow((row) => {
            row.eachCell((cell) => {
                cell.font = { name: 'Times New Roman', ...(cell.font || {}) };
            });
        });
    });

    fs.mkdirSync(outputDir, { recursive: true });
    const outputName = `Báo cáo tuần ${formatReportFileDate(dateFrom)} ~ ${formatReportFileDate(dateTo)}.xlsx`;
    const outputPath = getUniqueOutputPath(outputDir, outputName);
    await writeWorkbookAllowingOpenExcel(workbook, outputPath);
    return outputPath;
}

function formatSetupWorkDate(isoDate) {
    if (!isoDate) return 'N/A';
    const parts = String(isoDate).split('-');
    if (parts.length === 3) {
        return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
    }
    return isoDate;
}

function setupTrackingContent(row, detail = null) {
    if (isSetupLineInstallCategory(row.hang_muc)) {
        return '1. Lắp đặt tại line\n2. Hiệu chỉnh máy';
    }
    const content = detail && Array.isArray(detail.noi_dung_cong_viec)
        ? detail.noi_dung_cong_viec
        : row.noi_dung;
    return excelFallbackValue(listToNumberedText(content));
}

function findSetupAppendRow(sheet, firstDataRow, lastColumn) {
    let lastDataRow = firstDataRow - 1;
    const maxRow = Math.max(sheet.rowCount, firstDataRow);
    for (let rowIndex = firstDataRow; rowIndex <= maxRow; rowIndex += 1) {
        const row = sheet.getRow(rowIndex);
        let hasData = false;
        for (let col = 1; col <= lastColumn; col += 1) {
            if (cellDisplayText(row.getCell(col)).trim()) {
                hasData = true;
                break;
            }
        }
        if (hasData) lastDataRow = rowIndex;
    }
    return lastDataRow + 1;
}

function getSetupNextStt(sheet, firstDataRow) {
    let maxStt = 0;
    for (let rowIndex = firstDataRow; rowIndex <= sheet.rowCount; rowIndex += 1) {
        const value = Number(cellDisplayText(sheet.getRow(rowIndex).getCell(1)).trim());
        if (Number.isFinite(value)) maxStt = Math.max(maxStt, value);
    }
    return maxStt + 1;
}

function safeUnmergeCells(sheet, range) {
    try {
        sheet.unMergeCells(range);
    } catch (_error) {
        // Range may not be merged; nothing to do.
    }
}

function findExistingSetupProjectGroup(sheet, firstDataRow, project) {
    const projectKey = normalizeProjectCode(project);
    if (!projectKey) return null;

    let start = 0;
    let end = 0;
    for (let rowIndex = firstDataRow; rowIndex <= sheet.rowCount; rowIndex += 1) {
        const key = normalizeProjectCode(cellDisplayText(sheet.getRow(rowIndex).getCell(2)));
        if (key === projectKey) {
            if (!start) start = rowIndex;
            end = rowIndex;
        } else if (start && end) {
            break;
        }
    }

    return start ? { start, end } : null;
}

function groupSetupEntriesByProject(entries) {
    const groups = [];
    const groupMap = new Map();
    entries.forEach((entry) => {
        const key = normalizeProjectCode(entry.weeklyRow.du_an);
        if (!key) return;
        if (!groupMap.has(key)) {
            const group = {
                key,
                weeklyRow: entry.weeklyRow,
                entries: []
            };
            groupMap.set(key, group);
            groups.push(group);
        }
        groupMap.get(key).entries.push(entry);
    });
    return groups;
}

function copySetupRowStyle(targetRow, templateRow, noteColumn) {
    targetRow.height = Math.max(templateRow.height || 24, 42);
    for (let col = 1; col <= noteColumn; col += 1) {
        targetRow.getCell(col).style = { ...templateRow.getCell(col).style };
    }
}

function writeSetupEntryRow(sheet, rowNumber, entry, options) {
    const {
        stt,
        showProjectInfo,
        noteColumn,
        reference
    } = options;
    const item = entry.weeklyRow;
    const detail = entry.detail;
    const row = sheet.getRow(rowNumber);
    const info = reference[normalizeProjectCode(item.du_an)] || {};
    const machineName = item.ten_may || info.machineName || '';
    const machineType = item.ghi_chu || info.projectName || '';
    const values = [
        showProjectInfo ? stt : '',
        showProjectInfo ? (item.du_an || 'N/A') : '',
        showProjectInfo ? (machineType || 'N/A') : '',
        'N/A',
        formatSetupWorkDate(detail && detail.ngay_thuc_hien),
        'N/A',
        setupTrackingContent(item, detail),
        'N/A',
        'N/A',
        showProjectInfo ? (machineName || 'N/A') : ''
    ];

    values.forEach((value, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.value = colIndex === 0 && value !== '' ? value : (value === '' ? '' : excelFallbackValue(value));
        cell.font = { ...(cell.font || {}), name: 'Times New Roman' };
        cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: 'middle', horizontal: colIndex === 0 ? 'center' : 'left' };
    });
    row.commit();

    // Keep note column inside the styled area even if template had fewer used columns.
    if (noteColumn > values.length) {
        row.getCell(noteColumn).value = showProjectInfo ? excelFallbackValue(machineName) : '';
    }
}

function mergeSetupProjectGroup(sheet, startRow, endRow, noteColumn) {
    if (endRow <= startRow) return;
    [1, 2, 3, noteColumn].forEach((col) => {
        const letter = excelColumnLetter(col);
        safeMergeCells(sheet, `${letter}${startRow}:${letter}${endRow}`);
    });
}

function unmergeSetupProjectGroup(sheet, startRow, endRow, noteColumn) {
    if (endRow < startRow) return;
    [1, 2, 3, noteColumn].forEach((col) => {
        const letter = excelColumnLetter(col);
        safeUnmergeCells(sheet, `${letter}${startRow}:${letter}${endRow}`);
    });
}

function rebuildSetupProjectMerges(sheet, firstDataRow, noteColumn) {
    const lastRow = findSetupAppendRow(sheet, firstDataRow, noteColumn) - 1;
    if (lastRow < firstDataRow) return;

    [1, 2, 3, noteColumn].forEach((col) => {
        const letter = excelColumnLetter(col);
        safeUnmergeCells(sheet, `${letter}${firstDataRow}:${letter}${lastRow}`);
    });

    let groupStart = firstDataRow;
    let currentProject = normalizeProjectCode(cellDisplayText(sheet.getRow(firstDataRow).getCell(2)));

    for (let rowIndex = firstDataRow + 1; rowIndex <= lastRow + 1; rowIndex += 1) {
        const rawProject = rowIndex <= lastRow
            ? normalizeProjectCode(cellDisplayText(sheet.getRow(rowIndex).getCell(2)))
            : '__END__';
        const startsNewGroup = rawProject && rawProject !== currentProject;
        if (!startsNewGroup) continue;

        const groupEnd = rowIndex - 1;
        mergeSetupProjectGroup(sheet, groupStart, groupEnd, noteColumn);
        groupStart = rowIndex;
        currentProject = rawProject;
    }
}

function isSetupNewInstallContent(value) {
    const normalized = normalizeReferenceSheetName(value);
    return normalized.includes('lapdattailine') && normalized.includes('hieuchinhmay');
}

function removeDuplicateSetupNewInstallRows(sheet, firstDataRow, noteColumn) {
    const lastRow = findSetupAppendRow(sheet, firstDataRow, noteColumn) - 1;
    if (lastRow < firstDataRow) return;

    [1, 2, 3, noteColumn].forEach((col) => {
        const letter = excelColumnLetter(col);
        safeUnmergeCells(sheet, `${letter}${firstDataRow}:${letter}${lastRow}`);
    });

    const seenByProject = new Set();
    const rowsToDelete = [];
    let currentProjectKey = '';

    for (let rowIndex = firstDataRow; rowIndex <= lastRow; rowIndex += 1) {
        const row = sheet.getRow(rowIndex);
        const projectInRow = normalizeProjectCode(cellDisplayText(row.getCell(2)));
        if (projectInRow) currentProjectKey = projectInRow;
        if (!currentProjectKey) continue;

        const content = cellDisplayText(row.getCell(7));
        if (!isSetupNewInstallContent(content)) continue;

        if (seenByProject.has(currentProjectKey)) {
            rowsToDelete.push(rowIndex);
            continue;
        }
        seenByProject.add(currentProjectKey);
    }

    rowsToDelete.reverse().forEach((rowIndex) => {
        sheet.spliceRows(rowIndex, 1);
    });
}

function groupProjectDetailsByDate(details) {
    const grouped = new Map();
    details.forEach((detail) => {
        const date = detail.ngay_thuc_hien || 'N/A';
        if (!grouped.has(date)) {
            grouped.set(date, {
                ngay_thuc_hien: detail.ngay_thuc_hien || '',
                noi_dung_cong_viec: []
            });
        }
        const group = grouped.get(date);
        if (Array.isArray(detail.noi_dung_cong_viec)) {
            detail.noi_dung_cong_viec.forEach((item) => {
                if (item && !group.noi_dung_cong_viec.includes(item)) group.noi_dung_cong_viec.push(item);
            });
        }
    });
    return [...grouped.values()].sort((a, b) => String(a.ngay_thuc_hien || '').localeCompare(String(b.ngay_thuc_hien || '')));
}

async function buildSetupTrackingRows(rows, payload) {
    const detailsResult = await queryReportsByDateRange(payload.dateFrom || '0000-00-00', payload.dateTo || '9999-99-99');
    const detailMap = new Map();
    (detailsResult.reports || []).forEach((report) => {
        const key = normalizeProjectCode(report.ma_du_an);
        if (!key) return;
        if (!detailMap.has(key)) detailMap.set(key, []);
        detailMap.get(key).push(report);
    });

    const seenLineInstallProjects = new Set();
    return rows.flatMap((row) => {
        const key = normalizeProjectCode(row.du_an);
        const isLineInstall = isSetupLineInstallCategory(row.hang_muc);
        if (isLineInstall) {
            if (seenLineInstallProjects.has(key)) return [];
            seenLineInstallProjects.add(key);
        }
        const details = groupProjectDetailsByDate(detailMap.get(key) || []);
        if (!details.length) {
            return [{ weeklyRow: row, detail: null }];
        }
        if (isLineInstall) {
            return [{ weeklyRow: row, detail: details[0] }];
        }
        return details.map((detail) => ({ weeklyRow: row, detail }));
    });
}

async function exportSetupTrackingReport(payload) {
    const outputDir = payload.outputDir;
    const rows = normalizeWeeklyRows(payload.rows || []).filter((row) => {
        return isSetupLineInstallCategory(row.hang_muc) || isSetupRepairCategory(row.hang_muc);
    });

    if (!rows.length) {
        throw new Error('Không có dòng hạng mục Lắp đặt tại line hoặc Sửa máy để thêm vào Excel setup.');
    }
    if (!fs.existsSync(SETUP_TRACKING_TEMPLATE_FILE)) {
        throw new Error('Không tìm thấy template theo dõi setup nội bộ.');
    }

    const reference = await loadMachineReference();
    fs.mkdirSync(outputDir, { recursive: true });
    const outputName = 'Theo dõi setup máy cho khách hàng.xlsx';
    const outputPath = path.join(outputDir, outputName);
    const useExistingFile = fs.existsSync(outputPath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(useExistingFile ? outputPath : SETUP_TRACKING_TEMPLATE_FILE);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('Template theo dõi setup không có sheet.');

    const headerRowNumber = 7;
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.eachCell((cell) => {
        const text = cellDisplayText(cell).trim().toLowerCase();
        if (text.includes('khó khăn') || text.includes('sự cố') || text.includes('su co')) {
            cell.value = 'Nội Dung';
        }
    });

    const noteColumn = sheet.columnCount >= 10 ? 10 : sheet.columnCount + 1;
    const noteHeader = sheet.getCell(headerRowNumber, noteColumn);
    noteHeader.value = 'Ghi chú';
    noteHeader.style = { ...sheet.getCell(headerRowNumber, Math.max(1, noteColumn - 1)).style };

    const hasSetupLogo = typeof sheet.getImages === 'function' && sheet.getImages().length > 0;
    if (!hasSetupLogo) {
        await addImageToSheet(workbook, sheet, DEFAULT_WEEKLY_LOGO, {
            tl: { col: 0.15, row: 0.25 },
            ext: { width: 210, height: 46 }
        });
    }

    const firstDataRow = headerRowNumber + 1;
    const dataTemplateRow = sheet.getRow(firstDataRow);
    const setupEntries = await buildSetupTrackingRows(rows, payload);
    const setupGroups = groupSetupEntriesByProject(setupEntries);

    setupGroups.forEach((group) => {
        const existingGroup = findExistingSetupProjectGroup(sheet, firstDataRow, group.weeklyRow.du_an);
        if (existingGroup) {
            const stt = Number(cellDisplayText(sheet.getRow(existingGroup.start).getCell(1)).trim()) || getSetupNextStt(sheet, firstDataRow);
            unmergeSetupProjectGroup(sheet, existingGroup.start, existingGroup.end, noteColumn);
            const insertAt = existingGroup.end + 1;
            sheet.spliceRows(insertAt, 0, ...group.entries.map(() => []));
            group.entries.forEach((entry, entryIndex) => {
                const rowNumber = insertAt + entryIndex;
                copySetupRowStyle(sheet.getRow(rowNumber), dataTemplateRow, noteColumn);
                writeSetupEntryRow(sheet, rowNumber, entry, {
                    stt,
                    showProjectInfo: false,
                    noteColumn,
                    reference
                });
            });
            mergeSetupProjectGroup(sheet, existingGroup.start, existingGroup.end + group.entries.length, noteColumn);
            return;
        }

        const appendStartRow = findSetupAppendRow(sheet, firstDataRow, noteColumn);
        const stt = getSetupNextStt(sheet, firstDataRow);
        group.entries.forEach((entry, entryIndex) => {
            const rowNumber = appendStartRow + entryIndex;
            copySetupRowStyle(sheet.getRow(rowNumber), dataTemplateRow, noteColumn);
            writeSetupEntryRow(sheet, rowNumber, entry, {
                stt,
                showProjectInfo: entryIndex === 0,
                noteColumn,
                reference
            });
        });
        mergeSetupProjectGroup(sheet, appendStartRow, appendStartRow + group.entries.length - 1, noteColumn);
    });

    removeDuplicateSetupNewInstallRows(sheet, firstDataRow, noteColumn);
    rebuildSetupProjectMerges(sheet, firstDataRow, noteColumn);

    await writeWorkbookAllowingOpenExcel(workbook, outputPath);
    return outputPath;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1100,
        minHeight: 720,
        icon: APP_ICON_FILE,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    registerAppResourceProtocol();
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'media');
    });
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopZaloAutoMove();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.handle('choose-root-folder', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Chọn thư mục lưu ảnh / tài liệu',
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
});

ipcMain.handle('choose-zalo-download-folder', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Chọn thư mục tải ảnh Zalo',
        properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
});

ipcMain.handle('find-default-zalo-download-folder', async () => {
    return findDefaultZaloDownloadFolder();
});

ipcMain.handle('start-zalo-auto-move', async (_event, config) => {
    return startZaloAutoMove(config || {});
});

ipcMain.handle('stop-zalo-auto-move', async () => {
    return stopZaloAutoMove();
});

ipcMain.handle('get-zalo-auto-move-status', async () => {
    return getZaloAutoMoveStatus();
});

ipcMain.handle('get-app-info', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const git = await getGitInfo();
    return {
        name: 'Daily Work Report',
        version: pkg.version || '1.0.0',
        description: pkg.description || 'Phần mềm chuẩn hóa báo cáo công việc hằng ngày, quản lý dữ liệu SQLite, thư mục ảnh/tài liệu và xuất báo cáo tuần Excel.',
        latestUpdate: [
            'Ban 1.5.2: sua badge version tren tieu de de tu dong doc dung version tu package.json.',
            'Ban 1.5.1: sua loi ban chay Administrator khong doc duoc thu muc File Explorer dang mo.',
            'Ban 1.5.0: them che do chay quyen Administrator cho ban build Windows va hien thi thu muc dich anh Zalo.',
            'Ban 1.4.0: them popup phat hien phien ban moi tren GitHub, nut Update ngay/De sau va cai tien AI hoc nhap lieu, hand tracking.',
            'Ban 1.3.4: cap nhat hang muc bao cao tuan, giu noi dung da nhap, sua xuat Excel setup lay Lap dat tai line/Sua may va ho tro ghi khi file Excel dang mo.',
            'Ban 1.3.3: bo sung xuat Excel setup theo file noi bo, ghi them vao dung nhom ma thiet bi, loc lap moi trung va cai thien bao cao tuan.',
            'Ban 1.3.2: them truong Thoi gian cho nhap lieu, luu SQLite/tim kiem, chan ma du an ao theo nam-thang va lam sach trang thai theo tung du an.',
            'Ban 1.3.1: nut Update tu dong tai installer, mo trinh cai dat va dong phan mem hien tai de cai de ban moi.',
            'Ban 1.3.0: them canh bao ma du an khong co trong file tham khao, goi y sua ma, Detail loc dung ma du an va build installer NSIS.',
            'Bản 1.2.2: phát hành thử nghiệm dạng win-unpacked.zip để kiểm tra updater tải gói unpack.',
            'Bản 1.2.1: thêm gói win-unpacked.zip và updater có thể tải cả file .exe hoặc .zip từ GitHub Releases.',
            'Bản 1.2.0: đổi nút tạo dữ liệu thành Tạo Folder, giữ bảng chuẩn hóa sau khi tạo folder và thêm nút Clear.',
            'Bản 1.1.0: thêm chọn và xóa bản ghi trong trang tìm kiếm, xóa đồng thời SQLite và JSON.',
            'Thêm popup thông tin phần mềm và nút update từ GitHub.',
            'Cây cấu trúc thư mục hiển thị file bằng icon local theo loại file.',
            'Xuất báo cáo tuần có ảnh chi tiết dạng gallery theo nhóm dự án.'
        ],
        githubUrl: githubRemoteToUrl(git.remoteUrl) || GITHUB_REPO_URL,
        branch: git.branch || '',
        commit: git.commit || '',
        isRepo: git.isRepo
    };
});

ipcMain.handle('update-app-from-github', async () => {
    return updateFromGithub();
});

ipcMain.handle('check-app-update-from-github', async () => {
    return checkGithubReleaseUpdate();
});

ipcMain.handle('open-external-link', async (_event, url) => {
    if (!url) return;
    await shell.openExternal(url);
});

ipcMain.handle('choose-report-output-folder', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Chọn thư mục lưu báo cáo tuần',
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
});

ipcMain.handle('choose-weekly-images', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Chọn hình ảnh cho báo cáo tuần',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }
        ]
    });

    if (result.canceled) {
        return [];
    }

    return result.filePaths;
});

ipcMain.handle('list-report-images', async (_event, folders) => {
    const folderList = Array.isArray(folders) ? folders : [folders].filter(Boolean);
    const imageExtensions = new Set(['.jpg', '.jpeg', '.png']);
    const images = [];

    function collectImages(folder) {
        if (!folder || !fs.existsSync(folder)) return;
        const stats = fs.statSync(folder);
        if (!stats.isDirectory()) return;
        fs.readdirSync(folder).forEach((fileName) => {
            const filePath = path.join(folder, fileName);
            if (!fs.existsSync(filePath)) return;
            const fileStats = fs.statSync(filePath);
            if (fileStats.isDirectory()) {
                collectImages(filePath);
                return;
            }
            if (fileStats.isFile() && imageExtensions.has(path.extname(fileName).toLowerCase())) {
                images.push(filePath);
            }
        });
    }

    folderList.forEach((folder) => {
        collectImages(folder);
    });

    return images;
});

ipcMain.handle('list-folder-structure', async (_event, rootFolder) => {
    const entries = [];
    const maxDepth = 5;

    function collectEntries(folder, depth) {
        if (!folder || !fs.existsSync(folder)) return;
        const stats = fs.statSync(folder);
        if (!stats.isDirectory()) return;
        entries.push({ path: folder, type: 'folder' });

        let dirEntries = [];
        try {
            dirEntries = fs.readdirSync(folder, { withFileTypes: true });
        } catch {
            return;
        }

        dirEntries
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
            .forEach((entry) => {
                const entryPath = path.join(folder, entry.name);
                if (entry.isDirectory()) {
                    if (depth < maxDepth) collectEntries(entryPath, depth + 1);
                    return;
                }
                if (entry.isFile()) {
                    entries.push({ path: entryPath, type: 'file' });
                }
            });
    }

    collectEntries(rootFolder, 0);
    return entries;
});

ipcMain.handle('get-weekly-preview', async (_event, payload) => {
    const result = await queryReportsByDateRange(payload.dateFrom, payload.dateTo);
    const reports = await enrichReportsWithMachineReference(result.reports);
    return {
        sqliteFile: result.sqliteFile,
        reports
    };
});

ipcMain.handle('lookup-machine-reference', async (_event, payload) => {
    const projects = Array.isArray(payload && payload.projects) ? payload.projects : [];
    return lookupMachineReferenceByProjects(projects);
});

ipcMain.handle('export-weekly-report', async (_event, payload) => {
    const outputPath = await exportWeeklyReport(payload);
    return { outputPath };
});

ipcMain.handle('export-setup-tracking-report', async (_event, payload) => {
    const outputPath = await exportSetupTrackingReport(payload);
    return { outputPath };
});

ipcMain.handle('save-reports', async (_event, payload) => {
    const rootFolder = payload && payload.rootFolder;
    const reports = Array.isArray(payload && payload.reports) ? payload.reports : [];

    if (!rootFolder) {
        throw new Error('Chưa chọn thư mục lưu trữ.');
    }

    fs.mkdirSync(rootFolder, { recursive: true });

    const existingResult = await loadReportsSqlite();
    const existingFingerprints = new Set((existingResult.reports || []).map(reportDuplicateFingerprint));
    const batchFingerprints = new Set();
    const uniqueReports = [];
    let skippedDuplicates = 0;

    reports.forEach((report) => {
        const fingerprint = reportDuplicateFingerprint(report);
        if (existingFingerprints.has(fingerprint) || batchFingerprints.has(fingerprint)) {
            skippedDuplicates += 1;
            return;
        }
        batchFingerprints.add(fingerprint);
        uniqueReports.push(report);
    });

    const saveBatchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const savedReports = uniqueReports.map((report, index) => {
        const folderDate = report.folder_ngay_name || 'UnknownDate';
        const dayFolder = path.join(rootFolder, folderDate);
        fs.mkdirSync(dayFolder, { recursive: true });

        const peopleList = Array.isArray(report.nguoi_thuc_hien) ? report.nguoi_thuc_hien : [];
        const peopleFolderName = peopleList
            .map((person) => {
                if (typeof person === 'string') return sanitizeFolderName(person) || 'UnknownPerson';
                return person && (person.folderName || sanitizeFolderName(person.displayName || '')) || 'UnknownPerson';
            })
            .filter(Boolean)
            .join('_') || 'ChuaXacDinh';
        const peopleFolder = path.join(dayFolder, peopleFolderName);
        fs.mkdirSync(peopleFolder, { recursive: true });

        return {
            ...report,
            id: `${report.ngay_thuc_hien || 'unknown'}_${report.ma_du_an || 'PROJECT'}_${saveBatchId}_${String(index + 1).padStart(3, '0')}`,
            folder_ngay: dayFolder,
            folder_nhom_nguoi: peopleFolder,
            folder_nguoi: [peopleFolder],
            created_at: report.created_at || new Date().toISOString()
        };
    });

    const dataFile = getJsonFile();
    const sqliteFile = savedReports.length ? await insertReportsSqlite(savedReports) : existingResult.sqliteFile;

    return {
        count: savedReports.length,
        skippedDuplicates,
        dataFile,
        sqliteFile,
        reports: savedReports
    };
});

ipcMain.handle('load-reports', async () => {
    const dataFile = getJsonFile();
    const sqliteFile = getSqliteFile();

    if (fs.existsSync(sqliteFile)) {
        const result = await loadReportsSqlite();
        return { dataFile, sqliteFile: result.sqliteFile, reports: result.reports };
    }

    if (!fs.existsSync(dataFile)) {
        return { dataFile, sqliteFile, reports: [] };
    }

    try {
        const reports = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        const normalizedReports = Array.isArray(reports) ? reports : [];
        if (normalizedReports.length) {
            await insertReportsSqlite(normalizedReports);
        }
        return { dataFile, sqliteFile, reports: normalizedReports };
    } catch (_error) {
        return { dataFile, sqliteFile, reports: [] };
    }
});

ipcMain.handle('query-reports', async (_event, query) => {
    const result = await queryReportsSqlite(query || {});
    return { sqliteFile: result.sqliteFile, reports: result.reports };
});

ipcMain.handle('query-project-detail', async (_event, payload) => {
    const result = await queryReportsByExactProject(payload && payload.project);
    return { sqliteFile: result.sqliteFile, reports: result.reports };
});

ipcMain.handle('delete-reports', async (_event, payload) => {
    return deleteReportsData(payload || {});
});

ipcMain.handle('open-folder', async (_event, folderPath) => {
    if (!folderPath) {
        return false;
    }

    await shell.openPath(folderPath);
    return true;
});
