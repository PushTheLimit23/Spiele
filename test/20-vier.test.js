// Vier Gewinnt
module.exports = async ({ ok, get, pair, wait }) => {
  const [a, b] = await pair('vier', { color: '#c75c48' }, { color: '#c75c48' });
  ok(a.state.status === 'playing' && a.state.turn === 0, 'Partie läuft, Anna beginnt');
  ok(a.state.players[0].color === '#c75c48' && b.state.players[1].color !== '#c75c48', 'Gleiche Wunschfarbe: zweiter Spieler bekommt eine andere');
  await b.act({ t: 'color', color: '#c75c48' });
  ok(b.state.players[1].color !== '#c75c48', 'Belegte Farbe kann nicht gewählt werden');
  await b.act({ t: 'color', color: '#f2c35b' });
  ok(a.state.players[1].color === '#f2c35b', 'Farbwechsel mitten im Spiel');
  await b.act({ t: 'move', col: 0 });
  ok(a.state.moves === 0, 'Wer nicht dran ist, kann nicht ziehen');
  for (const [p, c] of [[a, 3], [b, 0], [a, 3], [b, 0], [a, 3], [b, 0]]) await p.act({ t: 'move', col: c });
  ok(a.state.board[5][3] === 0 && a.state.board[3][0] === 1, 'Steine fallen nach unten');
  await a.act({ t: 'move', col: 3 });
  ok(a.state.status === 'won' && a.state.winner === 0 && a.state.winLine.length === 4, 'Vier senkrecht gewinnt');
  ok(b.state.score[0] === 1 && b.state.gameNo === 1, 'Punktestand 1:0');
  await a.rematch();
  ok(a.state.status === 'won' && a.state.rematch.includes(0), 'Revanche braucht beide');
  await b.rematch();
  ok(a.state.status === 'playing' && a.state.turn === 1 && a.state.gameNo === 2, 'Revanche: Ben beginnt jetzt');
  ok(a.state.players[1].color === '#f2c35b', 'Farben bleiben bei der Revanche');
  const h = JSON.parse((await get(`/api/history?id=${a.id}&game=vier`)).body);
  ok(h.length === 1 && h[0].result === 'win' && h[0].opp === 'Ben', 'Historie: Sieg gegen Ben');

  // Volle Spalte
  for (let i = 0; i < 6; i++) await (i % 2 ? a : b).act({ t: 'move', col: 6 });
  await b.act({ t: 'move', col: 6 });
  ok(/voll/.test(b.lastError()?.msg || ''), 'Volle Spalte wird abgelehnt');
  a.close(); b.close();
};
