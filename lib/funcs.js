// lib/funcs.js — builders + myCatnip.FUNCS.
//
// Loaded after lib/schemes.js.

'use strict';

function _loadSelectedOntoChannel(ctrl, channel) {
    if (!ctrl.modifiers.loadArm) return false;
    if (!(channel >= 1 && channel <= 4)) return false;
    engine.setValue('[Channel' + channel + ']', 'LoadSelectedTrack', 1);
    return true;
}

function _addOverlayWithSiblingClear(ctrl, name, siblings) {
    ctrl._batchPatches(function(patches) {
        if (siblings.length > 0) {
            for (var i = patches.length - 1; i >= 0; i--) {
                if (patches[i] !== name && siblings.indexOf(patches[i]) !== -1) {
                    patches.splice(i, 1);
                }
            }
        }
        patches.push(name);
    });
}

myCatnip.builders = {};

myCatnip.builders._fxCs = function(opts) {
    var cs = {
        knob: opts.knob,
        scheme: myCatnip.builders.composeScheme(opts, undefined)
    };
    if (opts.schemeFromState !== undefined) {
        cs.schemeFromState = opts.schemeFromState;
    }
    return cs;
};

var EQ_BANDS = { high: 3, mid: 2, low: 1 };

myCatnip.builders.composeScheme = function(opts, base) {
    if (!opts) return base;
    var ref = (opts.scheme !== undefined) ? opts.scheme : base;
    if (ref === undefined || ref === null) return null;

    var markerPosition = opts.markerPosition;
    if (markerPosition === undefined && opts.marker !== undefined) {
        markerPosition = myCatnip.builders.marker(opts.marker);
    }

    var hasOverride =
        opts.markerColor    !== undefined ||
        markerPosition      !== undefined ||
        opts.markerWidth    !== undefined ||
        opts.schemePosition !== undefined ||
        opts.reverse        !== undefined ||
        opts.curve          !== undefined ||
        opts.brightness     !== undefined ||
        opts.beat           !== undefined;

    if (typeof ref === 'function') {
        var capturedOpts = opts;
        var capturedBase = base;
        var capturedRef = ref;
        var warnedNull = false;

        if (!hasOverride) {
            return function() {
                var v = capturedRef.call(this);
                if ((v === undefined || v === null) && !warnedNull) {
                    warnedNull = true;
                    myCatnip._warnOnce('composeSchemeFnNull:' + myCatnip._funcId(capturedRef),
                        'composeScheme: scheme function returned ' +
                        (v === null ? 'null' : 'undefined') +
                        ' — LED will stay dark until it returns a usable ref');
                }
                return v;
            };
        }

        var lastInner = null, lastComposed = null;
        return function() {
            var inner = capturedRef.call(this);
            if (inner === undefined || inner === null) {
                if (!warnedNull) {
                    warnedNull = true;
                    myCatnip._warnOnce('composeSchemeFnNull:' + myCatnip._funcId(capturedRef),
                        'composeScheme: scheme function returned ' +
                        (inner === null ? 'null' : 'undefined') +
                        ' — LED will stay dark until it returns a usable ref');
                }
                return null;
            }
            if (inner === lastInner) return lastComposed;
            lastInner = inner;
            lastComposed = myCatnip.builders.composeScheme(
                Object.assign({}, capturedOpts, { scheme: inner }),
                capturedBase);
            return lastComposed;
        };
    }

    if (typeof ref === 'string' && !hasOverride) return ref;

    var resolved;
    if (typeof ref === 'string') {
        var reg = myCatnip.SCHEMES[ref];
        if (!reg) {
            myCatnip._warnOnce('composeSchemeMissing:' + ref,
                'composeScheme: scheme "' + ref + '" not found');
            return null;
        }
        resolved = Object.assign({}, reg);
    } else if (typeof ref === 'object' && !Array.isArray(ref)) {
        if (ref.patch) {
            myCatnip._warnOnce('composeSchemePatch:' + JSON.stringify(ref).slice(0, 60),
                'composeScheme: scheme patches are no longer supported — ' +
                'pass a plain scheme object or a name plus inline overrides. ' +
                'Got: ' + JSON.stringify(ref).slice(0, 120));
            return null;
        }
        resolved = Object.assign({}, ref);
    } else if (Array.isArray(ref)) {
        resolved = { colors: [ref], interp: false, calibration: false,
                     coScheme: null };
    } else {
        return null;
    }

    if (opts.markerColor    !== undefined) resolved.markerColor    = opts.markerColor;
    if (markerPosition      !== undefined) resolved.markerPosition = markerPosition;
    if (opts.markerWidth    !== undefined) resolved.markerWidth    = opts.markerWidth;
    if (opts.schemePosition !== undefined) resolved.schemePosition = opts.schemePosition;
    if (opts.reverse        !== undefined) resolved.reverse        = opts.reverse;
    if (opts.curve          !== undefined) resolved.curve          = opts.curve;
    if (opts.brightness     !== undefined) resolved.brightness     = opts.brightness;
    if (opts.beat           !== undefined) resolved.beat           = opts.beat;

    return resolved;
};

myCatnip.builders.marker = function(v) {
    if (v === undefined) return undefined;
    if (v === 'low')  return 0;
    if (v === 'mid')  return 63.5;
    if (v === 'high') return 127;
    return v;
};

myCatnip.builders.ledTrackButton = function(knob, scheme, state, marker, schemePosition) {
    var opts = { scheme: scheme };
    if (marker !== undefined) opts.marker = marker;
    if (schemePosition !== undefined) opts.schemePosition = schemePosition;
    var cs = { knob: knob, scheme: myCatnip.builders.composeScheme(opts) };
    if (state === 'on') cs.on = true;
    return { colorScheme: cs };
};

myCatnip.builders.eqKnob = function(deck, band) {
    return {
        group: '[EqualizerRack1_' + deck + '_Effect1]',
        inKey: 'parameter' + EQ_BANDS[band]
    };
};

myCatnip.builders.fxUnitKnob = function(unit, key) {
    return {
        group: '[EffectRack1_EffectUnit' + unit + ']',
        inKey: key
    };
};

myCatnip.builders.fxKnob = function(unit, effect, param) {
    return {
        group: '[EffectRack1_EffectUnit' + unit + '_Effect' + effect + ']',
        inKey: (param === 'meta') ? 'meta' : ('parameter' + param)
    };
};

myCatnip.builders.fxEnabled = function(unit, effect, opts) {
    opts = opts || {};
    if (opts.scheme === undefined && opts.schemeFromState === undefined) {
        print('[myCatnip] fxEnabled unit=' + unit + ' effect=' + effect +
            ' missing scheme — pass scheme: \'catFX\' (or similar)');
    }
    return {
        group: '[EffectRack1_EffectUnit' + unit + '_Effect' + effect + ']',
        inKey: 'enabled', outKey: 'enabled',
        colorScheme: myCatnip.builders._fxCs(opts)
    };
};

myCatnip.builders.fxButton = function(unit, effect, param, opts) {
    opts = opts || {};
    if (opts.scheme === undefined && opts.schemeFromState === undefined) {
        print('[myCatnip] fxButton unit=' + unit + ' effect=' + effect +
              ' param=' + param + ' missing scheme — pass scheme: \'catFX\' (or similar)');
    }
    var key = 'button_parameter' + param;
    return {
        group: '[EffectRack1_EffectUnit' + unit + '_Effect' + effect + ']',
        inKey: key, outKey: key,
        colorScheme: myCatnip.builders._fxCs(opts)
    };
};

myCatnip.builders.fxHeadphone = function(unit, opts) {
    opts = opts || {};
    if (opts.scheme === undefined && opts.schemeFromState === undefined) {
        print('[myCatnip] fxHeadphone unit=' + unit +
              ' missing scheme — pass scheme: \'catFX\' (or similar)');
    }
    return {
        group: '[EffectRack1_EffectUnit' + unit + ']',
        inKey: 'group_[Headphone]_enable',
        outKey: 'group_[Headphone]_enable',
        colorScheme: myCatnip.builders._fxCs(opts)
    };
};

myCatnip.builders.fxGroupEnable = function(unit, deck, opts) {
    opts = opts || {};
    if (opts.scheme === undefined && opts.schemeFromState === undefined) {
        print('[myCatnip] fxGroupEnable unit=' + unit + ' deck=' + deck +
              ' missing scheme — pass scheme: \'catFX\' (or similar)');
    }
    var key = 'group_' + deck + '_enable';
    return {
        group: '[EffectRack1_EffectUnit' + unit + ']',
        inKey: key, outKey: key,
        colorScheme: myCatnip.builders._fxCs(opts)
    };
};

myCatnip.builders.fxMix = function(unit) {
    return {
        group: '[EffectRack1_EffectUnit' + unit + ']',
        inKey: 'mix'
    };
};

myCatnip.builders.qfxKnob = function(deck) {
    return {
        group: '[QuickEffectRack1_' + deck + ']',
        inKey: 'super1'
    };
};

myCatnip.FUNCS = {
    k3Select: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var kind = args[0], which = args[1], val = parseInt(args[2], 10);
        if (isNaN(val)) return;
        var ctrl = this._ctrl;
        if (kind === 'deck' && _loadSelectedOntoChannel(ctrl, val)) return;
        ctrl.setSelectedFor(kind, which, val);
    },
    k3SelectActive: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var kind = args[0];
        var val  = parseInt(args[1], 10);
        if (isNaN(val)) return;
        var ctrl = this._ctrl;
        if (kind === 'deck' && _loadSelectedOntoChannel(ctrl, val)) return;
        var slot = (kind === 'fx') ? ctrl.activeFx : ctrl.activeDeck;
        ctrl.setSelectedFor(kind, slot, val);
    },
    setActiveFxTo: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        this._ctrl.setActiveFx(args[0]);
    },
    toggleActiveFx: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        this._ctrl.setActiveFx(this._ctrl.activeFx === 'A' ? 'B' : 'A');
    },
    setActiveDeckTo: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var ctrl = this._ctrl;
        var which = args[0];
        if (which !== 'A' && which !== 'B') return;
        var channel = (which === 'A') ? ctrl.selectedDeckA : ctrl.selectedDeckB;
        if (_loadSelectedOntoChannel(ctrl, channel)) return;
        ctrl.setActiveDeck(which);
    },
    toggleActiveDeck: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        this._ctrl.setActiveDeck(this._ctrl.activeDeck === 'A' ? 'B' : 'A');
    },

    layerButton: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        if (this._ctrl.modifiers.chord) return;
        this._ctrl.replacePatch(args[0], args[1]);
    },

    toggleOverlay: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var name = args[0];
        if (!name) return;
        var ctrl = this._ctrl;
        if (ctrl.activePatches.indexOf(name) !== -1) {
            ctrl._batchPatches(function(patches) {
                var idx = patches.indexOf(name);
                if (idx !== -1) patches.splice(idx, 1);
            });
            myCatnip.debugPrint('overlayOff', { name: name });
            return;
        }
        var siblings = Array.isArray(args[1]) ? args[1] : [];
        _addOverlayWithSiblingClear(ctrl, name, siblings);
        myCatnip.debugPrint('overlayOn', { name: name });
    },
    layerExitOverlay: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        this._ctrl.removePatch(args[0]);
    },

    toggleLayerOverlay: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var ctrl = this._ctrl;
        var name = null;
        if      (ctrl._patchActive('cue'))  name = args[0];
        else if (ctrl._patchActive('loop')) name = args[1];
        if (!name) return;
        if (ctrl.activePatches.indexOf(name) !== -1) {
            ctrl.removePatch(name);
        } else {
            ctrl.addPatch(name);
        }
    },

    hotcueSetPhraseColor: function(args, ch, c, v, s) {
        var n = parseInt(args[0], 10);
        if (isNaN(n) || n < 1) return;
        var ctrl = this._ctrl;
        if (!ctrl._isPress(v, s)) {
            engine.setValue(this.group, 'hotcue_' + n + '_activate', 0);
            return;
        }
        var markers = myCatnip.PHRASE_MARKER_COLORS;
        var color = (Array.isArray(markers) && markers.length > 0)
            ? markers[0] : null;
        var wasSet = engine.getValue(this.group, 'hotcue_' + n + '_status') > 0;
        engine.setValue(this.group, 'hotcue_' + n + '_activate', 1);
        if (!wasSet && color !== null) {
            engine.setValue(this.group, 'hotcue_' + n + '_color', color);
        }
    },

    toggleTopMode: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var mode = this._ctrl.currentTopMode();
        if (mode === 'focus') this._ctrl.setTopMode('twoDeck');
        else                  this._ctrl.setTopMode('focus');
    },
    toggleMiniFx: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var mode = this._ctrl.currentTopMode();
        if      (mode === 'twoDeck')     this._ctrl.setTopMode('twoDeckMini');
        else if (mode === 'twoDeckMini') this._ctrl.setTopMode('twoDeck');
    },

    slipOrLoad: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var ctrl = this._ctrl;
        if (_loadSelectedOntoChannel(ctrl, ctrl.selectedDeckCurrent)) return;
        var cur = engine.getValue(this.group, 'slip_enabled');
        engine.setValue(this.group, 'slip_enabled', cur ? 0 : 1);
    },

    encPregainStep: function(args, ch, c, v, s) {
        var dir = (v === 1) ? 1 : -1;
        var step = myCatnip.parseNum(args[0]); if (isNaN(step)) step = 0.025;
        engine.setValue(this.group, this.inKey,
                        engine.getValue(this.group, this.inKey) + dir * step);
    },
    encBpmOrHeadMix: function(args, ch, c, v, s) {
        var dir = (v === 1) ? 1 : -1;
        var bpmStep = myCatnip.parseNum(args[0]); if (isNaN(bpmStep)) bpmStep = 0.1;
        var mixStep = myCatnip.parseNum(args[1]); if (isNaN(mixStep)) mixStep = 0.05;
        if (this._ctrl.modifiers.bpmPressHeld) {
            this._ctrl._bpmHeldTurned = true;
            engine.setValue('[Master]', 'headMix',
                            engine.getValue('[Master]', 'headMix') + dir * mixStep);
        } else {
            engine.setValue(this.group, this.inKey,
                            engine.getValue(this.group, this.inKey) + dir * bpmStep);
        }
    },

    bpmPress: function(args, ch, c, v, s) {
        if (this._ctrl._isPress(v, s)) {
            this._ctrl._bpmHeldTurned = false;
            return;
        }
        if (!this._transaction || !this._transaction.active) return;
        var turned = this._ctrl._bpmHeldTurned;
        this._ctrl._bpmHeldTurned = false;
        if (this._transaction.orphaned) return;
        if (this._ctrl.modifiers.shift && !turned) {
            var cur = engine.getValue('[Master]', 'headSplit');
            engine.setValue('[Master]', 'headSplit', cur ? 0 : 1);
        }
    },
    encPlaylistNav: function(args, ch, c, v, s) {
        engine.setValue('[Playlist]',
            (v === 1) ? 'SelectNextTrack' : 'SelectPrevTrack', 1);
    },
    encQuickFxCycle: function(args, ch, c, v, s) {
        var grp = this.group;
        var len = myCatnip.QFX_CHAIN_LIST.length;
        if (len === 0) return;
        var cur = Math.floor(engine.getValue(grp, 'loaded_chain_preset'));
        if (cur < 0) cur = 0;
        var next = (cur + (v === 1 ? 1 : -1) + len) % len;
        engine.setValue(grp, 'loaded_chain_preset', next);
    },
    encKeyShift: function(args, ch, c, v, s) {
        engine.setValue(this.group, 'pitch_adjust',
            engine.getValue(this.group, 'pitch_adjust') + ((v === 1) ? 1 : -1));
    },
    encKeySyncReset: function(args, ch, c, v, s) {
        var dir = (v === 1) ? 1 : -1;
        if (dir > 0) engine.setValue(this.group, 'sync_key', 1);
        else engine.setValue(this.group, 'reset_key', 1);
    },
    encKeySync: function(args, ch, c, v, s) {
        engine.setValue(this.group, 'sync_key', 1);
    },
    encKeyReset: function(args, ch, c, v, s) {
        engine.setValue(this.group, 'reset_key', 1);
    },
    encStepParam: function(args, ch, c, v, s) {
        var group = args[0], key = args[1];
        if (!group || !key) return;
        var dir = (v === 1) ? 1 : -1;
        var step = myCatnip.parseNum(args[2]); if (isNaN(step)) step = 0.02;
        var cur = engine.getParameter(group, key);
        engine.setParameter(group, key, Math.max(0, Math.min(1, cur + dir * step)));
    },

    encBeatjump: function(args, ch, c, v, s) {
        var chNum = this._ctrl._channelOf(this.group);
        if (!chNum) return;
        var loopOn = engine.getValue('[Channel' + chNum + ']', 'loop_enabled') > 0;
        if (!loopOn) return;
        if (!this._ctrl._beatjumpAllowed(this.group, loopOn)) return;
        var co = (v === 1) ? 'beatjump_forward' : 'beatjump_backward';
        this._ctrl._pulseCo(this.group, co);
    },
    beatjumpButton: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        if (!this._ctrl._beatjumpAllowed(this.group)) return;
        this._ctrl._pulseCo(this.group, args[0]);
    },
    reloopToggleResetAnchor: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        engine.setValue(this.group, 'loop_anchor', 0);
        this._ctrl._pulseCo(this.group, 'reloop_toggle');
        this._ctrl._touchLoop(this.group);
    },
    beatloopActivateResetAnchor: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        engine.setValue(this.group, 'loop_anchor', 0);
        this._ctrl._pulseCo(this.group, 'beatloop_activate');
        this._ctrl._touchLoop(this.group);
    },

    encLoopMove: function(args, ch, c, v, s) {
        var inSide = (args[0] === 'in');
        var step = myCatnip.parseNum(args[1]); if (isNaN(step)) step = 0.010;
        var dir = (v === 1) ? -1 : 1;
        var sign = inSide ? 1 : -1;
        var wantAnchor = inSide ? 1 : 0;
        if (engine.getValue(this.group, 'loop_anchor') !== wantAnchor)
            engine.setValue(this.group, 'loop_anchor', wantAnchor);
        engine.setValue(this.group, this.inKey,
            engine.getValue(this.group, this.inKey) + sign * dir * step);
        this._ctrl._touchLoop(this.group);
    },

    pressSetValue: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        engine.setValue(this.group, this.inKey, myCatnip.parseNum(args[0]));
        if (this.inKey === 'beatloop_size') this._ctrl._touchLoop(this.group);
    },
    encBeatjumpStepScale: function(args, ch, c, v, s) {
        var min = myCatnip.parseNum(args[0]); if (isNaN(min)) min = myCatnip.BEATJUMP_MIN;
        var max = myCatnip.parseNum(args[1]); if (isNaN(max)) max = myCatnip.BEATJUMP_MAX;
        var forward = (v === 1) ? -1 : 1;
        var cur = engine.getValue(this.group, 'beatjump_size');
        if (forward > 0) { if (cur <= min) return; engine.setValue(this.group, 'beatjump_size_halve', 1); }
        else { if (cur >= max) return; engine.setValue(this.group, 'beatjump_size_double', 1); }
    },

    shutdownHold: function(args, ch, c, v, s) {
        if (this._ctrl._shuttingDown) return;
        var self = this;
        if (this._ctrl._isPress(v, s)) {
            if (self._shutdownHoldTimer) {
                engine.stopTimer(self._shutdownHoldTimer);
                self._shutdownHoldTimer = null;
            }
            self._shutdownHoldTimer = engine.beginTimer(2000, function() {
                self._shutdownHoldTimer = null;
                print('myCatnip: user shutdown');
                self._ctrl.shutdown();
            }, true);
        } else {
            if (self._shutdownHoldTimer) {
                engine.stopTimer(self._shutdownHoldTimer);
                self._shutdownHoldTimer = null;
            }
        }
    },

    cycleDisplaySource: function(args, ch, c, v, s) {
        if (!this._ctrl._isPress(v, s)) return;
        var chNum = this._ctrl._channelOf(this.group);
        if (!chNum) return;
        var ctrl = this._ctrl;
        var st = ctrl._decks[chNum];

        if (!st.loopClock.running) return;

        st.displaySource = (st.displaySource === 'loop') ? 'track' : 'loop';
        if (ctrl.selectedDeckCurrent === chNum) {
            ctrl._refreshDisplayFlags();
        }
        ctrl._syncBeatCount(chNum);
        ctrl._refreshAllLeds('display-cycle');
    }
};