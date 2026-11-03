// test/harness.js — loads lib files into a vm sandbox with mocks.
//
// Returns the sandbox. No controller is created; tests build
// their own via helpers.bootCat() / helpers.ctrl().
//
// Load order mirrors k3-cat.js (framework + hw + config), minus
// entry modules that would overwrite myCatnip.init.

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
        Uint8Array: Uint8Array,
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
        'lib/core.js',
        'lib/timing.js',
        'lib/schemes.js',
        'lib/perception.js',
        'lib/binding.js',
        'hw/k3.js',
        'lib/controller.js',
        'lib/controller-colour.js',
        'lib/controller-beat.js',
        'lib/controller-render.js',
        'lib/controller-boot.js',
        'lib/funcs.js',
        'lib/inspect.js',

        // Cat config
        'config/k3-cat-schemes.js',
        'config/k3-cat-fx.js',
        'config/k3-cat-top.js',
        'config/k3-cat-bottom.js',
        'config/k3-cat-overlays.js',
        'config/k3-cat-config.js',

        // Lab runtime
        'config/k3-lab.js'
    ];
    for (var i = 0; i < files.length; i++) {
        var src = fs.readFileSync(path.join(dir, files[i]), 'utf8');
        vm.runInContext(src, sandbox, { filename: files[i] });
    }

    // Linear transfer curve — used by helpers._identityHw(). Same
    // shape as v2.0.0's linearTest entry.
    sandbox.myCatnip.HW_K3.LED_TRANSFERS.linearTest = {
        r: [[0, 0], [127, 1]],
        g: [[0, 0], [127, 1]],
        b: [[0, 0], [127, 1]]
    };

    return sandbox;
};