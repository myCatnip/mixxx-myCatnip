'use strict';

var H = require('./helpers');

function callFunc(c, name, args, v) {
    var bl = {_ctrl: c};
    XoneK3.FUNCS[name].call(bl, args || [], 0, 0,
                            (v === undefined) ? 127 : v, 0x90);
}

function tree() {
    return {
        topShared: {},
        twoDeck:   {},
        fxRouting: {_host: ['topShared', 'twoDeck']},
        selectAB:  {_host: ['topShared', 'twoDeck']},
        myOverlay: {_host: 'topShared'}
    };
}

// ── toggleOverlay ────────────────────────────────────────────

test('toggleOverlay: adds when absent', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared'];
    callFunc(c, 'toggleOverlay', ['myOverlay']);
    t.contains(c.activePatches, 'myOverlay');
});

test('toggleOverlay: removes when present', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared', 'myOverlay'];
    callFunc(c, 'toggleOverlay', ['myOverlay']);
    t.notOk(c.activePatches.indexOf('myOverlay') !== -1);
    t.contains(c.activePatches, 'topShared');
});

test('toggleOverlay: sibling list clears before adding', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared', 'selectAB'];
    callFunc(c, 'toggleOverlay', ['fxRouting', ['selectAB']]);
    t.notOk(c.activePatches.indexOf('selectAB') !== -1);
    t.contains(c.activePatches, 'fxRouting');
});

test('toggleOverlay: target appearing in sibling list not removed', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared'];
    callFunc(c, 'toggleOverlay', ['myOverlay', ['myOverlay']]);
    t.contains(c.activePatches, 'myOverlay');
});

test('toggleOverlay: release event no-op', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared'];
    callFunc(c, 'toggleOverlay', ['myOverlay'], 0);
    t.eq(c.activePatches, ['topShared']);
});

test('toggleOverlay: no args no-op', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared'];
    callFunc(c, 'toggleOverlay', []);
    t.eq(c.activePatches, ['topShared']);
});

test('toggleOverlay: sibling clearing skipped when target already active', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared', 'fxRouting', 'selectAB'];
    callFunc(c, 'toggleOverlay', ['fxRouting', ['selectAB']]);
    t.notOk(c.activePatches.indexOf('fxRouting') !== -1);
    t.contains(c.activePatches, 'selectAB');
});

// ── layerExitOverlay ─────────────────────────────────────────

test('layerExitOverlay: removes named patch', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared', 'myOverlay'];
    callFunc(c, 'layerExitOverlay', ['myOverlay']);
    t.notOk(c.activePatches.indexOf('myOverlay') !== -1);
    t.contains(c.activePatches, 'topShared');
});

test('layerExitOverlay: release no-op', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared', 'myOverlay'];
    callFunc(c, 'layerExitOverlay', ['myOverlay'], 0);
    t.contains(c.activePatches, 'myOverlay');
});

test('layerExitOverlay: unknown name no-op', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['topShared'];
    callFunc(c, 'layerExitOverlay', ['noSuchPatch']);
    t.eq(c.activePatches, ['topShared']);
});

// ── _host gating ─────────────────────────────────────────────

test('_host: overlay only applies when host in activePatches', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['fxRouting'];
    t.notOk(c._patchActive('fxRouting'));

    c.activePatches = ['topShared', 'fxRouting'];
    t.ok(c._patchActive('fxRouting'));
});

test('_host array: any host match activates', function(t) {
    var c = H.ctrl({patches: tree()});
    c.activePatches = ['twoDeck', 'selectAB'];
    t.ok(c._patchActive('selectAB'));
});

// ── overlay with binding nullification ───────────────────────

test('overlay can null a binding with {}', function(t) {
    var c = H.ctrl({patches: {
        cue:   {grid0_0: {group: 'a', inKey: 'x'}},
        ovr:   {_host: 'cue', grid0_0: {}}
    }});
    c.activePatches = ['cue'];
    var stack = c._resolveStack(c._buildStack());
    t.eq(stack.grid0_0.group, 'a');

    c.activePatches = ['cue', 'ovr'];
    stack = c._resolveStack(c._buildStack());
    t.eq(stack.grid0_0.group, undefined);
});