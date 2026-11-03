// test/harness.mjs — loads lib modules into the Node ESM runtime.
// Sets up mocks, imports framework + config + fixtures in order.
// Returns { engine, midi, print, _printLog }.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function load() {
    const engine   = require('./mocks/engine');
    const midi     = require('./mocks/midi');
    const printLog = [];
    const printFn  = (s) => { printLog.push(String(s)); };

    global.engine    = engine;
    global.midi      = midi;
    global.print     = printFn;
    global._printLog = printLog;

    // Framework
    await import('../lib/core.mjs');
    await import('../lib/timing.mjs');
    await import('../lib/schemes.mjs');
    await import('../lib/perception.mjs');
    await import('../lib/binding.mjs');
    await import('../hw/k3.mjs');
    await import('../lib/controller.mjs');
    await import('../lib/controller-colour.mjs');
    await import('../lib/controller-beat.mjs');
    await import('../lib/controller-render.mjs');
    await import('../lib/controller-boot.mjs');
    await import('../lib/funcs.mjs');
    await import('../lib/inspect.mjs');

    // Config + lab
    await import('../config/k3-cat-config.mjs');
    await import('../config/k3-lab.mjs');

    // Test fixtures
    await import('./hw-fake.mjs');
    await import('./hw-custom.mjs');

    // Legacy: linearTest curve still referenced by pre-perception tests
    global.myCatnip.HW_K3.LED_TRANSFERS.linearTest = {
        r: [[0, 0], [127, 1]],
        g: [[0, 0], [127, 1]],
        b: [[0, 0], [127, 1]]
    };

    return { engine, midi, print: printFn, _printLog: printLog };
}