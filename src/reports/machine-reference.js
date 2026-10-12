const path = require('path');
const { Worker } = require('worker_threads');

let worker;
let nextRequestId = 1;
const pendingRequests = new Map();

function failWorker(currentWorker, error) {
    if (worker !== currentWorker) return;
    worker = null;
    pendingRequests.forEach(({ reject }) => reject(error));
    pendingRequests.clear();
}

function getWorker() {
    if (worker) return worker;

    const currentWorker = new Worker(path.join(__dirname, 'machine-reference-worker.js'));
    worker = currentWorker;
    currentWorker.unref();
    currentWorker.on('message', ({ id, result, error }) => {
        const request = pendingRequests.get(id);
        if (!request) return;
        pendingRequests.delete(id);
        if (!pendingRequests.size) currentWorker.unref();
        if (error) request.reject(new Error(error));
        else request.resolve(result);
    });
    currentWorker.on('error', (error) => failWorker(currentWorker, error));
    currentWorker.on('exit', (code) => {
        if (code !== 0 || pendingRequests.size) {
            failWorker(currentWorker, new Error(`Tiến trình kiểm tra mã dự án đã dừng (${code}).`));
        } else if (worker === currentWorker) {
            worker = null;
        }
    });
    return currentWorker;
}

function lookupMachineReferenceByProjects(projects, options = {}) {
    const currentWorker = getWorker();
    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        currentWorker.ref();
        try {
            currentWorker.postMessage({
                id,
                projects: Array.isArray(projects) ? projects : [],
                includeSuggestions: options.includeSuggestions !== false
            });
        } catch (error) {
            pendingRequests.delete(id);
            if (!pendingRequests.size) currentWorker.unref();
            reject(error);
        }
    });
}

module.exports = { lookupMachineReferenceByProjects };
