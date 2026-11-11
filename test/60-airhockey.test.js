// Airhockey: Physik direkt (schnell) + Echtzeit über den Server (Takt, Eingaben, Tor, Pause, Ende)
const F = require('../games/airhockey/public/physics.js');
const G = require('../games/airhockey/game.js');

module.exports = async ({ ok, get, pair, wait }) => {
  // ---------- Physik ----------
  const pads = F.newPads(); pads.forEach((p) => { p.x = p.tx = 460; });
  let puck = { x: 250, y: 450, vx: 0, vy: -1500 }, ev = null, n = 0;
  while (!(ev && 'goal' in ev) && n++ < 200) ev = F.step(puck, pads, 1 / 60);
  ok(ev && ev.goal === 0, 'Schuss ins obere Tor zählt für Spieler 0');
  puck = { x: 60, y: 450, vx: 0, vy: -1500 }; n = 0; ev = null;
  for (; n < 120; n++) { ev = F.step(puck, pads, 1 / 60); if (ev && 'goal' in ev) break; }
  ok(!(ev && 'goal' in ev) && puck.y >= F.PUCK_R - 0.01, 'Neben dem Tor prallt der Puck von der Bande ab');
  const [cx, cy] = F.clampPad(0, 250, 100);
  ok(cy === F.H / 2 && cx === 250, 'Schläger bleibt in der eigenen Hälfte');
  // Schläger trifft Puck -> Puck fliegt, Tempo begrenzt, nie außerhalb des Tisches
  const s = G.start(null, 1), core = { players: [{ online: true }, { online: true }] };
  let maxSp = 0, out = 0;
  let aim = F.W / 2;
  for (let i = 0; i < 60 * 600 && s.phase !== 'over'; i++) {
    // Spieler 0 fährt hinter den Puck und schießt aufs obere Tor, Spieler 1 bleibt in der Ecke
    if (Math.random() < .02) aim = F.W / 2 + (Math.random() - .5) * 400;
    const p = s.puck, dx = aim - p.x, dy = -40 - p.y, d = Math.hypot(dx, dy);
    const own = p.y > F.H / 2;
    G.input(s, 0, own ? { x: p.x - dx / d * 40, y: p.y - dy / d * 40 } : { x: F.W / 2, y: F.H - 70 });
    G.input(s, 1, { x: 60, y: 60 });
    G.tick(s, 1 / 60, core);
    if (s.phase === 'play') {
      maxSp = Math.max(maxSp, Math.hypot(s.puck.vx, s.puck.vy));
      const mouth = s.puck.x > F.GX1 - F.PUCK_R && s.puck.x < F.GX2 + F.PUCK_R;
      out = Math.max(out, F.PUCK_R - s.puck.x, s.puck.x - (F.W - F.PUCK_R), mouth ? 0 : F.PUCK_R - s.puck.y, mouth ? 0 : s.puck.y - (F.H - F.PUCK_R));
    }
  }
  ok(s.phase === 'over' && s.winner === 0 && s.score[0] === 7, `Partie endet bei 7 Toren (${s.score.join(':')})`);
  ok(maxSp <= F.MAX_PUCK + 1 && out < 0.5, `Tempo ≤ ${F.MAX_PUCK}, Puck bleibt im Tisch (max. Überstand ${out.toFixed(2)})`);
  const pz = G.start(null, 1); pz.phase = 'play';
  G.tick(pz, 1 / 60, { players: [{ online: true }, { online: false }] });
  ok(pz.phase === 'paused', 'Mitspieler weg -> Pause');
  G.tick(pz, 1 / 60, core);
  ok(pz.phase === 'ready', 'Mitspieler zurück -> Countdown');
  const zt = G.start(null, 1); zt.phase = 'play'; zt.puck = { x: 250, y: 200, vx: 0, vy: 0 };
  for (let i = 0; i < 60 * 8 && zt.phase === 'play'; i++) G.tick(zt, 1 / 60, core);
  ok(zt.phase === 'ready' && zt.note === 'time' && zt.puck.y > F.H / 2, 'Zeitregel: Puck nach 7 s in einer Hälfte wechselt die Seite');

  // ---------- Über den Server ----------
  const [A, B] = await pair('airhockey');
  ok(A.state.you === 0 && B.state.you === 1 && A.state.phase === 'ready', 'Beide da: Countdown startet');
  const ticks = () => A.msgs.filter((m) => m.type === 'tick').length;
  const t0 = ticks(); await wait(500); const rate = (ticks() - t0) * 2;
  ok(rate >= 40 && rate <= 70, `Momentaufnahmen pro Sekunde: ${rate}`);
  const last = () => A.msgs.filter((m) => m.type === 'tick').at(-1).d;
  ok(JSON.stringify(last()).length < 200, `Momentaufnahme klein (${JSON.stringify(last()).length} Zeichen)`);
  A.send({ type: 'input', d: { x: 120, y: 700 } }); await wait(150);
  ok(Math.abs(last().a[0] - 120) < 2 && Math.abs(last().a[1] - 700) < 2, 'Eingabe bewegt den eigenen Schläger');
  B.send({ type: 'input', d: { x: 250, y: 880 } }); await wait(150);
  ok(last().b[1] === F.H / 2, 'Schläger kann nicht in die fremde Hälfte');

  // Warten bis "play", dann Tor schießen
  while (last().ph !== 'play') await wait(50);
  let goal = false;
  for (let i = 0; i < 400 && !goal; i++) {
    const p = last().p, dx = F.W / 2 - p[0], dy = -40 - p[1], d = Math.hypot(dx, dy);
    A.send({ type: 'input', d: p[1] > F.H / 2 ? { x: p[0] - dx / d * 40, y: p[1] - dy / d * 40 } : { x: F.W / 2, y: F.H - 70 } });
    B.send({ type: 'input', d: { x: 40, y: 40 } });
    await wait(20);
    goal = A.state.score[0] > 0;
  }
  ok(goal && A.state.phase === 'goal' && A.state.lastGoal === 0, 'Tor: voller Zustand mit Spielstand 1:0 kommt bei beiden an');
  ok(B.state.score[0] === 1, 'Mitspieler sieht das Tor auch');
  A.send({ type: 'resign' }); await wait(120);
  ok(B.state.phase === 'over' && B.state.winner === 1, 'Aufgeben beendet die Partie');
  const tAfter = ticks(); await wait(200);
  ok(ticks() === tAfter, 'Nach dem Ende keine Takte mehr');
  const h = JSON.parse((await get(`/api/history?id=${B.id}&game=airhockey`)).body);
  ok(h.length === 1 && h[0].result === 'win', 'Historie: Sieg für Ben');
  await A.rematch(); await B.rematch(); await wait(100);
  ok(A.state.phase === 'ready' && A.state.score.join() === '0,0' && A.state.snap.p[1] < F.H / 2, 'Revanche: neuer Countdown, Anstoß für Ben');
  A.close(); B.close();
};
