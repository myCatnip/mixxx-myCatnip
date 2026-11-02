'use strict';

var H = require('./helpers');

// _syncFxLayout must collect swaps and apply them in one
// _batchPatches. Pre-fix, it looped replacePatch once per swap.

test('_syncFxLayout: applies swaps via one _batchPatches call', function(t) {
    var c = H.ctrl({
        patches: {
            topShared: {},
            fxLayout1: {},
            fxLayout2: {}
        }
    });
    c.activePatches = ['topShared', 'fxLayout1'];
    c.selectedFxCurrent = 2;

    var batchCount = 0, replaceCount = 0;
    var origBatch   = c._batchPatches;
    var origReplace = c.replacePatch;
    c._batchPatches = function(m) { batchCount++;   return origBatch.call(this, m); };
    c.replacePatch  = function(a, b) { replaceCount++; return origReplace.call(this, a, b); };

    var r = c._syncFxLayout();

    t.eq(batchCount,   1, '_syncFxLayout must use _batchPatches exactly once');
    t.eq(replaceCount, 0, '_syncFxLayout must not call replacePatch');
    t.eq(r.swapped, true);
    t.contains(c.activePatches, 'fxLayout2');
    t.notOk(c.activePatches.indexOf('fxLayout1') !== -1);
});

test('_syncFxLayout: no-op when nothing to swap', function(t) {
    var c = H.ctrl({ patches: { topShared: {} } });
    c.activePatches = ['topShared'];

    var batchCount = 0;
    var origBatch = c._batchPatches;
    c._batchPatches = function(m) { batchCount++; return origBatch.call(this, m); };

    var r = c._syncFxLayout();

    t.eq(batchCount, 0, '_syncFxLayout must not touch patches when nothing to swap');
    t.eq(r.swapped, false);
});