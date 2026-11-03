// test/helpers.mjs

export function ctrl(opts) {
    const cfg = Object.assign({
        label: 'test',
        midiChannel: 0x0E,
        initialDeckA: 1, initialDeckB: 2,
        initialFxA: 1,   initialFxB: 2,
        initialActiveDeck: 'A',
        initialActiveFx:   'A',
        initialPatches: [],
        patches: {},
        sysex: true
    }, opts || {});
    const c = new myCatnip.Controller(cfg);
    c.init();
    c.hw.wireInputs(c);
    return c;
}

export function bootCat(overrides) {
    const cfg = Object.assign({
        label: 'test-cat',
        midiChannel: 0x0E
    }, overrides || {});
    myCatnip.bootCat(cfg);
    return myCatnip.controllers[myCatnip.controllers.length - 1];
}

export function bootLab(overrides) {
    const cfg = Object.assign({
        label: 'test-lab',
        midiChannel: 0x0D,
        modePrints: false,
        debugPrints: false
    }, overrides || {});
    myCatnip.bootLab([cfg]);
    return myCatnip.controllers[myCatnip.controllers.length - 1];
}

export function bootMulti(devices) {
    myCatnip.boot(devices);
    return myCatnip.controllers;
}

export function bind(ctrl, name, cfg) {
    const m = Object.assign({}, ctrl._applied);
    if (cfg === null || cfg === undefined) delete m[name];
    else m[name] = cfg;
    ctrl._applyResolved(m);
}

export function send(ctrl, name, value) {
    const b = ctrl.bindings[name];
    if (!b) throw new Error('send: no binding "' + name + '"');
    midi._input(b.midi[0], b.midi[1], value);
}
export function press(ctrl, name)    { send(ctrl, name, 127); }
export function release(ctrl, name)  { send(ctrl, name, 0);   }
export function turn(ctrl, name, v)  { send(ctrl, name, v);   }

export function fireCO(group, key, value) {
    engine._set(group, key, value);
    engine._trigger(group, key, value);
}
export function setCO(group, key, value) { engine._set(group, key, value); }
export function getCO(group, key)        { return engine.getValue(group, key); }

export function led(ctrl, name) {
    const b = ctrl.bindings[name];
    if (!b || b.idx < 0) return null;
    return ledAt(b.idx);
}

export function ledAt(idx) {
    const arr = midi._sysex;
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i][8] === idx) {
            const m = arr[i];
            return { idx, r: m[9], g: m[10], b: m[11], hw: m[12] };
        }
    }
    return null;
}

export function allLeds() {
    const out = [];
    for (let i = 0; i < midi._sysex.length; i++) {
        const m = midi._sysex[i];
        out.push({ idx: m[8], r: m[9], g: m[10], b: m[11], hw: m[12] });
    }
    return out;
}

export function clearLeds(ctrl) {
    midi._sysex = [];
    midi._short = [];
    if (ctrl) ctrl._ledCache = {};
}