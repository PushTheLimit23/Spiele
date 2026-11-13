/* Carrom – Browser-Teil
 * Der Server rechnet jeden Schuss und schickt den Ablauf (Bilder) mit; hier wird er abgespielt.
 * Zielen: Striker mit dem Regler platzieren, irgendwo aufs Brett tippen und zurückziehen (Steinschleuder).
 */
(() => {
  const C = window.Carrom;
  const $ = (id) => document.getElementById(id);
  const PF = Platform.init('carrom');
  const esc = PF.esc;
  const FR = 70, TOT = C.SIZE + 2 * FR;   // Rahmen um die Spielfläche
  const PULL = 360;                       // so weit zurückziehen = volle Kraft

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  let roomId = PF.room;
  const brokenInvite = PF.brokenLink;
  if (roomId && location.search !== `?r=${roomId}`) history.replaceState(null, '', `${location.pathname}?r=${roomId}`);
  if (brokenInvite) history.replaceState(null, '', location.pathname);
  let invite;

  // ---------- Startseite ----------
  function showLobby() {
    $('lobby').hidden = false;
    $('nameInput').value = PF.name;
    if (brokenInvite) $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Lass ihn dir bitte noch einmal schicken – oder starte hier eine eigene Partie.';
    else if (roomId) { $('lobbyText').textContent = 'Du wurdest zu einer Partie Carrom eingeladen. Wie heißt du?'; $('startBtn').textContent = 'Mitspielen'; }
    $('nameForm').onsubmit = (e) => {
      e.preventDefault();
      const name = $('nameInput').value.trim().slice(0, 20);
      if (!name) return;
      PF.name = name;
      if (!roomId) roomId = PF.newRoom();
      $('lobby').hidden = true;
      startGame();
    };
    loadHistory();
  }
  async function loadHistory() {
    try {
      const list = await PF.history();
      if (!list.length) return;
      $('historyList').innerHTML = list.slice(0, 10).map((h) => {
        const res = { draw: ['Remis', ''], win: ['Sieg', 'win'], loss: ['Niederlage', 'loss'] }[h.result];
        const d = new Date(h.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        return `<li><span>gegen <b>${esc(h.opp)}</b> <span class="when">· ${d} · ${h.reason === 'resign' ? 'aufgegeben' : esc(h.summary)}</span></span><span class="res ${res[1]}">${res[0]}</span></li>`;
      }).join('');
      $('historyBox').hidden = false;
    } catch {}
  }

  // ---------- Zustand ----------
  let S = null, me = 0, flip = false, resultDismissed = false;
  let shown = null;          // Steine, wie sie gerade gezeigt werden: Map id -> {k,x,y,on}
  let striker = null;        // {x,y,on} während der Animation
  let anim = null;           // laufende Schuss-Animation
  let lastShots = -1;
  let sx = C.SIZE / 2;       // eigene Striker-Position
  let aim = null;            // {sx0,sy0, cx,cy, angle, power} beim Zielen
  let ghost = null;          // Zielen des Mitspielers (live)

  // ---------- Zeichnen ----------
  const cv = $('table');
  const ctx = cv.getContext('2d');
  let scale = 1, bg = null;

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    scale = cv.width / TOT;
    bg = drawBoard();
  }

  function drawBoard() {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    // Rahmen Mahagoni
    const wood = g.createLinearGradient(0, 0, TOT, TOT);
    wood.addColorStop(0, '#8a3a1f'); wood.addColorStop(.5, '#6c2914'); wood.addColorStop(1, '#4b1a0b');
    rr(0, 0, TOT, TOT, 34); g.fillStyle = wood; g.fill();
    g.globalAlpha = .16;
    for (let i = 0; i < 70; i++) { g.strokeStyle = i % 2 ? '#2a0b02' : '#c98a5a'; g.lineWidth = 1; g.beginPath(); const y = (i / 70) * TOT; g.moveTo(0, y); g.bezierCurveTo(TOT * .3, y + 8, TOT * .7, y - 8, TOT, y + 4); g.stroke(); }
    g.globalAlpha = 1;
    g.save(); g.translate(FR, FR);
    // Spielfläche: helles Sperrholz
    g.fillStyle = '#f0d6a4'; g.fillRect(0, 0, C.SIZE, C.SIZE);
    g.globalAlpha = .1;
    for (let i = 0; i < 90; i++) { g.strokeStyle = '#8a5a2a'; g.lineWidth = 1.2; g.beginPath(); const x = (i / 90) * C.SIZE; g.moveTo(x, 0); g.bezierCurveTo(x + 10, C.SIZE * .3, x - 10, C.SIZE * .7, x + 4, C.SIZE); g.stroke(); }
    g.globalAlpha = 1;
    const sh = g.createRadialGradient(C.SIZE * .35, C.SIZE * .25, 20, C.SIZE * .5, C.SIZE * .5, C.SIZE * .8);
    sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(1, 'rgba(120,70,20,.12)');
    g.fillStyle = sh; g.fillRect(0, 0, C.SIZE, C.SIZE);
    // Grundlinien auf allen vier Seiten
    g.strokeStyle = '#2b1a12'; g.lineWidth = 2.2;
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(C.SIZE / 2, C.SIZE / 2); g.rotate(k * Math.PI / 2); g.translate(-C.SIZE / 2, -C.SIZE / 2);
      const y = C.SIZE - C.BASE_OFF;
      for (const dy of [-C.STRIKER_R, C.STRIKER_R]) { g.beginPath(); g.moveTo(C.BASE_X1, y + dy); g.lineTo(C.BASE_X2, y + dy); g.stroke(); }
      for (const x of [C.BASE_X1, C.BASE_X2]) {
        g.beginPath(); g.arc(x, y, C.STRIKER_R, 0, 7); g.fillStyle = '#c75c48'; g.fill(); g.stroke();
        g.beginPath(); g.arc(x, y, C.STRIKER_R - 9, 0, 7); g.strokeStyle = '#f0d6a4'; g.lineWidth = 2; g.stroke(); g.strokeStyle = '#2b1a12'; g.lineWidth = 2.2;
      }
      // Pfeil aus der Ecke Richtung Mitte
      g.beginPath(); g.moveTo(C.SIZE - 120, C.SIZE - 120); g.lineTo(C.SIZE - 300, C.SIZE - 300); g.stroke();
      g.beginPath(); g.moveTo(C.SIZE - 300, C.SIZE - 300); g.lineTo(C.SIZE - 300 + 26, C.SIZE - 300 + 4); g.moveTo(C.SIZE - 300, C.SIZE - 300); g.lineTo(C.SIZE - 300 + 4, C.SIZE - 300 + 26); g.stroke();
      g.restore();
    }
    // Mitte
    g.beginPath(); g.arc(C.SIZE / 2, C.SIZE / 2, 88, 0, 7); g.stroke();
    g.beginPath(); g.arc(C.SIZE / 2, C.SIZE / 2, 82, 0, 7); g.stroke();
    g.save(); g.translate(C.SIZE / 2, C.SIZE / 2); g.fillStyle = 'rgba(199,92,72,.22)';
    g.beginPath(); for (let k = 0; k < 16; k++) { const r = k % 2 ? 30 : 78, a = k * Math.PI / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    g.restore();
    g.beginPath(); g.arc(C.SIZE / 2, C.SIZE / 2, 16, 0, 7); g.fillStyle = '#c75c48'; g.fill();
    // Taschen
    for (const [px, py] of C.POCKETS) {
      g.beginPath(); g.arc(px, py, C.POCKET_R + 4, 0, 7); g.fillStyle = '#3a1a0c'; g.fill();
      const pg = g.createRadialGradient(px, py, 4, px, py, C.POCKET_R);
      pg.addColorStop(0, '#000'); pg.addColorStop(1, '#1d1210');
      g.beginPath(); g.arc(px, py, C.POCKET_R, 0, 7); g.fillStyle = pg; g.fill();
    }
    g.restore();
    // Innenkante
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(FR - 1.5, FR - 1.5, C.SIZE + 3, C.SIZE + 3);
    return c;
  }

  const view = (x, y) => (flip ? [FR + C.SIZE - x, FR + C.SIZE - y] : [FR + x, FR + y]);
  const unview = (vx, vy) => { const x = vx - FR, y = vy - FR; return flip ? [C.SIZE - x, C.SIZE - y] : [x, y]; };

  function disc(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill(); }
  const COIN = {
    w: ['#fffaf0', '#ecdfc4', '#b29b72', 'rgba(120,90,50,.35)'],
    b: ['#8f7d70', '#3f322b', '#160f0c', 'rgba(255,255,255,.13)'],
    q: ['#f6a593', '#c75c48', '#7e2f22', 'rgba(255,255,255,.3)'],
  };
  function drawCoin(x, y, k, alpha = 1) {
    const [vx, vy] = view(x, y), [a, b, c, ring] = COIN[k], R = C.COIN_R;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(40,15,0,.4)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2.5;
    const gr = ctx.createRadialGradient(vx - 6, vy - 7, 2, vx, vy, R);
    gr.addColorStop(0, a); gr.addColorStop(.55, b); gr.addColorStop(1, c);
    disc(vx, vy, R, gr);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = ring; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(vx, vy, R - 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(vx, vy, R - 11, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function drawStriker(x, y, alpha = 1, bad = false) {
    const [vx, vy] = view(x, y), R = C.STRIKER_R;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(40,15,0,.45)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    const gr = ctx.createRadialGradient(vx - 8, vy - 9, 2, vx, vy, R);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(.6, '#efe7d6'); gr.addColorStop(1, '#bfb19a');
    disc(vx, vy, R, gr);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = bad ? '#d9412f' : '#41459e'; ctx.lineWidth = bad ? 4 : 3;
    ctx.beginPath(); ctx.arc(vx, vy, R - 6, 0, 7); ctx.stroke();
    disc(vx, vy, 5, bad ? '#d9412f' : '#c75c48');
    ctx.restore();
  }
  function drawAim(x, y, angle, power, mine) {
    const [vx, vy] = view(x, y);
    let a = angle; if (flip) a += Math.PI;
    const len = 140 + power * 420;
    ctx.save();
    ctx.strokeStyle = mine ? 'rgba(65,69,158,.85)' : 'rgba(43,26,18,.45)';
    ctx.lineWidth = 4; ctx.setLineDash([3, 12]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(vx + Math.cos(a) * 32, vy + Math.sin(a) * 32); ctx.lineTo(vx + Math.cos(a) * len, vy + Math.sin(a) * len); ctx.stroke();
    ctx.setLineDash([]);
    // Kraft als Bogen um den Striker
    ctx.strokeStyle = power > .85 ? '#d9412f' : power > .5 ? '#e0a03a' : '#2e8a6e';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(vx, vy, C.STRIKER_R + 9, a + Math.PI - power * Math.PI, a + Math.PI + power * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!bg || !S) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const g = S.game;
    if (anim) stepAnim();
    for (const p of shown.values()) if (p.on || p.fade > 0) drawCoin(p.x, p.y, p.k, p.on ? 1 : Math.max(0, p.fade));
    if (anim && striker) { if (striker.on || striker.fade > 0) drawStriker(striker.x, striker.y, striker.on ? 1 : Math.max(0, striker.fade)); }
    else if (g.winner === -2 && S.players[0] && S.players[1]) {
      if (g.turn === me) {
        const bad = C.strikerBlocked(g.pieces, me, sx);
        if (aim && aim.power > 0.01) drawAim(sx, C.baseY(me), aim.angle, aim.power, true);
        drawStriker(sx, C.baseY(me), 1, bad);
      } else if (ghost) {
        if (ghost.p > 0.01) drawAim(ghost.x, C.baseY(1 - me), ghost.a, ghost.p, false);
        drawStriker(ghost.x, C.baseY(1 - me), .85);
      } else drawStriker(C.SIZE / 2, C.baseY(g.turn), .55);
    }
  }

  // ---------- Schuss-Animation ----------
  function startAnim(last) {
    shown = new Map();
    for (const [id, x, y] of last.start) { const k = S.game.pieces.find((p) => p.id === id).k; shown.set(id, { k, x, y, on: true, fade: 0 }); }
    for (const p of S.game.pieces) if (!shown.has(p.id) && p.on) shown.set(p.id, { k: p.k, x: p.x, y: p.y, on: true, fade: 0 });
    striker = { x: last.strikerStart[0], y: last.strikerStart[1], on: true, fade: 0 };
    // Bilder in absolute Positionen umrechnen (Zwischenstände für weiche Bewegung)
    const pos = new Map([...shown].map(([id, p]) => [id, [p.x, p.y]])); pos.set(99, [striker.x, striker.y]);
    const keys = [new Map(pos)];
    for (const f of last.frames) { for (const [id, x, y] of f) pos.set(id, x < 0 ? null : [x, y]); keys.push(new Map(pos)); }
    anim = { keys, fps: last.fps, t0: performance.now(), dur: (keys.length - 1) / last.fps * 1000 };
  }
  function stepAnim() {
    const t = (performance.now() - anim.t0) / 1000 * anim.fps, i = Math.floor(t), f = t - i;
    if (i >= anim.keys.length - 1) { anim = null; syncShown(); render(); return; }
    const A = anim.keys[i], B = anim.keys[i + 1];
    for (const [id, a] of A) {
      const b = B.get(id), obj = id === 99 ? striker : shown.get(id);
      if (!obj) continue;
      if (!a) { obj.on = false; obj.fade -= .06; continue; }
      if (!b) { obj.x = a[0]; obj.y = a[1]; if (obj.on) { obj.on = false; obj.fade = 1; } continue; }
      obj.x = a[0] + (b[0] - a[0]) * f; obj.y = a[1] + (b[1] - a[1]) * f;
    }
  }
  function syncShown() {
    shown = new Map(S.game.pieces.map((p) => [p.id, { k: p.k, x: p.x, y: p.y, on: p.on, fade: 0 }]));
    striker = null;
  }

  // ---------- Zielen ----------
  const myTurn = () => S && S.game.winner === -2 && S.game.turn === me && S.players[0] && S.players[1] && !anim;
  function toBoard(e) {
    const r = cv.getBoundingClientRect();
    return unview((e.clientX - r.left) / r.width * TOT, (e.clientY - r.top) / r.height * TOT);
  }
  let liveT = 0;
  function sendLive(force) {
    const now = performance.now();
    if (!force && now - liveT < 60) return;
    liveT = now;
    PF.live({ x: Math.round(sx), a: aim ? Math.round(aim.angle * 1000) / 1000 : 0, p: aim ? Math.round(aim.power * 100) / 100 : 0 });
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!myTurn()) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch {}
    const [x, y] = toBoard(e);
    aim = { x0: x, y0: y, angle: 0, power: 0 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!aim) return;
    const [x, y] = toBoard(e);
    const dx = aim.x0 - x, dy = aim.y0 - y, d = Math.hypot(dx, dy);
    aim.power = Math.min(1, d / PULL);
    if (d > 4) aim.angle = Math.atan2(dy, dx);
    sendLive();
  });
  const release = () => {
    if (!aim) return;
    const a = aim; aim = null;
    sendLive(true);
    if (a.power < 0.04) return;
    if (C.strikerBlocked(S.game.pieces, me, sx)) return toast('Der Striker liegt auf einem Stein – schieb ihn mit dem Regler zur Seite.');
    PF.act({ t: 'shot', x: Math.round(sx * 10) / 10, angle: a.angle, power: Math.round(a.power * 1000) / 1000 });
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', () => { aim = null; sendLive(true); });
  // Regler läuft auf dem Bildschirm immer von links nach rechts (auch auf dem gedrehten Brett)
  $('strikerX').addEventListener('input', (e) => { const v = Number(e.target.value); sx = flip ? C.SIZE - v : v; sendLive(); });

  // ---------- Anzeige ----------
  const NOTE = {
    'queen-pending': 'Königin versenkt – jetzt abdecken: Versenke im nächsten Schuss einen eigenen Stein.',
    'queen-covered': 'Königin abgedeckt! (+3 Punkte)',
    'queen-back': 'Königin nicht abgedeckt – sie kommt zurück in die Mitte.',
    'foul-return': 'Foul: Striker versenkt – ein eigener Stein kommt zurück.',
    foul: 'Foul: Striker versenkt.',
    'last-back-w': 'Erst die Königin: der letzte helle Stein kommt zurück.',
    'last-back-b': 'Erst die Königin: der letzte dunkle Stein kommt zurück.',
  };
  function render() {
    if (!S) return;
    const g = S.game, opp = 1 - me, pl = S.players, col = ['w', 'b'];
    for (const [id, side] of [['pMe', me], ['pOpp', opp]]) {
      const box = $(id), p = pl[side];
      box.querySelector('.chip').className = `chip c${col[side]}`;
      box.querySelector('.pname').innerHTML = p ? `${esc(p.name)}${side === me ? ' <small>(du)</small>' : ''}` : '<small>wartet …</small>';
      box.querySelector('.hand').innerHTML = `${g.out[col[side]]}/9${g.queen === 'covered' && g.queenBy === side ? ' <span class="q" title="Königin">♛</span>' : ''}`;
      box.classList.toggle('turn', g.winner === -2 && g.turn === side && !!(pl[0] && pl[1]));
      box.classList.toggle('offline', !!p && !p.online);
    }
    $('score').textContent = `${S.score[me]} : ${S.score[opp]}`;
    $('tallyLabel').textContent = S.draws ? `Siege · ${S.draws} Remis` : 'Siege';
    const on = pl[opp] ? esc(pl[opp].name) : 'Mitspieler';
    const last = g.last, notes = last ? last.notes.map((n) => NOTE[n]).filter(Boolean).join(' ') : '';
    let st;
    if (!pl[opp]) st = 'Warte auf deinen Mitspieler …';
    else if (g.winner >= 0) st = g.winner === me ? '<b>Gewonnen!</b>' : `${on} hat gewonnen.`;
    else if (g.winner === -1) st = 'Remis.';
    else if (anim) st = 'Der Striker rollt …';
    else if (g.turn === me) {
      const again = last && last.seat === me && last.again;
      st = (notes ? notes + ' ' : '') + (again ? '<b>Treffer!</b> Du bist nochmal dran.' : g.queen === 'pending' && g.pending === me ? 'Deck die Königin ab!' : `Du bist dran: Striker platzieren, ${last ? '' : 'dann '}aufs Brett tippen und zurückziehen.`);
    } else st = (notes ? notes + ' ' : '') + `${on} ist am Zug …`;
    if (pl[opp] && !pl[opp].online && g.winner === -2) st += ' <span style="opacity:.6">(nicht verbunden)</span>';
    $('status').innerHTML = st;
    $('strikerRow').hidden = !myTurn();
    invite.show(!pl[opp]);
    $('resignBtn').hidden = g.winner !== -2 || !pl[opp];
    $('againBtn').hidden = g.winner === -2;
    if (g.winner === -2) resultDismissed = false;
    $('result').hidden = g.winner === -2 || resultDismissed || !!anim;
    if (g.winner !== -2) {
      $('resultTitle').textContent = g.winner === -1 ? 'Remis' : g.winner === me ? 'Gewonnen! 🎉' : 'Verloren';
      $('resultText').textContent = g.reason === 'resign' ? (g.winner === me ? `${pl[opp]?.name || 'Mitspieler'} hat aufgegeben.` : 'Du hast aufgegeben.')
        : g.reason === 'limit' ? '400 Schüsse ohne Sieger.' : `Alle Steine versenkt – ${S.points} Punkte${g.queenBy === g.winner ? ' inkl. Königin' : ''}.`;
      $('resultScore').textContent = `Siege: Du ${S.score[me]} : ${S.score[opp]} ${pl[opp]?.name || 'Mitspieler'}`;
      const iWant = S.rematch.includes(me), theyWant = S.rematch.includes(opp);
      $('rematchBtn').disabled = iWant;
      $('rematchBtn').textContent = $('againBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('rematchHint').textContent = theyWant && !iWant ? `${pl[opp]?.name} will eine Revanche!` : 'Bei der Revanche werden die Farben getauscht.';
    }
  }

  function onState(m) {
    const newRound = !S || S.round !== m.round;
    S = m; me = m.you;
    if (flip !== (me === 1)) { flip = me === 1; }
    const shots = m.game.shots;
    if (newRound || lastShots < 0 || !m.game.last || shots < lastShots) { anim = null; syncShown(); }
    else if (shots > lastShots && m.game.last) { ghost = null; startAnim(m.game.last); }
    lastShots = shots;
    if (!anim) syncShown();
    // Striker nicht auf einem Stein starten lassen
    if (m.game.turn === me && C.strikerBlocked(m.game.pieces, me, sx)) {
      for (let d = 0; d < 300; d += 10) for (const x of [sx + d, sx - d]) if (x >= C.BASE_X1 && x <= C.BASE_X2 && !C.strikerBlocked(m.game.pieces, me, x)) { sx = x; d = 999; break; }
      $('strikerX').value = flip ? C.SIZE - sx : sx;
    }
    render();
  }

  function connect() {
    PF.connect({
      onState,
      onLive(d) { ghost = d && d.p !== undefined ? d : null; },
      onError: toast,
      onFull() { $('game').hidden = true; $('full').hidden = false; },
      onBadLink(msg) { $('status').textContent = msg; },
      onDisconnect() { $('status').textContent = 'Verbindung unterbrochen – verbinde neu …'; },
    });
  }

  function startGame() {
    $('game').hidden = false;
    invite = PF.invite($('tableWrap'));
    $('copyBtn').onclick = () => PF.copyLink();
    $('resignBtn').onclick = () => { if (confirm('Wirklich aufgeben?')) PF.resign(); };
    $('rematchBtn').onclick = $('againBtn').onclick = () => PF.rematch();
    $('closeResult').onclick = () => { resultDismissed = true; render(); };
    $('strikerX').min = C.BASE_X1; $('strikerX').max = C.BASE_X2;
    resize();
    try { new ResizeObserver(resize).observe(cv); } catch { addEventListener('resize', resize); }
    requestAnimationFrame(frame);
    connect();
  }

  window.__carromState = () => ({ S, sx, anim: !!anim }); // nur zur Fehlersuche
  if (roomId && PF.name) startGame();
  else showLobby();
})();
