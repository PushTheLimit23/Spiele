// Dame – Computer-Gegner (nur Server). Zugregeln aus public/rules.js, Suche: games/_shared/search.js
const R = require('./public/rules.js');
const { choose, WIN } = require('../_shared/search.js');

// Stellung: { b: Brett, side: Farbe am Zug, dead: Farbe ohne Züge (verliert) | null }
function evaluate(n, me) {
  const op = R.other(me);
  if (n.dead) return n.dead === me ? -WIN : WIN;
  let v = 0, mine = 0, theirs = 0;
  for (let i = 0; i < R.N * R.N; i++) {
    const p = n.b[i];
    if (!p) continue;
    const c = R.colorOf(p), k = R.isKing(p);
    const [r, col] = R.rc(i);
    // Material, Dame viel wert (fliegende Dame); einfache Steine: Fortschritt + Mitte + hintere Reihe als Schutz
    let w = k ? 320 : 100;
    if (!k) {
      const adv = c === 'w' ? 7 - r : r;
      w += adv * 4 + (adv === 0 ? 6 : 0);
    }
    if (col >= 2 && col <= 5 && r >= 2 && r <= 5) w += 5;
    if (c === me) { v += w; mine++; } else { v -= w; theirs++; }
  }
  // Wer vorne liegt, tauscht gerne ab
  if (mine && theirs) v += (mine - theirs) * 30 / (mine + theirs);
  void op;
  return v;
}

function gen(n, color) {
  const moves = R.legalMoves(n.b, color);
  return moves.map((m) => {
    const b = R.applyMove(n.b, m);
    const opp = R.other(color);
    const dead = R.legalMoves(b, opp).length ? null : opp;
    return { acts: [{ t: 'move', path: m.path }], next: { b, dead }, cap: m.captures.length };
  });
}

module.exports = (colorOf) => ({
  toMove(s, seat) { return s.status === 'playing' && s.turn === colorOf(seat, s.round); },
  play(s, seat, level) {
    const me = colorOf(seat, s.round);
    return choose({ b: s.board, dead: null }, me, {
      level, gen, evaluate,
      over: (n) => !!n.dead,
      other: R.other,
      mittelDepth: 2, leichtNoise: 70, leichtRandom: 0.25, maxDepth: 12, budgetMs: 900,
    }) || [];
  },
});
