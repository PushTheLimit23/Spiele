/* Minigolf – Browser-Teil
 * Zielen: aufs Feld tippen, nach hinten ziehen, loslassen.
 * Der Server rechnet den Schlag und schickt die Flugbahn an beide – so sieht der
 * Mitspieler denselben Ball rollen. Das Zielen selbst wird live übertragen (PF.live).
 */
(() => {
  const C = window.Minigolf;
  const $ = (id) => document.getElementById(id);
  const PF = Platform.init('minigolf');
  const esc = PF.esc, toast = PF.toast;
  const BALL_COLORS = ['#e2553d', '#2d6cdf'];
  const DRAG_FULL = 165;       // so weit ziehen = volle Kraft (Bahn-Einheiten)

  let roomId = PF.room;
  if (roomId && location.search !== `?r=${roomId}`) history.replaceState(null, '', `${location.pathname}?r=${roomId}`);
  if (PF.brokenLink) history.replaceState(null, '', location.pathname);
  let invite;

  // ---------- Startseite ----------
  function showLobby() {
    $('lobby').hidden = false;
    $('nameInput').value = PF.name;
    if (PF.brokenLink) {
      $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Lass ihn dir bitte noch einmal schicken – oder starte hier eine eigene Runde.';
    } else if (roomId) {
      $('lobbyText').textContent = 'Du wurdest zu einer Runde Minigolf eingeladen. Wie heißt du?';
      $('startBtn').textContent = 'Mitspielen';
    }
    $('nameForm').onsubmit = (e) => {
      e.preventDefault();
      const name = $('nameInput').value.trim().slice(0, 20);
      if (!name) return;
      PF.name = name;
      if (!roomId) roomId = PF.newRoom();
      $('lobby').hidden = true;
      startGame();
    };
    PF.renderHistory($('historyBox'));
  }

  // ---------- Zeichnen ----------
  const canvas = $('course');
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  const holeCache = new Map();

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const want = Math.min(3, window.devicePixelRatio || 1) * (r.width / C.W);
    if (Math.abs(want - dpr) > 0.01 || canvas.width !== Math.round(C.W * want)) {
      dpr = want;
      canvas.width = Math.round(C.W * dpr);
      canvas.height = Math.round(C.H * dpr);
      holeCache.clear();
    }
    requestDraw();
  }

  const polyPath = (c, poly) => {
    c.beginPath();
    poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  };

  // Zufallsmuster einmal erzeugen (Filz, Sand, Pflaster)
  function noise(size, dots, color, alphaMax, seed) {
    const n = document.createElement('canvas');
    n.width = n.height = size;
    const c = n.getContext('2d');
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < dots; i++) {
      c.fillStyle = `rgba(${color},${(rnd() * alphaMax).toFixed(3)})`;
      c.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
    }
    return n;
  }
  let pats;
  function patterns(c) {
    if (pats) return pats;
    pats = {
      felt: c.createPattern(noise(96, 2600, '255,255,255', 0.07, 7), 'repeat'),
      feltDark: c.createPattern(noise(96, 2600, '0,30,0', 0.12, 11), 'repeat'),
      sand: c.createPattern(noise(64, 700, '120,90,30', 0.35, 3), 'repeat'),
      paving: c.createPattern(noise(128, 3000, '90,80,60', 0.12, 5), 'repeat'),
    };
    return pats;
  }

  function renderHole(i) {
    const key = i;
    if (holeCache.has(key)) return holeCache.get(key);
    const h = C.HOLES[i];
    const off = document.createElement('canvas');
    off.width = canvas.width; off.height = canvas.height;
    const c = off.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    pats = null;
    const P = patterns(c);

    // Umgebung: helle Pflastersteine
    c.fillStyle = '#d4ccb0'; c.fillRect(0, 0, C.W, C.H);
    c.fillStyle = P.paving; c.fillRect(0, 0, C.W, C.H);
    c.strokeStyle = 'rgba(120,105,75,.18)'; c.lineWidth = 1;
    for (let y = 0; y < C.H; y += 40) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(C.W, y); c.stroke();
      for (let x = (y / 40) % 2 ? 0 : 30; x < C.W; x += 60) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 40); c.stroke(); }
    }

    // Bande (außen) mit Schatten
    c.save();
    c.shadowColor = 'rgba(40,30,10,.35)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
    polyPath(c, h.outline);
    c.lineJoin = 'round'; c.lineWidth = 22; c.strokeStyle = '#efe8d4'; c.stroke();
    c.restore();
    polyPath(c, h.outline); c.lineJoin = 'round'; c.lineWidth = 22; c.strokeStyle = '#efe8d4'; c.stroke();
    polyPath(c, h.outline); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.7)';
    c.save(); c.translate(0, -1); c.stroke(); c.restore();

    // Filz
    c.save();
    polyPath(c, h.outline); c.clip();
    const g = c.createLinearGradient(0, 0, C.W * 0.3, C.H);
    g.addColorStop(0, '#43a05a'); g.addColorStop(1, '#2d8043');
    c.fillStyle = g; c.fillRect(0, 0, C.W, C.H);
    c.fillStyle = P.felt; c.fillRect(0, 0, C.W, C.H);
    c.fillStyle = P.feltDark; c.fillRect(0, 0, C.W, C.H);
    // Mähstreifen
    c.fillStyle = 'rgba(255,255,255,.035)';
    for (let y = 0; y < C.H; y += 64) c.fillRect(0, y, C.W, 32);

    // Gefälle: hellere Fläche mit Pfeilen
    for (const s of h.slopes || []) {
      c.save(); polyPath(c, s.poly); c.clip();
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
      const ang = Math.atan2(s.g[1], s.g[0]);
      const xs = s.poly.map((p) => p[0]), ys = s.poly.map((p) => p[1]);
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let y = Math.min(...ys) + 18; y < Math.max(...ys); y += 34) {
        for (let x = Math.min(...xs) + 18 + ((y / 34) % 2) * 17; x < Math.max(...xs); x += 34) {
          c.save(); c.translate(x, y); c.rotate(ang);
          c.beginPath(); c.moveTo(-5, -7); c.lineTo(4, 0); c.lineTo(-5, 7); c.stroke();
          c.restore();
        }
      }
      c.restore();
    }

    // Sand
    for (const s of h.sand || []) {
      c.save();
      polyPath(c, s); c.fillStyle = '#e8d29b'; c.fill();
      c.clip(); c.fillStyle = P.sand; c.fillRect(0, 0, C.W, C.H);
      c.restore();
      polyPath(c, s); c.lineWidth = 2; c.strokeStyle = 'rgba(150,115,50,.55)'; c.stroke();
    }

    // Wasser
    for (const w of h.water || []) {
      const xs = w.map((p) => p[0]), ys = w.map((p) => p[1]);
      c.save();
      polyPath(c, w);
      const wg = c.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
      wg.addColorStop(0, '#3f9fd6'); wg.addColorStop(1, '#2a7ab4');
      c.fillStyle = wg; c.fill();
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.6; c.lineCap = 'round';
      for (let y = Math.min(...ys) + 12; y < Math.max(...ys); y += 16) {
        for (let x = Math.min(...xs) + ((y / 16) % 2) * 14; x < Math.max(...xs); x += 30) {
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 5, y - 3, x + 10, y); c.stroke();
        }
      }
      c.restore();
      polyPath(c, w); c.lineWidth = 3; c.strokeStyle = 'rgba(20,70,110,.45)'; c.stroke();
    }

    // Innerer Schatten an der Bande
    c.save(); polyPath(c, h.outline); c.clip();
    c.shadowColor = 'rgba(0,30,0,.55)'; c.shadowBlur = 9;
    polyPath(c, h.outline); c.lineWidth = 6; c.strokeStyle = 'rgba(0,30,0,.35)'; c.stroke();
    c.restore();
    c.restore(); // Ende Filz-Clip

    // Hindernisse (Holz-/Steinbalken)
    for (const w of h.walls || []) {
      c.save();
      c.shadowColor = 'rgba(0,30,0,.45)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
      polyPath(c, w); c.fillStyle = '#efe8d4'; c.fill();
      c.restore();
      polyPath(c, w); c.lineWidth = 1; c.strokeStyle = 'rgba(120,100,60,.35)'; c.stroke();
    }

    // Pilze (Bumper)
    for (const [x, y, r] of h.bumpers || []) {
      c.save();
      c.shadowColor = 'rgba(0,30,0,.5)'; c.shadowBlur = 7; c.shadowOffsetY = 3;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = '#c4453a'; c.fill();
      c.restore();
      const bg = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      bg.addColorStop(0, '#f17a63'); bg.addColorStop(1, '#b23a2f');
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = bg; c.fill();
      c.beginPath(); c.arc(x, y, r * 0.62, 0, Math.PI * 2); c.lineWidth = Math.max(2, r * 0.18); c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
      c.beginPath(); c.arc(x, y, r * 0.22, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    }

    // Abschlag-Matte
    const [tx, ty] = h.tee;
    c.fillStyle = 'rgba(0,40,10,.28)';
    roundRect(c, tx - 17, ty - 11, 34, 22, 5); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(tx, ty, 2, 0, Math.PI * 2); c.fill();

    // Loch
    const [hx, hy] = h.cup;
    c.beginPath(); c.arc(hx, hy + 0.5, C.CUP + 2, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
    const hg = c.createRadialGradient(hx, hy - 3, 1, hx, hy, C.CUP);
    hg.addColorStop(0, '#000'); hg.addColorStop(1, '#16251a');
    c.beginPath(); c.arc(hx, hy, C.CUP, 0, Math.PI * 2); c.fillStyle = hg; c.fill();
    holeCache.set(key, off);
    return off;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function drawFlag(hole, dim) {
    const [hx, hy] = C.HOLES[hole].cup;
    ctx.save();
    ctx.globalAlpha = dim ? 0.35 : 1;
    // Schatten der Fahne
    ctx.strokeStyle = 'rgba(0,30,0,.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 14, hy - 6); ctx.stroke();
    ctx.strokeStyle = '#f5f2e8'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - 38); ctx.stroke();
    ctx.fillStyle = '#f2c35b';
    ctx.beginPath(); ctx.moveTo(hx + 1, hy - 38); ctx.lineTo(hx + 19, hy - 32); ctx.lineTo(hx + 1, hy - 26); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBall(x, y, seat, alpha = 1, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = C.BALL * scale;
    ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2.5, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,25,0,.35)'; ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.15, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, BALL_COLORS[seat]); g.addColorStop(1, shade(BALL_COLORS[seat]));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    ctx.restore();
  }
  const shade = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * 0.62).toString(16).padStart(2, '0');
    return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
  };

  // Ziel-Hilfe: gepunktete Linie in Schlagrichtung + Kraftring
  function drawAim(bx, by, aim, seat, ghost) {
    const len = 26 + 150 * aim.p;
    const dx = Math.cos(aim.a), dy = Math.sin(aim.a);
    const col = BALL_COLORS[seat];
    ctx.save();
    ctx.globalAlpha = ghost ? 0.75 : 1;
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 9]);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.moveTo(bx + dx * 12, by + dy * 12); ctx.lineTo(bx + dx * len, by + dy * len); ctx.stroke();
    ctx.setLineDash([]);
    // Pfeilspitze
    const ex = bx + dx * (len + 6), ey = by + dy * (len + 6);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.moveTo(ex + dx * 6, ey + dy * 6);
    ctx.lineTo(ex - dx * 5 - dy * 6, ey - dy * 5 + dx * 6);
    ctx.lineTo(ex - dx * 5 + dy * 6, ey - dy * 5 - dx * 6);
    ctx.closePath(); ctx.fill();
    // Kraftring um den Ball
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,30,0,.25)';
    ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `hsl(${Math.round(120 - 120 * aim.p)} 85% 55%)`;
    ctx.beginPath(); ctx.arc(bx, by, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aim.p); ctx.stroke();
    if (ghost) {
      ctx.fillStyle = col; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(bx, by, 22, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.setLineDash([4, 5]); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Zustand ----------
  let S = null;              // letzter Server-Zustand
  let lastShot = null;       // ID des zuletzt gezeigten Schlags
  let anim = null;           // laufende Schlag-Animation
  let myAim = null;          // eigenes Zielen {a, p}
  let oppAim = null;         // Zielen des Mitspielers (live) {a, p, t}
  let drag = null;
  let resultDismissed = false;
  let drawQueued = false;
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  const full = () => !!(S && S.players[0] && S.players[1]);
  const nameOf = (seat) => (S && S.players[seat] ? S.players[seat].name : 'Mitspieler');
  const myTurn = () => full() && !S.over && S.turn === S.you && !anim;

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(frame);
  }

  function frame(now) {
    drawQueued = false;
    if (!S || !canvas.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (anim) {
      const sh = anim.shot;
      ctx.drawImage(renderHole(sh.hole), 0, 0);
      if (!anim.t0) anim.t0 = now;
      const pts = sh.path.length / 2;
      const f = reduceMotion() ? pts - 1 : Math.min(pts - 1, (now - anim.t0) / (1000 / 60));
      const i = Math.floor(f), k = f - i;
      const j = Math.min(pts - 1, i + 1);
      const x = sh.path[i * 2] + (sh.path[j * 2] - sh.path[i * 2]) * k;
      const y = sh.path[i * 2 + 1] + (sh.path[j * 2 + 1] - sh.path[i * 2 + 1]) * k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const done = f >= pts - 1;
      if (done && !anim.endedAt) { anim.endedAt = now; showOutcome(sh); }
      const holed = sh.outcome === 'holed' && done;
      drawFlag(sh.hole, Math.hypot(x - C.HOLES[sh.hole].cup[0], y - C.HOLES[sh.hole].cup[1]) < 40);
      if (holed) drawBall(x, y, sh.seat, 0.55, 0.7);
      else if (sh.outcome && sh.outcome.startsWith('water') && done) {
        const t = Math.min(1, (now - anim.endedAt) / 400);
        drawBall(x, y, sh.seat, 1 - t, 1 - t * 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - t)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 8 + t * 16, 0, Math.PI * 2); ctx.stroke();
      } else drawBall(x, y, sh.seat);
      const hold = sh.outcome ? 1300 : 250;
      if (done && now - anim.endedAt > hold) { anim = null; $('banner').hidden = true; render(); }
      requestDraw();
      return;
    }

    const hole = Math.min(S.hole, C.HOLES.length - 1);
    ctx.drawImage(renderHole(hole), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const showBall = full() && !S.over;
    const [bx, by] = S.ball;
    drawFlag(hole, showBall && Math.hypot(bx - C.HOLES[hole].cup[0], by - C.HOLES[hole].cup[1]) < 40);
    if (showBall) {
      if (S.turn === S.you && myAim) drawAim(bx, by, myAim, S.you, false);
      if (S.turn !== S.you && oppAim && now - oppAim.t < 4000) { drawAim(bx, by, oppAim, S.turn, true); requestDraw(); }
      drawBall(bx, by, S.turn);
      // Ball des Spielers, der dran ist, sanft hervorheben
      if (S.turn === S.you && !myAim) {
        const pulse = (Math.sin(now / 260) + 1) / 2;
        ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.45})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 11 + pulse * 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        if (!reduceMotion()) requestDraw();
      }
    }
  }

  function showOutcome(sh) {
    const mine = S && sh.seat === S.you;
    const who = mine ? '' : `${esc(nameOf(sh.seat))}: `;
    let html = '';
    if (sh.outcome === 'holed') html = sh.stroke === 1 ? `${who}Ass! 🎯<small>Mit dem ersten Schlag im Loch</small>` : `${who}Eingelocht ⛳<small>${sh.stroke} Schläge</small>`;
    else if (sh.outcome === 'water') html = `${who}Platsch! 💦<small>Zurück zur letzten Stelle, der Schlag zählt</small>`;
    else if (sh.outcome === 'max' || sh.outcome === 'water-max') html = `${who}6 Schläge vorbei<small>Diese Bahn zählt 7</small>`;
    if (!html) return;
    $('banner').innerHTML = html;
    $('banner').hidden = false;
  }

  // ---------- Oberfläche ----------
  function render() {
    if (!S) return;
    const me = S.you, opp = 1 - me;
    // Während der Animation zeigen Kopfzeile und Karte den Stand VOR dem Schlag-Ende nicht extra – wir zeigen den aktuellen Stand.
    const hole = Math.min(S.hole, C.HOLES.length - 1);
    const showHole = anim ? anim.shot.hole : hole;
    const H = C.HOLES[showHole];
    $('holeInfo').innerHTML = `<b>Bahn ${showHole + 1}</b><span>/18 · ${esc(H.name)} · Par ${H.par}</span>`;

    // Spielerleisten
    let parSoFar = [0, 0];
    S.strokes.forEach((row, seat) => row.forEach((v, i) => { if (v != null) parSoFar[seat] += C.HOLES[i].par; }));
    for (const seat of [0, 1]) {
      const box = $(`p${seat}`), pl = S.players[seat];
      box.querySelector('.pname').innerHTML = pl ? `${esc(pl.name)}${seat === me ? ' <small>(du)</small>' : ''}` : '<small>wartet …</small>';
      const t = S.totals[seat], diff = t - parSoFar[seat];
      box.querySelector('.tot').innerHTML = parSoFar[seat] ? `<b>${t}</b> (${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)})` : '<b>0</b>';
      box.classList.toggle('turn', full() && !S.over && S.turn === seat);
      box.classList.toggle('offline', !!pl && !pl.online);
    }
    const sc = S.score || [0, 0];
    $('score').textContent = `${sc[0]} : ${sc[1]}`;
    $('tallyLabel').textContent = S.draws ? `Siege · ${S.draws} Remis` : 'Siege';

    // Schlag-Anzeige
    if (S.over || !full()) $('strokeInfo').textContent = S.over ? 'Runde beendet' : 'Warten';
    else $('strokeInfo').textContent = `Schlag ${S.cur + 1} / 6`;

    // Statuszeile
    const oppName = esc(nameOf(opp));
    let st = '';
    if (!S.players[opp]) st = 'Warte auf deinen Mitspieler …';
    else if (anim) st = anim.shot.seat === me ? 'Rollt …' : `<span class="who${opp}">${oppName}</span> hat geschlagen …`;
    else if (S.over) st = S.winner === -1 ? 'Unentschieden!' : S.winner === me ? '<b>Gewonnen!</b>' : `${oppName} hat gewonnen.`;
    else if (S.turn === me) {
      st = myAim ? `Kraft ${Math.round(myAim.p * 100)} % – loslassen zum Schlagen` :
        S.cur === 0 ? 'Du bist dran: Aufs Feld tippen, <b>nach hinten ziehen</b>, loslassen.' : `Du bist dran – Schlag ${S.cur + 1}.`;
    } else {
      const otherDone = S.strokes[me][hole] != null;
      st = oppAim ? `<span class="who${opp}">${oppName}</span> zielt …` :
        `<span class="who${opp}">${oppName}</span> ist dran${otherDone ? '' : ' – danach du'}. Du kannst zuschauen.`;
    }
    if (S.players[opp] && !S.players[opp].online && !S.over) st += ' <span style="opacity:.6">(nicht verbunden)</span>';
    $('status').innerHTML = st;
    canvas.classList.toggle('wait', !myTurn());

    renderCard(hole);

    // Einladung & Ergebnis
    invite.show(!S.players[opp]);
    $('resignBtn').hidden = S.over || !full();
    $('againBtn').hidden = !S.over;
    if (!S.over) resultDismissed = false;
    $('result').hidden = !S.over || resultDismissed || !!anim;
    if (S.over) {
      const t = S.totals;
      $('resultTitle').textContent = S.winner === -1 ? 'Unentschieden' : S.winner === me ? 'Gewonnen! 🏆' : 'Verloren';
      $('resultText').textContent = S.resigned >= 0
        ? (S.resigned === me ? 'Du hast aufgegeben.' : `${nameOf(opp)} hat aufgegeben.`)
        : `Du ${t[me]} · ${nameOf(opp)} ${t[opp]} Schläge (Par ${C.PAR})`;
      $('resultScore').textContent = `Stand: Du ${sc[me]} : ${sc[opp]} ${nameOf(opp)}` + (S.draws ? ` · ${S.draws} Remis` : '');
      const iWant = S.rematch.includes(me), theyWant = S.rematch.includes(opp);
      $('rematchBtn').disabled = iWant;
      $('rematchBtn').textContent = $('againBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('rematchHint').textContent = theyWant && !iWant ? `${nameOf(opp)} will eine Revanche!` : 'Bei einer Revanche fängt der andere an.';
    }
    requestDraw();
  }

  function renderCard(cur) {
    const name = (seat) => (S.players[seat] ? S.players[seat].name : '–');
    const half = (from, to, last) => {
      const idx = []; for (let i = from; i < to; i++) idx.push(i);
      const curCls = (i) => (!S.over && i === cur ? ' class="cur"' : '');
      const head = `<tr><th>Bahn</th>${idx.map((i) => `<th${curCls(i)}>${i + 1}</th>`).join('')}${last ? '<th>Σ</th>' : ''}</tr>`;
      const par = `<tr class="par"><td>Par</td>${idx.map((i) => `<td${curCls(i)}>${C.HOLES[i].par}</td>`).join('')}${last ? `<td>${C.PAR}</td>` : ''}</tr>`;
      const rows = [0, 1].map((seat) => `<tr class="r${seat}"><td>${esc(name(seat))}</td>${idx.map((i) => {
        const v = S.strokes[seat][i];
        const cls = v == null ? '' : v < C.HOLES[i].par ? 'under' : v > C.HOLES[i].par ? 'over' : '';
        const extra = !S.over && i === cur ? ' cur' : '';
        return `<td class="${cls}${extra}">${v == null ? '' : v}</td>`;
      }).join('')}${last ? `<td class="sum">${S.totals[seat]}</td>` : ''}</tr>`).join('');
      return `<table><thead>${head}</thead><tbody>${par}${rows}</tbody></table>`;
    };
    $('scorecard').innerHTML = half(0, 9, false) + half(9, 18, true);
  }

  // ---------- Zielen & Schlagen ----------
  function toCourse(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * C.W, ((e.clientY - r.top) / r.height) * C.H];
  }
  let liveTimer = 0, lastLive = 0;
  function sendLive(force) {
    const now = performance.now();
    if (!force && now - lastLive < 70) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => sendLive(true), 75);
      return;
    }
    clearTimeout(liveTimer);
    lastLive = now;
    PF.live({ aim: myAim ? { a: +myAim.a.toFixed(3), p: +myAim.p.toFixed(3) } : null });
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!S) return;
    if (!full()) return toast('Warte, bis dein Mitspieler da ist.');
    if (S.over || anim) return;
    if (S.turn !== S.you) return toast(`${nameOf(S.turn)} ist dran – schau zu!`);
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    drag = { id: e.pointerId, start: toCourse(e) };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const [x, y] = toCourse(e);
    const dx = drag.start[0] - x, dy = drag.start[1] - y;
    const len = Math.hypot(dx, dy);
    myAim = len < 8 ? null : { a: Math.atan2(dy, dx), p: Math.min(1, len / DRAG_FULL) };
    sendLive();
    render();
  });
  const endDrag = (shoot) => (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    const aim = myAim;
    myAim = null;
    sendLive(true);
    if (shoot && aim && aim.p > 0.03 && myTurn()) PF.act({ t: 'shoot', a: aim.a, p: aim.p });
    render();
  };
  canvas.addEventListener('pointerup', endDrag(true));
  canvas.addEventListener('pointercancel', endDrag(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) { drag = null; myAim = null; sendLive(true); render(); }
  });

  // ---------- Verbindung ----------
  function onState(m) {
    S = m;
    const sh = m.shot;
    if (lastShot === null) lastShot = sh ? sh.id : 0;            // beim Laden nichts nachspielen
    else if (sh && sh.id !== lastShot) {
      lastShot = sh.id;
      $('banner').hidden = true;
      anim = { shot: sh };
      oppAim = null;
    }
    if (m.turn === m.you) oppAim = null;
    render();
  }

  function startGame() {
    $('game').hidden = false;
    invite = PF.invite($('courseWrap'));
    $('copyBtn').onclick = () => PF.copyLink();
    $('resignBtn').onclick = () => { if (confirm('Wirklich aufgeben?')) PF.resign(); };
    $('rematchBtn').onclick = $('againBtn').onclick = () => PF.rematch();
    $('closeResult').onclick = () => { resultDismissed = true; render(); $('scorecard').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    resize();
    new ResizeObserver(resize).observe(canvas);
    PF.connect({
      onState,
      onLive(data) {
        if (!S || S.turn === S.you) return;
        oppAim = data && data.aim ? { a: data.aim.a, p: data.aim.p, t: performance.now() } : null;
        render();
      },
      onError: toast,
      onFull() { $('game').hidden = true; $('full').hidden = false; },
      onBadLink(msg) { $('status').textContent = msg; },
      onDisconnect() { $('status').textContent = 'Verbindung unterbrochen – verbinde neu …'; },
    });
  }

  window.__minigolfState = () => S; // nur zur Fehlersuche
  window.__minigolfRender = () => render();
  if (roomId && PF.name) startGame();
  else showLobby();
})();
