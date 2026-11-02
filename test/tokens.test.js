'use strict';

var H = require('./helpers');

// ── XoneK3.resolve — every token ──────────────────────────────

test('resolve: $DECK_A$ → group', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 3);
    t.eq(XoneK3.resolve('$DECK_A$', c), '[Channel3]');
});

test('resolve: $DECK_A_N$ → bare number', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 3);
    t.eq(XoneK3.resolve('$DECK_A_N$', c), '3');
});

test('resolve: $DECK_B$ / $DECK_B_N$', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'B', 4);
    t.eq(XoneK3.resolve('$DECK_B$',   c), '[Channel4]');
    t.eq(XoneK3.resolve('$DECK_B_N$', c), '4');
});

test('resolve: $DECK_ACTIVE$ follows activeDeck', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 1);
    c.setSelectedFor('deck', 'B', 4);
    c.setActiveDeck('B');
    t.eq(XoneK3.resolve('$DECK_ACTIVE$', c), '[Channel4]');
});

test('resolve: $DECK_ALT$ is the other side', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 1);
    c.setSelectedFor('deck', 'B', 4);
    c.setActiveDeck('A');
    t.eq(XoneK3.resolve('$DECK_ALT$', c), '[Channel4]');
    c.setActiveDeck('B');
    t.eq(XoneK3.resolve('$DECK_ALT$', c), '[Channel1]');
});

test('resolve: $FX_ACTIVE$ / $FX_ACTIVE_N$', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('fx', 'A', 2);
    c.setSelectedFor('fx', 'B', 4);
    c.setActiveFx('A');
    t.eq(XoneK3.resolve('$FX_ACTIVE$',   c), '[EffectRack1_EffectUnit2]');
    t.eq(XoneK3.resolve('$FX_ACTIVE_N$', c), '2');
});

test('resolve: $FX_ALT$ is the other side', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('fx', 'A', 1);
    c.setSelectedFor('fx', 'B', 3);
    c.setActiveFx('A');
    t.eq(XoneK3.resolve('$FX_ALT$',   c), '[EffectRack1_EffectUnit3]');
    t.eq(XoneK3.resolve('$FX_ALT_N$', c), '3');
});

test('resolve: $FX_A$ / $FX_B$', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('fx', 'A', 2);
    c.setSelectedFor('fx', 'B', 3);
    t.eq(XoneK3.resolve('$FX_A$', c), '[EffectRack1_EffectUnit2]');
    t.eq(XoneK3.resolve('$FX_B$', c), '[EffectRack1_EffectUnit3]');
});

test('resolve: multiple tokens in one string', function(t) {
    var c = H.ctrl();
    c.setSelectedFor('deck', 'A', 2);
    c.setSelectedFor('fx',   'A', 4);
    t.eq(XoneK3.resolve('[Channel$DECK_A_N$]_Effect$FX_A_N$', c),
         '[Channel2]_Effect4');
});

test('resolve: no tokens → unchanged', function(t) {
    var c = H.ctrl();
    t.eq(XoneK3.resolve('[Master]', c), '[Master]');
});

test('resolve: unknown token passes through untouched', function(t) {
    var c = H.ctrl();
    t.eq(XoneK3.resolve('$DECK_C$',  c), '$DECK_C$');
    t.eq(XoneK3.resolve('$FX_D$',    c), '$FX_D$');
    t.eq(XoneK3.resolve('$NOT_A$',   c), '$NOT_A$');
});

test('resolve: non-string passthrough', function(t) {
    var c = H.ctrl();
    t.eq(XoneK3.resolve(42, c),        42);
    t.eq(XoneK3.resolve(undefined, c), undefined);
    t.eq(XoneK3.resolve(null, c),      null);
});

// ── _findUnknownTokens ────────────────────────────────────────

test('_findUnknownTokens: no $ → empty', function(t) {
    t.eq(XoneK3._findUnknownTokens('[Master]'), []);
});

test('_findUnknownTokens: known → empty', function(t) {
    t.eq(XoneK3._findUnknownTokens('$DECK_A$'),        []);
    t.eq(XoneK3._findUnknownTokens('$DECK_ACTIVE_N$'), []);
});

test('_findUnknownTokens: unknown listed', function(t) {
    t.eq(XoneK3._findUnknownTokens('$NOT_A_TOKEN$'), ['$NOT_A_TOKEN$']);
});

test('_findUnknownTokens: mixed', function(t) {
    t.eq(XoneK3._findUnknownTokens('$DECK_A$ $BOGUS$ $FX_A$'), ['$BOGUS$']);
});

test('_findUnknownTokens: duplicate once', function(t) {
    t.eq(XoneK3._findUnknownTokens('$X$ $X$'), ['$X$']);
});

test('_findUnknownTokens: non-string → empty', function(t) {
    t.eq(XoneK3._findUnknownTokens(42),   []);
    t.eq(XoneK3._findUnknownTokens(null), []);
});

// ── _tokenFields ──────────────────────────────────────────────

test('_tokenFields: empty cfg → empty', function(t) {
    t.eq(XoneK3._tokenFields({}), []);
});

test('_tokenFields: group, inKey, outKey', function(t) {
    var f = XoneK3._tokenFields({group: 'g', inKey: 'i', outKey: 'o'});
    t.eq(f.length, 3);
    t.eq(f[0][0], 'group');
    t.eq(f[1][0], 'inKey');
    t.eq(f[2][0], 'outKey');
});

test('_tokenFields: schemeFromState group + co', function(t) {
    var f = XoneK3._tokenFields({
        colorScheme: {schemeFromState: {group: 'g', co: 'k'}}
    });
    t.eq(f.length, 2);
    t.eq(f[0][0], 'schemeFromState.group');
    t.eq(f[1][0], 'schemeFromState.co');
});

test('_tokenFields: on.group', function(t) {
    var f = XoneK3._tokenFields({
        colorScheme: {on: {co: 'enabled', group: 'g'}}
    });
    t.eq(f.length, 1);
    t.eq(f[0][0], 'on.group');
});

test('_tokenFields: all six together', function(t) {
    var f = XoneK3._tokenFields({
        group: 'a', inKey: 'b', outKey: 'c',
        colorScheme: {
            schemeFromState: {group: 'd', co: 'e'},
            on: {group: 'f'}
        }
    });
    t.eq(f.length, 6);
});

// ── TOKENS table sanity ──────────────────────────────────────

test('TOKENS: every declared token is unique', function(t) {
    var seen = {};
    for (var i = 0; i < XoneK3.TOKENS.length; i++) {
        var tok = XoneK3.TOKENS[i].token;
        t.notOk(seen[tok], 'duplicate token ' + tok);
        seen[tok] = true;
    }
});

test('TOKENS: every declared token resolves', function(t) {
    var c = H.ctrl();
    for (var i = 0; i < XoneK3.TOKENS.length; i++) {
        var tok = XoneK3.TOKENS[i].token;
        var out = XoneK3.resolve(tok, c);
        t.neq(out, tok, 'token ' + tok + ' did not expand');
    }
});