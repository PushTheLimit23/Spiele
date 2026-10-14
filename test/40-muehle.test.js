// Mühle: Zufallspartie über den Server, Mühle schließen, Revanche mit Farbtausch, Aufgeben
const R = require('../games/muehle/public/rules.js');

module.exports = async ({ ok, get, pair, wait }) => {
  const [a, b] = await pair('muehle');
  ok(a.state.you === 1 && b.state.you === 2, 'Anna Weiß (1), Ben Schwarz (2)');
  ok(a.state.players[1].name === 'Anna' && a.state.players[2].name === 'Ben', 'Spielerleisten nach Farbe sortiert');
  await b.act({ t: 'place', p: 0 });
  ok(/./.test(b.lastError()?.msg || '') && !a.state.game.board[0], 'Schwarz kann nicht zuerst setzen');

  // Zufallspartie
  const by = (c) => (a.state.you === c ? a : b);
  let guard = 0, mills = 0;
  while (!a.state.game.winner && guard++ < 600) {
    const g = a.state.game, c = g.turn, p = by(c);
    let act;
    if (g.mustRemove) { mills++; const r = R.removable(g); act = { t: 'remove', p: r[Math.floor(Math.random() * r.length)] }; }
    else if (R.phase(g, c) === 'place') { const free = g.board.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0); act = { t: 'place', p: free[Math.floor(Math.random() * free.length)] }; }
    else {
      const mine = g.board.map((x, i) => (x === c && R.targets(g, i).length ? i : -1)).filter((i) => i >= 0);
      const from = mine[Math.floor(Math.random() * mine.length)], ts = R.targets(g, from);
      act = { t: 'move', from, to: ts[Math.floor(Math.random() * ts.length)] };
    }
    await p.act(act);
  }
  await wait(80);
  const g = a.state.game;
  ok(!!g.winner, `Partie beendet nach ${g.moves} Zügen (${g.reason}), ${mills} Mühlen geschlossen`);
  const sc = a.state.score;
  ok(g.winner === -1 ? a.state.draws === 1 : sc[g.winner] === 1, 'Ergebnis im Stand gezählt');
  const winnerName = g.winner > 0 ? a.state.players[g.winner].name : null;
  await a.rematch(); await b.rematch();
  ok(a.state.you === 2 && b.state.you === 1 && !a.state.game.winner, 'Revanche: Farben getauscht');
  ok(a.state.players[1].name === 'Ben', 'Ben spielt jetzt Weiß');
  if (winnerName) {
    const c = a.state.players[1].name === winnerName ? 1 : 2;
    ok(a.state.score[c] === 1, 'Siege wandern mit dem Spieler zur neuen Farbe');
  }
  await b.act({ t: 'place', p: 5 });
  ok(a.state.game.board[5] === 1, 'Ben setzt als Weiß');
  a.send({ type: 'resign' }); await wait(120);
  ok(b.state.game.winner === 1 && b.state.game.reason === 'resign', 'Aufgeben: Ben gewinnt');
  const h = JSON.parse((await get(`/api/history?id=${b.id}&game=muehle`)).body);
  ok(h.length === 2 && h[0].result === 'win' && h[0].reason === 'resign', 'Historie: 2 Partien, letzte gewonnen durch Aufgabe');
  a.close(); b.close();
};
