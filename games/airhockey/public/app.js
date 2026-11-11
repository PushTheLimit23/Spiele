/* Airhockey – Browser-Teil
 * Der Server rechnet die Physik (60 Takte/s) und schickt Momentaufnahmen.
 * Damit es sich trotz Netzverzögerung direkt anfühlt:
 *  - der eigene Schläger folgt sofort dem Finger,
 *  - der Puck wird ab der letzten Momentaufnahme mit derselben Physik kurz vorausberechnet.
 */
(() => {
  const F = window.AirPhysics;
  const $ = (id) => document.getElementById(id);
  const PF = Platform.init('airhockey');
  const esc = PF.esc;
  const COLORS = ['#c75c48', '#41459e'];      // Spieler 0 rot, Spieler 1 lila (aus der Vier-Gewinnt-Palette)
  const LIGHT = ['#f07d68', '#7c80d6'];
  const RAIL = 20, TW = F.W + 2 * RAIL, TH = F.H + 2 * RAIL;

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
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
    if (brokenInvite) $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Lass ihn dir bitte noch einmal schicken – oder starte hier ein eigenes Spiel.';
    else if (roomId) { $('lobbyText').textContent = 'Du wurdest zu einer Runde Airhockey eingeladen. Wie heißt du?'; $('startBtn').textContent = 'Mitspielen'; }
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
  let S = null;              // voller Zustand (bei Ereignissen)
  let snap = null, snapT = 0; // letzte Momentaufnahme + Empfangszeit
  let me = 0, flip = false;
  const mine = { x: F.W / 2, y: F.H - 110, set: false };
  let sentX = -1, sentY = -1;
  const disp = { puck: null, opp: null };
  let resultDismissed = false;

  // ---------- Zeichnen ----------
  const cv = $('table');
  const ctx = cv.getContext('2d');
  let scale = 1, bg = null;

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    scale = cv.width / TW;
    bg = drawTable();
  }

  // Statischer Tisch in einem Hintergrund-Canvas (einmal pro Größe)
  function drawTable() {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    // Bande: Mahagoni
    const wood = g.createLinearGradient(0, 0, TW, TH);
    wood.addColorStop(0, '#8a3a1f'); wood.addColorStop(.5, '#6c2914'); wood.addColorStop(1, '#4b1a0b');
    rr(0, 0, TW, TH, 26); g.fillStyle = wood; g.fill();
    g.globalAlpha = .18;
    for (let i = 0; i < 60; i++) { g.strokeStyle = i % 2 ? '#2a0b02' : '#c98a5a'; g.lineWidth = .8; g.beginPath(); const y = (i / 60) * TH; g.moveTo(0, y); g.bezierCurveTo(TW * .3, y + 6, TW * .7, y - 6, TW, y + 3); g.stroke(); }
    g.globalAlpha = 1;
    // Spielfläche
    g.save(); g.translate(RAIL, RAIL);
    rr(0, 0, F.W, F.H, 14); g.fillStyle = '#f6f9fb'; g.fill();
    g.clip();
    const sheen = g.createRadialGradient(F.W * .3, F.H * .15, 10, F.W * .3, F.H * .15, F.H * .9);
    sheen.addColorStop(0, 'rgba(255,255,255,.9)'); sheen.addColorStop(1, 'rgba(210,225,235,.35)');
    g.fillStyle = sheen; g.fillRect(0, 0, F.W, F.H);
    // Luftlöcher
    g.fillStyle = 'rgba(70,90,110,.13)';
    for (let y = 18; y < F.H; y += 26) for (let x = 13 + ((y / 26) % 2) * 13; x < F.W; x += 26) { g.beginPath(); g.arc(x, y, 1.4, 0, 7); g.fill(); }
    // Linien
    g.strokeStyle = '#c75c48'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, F.H / 2); g.lineTo(F.W, F.H / 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(F.W / 2, F.H / 2, 72, 0, 7); g.stroke();
    g.fillStyle = '#c75c48'; g.beginPath(); g.arc(F.W / 2, F.H / 2, 6, 0, 7); g.fill();
    g.strokeStyle = 'rgba(65,69,158,.55)'; g.lineWidth = 3;
    g.beginPath(); g.arc(F.W / 2, 0, 115, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(F.W / 2, F.H, 115, Math.PI, 2 * Math.PI); g.stroke();
    g.strokeStyle = 'rgba(65,69,158,.35)'; g.lineWidth = 2.5;
    for (const y of [F.H * .25, F.H * .75]) { g.beginPath(); g.moveTo(0, y); g.lineTo(F.W, y); g.stroke(); }
    g.restore();
    // Tore (Schlitze in der Bande)
    g.fillStyle = '#141011';
    rr(RAIL + F.GX1, 3, F.GOAL_W, RAIL - 1, 6); g.fill();
    rr(RAIL + F.GX1, TH - RAIL - 2, F.GOAL_W, RAIL - 1, 6); g.fill();
    // Innenkante
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; rr(RAIL - 1, RAIL - 1, F.W + 2, F.H + 2, 15); g.stroke();
    return c;
  }

  const view = (x, y) => (flip ? [RAIL + F.W - x, RAIL + F.H - y] : [RAIL + x, RAIL + y]);

  function disc(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill(); }
  function drawPuck(x, y) {
    const [vx, vy] = view(x, y);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    disc(vx, vy, F.PUCK_R, '#1d1d1f'); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(vx, vy, F.PUCK_R - 6, 0, 7); ctx.stroke();
    disc(vx - 6, vy - 7, 5, 'rgba(255,255,255,.18)');
  }
  function drawPad(x, y, seat) {
    const [vx, vy] = view(x, y);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
    disc(vx, vy, F.PAD_R, COLORS[seat]); ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(vx, vy, F.PAD_R - 9, 0, 7); ctx.stroke();
    const knob = ctx.createRadialGradient(vx - 5, vy - 6, 2, vx, vy, 17);
    knob.addColorStop(0, '#fff'); knob.addColorStop(.25, LIGHT[seat]); knob.addColorStop(1, COLORS[seat]);
    disc(vx, vy, 16, knob);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!snap || !bg) return;
    const now = performance.now();
    const opp = 1 - me;
    // eigener Schläger: sofort am Finger
    if (!mine.set) { const a = me === 0 ? snap.a : snap.b; mine.x = a[0]; mine.y = a[1]; }
    // Puck + gegnerischer Schläger vorausberechnen
    const el = Math.min(0.12, Math.max(0, (now - snapT) / 1000));
    const pk = { x: snap.p[0], y: snap.p[1], vx: snap.p[2], vy: snap.p[3] };
    const raw = [snap.a, snap.b].map((a) => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], tx: a[0], ty: a[1] }));
    const [ox, oy] = F.clampPad(opp, raw[opp].x + raw[opp].vx * el * .5, raw[opp].y + raw[opp].vy * el * .5);
    raw[opp].tx = ox; raw[opp].ty = oy;
    raw[me].tx = mine.x; raw[me].ty = mine.y;
    if (snap.ph === 'play' && el > 0) {
      let left = el;
      while (left > 1e-4) { const d = Math.min(1 / 60, left); F.step(pk, raw, d, { noGoal: true }); left -= d; }
    }
    // weich nachführen, große Sprünge sofort
    const ease = (cur, x, y, k) => (!cur || Math.hypot(cur.x - x, cur.y - y) > 140 ? { x, y } : { x: cur.x + (x - cur.x) * k, y: cur.y + (y - cur.y) * k });
    disp.puck = ease(disp.puck, pk.x, pk.y, .6);
    disp.opp = ease(disp.opp, raw[opp].x, raw[opp].y, .5);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (snap.ph !== 'goal') drawPuck(disp.puck.x, disp.puck.y);
    if (S && S.players[opp]) drawPad(disp.opp.x, disp.opp.y, opp);
    drawPad(mine.x, mine.y, me);

    // Ansagen auf dem Tisch
    let big = '';
    if (snap.ph === 'ready') big = snap.w > 0 ? String(Math.ceil(snap.w)) : 'Los!';
    else if (snap.ph === 'goal') big = 'Tor!';
    else if (snap.ph === 'paused') big = 'Pause';
    if (big) {
      ctx.save();
      ctx.font = `700 ${big.length > 2 ? 84 : 120}px Fraunces, Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = snap.ph === 'goal' ? 'rgba(199,92,72,.85)' : 'rgba(29,29,31,.22)';
      ctx.fillText(big, TW / 2, TH / 2 + (snap.ph === 'goal' ? 0 : -150));
      ctx.restore();
    }

    // Eingabe senden (nur bei Änderung)
    if (mine.set && (Math.abs(mine.x - sentX) > .5 || Math.abs(mine.y - sentY) > .5)) {
      sentX = mine.x; sentY = mine.y;
      PF.input({ x: Math.round(mine.x * 10) / 10, y: Math.round(mine.y * 10) / 10 });
    }
  }

  // ---------- Steuerung: Finger / Maus ----------
  let pressed = false;
  function pointer(e) {
    const r = cv.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width * TW - RAIL, y = (e.clientY - r.top) / r.height * TH - RAIL;
    if (flip) { x = F.W - x; y = F.H - y; }
    [mine.x, mine.y] = F.clampPad(me, x, y);
    mine.set = true;
  }
  cv.addEventListener('pointerdown', (e) => { pressed = true; try { cv.setPointerCapture(e.pointerId); } catch {} pointer(e); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (pressed || e.pointerType === 'mouse') pointer(e); });
  const up = () => { pressed = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  // ---------- Anzeige außerhalb des Tisches ----------
  function render() {
    if (!S) return;
    me = S.you; flip = me === 1;
    const opp = 1 - me, pl = S.players;
    for (const [id, seat] of [['pMe', me], ['pOpp', opp]]) {
      const box = $(id), p = pl[seat];
      box.querySelector('.chip').className = `chip c${seat}`;
      box.querySelector('.pname').innerHTML = p ? `${esc(p.name)}${seat === me ? ' <small>(du)</small>' : ''}` : '<small>wartet …</small>';
      box.querySelector('.goals').textContent = S.score[seat];
      box.classList.toggle('offline', !!p && !p.online);
    }
    const m = S.match || [0, 0];
    $('score').textContent = `${m[me]} : ${m[opp]}`;
    $('tallyLabel').textContent = 'Siege';
    const on = pl[opp] ? esc(pl[opp].name) : 'Mitspieler';
    let st = '';
    if (!pl[opp]) st = 'Warte auf deinen Mitspieler …';
    else if (S.phase === 'paused') st = `${on} ist nicht verbunden – das Spiel ist pausiert.`;
    else if (S.phase === 'ready' && S.note === 'time') st = 'Zeitregel: Der Puck lag 7 Sekunden in einer Hälfte – er wechselt die Seite.';
    else if (S.phase === 'ready') st = `Erster mit ${S.target} Toren gewinnt. Dein Tor ist unten.`;
    else if (S.phase === 'goal') st = S.lastGoal === me ? '<b>Tor!</b> Stark.' : `Tor für ${on}.`;
    else if (S.phase === 'over') st = S.winner === me ? '<b>Gewonnen!</b>' : `${on} hat gewonnen.`;
    else st = `Erster mit ${S.target} Toren gewinnt.`;
    $('status').innerHTML = st;

    invite.show(!pl[opp]);
    $('resignBtn').hidden = S.phase === 'over' || !pl[opp];
    $('againBtn').hidden = S.phase !== 'over';
    if (S.phase !== 'over') resultDismissed = false;
    $('result').hidden = S.phase !== 'over' || resultDismissed;
    if (S.phase === 'over') {
      $('resultTitle').textContent = S.winner === me ? 'Gewonnen! 🎉' : 'Verloren';
      $('resultText').textContent = S.reason === 'resign'
        ? (S.winner === me ? `${pl[opp]?.name || 'Mitspieler'} hat aufgegeben.` : 'Du hast aufgegeben.')
        : `${S.score[me]} : ${S.score[opp]} Tore`;
      $('resultScore').textContent = `Siege: Du ${m[me]} : ${m[opp]} ${pl[opp]?.name || 'Mitspieler'}`;
      const iWant = S.rematch.includes(me), theyWant = S.rematch.includes(opp);
      $('rematchBtn').disabled = iWant;
      $('rematchBtn').textContent = $('againBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('rematchHint').textContent = theyWant && !iWant ? `${pl[opp]?.name} will eine Revanche!` : 'Bei der Revanche hat dein Mitspieler den Anstoß.';
    }
  }

  let lastPhase = '', lastScore = '';
  function onState(m) {
    const firstRound = !S || S.round !== m.round;
    S = m;
    takeSnap(m.snap);
    if (firstRound) { mine.set = false; disp.puck = disp.opp = null; }
    const sc = m.score.join(':');
    if (lastScore && sc !== lastScore && m.phase !== 'ready') { try { navigator.vibrate && navigator.vibrate(m.lastGoal === m.you ? 40 : [30, 40, 30]); } catch {} }
    lastScore = sc; lastPhase = m.phase;
    render();
  }
  function takeSnap(d) {
    if (snap && d.n < snap.n && d.ph === snap.ph) return; // veraltet
    snap = d; snapT = performance.now();
    if (S) {
      // Torstand & Phase auch zwischen vollen Zuständen aktuell halten
      if (S.phase !== d.ph && d.ph !== 'over') { S.phase = d.ph; render(); }
    }
  }

  function connect() {
    PF.connect({
      onState,
      onTick: takeSnap,
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
    resize();
    try { new ResizeObserver(resize).observe(cv); } catch { addEventListener('resize', resize); }
    requestAnimationFrame(frame);
    connect();
  }

  window.__airState = () => ({ S, snap, mine }); // nur zur Fehlersuche
  if (roomId && PF.name) startGame();
  else showLobby();
})();
