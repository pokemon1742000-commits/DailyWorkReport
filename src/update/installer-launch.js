const fs = require('fs');

async function openDownloadedInstaller(shell, installerPath) {
    let stats;
    try {
        stats = await fs.promises.stat(installerPath);
    } catch (error) {
        throw new Error(`Không tìm thấy file cài đặt:\n${installerPath}\n\n${error.message || error}`);
    }
    if (!stats.isFile() || stats.size === 0) {
        throw new Error(`File cài đặt không hợp lệ hoặc rỗng:\n${installerPath}`);
    }

    const launchError = await shell.openPath(installerPath);
    if (launchError) {
        throw new Error(`Windows báo lỗi khi mở bộ cài: ${launchError}`);
    }
}

module.exports = { openDownloadedInstaller };
