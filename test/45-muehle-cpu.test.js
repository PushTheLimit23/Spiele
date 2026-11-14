// Mühle gegen den Computer: Stufen, Zug über den Server, Revanche, kein Chat, Platz nicht übernehmbar
const R = require('../games/muehle/public/rules.js');
const Bot = require('../games/muehle/bot.js');
const WebSocket = require('ws');

module.exports = async ({ ok, get, Player, room, wait, PORT }) => {
  // ---------- Stufen direkt ----------
  const match = (l1, l2, n) => {
    const w = {};
    for (let k = 0; k < n; k++) {
      const g = R.newGame(), lv = { 1: k % 2 ? l2 : l1, 2: k % 2 ? l1 : l2 };
      while (!g.winner) { const c = g.turn; for (const a of Bot.choose(g, lv[c])) R.apply(g, c, { type: a.t, p: a.p, from: a.from, to: a.to }); }
      const key = g.winner === -1 ? 'remis' : lv[g.winner]; w[key] = (w[key] || 0) + 1;
    }
    return w;
  };
  const m1 = match('mittel', 'leicht', 6);
  ok((m1.mittel || 0) >= 5, `Mittel schlägt Leicht (${JSON.stringify(m1)})`);
  // Schwer findet eine Mühle in einem Zug und verhindert eine drohende
  let g = R.newGame(); g.board[0] = g.board[1] = 1; g.board[21] = g.board[22] = 2; g.inHand = [0, 7, 7]; g.onBoard = [0, 2, 2]; g.turn = 1;
  let acts = Bot.choose(g, 'schwer');
  ok(acts[0].p === 2 && acts[1] && acts[1].t === 'remove', 'Schwer schließt die offene Mühle und nimmt einen Stein');
  g = R.newGame(); g.board[21] = g.board[22] = 2; g.board[10] = 1; g.inHand = [0, 8, 7]; g.onBoard = [0, 1, 2]; g.turn = 1;
  acts = Bot.choose(g, 'mittel');
  ok(acts[0].p === 23, 'Mittel blockiert die drohende Mühle');
  const t0 = Date.now(); Bot.choose(R.newGame(), 'schwer');
  ok(Date.now() - t0 < 900, `Schwer denkt nicht zu lange (${Date.now() - t0} ms)`);

  // ---------- Über den Server ----------
  const r = room();
  const A = new Player('muehle', r, 'humanhuman01', 'Marcel');
  // join mit cpu-Stufe
  await new Promise((res) => {
    A.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    A.ws.on('open', () => A.ws.send(JSON.stringify({ type: 'join', game: 'muehle', room: r, id: A.id, name: 'Marcel', cpu: 'mittel' })));
    A.ws.on('message', (raw) => { const m = JSON.parse(raw); A.msgs.push(m); if (m.type === 'state') A.state = m; });
    A.ws.on('close', (c) => { A.closed = c; });
    setTimeout(res, 250);
  });
  ok(A.state && A.state.players[2] && A.state.players[2].name === 'Computer' && A.state.players[2].online, 'Computer sitzt am Tisch und ist "online"');
  ok(A.msgs.some((m) => m.type === 'chatlog' && m.off), 'Kein Chat gegen den Computer');
  ok(A.state.you === 1 && A.state.game.turn === 1, 'Mensch hat Weiß und beginnt');
  await A.act({ t: 'place', p: 0 }); await wait(1100);
  ok(A.state.game.board.filter((c) => c === 2).length === 1 && A.state.game.turn === 1, 'Computer antwortet von selbst mit einem Zug');
  // Spiel zu Ende spielen: Mensch spielt zufällig
  let guard = 0;
  while (!A.state.game.winner && guard++ < 400) {
    const s = A.state.game;
    if (s.turn !== A.state.you) { await wait(200); continue; }
    if (s.mustRemove) { const rr = R.removable(s); await A.act({ t: 'remove', p: rr[0] }); continue; }
    if (R.phase(s, s.turn) === 'place') { const free = s.board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0); await A.act({ t: 'place', p: free[Math.floor(Math.random() * free.length)] }); }
    else {
      const mv = []; for (let f = 0; f < 24; f++) if (s.board[f] === s.turn) for (const to of R.targets(s, f)) mv.push({ from: f, to });
      const m = mv[Math.floor(Math.random() * mv.length)]; await A.act({ t: 'move', ...m });
    }
    await wait(60);
  }
  ok(A.state.game.winner === 2 || A.state.game.winner === -1, `Computer gewinnt gegen Zufallszüge (Ergebnis: ${A.state.game.reason})`);
  const h = JSON.parse((await get(`/api/history?id=${A.id}&game=muehle`)).body);
  ok(h.length >= 1 && /Computer/.test(h[0].opp), 'Historie zeigt den Computer als Mitspieler');
  A.send({ type: 'rematch' }); await wait(1300);
  ok(!A.state.game.winner && A.state.you === 2 && A.state.game.moves >= 1, 'Revanche sofort; Computer hat jetzt Weiß und hat schon gezogen');

  // Dritter mit dem Link: voll, und der Computer-Platz ist nicht übernehmbar
  const C = new Player('muehle', r, 'otherother02', 'Fremd'); await C.connect();
  const full = C.msgs.find((m) => m.type === 'full');
  ok(full && full.seats.filter(Boolean).length === 1, 'Fremder: Spiel voll, Computer-Platz wird nicht zur Übernahme angeboten');
  C.ws.send(JSON.stringify({ type: 'join', game: 'muehle', room: r, id: 'otherother02', name: 'Fremd', takeover: 1 })); await wait(150);
  ok(!C.state, 'Übernahme des Computer-Platzes wird abgelehnt');
  C.close(); A.close();

  // Spiele ohne Computer ignorieren cpu
  const r2 = room();
  const D = new Player('carrom', r2, 'dddddddd0003', 'Dora');
  await new Promise((res) => { D.ws = new WebSocket(`ws://localhost:${PORT}/ws`); D.ws.on('open', () => D.ws.send(JSON.stringify({ type: 'join', game: 'carrom', room: r2, id: D.id, name: 'Dora', cpu: 'mittel' }))); D.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.type === 'state') D.state = m; }); setTimeout(res, 200); });
  ok(D.state && D.state.cpu === false && !JSON.stringify(D.state.players || []).includes('"Computer"'), 'Carrom (ohne Computer-Gegner) wartet normal auf einen Mitspieler');
  D.close();
};
