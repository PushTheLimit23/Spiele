/* Halma – Browser-Teil */
(() => {
  const R = window.Halma;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- Gemeinsamer Kern: Spieler-ID, Name, Raumcode, Verbindung, Teilen, Chat ----------
  const PF = Platform.init('halma');
  const esc = PF.esc;
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
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
    if (brokenInvite) {
      $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Lass ihn dir bitte noch einmal schicken – oder starte hier eine eigene Partie.';
    } else if (roomId) {
      $('lobbyText').textContent = 'Du wurdest zu einer Partie Halma eingeladen. Wie heißt du?';
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
    // Allein gegen den Computer (Kasten aus dem gemeinsamen Kern)
    PF.cpuBox($('nameForm'), { input: $('nameInput'), btnClass: 'btn ghost', onStart() { roomId = PF.room; $('lobby').hidden = true; startGame(); } });
    loadHistory();
  }

  const REASONS = { goal: 'Ziel erreicht', resign: 'aufgegeben', limit: 'Zuglimit', blocked: 'blockiert' };
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
  // Axial (q, r) -> Brettkoordinaten. Jeder sieht seine eigene Heimat unten (Wenge-Spieler: Brett gedreht).
  const U = 38, C = 350, H = Math.sqrt(3) / 2;
  let flip = false;
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

  // Sternumriss: Spitzen bei ±30°/±90°/±150°, Innenecken dazwischen
  function starPath(k) {
    const pts = [];
    for (let a = 0; a < 12; a++) {
      const ang = (-90 + a * 30) * Math.PI / 180;
      const rad = (a % 2 === 0 ? 8 * H : 4) * U * k;
      pts.push(`${(C + Math.cos(ang) * rad).toFixed(1)},${(C + Math.sin(ang) * rad).toFixed(1)}`);
    }
    return 'M' + pts.join('L') + 'Z';
  }
  // Dreieck einer Heimat (für die Tönung)
  function homePath(color) {
    const cells = R.HOME[color].map(pos);
    const cx = cells.reduce((s, p) => s + p[0], 0) / cells.length, cy = cells.reduce((s, p) => s + p[1], 0) / cells.length;
    // Eckzellen = die drei am weitesten vom Schwerpunkt entfernten
    const far = cells.map((p) => [p, Math.hypot(p[0] - cx, p[1] - cy)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
    const grow = (p) => [cx + (p[0] - cx) * 1.42, cy + (p[1] - cy) * 1.42];
    return 'M' + far.map(grow).map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
  }

  function drawBoard() {
    board.innerHTML = `
      <defs>
        <linearGradient id="mahog" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8a3a1f"/><stop offset=".45" stop-color="#6c2914"/><stop offset="1" stop-color="#4b1a0b"/>
        </linearGradient>
        <linearGradient id="inlay" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#a14a26"/><stop offset=".5" stop-color="#86351a"/><stop offset="1" stop-color="#5f220e"/>
        </linearGradient>
        <radialGradient id="sheen" cx=".3" cy=".2" r=".9">
          <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.11" numOctaves="4" seed="11"/>
          <feColorMatrix values="0 0 0 0 .16  0 0 0 0 .04  0 0 0 0 .01  1.6 0 0 0 -.62"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <radialGradient id="wStone" cx=".38" cy=".32" r=".75">
          <stop offset="0" stop-color="#f6efe1"/><stop offset=".45" stop-color="#e6d8bb"/>
          <stop offset=".85" stop-color="#cfba93"/><stop offset="1" stop-color="#b29b72"/>
        </radialGradient>
        <radialGradient id="bStone" cx=".38" cy=".32" r=".75">
          <stop offset="0" stop-color="#8f7d70"/><stop offset=".4" stop-color="#4b3d35"/>
          <stop offset=".85" stop-color="#2f2520"/><stop offset="1" stop-color="#1c1512"/>
        </radialGradient>
        <radialGradient id="hole" cx=".5" cy=".4" r=".6">
          <stop offset="0" stop-color="#1c0802"/><stop offset=".75" stop-color="#2e0f04"/><stop offset="1" stop-color="#7a3a1c"/>
        </radialGradient>
        <filter id="shadow" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#1a0500" flood-opacity=".55"/>
        </filter>
        <clipPath id="disc"><circle cx="${C}" cy="${C}" r="342"/></clipPath>
      </defs>
      <circle cx="${C}" cy="${C}" r="346" fill="#3a1308"/>
      <circle cx="${C}" cy="${C}" r="342" fill="url(#mahog)"/>
      <circle cx="${C}" cy="${C}" r="342" filter="url(#grain)" fill="#000"/>
      <circle cx="${C}" cy="${C}" r="341.5" fill="none" stroke="#c98a5a" stroke-opacity=".25"/>
    `;
    const star = starPath(1.17);
    el('path', { d: star, fill: 'url(#inlay)' }, board);
    el('path', { d: star, filter: 'url(#grain)', fill: '#000', opacity: .7 }, board);
    // Heimat-Dreiecke getönt: Bein hell, Wenge dunkel
    el('path', { d: homePath(1), fill: '#efe3c8', opacity: .3, stroke: '#efe3c8', 'stroke-opacity': .5, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, board);
    el('path', { d: homePath(2), fill: '#1c1512', opacity: .42, stroke: '#1c1512', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, board);
    el('path', { d: star, fill: 'none', stroke: '#e8cc9c', 'stroke-opacity': .55, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, board);
    // Löcher
    const holes = el('g', {}, board);
    for (let i = 0; i < R.N; i++) {
      const [x, y] = pos(i);
      el('circle', { cx: x, cy: y, r: 7.5, fill: 'url(#hole)' }, holes);
      el('circle', { cx: x, cy: y + 1, r: 7.5, fill: 'none', stroke: '#e8cc9c', 'stroke-opacity': .25, 'stroke-width': 1 }, holes);
    }
    el('circle', { cx: C, cy: C, r: 342, fill: 'url(#sheen)', 'pointer-events': 'none' }, board);
    layer = el('g', {}, board);
  }

  function stone(parent, i, color, cls = '') {
    const [x, y] = pos(i);
    const g = el('g', { class: `stone ${cls}`, 'data-i': i }, parent);
    const inner = el('g', { filter: 'url(#shadow)' }, g);
    const white = color === 1;
    el('circle', { class: 'body', cx: x, cy: y, r: 15.5, fill: `url(#${white ? 'wStone' : 'bStone'})`, stroke: white ? '#8c7652' : '#100b09', 'stroke-width': 1 }, inner);
    el('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke: white ? '#fff' : '#fff', 'stroke-opacity': white ? .7 : .07, 'stroke-width': .8 }, inner);
    el('ellipse', { cx: x - 5, cy: y - 6, rx: 5, ry: 2.8, fill: '#fff', opacity: white ? .55 : .15, transform: `rotate(-30 ${x - 5} ${y - 6})` }, inner);
    return g;
  }

  // ---------- Spielzustand ----------
  let S = null, prevBoard = null, prevMoves = -1, selected = -1, resultDismissed = false;
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function render() {
    if (!S) return;
    const g = S.game, me = S.you, opp = 3 - me;
    if (flip !== (me === 2)) { flip = me === 2; drawBoard(); prevBoard = null; }
    const both = !!(S.players[1] && S.players[2]);
    const myTurn = g.turn === me && !g.winner && both;
    if (selected >= 0 && (!myTurn || g.board[selected] !== me)) selected = -1;
    const tg = selected >= 0 ? R.targets(g, selected, me) : new Map();

    layer.innerHTML = '';
    // letzter Zug: Weg gestrichelt
    if (g.last && g.last.path) {
      el('path', { class: 'lastpath', d: 'M' + g.last.path.map((i) => pos(i).map((v) => v.toFixed(1)).join(',')).join('L') }, layer);
      const [fx, fy] = pos(g.last.from);
      el('circle', { cx: fx, cy: fy, r: 11, fill: 'none', stroke: '#ffd88a', 'stroke-opacity': .7, 'stroke-width': 2.5, 'stroke-dasharray': '3 4' }, layer);
    }
    // Steine
    const fresh = prevBoard && g.last && g.moves !== prevMoves && prevBoard[g.last.to] !== g.board[g.last.to];
    g.board.forEach((c, i) => {
      if (!c) return;
      let cls = '';
      if (i === selected) cls += ' sel';
      if (myTurn && c === me) cls += ' movable';
      const s = stone(layer, i, c, cls);
      if (fresh && i === g.last.to && !reduceMotion() && s.animate) hop(s, g.last.path);
    });
    // Ziele des gewählten Steins
    for (const [t, path] of tg) {
      const [x, y] = pos(t);
      el('circle', { class: `target ${path.length > 2 ? 'jump' : 'step'}`, cx: x, cy: y, r: 8, stroke: '#fff4d6', 'stroke-width': 2.5 }, layer);
    }
    // Klickflächen
    const hits = el('g', {}, layer);
    for (let i = 0; i < R.N; i++) {
      const [x, y] = pos(i);
      const h = el('circle', { class: 'hit', cx: x, cy: y, r: 19, fill: 'transparent' }, hits);
      h.addEventListener('click', () => onCell(i));
    }
    prevBoard = g.board.slice(); prevMoves = g.moves;

    // Spielerleisten
    for (const c of [1, 2]) {
      const box = $(`p${c}`), pl = S.players[c];
      box.querySelector('.pname').innerHTML = pl ? `${esc(pl.name)}${c === me ? ' <small>(du)</small>' : ''}` : '<small>wartet …</small>';
      box.querySelector('.hand').textContent = `${R.inGoal(g, c)}/10 im Ziel`;
      box.classList.toggle('turn', !g.winner && g.turn === c && both);
      box.classList.toggle('offline', !!pl && !pl.online);
    }
    const sc = S.score || [0, 0, 0];
    const bump = $('score').textContent !== `${sc[1]} : ${sc[2]}`;
    $('score').textContent = `${sc[1]} : ${sc[2]}`;
    if (bump && g.winner) { $('score').classList.remove('pop'); void $('score').offsetWidth; $('score').classList.add('pop'); }
    $('tallyLabel').textContent = S.draws ? `Siege · ${S.draws} Remis` : 'Siege';

    // Status
    const oppName = S.players[opp] ? esc(S.players[opp].name) : 'Mitspieler';
    let st;
    if (!S.players[opp]) st = 'Warte auf deinen Mitspieler …';
    else if (g.winner) st = g.winner === -1 ? 'Remis.' : g.winner === me ? '<b>Gewonnen!</b>' : `${oppName} hat gewonnen.`;
    else if (myTurn) {
      st = selected >= 0 ? 'Wohin soll der Stein? <span style="opacity:.6">(Gelb = Sprung)</span>' : 'Du bist dran: Wähle einen Stein.';
      if (g.passed === opp) st = `${oppName} kann nicht ziehen und setzt aus. ` + st;
    } else {
      st = `${oppName} ist am Zug …`;
      if (g.passed === me) st = 'Du kannst nicht ziehen und setzt aus. ' + st;
    }
    if (S.players[opp] && !S.players[opp].online && !g.winner) st += ' <span style="opacity:.6">(nicht verbunden)</span>';
    $('status').innerHTML = st;

    // Einladung & Ergebnis
    invite.show(!S.players[opp]);
    $('resignBtn').hidden = !!g.winner || !S.players[opp];
    $('againBtn').hidden = !g.winner;
    if (!g.winner) resultDismissed = false;
    $('result').hidden = !g.winner || resultDismissed;
    if (g.winner) {
      $('resultTitle').textContent = g.winner === -1 ? 'Remis' : g.winner === me ? 'Gewonnen! 🎉' : 'Verloren';
      const on = S.players[opp]?.name || 'Mitspieler';
      $('resultText').textContent = {
        goal: g.winner === me ? `Alle Steine im Ziel – nach ${Math.ceil(g.moves / 2)} Zügen.` : `${on} hat das Ziel zuerst erreicht.`,
        resign: g.winner === me ? `${on} hat aufgegeben.` : 'Du hast aufgegeben.',
        limit: '300 Züge je Spieler ohne Sieger.',
        blocked: 'Keiner kann mehr ziehen.',
      }[g.reason] || '';
      $('resultScore').textContent = `Stand: Du ${sc[me]} : ${sc[opp]} ${on}` + (S.draws ? ` · ${S.draws} Remis` : '');
      const iWant = S.rematch.includes(me), theyWant = S.rematch.includes(opp);
      $('rematchBtn').disabled = iWant;
      $('rematchBtn').textContent = $('againBtn').textContent = iWant ? 'Warte auf Zusage …' : 'Revanche';
      $('rematchHint').textContent = theyWant && !iWant ? `${on} will eine Revanche!` : 'Bei einer Revanche werden die Farben getauscht.';
    }
  }

  // Stein springt Feld für Feld den Weg entlang
  function hop(s, path) {
    const [tx, ty] = pos(path[path.length - 1]);
    const frames = path.map((i, k) => {
      const [x, y] = pos(i);
      const lift = k > 0 && k < path.length - 1 ? ' scale(1.12)' : '';
      return { transform: `translate(${x - tx}px, ${y - ty}px)${lift}`, offset: k / (path.length - 1) };
    });
    s.style.transformBox = 'fill-box'; s.style.transformOrigin = 'center';
    s.animate(frames, { duration: Math.min(1400, 230 * (path.length - 1)), easing: 'ease-in-out' });
  }

  function onCell(i) {
    if (!S) return;
    const g = S.game, me = S.you;
    if (!S.players[3 - me]) return toast('Warte, bis dein Mitspieler da ist.');
    if (g.winner) return;
    if (g.turn !== me) return toast('Dein Mitspieler ist am Zug.');
    if (g.board[i] === me) {
      if (!R.targets(g, i, me).size) {
        selected = -1; render();
        return toast(R.IN_GOAL[me].has(i) ? 'Dieser Stein ist im Ziel und kann gerade nicht weiter.' : 'Dieser Stein kann nicht ziehen.');
      }
      selected = selected === i ? -1 : i;
      return render();
    }
    if (selected >= 0 && !g.board[i]) {
      if (!R.targets(g, selected, me).has(i)) {
        return toast(R.IN_GOAL[me].has(selected) && R.reach(g.board, selected).has(i) ? 'Steine im Ziel dürfen es nicht mehr verlassen.' : 'Dorthin geht es nicht.');
      }
      const from = selected; selected = -1;
      return PF.act({ t: 'move', from, to: i });
    }
    if (selected < 0) toast('Wähle zuerst einen deiner Steine.');
  }

  // ---------- Verbindung ----------
  function connect() {
    PF.connect({
      onState(m) { S = m; render(); },
      onError: toast,
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

  window.__halmaState = () => S; // nur zur Fehlersuche
  if (roomId && PF.name) startGame();
  else showLobby();
})();
