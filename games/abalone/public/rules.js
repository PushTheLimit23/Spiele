// Abalone – Regeln. Läuft identisch im Browser und auf dem Server.
//
// Sechseckbrett mit 61 Feldern, je 14 Kugeln. Ziel: 6 Kugeln des Mitspielers vom Brett schieben.
// - Ein Zug bewegt 1–3 eigene Kugeln, die in einer Linie nebeneinander liegen, um ein Feld.
// - In Linienrichtung ("in Reihe"): Das Feld vor der vordersten Kugel muss frei sein – oder dort liegen
//   Kugeln des Mitspielers, die in der Unterzahl sind (3 gegen 2, 3 gegen 1, 2 gegen 1). Dann werden sie
//   mitgeschoben ("Sumito"); hinter ihnen muss ein freies Feld oder der Brettrand sein (dann fällt die
//   äußerste herunter). Eigene Kugeln vom Brett schieben geht nicht.
// - Seitlich ("Breitseite", nur bei 2–3 Kugeln): Alle Zielfelder müssen frei sein, geschoben wird nichts.
// - Remis nach 200 Zügen je Spieler.
// Farben: 1 = Wenge (beginnt, wie im Original Schwarz), 2 = Bein.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Abalone = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WIN = 6, LIMIT = 400;
  const CELLS = [];
  for (let r = -4; r <= 4; r++) for (let q = -4; q <= 4; q++) if (Math.abs(q + r) <= 4) CELLS.push([q, r]);
  const N = CELLS.length; // 61
  const KEY = new Map(CELLS.map(([q, r], i) => [q + ',' + r, i]));
  const at = (q, r) => { const i = KEY.get(q + ',' + r); return i === undefined ? -1 : i; };
  // Richtungen paarweise gegenüber: d und d^1
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const NB = CELLS.map(([q, r]) => DIRS.map(([dq, dr]) => at(q + dq, r + dr)));
  const opp = (d) => d ^ 1;

  // Grundaufstellung: Farbe 1 unten (r = 4, 3 und Mitte von r = 2), Farbe 2 gespiegelt oben
  function newGame() {
    const board = Array(N).fill(0);
    CELLS.forEach(([q, r], i) => {
      if (r >= 3 || (r === 2 && q >= -2 && q <= 0)) board[i] = 1;
      if (r <= -3 || (r === -2 && q >= 0 && q <= 2)) board[i] = 2;
    });
    return { board, turn: 1, moves: 0, off: { 1: 0, 2: 0 }, winner: 0, reason: '', last: null };
  }

  // Richtung, in der b von a aus liegt (Nachbar), sonst -1
  const dirOf = (a, b) => NB[a].indexOf(b);

  // Auswahl prüfen: 1–3 eigene Kugeln, lückenlos in einer Linie. Gibt sortierte Auswahl + Linienrichtung zurück.
  function line(board, color, sel) {
    sel = [...new Set(sel.map(Number))];
    if (sel.length < 1 || sel.length > 3) return null;
    if (sel.some((i) => !(i >= 0 && i < N) || board[i] !== color)) return null;
    if (sel.length === 1) return { cells: sel, axis: -1 };
    for (const start of sel) {
      for (let d = 0; d < 6; d += 2) for (const dd of [d, d + 1]) {
        const run = [start];
        while (run.length < sel.length) { const n = NB[run[run.length - 1]][dd]; if (n < 0) break; run.push(n); }
        if (run.length === sel.length && run.every((x) => sel.includes(x))) return { cells: run, axis: dd };
      }
    }
    return null;
  }

  // Ist der Zug "Auswahl in Richtung d" erlaubt? Gibt { move, push, off } oder { err }
  function check(board, color, sel, d) {
    const L = line(board, color, sel);
    if (!L) return { err: 'Wähle 1 bis 3 eigene Kugeln in einer Reihe.' };
    if (!(d >= 0 && d < 6)) return { err: 'Ungültige Richtung.' };
    const n = L.cells.length;
    const inline = n === 1 || d === L.axis || d === opp(L.axis);
    if (inline) {
      // vorderste Kugel in Zugrichtung
      const lead = n === 1 ? L.cells[0] : (d === L.axis ? L.cells[n - 1] : L.cells[0]);
      let c = NB[lead][d];
      if (c < 0) return { err: 'Eigene Kugeln darfst du nicht vom Brett schieben.' };
      if (!board[c]) return { move: L.cells, push: [], off: false };
      if (board[c] === color) return { err: 'Da ist eine eigene Kugel im Weg.' };
      // Kugeln des Mitspielers zählen
      const push = [];
      while (c >= 0 && board[c] === 3 - color) { push.push(c); c = NB[c][d]; }
      if (c >= 0 && board[c] === color) return { err: 'Hinter den Kugeln liegt eine eigene – so kann nicht geschoben werden.' };
      if (n === 1) return { err: 'Eine einzelne Kugel kann nicht schieben.' };
      if (push.length >= n) return { err: `Zum Schieben brauchst du die Überzahl (${n} gegen ${push.length} reicht nicht).` };
      return { move: L.cells, push, off: c < 0 };
    }
    // Breitseite: alle Zielfelder frei
    for (const m of L.cells) {
      const t = NB[m][d];
      if (t < 0) return { err: 'Eigene Kugeln darfst du nicht vom Brett schieben.' };
      if (board[t]) return { err: 'Seitlich geht es nur auf freie Felder.' };
    }
    return { move: L.cells, push: [], off: false };
  }

  function apply(g, color, m) {
    if (g.winner) return 'Die Partie ist vorbei.';
    if (g.turn !== color) return 'Du bist nicht am Zug.';
    const sel = Array.isArray(m.sel) ? m.sel : [];
    const d = Number(m.dir);
    const r = check(g.board, color, sel, d);
    if (r.err) return r.err;
    const b = g.board;
    // Erst die geschobenen Kugeln (die vorderste zuerst), dann die eigenen – jeweils von vorn nach hinten
    let fell = -1;
    for (const p of r.push.slice().reverse()) { const t = NB[p][d]; if (t < 0) fell = p; else b[t] = 3 - color; b[p] = 0; }
    for (const p of r.move.slice().sort((a, c) => proj(c, d) - proj(a, d))) { b[NB[p][d]] = color; b[p] = 0; }
    if (r.off) g.off[3 - color]++;
    g.moves++;
    g.last = { color, from: r.move, dir: d, pushed: r.push, fell, off: r.off };
    if (g.off[3 - color] >= WIN) { g.winner = color; g.reason = 'six'; return; }
    if (g.moves >= LIMIT) { g.winner = -1; g.reason = 'limit'; return; }
    g.turn = 3 - color;
  }

  // Lage eines Feldes entlang Richtung d (für Sortierung)
  function proj(i, d) { const [q, r] = CELLS[i], [dq, dr] = DIRS[d]; return q * dq + r * dr; }

  // Alle erlaubten Züge (für Tests / "kann nicht ziehen")
  function allMoves(board, color) {
    const out = [], seen = new Set();
    for (let i = 0; i < N; i++) {
      if (board[i] !== color) continue;
      const groups = [[i]];
      for (let d = 0; d < 6; d += 2) {
        const a = NB[i][d];
        if (a >= 0 && board[a] === color) { groups.push([i, a]); const b2 = NB[a][d]; if (b2 >= 0 && board[b2] === color) groups.push([i, a, b2]); }
      }
      for (const gsel of groups) for (let d = 0; d < 6; d++) {
        const key = gsel.slice().sort((x, y) => x - y).join('-') + ':' + d;
        if (seen.has(key)) continue; seen.add(key);
        const r = check(board, color, gsel, d);
        if (!r.err) out.push({ sel: gsel, dir: d, push: r.push.length, off: r.off });
      }
    }
    return out;
  }

  return { N, CELLS, DIRS, NB, WIN, LIMIT, newGame, line, check, apply, allMoves, dirOf };
});
