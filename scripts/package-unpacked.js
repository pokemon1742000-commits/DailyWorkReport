const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const productName = (pkg.build && pkg.build.productName) || 'Daily Work Report';
const distDir = path.join(rootDir, 'dist');

const arch = process.argv[2] || 'x64';
const version = pkg.version;
const archDir = path.join(distDir, arch);

// Find the unpacked directory inside archDir (electron-builder uses win-unpacked or win-ia32-unpacked)
const unpackedDir = fs.readdirSync(archDir)
    .map(n => path.join(archDir, n))
    .find(p => {
        try { return fs.statSync(p).isDirectory() && /win.*unpacked$/i.test(p); } catch { return false; }
    });

if (!unpackedDir) {
    throw new Error(`No unpacked directory found in ${archDir}`);
}

const zipFile = path.join(distDir, `${productName}-v${version}-${arch}-win-unpacked.zip`);

fs.rmSync(zipFile, { force: true });
execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Compress-Archive -Path '${unpackedDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipFile.replace(/'/g, "''")}' -Force`
], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true
});

console.log(`Created ${zipFile}`);
