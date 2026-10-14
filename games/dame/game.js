// Dame – Regeln auf dem Server
// Die eigentlichen Zugregeln stehen in public/rules.js (läuft identisch im Browser).
// Hier: Partie-Ablauf, Gewinn/Remis, Aufgeben. Bei der Revanche werden die Farben getauscht.
const R = require('./public/rules.js');

// Spieler 1 hat in Runde 1 Weiß, danach wird jede Runde getauscht
const colorOf = (seat, round) => ((seat + (Math.max(round, 1) - 1)) % 2 === 0 ? 'w' : 'b');
const seatOf = (color, round) => (colorOf(0, round) === color ? 0 : 1);

module.exports = {
  title: 'Dame',
  blurb: 'Schlagpflicht, fliegende Dame.',

  create() {
    return { status: 'waiting', board: R.initialBoard(), turn: 'w', winner: null, reason: null,
      lastMove: null, moveNo: 0, quiet: 0, seq: 0, round: 0 };
  },

  start(prev, round) {
    return { ...this.create(), status: 'playing', seq: prev.seq, round };
  },

  action(s, seat, a) {
    if (a.t !== 'move') return;
    const color = colorOf(seat, s.round);
    if (s.status !== 'playing' || s.turn !== color || !Array.isArray(a.path)) return;
    const move = R.findMove(s.board, color, a.path.map(Number));
    if (!move) return 'Ungültiger Zug.';
    const wasKing = R.isKing(s.board[move.path[0]]);
    s.board = R.applyMove(s.board, move);
    s.lastMove = { path: move.path, captures: move.captures, color, seq: ++s.seq };
    s.moveNo++;
    s.quiet = !move.captures.length && wasKing ? s.quiet + 1 : 0;
    s.turn = R.other(color);
    if (R.legalMoves(s.board, s.turn).length === 0) {
      const none = R.countPieces(s.board, s.turn) === 0;
      Object.assign(s, { status: 'over', winner: color, reason: none ? 'Alle Steine geschlagen' : 'Keine Zugmöglichkeit mehr' });
    } else if (s.quiet >= R.DRAW_LIMIT) {
      Object.assign(s, { status: 'over', winner: 'draw', reason: '15 Damezüge je Seite ohne Schlagen' });
    }
  },

  resign(s, seat, core) {
    if (s.status !== 'playing') return;
    const name = core.players[seat]?.name || 'Jemand';
    Object.assign(s, { status: 'over', winner: R.other(colorOf(seat, s.round)), reason: `${name} hat aufgegeben` });
  },

  result(s) {
    if (s.status !== 'over') return null;
    return { winner: s.winner === 'draw' ? -1 : seatOf(s.winner, s.round), reason: s.reason, summary: `${s.moveNo} Züge` };
  },

  view(s, seat, core) {
    return {
      status: s.status, board: s.board, turn: s.turn,
      you: colorOf(seat, s.round),
      players: core.players.map((p, i) => p && { name: p.name, color: colorOf(i, s.round), connected: p.online, wins: core.score[i] }).filter(Boolean),
      lastMove: s.lastMove, winner: s.winner, reason: s.reason, gameNo: core.round, moveNo: s.moveNo,
      quiet: s.quiet, drawLimit: R.DRAW_LIMIT,
      rematch: core.rematch.map((i) => colorOf(i, s.round)),
    };
  },
};
