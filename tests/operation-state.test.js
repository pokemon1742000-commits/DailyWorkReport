const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('completed renderer operations release the save lock', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const setOperationStart = source.indexOf('        function setOperationState(');
    const runOperationStart = source.indexOf('        async function runOperation(', setOperationStart);
    const showToastStart = source.indexOf('        function showToast(', runOperationStart);

    assert.ok(setOperationStart >= 0 && runOperationStart > setOperationStart && showToastStart > runOperationStart);

    const operationFunctions = source.slice(setOperationStart, showToastStart);
    const createOperationController = new Function(
        'state',
        'els',
        'OPERATION_BUTTONS',
        'operationWaitMessage',
        'setSyncStatus',
        'setWeeklyStatus',
        'setNoProjectStatus',
        'setStatus',
        'updateSaveButton',
        'updateSearchDeleteControls',
        `${operationFunctions}\nreturn { runOperation };`
    );
    const state = { operation: null, operationDisabledButtons: new Map() };
    const els = {
        acceptBtn: { disabled: false },
        saveBtn: { disabled: false }
    };
    const noop = () => {};
    const { runOperation } = createOperationController(
        state,
        els,
        ['acceptBtn', 'saveBtn'],
        (operation) => `Đang ${operation.message}`,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop
    );
    let saveWasRun = false;

    assert.equal(await runOperation('xác nhận báo cáo', async () => 'preview ready'), 'preview ready');
    assert.equal(state.operation, null);
    assert.equal(els.saveBtn.disabled, false);

    assert.equal(await runOperation('lưu báo cáo', async () => {
        saveWasRun = true;
        return 'saved';
    }), 'saved');
    assert.equal(saveWasRun, true, 'save must not be rejected as if confirmation were still running');
    assert.equal(state.operation, null);
});
