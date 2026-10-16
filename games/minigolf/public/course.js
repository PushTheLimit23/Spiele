// Minigolf – 36 Bahnen (Platz Klassik und Abenteuer) und Physik.
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

  const FRICTION = { grass: 150, sand: 700, ice: 32 };
  const DRAG = 0.35;       // zusätzlicher Luft-/Filzwiderstand pro Sekunde
  const BOUNCE = 0.74;     // Banden geben 74 % der Geschwindigkeit zurück
  const BUMPER = 1.05;     // Pilze sind federnd
  const SINK_SPEED = 300;  // langsamer als das = Ball fällt ins Loch

  // ---------- Hilfen zum Bauen ----------
  const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  const box = (x1, y1, x2, y2) => rect(x1, y1, x2, y2);
  // schräger Balken von (x1,y1) nach (x2,y2), Dicke w
  const bar = (x1, y1, x2, y2, w) => {
    const l = Math.hypot(x2 - x1, y2 - y1), nx = (-(y2 - y1) / l) * (w / 2), ny = ((x2 - x1) / l) * (w / 2);
    return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
  };

  // ---------- Die Bahnen ----------
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

    // ======== Platz 2: Abenteuer (Bahnen 19–36) ========
    // Neue Elemente: ice (Eis, kaum Reibung) · boosts { poly, a } (Förderband) · portals { a, b }
    // hills { c, r, k } (k > 0 Hügel, k < 0 Mulde) · spinners (Windmühle) · sliders (Schiebetor)

    { name: 'Teleporter', par: 3, tee: [180, 565], cup: [235, 110],
      outline: rect(60, 50, 300, 605),
      walls: [box(60, 330, 300, 346)],
      portals: [{ a: [245, 430], b: [115, 255] }],
      sand: [rect(60, 150, 140, 200)] },

    { name: 'Windmühle', par: 4, tee: [180, 565], cup: [180, 105],
      outline: rect(100, 50, 260, 605),
      walls: [box(100, 330, 164, 346), box(196, 330, 260, 346)],
      spinners: [{ c: [180, 280], len: 50, arms: 4, w: 1.1, ph: 0 }] },

    { name: 'Eisbahn', par: 3, tee: [125, 560], cup: [248, 112],
      outline: [[60, 605], [190, 605], [190, 330], [300, 330], [300, 50], [60, 50]],
      ice: [rect(60, 135, 300, 605)],
      walls: [box(196, 150, 206, 300)],
      water: [rect(225, 50, 300, 68)] },

    { name: 'Vulkan', par: 3, tee: [180, 565], cup: [180, 190],
      outline: rect(60, 50, 300, 605),
      hills: [{ c: [180, 190], r: 100, k: 280 }] },

    { name: 'Förderband', par: 3, tee: [180, 565], cup: [180, 110],
      outline: rect(60, 50, 300, 605),
      boosts: [{ poly: rect(80, 410, 280, 470), a: [1000, 0] }, { poly: rect(80, 240, 280, 300), a: [-1000, 0] }],
      water: [rect(280, 405, 300, 475), rect(60, 235, 80, 305)],
      bumpers: [[180, 165, 11]] },

    { name: 'Schiebetor', par: 3, tee: [180, 565], cup: [180, 105],
      outline: rect(100, 50, 260, 605),
      walls: [box(100, 330, 158, 346), box(202, 330, 260, 346)],
      sliders: [{ a: [150, 300], b: [210, 300], d: [50, 0], T: 2.4, ph: 0, hw: 7 },
        { a: [150, 190], b: [210, 190], d: [-50, 0], T: 1.8, ph: 1, hw: 7 }] },

    { name: 'Labyrinth', par: 5, tee: [100, 560], cup: [100, 112],
      outline: rect(50, 50, 310, 605),
      walls: [box(50, 470, 240, 482), box(120, 340, 310, 352), box(50, 210, 240, 222)] },

    { name: 'Schwerkraft', par: 3, tee: [180, 565], cup: [235, 105],
      outline: rect(60, 50, 300, 605),
      hills: [{ c: [180, 360], r: 105, k: -430 }, { c: [130, 190], r: 50, k: 300 }, { c: [235, 105], r: 42, k: 220 }] },

    { name: 'Portal-Roulette', par: 3, tee: [180, 575], cup: [240, 105],
      outline: rect(60, 50, 300, 605),
      walls: [box(60, 320, 300, 336)],
      portals: [{ a: [100, 430], b: [250, 180] }, { a: [180, 455], b: [110, 170] }, { a: [260, 430], b: [180, 540] }],
      sand: [rect(60, 130, 160, 215)],
      water: [rect(215, 250, 300, 320)] },

    { name: 'Flipperkasten', par: 3, tee: [180, 565], cup: [180, 100],
      outline: [[120, 50], [240, 50], [310, 140], [310, 520], [240, 605], [120, 605], [50, 520], [50, 140]],
      spinners: [{ c: [180, 330], len: 70, arms: 2, w: -1.1, ph: 0.5 }],
      bumpers: [[100, 230, 16], [260, 230, 16], [100, 440, 16], [260, 440, 16], [180, 175, 13]] },

    { name: 'Insel', par: 4, tee: [180, 565], cup: [180, 120],
      outline: rect(50, 50, 310, 605),
      water: [rect(50, 230, 156, 330), rect(204, 230, 310, 330), rect(50, 50, 100, 230), rect(260, 50, 310, 230)],
      bumpers: [[180, 178, 9]] },

    { name: 'Doppelmühle', par: 3, tee: [180, 565], cup: [180, 100],
      outline: rect(100, 50, 260, 605),
      spinners: [{ c: [180, 430], len: 62, arms: 3, w: 1.3, ph: 0 }, { c: [180, 240], len: 62, arms: 3, w: -1.7, ph: 0.7 }] },

    { name: 'Schleusen', par: 4, tee: [100, 560], cup: [265, 112],
      outline: rect(60, 50, 300, 605),
      walls: [box(60, 380, 240, 396), box(120, 230, 300, 246)],
      sliders: [{ a: [222, 388], b: [262, 388], d: [30, 0], T: 2.6, ph: 0, hw: 7 },
        { a: [98, 238], b: [138, 238], d: [-30, 0], T: 2.2, ph: 2, hw: 7 }] },

    { name: 'Eisfluss', par: 3, tee: [108, 565], cup: [252, 100],
      outline: rect(40, 50, 320, 605),
      water: [[[40, 50], [205, 50], [60, 605], [40, 605]], [[320, 50], [300, 50], [155, 605], [320, 605]]],
      ice: [[[60, 605], [155, 605], [262, 195], [167, 195]]] },

    { name: 'Wellen', par: 3, tee: [225, 565], cup: [135, 100],
      outline: rect(90, 50, 270, 605),
      slopes: [{ poly: rect(108, 160, 252, 220), g: [220, 0] }, { poly: rect(108, 220, 252, 280), g: [-220, 0] },
        { poly: rect(108, 280, 252, 340), g: [220, 0] }, { poly: rect(108, 340, 252, 400), g: [-220, 0] },
        { poly: rect(108, 400, 252, 470), g: [220, 0] }],
      water: [rect(90, 160, 108, 520), rect(252, 160, 270, 520)] },

    { name: 'Gravitron', par: 3, tee: [180, 565], cup: [118, 95],
      outline: rect(60, 50, 300, 605),
      hills: [{ c: [120, 300], r: 70, k: 340 }, { c: [240, 300], r: 70, k: 340 }, { c: [150, 175], r: 62, k: -380 }, { c: [180, 440], r: 60, k: 320 }, { c: [250, 150], r: 55, k: 300 }] },

    { name: 'Spiegelsaal', par: 3, tee: [240, 565], cup: [110, 110],
      outline: rect(60, 50, 300, 605),
      walls: [bar(60, 380, 215, 300, 10), bar(145, 215, 300, 280, 10)],
      bumpers: [[255, 140, 12]] },

    { name: 'Grand Finale', par: 5, tee: [180, 575], cup: [180, 100],
      outline: rect(60, 45, 300, 610),
      walls: [box(60, 520, 160, 534), box(200, 520, 300, 534)],
      spinners: [{ c: [180, 470], len: 50, arms: 4, w: 1.6, ph: 0 }],
      water: [rect(60, 300, 300, 370)],
      portals: [{ a: [115, 410], b: [235, 260] }],
      ice: [rect(60, 160, 300, 290)],
      bumpers: [[130, 150, 12], [230, 150, 12]] },
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

  // ---------- Bewegliche Hindernisse ----------
  // spinners: { c: [x, y], len, arms, w (rad/s), ph }      Windmühle / Drehkreuz
  // sliders:  { a: [x, y], b: [x, y], d: [dx, dy], T, ph, hw } Balken, der hin- und herfährt
  // Ihre Stellung hängt nur von der Zeit t ab (Sekunden). Der Schlag bekommt die Startzeit t0
  // mit – so rechnen Server und beide Browser exakt dieselbe Flugbahn.
  const BLADE = 4;
  function movers(hole, t) {
    const out = [];
    for (const s of hole.spinners || []) {
      const th0 = s.ph + s.w * t;
      for (let k = 0; k < s.arms; k++) {
        const th = th0 + (k * 2 * Math.PI) / s.arms;
        out.push({ x1: s.c[0], y1: s.c[1], x2: s.c[0] + Math.cos(th) * s.len, y2: s.c[1] + Math.sin(th) * s.len, r: BLADE, spin: s });
      }
    }
    for (const s of hole.sliders || []) {
      const ph = (2 * Math.PI * t) / s.T + s.ph;
      const k = Math.sin(ph), dk = (Math.cos(ph) * 2 * Math.PI) / s.T;
      out.push({ x1: s.a[0] + s.d[0] * k, y1: s.a[1] + s.d[1] * k, x2: s.b[0] + s.d[0] * k, y2: s.b[1] + s.d[1] * k,
        r: s.hw, vx: s.d[0] * dk, vy: s.d[1] * dk });
    }
    return out;
  }
  const PORTAL = 13;      // Radius Portal
  const MOVER_BOUNCE = 0.6;

  // ---------- Physik: einen Schlag durchrechnen ----------
  // angle in Bogenmaß (0 = nach rechts, -π/2 = nach oben), power 0..1, t0 = Uhrzeit der Hindernisse
  // Ergebnis: { path: [x0,y0,x1,y1,…], jumps: [Index …] (Portal-Sprünge), end: [x, y], holed, water }
  function simulate(hole, from, angle, power, t0 = 0) {
    const segs = segments(hole);
    const bumpers = (hole.bumpers || []).concat((hole.spinners || []).map((s) => [s.c[0], s.c[1], 7]));
    const moving = !!(hole.spinners || hole.sliders);
    let x = from[0], y = from[1];
    const speed = MAX_SPEED * Math.pow(Math.max(0, Math.min(1, power)), 1.15);
    let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    const path = [r1(x), r1(y)], jumps = [];
    const [cx, cy] = hole.cup;
    let holed = false, water = false, stall = null;
    const steps = Math.round(MAX_TIME / DT);

    for (let step = 1; step <= steps; step++) {
      // Untergrund: Sand bremst stark, Eis kaum; Gefälle, Hügel und Förderbänder ziehen den Ball
      let mu = FRICTION.grass;
      if (hole.sand && hole.sand.some((p) => inPoly(x, y, p))) mu = FRICTION.sand;
      else if (hole.ice && hole.ice.some((p) => inPoly(x, y, p))) mu = FRICTION.ice;
      let gx = 0, gy = 0;
      if (hole.slopes) for (const s of hole.slopes) if (inPoly(x, y, s.poly)) { gx += s.g[0]; gy += s.g[1]; }
      if (hole.boosts) for (const s of hole.boosts) if (inPoly(x, y, s.poly)) { gx += s.a[0]; gy += s.a[1]; }
      if (hole.hills) for (const h of hole.hills) {
        const dx = x - h.c[0], dy = y - h.c[1], d = Math.hypot(dx, dy);
        if (d > 0 && d < h.r) { const f = h.k * Math.sin((Math.PI * d) / h.r) / d; gx += dx * f; gy += dy * f; }
      }
      vx += gx * DT; vy += gy * DT;

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
      const mv = moving ? movers(hole, t0 + step * DT) : null;
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
        if (mv) for (const m of mv) {
          const ex = m.x2 - m.x1, ey = m.y2 - m.y1;
          const len2 = ex * ex + ey * ey;
          let t = len2 ? ((x - m.x1) * ex + (y - m.y1) * ey) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = m.x1 + ex * t, qy = m.y1 + ey * t;
          let nx = x - qx, ny = y - qy;
          const d = Math.hypot(nx, ny), min = m.r + BALL;
          if (d >= min || d === 0) continue;
          nx /= d; ny /= d;
          x = qx + nx * min; y = qy + ny * min;
          // Geschwindigkeit der Oberfläche (Flügel dreht, Balken fährt)
          const sx = m.spin ? -m.spin.w * (qy - m.spin.c[1]) : m.vx;
          const sy = m.spin ? m.spin.w * (qx - m.spin.c[0]) : m.vy;
          const vn = (vx - sx) * nx + (vy - sy) * ny;
          if (vn < 0) { vx -= (1 + MOVER_BOUNCE) * vn * nx; vy -= (1 + MOVER_BOUNCE) * vn * ny; }
        }
      }

      // Portale: rein bei a, raus bei b – Tempo und Richtung bleiben
      if (hole.portals) for (const p of hole.portals) {
        if (Math.hypot(x - p.a[0], y - p.a[1]) < PORTAL - 3) {
          path.push(r1(x), r1(y));
          jumps.push(path.length / 2);
          x = p.b[0]; y = p.b[1];
          path.push(r1(x), r1(y));
          break;
        }
      }

      const sp = Math.hypot(vx, vy);
      if (Math.hypot(cx - x, cy - y) < CUP - 2 && sp < SINK_SPEED) { holed = true; x = cx; y = cy; }
      else if (hole.water && hole.water.some((p) => inPoly(x, y, p))) water = true;

      // Ball liegt still, wenn er langsam ist und kein Gefälle stärker zieht als die Reibung hält
      // – oder wenn er von einem Gefälle gegen eine Bande gedrückt wird und nicht mehr vorankommt.
      let resting = sp < 3 && Math.hypot(gx, gy) <= mu;
      if (step % 60 === 0) {
        if (stall && Math.hypot(gx, gy) > mu && Math.hypot(x - stall[0], y - stall[1]) < 0.4 && sp < 20) resting = true;
        stall = [x, y];
      }
      const stop = holed || water || resting || sp < 0.5 || step === steps;
      if (stop || step % SAMPLE === 0) path.push(r1(x), r1(y));
      if (stop) break;
    }
    return { path, jumps, end: [r2(x), r2(y)], holed, water };
  }

  function onSlope(hole, x, y) {
    return !!hole.slopes && hole.slopes.some((s) => inPoly(x, y, s.poly));
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  // ---------- Plätze ----------
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const parOf = (list) => list.reduce((sum, i) => sum + HOLES[i].par, 0);
  const COURSES = {
    klassik: { name: 'Klassik', holes: range(0, 18) },
    abenteuer: { name: 'Abenteuer', holes: range(18, 36) },
    marathon: { name: 'Marathon', holes: range(0, 36) },
  };
  for (const c of Object.values(COURSES)) c.par = parOf(c.holes.filter((i) => HOLES[i]));
  const C = { W, H, BALL, CUP, PORTAL, BLADE, MAX_STROKES, HOLES, COURSES, simulate, movers, inPoly, segments };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.Minigolf = C;
})(this);
