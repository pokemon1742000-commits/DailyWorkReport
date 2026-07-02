const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function commandName(command) {
    if (process.platform !== 'win32') return command;
    if (command === 'npm') return 'npm.cmd';
    if (command === 'npx') return 'npx.cmd';
    if (command === 'winget') return 'winget.exe';
    if (command === 'gh') return 'gh.exe';
    if (command === 'git') return 'git.exe';
    return command;
}

function resolveCommand(command) {
    const name = commandName(command);
    if (process.platform !== 'win32') return name;
    try {
        const result = execFileSync('where.exe', [name], {
            cwd: rootDir,
            encoding: 'utf8',
            windowsHide: true
        }).trim().split(/\r?\n/).filter(Boolean)[0];
        return result || name;
    } catch {
        return name;
    }
}

function cmdQuote(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function invocation(command, args) {
    const file = resolveCommand(command);
    if (process.platform === 'win32' && /\.cmd$/i.test(file)) {
        return {
            file: [cmdQuote(file), ...args.map(cmdQuote)].join(' '),
            args: [],
            shell: true
        };
    }
    return { file, args, shell: false };
}

function run(command, args, options = {}) {
    console.log(`\n> ${command} ${args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')}`);
    const call = invocation(command, args);
    execFileSync(call.file, call.args, {
        cwd: rootDir,
        stdio: 'inherit',
        windowsHide: true,
        shell: call.shell,
        env: { ...process.env, ...(options.env || {}) }
    });
}

function capture(command, args, options = {}) {
    const call = invocation(command, args);
    return execFileSync(call.file, call.args, {
        cwd: rootDir,
        encoding: 'utf8',
        windowsHide: true,
        shell: call.shell,
        env: { ...process.env, ...(options.env || {}) }
    }).trim();
}

function commandExists(command, args = ['--version']) {
    const call = invocation(command, args);
    const result = spawnSync(call.file, call.args, {
        cwd: rootDir,
        stdio: 'ignore',
        windowsHide: true,
        shell: call.shell
    });
    return result.status === 0;
}

function ensureGithubCli() {
    if (commandExists('gh')) return;
    if (process.platform !== 'win32' || !commandExists('winget')) {
        throw new Error('Chưa có GitHub CLI (gh). Hãy cài gh hoặc winget trước khi release.');
    }
    run('winget', [
        'install',
        '--id',
        'GitHub.cli',
        '--source',
        'winget',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements'
    ]);
}

function getGithubToken() {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
        return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    }
    try {
        const input = 'protocol=https\nhost=github.com\n\n';
        const result = spawnSync(commandName('git'), ['credential', 'fill'], {
            cwd: rootDir,
            input,
            encoding: 'utf8',
            windowsHide: true
        });
        const line = String(result.stdout || '').split(/\r?\n/).find((item) => item.startsWith('password='));
        return line ? line.replace(/^password=/, '').trim() : '';
    } catch {
        return '';
    }
}

function parseArgs(argv) {
    const args = [...argv];
    const flags = new Set(args.filter((arg) => arg.startsWith('--')));
    const values = args.filter((arg) => !arg.startsWith('--'));
    const version = values[0];
    const message = values[1] || (version ? `Release v${version}` : '');
    const notes = values.slice(2).join('\n') || message;
    return {
        version,
        message,
        notes,
        dryRun: flags.has('--dry-run'),
        skipBuild: flags.has('--skip-build'),
        includeVscode: flags.has('--include-vscode')
    };
}

function readPackage() {
    return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
}

function normalizeReleaseNoteText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function updateChangelog(version, notes) {
    const changelogFile = path.join(rootDir, 'CHANGELOG.json');
    let entries = [];
    try {
        entries = JSON.parse(fs.readFileSync(changelogFile, 'utf8'));
        if (!Array.isArray(entries)) entries = [];
    } catch {
        entries = [];
    }

    const cleanNotes = normalizeReleaseNoteText(notes || `Release v${version}`);
    const prefix = `Bản ${version}:`;
    const entry = cleanNotes.startsWith(prefix)
        ? cleanNotes
        : `${prefix} ${cleanNotes.replace(/^Release\s+v?\d+\.\d+\.\d+\s*[:\-]?\s*/i, '').trim() || `cập nhật phiên bản ${version}`}`;
    entries = entries.filter((item) => !String(item || '').startsWith(prefix));
    entries.unshift(entry);
    fs.writeFileSync(changelogFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    console.log(`Updated CHANGELOG.json: ${entry}`);
}

function assertVersion(version) {
    if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(version || '')) {
        throw new Error('Cần truyền version đúng dạng semver, ví dụ: node scripts/release.js 1.5.7 "Release v1.5.7"');
    }
}

function copyReleaseAliases(version) {
    const pkg = readPackage();
    const productName = (pkg.build && pkg.build.productName) || 'Daily Work Report';
    const dashedName = productName.replace(/\s+/g, '-');
    const distDir = path.join(rootDir, 'dist');
    const aliases = [
        [
            path.join(distDir, `${productName}-Setup-v${version}.exe`),
            path.join(distDir, `${dashedName}-Setup-v${version}.exe`)
        ],
        [
            path.join(distDir, `${productName}-Setup-v${version}.exe.blockmap`),
            path.join(distDir, `${dashedName}-Setup-v${version}.exe.blockmap`)
        ]
    ];
    aliases.forEach(([source, target]) => {
        if (!fs.existsSync(source)) {
            throw new Error(`Thiếu file build: ${source}`);
        }
        fs.copyFileSync(source, target);
        console.log(`Copied ${path.basename(source)} -> ${path.basename(target)}`);
    });
}

function collectReleaseAssets(version) {
    const pkg = readPackage();
    const productName = (pkg.build && pkg.build.productName) || 'Daily Work Report';
    const dashedName = productName.replace(/\s+/g, '-');
    const distDir = path.join(rootDir, 'dist');
    return [
        path.join(distDir, `${dashedName}-Setup-v${version}.exe`),
        path.join(distDir, `${dashedName}-Setup-v${version}.exe.blockmap`),
        path.join(distDir, `${productName}-v${version}.exe`),
        path.join(distDir, `${productName}-v${version}-win-unpacked.zip`),
        path.join(distDir, 'latest.yml')
    ];
}

function ensureAssetsExist(assets) {
    assets.forEach((asset) => {
        if (!fs.existsSync(asset)) {
            throw new Error(`Thiếu release asset: ${asset}`);
        }
    });
}

function stageChanges(includeVscode) {
    run('git', ['add', '-A']);
    if (!includeVscode) {
        try {
            run('git', ['reset', '--', '.vscode']);
        } catch {
            // .vscode may not be tracked/staged, that is fine.
        }
    }
}

function hasStagedChanges() {
    const result = spawnSync(commandName('git'), ['diff', '--cached', '--quiet'], {
        cwd: rootDir,
        stdio: 'ignore',
        windowsHide: true
    });
    return result.status !== 0;
}

function releaseExists(tag, env) {
    const result = spawnSync(commandName('gh'), ['release', 'view', tag, '--repo', 'pokemon1742000-commits/DailyWorkReport'], {
        cwd: rootDir,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, ...env }
    });
    return result.status === 0;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertVersion(options.version);

    const tag = `v${options.version}`;
    const ghToken = getGithubToken();
    const ghEnv = ghToken ? { GH_TOKEN: ghToken } : {};

    console.log(`Release target: ${tag}`);
    console.log(`Commit message: ${options.message}`);

    if (options.dryRun) {
        console.log('Dry run: chỉ kiểm tra tham số, không build/commit/push.');
        return;
    }

    ensureGithubCli();
    updateChangelog(options.version, options.notes);

    if (!options.skipBuild) {
        run('npm', ['version', options.version, '--no-git-tag-version']);
        run('npm', ['run', 'build:release']);
    }

    copyReleaseAliases(options.version);
    const assets = collectReleaseAssets(options.version);
    ensureAssetsExist(assets);

    stageChanges(options.includeVscode);
    if (hasStagedChanges()) {
        run('git', ['commit', '-m', options.message]);
    } else {
        console.log('Không có thay đổi staged để commit.');
    }

    const existingTags = capture('git', ['tag', '--list', tag]);
    if (!existingTags) {
        run('git', ['tag', tag]);
    } else {
        console.log(`Tag ${tag} đã tồn tại local.`);
    }

    run('git', ['push', 'origin', 'main']);
    run('git', ['push', 'origin', tag]);

    const repo = 'pokemon1742000-commits/DailyWorkReport';
    if (releaseExists(tag, ghEnv)) {
        run('gh', ['release', 'upload', tag, ...assets, '--repo', repo, '--clobber'], { env: ghEnv });
    } else {
        run('gh', [
            'release',
            'create',
            tag,
            ...assets,
            '--repo',
            repo,
            '--title',
            `Daily Work Report ${tag}`,
            '--notes',
            options.notes
        ], { env: ghEnv });
    }

    console.log(`\nHoàn tất release ${tag}`);
    console.log(`https://github.com/${repo}/releases/tag/${tag}`);
}

try {
    main();
} catch (error) {
    console.error(`\nRelease lỗi: ${error.message || error}`);
    process.exit(1);
}
