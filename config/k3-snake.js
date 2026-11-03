// config/k3-snake.js — snake easter egg.
//
// Loaded by playback entry modules (k3-cat.js, k3-kitten.js,
// k3-onek3*.js) after k3-cat-config.js. Modifies CAT.CHORD.press2
// and adds CAT_LAYERS.snake.


var F = myCatnip.FUNCS;
var CAT = myCatnip.CAT;

var SNAKE_PLAYFIELD = [
    [24, 25, 26, 27],
    [20, 21, 22, 23],
    [16, 17, 18, 19],
    [12, 13, 14, 15],
    [ 8,  9, 10, 11],
    [ 4,  5,  6,  7],
    [ 0,  1,  2,  3],
    [30, 31, 32, 33]
];

myCatnip.SNAKE_PLAYFIELD = SNAKE_PLAYFIELD;
myCatnip.SNAKE_TICK_START_MS = 500;
myCatnip.SNAKE_TICK_STEP_MS  = 5;
myCatnip.SNAKE_TICK_MIN_MS   = 400;
myCatnip.SNAKE_WRAP_X = true;
myCatnip.SNAKE_WRAP_Y = true;

var STATUS_LAYER = 28;
var STATUS_SHIFT = 29;

var C_SNAKE_HEAD = { rgb: [  0, 127,   0], brightness: 127 };
var C_SNAKE_BODY = { rgb: [  0, 127,   0], brightness: 100 };
var C_SNAKE_TAIL = { rgb: [  0, 127,   0], brightness:  60 };
var C_FOOD       = { rgb: [127,   0,   0], brightness: 127 };
var C_DEAD       = { rgb: [127,   0,   0], brightness: 127 };
var C_TURN       = { rgb: [  0, 127, 127], brightness:  60 };
var C_WAIT       = { rgb: [127,  64,   0], brightness: 127 };
var C_STATUS_OFF = { rgb: [ 60,  60,  60], brightness:  40 };

function paintCell(ctrl, idx, entry) {
    if (!entry || !entry.rgb) { ctrl.sendLED(idx, 0, 0, 0, 0); return; }
    ctrl.sendLED(idx, entry.rgb[0], entry.rgb[1], entry.rgb[2], entry.brightness);
}

function paintStatus(ctrl) {
    var s = ctrl._snake;
    if (!s) return;
    if (s.won) {
        paintCell(ctrl, STATUS_LAYER, C_SNAKE_HEAD);
        paintCell(ctrl, STATUS_SHIFT, C_SNAKE_HEAD);
        return;
    }
    if (s.dead) {
        paintCell(ctrl, STATUS_LAYER, C_DEAD);
        paintCell(ctrl, STATUS_SHIFT, C_DEAD);
        return;
    }
    if (!s.started) {
        paintCell(ctrl, STATUS_LAYER, C_STATUS_OFF);
        paintCell(ctrl, STATUS_SHIFT, C_WAIT);
        return;
    }
    paintCell(ctrl, STATUS_LAYER, C_TURN);
    paintCell(ctrl, STATUS_SHIFT, C_TURN);
}

function paintAllRed(ctrl) {
    var field = myCatnip.SNAKE_PLAYFIELD;
    for (var y = 0; y < field.length; y++) {
        for (var x = 0; x < field[y].length; x++) {
            paintCell(ctrl, field[y][x], C_DEAD);
        }
    }
    paintStatus(ctrl);
}

function paintAllGreen(ctrl) {
    var field = myCatnip.SNAKE_PLAYFIELD;
    for (var y = 0; y < field.length; y++) {
        for (var x = 0; x < field[y].length; x++) {
            paintCell(ctrl, field[y][x], C_SNAKE_HEAD);
        }
    }
    paintStatus(ctrl);
}

function paintGame(ctrl) {
    var s = ctrl._snake;
    if (!s) return;
    var field = myCatnip.SNAKE_PLAYFIELD;
    var H = field.length, W = field[0].length;
    var i, seg, key, kind, entry;

    if (s.prevCells === null) {
        for (var by = 0; by < H; by++) {
            for (var bx = 0; bx < W; bx++) {
                ctrl.sendLED(field[by][bx], 0, 0, 0, 0);
            }
        }
    }

    var prev = s.prevCells || {};
    var next = {};

    if (s.food) {
        key = s.food.y + ',' + s.food.x;
        next[key] = 'food';
        if (prev[key] !== 'food') {
            paintCell(ctrl, field[s.food.y][s.food.x], C_FOOD);
        }
    }

    for (i = 0; i < s.snake.length; i++) {
        seg = s.snake[i];
        if (seg.y < 0 || seg.y >= H || seg.x < 0 || seg.x >= W) continue;
        key = seg.y + ',' + seg.x;
        kind = (i === 0) ? 'head'
             : (i === s.snake.length - 1) ? 'tail'
             : 'body';
        next[key] = kind;
        if (prev[key] === kind) continue;
        entry = (kind === 'head') ? C_SNAKE_HEAD
              : (kind === 'tail') ? C_SNAKE_TAIL
              : C_SNAKE_BODY;
        paintCell(ctrl, field[seg.y][seg.x], entry);
    }

    for (var pk in prev) {
        if (!prev.hasOwnProperty(pk)) continue;
        if (next[pk] !== undefined) continue;
        var parts = pk.split(',');
        var py = parseInt(parts[0], 10);
        var px = parseInt(parts[1], 10);
        if (py < 0 || py >= H || px < 0 || px >= W) continue;
        ctrl.sendLED(field[py][px], 0, 0, 0, 0);
    }

    s.prevCells = next;
    paintStatus(ctrl);
}

function spawnFood(ctrl) {
    var s = ctrl._snake;
    var field = myCatnip.SNAKE_PLAYFIELD;
    var H = field.length, W = field[0].length;
    var occupied = {};
    for (var i = 0; i < s.snake.length; i++) {
        occupied[s.snake[i].y + ',' + s.snake[i].x] = true;
    }
    var candidates = [];
    for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
            if (!occupied[y + ',' + x]) candidates.push({ x: x, y: y });
        }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function die(ctrl) {
    var s = ctrl._snake;
    if (!s) return;
    s.dead = true;
    if (s.timer) { engine.stopTimer(s.timer); s.timer = null; }
    paintAllRed(ctrl);
}

function tick(ctrl) {
    if (ctrl._shuttingDown) {
        if (ctrl._snake && ctrl._snake.timer) {
            engine.stopTimer(ctrl._snake.timer);
            ctrl._snake = null;
        }
        return;
    }
    var s = ctrl._snake;
    if (!s || s.dead || !s.started) return;

    var field = myCatnip.SNAKE_PLAYFIELD;
    var H = field.length, W = field[0].length;
    var head = s.snake[0];
    var nx = head.x + s.dir.dx;
    var ny = head.y + s.dir.dy;

    if (nx < 0 || nx >= W) {
        if (myCatnip.SNAKE_WRAP_X) nx = ((nx % W) + W) % W;
        else { die(ctrl); return; }
    }
    if (ny < 0 || ny >= H) {
        if (myCatnip.SNAKE_WRAP_Y) ny = ((ny % H) + H) % H;
        else { die(ctrl); return; }
    }

    var willEat = s.food && nx === s.food.x && ny === s.food.y;
    var selfCheckEnd = willEat ? s.snake.length : s.snake.length - 1;
    for (var i = 0; i < selfCheckEnd; i++) {
        if (s.snake[i].x === nx && s.snake[i].y === ny) { die(ctrl); return; }
    }

    s.snake.unshift({ x: nx, y: ny });
    if (willEat) {
        s.food = spawnFood(ctrl);
        if (s.food === null) {
            s.won = true;
            if (s.timer) { engine.stopTimer(s.timer); s.timer = null; }
            paintAllGreen(ctrl);
            return;
        }
        s.speed = Math.max(myCatnip.SNAKE_TICK_MIN_MS,
                           s.speed - myCatnip.SNAKE_TICK_STEP_MS);
        if (s.timer) engine.stopTimer(s.timer);
        s.timer = engine.beginTimer(s.speed, function() { tick(ctrl); }, false);
    } else {
        s.snake.pop();
    }

    paintGame(ctrl);
}

F.snakeStart = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (ctrl._snake) return;

    ctrl._snake = {
        snake:      [{ x: 3, y: 0 }],
        dir:        { dx: 0, dy: 1 },
        food:       null,
        speed:      myCatnip.SNAKE_TICK_START_MS,
        timer:      null,
        paintTimer: null,
        dead:       false,
        won:        false,
        started:    false,
        paintReady: false,
        prevCells:  null
    };
    ctrl._snake.food = spawnFood(ctrl);

    ctrl._batchPatches(function(patches) {
        if (patches.indexOf('snake') === -1) patches.push('snake');
    });

    ctrl._blankLeds();

    ctrl._snake.paintTimer = engine.beginTimer(1000, function() {
        if (ctrl._snake) ctrl._snake.paintTimer = null;
        if (ctrl._shuttingDown || !ctrl._snake) return;
        ctrl._snake.paintReady = true;
        paintGame(ctrl);
    }, true);
};

F.snakeExit = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (!ctrl._snake) return;

    var savedSnake = ctrl._snake;
    ctrl._snake = null;

    try {
        ctrl._batchPatches(function(patches) {
            var si = patches.indexOf('snake');
            if (si !== -1) patches.splice(si, 1);
            if (!ctrl.modifiers.chord) {
                var ci = patches.indexOf('chord');
                if (ci !== -1) patches.splice(ci, 1);
            }
        });
    } catch (e) {
        ctrl._snake = savedSnake;
        throw e;
    }

    if (savedSnake.paintTimer) engine.stopTimer(savedSnake.paintTimer);
    if (savedSnake.timer)      engine.stopTimer(savedSnake.timer);
};

F.snakePressAny = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (!ctrl._snake) return;
    F.snakeExit.call(this, args, ch, c, v, s);
};

F.snakeControl = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (!ctrl._snake) return;
    if (ctrl._snake.dead || ctrl._snake.won) { F.snakeExit.call(this, args, ch, c, v, s); return; }

    if (!ctrl._snake.paintReady) return;

    if (!ctrl._snake.started) {
        ctrl._snake.started = true;
        ctrl._snake.timer = engine.beginTimer(
            ctrl._snake.speed, function() { tick(ctrl); }, false);
        paintStatus(ctrl);
        return;
    }

    var d = ctrl._snake.dir;
    ctrl._snake.dir = { dx: d.dy, dy: -d.dx };
};

F.snakeTurn = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    var ctrl = this._ctrl;
    if (!ctrl._snake) return;
    if (ctrl._snake.dead || ctrl._snake.won) { F.snakeExit.call(this, args, ch, c, v, s); return; }
    if (!ctrl._snake.started) return;
    var d = ctrl._snake.dir;
    ctrl._snake.dir = { dx: -d.dy, dy: d.dx };
};

F.toggleSnake = function(args, ch, c, v, s) {
    if (!this._ctrl._isPress(v, s)) return;
    if (this._ctrl._snake) F.snakeExit.call(this, args, ch, c, v, s);
    else                   F.snakeStart.call(this, args, ch, c, v, s);
};

var SNAKE_OVERLAY = {
    _host: ['topShared', 'twoDeck', 'twoDeckMini'],
    _noModifiers: true,

    layer:  { func: F.snakeTurn,    noLED: true },
    shift:  { func: F.snakeControl, noLED: true },
    press2: { func: F.snakeExit,    noLED: true },

    press0: { func: F.snakePressAny, noLED: true },
    press1: { func: F.snakePressAny, noLED: true },
    press3: { func: F.snakePressAny, noLED: true },

    button0_0: { func: F.snakePressAny, noLED: true },
    button1_0: { func: F.snakePressAny, noLED: true },
    button2_0: { func: F.snakePressAny, noLED: true },
    button3_0: { func: F.snakePressAny, noLED: true },
    button0_1: { func: F.snakePressAny, noLED: true },
    button1_1: { func: F.snakePressAny, noLED: true },
    button2_1: { func: F.snakePressAny, noLED: true },
    button3_1: { func: F.snakePressAny, noLED: true },
    button0_2: { func: F.snakePressAny, noLED: true },
    button1_2: { func: F.snakePressAny, noLED: true },
    button2_2: { func: F.snakePressAny, noLED: true },
    button3_2: { func: F.snakePressAny, noLED: true },

    grid0_0: { func: F.snakePressAny, noLED: true },
    grid1_0: { func: F.snakePressAny, noLED: true },
    grid2_0: { func: F.snakePressAny, noLED: true },
    grid3_0: { func: F.snakePressAny, noLED: true },
    grid0_1: { func: F.snakePressAny, noLED: true },
    grid1_1: { func: F.snakePressAny, noLED: true },
    grid2_1: { func: F.snakePressAny, noLED: true },
    grid3_1: { func: F.snakePressAny, noLED: true },
    grid0_2: { func: F.snakePressAny, noLED: true },
    grid1_2: { func: F.snakePressAny, noLED: true },
    grid2_2: { func: F.snakePressAny, noLED: true },
    grid3_2: { func: F.snakePressAny, noLED: true },
    grid0_3: { func: F.snakePressAny, noLED: true },
    grid1_3: { func: F.snakePressAny, noLED: true },
    grid2_3: { func: F.snakePressAny, noLED: true },
    grid3_3: { func: F.snakePressAny, noLED: true }
};

CAT_LAYERS.snake = SNAKE_OVERLAY;

CAT.CHORD.press2 = {
    func: F.toggleSnake,
    colorScheme: {
        scheme: 'overlayChord',
        on: { state: '_snake' }
    }
};

