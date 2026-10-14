// Minigolf: Reihenfolge, Zuschauen (Live-Zielen + Flugbahn), Wasser, 18 Bahnen, Revanche, Aufgeben
const C = require('../games/minigolf/public/course.js');

module.exports = async ({ ok, get, pair, wait }) => {
  const [a, b] = await pair('minigolf');
  ok(a.state.you === 0 && b.state.you === 1 && a.state.hole === 0, 'Anna Platz 0, Ben Platz 1, Bahn 1');
  ok(a.state.turn === 0, 'Runde 1: Anna beginnt Bahn 1');

  await b.act({ t: 'shoot', a: -Math.PI / 2, p: 0.5 });
  ok(/dran/.test(b.lastError()?.msg || '') && a.state.cur === 0, 'Ben darf nicht schlagen, wenn Anna dran ist');
  await a.act({ t: 'shoot', a: 0, p: 2 });
  ok(/Ungültig/.test(a.lastError()?.msg || ''), 'Kraft über 100 % wird abgelehnt');

  // Live-Zielen kommt beim Mitspieler an, aber nicht beim Absender, und ändert keinen Zustand
  a.send({ type: 'live', data: { aim: { a: -1.2, p: 0.4 } } }); await wait(80);
  const live = b.msgs.filter((m) => m.type === 'live').pop();
  ok(live && live.seat === 0 && live.data.aim.p === 0.4, 'Ben sieht live, wie Anna zielt');
  ok(!a.msgs.some((m) => m.type === 'live'), 'Anna bekommt ihr eigenes Zielen nicht zurück');

  // Schlag: beide bekommen dieselbe Flugbahn
  const tee = C.HOLES[0].tee;
  await a.act({ t: 'shoot', a: -Math.PI / 2, p: 0.35 });
  const sa = a.state.shot, sb = b.state.shot;
  ok(sa && sb && sa.id === sb.id && sa.path.length > 10 && sa.path.join() === sb.path.join(), `Beide sehen dieselbe Flugbahn (${sa.path.length / 2} Bilder)`);
  ok(sa.from[0] === tee[0] && sa.from[1] === tee[1] && a.state.cur === 1, 'Schlag 1 vom Abschlag gezählt');

  // Bot: zielt aufs Loch, Kraft nach Entfernung
  const bot = (s) => {
    const h = C.HOLES[s.hole], [x, y] = s.ball;
    const d = Math.hypot(h.cup[0] - x, h.cup[1] - y);
    return { t: 'shoot', a: Math.atan2(h.cup[1] - y, h.cup[0] - x) + (Math.random() - 0.5) * 0.15, p: Math.min(1, 0.12 + d / 700) };
  };
  const by = (seat) => (seat === 0 ? a : b);
  let guard = 0, sawSwitch = false, sawWater = false, firsts = [0];
  while (!a.state.over && guard++ < 400) {
    const s = a.state;
    if (s.cur === 0 && s.strokes[0][s.hole] == null && s.strokes[1][s.hole] == null) firsts[s.hole] = s.turn;
    const before = s.turn, hole = s.hole;
    await by(s.turn).act(bot(s));
    if (a.state.shot.outcome === 'water' && !sawWater) { sawWater = true; ok(a.state.ball.join() === a.state.shot.from.join(), 'Wasser: Ball zurück an die Schlagstelle'); }
    if (a.state.hole === hole && a.state.turn !== before) sawSwitch = true;
  }
  await wait(80);
  const s = a.state;
  ok(s.over && s.strokes.every((row) => row.every((v) => v >= 1 && v <= 7)), `18 Bahnen gespielt – Anna ${s.totals[0]}, Ben ${s.totals[1]} (Par ${C.PAR})`);
  ok(sawSwitch, 'Nach dem Einlochen spielt der andere dieselbe Bahn');
  ok(firsts[0] === 0 && firsts[1] === 1 && firsts[2] === 0, 'Wer anfängt, wechselt von Bahn zu Bahn');
  if (!sawWater) ok(true, '(kein Wasser getroffen – Zufall)');
  const w = s.totals[0] === s.totals[1] ? -1 : s.totals[0] < s.totals[1] ? 0 : 1;
  ok(s.winner === w && (w === -1 ? s.draws === 1 : s.score[w] === 1), 'Weniger Schläge gewinnt, Stand gezählt');
  await a.act({ t: 'shoot', a: 0, p: 0.5 });
  ok(/vorbei/.test(a.lastError()?.msg || ''), 'Nach Bahn 18 kein Schlag mehr');

  // Höchstzahl: 6 Schläge gegen die Bande -> 7
  await a.rematch(); await b.rematch();
  ok(!a.state.over && a.state.turn === 1 && a.state.hole === 0, 'Revanche: Ben beginnt');
  for (let i = 0; i < 6; i++) await b.act({ t: 'shoot', a: Math.PI / 2, p: 0.05 });
  ok(a.state.strokes[1][0] === 7 && a.state.turn === 0, 'Nach 6 Schlägen ohne Loch zählt die Bahn 7, dann ist Anna dran');

  a.send({ type: 'resign' }); await wait(120);
  ok(b.state.over && b.state.winner === 1, 'Aufgeben: Ben gewinnt');
  const h = JSON.parse((await get(`/api/history?id=${b.id}&game=minigolf`)).body);
  ok(h.length === 2 && h[0].result === 'win' && h[0].reason === 'resign', 'Historie: 2 Runden, letzte durch Aufgabe');
  ok((await get('/minigolf/')).body.includes('course.js'), 'Spielseite wird ausgeliefert');
  ok((await get('/')).body.includes('/minigolf/'), 'Kachel auf der Startseite');
  a.close(); b.close();
};
