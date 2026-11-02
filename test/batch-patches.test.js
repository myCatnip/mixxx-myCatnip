'use strict';

var H = require('./helpers');

// _batchPatches internals: one recompute per call, one
// _onPatchChange per name that appeared or disappeared.

function withSpies(c) {
    var log = { recomputes: 0, changes: [] };
    var origRecompute = c._recompute.bind(c);
    var origChange    = c._onPatchChange.bind(c);
    c._recompute = function() {
        log.recomputes++;
        return origRecompute();
    };
    c._onPatchChange = function(f, t) {
        log.changes.push([f, t]);
        return origChange(f, t);
    };
    return log;
}

// ── no-op paths ────────────────────────────────────────────

test('_batchPatches: mutator does nothing → no recompute, no events', function(t) {
    var c = H.ctrl({patches: {cue: {}}, initialPatches: ['cue']});
    var log = withSpies(c);
    c._batchPatches(function() {});
    t.eq(log.recomputes, 0);
    t.eq(log.changes.length, 0);
});

test('_batchPatches: same names, same order → no recompute', function(t) {
    var c = H.ctrl({patches: {cue: {}}, initialPatches: ['cue']});
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches[0] = 'cue';
    });
    t.eq(log.recomputes, 0);
    t.eq(log.changes.length, 0);
});

// ── additions ──────────────────────────────────────────────

test('_batchPatches: push → one recompute + one (null, name) event', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}, initialPatches: ['cue']});
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches.push('loop');
    });
    t.eq(log.recomputes, 1);
    t.eq(log.changes.length, 1);
    t.eq(log.changes[0][0], null);
    t.eq(log.changes[0][1], 'loop');
});

test('_batchPatches: two pushes → two events, still one recompute', function(t) {
    var c = H.ctrl({patches: {a: {}, b: {}}, initialPatches: []});
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches.push('a');
        patches.push('b');
    });
    t.eq(log.recomputes, 1);
    t.eq(log.changes.length, 2);
});

// ── removals ───────────────────────────────────────────────

test('_batchPatches: splice → (name, null) event', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}, initialPatches: ['cue', 'loop']});
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches.splice(patches.indexOf('loop'), 1);
    });
    t.eq(log.recomputes, 1);
    t.eq(log.changes.length, 1);
    t.eq(log.changes[0][0], 'loop');
    t.eq(log.changes[0][1], null);
});

// ── swaps ──────────────────────────────────────────────────

test('_batchPatches: in-place swap fires both removal and addition', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}, initialPatches: ['cue']});
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches[0] = 'loop';
    });
    t.eq(log.recomputes, 1);
    t.eq(log.changes.length, 2);
    var removed = log.changes.filter(function(e) { return e[0] === 'cue' && e[1] === null; });
    var added   = log.changes.filter(function(e) { return e[0] === null && e[1] === 'loop'; });
    t.eq(removed.length, 1);
    t.eq(added.length, 1);
});

// ── reorder ────────────────────────────────────────────────

test('_batchPatches: pure reorder recomputes but fires no change events', function(t) {
    var c = H.ctrl({patches: {a: {}, b: {}}, initialPatches: ['a', 'b']});
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches.reverse();
    });
    t.eq(log.recomputes, 1);
    // Order changed → recompute. Names unchanged as a set → no
    // _onPatchChange.
    t.eq(log.changes.length, 0);
});

// ── multiple simultaneous changes ─────────────────────────

test('_batchPatches: two removals + two additions → four events, one recompute', function(t) {
    var c = H.ctrl({
        patches: {a: {}, b: {}, c: {}, d: {}},
        initialPatches: ['a', 'b']
    });
    var log = withSpies(c);
    c._batchPatches(function(patches) {
        patches.splice(patches.indexOf('a'), 1);
        patches.splice(patches.indexOf('b'), 1);
        patches.push('c');
        patches.push('d');
    });
    t.eq(log.recomputes, 1);
    t.eq(log.changes.length, 4);
});

// ── mutator contract ───────────────────────────────────────

test('_batchPatches: mutator receives a copy, not the live array', function(t) {
    var c = H.ctrl({patches: {cue: {}, loop: {}}, initialPatches: ['cue']});
    var original = c.activePatches;
    var snapshotBefore = original.slice();
    var received = null;

    c._batchPatches(function(patches) {
        received = patches;
        t.neq(patches, original,
              'mutator must not receive the live array');
        t.eq(original.slice(), snapshotBefore,
              'activePatches must not change while mutator runs');
        patches.push('loop');
    });

    t.eq(c.activePatches, ['cue', 'loop'],
         'result lands in activePatches');
    t.eq(received, ['cue', 'loop'],
         'copy still shows the mutator edits');
});

// ── setTopMode uses it ────────────────────────────────────

test('setTopMode: one recompute regardless of patch churn', function(t) {
    var c = H.bootCat({initialPatches: ['twoDeck', 'fxLayoutA1', 'fxLayoutB1', 'cue']});
    var log = withSpies(c);
    c.setTopMode('focus');
    // Removes 5, adds 2 → one batch, one recompute.
    t.eq(log.recomputes, 1);
});

test('setTopMode: fires change events for every added/removed name', function(t) {
    var c = H.bootCat({initialPatches: ['topShared', 'fxLayout1', 'cue']});
    var log = withSpies(c);
    c.setTopMode('twoDeck');
    // Removes topShared + fxLayout1 (2), adds twoDeck +
    // fxLayoutA1 + fxLayoutB2 (3) → 5 events.
    t.eq(log.recomputes, 1);
    t.eq(log.changes.length, 5);
});

// ── contract enforcement ───────────────────────────────────

test('_batchPatches: nested call throws', function(t) {
    var c = H.ctrl({patches: {a: {}, b: {}}});
    c.activePatches = ['a'];
    t.throws(function() {
        c._batchPatches(function() {
            c._batchPatches(function() {});
        });
    }, /cannot nest/);
});

test('_batchPatches: addPatch inside mutator throws', function(t) {
    var c = H.ctrl({patches: {a: {}, b: {}}});
    c.activePatches = ['a'];
    t.throws(function() {
        c._batchPatches(function() {
            c.addPatch('b');
        });
    }, /inside a _batchPatches mutator/);
});

test('_batchPatches: removePatch inside mutator throws', function(t) {
    var c = H.ctrl({patches: {a: {}, b: {}}});
    c.activePatches = ['a', 'b'];
    t.throws(function() {
        c._batchPatches(function() {
            c.removePatch('b');
        });
    }, /inside a _batchPatches mutator/);
});

test('_batchPatches: replacePatch inside mutator throws', function(t) {
    var c = H.ctrl({patches: {a: {}, b: {}}});
    c.activePatches = ['a'];
    t.throws(function() {
        c._batchPatches(function() {
            c.replacePatch('a', 'b');
        });
    }, /inside a _batchPatches mutator/);
});