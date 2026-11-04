// config/inpulse500-vu.js — VU, tempo LEDs (guide | markers),
// deck indicators, browser LED burst (deck-selection readout).

myCatnip.InpulseController = function(cfg) {
    myCatnip.Controller.call(this, cfg);

    this._ip500Slicer  = { A: myCatnip._ip500SlicerFresh(),
                           B: myCatnip._ip500SlicerFresh() };
    this._ip500VinylA = (cfg.initialVinylMode !== false);
    this._ip500VinylB = (cfg.initialVinylMode !== false);
    this._ip500SlowPause = { A: false, B: false };
    this._ip500PitchRange = { A: 0, B: 0 };
    this._ip500XfaderScratch = false;
    // The physical crossfader-enable switch sends no state report at
    // boot (note 0x18, not covered by the 0xB0/0x7F CC dump request).
    // Default to disabled: safer than the alternative, where the
    // crossfader would move even with the switch physically OFF.
    // User toggles the switch to sync.
    this._ip500XfaderEnabled = false;
    this._ip500BrowserOffFocus = (cfg.browserOffFocus === true);
    this._ip500AssistHeld = false;
    this._ip500AssistConsumed = false;
    this._ip500BrowserPressHeld = false;
    this._ip500BrowserPressConsumed = false;
    this._ip500VUConns = [];
    this._ip500TempoTimer = null;
    this._ip500BeatmatchGuideMode = cfg.beatmatchGuideMode || 'guide';

    this._ip500BrowserLedTimer = null;
    this._ip500BrowserLedRetriesLeft = 0;
    this._ip500BrowserLedPending = 0x00;

    // Dedupe cache for tempo-LED writes. 4 Hz updates that produce
    // the same value become no-ops — steady-state traffic collapses.
    this._ip500TempoState = {};
};
myCatnip.InpulseController.prototype = Object.create(myCatnip.Controller.prototype);
myCatnip.InpulseController.prototype.constructor = myCatnip.InpulseController;

// Shutdown gate for every direct midi.sendShortMsg from
// config/inpulse500-*.js. Covers timer callbacks and CO observers
// firing during the async drain between shutdown() and
// _shutdownExtra().
//
// The hardware descriptor (hw/inpulse500.js) is deliberately
// separate: `send` is gated upstream by Controller.sendLED, and
// `blank` intentionally fires during shutdown to clear LEDs.
myCatnip.InpulseController.prototype._ip500Send = function(status, note, vel) {
    if (this._shuttingDown) return;
    midi.sendShortMsg(status, note, vel);
};

// Assist-as-modifier helper. Returns true if assist is held (caller
// should delegate to the shift variant) and marks assist as consumed
// so releasing assist does not also toggle the library. Use in place
// of `if (ctrl._ip500AssistHeld)` in every func that delegates to a
// shift variant.
myCatnip.InpulseController.prototype._ip500UseAssist = function() {
    if (!this._ip500AssistHeld) return false;
    this._ip500AssistConsumed = true;
    return true;
};

myCatnip.InpulseController.prototype._initExtra = function() {
    var self = this;

    function connect(group, key, cb) {
        try {
            var conn = engine.makeConnection(group, key, cb);
            if (conn) self._ip500VUConns.push(conn);
        } catch (e) {
            myCatnip._warnOnce('ip500Conn:' + group + ':' + key,
                'Inpulse 500: connect ' + group + '.' + key +
                ' failed: ' + (e && e.message ? e.message : e));
        }
    }

    connect('[Main]', 'vu_meter_left', function(v) {
        self._ip500Send(0xB0, 0x40,
            Math.max(0, Math.min(124, Math.round(v * 124))));
    });
    connect('[Main]', 'vu_meter_right', function(v) {
        self._ip500Send(0xB0, 0x41,
            Math.max(0, Math.min(124, Math.round(v * 124))));
    });
    connect('[Main]', 'peak_indicator_left', function(v) {
        self._ip500Send(0x90, 0x0A, v ? 0x7F : 0x00);
    });
    connect('[Main]', 'peak_indicator_right', function(v) {
        self._ip500Send(0x90, 0x0F, v ? 0x7F : 0x00);
    });

    for (var ch = 1; ch <= 4; ch++) {
        (function(c) {
            var grp = '[Channel' + c + ']';
            connect(grp, 'vu_meter', function(v) {
                var mapped = Math.max(0, Math.min(125, Math.round(v * 125)));
                if (self.selectedDeckA === c) self._ip500Send(0xB1, 0x40, mapped);
                if (self.selectedDeckB === c) self._ip500Send(0xB2, 0x40, mapped);
            });
            connect(grp, 'peak_indicator', function(v) {
                var val = v ? 0x7F : 0x00;
                if (self.selectedDeckA === c) self._ip500Send(0x91, 0x39, val);
                if (self.selectedDeckB === c) self._ip500Send(0x92, 0x39, val);
            });
            // Number LEDs are deck-assignment indicators (1/2),
            // not play indicators. Set from _ip500UpdateDeckIndicators.
            connect(grp, 'beat_active', function(v) {
                if (v) myCatnip.ip500SlicerBeatActive(self, c, v);
            });
        })(ch);
    }

    this._ip500TempoTimer = engine.beginTimer(250, function() {
        try { self._ip500TempoUpdate(); }
        catch (e) {
            myCatnip._warnOnce('ip500TempoThrow',
                'Inpulse 500 tempo update threw: ' +
                (e && e.message ? e.message : e));
        }
    }, false);

    this._ip500UpdateDeckIndicators();

    // Ask the controller to dump all current CC values. Without
    // this, Mixxx doesn't learn physical pot positions at boot,
    // and soft-takeover forces a physical touch before each
    // fader/knob "catches." Matches the community script's init().
    this._ip500Send(0xB0, 0x7F, 0x7F);
};

myCatnip.InpulseController.prototype._shutdownExtra = function() {
    for (var i = 0; i < this._ip500VUConns.length; i++) {
        this._ip500VUConns[i].disconnect();
    }
    this._ip500VUConns = [];
    if (this._ip500TempoTimer) {
        engine.stopTimer(this._ip500TempoTimer);
        this._ip500TempoTimer = null;
    }
    if (this._ip500BrowserLedTimer) {
        engine.stopTimer(this._ip500BrowserLedTimer);
        this._ip500BrowserLedTimer = null;
    }
    this._ip500TempoState = {};
    try { engine.scratchDisable(this.selectedDeckA); } catch (e) {}
    try { engine.scratchDisable(this.selectedDeckB); } catch (e) {}
};

myCatnip.InpulseController.prototype._ip500ResendSideVU = function(side) {
    var ch = (side === 'A') ? this.selectedDeckA : this.selectedDeckB;
    var ccStatus = (side === 'A') ? 0xB1 : 0xB2;
    var noteStatus = (side === 'A') ? 0x91 : 0x92;
    var grp = '[Channel' + ch + ']';
    this._ip500Send(ccStatus, 0x40,
        Math.max(0, Math.min(125, Math.round(engine.getValue(grp, 'vu_meter') * 125))));
    this._ip500Send(noteStatus, 0x39,
        engine.getValue(grp, 'peak_indicator') ? 0x7F : 0x00);
    // Note 0x30 is not touched here — deck-assignment indicators
    // are set by _ip500UpdateDeckIndicators and never overridden.
    try {
        engine.scratchDisable((side === 'A') ? 1 : 2);
        engine.scratchDisable((side === 'A') ? 3 : 4);
        // If the jog is still touched, re-establish scratch on the new
        // channel. Exposed by hw/inpulse500.js wireInputs. No-op on
        // first boot (wireInputs runs after _initExtra).
        var refreshFn = this['_ip500RefreshJogTouch' + side];
        if (refreshFn) refreshFn();
    } catch (e) {}
};

myCatnip.InpulseController.prototype._ip500UpdateDeckIndicators = function() {
    // Number LEDs always show primary assignment: 1 = deck A on ch1,
    // 2 = deck B on ch2. (Replaces play-indicator mode.)
    this._ip500Send(0x91, 0x30, this.selectedDeckA === 1 ? 0x7F : 0x00);
    this._ip500Send(0x92, 0x30, this.selectedDeckB === 2 ? 0x7F : 0x00);
    this._ip500ResendSideVU('A');
    this._ip500ResendSideVU('B');
    this._ip500UpdateBrowserLed();
    this._ip500TempoUpdate();
};

myCatnip.InpulseController.prototype._ip500BrowserLedBurst = function(color) {
    if (this._shuttingDown) return;
    var ctrl = this;
    var BURST = 5;
    var RETRY_MS = 200;

    ctrl._ip500Send(0x90, 0x05, color);
    ctrl._ip500BrowserLedPending = color;
    ctrl._ip500BrowserLedRetriesLeft = BURST - 1;
    if (ctrl._ip500BrowserLedTimer) return;
    ctrl._ip500BrowserLedTimer = engine.beginTimer(RETRY_MS, function() {
        if (ctrl._ip500BrowserLedRetriesLeft > 0) {
            ctrl._ip500Send(0x90, 0x05, ctrl._ip500BrowserLedPending);
            ctrl._ip500BrowserLedRetriesLeft--;
        } else {
            engine.stopTimer(ctrl._ip500BrowserLedTimer);
            ctrl._ip500BrowserLedTimer = null;
        }
    }, false);
};

myCatnip.InpulseController.prototype._ip500UpdateBrowserLed = function() {
    var aAlt = this.selectedDeckA === 3;
    var bAlt = this.selectedDeckB === 4;
    var color;
    if (aAlt && bAlt) color = 0x7F;      // white
    else if (aAlt)    color = 0x03;      // blue
    else if (bAlt)    color = 0x7C;      // yellow
    else              color = 0x1C;      // green
    this._ip500BrowserLedBurst(color);
};

// Tempo-LED writer with dedupe. Every tempo path goes through
// here so identical consecutive values are dropped on the wire.
// Bounded key set (≈18 statuses × notes), no cache eviction needed.
myCatnip.InpulseController.prototype._ip500TempoSend = function(status, note, vel) {
    var key = status + ':' + note;
    if (this._ip500TempoState[key] === vel) return;
    this._ip500TempoState[key] = vel;
    this._ip500Send(status, note, vel);
};

myCatnip.InpulseController.prototype._ip500TempoUpdate = function() {
    if (this._ip500BeatmatchGuideMode === 'markers') {
        this._ip500TempoMarkers();
    } else {
        this._ip500TempoGuide();
    }
};

// Markers mode — community-script behaviour. Beat-align LEDs show
// alt-deck presence (A=3, B=4). Number LEDs (0x30) are NOT written
// here; _ip500UpdateDeckIndicators is the sole owner, avoiding the
// duplicate 0x30 write that the v2.2.1 port had.
myCatnip.InpulseController.prototype._ip500TempoMarkers = function() {
    var altA = this.selectedDeckA === 3;
    var altB = this.selectedDeckB === 4;
    var ON = 0x7F, OFF = 0x00;

    // Beat-align LEDs under each jog: solid when that side is on its
    // alt deck. These are the same notes the tempo guide uses;
    // markers mode repurposes them.
    this._ip500TempoSend(0x91, 0x1C, altA ? ON : OFF);
    this._ip500TempoSend(0x91, 0x1D, altA ? ON : OFF);
    this._ip500TempoSend(0x91, 0x2D, altA ? ON : OFF);
    this._ip500TempoSend(0x92, 0x1C, altB ? ON : OFF);
    this._ip500TempoSend(0x92, 0x1D, altB ? ON : OFF);
    this._ip500TempoSend(0x92, 0x2D, altB ? ON : OFF);

    // Other tempo LEDs off in markers mode.
    this._ip500TempoSend(0x91, 0x1E, OFF);
    this._ip500TempoSend(0x91, 0x1F, OFF);
    this._ip500TempoSend(0x92, 0x1E, OFF);
    this._ip500TempoSend(0x92, 0x1F, OFF);
    this._ip500TempoSend(0x91, 0x2C, OFF);
    this._ip500TempoSend(0x92, 0x2C, OFF);
};

// Tempo guide — matches the community script's tempoLEDsGuide
// exactly. Uses the four beat-align LEDs (0x1C, 0x1D, 0x1E, 0x1F),
// the center LED (0x2C = matched), and the beat phase LED (0x2D).
myCatnip.InpulseController.prototype._ip500TempoGuide = function() {
    var dA = this.selectedDeckA, dB = this.selectedDeckB;
    var gA = '[Channel' + dA + ']', gB = '[Channel' + dB + ']';
    var t1 = engine.getValue(gA, 'bpm');
    var t2 = engine.getValue(gB, 'bpm');
    if (!(t1 > 0) || !(t2 > 0)) return;

    var diff = t1 - t2;
    var doubleTempo = 0;
    if (diff > 0) {
        if ((t1 / t2) > 1.5) { doubleTempo = 1; diff = t1 / 2 - t2; }
    } else {
        if ((t2 / t1) > 1.5) { doubleTempo = 1; diff = t1 - t2 / 2; }
    }

    var dAaddr = 0x91, dBaddr = 0x92;
    var send = this._ip500TempoSend.bind(this);

    if (diff < -0.25) {
        send(dAaddr, 0x1E, 0x00); send(dAaddr, 0x1F, 0x7F);
        send(dBaddr, 0x1F, 0x00); send(dBaddr, 0x1E, 0x7F);
        send(dAaddr, 0x2C, 0x00); send(dBaddr, 0x2C, 0x00);
        send(dAaddr, 0x1C, 0x00); send(dAaddr, 0x1D, 0x00);
        send(dAaddr, 0x2D, 0x00);
        send(dBaddr, 0x1C, 0x00); send(dBaddr, 0x1D, 0x00);
        send(dBaddr, 0x2D, 0x00);
    } else if (diff > 0.25) {
        send(dAaddr, 0x1F, 0x00); send(dAaddr, 0x1E, 0x7F);
        send(dBaddr, 0x1E, 0x00); send(dBaddr, 0x1F, 0x7F);
        send(dAaddr, 0x2C, 0x00); send(dBaddr, 0x2C, 0x00);
        send(dAaddr, 0x1C, 0x00); send(dAaddr, 0x1D, 0x00);
        send(dAaddr, 0x2D, 0x00);
        send(dBaddr, 0x1C, 0x00); send(dBaddr, 0x1D, 0x00);
        send(dBaddr, 0x2D, 0x00);
    } else {
        send(dAaddr, 0x1E, 0x00); send(dAaddr, 0x1F, 0x00);
        send(dAaddr, 0x2C, 0x7F);
        send(dBaddr, 0x1E, 0x00); send(dBaddr, 0x1F, 0x00);
        send(dBaddr, 0x2C, 0x7F);

        if (engine.getValue(gA, 'play_latched') && engine.getValue(gB, 'play_latched')) {
            var b1 = engine.getValue(gA, 'beat_distance');
            var b2 = engine.getValue(gB, 'beat_distance');
            if (doubleTempo) {
                if (t1 > t2) { if (b2 > 0.5) b2 -= 0.5; b2 *= 2; }
                else         { if (b1 > 0.5) b1 -= 0.5; b1 *= 2; }
            }
            var d = b1 - b2;
            if (d < 0) d = 1 + d;
            if ((d < 0.02) || (d > 1 - 0.02)) {
                send(dAaddr, 0x1C, 0x00); send(dAaddr, 0x1D, 0x00);
                send(dAaddr, 0x2D, 0x7F);
                send(dBaddr, 0x1C, 0x00); send(dBaddr, 0x1D, 0x00);
                send(dBaddr, 0x2D, 0x7F);
            } else if (d < 0.5) {
                send(dAaddr, 0x1C, 0x00); send(dAaddr, 0x1D, 0x7F);
                send(dAaddr, 0x2D, 0x00);
                send(dBaddr, 0x1D, 0x00); send(dBaddr, 0x1C, 0x7F);
                send(dBaddr, 0x2D, 0x00);
            } else {
                send(dAaddr, 0x1D, 0x00); send(dAaddr, 0x1C, 0x7F);
                send(dAaddr, 0x2D, 0x00);
                send(dBaddr, 0x1C, 0x00); send(dBaddr, 0x1D, 0x7F);
                send(dBaddr, 0x2D, 0x00);
            }
        } else {
            send(dAaddr, 0x1C, 0x00); send(dAaddr, 0x1D, 0x00);
            send(dAaddr, 0x2D, 0x00);
            send(dBaddr, 0x1C, 0x00); send(dBaddr, 0x1D, 0x00);
            send(dBaddr, 0x2D, 0x00);
        }
    }
};