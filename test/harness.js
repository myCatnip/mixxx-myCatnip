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
// myCatnip.init.

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
        'myCatnip-lib-core.js',
        'myCatnip-lib-timing.js',
        'myCatnip-lib-schemes.js',
        'myCatnip-lib-binding.js',
        'myCatnip-hw-k3.js',
        'myCatnip-lib-controller.js',
        'myCatnip-lib-controller-colour.js',
        'myCatnip-lib-controller-beat.js',
        'myCatnip-lib-controller-render.js',
        'myCatnip-lib-controller-boot.js',
        'myCatnip-lib-funcs.js',
        'myCatnip-lib-inspect.js',

        // Cat config
        'myCatnip-cat-schemes.js',
        'myCatnip-cat-fx.js',
        'myCatnip-cat-top.js',
        'myCatnip-cat-bottom.js',
        'myCatnip-cat-overlays.js',
        'myCatnip-cat.js',

        // Lab runtime
        'myCatnip-lab.js'
    ];
    for (var i = 0; i < files.length; i++) {
        var src = fs.readFileSync(path.join(dir, files[i]), 'utf8');
        vm.runInContext(src, sandbox, { filename: files[i] });
    }

    sandbox.myCatnip.HW_K3.LED_TRANSFERS.linearTest = {
        r: [[0, 0], [127, 1]],
        g: [[0, 0], [127, 1]],
        b: [[0, 0], [127, 1]]
    };

    return sandbox;
};