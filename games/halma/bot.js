// Halma – Computer-Gegner (nur Server). Zugregeln aus public/rules.js, Suche: games/_shared/search.js
// Bewertung: Wie weit sind alle Steine noch von der Spitze des Ziel-Dreiecks entfernt? Nachzügler kosten extra.
const R = require('./public/rules.js');
const { choose, WIN } = require('../_shared/search.js');

const hexd = (a, b) => { const [q1, r1] = R.CELLS[a], [q2, r2] = R.CELLS[b]; return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2; };
// Spitze des Ziels: das Zielfeld, das am weitesten vom eigenen Dreieck weg ist
const TIP = {};
for (const c of [1, 2]) {
  const home = R.HOME[c];
  TIP[c] = R.GOAL[c].reduce((best, g) => (home.reduce((s, h) => s + hexd(g, h), 0) > home.reduce((s, h) => s + hexd(best, h), 0) ? g : best));
}
const DIST = { 1: R.CELLS.map((_, i) => hexd(i, TIP[1])), 2: R.CELLS.map((_, i) => hexd(i, TIP[2])) };

function side(g, c) {
  let sum = 0, max = 0, inGoal = 0;
  for (let i = 0; i < R.N; i++) if (g.board[i] === c) {
    const d = DIST[c][i]; sum += d; if (d > max) max = d;
    if (R.IN_GOAL[c].has(i)) inGoal++;
  }
  return -sum * 10 - max * 6 + inGoal * 8;
}
function evaluate(g, me) {
  if (g.winner) return g.winner === -1 ? 0 : g.winner === me ? WIN : -WIN;
  return side(g, me) - side(g, 3 - me);
}
const clone = (g) => ({ board: g.board.slice(), turn: g.turn, moves: g.moves, winner: g.winner, reason: g.reason, last: null, passed: 0 });

function gen(g, color) {
  const out = [];
  if (g.turn !== color) return out;
  for (let i = 0; i < R.N; i++) {
    if (g.board[i] !== color) continue;
    for (const to of R.targets(g, i, color).keys()) {
      // keine Rückwärtszüge (bremsen nur die Suche, helfen fast nie)
      if (DIST[color][to] > DIST[color][i] + 1) continue;
      const n = clone(g);
      if (!R.apply(n, color, { from: i, to })) out.push({ acts: [{ t: 'move', from: i, to }], next: n });
    }
  }
  if (!out.length) for (let i = 0; i < R.N; i++) if (g.board[i] === color) for (const to of R.targets(g, i, color).keys()) {
    const n = clone(g); if (!R.apply(n, color, { from: i, to })) out.push({ acts: [{ t: 'move', from: i, to }], next: n });
  }
  return out;
}

module.exports = (colorOf) => ({
  toMove(s, seat) { return !s.game.winner && s.game.turn === colorOf(seat, s.round); },
  play(s, seat, level) {
    const me = colorOf(seat, s.round);
    return choose(clone(s.game), me, {
      level, gen, evaluate,
      over: (g) => !!g.winner,
      other: (c) => 3 - c,
      beam: 14, mittelDepth: 1, leichtNoise: 45, leichtRandom: 0.15, maxDepth: 4,
    }) || [];
  },
});
