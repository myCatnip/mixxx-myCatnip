// Minimal Mixxx engine mock. See INTERNALS.md for the runtime's
// CO surface.
//
// Test helpers:
//   _set(group, key, value)        write a CO value directly
//   _trigger(group, key, [value])  fire every connection on that CO
//   _fireOneShots()                run queued one-shot timers
//   _st                            soft-takeover call log
//   _reset()                       clear all state

'use strict';

module.exports = {
    _values: {},
    _params: {},
    _conns: {},
    _oneShots: [],
    _st: [],

    getValue: function(group, key) {
        var v = this._values[group + '|' + key];
        return (v === undefined) ? 0 : v;
    },
    setValue: function(group, key, value) {
        this._values[group + '|' + key] = value;
    },
    getParameter: function(group, key) {
        var v = this._params[group + '|' + key];
        return (typeof v === 'number') ? v : 0;
    },
    setParameter: function(group, key, value) {
        this._params[group + '|' + key] = value;
    },
    makeConnection: function(group, key, cb) {
        var k = group + '|' + key;
        if (!this._conns[k]) this._conns[k] = [];
        this._conns[k].push(cb);
        var self = this;
        return {
            disconnect: function() {
                var list = self._conns[k];
                if (!list) return;
                var i = list.indexOf(cb);
                if (i !== -1) list.splice(i, 1);
            }
        };
    },
    makeUnbufferedNoExceptionConnection: function(group, key, cb) {
        return this.makeConnection(group, key, cb);
    },
    beginTimer: function(ms, cb, oneShot) {
        var h = { ms: ms, cb: cb, oneShot: !!oneShot };
        if (oneShot) this._oneShots.push(h);
        return h;
    },
    // Removes the handle from the pending one-shot queue so
    // _fireOneShots() no longer runs it.
    stopTimer: function(handle) {
        if (!handle) return;
        var i = this._oneShots.indexOf(handle);
        if (i !== -1) this._oneShots.splice(i, 1);
    },
    softTakeover: function(group, key, enable) {
        this._st.push(['enable', group, key, enable]);
    },
    softTakeoverIgnoreNextValue: function(group, key) {
        this._st.push(['ignore', group, key]);
    },

    // Test helpers
    _set: function(group, key, value) {
        this._values[group + '|' + key] = value;
    },
    _trigger: function(group, key, value) {
        var list = this._conns[group + '|' + key];
        if (!list) return;
        var copy = list.slice();
        for (var i = 0; i < copy.length; i++) copy[i](value);
    },
    _fireOneShots: function() {
        var shots = this._oneShots.slice();
        this._oneShots = [];
        for (var i = 0; i < shots.length; i++) shots[i].cb();
    },
    _reset: function() {
        this._values = {};
        this._params = {};
        this._conns = {};
        this._oneShots = [];
        this._st = [];
    }
};