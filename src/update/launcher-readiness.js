const fs = require('fs');

const LAUNCHER_READY_MARKER = 'Launcher started.';

function waitForLauncherReady(logFile, childProcess, options = {}) {
    const timeoutMs = options.timeoutMs || 15000;
    const pollIntervalMs = options.pollIntervalMs || 100;
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve, reject) => {
        const check = async () => {
            if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
                reject(new Error('Tiến trình PowerShell đã đóng trước khi xác nhận chạy script cài đặt.'));
                return;
            }

            try {
                const log = await fs.promises.readFile(logFile, 'utf8');
                if (log.includes(LAUNCHER_READY_MARKER)) {
                    resolve();
                    return;
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    reject(new Error(`Không đọc được log khởi chạy bộ cài:\n${logFile}\n\n${error.message || error}`));
                    return;
                }
            }

            if (Date.now() >= deadline) {
                reject(new Error(`PowerShell không xác nhận đã chạy bộ cài sau ${Math.round(timeoutMs / 1000)} giây.`));
                return;
            }

            setTimeout(check, pollIntervalMs);
        };

        check();
    });
}

module.exports = { waitForLauncherReady };
