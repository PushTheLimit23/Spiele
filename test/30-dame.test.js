// Dame: komplette Zufallspartie über den Server, Revanche mit Farbtausch, Aufgeben
const R = require('../games/dame/public/rules.js');

module.exports = async ({ ok, get, pair, wait }) => {
  const [a, b] = await pair('dame');
  ok(a.state.status === 'playing' && a.state.you === 'w' && b.state.you === 'b', 'Anna Weiß, Ben Schwarz');
  ok(b.state.players.length === 2 && b.state.players.every((p) => p.connected), 'Beide Spieler verbunden');

  await b.act({ t: 'move', path: [R.legalMoves(b.state.board, 'b')[0].path].flat() });
  ok(b.state.moveNo === 0, 'Schwarz kann nicht zuerst ziehen');
  await a.act({ t: 'move', path: [0, 9] });
  ok(/Ungültig/.test(a.lastError()?.msg || ''), 'Ungültiger Zug wird abgelehnt');

  // Zufallspartie bis zum Ende (max. 400 Halbzüge)
  let guard = 0;
  while (a.state.status === 'playing' && guard++ < 400) {
    const s = a.state;
    const p = s.turn === a.state.you ? a : b;
    const moves = R.legalMoves(s.board, s.turn);
    const m = moves.find((x) => x.captures.length) || moves[Math.floor(Math.random() * moves.length)];
    await p.act({ t: 'move', path: m.path });
  }
  await wait(80);
  const s = a.state;
  ok(s.status === 'over' || guard >= 400, `Partie beendet nach ${s.moveNo} Zügen: ${s.reason || 'abgebrochen'}`);
  if (s.status === 'over') {
    const winnerSeat = s.winner === 'draw' ? -1 : s.winner === 'w' ? 0 : 1;
    const wins = s.players.map((p) => p.wins);
    ok(winnerSeat === -1 ? wins[0] + wins[1] === 0 : wins[winnerSeat] === 1, 'Sieg wird gezählt');
    const h = JSON.parse((await get(`/api/history?id=${a.id}&game=dame`)).body);
    ok(h.length === 1 && h[0].opp === 'Ben', 'Historie mit Mitspieler');
    await a.rematch(); await b.rematch();
    ok(a.state.status === 'playing' && a.state.you === 'b' && b.state.you === 'w' && a.state.gameNo === 2, 'Revanche: Farben getauscht');
    ok(a.state.players.find((p) => p.color === 'b').wins === wins[0], 'Siege bleiben beim Spieler, nicht bei der Farbe');
    await b.act({ t: 'move', path: R.legalMoves(b.state.board, 'w')[0].path });
    ok(a.state.moveNo === 1 && a.state.turn === 'b', 'Ben zieht jetzt als Weiß zuerst');
    a.send({ type: 'resign' }); await wait(120);
    ok(b.state.status === 'over' && b.state.winner === 'w' && /Anna hat aufgegeben/.test(b.state.reason), 'Aufgeben: Ben gewinnt');
  }
  a.close(); b.close();
};
