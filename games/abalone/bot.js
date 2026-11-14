// Abalone – Computer-Gegner (nur Server). Zugregeln aus public/rules.js, Suche: games/_shared/search.js
// Bewertung: Kugeln vom Brett (fast alles), Mitte halten, Kugeln zusammenhalten, nicht am Rand stehen.
const R = require('./public/rules.js');
const { choose, WIN } = require('../_shared/search.js');

const RING = R.CELLS.map(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)));

function side(g, c) {
  let v = 0;
  for (let i = 0; i < R.N; i++) {
    if (g.board[i] !== c) continue;
    v -= RING[i] * 6;                     // Mitte ist gut
    if (RING[i] === 4) v -= 10;           // Rand ist gefährlich
    for (const n of R.NB[i]) if (n >= 0 && g.board[n] === c) v += 1.5; // zusammenhalten
  }
  return v;
}
function evaluate(g, me) {
  if (g.winner) return g.winner === -1 ? 0 : g.winner === me ? WIN : -WIN;
  const op = 3 - me;
  return (g.off[op] - g.off[me]) * 1000 + side(g, me) - side(g, op);
}
const clone = (g) => ({ board: g.board.slice(), turn: g.turn, moves: g.moves, off: { ...g.off }, winner: g.winner, reason: g.reason, last: null });

function gen(g, color) {
  if (g.turn !== color) return [];
  return R.allMoves(g.board, color).map((m) => {
    const n = clone(g);
    R.apply(n, color, { sel: m.sel, dir: m.dir });
    return { acts: [{ t: 'move', sel: m.sel, dir: m.dir }], next: n };
  });
}

module.exports = (colorOf) => ({
  toMove(s, seat) { return !s.game.winner && s.game.turn === colorOf(seat, s.round); },
  play(s, seat, level) {
    const me = colorOf(seat, s.round);
    return choose(clone(s.game), me, {
      level, gen, evaluate,
      over: (g) => !!g.winner,
      other: (c) => 3 - c,
      beam: 18, mittelDepth: 2, leichtNoise: 40, leichtRandom: 0.2, maxDepth: 6,
    }) || [];
  },
});
