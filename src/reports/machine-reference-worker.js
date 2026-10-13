const fs = require('fs');
const path = require('path');
const { parentPort } = require('worker_threads');
const { normalizeProjectCode } = require('./report-utils');
const { parseMachineReferenceMarkdown } = require('./machine-reference-data');

const REFERENCE_FOLDER = path.join(__dirname, '..', '..', 'reference_files');
const MACHINE_REFERENCE_FILE = path.join(REFERENCE_FOLDER, 'Thamkhao.md');
const AUTJ_MACHINE_REFERENCE_FILE = path.join(REFERENCE_FOLDER, 'Thamkhao2.md');
const THAMKHAO3_MACHINE_REFERENCE_FILE = path.join(REFERENCE_FOLDER, 'Thamkhao3.md');

let machineReferenceCache = null;
let machineReferencePromise = null;

async function readMachineReferenceFile(filePath) {
    const markdown = await fs.promises.readFile(filePath, 'utf8');
    return parseMachineReferenceMarkdown(markdown);
}

async function loadMachineReference() {
    if (machineReferenceCache) return machineReferenceCache;
    if (machineReferencePromise) return machineReferencePromise;

    machineReferencePromise = Promise.all([
        readMachineReferenceFile(MACHINE_REFERENCE_FILE),
        readMachineReferenceFile(AUTJ_MACHINE_REFERENCE_FILE),
        readMachineReferenceFile(THAMKHAO3_MACHINE_REFERENCE_FILE)
    ]).then(([reference, autjReference, thamkhao3Reference]) => {
        Object.assign(reference, autjReference, thamkhao3Reference);
        machineReferenceCache = reference;
        return reference;
    }).catch((error) => {
        machineReferencePromise = null;
        throw error;
    });
    return machineReferencePromise;
}

function buildProjectSuggestions(projectKeys, referenceCodes, reference) {
    const keys = (Array.isArray(projectKeys) ? projectKeys : [projectKeys])
        .map(normalizeProjectCode)
        .filter(Boolean);
    if (!keys.length) return [];
    return referenceCodes
        .map((code) => {
            const score = Math.max(...keys.map((projectKey) => {
                const prefixA = (projectKey.match(/^[A-Z]+/) || [''])[0];
                const prefixB = (code.match(/^[A-Z]+/) || [''])[0];
                const digitA = projectKey.replace(/^[A-Z]+/, '');
                const digitB = code.replace(/^[A-Z]+/, '');
                const compactA = projectComparableCore(projectKey);
                const compactB = projectComparableCore(code);
                const samePrefix = prefixA && prefixA === prefixB ? 70 : 0;
                const crossKnownPrefix = prefixA && prefixB && prefixA !== prefixB && isKnownProjectPrefix(prefixA) && isKnownProjectPrefix(prefixB) ? 35 : 0;
                const contains = projectKey.includes(code) || code.includes(projectKey) ? 80 : 0;
                const coreContains = compactA && compactB && (compactA.includes(compactB) || compactB.includes(compactA)) ? 180 : 0;
                const lengthPenalty = Math.abs(compactA.length - compactB.length) * 8;
                return samePrefix
                    + crossKnownPrefix
                    + commonPrefixLength(projectKey, code) * 8
                    + commonPrefixLength(digitA, digitB) * 16
                    + commonPrefixLength(compactA, compactB) * 22
                    + commonSuffixLength(compactA, compactB) * 18
                    + contains
                    + coreContains
                    - lengthPenalty;
            }));
            return { code, score };
        })
        .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
        .slice(0, 128)
        .map(({ code }) => ({
            code,
            score: Math.max(...keys.map((projectKey) => projectSimilarityScore(projectKey, code))),
            info: reference[code] || {}
        }))
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
    while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
    return count;
}

function isKnownProjectPrefix(prefix) {
    return /^(?:AUT[A-Z]?|MEC)$/.test(String(prefix || '').toUpperCase());
}

function projectComparableCore(project) {
    const text = String(project || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const withoutPrefix = text.replace(/^(?:AUT[A-Z]?|MEC)/, '');
    const digits = withoutPrefix.replace(/[^0-9]/g, '');
    return digits.length >= 4 ? digits : withoutPrefix || text;
}

function projectCoreVariantExactScore(a, b) {
    if (!a || !b) return 0;
    return Math.max(projectCoreDeletionScore(a, b), projectCoreDeletionScore(b, a));
}

function projectCoreDeletionScore(longer, target) {
    if (!longer || !target || longer.length <= target.length) return 0;
    let best = 0;
    for (let index = 0; index < longer.length; index += 1) {
        if (`${longer.slice(0, index)}${longer.slice(index + 1)}` === target) {
            best = Math.max(best, longer[index] === '0' ? 620 : 360);
        }
    }
    return best;
}

function projectCoreDistance(a, b) {
    const variantsA = projectCoreVariants(a);
    const variantsB = projectCoreVariants(b);
    let best = levenshteinDistance(a, b);
    variantsA.forEach((variant) => { best = Math.min(best, levenshteinDistance(variant, b)); });
    variantsB.forEach((variant) => { best = Math.min(best, levenshteinDistance(a, variant)); });
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

async function lookup(projects, includeSuggestions) {
    const reference = await loadMachineReference();
    const referenceCodes = includeSuggestions ? Object.keys(reference) : [];
    return projects.map((project) => {
        const code = String(project || '').trim();
        const key = normalizeProjectCode(code);
        const info = reference[key] || {};
        return {
            project: code,
            found: Boolean(reference[key]),
            ten_may: info.machineName || '',
            ghi_chu: info.projectName || '',
            suggestions: includeSuggestions && !reference[key]
                ? buildProjectSuggestions(projectLookupCandidates(code), referenceCodes, reference)
                : []
        };
    });
}

parentPort.on('message', ({ id, projects, includeSuggestions }) => {
    lookup(projects, includeSuggestions).then(
        (result) => parentPort.postMessage({ id, result }),
        (error) => parentPort.postMessage({ id, error: error && error.message ? error.message : String(error) })
    );
});
