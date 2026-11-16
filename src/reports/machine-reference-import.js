const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { TextDecoder } = require('util');
const { parseMachineReferenceMarkdown } = require('./machine-reference-data');

const decoder = new TextDecoder('utf-8');
const NS = {
    main: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    rel: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    packageRel: 'http://schemas.openxmlformats.org/package/2006/relationships'
};

function xmlTag(name) { return new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'); }
function attr(tag, name) {
    const match = String(tag).match(new RegExp(`${name}="([^"]*)"`, 'i'));
    return match ? match[1] : '';
}
function unescapeXml(value) {
    return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function textContent(value) {
    return unescapeXml(String(value || '').replace(/<[^>]+>/g, ''));
}
function readZipEntries(buffer) {
    const entries = new Map();
    let eocd = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
        if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('File XLSM không phải ZIP hợp lệ.');
    const count = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Cấu trúc ZIP của file XLSM không hợp lệ.');
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = decoder.decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.subarray(start, start + compressedSize);
        if (method !== 0 && method !== 8) throw new Error(`Không hỗ trợ kiểu nén ZIP của ${name}.`);
        entries.set(name, method === 8 ? zlib.inflateRawSync(compressed) : compressed);
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}
function normalizeTarget(target) {
    const parts = path.posix.normalize('/xl/' + String(target || '').replace(/^\/+/, '')).split('/').filter(Boolean);
    return parts.join('/');
}
function xmlEntry(entries, name) {
    const value = entries.get(name);
    if (!value) throw new Error(`Thiếu thành phần ${name} trong file XLSM.`);
    return decoder.decode(value);
}
function sharedStrings(entries) {
    const xml = entries.get('xl/sharedStrings.xml');
    if (!xml) return [];
    const source = decoder.decode(xml);
    return [...source.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi)].map((match) =>
        [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)].map((item) => textContent(item[1])).join('')
    );
}
function cellValue(cell, strings) {
    const type = attr(cell, 't');
    const valueMatch = cell.match(xmlTag('v'));
    const raw = valueMatch ? textContent(valueMatch[1]) : '';
    if (type === 's') return strings[Number(raw)] || '';
    if (type === 'inlineStr') {
        const inline = cell.match(xmlTag('is'));
        return inline ? [...inline[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)].map((m) => textContent(m[1])).join('') : '';
    }
    return raw;
}
function convertXlsmToMarkdown(sourcePath, outputPath) {
    if (path.extname(sourcePath).toLowerCase() !== '.xlsm') throw new Error('Chỉ hỗ trợ file .xlsm.');
    if (!fs.statSync(sourcePath).isFile()) throw new Error('File XLSM không hợp lệ.');
    const entries = readZipEntries(fs.readFileSync(sourcePath));
    const workbook = xmlEntry(entries, 'xl/workbook.xml');
    const relationships = xmlEntry(entries, 'xl/_rels/workbook.xml.rels');
    const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/gi)].map((m) => ({ name: attr(m[0], 'name'), id: attr(m[0], 'r:id') })).find((item) => item.name === 'Danh sách máy');
    if (!sheet) throw new Error('File XLSM không có sheet "Danh sách máy".');
    const relationship = [...relationships.matchAll(/<Relationship\b[^>]*>/gi)].map((m) => ({ id: attr(m[0], 'Id'), target: attr(m[0], 'Target') })).find((item) => item.id === sheet.id);
    if (!relationship) throw new Error('Không tìm thấy liên kết đến sheet "Danh sách máy".');
    const worksheetPath = normalizeTarget(relationship.target);
    const worksheet = xmlEntry(entries, worksheetPath);
    const strings = sharedStrings(entries);
    const rows = [];
    for (const rowMatch of worksheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
        const cells = {};
        for (const cellMatch of rowMatch[1].matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/gi)) {
            const reference = attr(cellMatch[0], 'r');
            const column = (reference.match(/^[A-Z]+/i) || [''])[0].toUpperCase();
            cells[column] = cellValue(cellMatch[0], strings).trim();
        }
        const code = cells.B || '';
        const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^(?:MEC|AUT[A-Z]?)[A-Z0-9]{4,12}$/.test(normalized)) continue;
        rows.push([code, cells.AF || '', cells.AE || '']);
    }
    if (!rows.length) throw new Error('Sheet "Danh sách máy" không có dòng mã dự án hợp lệ.');
    const escape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '<br>').replace(/\|/g, '&#124;');
    const content = [
        `# Machine reference from ${path.basename(sourcePath)}`,
        '', '| Project code | Machine name | Project name |', '| --- | --- | --- |',
        ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`), ''
    ].join('\n');
    fs.writeFileSync(outputPath, content, 'utf8');
    return { rows: rows.length, markdown: parseMachineReferenceMarkdown(content) };
}
module.exports = { convertXlsmToMarkdown };
