// Vier Gewinnt – Regeln auf dem Server
// 7 Spalten × 6 Reihen. Wer vier in einer Reihe hat, gewinnt. Bei der Revanche wechselt der Startspieler.
const ROWS = 6;
const COLS = 7;

// Erlaubte Steinfarben (aus der Farbpalette)
const COLORS = ['#41459e', '#56bca6', '#479dcc', '#c75c48', '#f2c35b'];

const newBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function findWin(b, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === p) {
        line.push([rr, cc]);
        rr += dr * s; cc += dc * s;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

// Gewünschte Farbe vergeben – oder die erste freie, falls sie schon belegt ist
function pickColor(s, seat, wanted) {
  const other = s.colors[1 - seat];
  if (COLORS.includes(wanted) && wanted !== other) return wanted;
  return COLORS.find((c) => c !== other);
}

module.exports = {
  title: 'Vier Gewinnt',
  blurb: 'Vier in einer Reihe gewinnt.',
  needsBoth: false, // Farbe darf man schon vor dem Mitspieler wählen

  create() {
    return { board: newBoard(), turn: 0, status: 'waiting', winner: null, winLine: null, lastMove: null, moves: 0, round: 0, colors: [null, null] };
  },

  // Runde 1 beginnt Spieler 1, danach abwechselnd
  start(prev, round) {
    return { ...this.create(), colors: prev.colors, status: 'playing', turn: (round - 1) % 2, round };
  },

  join(s, seat, data) { s.colors[seat] = pickColor(s, seat, data.color); },

  action(s, seat, a) {
    if (a.t === 'color') {
      if (COLORS.includes(a.color) && a.color !== s.colors[1 - seat]) s.colors[seat] = a.color;
      return;
    }
    if (a.t !== 'move') return;
    if (s.status !== 'playing' || s.turn !== seat) return;
    const col = Number(a.col);
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) if (s.board[r][col] === null) { row = r; break; }
    if (row < 0) return 'Diese Spalte ist voll.';

    s.board[row][col] = seat;
    s.lastMove = { row, col };
    s.moves++;
    const line = findWin(s.board, row, col, seat);
    if (line) { s.status = 'won'; s.winner = seat; s.winLine = line; }
    else if (s.moves === ROWS * COLS) s.status = 'draw';
    else s.turn = 1 - s.turn;
  },

  result(s) {
    if (s.status === 'won') return { winner: s.winner, summary: `${s.moves} Züge` };
    if (s.status === 'draw') return { winner: -1, summary: 'Brett voll' };
    return null;
  },

  view(s, seat, core) {
    return {
      you: seat,
      players: core.players.filter(Boolean).map((p, i) => ({ name: p.name, connected: p.online, color: s.colors[i] })),
      board: s.board, turn: s.turn, status: s.status, winner: s.winner, winLine: s.winLine,
      lastMove: s.lastMove, moves: s.moves, score: core.score, draws: core.draws,
      gameNo: core.round, rematch: core.rematch,
    };
  },
};
