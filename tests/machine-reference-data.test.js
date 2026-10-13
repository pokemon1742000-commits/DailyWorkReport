const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseMachineReferenceMarkdown } = require('../src/reports/machine-reference-data');

test('machine reference Markdown parser decodes escaped fields and normalizes project codes', () => {
    const markdown = [
        '# Machine reference',
        '',
        '| Project code | Machine name | Project name |',
        '| --- | --- | --- |',
        '| mec-1234 | Laser\\\\Machine | Project&#124;One<br>Second line |',
        '| - | - | - |'
    ].join('\n');

    assert.deepEqual(parseMachineReferenceMarkdown(markdown), {
        MEC1234: {
            machineName: 'Laser\\Machine',
            projectName: 'Project|One\nSecond line'
        }
    });
});

test('generated Markdown files include records from each source workbook', () => {
    const referenceFolder = path.resolve(__dirname, '..', 'reference_files');
    const examples = [
        ['Thamkhao.md', 'MEC2201011'],
        ['Thamkhao2.md', 'MEC2403104'],
        ['Thamkhao3.md', 'MEC2201011']
    ];

    examples.forEach(([filename, projectCode]) => {
        const markdown = fs.readFileSync(path.join(referenceFolder, filename), 'utf8');
        assert.ok(parseMachineReferenceMarkdown(markdown)[projectCode], `${filename} must contain ${projectCode}`);
    });
});
