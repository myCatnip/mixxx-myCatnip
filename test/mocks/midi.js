// Minimal Mixxx midi mock. Captures outgoing messages, stores
// input handlers so tests can fire them.

'use strict';

module.exports = {
    _short: [],
    _sysex: [],
    _handlers: {},       // "status|note" → cb

    sendShortMsg: function(status, note, value) {
        this._short.push([status, note, value]);
    },
    sendSysexMsg: function(msg, length) {
        this._sysex.push(msg.slice(0, length));
    },
    makeInputHandler: function(status, note, cb) {
        this._handlers[status + '|' + note] = cb;
    },

    // Test helpers
    _input: function(status, note, value) {
        var cb = this._handlers[status + '|' + note];
        if (cb) cb(0, 0, value, status);
    },
    _reset: function() {
        this._short = [];
        this._sysex = [];
        this._handlers = {};
    }
};
