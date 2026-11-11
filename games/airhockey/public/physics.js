// Airhockey – Tisch und Physik. Läuft auf dem Server (maßgeblich) und im Browser (Vorhersage).
//
// Tisch hochkant, 500 × 900 Einheiten. Spieler 0 verteidigt das Tor unten (y = H), Spieler 1 oben (y = 0).
// Jeder darf seinen Schläger nur in der eigenen Hälfte bewegen. Wer zuerst 7 Tore hat, gewinnt.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AirPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 500, H = 900;
  const PUCK_R = 22, PAD_R = 36;
  const GOAL_W = 170;                 // Toröffnung
  const GX1 = (W - GOAL_W) / 2, GX2 = (W + GOAL_W) / 2;
  const WIN = 7;
  const MAX_PUCK = 2000;              // Einheiten pro Sekunde (Tisch ≈ 0,45 s von Tor zu Tor)
  const MAX_PAD = 4200;
  const WALL_E = 0.9, PAD_E = 0.92;   // Abprallen
  const DRAG = 0.22;                  // Luftkissen: fast reibungsfrei
  const SUB = 4;                      // Teilschritte pro Takt gegen "Durchtunneln"

  // Schlägerbereich einer Seite (Mittelpunkt bleibt in der eigenen Hälfte)
  function clampPad(seat, x, y) {
    x = Math.max(PAD_R, Math.min(W - PAD_R, x));
    y = seat === 0 ? Math.max(H / 2, Math.min(H - PAD_R, y)) : Math.max(PAD_R, Math.min(H / 2, y));
    return [x, y];
  }

  function newPads() {
    return [0, 1].map((s) => ({ x: W / 2, y: s === 0 ? H - 110 : 110, vx: 0, vy: 0, tx: W / 2, ty: s === 0 ? H - 110 : 110 }));
  }

  // Puck ruhend vor dem Spieler `seat` (Anstoß bzw. nach Gegentor)
  function placePuck(seat) {
    return { x: W / 2, y: seat === 0 ? H * 0.72 : H * 0.28, vx: 0, vy: 0 };
  }

  function collidePoint(p, px, py) {
    const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
    if (d >= PUCK_R || d === 0) return false;
    const nx = dx / d, ny = dy / d;
    p.x = px + nx * PUCK_R; p.y = py + ny * PUCK_R;
    const vn = p.vx * nx + p.vy * ny;
    if (vn < 0) { p.vx -= (1 + WALL_E) * vn * nx; p.vy -= (1 + WALL_E) * vn * ny; }
    return true;
  }

  function collidePad(p, pad) {
    const dx = p.x - pad.x, dy = p.y - pad.y, d = Math.hypot(dx, dy), min = PUCK_R + PAD_R;
    if (d >= min) return false;
    const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
    p.x = pad.x + nx * min; p.y = pad.y + ny * min;
    const rvx = p.vx - pad.vx, rvy = p.vy - pad.vy, vn = rvx * nx + rvy * ny;
    if (vn < 0) { p.vx -= (1 + PAD_E) * vn * nx; p.vy -= (1 + PAD_E) * vn * ny; }
    return true;
  }

  // Einen Takt weiterrechnen. pads[i].tx/ty = gewünschte Position (vom Spieler).
  // Rückgabe: { goal: 0|1 (wer hat getroffen) , hit: true } oder null
  function step(puck, pads, dt, opts = {}) {
    const h = dt / SUB;
    let ev = null;
    // Schlägergeschwindigkeit aus der Bewegung zum Ziel (begrenzt)
    const start = pads.map((pd) => [pd.x, pd.y]);
    const want = pads.map((pd, s) => {
      let [tx, ty] = clampPad(s, pd.tx, pd.ty);
      const dx = tx - pd.x, dy = ty - pd.y, d = Math.hypot(dx, dy), max = MAX_PAD * dt;
      if (d > max) { tx = pd.x + dx / d * max; ty = pd.y + dy / d * max; }
      pd.vx = (tx - pd.x) / dt; pd.vy = (ty - pd.y) / dt;
      return [tx, ty];
    });
    for (let k = 1; k <= SUB; k++) {
      pads.forEach((pd, s) => { pd.x = start[s][0] + (want[s][0] - start[s][0]) * k / SUB; pd.y = start[s][1] + (want[s][1] - start[s][1]) * k / SUB; });
      const f = Math.exp(-DRAG * h);
      puck.vx *= f; puck.vy *= f;
      puck.x += puck.vx * h; puck.y += puck.vy * h;
      // Schläger zuerst, danach die Banden – so kann ein Schläger den Puck nie aus dem Tisch drücken
      for (const pd of pads) if (collidePad(puck, pd)) ev = ev || { hit: true };
      // Seitenbanden
      if (puck.x < PUCK_R) { puck.x = PUCK_R; if (puck.vx < 0) puck.vx = -puck.vx * WALL_E; }
      if (puck.x > W - PUCK_R) { puck.x = W - PUCK_R; if (puck.vx > 0) puck.vx = -puck.vx * WALL_E; }
      // Stirnbanden mit Toröffnung
      const inMouth = puck.x > GX1 && puck.x < GX2;
      if (!inMouth) {
        if (puck.y < PUCK_R) { puck.y = PUCK_R; if (puck.vy < 0) puck.vy = -puck.vy * WALL_E; }
        if (puck.y > H - PUCK_R) { puck.y = H - PUCK_R; if (puck.vy > 0) puck.vy = -puck.vy * WALL_E; }
      }
      // Torpfosten
      collidePoint(puck, GX1, 0); collidePoint(puck, GX2, 0); collidePoint(puck, GX1, H); collidePoint(puck, GX2, H);
      // Tempo begrenzen
      const sp = Math.hypot(puck.vx, puck.vy);
      if (sp > MAX_PUCK) { puck.vx *= MAX_PUCK / sp; puck.vy *= MAX_PUCK / sp; }
      // Tor?
      if (!opts.noGoal) {
        if (puck.y < -PUCK_R * 0.2 && inMouth) return { goal: 0 };   // ins obere Tor -> Spieler 0 trifft
        if (puck.y > H + PUCK_R * 0.2 && inMouth) return { goal: 1 };
      }
    }
    return ev;
  }

  return { W, H, PUCK_R, PAD_R, GOAL_W, GX1, GX2, WIN, MAX_PUCK, clampPad, newPads, placePuck, step };
});
