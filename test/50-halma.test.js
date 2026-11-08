// Halma: Regeln (direkt) + komplette Partie über den Server, Revanche mit Farbtausch, Aufgeben
const R = require('../games/halma/public/rules.js');

const idx = (q, r) => R.CELLS.findIndex(([a, b]) => a === q && b === r);
const empty = () => ({ ...R.newGame(), board: Array(R.N).fill(0) });

module.exports = async ({ ok, get, pair, wait }) => {
  // ---------- Regeln ----------
  ok(R.N === 121 && R.HOME[1].length === 10 && R.HOME[2].length === 10, 'Sternbrett: 121 Löcher, je 10 Steine');
  let g = empty();
  const a = idx(0, 0); g.board[a] = 1;
  ok(R.targets(g, a).size === 6, 'Ziehen in alle 6 Richtungen');
  g.board[idx(1, 0)] = 2; g.board[idx(3, 0)] = 1; g.board[idx(5, -1)] = 2;
  const t = R.targets(g, a);
  ok(t.has(idx(2, 0)) && t.get(idx(2, 0)).length === 2, 'Sprung über fremden Stein');
  ok(t.has(idx(4, 0)) && t.get(idx(4, 0)).length === 3, 'Sprungkette über zwei Steine (2 Sprünge)');
  ok(!t.has(idx(1, 0)) && !t.has(idx(3, 0)), 'Besetzte Felder sind kein Ziel');
  g = empty(); g.board[a] = 1; g.board[idx(2, 0)] = 2;
  ok(!R.targets(g, a).has(idx(3, 0)) && !R.targets(g, a).has(idx(4, 0)), 'Kein Sprung über eine Lücke');

  // Aus dem Ziel nicht mehr heraus
  g = empty(); const inGoal = R.GOAL[1].find((i) => R.NB[i].some((n) => n >= 0 && !R.IN_GOAL[1].has(n))); g.board[inGoal] = 1;
  const out = [...R.reach(g.board, inGoal).keys()].filter((x) => !R.IN_GOAL[1].has(x));
  ok(out.length > 0 && out.every((x) => !R.targets(g, inGoal).has(x)), 'Stein im Ziel darf es nicht verlassen');
  ok(/nicht mehr verlassen/.test(R.apply(g, 1, { from: inGoal, to: out[0] }) || ''), 'Verständliche Meldung dazu');

  // Sieg & Blockade-Schutz
  g = empty(); R.GOAL[1].forEach((i, k) => { g.board[i] = k < 9 ? 1 : 2; });
  const last = R.GOAL[1].find((i) => g.board[i] === 2); g.board[last] = 0;
  const near = R.NB[last].find((n) => n >= 0 && !R.IN_GOAL[1].has(n)); g.board[near] = 1; g.turn = 1;
  R.apply(g, 1, { from: near, to: last });
  ok(g.winner === 1 && g.reason === 'goal', 'Alle 10 im Ziel = gewonnen');
  g = empty(); R.GOAL[1].forEach((i) => { g.board[i] = 2; }); const free = R.GOAL[1][9]; g.board[free] = 0;
  const n2 = R.NB[free].find((n) => n >= 0 && !R.IN_GOAL[1].has(n)); g.board[n2] = 1; g.turn = 1;
  R.apply(g, 1, { from: n2, to: free });
  ok(g.winner === 1, 'Zugeparktes Ziel: voll + ein eigener Stein = gewonnen');

  // ---------- Über den Server ----------
  const [A, B] = await pair('halma');
  ok(A.state.you === 1 && B.state.you === 2 && A.state.game.turn === 1, 'Anna Bein (beginnt), Ben Wenge');
  await B.act({ t: 'move', from: R.HOME[2][0], to: R.NB[R.HOME[2][0]].find((n) => n >= 0) });
  ok(/nicht am Zug/.test(B.lastError()?.msg || ''), 'Wenge kann nicht zuerst ziehen');
  await A.act({ t: 'move', from: R.HOME[1][0], to: R.HOME[2][0] });
  ok(/geht es nicht|nicht dein/.test(A.lastError()?.msg || ''), 'Ungültiger Zug wird abgelehnt');

  // Gierige Partie bis zum Ende
  const prog = (c, i) => (c === 1 ? -R.CELLS[i][1] : R.CELLS[i][1]);
  let guard = 0;
  while (!A.state.game.winner && guard++ < 700) {
    const s = A.state.game, c = s.turn, p = A.state.you === c ? A : B;
    let best = null, bv = -1e9;
    for (let i = 0; i < R.N; i++) if (s.board[i] === c) for (const [to] of R.targets(s, i, c)) {
      let v = prog(c, to) - prog(c, i) + Math.random();
      if (R.IN_GOAL[c].has(to) && !R.IN_GOAL[c].has(i)) v += 1;
      if (v > bv) { bv = v; best = { from: i, to }; }
    }
    await p.act({ t: 'move', ...best });
  }
  await wait(80);
  const gm = A.state.game;
  ok(gm.winner !== 0, `Partie beendet nach ${gm.moves} Halbzügen (${gm.reason})`);
  ok(gm.last && Array.isArray(gm.last.path) && gm.last.path.length >= 2, 'Letzter Zug enthält den Weg (für die Animation)');
  if (gm.winner > 0) ok(A.state.score[gm.winner] === 1, 'Sieg im Stand gezählt');
  const h = JSON.parse((await get(`/api/history?id=${A.id}&game=halma`)).body);
  ok(h.length === 1 && h[0].opp === 'Ben', 'Historie mit Mitspieler');

  await A.rematch(); await B.rematch();
  ok(A.state.you === 2 && B.state.you === 1 && !A.state.game.winner && A.state.game.moves === 0, 'Revanche: Farben getauscht, neues Brett');
  ok(A.state.players[1].name === 'Ben', 'Ben spielt jetzt Bein und beginnt');
  A.send({ type: 'resign' }); await wait(120);
  ok(B.state.game.winner === 1 && B.state.game.reason === 'resign', 'Aufgeben: Ben gewinnt');
  A.close(); B.close();
};
