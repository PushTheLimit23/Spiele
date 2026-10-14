// Minigolf – 18 Bahnen und Physik.
// Wird vom Server UND vom Browser benutzt (eine Quelle der Wahrheit).
// Der Server rechnet jeden Schlag und schickt die Flugbahn an beide Spieler,
// so sehen beide exakt denselben Ball rollen.
//
// Koordinaten: 360 × 640 (Hochformat), x nach rechts, y nach unten.
(function (root) {
  const W = 360, H = 640;
  const BALL = 6;          // Radius Ball
  const CUP = 10;          // Radius Loch
  const MAX_SPEED = 645;   // Einheiten pro Sekunde bei voller Kraft
  const MAX_STROKES = 6;   // danach zählt die Bahn 7
  const DT = 1 / 240;      // Rechenschritt
  const SAMPLE = 4;        // jeder 4. Schritt landet in der Flugbahn (= 60 Bilder/s)
  const MAX_TIME = 14;     // Sekunden, danach wird der Ball angehalten

  const FRICTION = { grass: 150, sand: 700 };
  const DRAG = 0.35;       // zusätzlicher Luft-/Filzwiderstand pro Sekunde
  const BOUNCE = 0.74;     // Banden geben 74 % der Geschwindigkeit zurück
  const BUMPER = 1.05;     // Pilze sind federnd
  const SINK_SPEED = 300;  // langsamer als das = Ball fällt ins Loch

  // ---------- Hilfen zum Bauen ----------
  const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  const box = (x1, y1, x2, y2) => rect(x1, y1, x2, y2);

  // ---------- Die 18 Bahnen ----------
  // outline: Bande außen (Polygon) · walls: Hindernisse (Polygone) · bumpers: [x, y, r]
  // sand / water: Polygone · slopes: { poly, g: [gx, gy] } (Gefälle in Richtung g)
  const HOLES = [
    { name: 'Aufwärmen', par: 2, tee: [180, 545], cup: [180, 115],
      outline: rect(70, 50, 290, 600) },

    { name: 'Knick', par: 3, tee: [118, 545], cup: [250, 125],
      outline: [[60, 600], [175, 600], [175, 230], [300, 230], [300, 60], [60, 60]] },

    { name: 'Slalom', par: 3, tee: [180, 560], cup: [180, 105],
      outline: rect(60, 50, 300, 605),
      walls: [box(60, 425, 215, 441), box(145, 265, 300, 281)] },

    { name: 'Pilze', par: 2, tee: [180, 560], cup: [180, 100],
      outline: rect(60, 50, 300, 605),
      bumpers: [[180, 330, 22], [118, 245, 17], [242, 245, 17], [110, 420, 14], [250, 420, 14]] },

    { name: 'Sandkasten', par: 3, tee: [180, 560], cup: [240, 105],
      outline: rect(60, 50, 300, 605),
      sand: [rect(108, 255, 300, 385), rect(195, 150, 300, 200)] },

    { name: 'Brücke', par: 3, tee: [180, 560], cup: [180, 105],
      outline: rect(60, 50, 300, 605),
      water: [rect(60, 300, 154, 385), rect(206, 300, 300, 385)] },

    { name: 'Hang', par: 2, tee: [180, 560], cup: [250, 105],
      outline: rect(60, 50, 300, 605),
      slopes: [{ poly: rect(60, 215, 300, 425), g: [-120, 0] }] },

    { name: 'Burg', par: 3, tee: [180, 560], cup: [180, 252],
      outline: rect(60, 50, 300, 605),
      walls: [box(138, 215, 150, 294), box(210, 215, 222, 294), box(138, 282, 222, 294)] },

    { name: 'Zickzack', par: 3, tee: [140, 550], cup: [222, 112],
      outline: [[60, 600], [220, 600], [220, 440], [300, 440], [300, 60], [140, 60], [140, 240], [60, 240]] },

    { name: 'Diagonale', par: 2, tee: [105, 560], cup: [255, 100],
      outline: [[60, 600], [150, 600], [300, 185], [300, 55], [210, 55], [60, 470]] },

    { name: 'Flipper', par: 3, tee: [180, 570], cup: [180, 85],
      outline: rect(60, 45, 300, 610),
      bumpers: [[120, 470, 13], [240, 470, 13], [180, 400, 13], [110, 320, 13], [250, 320, 13],
        [180, 250, 13], [125, 175, 13], [235, 175, 13]] },

    { name: 'Seeufer', par: 3, tee: [180, 565], cup: [130, 110],
      outline: rect(60, 50, 300, 605),
      water: [rect(60, 200, 250, 245)] },

    { name: 'Kreisel', par: 3, tee: [180, 520], cup: [180, 150],
      outline: [[118, 70], [242, 70], [330, 158], [330, 482], [242, 570], [118, 570], [30, 482], [30, 158]],
      bumpers: [[180, 330, 42]] },

    { name: 'Treppe', par: 3, tee: [115, 552], cup: [246, 112],
      outline: [[60, 600], [170, 600], [170, 480], [240, 480], [240, 360], [300, 360], [300, 60],
        [190, 60], [190, 250], [120, 250], [120, 370], [60, 370]] },

    { name: 'Rampe', par: 2, tee: [180, 565], cup: [180, 110],
      outline: rect(100, 45, 260, 605),
      slopes: [{ poly: rect(100, 200, 260, 420), g: [0, 210] }] },

    { name: 'Nadelöhr', par: 2, tee: [180, 565], cup: [180, 100],
      outline: rect(60, 50, 300, 605),
      walls: [box(60, 320, 158, 336), box(202, 320, 300, 336)],
      sand: [rect(60, 170, 130, 250), rect(230, 170, 300, 250)] },

    { name: 'Haarnadel', par: 4, tee: [116, 560], cup: [244, 545],
      outline: [[60, 605], [60, 110], [120, 50], [240, 50], [300, 110], [300, 605]],
      walls: [box(171, 225, 189, 605)],
      slopes: [{ poly: rect(189, 330, 300, 605), g: [0, 90] }] },

    { name: 'Finale', par: 3, tee: [180, 570], cup: [180, 90],
      outline: rect(60, 45, 300, 610),
      water: [rect(60, 255, 118, 400), rect(242, 255, 300, 400)],
      bumpers: [[180, 330, 20]],
      sand: [rect(132, 140, 228, 178)] },
  ];

  // ---------- Geometrie ----------
  function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Alle Banden einer Bahn als Strecken [x1, y1, x2, y2] (einmal berechnet)
  const segCache = new Map();
  function segments(hole) {
    if (segCache.has(hole)) return segCache.get(hole);
    const out = [];
    for (const poly of [hole.outline, ...(hole.walls || [])]) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        out.push([a[0], a[1], b[0], b[1]]);
      }
    }
    segCache.set(hole, out);
    return out;
  }

  // ---------- Physik: einen Schlag durchrechnen ----------
  // angle in Bogenmaß (0 = nach rechts, -π/2 = nach oben), power 0..1
  // Ergebnis: { path: [x0,y0,x1,y1,…], end: [x, y], holed, water }
  function simulate(hole, from, angle, power) {
    const segs = segments(hole);
    const bumpers = hole.bumpers || [];
    let x = from[0], y = from[1];
    const speed = MAX_SPEED * Math.pow(Math.max(0, Math.min(1, power)), 1.15);
    let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    const path = [r1(x), r1(y)];
    const [cx, cy] = hole.cup;
    let holed = false, water = false;
    const steps = Math.round(MAX_TIME / DT);

    for (let step = 1; step <= steps; step++) {
      // Untergrund: Sand bremst stark, Gefälle zieht den Ball
      let mu = FRICTION.grass;
      if (hole.sand && hole.sand.some((p) => inPoly(x, y, p))) mu = FRICTION.sand;
      if (hole.slopes) for (const s of hole.slopes) if (inPoly(x, y, s.poly)) { vx += s.g[0] * DT; vy += s.g[1] * DT; }

      // Loch: leichte Mulde zieht den Ball zur Mitte
      const dxC = cx - x, dyC = cy - y, dC = Math.hypot(dxC, dyC);
      if (dC < CUP + BALL) { vx += dxC * 14 * DT; vy += dyC * 14 * DT; }

      const v = Math.hypot(vx, vy);
      if (v > 0) {
        const nv = Math.max(0, v - mu * DT) * (1 - DRAG * DT);
        vx *= nv / v; vy *= nv / v;
      }

      x += vx * DT; y += vy * DT;

      // Banden und Hindernisse
      for (let pass = 0; pass < 2; pass++) {
        for (const [x1, y1, x2, y2] of segs) {
          const ex = x2 - x1, ey = y2 - y1;
          const len2 = ex * ex + ey * ey;
          let t = len2 ? ((x - x1) * ex + (y - y1) * ey) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = x1 + ex * t, qy = y1 + ey * t;
          let nx = x - qx, ny = y - qy;
          const d = Math.hypot(nx, ny);
          if (d >= BALL || d === 0) continue;
          nx /= d; ny /= d;
          x = qx + nx * BALL; y = qy + ny * BALL;
          const vn = vx * nx + vy * ny;
          if (vn < 0) { vx -= (1 + BOUNCE) * vn * nx; vy -= (1 + BOUNCE) * vn * ny; }
        }
        for (const [bx, by, br] of bumpers) {
          let nx = x - bx, ny = y - by;
          const d = Math.hypot(nx, ny), min = br + BALL;
          if (d >= min || d === 0) continue;
          nx /= d; ny /= d;
          x = bx + nx * min; y = by + ny * min;
          const vn = vx * nx + vy * ny;
          if (vn < 0) { vx -= (1 + BUMPER) * vn * nx; vy -= (1 + BUMPER) * vn * ny; }
        }
      }

      const sp = Math.hypot(vx, vy);
      if (Math.hypot(cx - x, cy - y) < CUP - 2 && sp < SINK_SPEED) { holed = true; x = cx; y = cy; }
      else if (hole.water && hole.water.some((p) => inPoly(x, y, p))) water = true;

      const stop = holed || water || (sp < 3 && !onSlope(hole, x, y)) || (sp < 0.5) || step === steps;
      if (stop || step % SAMPLE === 0) path.push(r1(x), r1(y));
      if (stop) break;
    }
    return { path, end: [r2(x), r2(y)], holed, water };
  }

  function onSlope(hole, x, y) {
    return !!hole.slopes && hole.slopes.some((s) => inPoly(x, y, s.poly));
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  const PAR = HOLES.reduce((s, h) => s + h.par, 0);
  const C = { W, H, BALL, CUP, MAX_STROKES, HOLES, PAR, simulate, inPoly, segments };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.Minigolf = C;
})(this);
