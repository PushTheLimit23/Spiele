// Halma (Sternhalma für zwei) – Regeln. Läuft identisch im Browser und auf dem Server.
//
// Brett: Stern mit 121 Löchern. Jeder hat 10 Steine im eigenen Dreieck und muss alle
// ins gegenüberliegende Dreieck bringen.
// - Zug: ein Stein auf ein freies Nachbarloch (6 Richtungen)  ODER
// - Sprung: über einen direkt benachbarten Stein (eigener oder fremder) auf das freie Loch dahinter.
//   Sprünge lassen sich beliebig verketten; man darf nach jedem Sprung aufhören. Nichts wird geschlagen.
// - Ein Stein, der im Ziel-Dreieck angekommen ist, darf es nicht mehr verlassen.
// - Gewonnen hat, wer sein Ziel-Dreieck komplett füllt. Blockade-Schutz: Ist das Ziel-Dreieck voll
//   und steht mindestens ein eigener Stein darin, zählt das auch (sonst könnte man das Ziel zuparken).
// - Remis nach 300 Zügen je Spieler. Wer nicht ziehen kann, muss aussetzen.
// Farben: 1 = Bein (beginnt), 2 = Wenge.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Halma = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LIMIT = 600; // 300 Züge je Spieler
  // Axiale Koordinaten (q, r), s = -q-r. Stern = zwei große Dreiecke übereinander.
  const CELLS = [];
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const s = -q - r;
      const a = q <= 4 && r <= 4 && s <= 4;
      const b = q >= -4 && r >= -4 && s >= -4;
      if (a || b) CELLS.push([q, r]);
    }
  }
  const N = CELLS.length; // 121
  const KEY = new Map(CELLS.map(([q, r], i) => [q + ',' + r, i]));
  const at = (q, r) => { const i = KEY.get(q + ',' + r); return i === undefined ? -1 : i; };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const NB = CELLS.map(([q, r]) => DIRS.map(([dq, dr]) => at(q + dq, r + dr)));

  // Heimat: Farbe 1 unten (r >= 5), Farbe 2 oben (r <= -5). Ziel = Heimat des anderen.
  const HOME = { 1: [], 2: [] };
  CELLS.forEach(([, r], i) => { if (r >= 5) HOME[1].push(i); if (r <= -5) HOME[2].push(i); });
  const GOAL = { 1: HOME[2], 2: HOME[1] };
  const IN_GOAL = { 1: new Set(GOAL[1]), 2: new Set(GOAL[2]) };

  function newGame() {
    const board = Array(N).fill(0);
    for (const c of [1, 2]) for (const i of HOME[c]) board[i] = c;
    return { board, turn: 1, moves: 0, winner: 0, reason: '', last: null, passed: 0 };
  }

  // Alle erreichbaren Felder eines Steins: Map(ziel -> Weg [von, …, ziel])
  function reach(board, from) {
    const out = new Map();
    for (const n of NB[from]) if (n >= 0 && !board[n]) out.set(n, [from, n]);
    // Sprungketten (Breitensuche, kürzester Weg). Startfeld gilt als leer.
    const seen = new Set([from]);
    const queue = [[from]];
    while (queue.length) {
      const path = queue.shift();
      const p = path[path.length - 1];
      for (let d = 0; d < 6; d++) {
        const m = NB[p][d];
        if (m < 0 || m === from || !board[m]) continue;
        const t = NB[m][d];
        if (t < 0 || seen.has(t) || (board[t] && t !== from)) continue;
        seen.add(t);
        const np = path.concat(t);
        if (t !== from && !out.has(t)) out.set(t, np);
        queue.push(np);
      }
    }
    return out;
  }

  // Erlaubte Ziele (mit Regel: aus dem Ziel-Dreieck geht es nicht mehr heraus)
  function targets(g, from, color = g.board[from]) {
    if (!color || g.board[from] !== color) return new Map();
    const all = reach(g.board, from);
    if (!IN_GOAL[color].has(from)) return all;
    for (const t of [...all.keys()]) if (!IN_GOAL[color].has(t)) all.delete(t);
    return all;
  }

  function hasMove(g, color) {
    for (let i = 0; i < N; i++) if (g.board[i] === color && targets(g, i, color).size) return true;
    return false;
  }

  const inGoal = (g, color) => GOAL[color].filter((i) => g.board[i] === color).length;

  function won(g, color) {
    let own = 0;
    for (const i of GOAL[color]) { if (!g.board[i]) return false; if (g.board[i] === color) own++; }
    return own > 0;
  }

  // Zug ausführen. Gibt einen Fehlertext zurück oder nichts.
  function apply(g, color, m) {
    if (g.winner) return 'Die Partie ist vorbei.';
    if (g.turn !== color) return 'Du bist nicht am Zug.';
    const from = Number(m.from), to = Number(m.to);
    if (!(from >= 0 && from < N) || !(to >= 0 && to < N)) return 'Ungültiges Feld.';
    if (g.board[from] !== color) return 'Das ist nicht dein Stein.';
    const path = targets(g, from, color).get(to);
    if (!path) {
      if (IN_GOAL[color].has(from) && !IN_GOAL[color].has(to) && reach(g.board, from).has(to)) return 'Steine im Ziel dürfen es nicht mehr verlassen.';
      return 'Dorthin geht es nicht.';
    }
    g.board[to] = color; g.board[from] = 0;
    g.moves++;
    g.last = { color, from, to, path, jump: path.length > 2 || !NB[from].includes(to) };
    g.passed = 0;
    if (won(g, color)) { g.winner = color; g.reason = 'goal'; return; }
    if (g.moves >= LIMIT) { g.winner = -1; g.reason = 'limit'; return; }
    g.turn = 3 - color;
    if (!hasMove(g, g.turn)) {
      g.passed = g.turn; // muss aussetzen
      g.turn = color;
      if (!hasMove(g, color)) { g.winner = -1; g.reason = 'blocked'; }
    }
  }

  return { N, CELLS, NB, HOME, GOAL, IN_GOAL, LIMIT, newGame, reach, targets, hasMove, inGoal, won, apply };
});
