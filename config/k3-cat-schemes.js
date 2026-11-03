// config/k3-cat-schemes.mjs — Cat's THEME, QFX chain list,
// phrase-marker colours, colour ramps, and the scheme-builder
// helpers that the top / bottom / overlay files consume.
//
// Loaded after lib/funcs.mjs. Registers on myCatnip.CAT so later
// cat files pull helpers by name.
//
// v2.1.0: countdownScheme reads myCatnip.shared.timeSig[ch] for
// per-channel time signature.


var B = myCatnip.builders;
var CAT = myCatnip.CAT = myCatnip.CAT || {};

// ============================================================
// THEME
// ============================================================
myCatnip.THEME = {
    deck: { 1: 'green, 127', 2: 'red, 93', 3: [24, 24, 127, 127], 4: [127, 127, 32, 110] },
    fx:   { 1: 'magenta, 115', 2: 'yellow, 115', 3: 'cyan, 110', 4: 'orange, 127' }
};

// ============================================================
// QFX_CHAIN_LIST
// ============================================================
myCatnip.QFX_CHAIN_LIST = [
    'filterNone',
    'filterReverb', 'filterSmoothGrowl', 'filterEcho', 'filterFlanger',
    'filterMoog', 'filterBalance'
];

// ============================================================
// PHRASE_MARKER_COLORS
// ============================================================
myCatnip.PHRASE_MARKER_COLORS = [0xF2F2FF];

// ============================================================
// SCHEMES
// ============================================================
function countdownVariant(deck, beatColor, barColor) {
    return {
        colors: [[0, 0, 0]],
        beat: {
            color: beatColor,
            barBeats: 4,
            phraseBars: 4,
            prePhraseBeats: 4,
            half: false,
            bar:       { color: barColor },
            phrase:    { color: 'white, 127' },
            prePhrase: { color: 'magenta, 127' },
            deck: deck
        }
    };
}

Object.assign(myCatnip.SCHEMES, {
    myCatnip: {
        colors: [[28,28,127], [28,28,69], [28,69,28], [28,127,28]],
        curve: -0.7,
        markerColor: [127, 0, 0, 93],
        markerWidth: 2
    },
    myCatnipSpread: {
        colors: [[28,28,127], [28,28,69], [28,69,28], [28,127,28]],
        curve: 0.3,
        markerColor: [127, 0, 0, 93],
        markerWidth: 2
    },
    catFX: {
        colors: [[28,28,127], [28,28,69], [28,69,28], [28,127,28]],
        curve: -0.7,
        markerColor: [127, 0, 0, 93],
        markerWidth: 2
    },
    filterNone:        { colors: ['off'], coScheme: null },
    filterReverb:       { 
                        colors: [
                            [1, 0, 0],
                            [30, 0, 0],
                            [110, 0, 0]
                        ],
                        calibration: false,
                        curve: 0.3,
                        markerColor: [110, 0, 0],
                        markerPosition: 0,
                        markerWidth: 2
                        },   
    filterSmoothGrowl: { 
                        colors: [
                            [0, 1, 0],
                            [0, 30, 0],
                            [0, 103, 0]
                        ],
                        calibration: false,
                        curve: 0.3,
                        markerColor: [0, 127, 0],
                        markerPosition: 0,
                        markerWidth: 2
                        },        
    filterEcho:        { 
                        colors: [
                            [0, 0, 1],
                            [0, 0, 30],
                            [0, 0, 103]
                        ],
                        calibration: false,
                        curve: 0.3,
                        markerColor: [0, 0, 127],
                        markerPosition: 0,
                        markerWidth: 2
                        },
    filterFlanger:     {
                        colors: [
                            [2, 1, 0],
                            [30, 25, 0],
                            [127, 110, 0]
                        ],
                        calibration: false,
                        curve: 0.2,
                        markerColor: [127, 127, 0],
                        markerPosition: 0,
                        markerWidth: 2
                        },
    filterMoog:        {
                        colors: [
                            [127, 40, 19],
                            [35, 10, 5],
                            [3, 1, 1],
                            [35, 10, 5],
                            [127, 40, 19]
                        ],
                        calibration: false,
                        curve: 0.2,
                        markerColor: [127, 40, 19],
                        markerWidth: 2
                        },   
    filterBalance:     {
                        colors: [
                            [110, 110, 110],
                            [30, 20, 30],
                            [2, 1, 1],
                            [30, 20, 30],
                            [110, 110, 110]
                        ],
                        calibration: false,
                        curve: 0.2,
                        markerColor: [110, 110, 110],
                        markerWidth: 2 
                        },
    syncOn:    { colors: ['amber, 80'] },
    keylockOn: { colors: ['white, 64'] },
    overlayWhite: { colors: ['white, 60, 0'] },
    overlayChord: { colors: ['white, 80'] },

    countdownIdle: { colors: [[0, 0, 0]] },

    countdownA1: countdownVariant('$DECK_A$', 'green',  'cyan'),
    countdownA2: countdownVariant('$DECK_A$', 'yellow', 'cyan'),
    countdownA3: countdownVariant('$DECK_A$', 'amber',  'cyan'),
    countdownA4: countdownVariant('$DECK_A$', 'red',    'yellow'),

    countdownB1: countdownVariant('$DECK_B$', 'green',  'cyan'),
    countdownB2: countdownVariant('$DECK_B$', 'yellow', 'cyan'),
    countdownB3: countdownVariant('$DECK_B$', 'amber',  'cyan'),
    countdownB4: countdownVariant('$DECK_B$', 'red',    'yellow')
});

// ============================================================
// SCHEME HELPERS
// ============================================================
var _fxSchemeCache = {};
var _fxSchemeKey = {};

function fxScheme(n) {
    var entry = myCatnip.THEME.fx[n];
    var key = Array.isArray(entry) ? entry.join('|') : entry;
    if (_fxSchemeKey[n] === key && _fxSchemeCache[n]) {
        return _fxSchemeCache[n];
    }
    var composed = B.composeScheme({
        scheme: 'catFX',
        markerColor: entry
    });
    _fxSchemeCache[n] = composed;
    _fxSchemeKey[n] = key;
    return composed;
}

var _themeSchemeCache = { deck: {}, fx: {} };
var _themeSchemeKey   = { deck: {}, fx: {} };
function themeScheme(kind, n) {
    var entry = myCatnip.THEME[kind][n];
    if (typeof entry === 'string') return entry;
    if (!Array.isArray(entry)) return entry;
    var key = entry.join('|');
    if (_themeSchemeKey[kind][n] === key && _themeSchemeCache[kind][n]) {
        return _themeSchemeCache[kind][n];
    }
    _themeSchemeCache[kind][n] = entry.slice();
    _themeSchemeKey[kind][n]   = key;
    return _themeSchemeCache[kind][n];
}

function _deferredMap(mk) {
    var out = {};
    [1, 2, 3, 4].forEach(function(n) {
        out[n] = function() { return mk(n); };
    });
    return out;
}

var FX_SCHEME_MAP = _deferredMap(fxScheme);
var FX_COLOR_MAP  = _deferredMap(function(n) { return themeScheme('fx', n); });

function fxSchemeFor(stateProp) {
    return {
        schemeFromState: { state: stateProp, map: FX_SCHEME_MAP }
    };
}

function countdownScheme() {
    return function() {
        var grp = this.group;
        if (!grp || grp.indexOf('[Channel') !== 0) return 'countdownIdle';

        var ctrl = this._ctrl;
        if (!ctrl) return 'countdownIdle';

        var rawGroup = this._rawCfg && this._rawCfg.group;
        var suffix = null;
        if (typeof rawGroup === 'string') {
            if      (rawGroup.indexOf('$DECK_A$') !== -1) suffix = 'A';
            else if (rawGroup.indexOf('$DECK_B$') !== -1) suffix = 'B';
            else if (rawGroup.indexOf('$DECK_ACTIVE$') !== -1) suffix = ctrl.activeDeck;
        }
        if (!suffix) return 'countdownIdle';

        var ch = ctrl._channelOf(grp);
        if (!ch) return 'countdownIdle';

        var meta = ctrl._trackMeta(ch);
        var dur = meta.duration;
        var bpmFile = meta.fileBpm;
        if (!(dur > 0)) return 'countdownIdle';
        if (!bpmFile) return 'countdownIdle';

        var bounds = ctrl._getContentBounds(ch);
        if (!bounds) return 'countdownIdle';

        var st = ctrl._decks[ch];
        var pp = (st && st.lastPlayPos !== undefined)
            ? st.lastPlayPos
            : engine.getValue(grp, 'playposition');
        var remainingNorm = bounds.end - pp;
        if (remainingNorm < 0) remainingNorm = 0;

        // Per-channel time signature.
        var sig = myCatnip.shared.timeSig[ch];
        var barBeats = (sig && sig.barBeats > 0) ? sig.barBeats : 4;

        var beatsLeft = remainingNorm * dur * bpmFile / 60;
        var barsLeft  = beatsLeft / barBeats;

        if (barsLeft <= 16) return 'countdown' + suffix + '4';
        if (barsLeft <= 32) return 'countdown' + suffix + '3';
        if (barsLeft <= 64) return 'countdown' + suffix + '2';
        return 'countdown' + suffix + '1';
    };
}

function slipScheme() {
    return {
        schemeFromState: {
            state: 'selectedDeckCurrent',
            map: {
                1: function() { return themeScheme('deck', 1); },
                2: function() { return themeScheme('deck', 2); },
                3: function() { return themeScheme('deck', 3); },
                4: function() { return themeScheme('deck', 4); }
            }
        }
    };
}

var PLAY_LED_SCHEME = {
    schemeFromState: {
        state: 'activeDisplaySource',
        map: { track: 'green', loop: 'yellow' }
    }
};

// ============================================================
// EXPORTS
// ============================================================
CAT.fxScheme = fxScheme;
CAT.themeScheme = themeScheme;
CAT.fxSchemeFor = fxSchemeFor;
CAT.FX_SCHEME_MAP = FX_SCHEME_MAP;
CAT.FX_COLOR_MAP = FX_COLOR_MAP;
CAT.countdownScheme = countdownScheme;
CAT.slipScheme = slipScheme;
CAT.PLAY_LED_SCHEME = PLAY_LED_SCHEME;

