// Abalone: Regeln (Ziehen, Breitseite, Sumito, Herunterschieben) + Partie über den Server
const R = require('../games/abalone/public/rules.js');

const idx = (q, r) => R.CELLS.findIndex(([a, b]) => a === q && b === r);
const empty = () => ({ ...R.newGame(), board: Array(R.N).fill(0), off: { 1: 0, 2: 0 } });
const E = 0; // Richtung (1,0) = nach rechts

module.exports = async ({ ok, get, pair, wait }) => {
  // ---------- Regeln ----------
  let g = R.newGame();
  ok(R.N === 61 && g.board.filter((c) => c === 1).length === 14 && g.board.filter((c) => c === 2).length === 14, 'Brett 61 Felder, je 14 Kugeln');
  ok(R.allMoves(g.board, 1).length === 44, 'Grundstellung: 44 mögliche Eröffnungszüge (wie im Original)');

  g = empty();
  const a = idx(-2, 0), b = idx(-1, 0), c = idx(0, 0);
  g.board[a] = g.board[b] = g.board[c] = 1;
  ok(R.line(g.board, 1, [c, a, b]), 'Drei Kugeln in einer Reihe (Reihenfolge egal)');
  ok(!R.line(g.board, 1, [a, c]), 'Mit Lücke ist keine Reihe');
  ok(!R.check(g.board, 1, [a, b, c], 3).err, 'Breitseite auf freie Felder');
  g.board[R.NB[b][3]] = 2;
  ok(/freie Felder/.test(R.check(g.board, 1, [a, b, c], 3).err), 'Breitseite gegen Kugel: verboten');

  // Sumito 3 gegen 2 mit Herunterschieben
  g = empty();
  const r2 = [idx(-4, 4), idx(-3, 4), idx(-2, 4)]; // unterste Reihe, rechts davon der Rand
  g.board[r2[0]] = g.board[r2[1]] = g.board[r2[2]] = 1;
  g.board[idx(-1, 4)] = g.board[idx(0, 4)] = 2;
  g.turn = 1;
  const chk = R.check(g.board, 1, r2, E);
  ok(!chk.err && chk.push.length === 2 && chk.off, '3 gegen 2 am Rand: Sumito mit Herunterschieben');
  R.apply(g, 1, { sel: r2, dir: E });
  ok(g.off[2] === 1 && g.board[idx(0, 4)] === 2 && g.board[idx(-1, 4)] === 1 && !g.board[idx(-4, 4)], 'Eine Kugel fällt, Rest rückt nach');

  // 2 gegen 2 geht nicht, Einzelkugel schiebt nicht, eigene nicht herunter
  g = empty(); g.board[idx(-2, 0)] = g.board[idx(-1, 0)] = 1; g.board[idx(0, 0)] = g.board[idx(1, 0)] = 2;
  ok(/Überzahl/.test(R.check(g.board, 1, [idx(-2, 0), idx(-1, 0)], E).err || ''), '2 gegen 2: kein Schieben');
  ok(/einzelne/.test(R.check(g.board, 1, [idx(-1, 0)], E).err || ''), 'Einzelne Kugel kann nicht schieben');
  g = empty(); g.board[idx(4, 0)] = 1;
  ok(/nicht vom Brett/.test(R.check(g.board, 1, [idx(4, 0)], E).err || ''), 'Eigene Kugel nicht vom Brett');
  // Eigene Kugel hinter dem Gegner blockiert
  g = empty(); g.board[idx(-2, 0)] = g.board[idx(-1, 0)] = g.board[idx(0, 0)] = 1; g.board[idx(1, 0)] = 2; g.board[idx(2, 0)] = 1;
  ok(/eigene/.test(R.check(g.board, 1, [idx(-2, 0), idx(-1, 0), idx(0, 0)], E).err || ''), 'Eigene Kugel hinter dem Gegner blockiert');

  // ---------- Über den Server ----------
  const [A, B] = await pair('abalone');
  ok(A.state.you === 1 && B.state.you === 2 && A.state.game.turn === 1, 'Anna Wenge (beginnt), Ben Bein');
  await B.act({ t: 'move', sel: [R.allMoves(B.state.game.board, 2)[0].sel[0]], dir: 0 });
  ok(/nicht am Zug/.test(B.lastError()?.msg || ''), 'Bein kann nicht zuerst ziehen');
  // Partie: wer schieben/herunterschieben kann, tut es
  let guard = 0;
  while (!A.state.game.winner && guard++ < 420) {
    const s = A.state.game, p = s.turn === A.state.you ? A : B;
    const ms = R.allMoves(s.board, s.turn);
    const pool = ms.filter((m) => m.off).length ? ms.filter((m) => m.off) : ms.filter((m) => m.push).length && Math.random() < .7 ? ms.filter((m) => m.push) : ms;
    const m = pool[Math.floor(Math.random() * pool.length)];
    await p.act({ t: 'move', sel: m.sel, dir: m.dir });
  }
  await wait(80);
  const gm = A.state.game;
  ok(gm.winner !== 0, `Partie beendet nach ${gm.moves} Zügen (${gm.reason}, ${gm.off[1]}:${gm.off[2]})`);
  if (gm.winner > 0) ok(gm.off[3 - gm.winner] === 6 && A.state.score[gm.winner] === 1, 'Sechs Kugeln vom Brett = Sieg, im Stand gezählt');
  const h = JSON.parse((await get(`/api/history?id=${A.id}&game=abalone`)).body);
  ok(h.length === 1 && h[0].opp === 'Ben', 'Historie mit Mitspieler');
  await A.rematch(); await B.rematch();
  ok(A.state.you === 2 && B.state.you === 1 && A.state.game.moves === 0, 'Revanche: Farben getauscht');
  A.send({ type: 'resign' }); await wait(120);
  ok(B.state.game.winner === 1 && B.state.game.reason === 'resign', 'Aufgeben: Ben gewinnt');
  A.close(); B.close();
};
