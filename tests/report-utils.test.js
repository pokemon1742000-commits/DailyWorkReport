const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    normalizeProjectCode,
    reportDuplicateFingerprint,
    isInvalidReportProject,
    sanitizeFolderName,
    folderDateNameFromReport
} = require('../src/reports/report-utils');

test('report utilities normalize project and folder values', () => {
    assert.equal(normalizeProjectCode(' autm-260579 '), 'AUTM260579');
    assert.equal(sanitizeFolderName('Anh Khoa / Sáng'), 'AnhKhoaSang');
    assert.equal(folderDateNameFromReport({ ngay_thuc_hien: '2026-10-02', folder_ngay_name: 'UnknownDate' }), '2026October02');
});

test('report utilities classify invalid projects', () => {
    assert.equal(isInvalidReportProject({ ma_du_an: 'KHONG_CO_MA_DU_AN' }), true);
    assert.equal(isInvalidReportProject({ ma_du_an: 'CHUA_XAC_DINH_DU_AN' }), true);
    assert.equal(isInvalidReportProject({ ma_du_an: 'AUTM260579' }), false);
});

test('duplicate fingerprint is stable for equivalent report values', () => {
    const base = { ma_du_an: 'AUTM-260579', noi_dung_cong_viec: ['Lắp máy'], thoi_gian: [], nguoi_thuc_hien: [{ displayName: 'Ánh' }], trang_thai: ['Đã xong'], ngay_thuc_hien: '2026-10-02' };
    const equivalent = { ...base, ma_du_an: 'autm260579', nguoi_thuc_hien: [{ displayName: 'Anh' }], trang_thai: ['Da xong'] };
    assert.equal(reportDuplicateFingerprint(base), reportDuplicateFingerprint(equivalent));
});
