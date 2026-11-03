// lib/controller-beat.js — timeline (loop clock), display-source
// resolution, beat count derivation, beat clock connections.
//
// Loaded after lib/controller-colour.js. Extends
// Controller.prototype. Pulse phase always from track position;
// cascade count from the active display source.
//
// v2.1.0: _lastLoopTouchMs lives on myCatnip.shared (per-channel,
// shared across controllers on the same channel). No per-controller
// state.


// Hotcue slots scanned for phrase-marker colours.
myCatnip.PHRASE_HOTCUE_SLOTS = [9, 10, 11, 12];

// Mixxx pre-instantiates 36 hotcue COs, but four of those are
// the intro/outro markers — 32 real hotcues per deck.
myCatnip.MIXXX_HOTCUE_LIMIT = 32;

// Validated, deduped, in-range slot list. Memoized by array
// identity.
myCatnip._phraseHotcueSlots = function() {
    var slots = myCatnip.PHRASE_HOTCUE_SLOTS;
    if (myCatnip._phraseHotcueSlotsCacheSrc === slots &&
        myCatnip._phraseHotcueSlotsCache) {
        return myCatnip._phraseHotcueSlotsCache;
    }
    var out = [];
    if (Array.isArray(slots)) {
        var seen = {};
        for (var i = 0; i < slots.length; i++) {
            var n = slots[i];
            if (typeof n !== 'number' || n !== Math.floor(n) ||
                n < 1 || n > myCatnip.MIXXX_HOTCUE_LIMIT) continue;
            if (seen[n]) continue;
            seen[n] = true;
            out.push(n);
        }
    }
    myCatnip._phraseHotcueSlotsCache = out;
    myCatnip._phraseHotcueSlotsCacheSrc = slots;
    return out;
};

// ============================================================
// CHANNEL / LOOP STATE
// ============================================================
myCatnip.Controller.prototype._channelOf = function(group) {
    if (typeof group !== 'string') return null;
    var m = /^\[Channel(\d)\]$/.exec(group);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return (n >= 1 && n <= 4) ? n : null;
};

myCatnip.Controller.prototype._readLoopState = function(ch) {
    this._decks[ch].loopActive =
        engine.getValue('[Channel' + ch + ']', 'loop_enabled') > 0;
};

// ============================================================
// PLAYBACK RATE
// ============================================================
myCatnip.Controller.prototype._channelRate = function(ch) {
    var cached = this._rateCache[ch];
    if (typeof cached === 'number' && isFinite(cached) && cached > 0) {
        return cached;
    }
    var grp = '[Channel' + ch + ']';
    var ratio = engine.getValue(grp, 'rate_ratio');
    if (typeof ratio === 'number' && isFinite(ratio) && ratio > 0) {
        this._rateCache[ch] = ratio;
        return ratio;
    }
    var slider = engine.getValue(grp, 'rate');
    if (typeof slider === 'number' && isFinite(slider)) {
        var m = 1 + slider;
        if (m > 0) return m;
    }
    return 1;
};

// ============================================================
// VIRTUAL CLOCK
// ============================================================
myCatnip.Controller.prototype._startVirtualClock = function(ch) {
    var st = this._decks[ch];
    var clock = st.loopClock;
    var grp = '[Channel' + ch + ']';
    st.playing = engine.getValue(grp, 'play_indicator') > 0;
    clock.pos = engine.getValue(grp, 'playposition');
    clock.lastTs = Date.now();
    clock.running = true;
    this._resolveDisplaySource(ch);
};

myCatnip.Controller.prototype._stopVirtualClock = function(ch) {
    var st = this._decks[ch];
    st.loopClock.running = false;
    this._resolveDisplaySource(ch);
};

myCatnip.Controller.prototype._syncVirtualClock = function(ch) {
    var st = this._decks[ch];
    var shouldRun = st.loopActive && st.playing;
    if (shouldRun && !st.loopClock.running) {
        this._startVirtualClock(ch);
        return true;
    }
    if (!shouldRun && st.loopClock.running) {
        this._stopVirtualClock(ch);
        return true;
    }
    return false;
};

myCatnip.Controller.prototype._advanceVirtualClock = function(ch) {
    var st = this._decks[ch];
    var clock = st.loopClock;
    if (!clock.running) return;

    var now = Date.now();
    if (st.playing && clock.lastTs > 0) {
        var dt = (now - clock.lastTs) / 1000;
        if (dt < 0) dt = 0;
        var dur = this._trackMeta(ch).duration;
        var rate = this._channelRate(ch);
        if (dur > 0) clock.pos += (dt * rate) / dur;
    }

    clock.lastTs = now;
};

// ============================================================
// DISPLAY SOURCE
// ============================================================
myCatnip.Controller.prototype._resolveDisplaySource = function(ch) {
    var st = this._decks[ch];
    var choice = st.loopClock.running ? 'loop' : 'track';
    if (choice === st.displaySource) return;

    st.displaySource = choice;
    this._syncBeatCount(ch);
    if (this.selectedDeckCurrent === ch) {
        this._refreshDisplayFlags();
        this._refreshAllLeds('display-source');
    } else {
        this._refreshBeatLeds(ch);
    }
};

// ============================================================
// TRACK METADATA / BEAT MATH
// ============================================================
myCatnip.Controller.prototype._getContentBounds = function(ch) {
    var meta = this._trackMeta(ch);
    if (!(meta.samples > 0)) return null;
    var endN = (meta.outroEnd > 0 && meta.outroEnd <= meta.samples)
        ? (meta.outroEnd / meta.samples) : 1;
    return { start: 0, end: endN };
};

myCatnip.Controller.prototype._readFileBpm = function(ch) {
    var grp = '[Channel' + ch + ']';
    var fileBpm = engine.getValue(grp, 'file_bpm');
    if (fileBpm > 0) return fileBpm;
    var bpm = engine.getValue(grp, 'bpm');
    if (!(bpm > 0)) return null;
    return bpm / this._channelRate(ch);
};

var EMPTY_META = { duration: 0, fileBpm: null, samples: 0, outroEnd: 0 };

myCatnip.Controller.prototype._trackMeta = function(ch) {
    var cached = this._trackMetaCache[ch];
    if (cached !== undefined) return cached;

    if (this._loadedState[ch] !== true) {
        return EMPTY_META;
    }

    var grp = '[Channel' + ch + ']';
    var dur = engine.getValue(grp, 'duration');
    var samples = engine.getValue(grp, 'track_samples');
    var outroS = engine.getValue(grp, 'outro_end_position');
    var meta = {
        duration: (dur > 0) ? dur : 0,
        fileBpm:  this._readFileBpm(ch),
        samples:  (samples > 0) ? samples : 0,
        outroEnd: (outroS > 0) ? outroS : 0
    };
    if (meta.duration > 0 &&
        Date.now() - this._loadSettlingAt[ch] >= myCatnip.META_SETTLE_MS) {
        this._trackMetaCache[ch] = meta;
    }
    return meta;
};

myCatnip.Controller.prototype._fileBpm = function(ch) {
    return this._trackMeta(ch).fileBpm;
};

myCatnip.Controller.prototype._beatF = function(ch, pos) {
    if (typeof pos !== 'number' || !isFinite(pos)) return null;
    var meta = this._trackMeta(ch);
    if (!(meta.duration > 0)) return null;
    if (!meta.fileBpm) return null;
    if (!(meta.samples > 0)) return null;
    return pos * meta.duration * meta.fileBpm / 60;
};

myCatnip.Controller.prototype._trackBeatF = function(ch) {
    var pos = engine.getValue('[Channel' + ch + ']', 'playposition');
    return this._beatF(ch, pos);
};

myCatnip.Controller.prototype._phraseSourcePos = function(ch) {
    var st = this._decks[ch];
    if (st.displaySource === 'loop' && st.loopClock.running)
        return st.loopClock.pos;
    return engine.getValue('[Channel' + ch + ']', 'playposition');
};

myCatnip.Controller.prototype._cascadeCount = function(ch, trackBeatF) {
    var st = this._decks[ch];
    if (st.displaySource === 'loop' && st.loopClock.running) {
        var loopBeatF = this._beatF(ch, st.loopClock.pos);
        if (loopBeatF !== null) {
            return Math.floor(loopBeatF) - this._phraseOrigin[ch] + 1;
        }
    }
    return Math.floor(trackBeatF) - this._phraseOrigin[ch] + 1;
};

myCatnip.Controller.prototype._virtualBeatFor = function(ch) {
    var st = this._decks[ch];
    if (!st.loopClock.running) return null;
    var beatF = this._beatF(ch, st.loopClock.pos);
    if (beatF === null) return null;
    return Math.floor(beatF) - this._phraseOrigin[ch] + 1;
};

myCatnip.Controller.prototype._syncBeatCount = function(ch, pos) {
    var st = this._decks[ch];
    var beatF = (pos !== undefined)
        ? this._beatF(ch, pos)
        : this._trackBeatF(ch);
    if (beatF === null) return false;
    var count = this._cascadeCount(ch, beatF);
    var wasHasBeat = st.hasBeat;
    st.hasBeat = true;
    if (st.count === count && wasHasBeat) return false;
    st.count = count;
    this._refreshBeatLeds(ch);
    return true;
};

myCatnip.Controller.prototype._seedHotcueCache = function(ch) {
    var st = this._decks[ch];
    st.hotcueState = {};
    if (!Array.isArray(myCatnip.PHRASE_MARKER_COLORS) ||
        myCatnip.PHRASE_MARKER_COLORS.length === 0) return;

    var grp = '[Channel' + ch + ']';
    var slots = myCatnip._phraseHotcueSlots();
    for (var i = 0; i < slots.length; i++) {
        var n = slots[i];
        st.hotcueState[n] = {
            color: engine.getValue(grp, 'hotcue_' + n + '_color'),
            pos:   engine.getValue(grp, 'hotcue_' + n + '_position')
        };
    }
};

myCatnip.Controller.prototype._deriveOriginFromPosition = function(ch, pos) {
    var markers = myCatnip.PHRASE_MARKER_COLORS;
    if (!Array.isArray(markers) || markers.length === 0) return;

    var st = this._decks[ch];
    if (st.displaySource === 'loop' && st.loopClock.running) return;

    var meta = this._trackMeta(ch);
    if (!(meta.samples > 0)) return;

    var best = null;
    var bestAhead = null;
    var cache = st.hotcueState;
    var slots = myCatnip._phraseHotcueSlots();

    for (var si = 0; si < slots.length; si++) {
        var h = cache[slots[si]];
        if (!h) continue;
        if (markers.indexOf(h.color) === -1) continue;
        if (!(h.pos >= 0) || h.pos > meta.samples) continue;
        var markerPos = h.pos / meta.samples;
        if (markerPos <= pos) {
            if (best === null || markerPos > best) best = markerPos;
        } else {
            if (bestAhead === null || markerPos < bestAhead) bestAhead = markerPos;
        }
    }

    var refPos = (best !== null) ? best : bestAhead;
    var newOrigin;
    if (refPos !== null) {
        var beatF = this._beatF(ch, refPos);
        if (beatF === null) return;
        newOrigin = Math.floor(beatF);
    } else {
        newOrigin = 0;
    }

    if (this._phraseOrigin[ch] !== newOrigin) {
        this._phraseOrigin[ch] = newOrigin;
        this._syncBeatCount(ch, pos);
    }
};

myCatnip.Controller.prototype._resetBeat = function(ch) {
    this._decks[ch] = myCatnip._freshDeckState();
    this._phraseOrigin[ch] = 0;
    if (this.selectedDeckCurrent === ch) {
        this._refreshDisplayFlags();
        var depthBefore = this._refreshAllLedsDepth;
        this._refreshAllLeds('reset-beat');
        if (depthBefore > 0) {
            this._refreshBeatLeds(ch);
        }
    } else {
        this._refreshBeatLeds(ch);
    }
};

myCatnip.Controller.prototype._repaintBeat = function(ch) {
    var refreshed = this._syncBeatCount(ch);
    if (!refreshed) this._refreshBeatLeds(ch);
};

myCatnip.Controller.prototype._repaintFromPosition = function(ch, pos) {
    var st = this._decks[ch];
    var trackBeatF = (pos !== undefined)
        ? this._beatF(ch, pos)
        : this._trackBeatF(ch);
    if (trackBeatF === null) return;

    var trackFrac = trackBeatF - Math.floor(trackBeatF);
    var count = this._cascadeCount(ch, trackBeatF);

    var wasHasBeat = st.hasBeat;
    var wasActive  = st.active;
    var wasCount   = st.count;

    st.count = count;
    st.hasBeat = true;
    st.active = trackFrac < 0.5;

    if (!wasHasBeat || wasActive !== st.active || wasCount !== st.count) {
        this._refreshBeatLeds(ch);
    }
};

// ============================================================
// DISPLAY FLAGS
// ============================================================
myCatnip.Controller.prototype._refreshDisplayFlags = function() {
    var st = this._decks[this.selectedDeckCurrent];
    if (!st) {
        this.activeDeckVirtual   = false;
        this.activeLoopVirtual   = false;
        this.activeDisplaySource = 'track';
        return;
    }
    this.activeDeckVirtual   = (st.displaySource !== 'track');
    this.activeLoopVirtual   = st.loopClock.running;
    this.activeDisplaySource = st.displaySource;
};

// ============================================================
// BEAT CLOCKS — OPEN
// ============================================================
myCatnip.Controller.prototype._openBeatClocks = function() {
    for (var ch = 1; ch <= 4; ch++) this._openChannelBeatClocks(ch);
    for (var ch2 = 1; ch2 <= 4; ch2++) this._catchUpChannel(ch2);
};

myCatnip.Controller.prototype._openChannelBeatClocks = function(ch) {
    var self = this;
    var grp = '[Channel' + ch + ']';
    function wire(conns, co, fn) {
        conns.push(engine.makeConnection(grp, co, fn));
    }

    wire(this._beatConns, 'beat_active', function(v) {
        self._onBeatActive(ch, v);
    });
    wire(this._playConns, 'playposition', function(v) {
        self._onPlayposition(ch, v);
    });
    wire(this._playConns, 'play_indicator', function(v) {
        if (self._bootSettling[ch]) self._bootSettledAt[ch] = Date.now();
        self._onPlayIndicator(ch, v);
    });
    wire(this._playConns, 'track_loaded', function(v) {
        if (self._bootSettling[ch]) self._bootSettledAt[ch] = Date.now();
        self._onTrackLoaded(ch, v);
    });
    wire(this._playConns, 'loop_enabled', function() {
        if (self._bootSettling[ch]) self._bootSettledAt[ch] = Date.now();
        self._onLoopEnabled(ch);
    });
    wire(this._playConns, 'slip_enabled', function() {
        self._syncBeatCount(ch);
    });
    wire(this._playConns, 'rate_ratio', function(v) {
        if (self._bootSettling[ch]) self._bootSettledAt[ch] = Date.now();
        self._rateCache[ch] = v;
    });
    wire(this._playConns, 'reverse', function(v) {
        if (self._bootSettling[ch]) self._bootSettledAt[ch] = Date.now();
        self._reverseCache[ch] = v > 0 ? 1 : 0;
    });

    wire(this._playConns, 'track_samples', function() {
        self._loadSettlingAt[ch] = Date.now();
        self._trackMetaCache[ch] = undefined;
        self._seedHotcueCache(ch);
        var pos = engine.getValue(grp, 'playposition');
        self._deriveOriginFromPosition(ch, pos);
        self._syncBeatCount(ch, pos);
    });

    wire(this._playConns, 'outro_end_position', function() {
        self._trackMetaCache[ch] = undefined;
    });

    wire(this._playConns, 'duration', function() {
        self._loadSettlingAt[ch] = Date.now();
        self._trackMetaCache[ch] = undefined;
        var pos = engine.getValue(grp, 'playposition');
        self._deriveOriginFromPosition(ch, pos);
        self._syncBeatCount(ch, pos);
    });
    wire(this._playConns, 'file_bpm', function() {
        self._loadSettlingAt[ch] = Date.now();
        self._trackMetaCache[ch] = undefined;
        var pos = engine.getValue(grp, 'playposition');
        self._deriveOriginFromPosition(ch, pos);
        self._syncBeatCount(ch, pos);
    });

    if (Array.isArray(myCatnip.PHRASE_MARKER_COLORS) &&
        myCatnip.PHRASE_MARKER_COLORS.length > 0) {
        this._wireHotcueObservers(ch, grp);
    }
};

myCatnip.Controller.prototype._wireHotcueObservers = function(ch, grp) {
    this._seedHotcueCache(ch);

    var self = this;
    var slots = myCatnip._phraseHotcueSlots();

    function onColor(n, v) {
        var st = self._decks[ch];
        if (!st.hotcueState[n]) st.hotcueState[n] = {};
        st.hotcueState[n].color = v;
        var pos = engine.getValue(grp, 'playposition');
        self._deriveOriginFromPosition(ch, pos);
    }
    function onPosition(n, v) {
        var st = self._decks[ch];
        if (!st.hotcueState[n]) st.hotcueState[n] = {};
        st.hotcueState[n].pos = v;
        var pos = engine.getValue(grp, 'playposition');
        self._deriveOriginFromPosition(ch, pos);
    }

    for (var hi = 0; hi < slots.length; hi++) {
        (function(n) {
            self._playConns.push(
                engine.makeConnection(grp, 'hotcue_' + n + '_color',
                    function(v) { onColor(n, v); }));
            self._playConns.push(
                engine.makeConnection(grp, 'hotcue_' + n + '_position',
                    function(v) { onPosition(n, v); }));
        })(slots[hi]);
    }
};

myCatnip.Controller.prototype._validatePhraseHotcueSlots = function() {
    var slots = myCatnip.PHRASE_HOTCUE_SLOTS;
    if (!Array.isArray(slots)) {
        myCatnip._warnOnce('phraseSlotsShape',
            'PHRASE_HOTCUE_SLOTS must be an array — phrase origin ' +
            'derivation disabled');
        return;
    }
    var seen = {};
    for (var i = 0; i < slots.length; i++) {
        var n = slots[i];
        if (typeof n !== 'number' || n !== Math.floor(n) ||
            n < 1 || n > myCatnip.MIXXX_HOTCUE_LIMIT) {
            myCatnip._warnOnce('phraseSlotRange:' + n,
                'PHRASE_HOTCUE_SLOTS contains ' + n + ' — must be ' +
                'an integer between 1 and ' + myCatnip.MIXXX_HOTCUE_LIMIT +
                '. Slot skipped.');
            continue;
        }
        if (seen[n]) {
            myCatnip._warnOnce('phraseSlotDup:' + n,
                'PHRASE_HOTCUE_SLOTS contains duplicate ' + n +
                ' — extra entry ignored');
            continue;
        }
        seen[n] = true;
    }
};

myCatnip.Controller.prototype._startBootSettle = function() {
    for (var ch = 1; ch <= 4; ch++) {
        this._bootSettledAt[ch] = Date.now();
        this._bootAttempt[ch] = 0;
        this._bootSettling[ch] = true;
        this._checkBootChannel(ch);
    }
};

myCatnip.Controller.prototype._checkBootChannel = function(ch) {
    var elapsed = Date.now() - this._bootSettledAt[ch];
    if (elapsed < myCatnip.BOOT_SETTLE_MS &&
        this._bootAttempt[ch] < myCatnip.BOOT_MAX_ATTEMPTS) {
        this._bootAttempt[ch]++;
        var self = this;
        engine.beginTimer(myCatnip.BOOT_SETTLE_MS, function() {
            if (self._shuttingDown) return;
            self._catchUpChannel(ch);
            self._checkBootChannel(ch);
        }, true);
        return;
    }
    if (elapsed < myCatnip.BOOT_SETTLE_MS) {
        myCatnip._warnOnce('bootSettle:' + ch,
            'channel ' + ch + ' boot CO tree did not settle after ' +
            this._bootAttempt[ch] + ' attempts — reads may be stale');
    }
    this._bootAttempt[ch] = 0;
    this._bootSettling[ch] = false;
};

myCatnip.Controller.prototype._catchUpChannel = function(ch) {
    this._trackMetaCache[ch] = undefined;
    this._loadedState[ch] =
        engine.getValue('[Channel' + ch + ']', 'track_loaded') > 0;
    this._loadSettlingAt[ch] = Date.now();
    this._decks[ch].playing =
        engine.getValue('[Channel' + ch + ']', 'play_indicator') > 0;
    this._rateCache[ch] =
        engine.getValue('[Channel' + ch + ']', 'rate_ratio');
    this._reverseCache[ch] =
        engine.getValue('[Channel' + ch + ']', 'reverse') > 0 ? 1 : 0;
    this._readLoopState(ch);
    if (Object.keys(this._decks[ch].hotcueState).length === 0) {
        this._seedHotcueCache(ch);
    }
    var pos = engine.getValue('[Channel' + ch + ']', 'playposition');
    this._deriveOriginFromPosition(ch, pos);
    this._syncVirtualClock(ch);
    this._syncBeatCount(ch, pos);
};

// ============================================================
// BEAT CLOCKS — CO HANDLERS
// ============================================================
myCatnip.Controller.prototype._onBeatActive = function(ch, v) {
    var st = this._decks[ch];
    if (v === 1) {
        st.lastBeatEdge = Date.now();
        st.active = true;
        st.hasBeat = true;
        if (st.lastBeatEdge - st.lastBeatRepaint >=
            myCatnip.BEAT_REPAINT_THROTTLE_MS) {
            st.lastBeatRepaint = st.lastBeatEdge;
            this._repaintBeat(ch);
        }
    } else {
        st.active = false;
        this._refreshBeatLeds(ch);
    }
    if (this._onBeat) this._onBeat(ch);
};

myCatnip.Controller.prototype._onPlayposition = function(ch, newPos) {
    var st = this._decks[ch];
    if (newPos === undefined) {
        newPos = engine.getValue('[Channel' + ch + ']', 'playposition');
    }
    var movingBackward = this._trackPlayhead(st, newPos);

    var now = Date.now();
    if (now - st.lastPositionSync < myCatnip.BEAT_REPAINT_THROTTLE_MS) return;
    st.lastPositionSync = now;

    this._advanceVirtualClock(ch);
    this._deriveOriginFromPosition(ch, newPos);
    this._dispatchPositionTick(ch, newPos, movingBackward, now);
};

myCatnip.Controller.prototype._trackPlayhead = function(st, newPos) {
    var movingBackward = (st.lastPlayPos !== undefined) && (newPos < st.lastPlayPos);
    st.lastPlayPos = newPos;
    return movingBackward;
};

myCatnip.Controller.prototype._shouldSkipPulse = function(ch, movingBackward, now) {
    var st = this._decks[ch];
    var playing   = st.playing;
    var reversing = this._reverseCache[ch] > 0;
    return playing && !reversing && !movingBackward &&
        (now - st.lastBeatEdge < myCatnip.BEAT_STALL_MS);
};

myCatnip.Controller.prototype._dispatchPositionTick = function(ch, newPos, movingBackward, now) {
    if (this._shouldSkipPulse(ch, movingBackward, now)) {
        this._syncBeatCount(ch, newPos);
        return;
    }
    this._repaintFromPosition(ch, newPos);
};

myCatnip.Controller.prototype._onPlayIndicator = function(ch, v) {
    var st = this._decks[ch];
    var wasPlaying = st.playing;
    st.playing = v > 0;
    if (wasPlaying !== st.playing) {
        this._syncVirtualClock(ch);
        this._refreshBeatLeds(ch);
    }
    if (v === 1) {
        this._syncBeatCount(ch);
    }
};

myCatnip.Controller.prototype._onTrackLoaded = function(ch, v) {
    this._loadSettlingAt[ch] = Date.now();
    this._loadedState[ch] = (v === 1);
    this._trackMetaCache[ch] = undefined;
    myCatnip.shared.lastLoopTouchMs[ch] = 0;

    if (v !== 1) {
        this._resetBeat(ch);
        return;
    }
    var grp = '[Channel' + ch + ']';
    this._resetBeat(ch);
    this._decks[ch].playing = engine.getValue(grp, 'play_indicator') > 0;
    this._rateCache[ch] = engine.getValue(grp, 'rate_ratio');
    this._reverseCache[ch] = engine.getValue(grp, 'reverse') > 0 ? 1 : 0;
    this._readLoopState(ch);
    this._seedHotcueCache(ch);
    this._syncBeatClocks();
    this._syncVirtualClock(ch);
    var pos = engine.getValue(grp, 'playposition');
    this._deriveOriginFromPosition(ch, pos);
    this._syncBeatCount(ch, pos);
};

myCatnip.Controller.prototype._onLoopEnabled = function(ch) {
    this._readLoopState(ch);
    this._syncVirtualClock(ch);
};

// ============================================================
// BEAT CLOCKS — CLOSE / SYNC
// ============================================================
myCatnip.Controller.prototype._closeBeatClocks = function() {
    for (var i = 0; i < this._beatConns.length; i++)
        if (this._beatConns[i]) this._beatConns[i].disconnect();
    for (var j = 0; j < this._playConns.length; j++)
        if (this._playConns[j]) this._playConns[j].disconnect();
    this._beatConns = [];
    this._playConns = [];
    for (var ch = 1; ch <= 4; ch++) {
        this._decks[ch] = myCatnip._freshDeckState();
    }
    this._refreshDisplayFlags();
};

myCatnip.Controller.prototype._needsBeatClocks = function() {
    if (this._beatLeds.length > 0) return true;
    var applied = this._applied || {};
    for (var name in applied) {
        if (!applied.hasOwnProperty(name)) continue;
        var cfg = applied[name];
        if (!cfg || !cfg.colorScheme) continue;
        var cs = cfg.colorScheme;
        if (typeof cs.scheme === 'function') return true;
        if (cs.schemeFromState) return true;
        var s = cs.scheme;
        if (s && typeof s === 'object' && !Array.isArray(s) && s.beat) return true;
    }
    return false;
};

myCatnip.Controller.prototype._syncBeatClocks = function() {
    var want = this._needsBeatClocks();
    var have = this._beatConns.length > 0;
    if (myCatnip._debugPrintsOn) {
        var appliedCount = 0;
        var applied = this._applied || {};
        for (var k in applied) if (applied.hasOwnProperty(k)) appliedCount++;
        print('[myCatnip] _syncBeatClocks want=' + want +
              ' have=' + have +
              ' _beatLeds=' + this._beatLeds.length +
              ' applied=' + appliedCount);
    }
    if (want && !have) this._openBeatClocks();
    else if (!want && have) this._closeBeatClocks();
};

// ============================================================
// BEAT LED BOOKKEEPING
// ============================================================
myCatnip.Controller.prototype._refreshBeatLeds = function(ch) {
    for (var i = 0; i < this._beatLeds.length; i++) {
        var b = this._beatLeds[i];
        try {
            if (ch === undefined) { b._refresh(); continue; }
            var live = b._evaluateScheme();
            var beat = live && live.beat;
            if (!beat) continue;
            var deckCh = this._resolveDeckRef(beat.deck);
            if (deckCh === undefined || deckCh === null) { b._refresh(); continue; }
            if (deckCh === ch) b._refresh();
        } catch (e) {
            myCatnip._warnOnce('refreshBeatThrow:' + b._name,
                '_refreshBeatLeds: ' + b._name + ' threw: ' +
                (e && e.message ? e.message : e));
        }
    }
};

myCatnip.Controller.prototype._attachBeatLed = function(b) {
    if (this._beatLeds.indexOf(b) === -1) this._beatLeds.push(b);
};

myCatnip.Controller.prototype._detachBeatLed = function(b) {
    var i = this._beatLeds.indexOf(b);
    if (i >= 0) this._beatLeds.splice(i, 1);
};

myCatnip.Controller.prototype._resolveDeckRef = function(ref) {
    if (ref === undefined || ref === null) ref = myCatnip.DEFAULT_BEAT_DECK;
    if (typeof ref === 'number') return (ref >= 1 && ref <= 4) ? ref : null;
    if (typeof ref === 'string') {
        if (ref === '$DECK_ACTIVE$') return this.selectedDeckCurrent;
        if (ref === '$DECK_A$')      return this.selectedDeckA;
        if (ref === '$DECK_B$')      return this.selectedDeckB;
        var s = myCatnip.resolve(ref, this);
        var m = /\[Channel(\d)\]/.exec(s);
        return m ? parseInt(m[1], 10) : null;
    }
    return null;
};

myCatnip.Controller.prototype._deckStateFor = function(compiled) {
    if (!compiled || !compiled.beat) return null;
    var ch = this._resolveDeckRef(compiled.beat.deck);
    return ch ? this._decks[ch] : null;
};

