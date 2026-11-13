// Carrom – Brett, Physik und Regeln. Der Server rechnet jeden Schuss; der Browser spielt ihn ab.
//
// Spielfläche 1000 × 1000 Einheiten, Taschen in den Ecken. 9 helle (Bein) + 9 dunkle (Wenge) Steine,
// dazu die rote Königin in der Mitte. Wer Bein hat, sitzt unten und beginnt.
// - Der Striker wird auf die eigene Grundlinie gelegt und geschnippt.
// - Eigenen Stein versenkt -> nochmal. Sonst ist der Mitspieler dran.
// - Stein des Mitspielers versenkt: zählt für ihn.
// - Striker versenkt (Foul): Zug endet, ein bereits versenkter eigener Stein kommt zurück in die Mitte.
// - Königin: Wer sie versenkt, muss sie "abdecken", also im selben oder im nächsten Schuss einen eigenen
//   Stein versenken. Klappt das nicht, kommt sie zurück in die Mitte.
// - Gewonnen hat, wer alle 9 eigenen Steine versenkt hat, sobald die Königin abgedeckt ist. Fällt der
//   letzte eigene Stein, solange die Königin noch auf dem Brett ist, kommt er zurück in die Mitte.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Carrom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SIZE = 1000;
  const COIN_R = 21, STRIKER_R = 27, POCKET_R = 36;
  const POCKETS = [[POCKET_R, POCKET_R], [SIZE - POCKET_R, POCKET_R], [POCKET_R, SIZE - POCKET_R], [SIZE - POCKET_R, SIZE - POCKET_R]];
  const BASE_OFF = 140;               // Grundlinie: Abstand vom Rand
  const BASE_X1 = 230, BASE_X2 = 770; // Bereich, in dem der Striker liegen darf
  const STRIKER_MASS = 2.6;           // Striker ist schwerer als ein Stein
  const MAX_SPEED = 3400;
  const WIN = 9, LIMIT = 400;

  // Seite 0 = Bein (unten, beginnt), Seite 1 = Wenge (oben)
  const baseY = (side) => (side === 0 ? SIZE - BASE_OFF : BASE_OFF);
  const colorOfSide = (side) => (side === 0 ? 'w' : 'b');

  // Grundaufstellung: Königin in der Mitte, innerer Ring 6, äußerer Ring 12 (abwechselnd)
  function setup() {
    const c = SIZE / 2, d = COIN_R * 2 + 0.5, pieces = [{ id: 0, k: 'q', x: c, y: c }];
    let id = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 + 30) * Math.PI / 180;
      pieces.push({ id: id++, k: i % 2 ? 'b' : 'w', x: c + Math.cos(a) * d, y: c + Math.sin(a) * d });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 + 30) * Math.PI / 180, r = i % 2 ? d * Math.sqrt(3) : d * 2;
      pieces.push({ id: id++, k: i % 4 < 2 ? (i % 2 ? 'b' : 'w') : (i % 2 ? 'w' : 'b'), x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
    }
    return pieces.map((p) => ({ ...p, x: round1(p.x), y: round1(p.y), on: true }));
  }
  const round1 = (v) => Math.round(v * 10) / 10;

  function newGame() {
    return { pieces: setup(), turn: 0, shots: 0, out: { w: 0, b: 0 }, queen: 'board', queenBy: -1, pending: -1, winner: -2, reason: '', strikerX: SIZE / 2, last: null };
  }

  // Liegt der Striker an Position x der Grundlinie von `seat` auf einem Stein?
  function strikerBlocked(pieces, seat, x) {
    const y = baseY(seat);
    return pieces.some((p) => p.on && Math.hypot(p.x - x, p.y - y) < COIN_R + STRIKER_R);
  }

  // Freie Stelle nahe der Mitte (für zurückgelegte Steine)
  function freeSpot(pieces) {
    const c = SIZE / 2;
    for (let r = 0; r < 300; r += 6) {
      for (let a = 0; a < 360; a += r ? Math.max(6, 360 / (r / 3)) : 360) {
        const x = c + Math.cos(a * Math.PI / 180) * r, y = c + Math.sin(a * Math.PI / 180) * r;
        if (pieces.every((p) => !p.on || Math.hypot(p.x - x, p.y - y) >= COIN_R * 2 + 1)) return [round1(x), round1(y)];
      }
    }
    return [c, c];
  }

  // ---------- Physik ----------
  // Schuss simulieren. Gibt Endzustand + Ablauf (Bilder) + versenkte Steine zurück.
  // Ablauf: frames = [[id, x, y], …] pro Bild, nur bewegte Teile; x = -1 heißt "versenkt". Striker hat id 99.
  function simulate(pieces, seat, sx, angle, power) {
    const dt = 1 / 120, REC = 4, FRICTION = 820, DRAG = 0.55, WALL_E = 0.72, COIN_E = 0.9;
    const bodies = pieces.filter((p) => p.on).map((p) => ({ id: p.id, k: p.k, x: p.x, y: p.y, vx: 0, vy: 0, r: COIN_R, m: 1, on: true }));
    const sp = Math.max(0, Math.min(1, power)) * MAX_SPEED;
    const striker = { id: 99, k: 's', x: sx, y: baseY(seat), vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, r: STRIKER_R, m: STRIKER_MASS, on: true };
    bodies.push(striker);
    const frames = [], sunk = [], last = new Map(bodies.map((b) => [b.id, [b.x, b.y]]));
    let t = 0, step = 0, firstHit = null;
    while (t < 14) {
      step++; t += dt;
      let moving = false;
      for (const b of bodies) {
        if (!b.on) continue;
        const v = Math.hypot(b.vx, b.vy);
        if (v < 4) { b.vx = b.vy = 0; continue; }
        moving = true;
        const nv = Math.max(0, v - FRICTION * dt) * Math.exp(-DRAG * dt);
        b.vx *= nv / v; b.vy *= nv / v;
        b.x += b.vx * dt; b.y += b.vy * dt;
        // Banden
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * WALL_E; }
        if (b.x > SIZE - b.r) { b.x = SIZE - b.r; b.vx = -Math.abs(b.vx) * WALL_E; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * WALL_E; }
        if (b.y > SIZE - b.r) { b.y = SIZE - b.r; b.vy = -Math.abs(b.vy) * WALL_E; }
        // Tasche?
        for (const [px, py] of POCKETS) if (Math.hypot(b.x - px, b.y - py) < POCKET_R - b.r * 0.15) { b.on = false; sunk.push(b.id); break; }
      }
      // Zusammenstöße (elastisch, mit Masse)
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i]; if (!a.on) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j]; if (!b.on) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
          if (d >= min || d === 0) continue;
          const nx = dx / d, ny = dy / d, over = min - d, tm = a.m + b.m;
          a.x -= nx * over * b.m / tm; a.y -= ny * over * b.m / tm;
          b.x += nx * over * a.m / tm; b.y += ny * over * a.m / tm;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jimp = -(1 + COIN_E) * rv / (1 / a.m + 1 / b.m);
            a.vx -= jimp * nx / a.m; a.vy -= jimp * ny / a.m;
            b.vx += jimp * nx / b.m; b.vy += jimp * ny / b.m;
            moving = true;
            if (firstHit === null && (a.id === 99 || b.id === 99)) firstHit = a.id === 99 ? b.id : a.id;
          }
        }
      }
      if (step % REC === 0 || !moving) {
        const f = [];
        for (const b of bodies) {
          const l = last.get(b.id);
          if (!l) continue;
          if (!b.on) { f.push([b.id, -1, -1]); last.delete(b.id); continue; }
          if (Math.abs(b.x - l[0]) > 0.4 || Math.abs(b.y - l[1]) > 0.4) { f.push([b.id, Math.round(b.x), Math.round(b.y)]); last.set(b.id, [b.x, b.y]); }
        }
        frames.push(f);
      }
      if (!moving) break;
    }
    const end = pieces.map((p) => {
      const b = bodies.find((x) => x.id === p.id);
      return b ? { ...p, x: round1(b.x), y: round1(b.y), on: b.on } : { ...p };
    });
    return { end, frames, sunk, strikerSunk: !striker.on, strikerEnd: [round1(striker.x), round1(striker.y)], firstHit, fps: 120 / REC };
  }

  // ---------- Regeln nach einem Schuss ----------
  // Gibt einen Fehlertext zurück oder nichts. Ändert g.
  function shoot(g, seat, shot) {
    const color = colorOfSide(seat);
    if (g.winner !== -2) return 'Die Partie ist vorbei.';
    if (g.turn !== seat) return 'Du bist nicht am Zug.';
    const x = Number(shot.x), angle = Number(shot.angle), power = Number(shot.power);
    if (![x, angle, power].every(Number.isFinite)) return 'Ungültiger Schuss.';
    if (x < BASE_X1 || x > BASE_X2) return 'Der Striker muss auf deiner Grundlinie liegen.';
    if (strikerBlocked(g.pieces, seat, x)) return 'Der Striker liegt auf einem Stein – schieb ihn etwas zur Seite.';
    if (power < 0.03) return 'Zu schwach – zieh weiter zurück.';

    const before = g.pieces.map((p) => ({ ...p }));
    const r = simulate(g.pieces, seat, x, angle, power);
    g.pieces = r.end;
    g.shots++;
    const mine = color, theirs = color === 'w' ? 'b' : 'w';
    const sunk = r.sunk.filter((id) => id !== 99).map((id) => before.find((p) => p.id === id));
    const ownSunk = sunk.filter((p) => p.k === mine).length;
    const oppSunk = sunk.filter((p) => p.k === theirs).length;
    const queenSunk = sunk.some((p) => p.k === 'q');
    g.out[mine] += ownSunk; g.out[theirs] += oppSunk;
    const notes = [];
    let again = ownSunk > 0 || queenSunk;
    const foul = r.strikerSunk;

    const returnToCenter = (kind) => {
      const p = g.pieces.find((q) => !q.on && q.k === kind);
      if (!p) return false;
      const [fx, fy] = freeSpot(g.pieces);
      p.x = fx; p.y = fy; p.on = true;
      if (kind !== 'q') g.out[kind]--;
      return true;
    };

    // Königin
    if (queenSunk) {
      if (ownSunk > 0 && !foul) { g.queen = 'covered'; g.queenBy = seat; notes.push('queen-covered'); }
      else if (!foul) { g.queen = 'pending'; g.pending = seat; notes.push('queen-pending'); }
      else { returnToCenter('q'); g.queen = 'board'; notes.push('queen-back'); }
    } else if (g.queen === 'pending' && g.pending === seat) {
      if (ownSunk > 0 && !foul) { g.queen = 'covered'; g.queenBy = seat; notes.push('queen-covered'); }
      else { returnToCenter('q'); g.queen = 'board'; g.pending = -1; notes.push('queen-back'); }
    }
    if (g.queen === 'covered') g.pending = -1;

    // Foul: Striker versenkt
    if (foul) {
      again = false;
      notes.push(returnToCenter(mine) ? 'foul-return' : 'foul');
    }

    // Letzter Stein, solange die Königin nicht abgedeckt ist -> zurück
    for (const k of ['w', 'b']) {
      if (g.out[k] >= WIN && g.queen !== 'covered') { returnToCenter(k); notes.push('last-back-' + k); if (k === mine) again = false; }
    }

    g.last = { seat, x, angle, power, frames: r.frames, fps: r.fps, start: before.filter((p) => p.on).map((p) => [p.id, p.x, p.y]), strikerStart: [x, baseY(seat)], strikerEnd: r.strikerEnd, strikerSunk: foul, sunk: sunk.map((p) => [p.id, p.k]), notes, again: false };

    // Sieg?
    for (const k of [mine, theirs]) {
      if (g.out[k] >= WIN && g.queen === 'covered') {
        g.winner = k === mine ? seat : 1 - seat; g.reason = 'cleared';
        return;
      }
    }
    if (g.shots >= LIMIT) { g.winner = -1; g.reason = 'limit'; return; }
    g.last.again = again;
    if (!again) g.turn = 1 - seat;
  }

  // Punkte des Siegers (wie im Turnier-Carrom): übrige Steine des Verlierers + 3 für die Königin
  function points(g, side) {
    const loser = side === 0 ? 'b' : 'w';
    return (WIN - g.out[loser]) + (g.queen === 'covered' && g.queenBy === side ? 3 : 0);
  }

  return { colorOfSide, SIZE, COIN_R, STRIKER_R, POCKET_R, POCKETS, BASE_OFF, BASE_X1, BASE_X2, WIN, LIMIT, baseY, newGame, strikerBlocked, simulate, shoot, points, freeSpot };
});
