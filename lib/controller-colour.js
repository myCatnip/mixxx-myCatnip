// lib/controller-colour.js — colour-scheme parser for
// Controller: on: shapes, base scheme resolution, schemeFromState
// closures, _setupColorScheme entry point.
//
// Loaded after lib/controller.js, before lib/controller-beat.js.
// Extends Controller.prototype. Called from _applyBinding.


// Fields recognised inside colorScheme.on's conditional form.
var KNOWN_ON = ['patchActive', 'state', 'equals', 'contains', 'co', 'group'];

// ============================================================
// on: PARSING
// ============================================================
myCatnip.Controller.prototype._parseCsOn = function(b, cs) {
    if (cs.on === undefined || cs.on === null) return;
    if (cs.on === true)  { b._csOn = true;  return; }
    if (cs.on === false) { b._csOn = false; return; }
    if (typeof cs.on !== 'object' || Array.isArray(cs.on)) {
        myCatnip._warnOnce('csOnShape:' + b._name,
            'colorScheme.on must be true, false, or a conditional object on ' + b._name +
            ' — got ' + (Array.isArray(cs.on) ? 'array' : typeof cs.on));
        return;
    }

    var o = {};
    if (cs.on.patchActive !== undefined) o.patchActive = cs.on.patchActive;
    if (cs.on.state       !== undefined) o.state = cs.on.state;
    if (cs.on.equals      !== undefined) o.equals = cs.on.equals;
    if (cs.on.contains    !== undefined) o.contains = cs.on.contains;
    if (cs.on.group !== undefined && cs.on.co === undefined) {
        myCatnip._warnOnce('csOnGroupNoCo:' + b._name,
            'colorScheme.on on ' + b._name +
            ' has `group` but no `co` — group is ignored');
    }
    if (cs.on.co !== undefined) {
        var g = cs.on.group ? myCatnip.resolve(cs.on.group, this) : b.group;
        if (!g) {
            myCatnip._warnOnce('csOnCoGroup:' + b._name,
                'colorScheme.on.co on ' + b._name +
                ' has no group and the binding has no group either');
            return;
        }
        o.co = cs.on.co;
        o.group = g;
    }

    this._warnUnknownCsOnFields(b, cs.on);

    if (Object.keys(o).length === 0) {
        myCatnip._warnOnce('csOnEmpty:' + b._name,
            'colorScheme.on has no recognised fields on ' + b._name +
            ' — on: ignored; LED falls back to outKey (or stays off if none).');
        return;
    }

    var hasSource = (o.patchActive !== undefined ||
                     o.state       !== undefined ||
                     o.co          !== undefined);
    if (!hasSource) {
        var orphan = (o.equals !== undefined) ? 'equals' : 'contains';
        myCatnip._warnOnce('csOnNoSource:' + b._name,
            'colorScheme.on on ' + b._name + ' has `' + orphan + '` ' +
            'but no `state`, `co`, or `patchActive` to compare against ' +
            '— no match possible; LED renders its off-ramp.');
    }
    if (o.patchActive !== undefined &&
        (o.equals !== undefined || o.contains !== undefined)) {
        myCatnip._warnOnce('csOnPatchActiveCmp:' + b._name,
            'colorScheme.on on ' + b._name +
            ' has `equals`/`contains` alongside `patchActive` — ' +
            'comparators are ignored when patchActive is the source');
    }
    if (o.patchActive !== undefined &&
        (o.co !== undefined || o.state !== undefined)) {
        myCatnip._warnOnce('csOnPatchActiveSource:' + b._name,
            'colorScheme.on on ' + b._name +
            ' has both `patchActive` and `co`/`state` — patchActive ' +
            'wins, the other source is ignored');
    }

    b._csOn = o;
    this._wireCsOnConnection(b, o);
};

myCatnip.Controller.prototype._warnUnknownCsOnFields = function(b, csOn) {
    for (var k in csOn) {
        if (!csOn.hasOwnProperty(k)) continue;
        if (KNOWN_ON.indexOf(k) === -1) {
            myCatnip._warnOnce('csOnUnknown:' + b._name + ':' + k,
                'colorScheme.on on ' + b._name +
                ' has unknown field "' + k + '" — ignored');
        }
    }
};

myCatnip.Controller.prototype._wireCsOnConnection = function(b, o) {
    if (!o.co || !o.group) return;
    b._conns.push(engine.makeConnection(o.group, o.co, function(v) {
        o.cachedValue = v;
        b._refresh();
    }));
    try {
        o.cachedValue = engine.getValue(o.group, o.co);
    } catch (e) {
        o.cachedValue = undefined;
    }
};

// ============================================================
// BASE SCHEME
// ============================================================
myCatnip.Controller.prototype._parseSchemeValue = function(b, cs) {
    if (cs.scheme === undefined || cs.scheme === null) return false;
    if (typeof cs.scheme === 'function') return true;

    var comp = this._resolveSchemeRef(cs.scheme);
    if (!comp) {
        myCatnip._warnOnce('csUnresolved:' + b._name,
            'colorScheme: cannot resolve scheme for ' + b._name +
            ' — ' + String(JSON.stringify(cs.scheme)).slice(0, 120));
        b._csFailed = true;
        return false;
    }
    b._csScheme = comp;
    return false;
};

// ============================================================
// schemeFromState
// ============================================================
myCatnip.Controller.prototype._parseSchemeFromState = function(b, cs, schemeIsFn) {
    if (schemeIsFn) {
        myCatnip._warnOnce('csDoubleDynamic:' + b._name,
            'colorScheme on ' + b._name +
            ' has both schemeFromState and scheme: function' +
            ' — using schemeFromState');
    }
    var closure = this._buildCsFromStateClosure(b, cs.schemeFromState);
    if (closure) b._csSchemeFn = closure;
};

myCatnip.Controller.prototype._parseCsScheme = function(b, cs) {
    var hasBase = cs.scheme !== undefined && cs.scheme !== null;
    var fromState = cs.schemeFromState;
    var hasFromState = fromState && typeof fromState === 'object' &&
                    !Array.isArray(fromState);

    if (!hasBase && !hasFromState) {
        myCatnip._warnOnce('csMissing:' + b._name,
            'colorScheme: missing scheme for ' + b._name +
            (cs.knob !== undefined ? ' (deviation)' : '') +
            " — pass scheme: 'name' or a colour spec, or schemeFromState");
        b._csFailed = true;
        return;
    }

    if (cs.schemeFromState !== undefined && cs.schemeFromState !== null &&
        !hasFromState) {
        myCatnip._warnOnce('csFromStateShape:' + b._name,
            'colorScheme.schemeFromState on ' + b._name +
            ' must be an object — got ' +
            (Array.isArray(fromState) ? 'array' : typeof fromState) +
            '. Ignoring it; using the base scheme only.');
    }

    b._csDeviation = (cs.knob !== undefined && cs.knob !== null);

    var baseIsFn = this._parseSchemeValue(b, cs);
    if (b._csFailed) return;

    if (hasFromState) {
        this._parseSchemeFromState(b, cs, baseIsFn);
    } else if (baseIsFn) {
        b._csSchemeFn = cs.scheme;
    }

    this._wireCsKnob(b, cs);
};

myCatnip.Controller.prototype._wireCsKnob = function(b, cs) {
    if (cs.knob === undefined || cs.knob === null) return;
    var knob = this.bindings[cs.knob];
    if (!knob) {
        myCatnip._warnOnce('csKnobMissing:' + b._name,
            'colorScheme: knob "' + cs.knob + '" not found for ' + b._name);
        b._csFailed = true;
        return;
    }
    if (knob.type !== 'knob' && knob.type !== 'fader') {
        myCatnip._warnOnce('csKnobType:' + b._name,
            'colorScheme: knob "' + cs.knob + '" on ' + b._name +
            ' is type "' + knob.type + '" — must be knob or fader');
        b._csFailed = true;
        return;
    }
    b._csKnob = knob;
    knob.addObserver(b);
};

myCatnip.Controller.prototype._buildCsFromStateClosure = function(b, sf) {
    var sd = {};

    if (sf.state && sf.co) {
        myCatnip._warnOnce('csFsBoth:' + b._name,
            'colorScheme.schemeFromState on ' + b._name +
            ' has both state and co — using state, ignoring co');
    }
    if (sf.state) {
        sd.state = sf.state;
    } else if (sf.co) {
        sd.co = myCatnip.resolve(sf.co, this);
        sd.group = sf.group ? myCatnip.resolve(sf.group, this) : b.group;
        if (!sd.group) {
            myCatnip._warnOnce('csFsCoNoGroup:' + b._name,
                'colorScheme.schemeFromState.co on ' + b._name +
                ' has no group and the binding has no group either — LED will stay dark.');
            return null;
        }
    }
    if (sf.map) sd.map = sf.map;
    else if (sf.list) sd.list = sf.list.slice();
    if (!sd.state && !sd.co) {
        myCatnip._warnOnce('csFsEmpty:' + b._name,
            'colorScheme.schemeFromState on ' + b._name +
            ' has neither state nor co — LED will stay dark');
        return null;
    }
    if (!sd.map && !sd.list) {
        myCatnip._warnOnce('csFsNoMap:' + b._name,
            'colorScheme.schemeFromState on ' + b._name +
            ' has a source but no map/list — closure always returns ' +
            'undefined; base scheme (or dark) renders instead.');
    }

    if (sd.co && sd.group) {
        b._csFromStateConn = engine.makeConnection(sd.group, sd.co,
            function(v) {
                sd.cachedValue = v;
                b._refresh();
            });
        try {
            sd.cachedValue = engine.getValue(sd.group, sd.co);
        } catch (e) {
            sd.cachedValue = undefined;
        }
    }

    var ctrl = this;
    return function() {
        var stateVal;
        if (sd.co) {
            stateVal = sd.cachedValue !== undefined
                ? sd.cachedValue
                : engine.getValue(sd.group, sd.co);
        } else {
            stateVal = myCatnip.readPath(ctrl, sd.state);
        }

        var entryRef;
        if (sd.map) {
            entryRef = sd.map[stateVal];
        } else if (sd.list) {
            var sidx = Math.floor(stateVal);
            if (!isFinite(sidx)) sidx = 0;
            if (sidx < 0) sidx = 0;
            if (sidx >= sd.list.length) sidx = sd.list.length - 1;
            entryRef = sd.list[sidx];
        }

        if (typeof entryRef === 'function') entryRef = entryRef();
        return entryRef;
    };
};

// ============================================================
// SETUP ENTRY POINT
// ============================================================
myCatnip.Controller.prototype._setupColorScheme = function(b, cs) {
    if (!cs || typeof cs !== 'object' || Array.isArray(cs)) {
        myCatnip._warnOnce('csShape:' + b._name,
            'colorScheme must be an object on ' + b._name +
            ' — got ' + (cs === null ? 'null' : typeof cs));
        b._csActive = false;
        return;
    }
    b._csActive = true;
    b._csFailed = false;
    b._csDeviation = false;
    b._csScheme = null;
    b._csSchemeFn = null;
    b._csOn = null;
    this._parseCsOn(b, cs);
    this._parseCsScheme(b, cs);
};

