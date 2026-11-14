// Vier Gewinnt – Computer-Gegner (nur Server). Suche: games/_shared/search.js
const { choose, WIN } = require('../_shared/search.js');

const ROWS = 6, COLS = 7, ORDER = [3, 2, 4, 1, 5, 0, 6];

// Stellung: { b: [[…]] (null | 0 | 1), win: -1 | 0 | 1, full: bool }
function drop(n, col, p) {
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) if (n.b[r][col] === null) { row = r; break; }
  if (row < 0) return null;
  const b = n.b.map((r) => r.slice());
  b[row][col] = p;
  return { b, win: wins(b, row, col, p) ? p : -1, full: b[0].every((x) => x !== null) };
}
function wins(b, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === p) { n++; rr += dr * s; cc += dc * s; }
    }
    if (n >= 4) return true;
  }
  return false;
}

// Bewertung: alle Vierer-Fenster zählen (3 eigene + 1 frei ist stark), Mitte bevorzugt
const WINDOWS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
  const w = [];
  for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break; w.push([rr, cc]); }
  if (w.length === 4) WINDOWS.push(w);
}
function evaluate(n, me) {
  if (n.win >= 0) return n.win === me ? WIN : -WIN;
  if (n.full) return 0;
  const op = 1 - me;
  let v = 0;
  for (const w of WINDOWS) {
    let m = 0, o = 0;
    for (const [r, c] of w) { const x = n.b[r][c]; if (x === me) m++; else if (x === op) o++; }
    if (m && o) continue;
    if (m === 3) v += 50; else if (m === 2) v += 6;
    if (o === 3) v -= 60; else if (o === 2) v -= 6;
  }
  for (let r = 0; r < ROWS; r++) { if (n.b[r][3] === me) v += 4; else if (n.b[r][3] === op) v -= 4; }
  return v;
}

module.exports = (G) => ({
  toMove(s, seat) { return s.status === 'playing' && s.turn === seat; },
  play(s, seat, level) {
    const root = { b: s.board, win: -1, full: false };
    const acts = choose(root, seat, {
      level,
      gen: (n, p) => ORDER.map((col) => ({ acts: [{ t: 'move', col }], next: drop(n, col, p) })).filter((t) => t.next),
      evaluate,
      over: (n) => n.win >= 0 || n.full,
      other: (p) => 1 - p,
      mittelDepth: 3, leichtNoise: 60, leichtRandom: 0.3, maxDepth: 14, budgetMs: 900,
    });
    return acts || [];
  },
});
