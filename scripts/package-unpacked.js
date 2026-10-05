const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const productName = (pkg.build && pkg.build.productName) || 'Daily Work Report';
const distDir = path.join(rootDir, 'dist');

// Determine architecture: first CLI arg is arch (default x64)
const arch = process.argv[2] || 'x64';
const version = pkg.version;

const unpackedDir = path.join(distDir, arch === 'ia32' ? `win-unpacked-ia32` : 'win-unpacked');
const zipFile = path.join(distDir, `${productName}-v${version}-${arch === 'ia32' ? 'ia32-' : ''}win-unpacked.zip`);

if (!fs.existsSync(unpackedDir)) {
    throw new Error(`Missing unpacked build folder: ${unpackedDir}. Run npm run build first.`);
}

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
