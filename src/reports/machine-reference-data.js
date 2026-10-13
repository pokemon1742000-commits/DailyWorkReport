const { normalizeProjectCode } = require('./report-utils');

function parseMachineReferenceMarkdown(markdown) {
    const reference = {};
    const lines = String(markdown || '').split(/\r?\n/);

    lines.forEach((line) => {
        if (!line.startsWith('|')) return;
        const cells = line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim());
        if (cells.length !== 3 || /^-+$/.test(cells[0])) return;
        if (cells[0].toLowerCase() === 'project code') return;

        const code = decodeCell(cells[0]);
        const key = normalizeProjectCode(code);
        if (!key || key === '-') return;
        reference[key] = {
            machineName: decodeCell(cells[1]),
            projectName: decodeCell(cells[2])
        };
    });

    return reference;
}

function decodeCell(value) {
    return value
        .replace(/<br>/g, '\n')
        .replace(/&#124;/g, '|')
        .replace(/\\\\/g, '\\');
}

module.exports = { parseMachineReferenceMarkdown };
