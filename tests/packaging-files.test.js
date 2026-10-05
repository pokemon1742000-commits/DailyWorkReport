const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('electron-builder files configuration includes src and all required local modules', () => {
    const rootDir = path.resolve(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const files = pkg.build && pkg.build.files;

    assert.ok(Array.isArray(files), 'package.json build.files must be an array');
    assert.ok(files.includes('src/**/*'), 'package.json build.files must include "src/**/*"');
    assert.ok(files.includes('main.js'), 'package.json build.files must include "main.js"');
    assert.ok(files.includes('index.html'), 'package.json build.files must include "index.html"');
    assert.ok(files.includes('assets/**/*'), 'package.json build.files must include "assets/**/*"');
    assert.ok(files.includes('reference_files/**/*'), 'package.json build.files must include "reference_files/**/*"');

    // Parse all local require() calls in main.js
    const mainContent = fs.readFileSync(path.join(rootDir, 'main.js'), 'utf8');
    const requireRegex = /require\(['"](\.[^'"]+)['"]\)/g;
    let match;
    const requiredFiles = [];
    while ((match = requireRegex.exec(mainContent)) !== null) {
        requiredFiles.push(match[1]);
    }

    assert.ok(requiredFiles.length >= 3, `Expected at least 3 local require calls in main.js, found ${requiredFiles.length}`);

    for (const reqPath of requiredFiles) {
        // Resolve path relative to main.js directory
        let resolved = path.resolve(rootDir, reqPath);
        if (!fs.existsSync(resolved) && fs.existsSync(`${resolved}.js`)) {
            resolved = `${resolved}.js`;
        }
        assert.ok(fs.existsSync(resolved), `Module required in main.js does not exist on disk: ${reqPath}`);

        const relativePath = path.relative(rootDir, resolved).replace(/\\/g, '/');
        // Check if covered by any pattern in build.files
        const covered = files.some((pattern) => {
            if (pattern === relativePath) return true;
            if (pattern.endsWith('/**/*')) {
                const prefix = pattern.slice(0, -5);
                return relativePath.startsWith(prefix + '/');
            }
            return false;
        });
        assert.ok(covered, `Required module ${relativePath} is not covered by package.json build.files patterns: ${JSON.stringify(files)}`);
    }
});
