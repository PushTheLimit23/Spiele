// Mühle – Computer-Gegner (läuft nur auf dem Server)
//
// Ein "Zug" ist hier ein ganzer Spielzug: Setzen oder Ziehen, und – falls dabei eine Mühle entsteht –
// gleich das Wegnehmen dazu. Gesucht wird mit Minimax + Alpha-Beta-Schnitt (Negamax).
// Stufen:
//   leicht  – schaut nur den eigenen Zug an, mit viel Zufall (macht echte Fehler)
//   mittel  – eigener Zug + Antwort des Menschen, etwas Zufall
//   schwer  – schaut so tief, wie es in ~0,3 s geht (meist 4–6 Halbzüge), kaum Zufall
const R = require('./public/rules.js');

const WIN = 100000;

function clone(g) {
  return { board: g.board.slice(), turn: g.turn, inHand: g.inHand.slice(), onBoard: g.onBoard.slice(), mustRemove: g.mustRemove, winner: g.winner, reason: g.reason, last: g.last ? { ...g.last } : null, quiet: g.quiet, moves: g.moves };
}

// Alle vollständigen Spielzüge der Seite, die am Zug ist: [{ acts, next }]
function turns(g) {
  const out = [], c = g.turn, base = [];
  if (R.phase(g, c) === 'place') {
    for (let p = 0; p < 24; p++) if (!g.board[p]) base.push({ t: 'place', p });
  } else {
    for (let f = 0; f < 24; f++) if (g.board[f] === c) for (const to of R.targets(g, f)) base.push({ t: 'move', from: f, to });
  }
  for (const a of base) {
    const n = clone(g);
    if (R.apply(n, c, { type: a.t, p: a.p, from: a.from, to: a.to })) continue;
    if (n.mustRemove) {
      for (const r of R.removable(n)) {
        const m = clone(n);
        if (!R.apply(m, c, { type: 'remove', p: r })) out.push({ acts: [a, { t: 'remove', p: r }], next: m, cap: 1 });
      }
    } else out.push({ acts: [a], next: n, cap: 0 });
  }
  return out;
}

// Bewertung aus Sicht der Farbe c
function evaluate(g, c) {
  const o = 3 - c;
  if (g.winner) return g.winner === -1 ? 0 : g.winner === c ? WIN : -WIN;
  let v = 0;
  const mat = (x) => g.inHand[x] + g.onBoard[x];
  v += (mat(c) - mat(o)) * 120;
  // geschlossene Mühlen und offene Zweier (zwei eigene + ein freies Feld)
  for (const m of R.MILLS) {
    let mc = 0, mo = 0, e = 0;
    for (const p of m) { if (g.board[p] === c) mc++; else if (g.board[p] === o) mo++; else e++; }
    if (mc === 3) v += 22; else if (mo === 3) v -= 22;
    if (mc === 2 && e === 1) v += 16; else if (mo === 2 && e === 1) v -= 18;
  }
  // Beweglichkeit in der Zugphase (eingesperrte Steine sind schlecht)
  const mob = (x) => { if (g.inHand[x] > 0 || g.onBoard[x] === 3) return 0; let n = 0; for (let p = 0; p < 24; p++) if (g.board[p] === x) n += R.targets(g, p).length; return n; };
  v += (mob(c) - mob(o)) * 5;
  return v;
}

// Negamax: Wert der Stellung aus Sicht von `color` (der Seite, die hier am Zug ist).
// Achtung: Ist die Partie vorbei, steht in g.turn noch der Gewinner – deshalb wird die Farbe mitgegeben.
function search(g, color, depth, alpha, beta, ply, deadline, stats) {
  stats.nodes++;
  if (g.winner || depth === 0) {
    const v = evaluate(g, color);
    return v >= WIN ? v - ply : v <= -WIN ? v + ply : v; // schneller Sieg ist besser, später Verlust weniger schlimm
  }
  if (deadline && stats.nodes % 512 === 0 && Date.now() > deadline) { stats.timeout = true; return 0; }
  const list = turns(g);
  if (!list.length) return -WIN + ply;
  list.sort((a, b) => b.cap - a.cap); // Wegnahme-Züge zuerst (besserer Schnitt)
  let best = -Infinity;
  for (const t of list) {
    const v = -search(t.next, 3 - color, depth - 1, -beta, -alpha, ply + 1, deadline, stats);
    if (stats.timeout) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// Wählt einen Zug für die Seite am Zug.
function choose(g, level) {
  const list = turns(g), me = g.turn;
  if (!list.length) return null;
  if (list.length === 1) return list[0].acts;
  const rnd = Math.random;
  if (level === 'leicht') {
    if (rnd() < 0.3) return list[Math.floor(rnd() * list.length)].acts; // ab und zu einfach irgendwas
    let best = null, bv = -Infinity;
    for (const t of list) { const v = evaluate(t.next, me) + rnd() * 90; if (v > bv) { bv = v; best = t; } }
    return best.acts;
  }
  const stats = { nodes: 0, timeout: false };
  let scored = list.map((t) => ({ t, v: 0 }));
  if (level === 'mittel') {
    for (const s of scored) s.v = -search(s.t.next, 3 - me, 1, -Infinity, Infinity, 1, 0, stats) + rnd() * 25;
  } else {
    // schwer: iterative Vertiefung mit Zeitlimit; jede fertige Tiefe ersetzt die vorige
    const deadline = Date.now() + 300;
    for (let depth = 1; depth <= 8; depth++) {
      const tmp = [];
      let alpha = -Infinity;
      for (const s of scored) {
        const v = -search(s.t.next, 3 - me, depth - 1, -Infinity, -alpha + 1, 1, deadline, stats);
        if (stats.timeout) break;
        tmp.push({ t: s.t, v });
        if (v > alpha) alpha = v;
      }
      if (stats.timeout) break;
      scored = tmp.map((x) => ({ ...x, v: x.v + rnd() * 3 })).sort((a, b) => b.v - a.v);
      if (scored[0].v >= WIN - 50) break; // sicherer Sieg gefunden
    }
  }
  scored.sort((a, b) => b.v - a.v);
  return scored[0].t.acts;
}

module.exports = { turns, evaluate, choose };
