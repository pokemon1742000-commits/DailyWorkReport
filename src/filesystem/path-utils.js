const fs = require('fs');
const path = require('path');

function normalizeRootFolder(value) {
    return typeof value === 'string' ? path.normalize(value.trim()) : '';
}

function resolveStoredFolderPath(folderPath, rootFolder = '') {
    const requested = String(folderPath || '').trim();
    if (!requested) return '';
    if (path.isAbsolute(requested)) return path.normalize(requested);
    const root = normalizeRootFolder(rootFolder);
    return root ? path.resolve(root, requested) : path.resolve(requested);
}

function assertDirectory(folderPath, label = 'thư mục') {
    if (!folderPath) throw new Error(`Chưa có đường dẫn ${label}.`);
    if (!fs.existsSync(folderPath)) throw new Error(`Không tìm thấy ${label}:\n${folderPath}`);
    if (!fs.statSync(folderPath).isDirectory()) throw new Error(`Đường dẫn không phải là ${label}:\n${folderPath}`);
    return folderPath;
}

function ensureDirectory(folderPath, label = 'thư mục') {
    try {
        fs.mkdirSync(folderPath, { recursive: true });
        return assertDirectory(folderPath, label);
    } catch (error) {
        throw new Error(`Không tạo/truy cập được ${label}:\n${folderPath}\n\n${error.message || error}`);
    }
}

module.exports = {
    normalizeRootFolder,
    resolveStoredFolderPath,
    assertDirectory,
    ensureDirectory
};
