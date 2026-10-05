const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function normalizeProjectCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function comparableText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
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

function isInvalidReportProject(report) {
    const rawProject = String(report && report.ma_du_an || '').trim().toUpperCase();
    const project = normalizeProjectCode(rawProject);
    return !project
        || /^CHUA[_ ]?XAC[_ ]?DINH/.test(rawProject)
        || /^KHONG[_ ]?CO[_ ]?MA[_ ]?DU[_ ]?AN/.test(rawProject)
        || project.startsWith('CHUAXACDINH')
        || project.startsWith('KHONGCOMADUAN');
}

function sanitizeFolderName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .trim();
}

function folderDateNameFromReport(report) {
    const iso = String(report && report.ngay_thuc_hien || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
        return `${iso[1]}${MONTH_NAMES[Number(iso[2]) - 1] || 'Unknown'}${String(iso[3]).padStart(2, '0')}`;
    }
    const fallback = String(report && report.folder_ngay_name || '').trim();
    return fallback && !/^unknown(date)?$/i.test(fallback) ? fallback : 'UnknownDate';
}

module.exports = {
    normalizeProjectCode,
    comparableText,
    comparableList,
    comparablePeople,
    reportDuplicateFingerprint,
    isInvalidReportProject,
    sanitizeFolderName,
    folderDateNameFromReport
};
