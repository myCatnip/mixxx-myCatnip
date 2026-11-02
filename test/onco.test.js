'use strict';

var H = require('./helpers');

// on.co LED must repaint when the CO it reads changes. This
// exercises the connection wired in _parseCsOn.
//
// Off/on distinction is carried by hw (brightness), not by the
// RGB channels — an "off" frame still sends the scheme's colour
// at the off-brightness.

test('on.co: LED repaints when the bound CO changes', function(t) {
    var c = H.ctrl();

    H.bind(c, 'grid0_0', {
        group:   '[EffectRack1_EffectUnit1]',
        inKey:   'enabled',
        outKey:  'enabled',
        colorScheme: {
            scheme: 'red',
            on: { co:    'group_[Channel1]_enable',
                  group: '[EffectRack1_EffectUnit1]' }
        }
    });

    // Start with the on.co value at 0 → LED off.
    H.setCO('[EffectRack1_EffectUnit1]', 'group_[Channel1]_enable', 0);
    H.clearLeds(c);
    c.bindings['grid0_0']._refresh();

    var offFrame = H.led(c, 'grid0_0');
    t.ok(offFrame, 'should have sent a frame with co = 0');
    t.eq(offFrame.hw, 12,
         'off-state hw should be the off-brightness (12), got ' + offFrame.hw);

    // Flip the CO from outside. No input, no patch change, no
    // beat — only the _parseCsOn connection can repaint.
    H.clearLeds(c);
    H.fireCO('[EffectRack1_EffectUnit1]', 'group_[Channel1]_enable', 1);

    var onFrame = H.led(c, 'grid0_0');
    t.ok(onFrame, 'co change must trigger a repaint via the connection');
    t.eq(onFrame.hw, 110,
         'on-state hw should be the on-brightness (110), got ' + onFrame.hw);
});