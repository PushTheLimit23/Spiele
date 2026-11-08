// Halma – Partie-Ablauf auf dem Server. Zugregeln: public/rules.js (läuft identisch im Browser).
// Farben: 1 = Bein (beginnt), 2 = Wenge. Spieler 1 hat in Runde 1 Bein, bei jeder Revanche wird getauscht.
const R = require('./public/rules.js');

const colorOf = (seat, round) => ((seat + Math.max(round, 1) - 1) % 2) + 1;
const seatOf = (color, round) => (colorOf(0, round) === color ? 0 : 1);

module.exports = {
  title: 'Halma',
  blurb: 'Alle zehn Steine ins gegenüberliegende Dreieck.',

  create() { return { round: 0, game: R.newGame() }; },
  start(_prev, round) { return { round, game: R.newGame() }; },

  action(s, seat, a) {
    if (a.t !== 'move') return;
    return R.apply(s.game, colorOf(seat, s.round), { from: a.from, to: a.to });
  },

  resign(s, seat) {
    if (s.game.winner) return;
    s.game.winner = 3 - colorOf(seat, s.round);
    s.game.reason = 'resign';
  },

  result(s) {
    const w = s.game.winner;
    if (!w) return null;
    return { winner: w === -1 ? -1 : seatOf(w, s.round), reason: s.game.reason, summary: `${s.game.moves} Züge` };
  },

  // Nach Farben sortiert: Index 1 = Bein, 2 = Wenge
  view(s, seat, core) {
    const byColor = (fn) => [null, 1, 2].map((c) => (c ? fn(seatOf(c, s.round)) : null));
    const score = byColor((i) => core.score[i]); score[0] = 0;
    return {
      you: colorOf(seat, s.round),
      players: byColor((i) => core.players[i] && { name: core.players[i].name, online: core.players[i].online }),
      game: s.game,
      rematch: core.rematch.map((i) => colorOf(i, s.round)),
      score,
      draws: core.draws,
    };
  },
};
