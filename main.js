const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFile } = require('child_process');
const initSqlJs = require('sql.js');
const ExcelJS = require('exceljs');

const DEFAULT_WEEKLY_LOGO = path.join(__dirname, 'assets', 'meiko-automation-logo.png');
const MACHINE_REFERENCE_FILE = path.join(__dirname, 'reference_files', 'Thamkhao.xlsm');
const MACHINE_REFERENCE_SHEET_KEY = 'danhsachmay';
const GITHUB_OWNER = 'pokemon1742000-commits';
const GITHUB_REPO = 'DailyWorkReport';
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

let sqlPromise = null;
let machineReferenceCache = null;

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
    const asset = assets.find((item) => /\.exe$/i.test(item.name || '') && item.browser_download_url)
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
    shell.showItemInFolder(destinationFile);
    const assetType = /\.zip$/i.test(asset.name || '') ? 'zip' : 'exe';

    return {
        mode: 'release',
        assetType,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url || GITHUB_REPO_URL,
        downloadedFile: destinationFile,
        assetName: asset.name,
        message: assetType === 'zip'
            ? `Da tai goi win-unpacked ${latestVersion || ''} ve: ${destinationFile}. Hay giai nen va chay Daily Work Report.exe.`
            : `Da tai ban cap nhat ${latestVersion || ''} ve: ${destinationFile}`
    };
}

async function updateFromGithub() {
    const before = await getGitInfo();
    if (!before.isRepo || !before.remoteUrl) {
        return updateFromGithubRelease();
    }

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
        return;
    }

    createReportsTable(db);
}

function createReportsTable(db) {
    db.run(`
        CREATE TABLE IF NOT EXISTS reports (
            report_index INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT UNIQUE,
            ma_du_an TEXT NOT NULL,
            noi_dung_cong_viec TEXT NOT NULL,
            noi_dung_text TEXT NOT NULL,
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

    db.run('CREATE INDEX IF NOT EXISTS idx_reports_ma_du_an ON reports(ma_du_an);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_ngay ON reports(ngay_thuc_hien);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_nguoi_text ON reports(nguoi_text);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_noi_dung_text ON reports(noi_dung_text);');
    db.run('CREATE INDEX IF NOT EXISTS idx_reports_trang_thai_text ON reports(trang_thai_text);');
}

function migrateLegacyReports(db) {
    const result = db.exec('SELECT * FROM reports_legacy;');
    if (!result[0]) return;

    const columns = result[0].columns;
    const insert = db.prepare(`
        INSERT INTO reports (
            id, ma_du_an, noi_dung_cong_viec, noi_dung_text,
            nguoi_thuc_hien, nguoi_text, trang_thai, trang_thai_text,
            ngay_thuc_hien, folder_ngay, folder_nguoi, folder_nguoi_text,
            raw_text, excel_exported, excel_file, excel_sheet, created_at
        ) VALUES (
            $id, $ma_du_an, $noi_dung_cong_viec, $noi_dung_text,
            $nguoi_thuc_hien, $nguoi_text, $trang_thai, $trang_thai_text,
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

function reportToDbParams(report) {
    const peopleText = listText(report.nguoi_thuc_hien, (person) => person.displayName || person);
    const contentText = listText(report.noi_dung_cong_viec);
    const statusText = listText(report.trang_thai);
    const folderPeopleText = listText(report.folder_nguoi);

    return {
        $id: report.id,
        $ma_du_an: report.ma_du_an || '',
        $noi_dung_cong_viec: serializeList(report.noi_dung_cong_viec),
        $noi_dung_text: contentText,
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
            nguoi_thuc_hien, nguoi_text, trang_thai, trang_thai_text,
            ngay_thuc_hien, folder_ngay, folder_nguoi, folder_nguoi_text, raw_text,
            excel_exported, excel_file, excel_sheet, created_at
        ) VALUES (
            $id, $ma_du_an, $noi_dung_cong_viec, $noi_dung_text,
            $nguoi_thuc_hien, $nguoi_text, $trang_thai, $trang_thai_text,
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

    let jsonReports = [];
    if (fs.existsSync(dataFile)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            jsonReports = Array.isArray(parsed) ? parsed : [];
        } catch {
            jsonReports = [];
        }
    }

    const nextJsonReports = deleteAll
        ? []
        : jsonReports.filter((report) => !ids.includes(String(report.id || '')));
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(nextJsonReports, null, 2), 'utf8');

    const result = await loadReportsSqlite();
    return {
        dataFile,
        sqliteFile: result.sqliteFile,
        reports: result.reports,
        deleted: deleteAll ? jsonReports.length : ids.length
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
            hang_muc: row.hang_muc || 'Lắp mới',
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
    return normalizedRows;
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
    if (normalized === 'sửa' || normalized === 'sua') return 'FFFF0000';
    if (normalized === 'setup') return 'FFFFA500';
    if (normalized === 'hỗ trợ' || normalized === 'ho tro') return 'FFD9D9D9';
    if (normalized === 'lắp mới' || normalized === 'lap moi') return 'FF5B9BD5';
    return 'FFFFFFFF';
}

function categoryFontColor(category) {
    const normalized = String(category || '').trim().toLowerCase();
    return normalized === 'sửa' || normalized === 'sua' || normalized === 'lắp mới' || normalized === 'lap moi'
        ? 'FFFFFFFF'
        : 'FF000000';
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
            else if (column.id === 'noi_dung') cell.value = listToNumberedText(item.noi_dung);
            else if (column.id === 'tien_do') cell.value = (item.tien_do || []).join('\n');
            else cell.value = item[column.id] || '';
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
            formulae: ['"Lắp mới,Sửa,Chỉnh máy,Hỗ trợ,Setup"']
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
    await workbook.xlsx.writeFile(outputPath);
    return outputPath;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1100,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
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

ipcMain.handle('get-app-info', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const git = await getGitInfo();
    return {
        name: 'Daily Work Report',
        version: pkg.version || '1.0.0',
        description: pkg.description || 'Phần mềm chuẩn hóa báo cáo công việc hằng ngày, quản lý dữ liệu SQLite, thư mục ảnh/tài liệu và xuất báo cáo tuần Excel.',
        latestUpdate: [
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

ipcMain.handle('export-weekly-report', async (_event, payload) => {
    const outputPath = await exportWeeklyReport(payload);
    return { outputPath };
});

ipcMain.handle('save-reports', async (_event, payload) => {
    const rootFolder = payload && payload.rootFolder;
    const reports = Array.isArray(payload && payload.reports) ? payload.reports : [];

    if (!rootFolder) {
        throw new Error('Chưa chọn thư mục lưu trữ.');
    }

    fs.mkdirSync(rootFolder, { recursive: true });

    const saveBatchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const savedReports = reports.map((report, index) => {
        const folderDate = report.folder_ngay_name || 'UnknownDate';
        const dayFolder = path.join(rootFolder, folderDate);
        fs.mkdirSync(dayFolder, { recursive: true });

        const peopleFolderName = (report.nguoi_thuc_hien || [])
            .map((person) => person.folderName || 'UnknownPerson')
            .filter(Boolean)
            .join('_') || 'UnknownPerson';
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

    const dataDir = getDataDir();
    const dataFile = getJsonFile();
    fs.mkdirSync(dataDir, { recursive: true });

    let existing = [];
    if (fs.existsSync(dataFile)) {
        try {
            existing = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            if (!Array.isArray(existing)) {
                existing = [];
            }
        } catch (_error) {
            existing = [];
        }
    }

    const merged = [...existing, ...savedReports];
    fs.writeFileSync(dataFile, JSON.stringify(merged, null, 2), 'utf8');
    const sqliteFile = await insertReportsSqlite(savedReports);

    return {
        count: savedReports.length,
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
