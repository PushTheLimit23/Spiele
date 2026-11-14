/* Abalone – Browser-Teil */
(() => {
  const R = window.Abalone;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const PF = Platform.init('abalone');
  const esc = PF.esc;
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
    if (brokenInvite) $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Lass ihn dir bitte noch einmal schicken – oder starte hier eine eigene Partie.';
    else if (roomId) { $('lobbyText').textContent = 'Du wurdest zu einer Partie Abalone eingeladen. Wie heißt du?'; $('startBtn').textContent = 'Mitspielen'; }
    $('nameForm').onsubmit = (e) => {
      e.preventDefault();
      const name = $('nameInput').value.trim().slice(0, 20);
      if (!name) return;
      PF.name = name;
      if (!roomId) roomId = PF.newRoom();
      $('lobby').hidden = true;
      startGame();
    };
    // Allein gegen den Computer (Kasten aus dem gemeinsamen Kern)
    PF.cpuBox($('nameForm'), { input: $('nameInput'), btnClass: 'btn ghost', onStart() { roomId = PF.room; $('lobby').hidden = true; startGame(); } });
    loadHistory();
  }
  const REASONS = { six: '6 Kugeln', resign: 'aufgegeben', limit: 'Zuglimit' };
  async function loadHistory() {
    try {
      const list = await PF.history();
      if (!list.length) return;
      $('historyList').innerHTML = list.slice(0, 10).map((h) => {
        const res = { draw: ['Remis', ''], win: ['Sieg', 'win'], loss: ['Niederlage', 'loss'] }[h.result];
        const d = new Date(h.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        return `<li><span>gegen <b>${esc(h.opp)}</b> <span class="when">· ${d} · ${REASONS[h.reason] || ''}</span></span><span class="res ${res[1]}">${res[0]}</span></li>`;
      }).join('');
      $('historyBox').hidden = false;
    } catch {}
  }

  // ---------- Geometrie ----------
  const U = 66, C = 350, H = Math.sqrt(3) / 2, BALL = 28;
  let flip = false;
  const vec = (d) => { const [dq, dr] = R.DIRS[d]; let x = (dq + dr / 2) * U, y = dr * H * U; if (flip) { x = -x; y = -y; } return [x, y]; };
  const pos = (i) => {
    const [q, r] = R.CELLS[i];
    let x = (q + r / 2) * U, y = r * H * U;
    if (flip) { x = -x; y = -y; }
    return [C + x, C + y];
  };

  const board = $('board');
  let layer;
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const hexPath = (rad) => 'M' + [0, 1, 2, 3, 4, 5].map((k) => { const a = k * Math.PI / 3; return `${(C + Math.cos(a) * rad).toFixed(1)},${(C + Math.sin(a) * rad).toFixed(1)}`; }).join('L') + 'Z';

  function drawBoard() {
    board.innerHTML = `
      <defs>
        <linearGradient id="mahog" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8a3a1f"/><stop offset=".45" stop-color="#6c2914"/><stop offset="1" stop-color="#4b1a0b"/>
        </linearGradient>
        <radialGradient id="sheen" cx=".3" cy=".2" r=".9">
          <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.11" numOctaves="4" seed="11"/>
          <feColorMatrix values="0 0 0 0 .16  0 0 0 0 .04  0 0 0 0 .01  1.6 0 0 0 -.62"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <radialGradient id="wBall" cx=".36" cy=".3" r=".75">
          <stop offset="0" stop-color="#fffaf0"/><stop offset=".4" stop-color="#ecdfc4"/><stop offset=".85" stop-color="#c9b38a"/><stop offset="1" stop-color="#a68f66"/>
        </radialGradient>
        <radialGradient id="bBall" cx=".36" cy=".3" r=".75">
          <stop offset="0" stop-color="#9c8a7c"/><stop offset=".35" stop-color="#4b3d35"/><stop offset=".85" stop-color="#2a201b"/><stop offset="1" stop-color="#160f0c"/>
        </radialGradient>
        <radialGradient id="dimple" cx=".5" cy=".42" r=".6">
          <stop offset="0" stop-color="#2e0f04"/><stop offset=".8" stop-color="#4a1909"/><stop offset="1" stop-color="#8a3f1e"/>
        </radialGradient>
        <filter id="shadow" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#1a0500" flood-opacity=".55"/>
        </filter>
      </defs>`;
    el('path', { d: hexPath(342), fill: '#3a1308' }, board);
    el('path', { d: hexPath(336), fill: 'url(#mahog)' }, board);
    el('path', { d: hexPath(336), fill: '#000', filter: 'url(#grain)' }, board);
    el('path', { d: hexPath(312), fill: 'none', stroke: '#e8cc9c', 'stroke-opacity': .35, 'stroke-width': 2 }, board);
    const holes = el('g', {}, board);
    for (let i = 0; i < R.N; i++) {
      const [x, y] = pos(i);
      el('circle', { cx: x, cy: y, r: 25, fill: 'url(#dimple)' }, holes);
      el('circle', { cx: x, cy: y + 1.5, r: 25, fill: 'none', stroke: '#e8cc9c', 'stroke-opacity': .22, 'stroke-width': 1.2 }, holes);
    }
    el('path', { d: hexPath(336), fill: 'url(#sheen)', 'pointer-events': 'none' }, board);
    layer = el('g', {}, board);
  }

  function ball(parent, i, color, cls = '') {
    const [x, y] = pos(i);
    const g = el('g', { class: `stone ${cls}`, 'data-i': i }, parent);
    const inner = el('g', { filter: 'url(#shadow)' }, g);
    const light = color === 2;
    el('circle', { class: 'body', cx: x, cy: y, r: BALL, fill: `url(#${light ? 'wBall' : 'bBall'})`, stroke: light ? '#8c7652' : '#0e0907', 'stroke-width': 1 }, inner);
    el('ellipse', { cx: x - 9, cy: y - 11, rx: 9, ry: 5, fill: '#fff', opacity: light ? .65 : .2, transform: `rotate(-30 ${x - 9} ${y - 11})` }, inner);
    return g;
  }

  // ---------- Spielzustand ----------
  let S = null, prevMoves = -1, sel = [], resultDismissed = false;
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function legalDirs(g, me) {
    return [0, 1, 2, 3, 4, 5].map((d) => ({ d, r: R.check(g.board, me, sel, d) }));
  }

  function render() {
    if (!S) return;
    const g = S.game, me = S.you, opp = 3 - me;
    if (flip !== (me === 2)) { flip = me === 2; drawBoard(); }
    const both = !!(S.players[1] && S.players[2]);
    const myTurn = g.turn === me && !g.winner && both;
    if (!myTurn || !R.line(g.board, me, sel)) sel = myTurn ? sel.filter((i) => g.board[i] === me) : [];
    if (sel.length && !R.line(g.board, me, sel)) sel = [];

    layer.innerHTML = '';
    const fresh = g.last && g.moves !== prevMoves && prevMoves >= 0 && !reduceMotion();
    const moved = new Set(), [vx, vy] = g.last ? vec(g.last.dir) : [0, 0];
    if (g.last) {
      for (const p of g.last.from) moved.add(R.NB[p][g.last.dir]);
      for (const p of g.last.pushed) if (R.NB[p][g.last.dir] >= 0) moved.add(R.NB[p][g.last.dir]);
      // Spur des letzten Zugs
      for (const p of g.last.from) { const [x, y] = pos(p); el('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#ffd88a', 'stroke-opacity': .6, 'stroke-width': 2.5, 'stroke-dasharray': '3 4' }, layer); }
    }
    g.board.forEach((c, i) => {
      if (!c) return;
      const s = ball(layer, i, c, sel.includes(i) ? 'sel' : '');
      if (fresh && moved.has(i) && s.animate) s.animate([{ transform: `translate(${-vx}px, ${-vy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,.8,.3,1)' });
    });
    // heruntergefallene Kugel
    if (fresh && g.last.off && g.last.fell >= 0) {
      const gh = ball(layer, g.last.fell, 3 - g.last.color, '');
      gh.setAttribute('pointer-events', 'none');
      if (gh.animate) gh.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${vx * 1.6}px, ${vy * 1.6}px) scale(.6)`, opacity: 0 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
      setTimeout(() => gh.remove(), 700);
    }
    // Auswahl-Ringe
    for (const i of sel) { const [x, y] = pos(i); el('circle', { cx: x, cy: y, r: BALL + 4, fill: 'none', stroke: '#ffd88a', 'stroke-width': 4, 'pointer-events': 'none' }, layer); }
    // Klickflächen
    const hits = el('g', {}, layer);
    for (let i = 0; i < R.N; i++) {
      const [x, y] = pos(i);
      el('circle', { class: 'hit', cx: x, cy: y, r: 32, fill: 'transparent' }, hits).addEventListener('click', () => onCell(i));
    }
    // Richtungspfeile rund um die Auswahl
    if (myTurn && sel.length) {
      const pts = sel.map(pos), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      for (const { d, r } of legalDirs(g, me)) {
        const [dx, dy] = vec(d), len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        const reach = Math.max(...pts.map(([x, y]) => (x - cx) * ux + (y - cy) * uy));
        const ax = cx + ux * (reach + U * 0.98), ay = cy + uy * (reach + U * 0.98);
        const a = el('g', { class: `arrow ${r.err ? 'bad' : ''} ${r.push && r.push.length ? 'push' : ''}` }, layer);
        el('circle', { class: 'ab', cx: ax, cy: ay, r: 22 }, a);
        el('circle', { cx: ax, cy: ay, r: 34, fill: 'transparent' }, a); // größere Tippfläche
        const ang = Math.atan2(uy, ux) * 180 / Math.PI;
        el('path', { d: `M${ax - 9} ${ay - 9}L${ax + 8} ${ay}L${ax - 9} ${ay + 9}`, fill: 'none', stroke: '#3a1a0c', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `rotate(${ang} ${ax} ${ay})` }, a);
        a.addEventListener('click', (e) => { e.stopPropagation(); if (r.err) return toast(r.err); move(d); });
      }
    }
    prevMoves = g.moves;

    // Spielerleisten: wie viele Kugeln des Mitspielers schon vom Brett
    for (const c of [1, 2]) {
      const box = $(`p${c}`), pl = S.players[c];
      box.querySelector('.pname').innerHTML = pl ? `${esc(pl.name)}${c === me ? ' <small>(du)</small>' : ''}` : '<small>wartet …</small>';
      const n = g.off[3 - c];
      box.querySelector('.hand').innerHTML = `<span class="offtray" title="${n} von 6 Kugeln geschoben">${[0, 1, 2, 3, 4, 5].map((k) => `<i class="${k < n ? 'on' : ''} c${3 - c}"></i>`).join('')}</span>`;
      box.classList.toggle('turn', !g.winner && g.turn === c && both);
      box.classList.toggle('offline', !!pl && !pl.online);
    }
    const sc = S.score || [0, 0, 0];
    const bump = $('score').textContent !== `${sc[1]} : ${sc[2]}`;
    $('score').textContent = `${sc[1]} : ${sc[2]}`;
    if (bump && g.winner) { $('score').classList.remove('pop'); void $('score').offsetWidth; $('score').classList.add('pop'); }
    $('tallyLabel').textContent = S.draws ? `Siege · ${S.draws} Remis` : 'Siege';

    const oppName = S.players[opp] ? esc(S.players[opp].name) : 'Mitspieler';
    let st;
    if (!S.players[opp]) st = 'Warte auf deinen Mitspieler …';
    else if (g.winner) st = g.winner === -1 ? 'Remis.' : g.winner === me ? '<b>Gewonnen!</b>' : `${oppName} hat gewonnen.`;
    else if (myTurn) {
      if (!sel.length) st = 'Du bist dran: Tippe 1–3 eigene Kugeln in einer Reihe an.';
      else st = `${sel.length} Kugel${sel.length > 1 ? 'n' : ''} gewählt – jetzt einen Pfeil antippen${sel.length < 3 ? ' oder weitere Kugel wählen' : ''}.`;
      if (g.last && g.last.off && g.last.color === opp) st = `<b>Autsch:</b> ${oppName} hat eine Kugel vom Brett geschoben. ` + st;
    } else st = `${oppName} ist am Zug …`;
    if (S.players[opp] && !S.players[opp].online && !g.winner) st += ' <span style="opacity:.6">(nicht verbunden)</span>';
    $('status').innerHTML = st;

    invite.show(!S.players[opp]);
    $('resignBtn').hidden = !!g.winner || !S.players[opp];
    $('againBtn').hidden = !g.winner;
    if (!g.winner) resultDismissed = false;
    $('result').hidden = !g.winner || resultDismissed;
    if (g.winner) {
      $('resultTitle').textContent = g.winner === -1 ? 'Remis' : g.winner === me ? 'Gewonnen! 🎉' : 'Verloren';
      const on = S.players[opp]?.name || 'Mitspieler';
      $('resultText').textContent = {
        six: g.winner === me ? `Sechs Kugeln vom Brett – nach ${Math.ceil(g.moves / 2)} Zügen.` : `${on} hat sechs deiner Kugeln vom Brett geschoben.`,
        resign: g.winner === me ? `${on} hat aufgegeben.` : 'Du hast aufgegeben.',
        limit: '200 Züge je Spieler ohne Sieger.',
      }[g.reason] || '';
      $('resultScore').textContent = `Stand: Du ${sc[me]} : ${sc[opp]} ${on}` + (S.draws ? ` · ${S.draws} Remis` : '');
      const iWant = S.rematch.includes(me), theyWant = S.rematch.includes(opp);
      $('rematchBtn').disabled = iWant;
      $('rematchBtn').textContent = $('againBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('rematchHint').textContent = theyWant && !iWant ? `${on} will eine Revanche!` : 'Bei einer Revanche werden die Farben getauscht.';
    }
  }

  function move(d) {
    const s = sel.slice(); sel = [];
    PF.act({ t: 'move', sel: s, dir: d });
  }

  // Antippen: eigene Kugel = Auswahl ändern; freies/fremdes Feld = dorthin ziehen, wenn eindeutig
  function onCell(i) {
    if (!S) return;
    const g = S.game, me = S.you;
    if (!S.players[3 - me]) return toast('Warte, bis dein Mitspieler da ist.');
    if (g.winner) return;
    if (g.turn !== me) return toast('Dein Mitspieler ist am Zug.');
    if (g.board[i] === me) {
      if (sel.includes(i)) {
        const L = R.line(g.board, me, sel);
        sel = L && L.cells.length === 3 && L.cells[1] === i ? [i] : sel.filter((x) => x !== i);
      } else if (R.line(g.board, me, sel.concat(i))) sel = sel.concat(i);
      else if (sel.length === 1) {
        // erste und letzte Kugel einer Dreierreihe: die mittlere automatisch dazunehmen
        const s0 = sel[0];
        const d = [0, 1, 2, 3, 4, 5].find((k) => R.NB[s0][k] >= 0 && R.NB[R.NB[s0][k]][k] === i);
        const mid = d !== undefined ? R.NB[s0][d] : -1;
        sel = mid >= 0 && g.board[mid] === me ? [s0, mid, i] : [i];
      } else sel = [i];
      return render();
    }
    if (!sel.length) return toast('Tippe zuerst eine eigene Kugel an.');
    // Ziel antippen: passende Richtung suchen (Reihenzug bevorzugt)
    const opts = legalDirs(g, me).filter(({ r }) => !r.err)
      .filter(({ d, r }) => r.move.map((m) => R.NB[m][d]).includes(i) || r.push.map((p) => R.NB[p][d]).includes(i));
    if (opts.length) { opts.sort((a, b) => b.r.push.length - a.r.push.length); return move(opts[0].d); }
    sel = []; render();
  }

  function connect() {
    PF.connect({
      onState(m) { S = m; render(); },
      onError: (msg) => { toast(msg); render(); },
      onFull() { $('game').hidden = true; $('full').hidden = false; },
      onBadLink(msg) { $('status').textContent = msg; },
      onDisconnect() { $('status').textContent = 'Verbindung unterbrochen – verbinde neu …'; },
    });
  }

  function startGame() {
    $('game').hidden = false;
    drawBoard();
    invite = PF.invite($('board').parentElement);
    $('copyBtn').onclick = () => PF.copyLink();
    $('resignBtn').onclick = () => { if (confirm('Wirklich aufgeben?')) PF.resign(); };
    $('rematchBtn').onclick = $('againBtn').onclick = () => PF.rematch();
    $('closeResult').onclick = () => { resultDismissed = true; render(); };
    connect();
  }

  window.__abaloneState = () => ({ S, sel }); // nur zur Fehlersuche
  if (roomId && PF.name) startGame();
  else showLobby();
})();
