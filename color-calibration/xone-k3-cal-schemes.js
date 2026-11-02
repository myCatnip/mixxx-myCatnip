// xone-k3-cal-schemes.js — calibration sweep schemes.
//
// Three single-channel ramps: one channel sweeps 0..127, the
// other two stay off. Used to sweep each LED channel
// independently for calibration work.
//
// Load after lib-schemes.js. Not loaded by any shipped preset
// XML by default — add the <file> line if you want them.

(function() {
    if (typeof XoneK3 === 'undefined') { XoneK3 = {}; }

    function chanScheme(chan) {
        var stops = [];
        for (var i = 0; i < 25; i++) {
            var hw = Math.round(i * 127 / 24);
            var rgb = [0, 0, 0];
            rgb[chan] = 127;
            stops.push([rgb[0], rgb[1], rgb[2], hw]);
        }
        return { colors: stops, markerWidth: 0 };
    }

    XoneK3.SCHEMES.calR = chanScheme(0);
    XoneK3.SCHEMES.calG = chanScheme(1);
    XoneK3.SCHEMES.calB = chanScheme(2);
})();