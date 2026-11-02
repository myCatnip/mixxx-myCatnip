// myCatnip-lib-controller-boot.js — init / shutdown, boot, halt.
//
// Loaded after lib-controller-render.js. Extends
// Controller.prototype. Defines myCatnip.boot / bootLab / halt.
//
// Input wiring is the hardware descriptor's job (hw.wireInputs) —
// the status-nibble test that distinguishes "also wire note-off"
// from "CC only" is MIDI-specific and belongs with the hardware
// that knows its own transport. _bootWith delegates.

'use strict';

if (typeof myCatnip === 'undefined') {
    throw new Error('Xone K3: myCatnip-lib-controller-boot.js — myCatnip-lib-core.js must load first');
}
if (typeof myCatnip._requireLoad !== 'function') {
    throw new Error('Xone K3: myCatnip-lib-controller-boot.js — myCatnip-lib-core.js must load first');
}
myCatnip._requireLoad('myCatnip-lib-controller-boot.js',
    ['Controller', 'HW_K3', 'applyPacing']);

(function() {
    // ============================================================
    // INIT / SHUTDOWN
    // ============================================================
    myCatnip.Controller.prototype.init = function() {
        this._blankLeds();
        this._recompute();
        var self = this;
        this._initExtra();
        this._validateBindings();

        // Delayed beat-clock reopen. The initial _recompute can
        // race the CO tree on Mixxx startup — connections
        // register but never fire. 250 ms lets the tree settle.
        engine.beginTimer(250, function() {
            if (self._shuttingDown) return;
            self._closeBeatClocks();
            self._syncBeatClocks();
            self._syncFxLayout();
            self._startBootSettle();
        }, true);
    };
    myCatnip.Controller.prototype._initExtra = function() {};
    myCatnip.Controller.prototype._shutdownExtra = function() {};

    // Sets _shuttingDown (blocks every other send path),
    // enqueues the blanks, then polls until the hardware reports
    // no pending writes before tearing down beat clocks.
    // Framework doesn't know what a queue is — hw.anyPendingWrites
    // is the abstraction. For K3 that's
    // ctrl._pacers.led.length() > 0; a zero-throttle hardware
    // that sends synchronously returns false immediately.
    myCatnip.Controller.prototype.shutdown = function() {
        if (this._shuttingDown) return;
        this._shuttingDown = true;

        this._blankLeds();

        var self = this;
        var elapsedWait = 0;
        var tick = 20;
        var maxWait = 2000;

        function finalize() {
            if (self.hw.anyPendingWrites(self) && elapsedWait < maxWait) {
                elapsedWait += tick;
                engine.beginTimer(tick, finalize, true);
                return;
            }
            // Drained, or gave up after maxWait. Either way, drop
            // any remaining queue state and stop the timers before
            // tearing down.
            for (var name in self._pacers) self._pacers[name].clear();
            self._closeBeatClocks();
            self._shutdownExtra();
        }

        engine.beginTimer(tick, finalize, true);
    };

    // ============================================================
    // BOOT / HALT
    // ============================================================
    myCatnip.controllers = [];

    myCatnip._bootWith = function(devices, Ctor, label) {
        print('\n=== Xone K3 INIT' + (label ? ' (' + label + ')' : '') + ' ===');
        // Shut down any controllers from a previous boot (console
        // init() without a preset reload). Mixxx's controller
        // framework calls shutdown before init on preset reload,
        // so this only matters for manual re-init — but the old
        // controllers' timers and CO connections would otherwise
        // leak and keep firing alongside the new ones.
        myCatnip.controllers.forEach(function(c) { c.shutdown(); });
        myCatnip.controllers = [];
        myCatnip._schemeCache = {};
        myCatnip._compiledCache = {};
        myCatnip._warned = Object.create(null);
        myCatnip._modeSeen = { edit: false, slots: false };
        myCatnip.MODE_PRINTS = false;
        myCatnip._funcIdCounter = 0;
        myCatnip._funcIdMap = new WeakMap();
        myCatnip._segsCacheCounter = 0;

        if (!Array.isArray(devices)) devices = [devices];

        // Apply the hardware's pacing overrides. Idempotent —
        // bootCat also calls this (before calling myCatnip.boot) for
        // the window between building cfg and running boot. This
        // is the fallback for direct myCatnip.boot(cfg) /
        // bootLab(cfg) calls that bypass bootCat. Primary hw =
        // first device's hw, defaulting to HW_K3. Pacing is global
        // (TIMING); multiple devices with different hw would need
        // per-device restructuring if that ever becomes a real case.
        var primaryHw = (devices[0] && devices[0].hw) || myCatnip.HW_K3;
        myCatnip.applyPacing(primaryHw.pacing);

        myCatnip.TIME_SIG = (devices[0] && devices[0].timeSig)
            ? devices[0].timeSig : null;
        devices.forEach(function(d) {
            print('  spawning ' + d.label + ' ch 0x' + d.midiChannel.toString(16));
            try {
                var ctrl = new Ctor(d);
                ctrl.init();
                ctrl.hw.wireInputs(ctrl);
                myCatnip.controllers.push(ctrl);
            } catch (e) {
                myCatnip._warnOnce('bootDeviceThrow:' + (d.label || '?'),
                    'device "' + (d.label || '?') + '" failed to boot: ' +
                    (e && e.message ? e.message : e));
            }
        });
        myCatnip._auditSnapshotFields();
    };

    myCatnip.boot    = function(devices) { myCatnip._bootWith(devices, myCatnip.Controller, ''); };
    myCatnip.bootLab = function(devices) { myCatnip._bootWith(devices, myCatnip.LabController, 'colorLab'); };

    myCatnip.halt = function() {
        print('\n=== Xone K3 SHUTDOWN ===');
        myCatnip.controllers.forEach(function(ctrl) { ctrl.shutdown(); });
        myCatnip.controllers = [];
        print('=== shutdown requested (teardown continues async) ===');
    };
})();