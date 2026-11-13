// Carrom: Physik und Regeln (direkt) + Partie über den Server
const C = require('../games/carrom/public/board.js');

const solo = (pieces) => ({ ...C.newGame(), pieces });
const coin = (id, k, x, y) => ({ id, k, x, y, on: true });
// Schuss vom Striker (Seite 0, unten) genau auf (tx, ty)
const at = (g, side, x, tx, ty, power) => C.shoot(g, side, { x, angle: Math.atan2(ty - C.baseY(side), tx - x), power });

module.exports = async ({ ok, get, pair, wait }) => {
  // ---------- Aufstellung ----------
  let g = C.newGame();
  ok(g.pieces.length === 19 && g.pieces.filter((p) => p.k === 'w').length === 9 && g.pieces.filter((p) => p.k === 'b').length === 9, '9 helle, 9 dunkle Steine + Königin');
  let overlap = 0;
  for (const a of g.pieces) for (const b of g.pieces) if (a.id < b.id && Math.hypot(a.x - b.x, a.y - b.y) < 2 * C.COIN_R - 0.01) overlap++;
  ok(overlap === 0, 'Keine Überlappung in der Grundaufstellung');

  // ---------- Physik: Stein in die Ecke ----------
  // Stein liegt auf der Linie Striker (Grundlinie, x = 560) -> Tasche oben rechts
  const P = C.POCKETS[1], SX = 560, SY = C.baseY(0);
  const cx = SX + (P[0] - SX) * 0.62, cy = SY + (P[1] - SY) * 0.62, ang = Math.atan2(P[1] - SY, P[0] - SX);
  g = solo([coin(1, 'w', cx, cy), coin(2, 'b', 100, 500)]);
  let r = C.simulate(g.pieces, 0, SX, ang, 0.8);
  ok(r.sunk.includes(1), 'Gerader Stoß versenkt den Stein in der Ecktasche');
  ok(r.frames.length > 5 && JSON.stringify(r.frames).length < 60000, `Ablauf für die Animation: ${r.frames.length} Bilder, ${JSON.stringify(r.frames).length} Zeichen`);
  ok(r.end.every((p) => !p.on || (p.x >= C.COIN_R - .01 && p.x <= C.SIZE - C.COIN_R + .01 && p.y >= C.COIN_R - .01 && p.y <= C.SIZE - C.COIN_R + .01)), 'Nichts verlässt das Brett');

  // ---------- Regeln ----------
  // eigener Stein versenkt -> nochmal
  g = solo([coin(0, 'q', 500, 500), coin(1, 'w', cx, cy), coin(2, 'b', 120, 520)]);
  C.shoot(g, 0, { x: SX, angle: ang, power: .5 });
  ok(g.out.w === 1 && g.turn === 0 && g.last.again, 'Eigener Stein versenkt: nochmal dran');
  // Fehlschuss -> Wechsel
  at(g, 0, 500, 500, 140, .2);
  ok(g.turn === 1, 'Nichts versenkt: Mitspieler ist dran');
  // Striker liegt auf einem Stein
  g = solo([coin(1, 'w', 500, C.baseY(0))]);
  ok(/Striker liegt auf einem Stein/.test(C.shoot(g, 0, { x: 500, angle: -1.5, power: .5 }) || ''), 'Striker auf einem Stein: abgelehnt');
  ok(/Grundlinie/.test(C.shoot(g, 0, { x: 100, angle: -1.5, power: .5 }) || ''), 'Striker außerhalb der Grundlinie: abgelehnt');
  // Foul: Striker direkt in die Tasche unten rechts, ein versenkter eigener Stein kommt zurück
  g = solo([coin(1, 'w', 500, 500), coin(2, 'b', 300, 300)]); g.pieces[0].on = false; g.out.w = 1;
  const P3 = C.POCKETS[3];
  C.shoot(g, 0, { x: C.BASE_X2, angle: Math.atan2(P3[1] - C.baseY(0), P3[0] - C.BASE_X2), power: .5 });
  ok(g.last.strikerSunk && g.out.w === 0 && g.pieces[0].on && g.turn === 1, 'Foul: Striker versenkt -> Stein zurück, Wechsel');
  // Königin: versenken ohne abzudecken -> zurück
  g = solo([coin(0, 'q', cx, cy), coin(2, 'b', 120, 520)]);
  C.shoot(g, 0, { x: SX, angle: ang, power: .5 });
  ok(g.queen === 'pending' && g.pending === 0 && g.turn === 0, 'Königin versenkt: abdecken, nochmal dran');
  at(g, 0, 500, 500, 140, .2);
  ok(g.queen === 'board' && g.pieces[0].on && g.turn === 1, 'Nicht abgedeckt: Königin zurück in die Mitte');
  // Sieg: letzter Stein bei abgedeckter Königin
  g = solo([coin(0, 'q', 0, 0), coin(1, 'w', cx, cy), coin(2, 'b', 120, 520)]); g.pieces[0].on = false; g.queen = 'covered'; g.queenBy = 0; g.out.w = 8;
  C.shoot(g, 0, { x: SX, angle: ang, power: .5 });
  ok(g.winner === 0 && C.points(g, 0) === 9 + 3, 'Letzter Stein + Königin abgedeckt: gewonnen, 9 übrige + 3 = 12 Punkte');
  // Letzter Stein, Königin noch auf dem Brett -> zurück
  g = solo([coin(0, 'q', 120, 700), coin(1, 'w', cx, cy), coin(2, 'b', 120, 520)]); g.out.w = 8;
  C.shoot(g, 0, { x: SX, angle: ang, power: .5 });
  ok(g.winner === -2 && g.out.w === 8 && g.pieces[1].on && g.turn === 1, 'Letzter Stein vor der Königin: kommt zurück');

  // Zufallspartien: Bilanz stimmt immer, Partien enden
  let ended = 0, balanceOk = true;
  for (let k = 0; k < 12; k++) {
    const gg = C.newGame();
    while (gg.winner === -2) {
      const side = gg.turn, color = side ? 'b' : 'w';
      const own = gg.pieces.filter((p) => p.on && p.k === color), all = gg.pieces.filter((p) => p.on);
      const t = (own.length ? own : all)[Math.floor(Math.random() * Math.max(1, (own.length ? own : all).length))] || { x: 500, y: 500 };
      let x = C.BASE_X1 + Math.random() * (C.BASE_X2 - C.BASE_X1), n = 0;
      while (C.strikerBlocked(gg.pieces, side, x) && n++ < 60) x = C.BASE_X1 + Math.random() * (C.BASE_X2 - C.BASE_X1);
      if (C.shoot(gg, side, { x, angle: Math.atan2(t.y - C.baseY(side), t.x - x) + (Math.random() - .5) * .15, power: .4 + Math.random() * .6 })) { gg.turn = 1 - side; continue; }
      const cnt = { w: 0, b: 0 }; gg.pieces.forEach((p) => { if (p.on && p.k !== 'q') cnt[p.k]++; });
      if (cnt.w + gg.out.w !== 9 || cnt.b + gg.out.b !== 9) balanceOk = false;
    }
    ended++;
  }
  ok(ended === 12 && balanceOk, 'Zufallspartien enden, Steinbilanz stimmt nach jedem Schuss');

  // ---------- Über den Server ----------
  const [A, B] = await pair('carrom');
  ok(A.state.you === 0 && B.state.you === 1 && A.state.game.turn === 0, 'Anna Bein (unten, beginnt), Ben Wenge');
  await B.act({ t: 'shot', x: 500, angle: Math.PI / 2, power: .5 });
  ok(/nicht am Zug/.test(B.lastError()?.msg || ''), 'Wenge kann nicht zuerst schießen');
  await A.act({ t: 'shot', x: 500, angle: -Math.PI / 2, power: 1 });
  await wait(80);
  ok(A.state.game.shots === 1 && B.state.game.last && B.state.game.last.frames.length > 3, 'Eröffnungsstoß: Ablauf kommt bei beiden an');
  // Live-Zielen kommt beim Mitspieler an
  const p = A.state.game.turn === 0 ? A : B, o = p === A ? B : A;
  p.send({ type: 'live', data: { x: 400, a: -1.2, p: .5 } }); await wait(80);
  ok(o.msgs.some((m) => m.type === 'live' && m.data.x === 400), 'Zielen wird live übertragen');
  A.send({ type: 'resign' }); await wait(120);
  ok(B.state.game.winner === 1 && B.state.game.reason === 'resign', 'Aufgeben: Ben gewinnt');
  const h = JSON.parse((await get(`/api/history?id=${B.id}&game=carrom`)).body);
  ok(h.length === 1 && h[0].result === 'win', 'Historie: Sieg für Ben');
  await A.rematch(); await B.rematch();
  ok(A.state.you === 1 && B.state.you === 0 && A.state.game.shots === 0, 'Revanche: Farben getauscht, Ben beginnt');
  A.close(); B.close();
};
