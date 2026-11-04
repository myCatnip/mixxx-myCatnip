// lib/controller-boot.js — init / shutdown, boot, halt.
//
// Loaded after lib/controller-render.js. Extends
// Controller.prototype. Defines myCatnip.boot / bootLab / halt.
//
// v2.1.0: _bootWith resets shared namespace (timeSig,
// lastLoopTouchMs, warned, controllers). No per-controller
// _lastLoopTouchMs. No calibration fields in DEFAULTS — perception
// reads from hw.PERCEPTION.
//
// v2.3.0: _bootWith honours a per-device `Ctor` override so a
// single preset can boot mixed Controller subclasses (K3 +
// Inpulse, etc.). Falls back to the second _bootWith argument
// when `d.Ctor` is unset, so all existing single-Ctor callers
// are unchanged.


// ============================================================
// INIT / SHUTDOWN
// ============================================================
myCatnip.Controller.prototype.init = function() {
    this._blankLeds();
    this._recompute();
    var self = this;

    // Subclass hooks must not abort init — a hardware quirk in
    // _initExtra (bad CO group, VU meter not present) would
    // otherwise skip wireInputs entirely, leaving the surface dead.
    try { this._initExtra(); }
    catch (e) {
        myCatnip._warnOnce('initExtraThrow:' + this.label,
            '_initExtra threw on ' + this.label + ': ' +
            (e && e.message ? e.message : e));
    }

    try { this._validateBindings(); }
    catch (e) {
        myCatnip._warnOnce('validateBindingsThrow:' + this.label,
            '_validateBindings threw on ' + this.label + ': ' +
            (e && e.message ? e.message : e));
    }

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

// Shutdown sequence:
//   1. Set _shuttingDown — blocks every other send path
//   2. Remove from shared.controllers — a peer reading during
//      drain must see this controller as gone
//   3. Blank the LEDs — enqueues per-HW blank frames
//   4. Poll hw.anyPendingWrites until drained, capped at maxWait
//   5. Cancel pacers, tear down beat clocks, run _shutdownExtra
//
// The poll exists because the sysex drain timer keeps running
// after _shuttingDown (so the blank frames still reach the
// hardware) — this loop waits for the queue to empty before
// tearing down beat clocks and the subclass teardown hooks.
// Inpulse has no pending writes (short messages inline) so the
// poll is a no-op for it.
myCatnip.Controller.prototype.shutdown = function() {
    if (this._shuttingDown) return;
    this._shuttingDown = true;

    // Remove from shared.controllers before drain — a peer reading
    // during drain should see this controller as gone.
    delete myCatnip.shared.controllers[this.label];

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

myCatnip._resetShared = function() {
    // Reassign so external references (e.g. tests) see fresh
    // objects. _warnOnce reads shared.warned directly, so the
    // reassignment takes effect without extra wiring.
    myCatnip.shared.timeSig         = { 1: null, 2: null, 3: null, 4: null };
    myCatnip.shared.lastLoopTouchMs = { 1: 0, 2: 0, 3: 0, 4: 0 };
    myCatnip.shared.controllers     = {};
    myCatnip.shared.rw              = {};
    // warned — clear in place so any captured reference stays valid.
    // shared.warned is Object.create(null) (no prototype), so
    // hasOwnProperty isn't available — use Object.keys.
    var w = myCatnip.shared.warned;
    var keys = Object.keys(w);
    for (var i = 0; i < keys.length; i++) {
        delete w[keys[i]];
    }
};

myCatnip._bootWith = function(devices, Ctor, label) {
    print('\n=== myCatnip INIT' + (label ? ' (' + label + ')' : '') + ' ===');
    // Shut down any controllers from a previous boot (console
    // init() without a preset reload). Mixxx's controller
    // framework calls shutdown before init on preset reload, so
    // this only matters for manual re-init — but the old
    // controllers' timers and CO connections would otherwise
    // leak and keep firing alongside the new ones.
    myCatnip.controllers.forEach(function(c) { c.shutdown(); });
    myCatnip.controllers = [];
    myCatnip._schemeCache = {};
    myCatnip._compiledCache = {};
    myCatnip._compiledCacheByHw = new WeakMap();
    myCatnip._resetShared();
    myCatnip._modeSeen = { edit: false, slots: false };
    myCatnip.MODE_PRINTS = false;
    myCatnip._funcIdCounter = 0;
    myCatnip._funcIdMap = new WeakMap();
    myCatnip._segsCacheCounter = 0;

    if (!Array.isArray(devices)) devices = [devices];

    var primaryHw = (devices[0] && devices[0].hw) || myCatnip.HW_K3;
    myCatnip.applyPacing(primaryHw.pacing);

    devices.forEach(function(d) {
        print('  spawning ' + d.label + ' ch 0x' + d.midiChannel.toString(16));
        try {
            // Per-device Ctor override — allows a single preset to
            // boot mixed Controller subclasses. Falls back to the
            // _bootWith argument for all existing single-Ctor callers.
            var DeviceCtor = d.Ctor || Ctor;
            var ctrl = new DeviceCtor(d);
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
    print('\n=== myCatnip SHUTDOWN ===');
    myCatnip.controllers.forEach(function(ctrl) { ctrl.shutdown(); });
    myCatnip.controllers = [];
    print('=== shutdown requested (teardown continues async) ===');
};