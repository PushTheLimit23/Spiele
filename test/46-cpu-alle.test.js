// Computer-Gegner für Vier Gewinnt, Dame, Halma, Abalone: Stufen, Zug über den Server, Abzeichen-Daten
const WebSocket = require('ws');

const GAMES = ['vier', 'dame', 'halma', 'abalone'];

// Bot gegen Bot direkt über das Spielmodul (ohne Server)
function match(id, A, B, n) {
  const G = require(`../games/${id}/game.js`);
  const res = { A: 0, B: 0, D: 0 };
  for (let i = 0; i < n; i++) {
    let s = G.create(); if (G.join) { G.join(s, 0, {}, {}); G.join(s, 1, {}, {}); }
    s = G.start(s, i + 1); if (G.join) { G.join(s, 0, {}, {}); G.join(s, 1, {}, {}); }
    const lv = i % 2 ? [B, A] : [A, B];
    for (let k = 0; k < 600 && !G.result(s); k++) {
      const seat = G.bot.toMove(s, 0) ? 0 : 1;
      for (const a of G.bot.play(s, seat, lv[seat])) { const e = G.action(s, seat, a, {}); if (e) throw new Error(id + ': ' + e); }
    }
    const r = G.result(s), w = r ? r.winner : -1;
    if (w < 0) res.D++; else if ((w === 0) === (i % 2 === 0)) res.A++; else res.B++;
  }
  return res;
}

// erster erlaubter Zug für Platz 0 in Runde 1 (wie ihn der Browser schicken würde)
function firstMove(id) {
  if (id === 'vier') return { t: 'move', col: 3 };
  const R = require(`../games/${id}/public/rules.js`);
  if (id === 'dame') return { t: 'move', path: R.legalMoves(R.initialBoard(), 'w')[0].path };
  if (id === 'abalone') { const m = R.allMoves(R.newGame().board, 1)[0]; return { t: 'move', sel: m.sel, dir: m.dir }; }
  const g = R.newGame();
  for (let i = 0; i < R.N; i++) if (g.board[i] === 1) for (const to of R.targets(g, i, 1).keys()) return { t: 'move', from: i, to };
}

module.exports = async ({ ok, get, room, wait, PORT }) => {
  // ---------- Stufen ----------
  for (const id of GAMES) {
    const m = match(id, 'mittel', 'leicht', 4);
    ok(m.A >= 3, `${id}: Mittel schlägt Leicht (${JSON.stringify(m)})`);
  }

  // Vier Gewinnt: Schwer gewinnt sofort bzw. blockiert
  const V = require('../games/vier/game.js');
  let s = V.start(V.create(), 1);
  s.board[5][0] = s.board[5][1] = s.board[5][2] = 0; s.board[5][6] = s.board[4][6] = 1; s.turn = 1;
  ok(V.bot.play(s, 1, 'schwer')[0].col === 3, 'Vier Gewinnt: Schwer blockiert die offene Dreierreihe');
  s.board[3][6] = 1;
  ok(V.bot.play(s, 1, 'mittel')[0].col === 6, 'Vier Gewinnt: Mittel nimmt den Sieg in einem Zug');
  const t0 = Date.now(); V.bot.play(V.start(V.create(), 1), 0, 'schwer');
  ok(Date.now() - t0 < 1500, `Vier Gewinnt: Schwer denkt nicht zu lange (${Date.now() - t0} ms)`);

  // Dame: Schlagpflicht – der Bot liefert nur erlaubte Züge (sonst würde match() oben werfen); hier: König schlägt
  const D = require('../games/dame/game.js'), DR = require('../games/dame/public/rules.js');
  s = D.start(D.create(), 1);
  s.board = Array(64).fill(null); s.board[DR.idx(5, 2)] = 'w'; s.board[DR.idx(4, 3)] = 'b'; s.board[DR.idx(0, 7)] = 'b';
  const dm = D.bot.play(s, 0, 'schwer');
  ok(dm[0].path[0] === DR.idx(5, 2) && dm[0].path[1] === DR.idx(3, 4), 'Dame: Schwer schlägt (Schlagpflicht)');

  // ---------- API: Abzeichen-Daten ----------
  const list = JSON.parse((await get('/api/games')).body);
  const cpu = list.filter((g) => g.cpu).map((g) => g.id).sort();
  ok(JSON.stringify(cpu) === JSON.stringify(['abalone', 'dame', 'halma', 'muehle', 'vier']), `/api/games meldet Spiele mit Computer (${cpu.join(', ')})`);
  const home = await get('/');
  ok(/cpu-badge/.test(home.body) && /id="legend"/.test(home.body), 'Startseite hat Abzeichen + Legende');

  // ---------- Über den Server ----------
  for (const id of GAMES) {
    const r = room(), msgs = [];
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    await new Promise((res) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', game: id, room: r, id: 'human' + id.padEnd(7, 'x'), name: 'Marcel', cpu: 'leicht', data: id === 'vier' ? { color: '#c75c48' } : {} })));
      ws.on('message', (raw) => msgs.push(JSON.parse(raw)));
      setTimeout(res, 250);
    });
    const st = () => [...msgs].reverse().find((m) => m.type === 'state');
    ok(st() && st().cpu === true && JSON.stringify(st().players).includes('"Computer"'), `${id}: Computer sitzt am Tisch (state.cpu)`);
    if (id === 'vier') ok(st().players[0].color === '#c75c48' && st().players[1].color && st().players[1].color !== '#c75c48', 'Vier Gewinnt: Mensch behält seine Farbe, Computer bekommt eine andere');
    const before = msgs.filter((m) => m.type === 'state').length;
    ws.send(JSON.stringify({ type: 'act', act: firstMove(id) }));
    await wait(2600);
    const after = msgs.filter((m) => m.type === 'state').length;
    ok(after - before >= 2 && !msgs.some((m) => m.type === 'error'), `${id}: eigener Zug + Antwort des Computers (${after - before} Stände)`);
    ws.close();
  }
};
