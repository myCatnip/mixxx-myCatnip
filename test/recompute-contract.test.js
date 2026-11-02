'use strict';

var H = require('./helpers');

// Phase model: _recompute wraps its work in _recomputeDepth, and
// _refreshAllLeds warns when called standalone right after a
// recompute without a reason string.
//
// The contract every patch mutation depends on:
//   _batchPatches  →  one _recompute  →  one internal refresh
// and callers do NOT refresh after.

// ── contract: one batch, one recompute, one refresh ────────

test('_batchPatches: one _recompute, one internal refresh', function(t) {
    var c = H.ctrl({ patches: { a: {}, b: {}, c: {} } });
    c.activePatches = ['a'];

    var recomputeCount = 0;
    var internalRefreshCount = 0;
    var origRecompute = c._recompute;
    var origRefresh = c._refreshAllLeds;

    c._recompute = function() {
        recomputeCount++;
        return origRecompute.call(this);
    };
    c._refreshAllLeds = function(why) {
        if (c._recomputeDepth > 0) internalRefreshCount++;
        return origRefresh.call(this, why);
    };

    c._batchPatches(function(p) {
        p.push('b');
        p.push('c');
    });

    t.eq(recomputeCount, 1,
         '_batchPatches must fire exactly one _recompute');
    t.eq(internalRefreshCount, 1,
         '_recompute must call _refreshAllLeds exactly once');
});

test('addPatch: one _recompute, one internal refresh', function(t) {
    var c = H.ctrl({ patches: { a: {}, b: {} } });
    c.activePatches = ['a'];

    var recomputeCount = 0;
    var internalRefreshCount = 0;
    var origRecompute = c._recompute;
    var origRefresh = c._refreshAllLeds;

    c._recompute = function() {
        recomputeCount++;
        return origRecompute.call(this);
    };
    c._refreshAllLeds = function(why) {
        if (c._recomputeDepth > 0) internalRefreshCount++;
        return origRefresh.call(this, why);
    };

    c.addPatch('b');

    t.eq(recomputeCount, 1);
    t.eq(internalRefreshCount, 1);
});

test('_recomputeDepth: 0 before, 0 after', function(t) {
    var c = H.ctrl({ patches: { a: {}, b: {} } });
    c.activePatches = ['a'];
    t.eq(c._recomputeDepth, 0, 'depth starts at 0');

    c.addPatch('b');
    t.eq(c._recomputeDepth, 0,
         'depth must be back to 0 after the recompute finishes');
});

test('_recomputeDepth: try/finally restores on throw', function(t) {
    var c = H.ctrl({ patches: { a: {} } });
    c.activePatches = ['a'];

    // Force _resolvePatch to throw mid-recompute by installing a
    // cyclic patch.
    c.patches.loopA = { patch: ['loopB'] };
    c.patches.loopB = { patch: ['loopA'] };
    c.activePatches = ['loopA'];

    var threw = false;
    try {
        c._recompute();
    } catch (e) {
        threw = true;
    }
    t.ok(threw, 'cyclic patches should throw');
    t.eq(c._recomputeDepth, 0,
         'depth must be restored even when the recompute throws');
});

// ── warning: redundant standalone refresh ──────────────────

test('redundant refresh: warns when called right after a recompute', function(t) {
    var c = H.ctrl({ patches: { a: {}, b: {} } });
    c.activePatches = ['a'];

    XoneK3._warned = {};

    c._batchPatches(function(p) { p.push('b'); });

    // Caller now (incorrectly) refreshes again without a reason.
    c._refreshAllLeds();

    var warned = false;
    for (var k in XoneK3._warned) {
        if (k.indexOf('redundantRefresh') === 0) { warned = true; break; }
    }
    t.ok(warned,
         'standalone refresh right after a recompute should warn');
});

test('annotated refresh: no warning with a reason string', function(t) {
    var c = H.ctrl({ patches: { a: {}, b: {} } });
    c.activePatches = ['a'];

    XoneK3._warned = {};

    c._batchPatches(function(p) { p.push('b'); });
    c._refreshAllLeds('test-reason');

    var warned = false;
    for (var k in XoneK3._warned) {
        if (k.indexOf('redundantRefresh') === 0) { warned = true; break; }
    }
    t.notOk(warned, 'annotated refresh should not warn');
});

test('_reapplyByTokens: annotated, no redundant-refresh warning', function(t) {
    var c = H.bootCat();
    XoneK3._warned = {};

    // Trigger a token reapply directly.
    c._reapplyByTokens(['$DECK_ACTIVE$']);

    var warned = false;
    for (var k in XoneK3._warned) {
        if (k.indexOf('redundantRefresh') === 0) { warned = true; break; }
    }
    t.notOk(warned,
         '_reapplyByTokens must annotate its refresh so it does not trip ' +
         'the redundant-refresh warning');
});

test('_refreshAllLeds: boot-time call does not warn', function(t) {
    // Boot does a lot of recomputes. None of them should trip the
    // warning if all internal callers are correct.
    XoneK3._warned = {};
    H.bootCat();

    var warned = false;
    for (var k in XoneK3._warned) {
        if (k.indexOf('redundantRefresh') === 0) { warned = true; break; }
    }
    t.notOk(warned, 'boot must not produce a redundant-refresh warning');
});

test('_recompute: _afterRecompute throw warns, still refreshes', function(t) {
    var c = H.ctrl({ patches: { a: {}, b: {} } });
    c.activePatches = ['a'];

    var refreshed = false;
    var origRefresh = c._refreshAllLeds.bind(c);
    c._refreshAllLeds = function(why) { refreshed = true; return origRefresh(why); };
    c._afterRecompute = function() { throw new Error('boom'); };

    XoneK3._warned = {};
    _printLog.length = 0;
    c.addPatch('b');

    t.ok(refreshed, '_refreshAllLeds must run despite _afterRecompute throw');
    t.contains(_printLog.join('\n'), '_afterRecompute threw on test');
});