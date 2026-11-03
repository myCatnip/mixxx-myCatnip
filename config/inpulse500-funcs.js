// config/inpulse500-funcs.js — custom funcs.
// Assist-held delegates shift-able funcs to their shift variants.
// Browser funcs follow pasted script's active behavior.

var F = myCatnip.FUNCS;

F.ip500Play = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    if (this._ctrl._ip500AssistHeld) return F.ip500PlayShift.call(this, args, ch, c, v, s);
    var side = args[0];
    var ctrl = this._ctrl;
    var playing = engine.getValue(this.group, 'play_latched');
    if (playing && ctrl._ip500SlowPause[side]) {
        var m = this.group.match(/\[Channel(\d)\]$/);
        if (m) engine.brake(parseInt(m[1], 10), 1, 54);
        return;
    }
    var cur = engine.getValue(this.group, 'play_indicator');
    engine.setValue(this.group, 'play', cur ? 0 : 1);
};
F.ip500PlayShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'play_stutter', 1);
};

F.ip500Cue = function(args, ch, c, v, s) {
    if (this._ctrl._ip500AssistHeld) return F.ip500CueShift.call(this, args, ch, c, v, s);
    if (v > 0) {
        if (engine.getValue(this.group, 'play_indicator')) {
            engine.setValue(this.group, 'cue_gotoandstop', 1);
        } else {
            engine.setValue(this.group, 'cue_default', 1);
        }
    } else {
        engine.setValue(this.group, 'cue_default', 0);
    }
};
F.ip500CueShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'start_play', 1);
};

F.ip500Sync = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    if (this._ctrl._ip500AssistHeld) return F.ip500SyncShift.call(this, args, ch, c, v, s);
    var cur = engine.getValue(this.group, 'sync_enabled');
    engine.setValue(this.group, 'sync_enabled', cur ? 0 : 1);
};
F.ip500SyncShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'sync_key', 1);
};

F.ip500Load = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    if (this._ctrl._ip500AssistHeld) return F.ip500LoadShift.call(this, args, ch, c, v, s);
    engine.setValue(this.group, 'LoadSelectedTrack', 1);
};
F.ip500LoadShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var m = this.group.match(/\[Channel(\d)\]$/);
    if (!m) return;
    var cur = parseInt(m[1], 10);
    var alt = (cur === 1) ? 3 : (cur === 3) ? 1 : (cur === 2) ? 4 : 2;
    engine.setValue('[Channel' + alt + ']', 'LoadSelectedTrack', 1);
};

F.ip500Vinyl = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    if (this._ctrl._ip500AssistHeld) return F.ip500VinylShift.call(this, args, ch, c, v, s);
    var side = args[0];
    var ctrl = this._ctrl;
    if (side === 'A') ctrl._ip500VinylA = !ctrl._ip500VinylA;
    else              ctrl._ip500VinylB = !ctrl._ip500VinylB;
    this._refresh();
};
F.ip500VinylShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var side = args[0];
    this._ctrl._ip500SlowPause[side] = !this._ctrl._ip500SlowPause[side];
};

F.ip500LoopIn = function(args, ch, c, v, s) {
    if (this._ctrl._ip500AssistHeld) return F.ip500LoopInShift.call(this, args, ch, c, v, s);
    engine.setValue(this.group, 'loop_in', v > 0 ? 1 : 0);
};
F.ip500LoopInShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'loop_in_goto', 1);
};
F.ip500LoopOut = function(args, ch, c, v, s) {
    if (this._ctrl._ip500AssistHeld) return F.ip500LoopOutShift.call(this, args, ch, c, v, s);
    engine.setValue(this.group, 'loop_out', v > 0 ? 1 : 0);
};
F.ip500LoopOutShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'loop_out_goto', 1);
};
F.ip500LoopPush = function(args, ch, c, v, s) {
    if (this._ctrl._ip500AssistHeld) return F.ip500LoopPushShift.call(this, args, ch, c, v, s);
    // reloop_toggle is a trigger, but the CO value must be
    // reset to 0 on release or the skin button stays latched.
    if (v > 0) engine.setValue(this.group, 'reloop_toggle', 1);
    else       engine.setValue(this.group, 'reloop_toggle', 0);
};
F.ip500LoopPushShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    // beatloop_activate has the same latch behaviour.
    if (v > 0) engine.setValue(this.group, 'beatloop_4_activate', 1);
    else       engine.setValue(this.group, 'beatloop_4_activate', 0);
};

F.ip500Filter = function(args, ch, c, v, s) {
    if (this.type === 'knob' && this._normalized !== undefined) {
        engine.setParameter(this.group, 'super1', this._normalized);
    }
};

F.ip500LoopEncoder = function(args, ch, c, v, s) {
    if (v >= 0x40) engine.setValue(this.group, 'loop_halve', 1);
    else           engine.setValue(this.group, 'loop_double', 1);
};

F.ip500SetPadMode = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var deck = args[0], mode = args[1];
    var ctrl = this._ctrl;
    ctrl._ip500PadMode[deck] = mode;
    ctrl._batchPatches(function(patches) {
        for (var i = patches.length - 1; i >= 0; i--) {
            if (patches[i].indexOf('deck' + deck + '_') === 0) {
                patches.splice(i, 1);
            }
        }
        patches.push('deck' + deck + '_' + mode);
    });
};

F.ip500PadNoop      = function() {};
F.ip500PadNoopShift = function() {};

F.ip500PadHotcue = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'hotcue_' + args[0] + '_activate', 1);
};
F.ip500PadHotcueShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'hotcue_' + args[0] + '_clear', 1);
};

F.ip500PadLoop = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'beatloop_' + args[0] + '_toggle', 1);
};

F.ip500PadSlicer = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var side = (this.group === '[Channel1]' || this.group === '[Channel3]') ? 'A' : 'B';
    myCatnip.ip500SlicerButton(this._ctrl, side, this.group, args[0]);
};

F.ip500PadSampler = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var grp = '[Sampler' + args[0] + ']';
    if (engine.getValue(grp, 'track_loaded')) {
        var cur = engine.getValue(grp, 'play');
        engine.setValue(grp, 'play', cur ? 0 : 1);
    }
};
F.ip500PadSamplerShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var grp = '[Sampler' + args[0] + ']';
    if (engine.getValue(grp, 'track_loaded')) {
        engine.setValue(grp, 'cue_gotoandstop', 1);
    }
};

F.ip500PadPitchDownTone = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    for (var i = 0; i < 12; i++) engine.setValue(this.group, 'pitch_down', 1);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x1F);
};
F.ip500PadPitchDownSemi = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'pitch_down', 1);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x1F);
};
F.ip500PadPitchUpSemi = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    engine.setValue(this.group, 'pitch_up', 1);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x1F);
};
F.ip500PadPitchUpTone = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    for (var i = 0; i < 12; i++) engine.setValue(this.group, 'pitch_up', 1);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x1F);
};

var IP500_PITCH_RANGES = [0.08, 0.10, 0.15, 0.16, 0.24, 0.50, 0.90];
F.ip500PitchRangeUp = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var side = (this.group === '[Channel1]' || this.group === '[Channel3]') ? 'A' : 'B';
    var ctrl = this._ctrl;
    if (ctrl._ip500PitchRange[side] < 6) ctrl._ip500PitchRange[side]++;
    engine.setValue(this.group, 'rateRange', IP500_PITCH_RANGES[ctrl._ip500PitchRange[side]]);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x42);
};
F.ip500PitchRangeDown = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var side = (this.group === '[Channel1]' || this.group === '[Channel3]') ? 'A' : 'B';
    var ctrl = this._ctrl;
    if (ctrl._ip500PitchRange[side] > 0) ctrl._ip500PitchRange[side]--;
    engine.setValue(this.group, 'rateRange', IP500_PITCH_RANGES[ctrl._ip500PitchRange[side]]);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x02);
};
F.ip500PitchRangeReset = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var side = (this.group === '[Channel1]' || this.group === '[Channel3]') ? 'A' : 'B';
    var ctrl = this._ctrl;
    ctrl._ip500PitchRange[side] = 0;
    engine.setValue(this.group, 'rateRange', IP500_PITCH_RANGES[0]);
    midi.sendShortMsg(this.midi[0], this.midi[1], 0x42);
};

F.ip500PadRoll = function(args, ch, c, v, s) {
    var status = this.midi[0], note = this.midi[1];
    if (v === 0x7F) {
        engine.setValue(this.group, 'beatlooproll_' + args[0] + '_activate', 1);
        midi.sendShortMsg(status, note, 0x1F);
    } else {
        engine.setValue(this.group, 'beatlooproll_' + args[0] + '_activate', 0);
        midi.sendShortMsg(status, note, 0x12);
    }
};

F.ip500PadEffect = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var unit = (this.group === '[Channel1]' || this.group === '[Channel3]') ? 1 : 2;
    var grp = '[EffectRack1_EffectUnit' + unit + '_Effect' + args[0] + ']';
    var cur = engine.getValue(grp, 'enabled');
    engine.setValue(grp, 'enabled', cur ? 0 : 1);
};
F.ip500PadEffectShift = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var unit = (this.group === '[Channel1]' || this.group === '[Channel3]') ? 1 : 2;
    var grp = '[EffectRack1_EffectUnit' + unit + '_Effect' + args[0] + ']';
    engine.setValue(grp, 'effect_selector', 1);
};
F.ip500PadFXRoute = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var grp = '[EffectRack1_EffectUnit' + args[0] + ']';
    var key = 'group_' + this.group + '_enable';
    var cur = engine.getValue(grp, key);
    engine.setValue(grp, key, cur ? 0 : 1);
};
F.ip500PadQFXCycle = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var grp = '[QuickEffectRack1_' + this.group + ']';
    engine.setValue(grp, 'chain_preset_selector', args[0]);
};
F.ip500PadQFXEnable = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var grp = '[QuickEffectRack1_' + this.group + ']';
    var cur = engine.getValue(grp, 'enabled');
    engine.setValue(grp, 'enabled', cur ? 0 : 1);
};

F.ip500PadBeatjump = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    if (!this._ctrl._beatjumpAllowed(this.group)) return;
    engine.setValue(this.group, args[0], 1);
};

// Assistant: press sets assistHeld (global shift for decks),
// release clears it and (if not consumed by browser turn) toggles
// the library maximized state.
F.ip500Assistant = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    if (v > 0) {
        ctrl._ip500AssistHeld = true;
        ctrl._ip500AssistConsumed = false;
        return;
    }
    ctrl._ip500AssistHeld = false;
    if (!ctrl._ip500AssistConsumed) {
        var cur = engine.getValue('[Skin]', 'show_maximized_library');
        engine.setValue('[Skin]', 'show_maximized_library', cur ? 0 : 1);
    }
    ctrl._ip500AssistConsumed = false;
};

F.ip500BrowserPush = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    if (v > 0) {
        ctrl._ip500BrowserPressHeld = true;
        ctrl._ip500BrowserPressConsumed = false;
        return;
    }
    ctrl._ip500BrowserPressHeld = false;
    if (ctrl._ip500BrowserPressConsumed) {
        ctrl._ip500BrowserPressConsumed = false;
        return;
    }
    if (engine.getValue('[Skin]', 'show_maximized_library') === 0) return;
    engine.setValue('[Library]', 'MoveFocus', 1);
};

F.ip500BrowserTurn = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    var dir = (v > 0x3F) ? 1 : -1;

    // Encoder button held: tunnel (expand/collapse sidebar tree).
    if (ctrl._ip500BrowserPressHeld) {
        ctrl._ip500BrowserPressConsumed = true;
        engine.setValue('[Library]', dir > 0 ? 'MoveLeft' : 'MoveRight', 1);
        return;
    }

    // Assist held: horizontal browse (existing shift behaviour).
    if (ctrl._ip500AssistHeld) {
        ctrl._ip500AssistConsumed = true;
        engine.setValue('[Library]', dir > 0 ? 'MoveLeft' : 'MoveRight', 1);
        return;
    }

    if (engine.getValue('[Skin]', 'show_maximized_library') === 0) return;
    if (ctrl._ip500BrowserOffFocus) {
        engine.setValue('[Playlist]', 'SelectTrackKnob', -dir);
    } else {
        engine.setValue('[Library]', dir > 0 ? 'MoveUp' : 'MoveDown', 1);
    }
};

F.ip500DeckSel = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    var side = args[0], channel = args[1];
    ctrl.setSelectedFor('deck', side, channel);
    ctrl._ip500UpdateDeckIndicators();
};

F.ip500XfaderEnable = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    ctrl._ip500XfaderEnabled = (v > 0);
    if (v === 0) engine.setValue('[Master]', 'crossfader', 0);
};
F.ip500XfaderCurve = function(args, ch, c, v, s) {
    if (v === 0x7F) {
        script.crossfaderCurve(127, 0, 127);
        this._ctrl._ip500XfaderScratch = true;
    } else if (v === 0x00) {
        script.crossfaderCurve(0, 0, 127);
        this._ctrl._ip500XfaderScratch = false;
    }
};
F.ip500Crossfader = function(args, ch, c, v, s) {
    var ctrl = this._ctrl;
    if (!ctrl._ip500XfaderEnabled) return;
    if (ctrl._ip500XfaderScratch) {
        var xf;
        if (v <= 0) xf = -1;
        else if (v >= 127) xf = 1;
        else xf = Math.tan((v - 64) * Math.PI / 2 / 63) / 32;
        engine.setValue('[Master]', 'crossfader', xf);
    } else {
        engine.setParameter('[Master]', 'crossfader',
            Math.max(0, Math.min(1, v / 127)));
    }
};