// config/inpulse500-slicer.js — slicer state machine.
// Ported from the original script. Uses ctrl._ip500Slicer[side].

var SLICER_DOMAIN = 8;

myCatnip._ip500SlicerFresh = function() {
    return {
        beatsPassed: 0,
        previousBeatsPassed: 0,
        timer: false,
        active: false,
        alreadyJumped: false,
        button: -1,
        loopBeat8: 0
    };
};

myCatnip.ip500SlicerButton = function(ctrl, side, group, index) {
    var st = ctrl._ip500Slicer[side];
    var domain = SLICER_DOMAIN;
    var passedTime = engine.getValue(group, 'beat_distance');
    var loopEnabled = engine.getValue(group, 'loop_enabled');

    st.button = index;
    var beatsToJump = (index * (domain / 8)) - (st.beatsPassed % domain);
    beatsToJump -= passedTime;

    var bpm = engine.getValue(group, 'bpm');

    if (!st.timer) {
        st.timer = true;
        var timerMs = (1 - passedTime) * 60.0 / bpm * 1000;
        if (passedTime >= 0.8 &&
            ((!loopEnabled) || (st.beatsPassed % domain) !== (domain - 1))) {
            timerMs += 60.0 / bpm * 1000;
        }
        engine.beginTimer(timerMs, function() {
            if (engine.getValue(group, 'loop_enabled') === true) {
                engine.setValue(group, 'reloop_toggle', true);
                engine.setValue(group, 'slip_enabled', false);
                engine.beginTimer(2, function() {
                    engine.setValue(group, 'reloop_toggle', true);
                }, true);
            } else {
                engine.setValue(group, 'slip_enabled', false);
            }
            st.timer = false;
            st.button = -1;
        }, true);
    }

    engine.setValue(group, 'slip_enabled', true);
    if (loopEnabled) engine.setValue(group, 'reloop_toggle', true);
    engine.setValue(group, 'beatjump', beatsToJump);
    if (loopEnabled) engine.setValue(group, 'reloop_toggle', true);

    var padStatus = (side === 'A') ? 0x96 : 0x97;
    midi.sendShortMsg(padStatus, 0x20 + index, 0x62);
};

myCatnip.ip500SlicerBeatActive = function(ctrl, ch, value) {
    var side = (ch === 1 || ch === 3) ? 'A' : 'B';
    var st = ctrl._ip500Slicer[side];
    var group = '[Channel' + ch + ']';
    var domain = SLICER_DOMAIN;
    var bpm = engine.getValue(group, 'file_bpm');
    var pp  = engine.getValue(group, 'playposition');
    var dur = engine.getValue(group, 'duration');

    if (engine.getValue(group, 'beat_closest') === engine.getValue(group, 'beat_next')) {
        return;
    }

    st.beatsPassed = Math.floor((pp * dur) * (bpm / 60.0));

    if (st.active) {
        var slicerPosInSection = Math.floor((st.beatsPassed % domain) / (domain / 8));
        var padStatus = (side === 'A') ? 0x96 : 0x97;
        if (st.button !== slicerPosInSection) {
            for (var i = 0; i < 8; i++) {
                var active = ((slicerPosInSection === i) ? false : true) ? 0x03 : 0x7F;
                midi.sendShortMsg(padStatus, 0x20 + i, active);
            }
        } else {
            midi.sendShortMsg(padStatus, 0x20 + st.button, 0x62);
        }
    } else {
        st.alreadyJumped = false;
        st.previousBeatsPassed = 0;
    }
};