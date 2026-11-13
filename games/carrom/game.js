// Carrom – Partie-Ablauf auf dem Server. Brett, Physik und Regeln: public/board.js.
// Seite 0 = Bein (unten, beginnt), Seite 1 = Wenge (oben). Spieler 1 hat in Runde 1 Bein, bei jeder Revanche wird getauscht.
const C = require('./public/board.js');

const sideOf = (seat, round) => (seat + Math.max(round, 1) - 1) % 2;
const seatOf = (side, round) => (sideOf(0, round) === side ? 0 : 1);

module.exports = {
  title: 'Carrom',
  blurb: 'Steine schnippen, Königin abdecken, alle neun versenken.',
  live: true, // Zielen wird live an den Mitspieler übertragen

  create() { return { round: 0, game: C.newGame() }; },
  start(_prev, round) { return { round, game: C.newGame() }; },

  action(s, seat, a) {
    if (a.t !== 'shot') return;
    return C.shoot(s.game, sideOf(seat, s.round), { x: a.x, angle: a.angle, power: a.power });
  },

  resign(s, seat) {
    const g = s.game;
    if (g.winner !== -2) return;
    g.winner = 1 - sideOf(seat, s.round); g.reason = 'resign';
  },

  result(s) {
    const g = s.game;
    if (g.winner === -2) return null;
    if (g.winner === -1) return { winner: -1, reason: g.reason, summary: `${g.shots} Schüsse` };
    return { winner: seatOf(g.winner, s.round), reason: g.reason, summary: `${C.points(g, g.winner)} Punkte` };
  },

  // Nach Seiten sortiert: Index 0 = Bein, 1 = Wenge
  view(s, seat, core) {
    const bySide = (fn) => [0, 1].map((side) => fn(seatOf(side, s.round)));
    const g = s.game;
    return {
      you: sideOf(seat, s.round),
      players: bySide((i) => core.players[i] && { name: core.players[i].name, online: core.players[i].online }),
      game: g,
      points: g.winner >= 0 ? C.points(g, g.winner) : 0,
      rematch: core.rematch.map((i) => sideOf(i, s.round)),
      score: bySide((i) => core.score[i]),
      draws: core.draws,
      round: core.round,
    };
  },
};
