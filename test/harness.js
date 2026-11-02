// test/harness.js — loads lib files into a vm sandbox with mocks.
//
// Returns the sandbox. No controller is created; tests build
// their own via helpers.bootCat() / helpers.ctrl().
//
// Load order mirrors every preset .midi.xml:
//   lib-core → lib-schemes → lib-binding → lib-controller →
//   lib-controller-colour → lib-controller-beat →
//   lib-controller-render → lib-controller-boot → lib-funcs →
//   lib-inspect → cat-schemes → cat-fx → cat-top → cat-bottom →
//   cat-overlays → cat → lab
//
// colorlab.js is not loaded — no test needs it, and it overrides
// XoneK3.init.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports.load = function() {
    var engine   = require('./mocks/engine');
    var midi     = require('./mocks/midi');
    var printLog = [];
    var printFn  = function(s) { printLog.push(String(s)); };

    var sandbox = {
        console: console,
        Math: Math, JSON: JSON, Date: Date,
        Array: Array, Object: Object, String: String, Number: Number,
        Boolean: Boolean, RegExp: RegExp, Error: Error,
        WeakMap: WeakMap, Map: Map, Set: Set,
        isNaN: isNaN, isFinite: isFinite,
        parseInt: parseInt, parseFloat: parseFloat,
        Infinity: Infinity, NaN: NaN, undefined: undefined,
        engine: engine,
        midi: midi,
        print: printFn,
        _printLog: printLog
    };
    vm.createContext(sandbox);

    var dir = path.resolve(__dirname, '..');
    var files = [
        'xone-k3-lib-core.js',
        'xone-k3-lib-timing.js',
        'xone-k3-lib-schemes.js',
        'xone-k3-lib-binding.js',
        'xone-k3-hw-k3.js',           
        'xone-k3-lib-controller.js',
        'xone-k3-lib-controller-colour.js',
        'xone-k3-lib-controller-beat.js',
        'xone-k3-lib-controller-render.js',
        'xone-k3-lib-controller-boot.js',
        'xone-k3-lib-funcs.js',
        'xone-k3-lib-inspect.js',

        // Cat config
        'xone-k3-cat-schemes.js',
        'xone-k3-cat-fx.js',
        'xone-k3-cat-top.js',
        'xone-k3-cat-bottom.js',
        'xone-k3-cat-overlays.js',
        'xone-k3-cat.js',

        // Lab runtime
        'xone-k3-lab.js'
    ];
    for (var i = 0; i < files.length; i++) {
        var src = fs.readFileSync(path.join(dir, files[i]), 'utf8');
        vm.runInContext(src, sandbox, { filename: files[i] });
    }

    sandbox.XoneK3.HW_K3.LED_TRANSFERS.linearTest = {
        r: [[0, 0], [127, 1]],
        g: [[0, 0], [127, 1]],
        b: [[0, 0], [127, 1]]
    };

    return sandbox;
};