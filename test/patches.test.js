'use strict';

var H = require('./helpers');

// _resolvePatch, _parentList, _collectShiftPatches, _buildStack,
// _resolveStack, _patchActive.

// ── _resolvePatch ────────────────────────────────────────────

test('_resolvePatch: unknown name → empty', function(t) {
    var c = H.ctrl();
    t.eq(c._resolvePatch('nope', {}), {});
});

test('_resolvePatch: single patch, no parents', function(t) {
    var c = H.ctrl({patches: {base: {a: {x: 1}}}});
    t.eq(c._resolvePatch('base', {}).a.x, 1);
});

test('_resolvePatch: parent bindings survive child additions', function(t) {
    var c = H.ctrl({patches: {
        base:  {a: {x: 1}, b: {x: 1}},
        child: {patch: ['base'], c: {y: 2}}
    }});
    var r = c._resolvePatch('child', {});
    t.eq(r.a.x, 1);
    t.eq(r.b.x, 1);
    t.eq(r.c.y, 2);
});

test('_resolvePatch: same name replaced, not merged', function(t) {
    var c = H.ctrl({patches: {
        base:  {a: {x: 1, y: 2}},
        child: {patch: ['base'], a: {y: 3}}
    }});
    var r = c._resolvePatch('child', {});
    t.eq(r.a.x, undefined);
    t.eq(r.a.y, 3);
});

test('_resolvePatch: strips patch and _host', function(t) {
    var c = H.ctrl({patches: {
        base:  {a: {}},
        child: {patch: ['base'], _host: 'base', b: {}}
    }});
    var r = c._resolvePatch('child', {});
    t.eq(r.patch, undefined);
    t.eq(r._host, undefined);
});

test('_resolvePatch: cyclic inheritance throws', function(t) {
    var c = H.ctrl({patches: {
        a: {patch: ['b']},
        b: {patch: ['a']}
    }});
    t.throws(function() { c._resolvePatch('a', {}); }, /cycle/i);
});

test('_resolvePatch: multiple parents merge left-to-right', function(t) {
    var c = H.ctrl({patches: {
        p1: {a: {from: 'p1'}, b: {from: 'p1'}},
        p2: {b: {from: 'p2'}, c: {from: 'p2'}},
        child: {patch: ['p1', 'p2']}
    }});
    var r = c._resolvePatch('child', {});
    t.eq(r.a.from, 'p1');
    t.eq(r.b.from, 'p2');   // later parent wins
    t.eq(r.c.from, 'p2');
});

// ── _parentList ──────────────────────────────────────────────

test('_parentList: no patch field → empty', function(t) {
    var c = H.ctrl({patches: {a: {}}});
    t.eq(c._parentList('a'), []);
});

test('_parentList: string patch → single-element array', function(t) {
    var c = H.ctrl({patches: {a: {patch: 'b'}}});
    t.eq(c._parentList('a'), ['b']);
});

test('_parentList: array patch preserved', function(t) {
    var c = H.ctrl({patches: {a: {patch: ['b', 'c']}}});
    t.eq(c._parentList('a'), ['b', 'c']);
});

// ── _patchActive ─────────────────────────────────────────────

test('_patchActive: plain patch active when in list', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    t.ok(c._patchActive('cue'));
});

test('_patchActive: plain patch inactive when absent', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = [];
    t.notOk(c._patchActive('cue'));
});

test('_patchActive: overlay inactive without host', function(t) {
    var c = H.ctrl({patches: {
        topShared: {},
        myOverlay: {_host: 'topShared'}
    }});
    c.activePatches = ['myOverlay'];
    t.notOk(c._patchActive('myOverlay'));
});

test('_patchActive: overlay active with host', function(t) {
    var c = H.ctrl({patches: {
        topShared: {},
        myOverlay: {_host: 'topShared'}
    }});
    c.activePatches = ['topShared', 'myOverlay'];
    t.ok(c._patchActive('myOverlay'));
});

test('_patchActive: overlay with multiple hosts', function(t) {
    var c = H.ctrl({patches: {
        topShared: {}, twoDeck: {},
        myOverlay: {_host: ['topShared', 'twoDeck']}
    }});
    c.activePatches = ['twoDeck', 'myOverlay'];
    t.ok(c._patchActive('myOverlay'));
});

test('_patchActive: unknown patch → false', function(t) {
    var c = H.ctrl();
    t.notOk(c._patchActive('nope'));
});

// ── _collectShiftPatches ────────────────────────────────────

test('_collectShiftPatches: collects direct _shift', function(t) {
    var c = H.ctrl({patches: {
        topShared: {_shift: 'topSharedShift'},
        topSharedShift: {}
    }});
    var out = [], seen = {};
    c._collectShiftPatches('topShared', out, seen);
    t.eq(out, ['topSharedShift']);
});

test('_collectShiftPatches: collects parent shift first', function(t) {
    var c = H.ctrl({patches: {
        base:  {_shift: 'baseShift'},
        child: {patch: ['base'], _shift: 'childShift'},
        baseShift: {}, childShift: {}
    }});
    var out = [], seen = {};
    c._collectShiftPatches('child', out, seen);
    t.eq(out, ['baseShift', 'childShift']);
});

test('_collectShiftPatches: dedupes shared parents', function(t) {
    var c = H.ctrl({patches: {
        p1: {_shift: 'sharedShift'},
        p2: {patch: ['p1']},
        p3: {patch: ['p1']},
        child: {patch: ['p2', 'p3']},
        sharedShift: {}
    }});
    var out = [], seen = {};
    c._collectShiftPatches('child', out, seen);
    t.eq(out, ['sharedShift']);
});

// ── _buildStack ──────────────────────────────────────────────

test('_buildStack: single active patch', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    t.eq(c._buildStack(), ['cue']);
});

test('_buildStack: multiple active patches in order', function(t) {
    var c = H.ctrl({patches: {topShared: {}, cue: {}}});
    c.activePatches = ['topShared', 'cue'];
    t.eq(c._buildStack(), ['topShared', 'cue']);
});

test('_buildStack: missing patches skipped', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['topShared', 'cue'];
    t.eq(c._buildStack(), ['cue']);
});

test('_buildStack: inactive overlay skipped', function(t) {
    var c = H.ctrl({patches: {
        topShared: {},
        myOverlay: {_host: 'notActive'}
    }});
    c.activePatches = ['topShared', 'myOverlay'];
    t.eq(c._buildStack(), ['topShared']);
});

test('_buildStack: chord appended last even with shift', function(t) {
    var c = H.ctrl({patches: {
        topShared: {_shift: 'topSharedShift'},
        topSharedShift: {},
        chord: {}
    }});
    c.activePatches = ['topShared', 'chord'];
    c.modifiers.shift = true;
    var stack = c._buildStack();
    t.eq(stack[stack.length - 1], 'chord');
});

test('_buildStack: shift companions included when shifted', function(t) {
    var c = H.ctrl({patches: {
        topShared: {_shift: 'topSharedShift'},
        topSharedShift: {press0: {}}
    }});
    c.activePatches = ['topShared'];
    c.modifiers.shift = true;
    t.contains(c._buildStack(), 'topSharedShift');
});

test('_buildStack: shift companions excluded when not shifted', function(t) {
    var c = H.ctrl({patches: {
        topShared: {_shift: 'topSharedShift'},
        topSharedShift: {}
    }});
    c.activePatches = ['topShared'];
    c.modifiers.shift = false;
    t.notOk(c._buildStack().indexOf('topSharedShift') !== -1);
});

test('_buildStack: duplicates avoided', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue', 'cue'];
    t.eq(c._buildStack(), ['cue']);
});

// ── _resolveStack ────────────────────────────────────────────

test('_resolveStack: merges in order, later wins', function(t) {
    var c = H.ctrl({patches: {
        topShared: {press0: {group: 'a'}},
        cue:       {press0: {group: 'b'}}
    }});
    var r = c._resolveStack(['topShared', 'cue']);
    t.eq(r.press0.group, 'b');
});

test('_resolveStack: non-overlapping bindings merged', function(t) {
    var c = H.ctrl({patches: {
        topShared: {press0: {group: 'a'}},
        cue:       {press1: {group: 'b'}}
    }});
    var r = c._resolveStack(['topShared', 'cue']);
    t.eq(r.press0.group, 'a');
    t.eq(r.press1.group, 'b');
});

// ── addPatch / removePatch / replacePatch ──────────────────

test('addPatch: appends to activePatches', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = [];
    c.addPatch('cue');
    t.eq(c.activePatches, ['cue']);
});

test('addPatch: idempotent', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    c.addPatch('cue');
    t.eq(c.activePatches, ['cue']);
});

test('addPatch: unknown name warns, no-op', function(t) {
    var c = H.ctrl();
    c.activePatches = [];
    c.addPatch('nope');
    t.eq(c.activePatches, []);
});

test('removePatch: removes by name', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}});
    c.activePatches = ['cue', 'loop'];
    c.removePatch('cue');
    t.eq(c.activePatches, ['loop']);
});

test('removePatch: missing name no-op', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    c.removePatch('loop');
    t.eq(c.activePatches, ['cue']);
});

test('replacePatch: swaps in place', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}});
    c.activePatches = ['cue', 'loop'];
    c.replacePatch('cue', 'loop');
    t.eq(c.activePatches, ['loop', 'loop']);
});

test('replacePatch: no-op when from missing', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    c.replacePatch('loop', 'cue');
    t.eq(c.activePatches, ['cue']);
});

test('replacePatch: unknown target no-op', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];
    c.replacePatch('cue', 'nope');
    t.eq(c.activePatches, ['cue']);
});

test('replacePatch: same name → no recompute, no change event', function(t) {
    var c = H.ctrl({patches: {cue: {}}});
    c.activePatches = ['cue'];

    var changes = 0;
    c._onPatchChange = function() { changes++; };
    var recomputes = 0;
    var orig = c._recompute.bind(c);
    c._recompute = function() { recomputes++; return orig(); };

    c.replacePatch('cue', 'cue');

    t.eq(changes, 0, 'no _onPatchChange for same-name replace');
    t.eq(recomputes, 0, 'no recompute for same-name replace');
});