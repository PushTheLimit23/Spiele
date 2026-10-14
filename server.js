// Spiele-Sammlung – gemeinsamer Server für alle Spiele
//
// Der Kern kümmert sich um alles, was jedes Spiel braucht:
//   Räume per Link, Spieler-ID, Wiederverbinden, "Spiel ist voll", Revanche,
//   Punktestand, Spielhistorie (Datei im Volume), Aufräumen, Umleitung alter Subdomains.
// Jedes Spiel liegt in games/<id>/ und liefert nur:
//   game.js  – Regeln auf dem Server (siehe games/README.md)
//   public/  – Brett und Oberfläche im Browser
//
// Ein neues Spiel = neuer Ordner unter games/. Kein neues Repo, keine neue Coolify-Ressource.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const GAMES_DIR = path.join(__dirname, 'games');
const HISTORY_FILE = path.join(DATA_DIR, 'history.jsonl');
const MAX_HISTORY = 20000;
const ROOM_TTL = 24 * 3600 * 1000; // verlassene Räume nach 24 h löschen

// Alte Subdomains -> Spiel. Beispiel: vier.deine-domain.de -> spiele.deine-domain.de/vier/
const PRIMARY = process.env.PRIMARY_SUBDOMAIN || 'spiele';
const LEGACY = { vier: 'vier', dame: 'dame', muehle: 'muehle', wort: 'wort', wortraten: 'wort' };

// ---------- Spiele laden ----------
const GAMES = {};
for (const id of fs.readdirSync(GAMES_DIR).sort()) {
  const file = path.join(GAMES_DIR, id, 'game.js');
  if (!fs.existsSync(file)) continue;
  const g = require(file);
  g.id = id;
  GAMES[id] = g;
}

// ---------- Historie (eine JSON-Zeile pro beendeter Runde) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let history = [];
try {
  for (const line of fs.readFileSync(HISTORY_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { history.push(JSON.parse(line)); } catch { /* kaputte Zeile überspringen */ }
  }
} catch { /* Datei gibt es noch nicht */ }
if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

function addHistory(entry) {
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  fs.appendFile(HISTORY_FILE, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('Historie konnte nicht gespeichert werden:', err.message);
  });
}

function historyFor(clientId, gameId, limit = 25) {
  const out = [];
  for (let i = history.length - 1; i >= 0 && out.length < limit; i--) {
    const h = history[i];
    const you = h.ids.indexOf(clientId);
    if (you < 0 || (gameId && h.game !== gameId)) continue;
    out.push({
      ts: h.ts, game: h.game, title: GAMES[h.game]?.title || h.game,
      you, names: h.names, opp: h.names[1 - you],
      result: h.winner === -1 ? 'draw' : h.winner === you ? 'win' : 'loss',
      reason: h.reason || '', summary: h.summary || '',
    });
  }
  return out;
}

// ---------- Webserver ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function sendFile(res, file, fallback) {
  fs.readFile(file, (err, data) => {
    if (err) {
      if (fallback) return sendFile(res, fallback, null);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Datei sicher innerhalb eines Ordners auflösen (kein "../" nach draußen)
function inside(dir, rel) {
  const full = path.normalize(path.join(dir, rel));
  return full === dir || full.startsWith(dir + path.sep) ? full : null;
}

// Raumcode aus altem Link holen (?r=abc oder /r/abc)
function legacyRoom(url) {
  const q = url.searchParams.get('r');
  if (q) return q;
  const m = url.pathname.match(/^\/r\/([^/?#]+)/);
  return m ? m[1] : '';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  // Alte Subdomain? -> dauerhaft auf die Sammlung umleiten (verschickte Links funktionieren weiter)
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  const [sub, ...rest] = host.split('.');
  if (LEGACY[sub] && rest.length >= 2 && url.pathname !== '/health') {
    const r = legacyRoom(url);
    const target = `https://${PRIMARY}.${rest.join('.')}/${LEGACY[sub]}/` + (r ? `?r=${encodeURIComponent(r)}` : '');
    res.writeHead(301, { Location: target, 'Cache-Control': 'no-cache' });
    return res.end();
  }

  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }

  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

  if (p === '/api/games') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(Object.values(GAMES).map((g) => ({ id: g.id, title: g.title, blurb: g.blurb || '' }))));
  }

  if (p === '/api/history') {
    const id = String(url.searchParams.get('id') || '');
    const game = String(url.searchParams.get('game') || '');
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(id.length >= 8 ? historyFor(id, game) : []));
  }

  // Spiel: /<id>/...
  const seg = p.split('/')[1];
  if (GAMES[seg]) {
    if (p === '/' + seg) { res.writeHead(301, { Location: `/${seg}/${url.search}` }); return res.end(); }
    const dir = path.join(GAMES_DIR, seg, 'public');
    const rel = p.slice(seg.length + 2) || 'index.html';
    const file = inside(dir, rel);
    if (!file) { res.writeHead(403); return res.end(); }
    // Unbekannte Pfade innerhalb eines Spiels -> Spielseite
    return sendFile(res, file, path.join(dir, 'index.html'));
  }

  // Startseite und gemeinsame Dateien
  const file = inside(PUBLIC, p === '/' ? 'index.html' : p);
  if (!file) { res.writeHead(403); return res.end(); }
  return sendFile(res, file, path.join(PUBLIC, 'index.html'));
});

// ---------- Räume ----------
// room = { key, game (Modul), id, seats: [player|null, player|null], state, round,
//          score: [0,0], draws, rematch: Set<seat>, recorded, touched }
// player = { id, name, ws }
const rooms = new Map();

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || 'Gast';
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

// Was der Kern dem Spiel-Modul über den Raum verrät
function coreInfo(room) {
  return {
    round: room.round,
    players: room.seats.map((p) => p && { name: p.name, online: !!(p.ws && p.ws.readyState === 1) }),
    score: room.score.slice(),
    draws: room.draws,
    rematch: [...room.rematch],
    full: !!(room.seats[0] && room.seats[1]),
  };
}

function broadcast(room) {
  const core = coreInfo(room);
  room.seats.forEach((p, seat) => {
    if (p && p.ws) send(p.ws, { type: 'state', room: room.id, ...room.game.view(room.state, seat, core) });
  });
}

// Nach jedem Zug: Runde vorbei? -> Punktestand + Historie (genau einmal pro Runde)
function checkOver(room) {
  if (room.recorded) return;
  const r = room.game.result(room.state);
  if (!r) return;
  room.recorded = true;
  if (r.winner === -1) room.draws++;
  else room.score[r.winner]++;
  addHistory({
    ts: Date.now(), game: room.game.id, room: room.id, round: room.round,
    names: room.seats.map((p) => (p ? p.name : '?')),
    ids: room.seats.map((p) => (p ? p.id : null)),
    winner: r.winner, reason: r.reason || '', summary: r.summary || '',
  });
}

function startRound(room) {
  room.round++;
  room.state = room.game.start(room.state, room.round);
  room.rematch.clear();
  room.recorded = false;
}

function join(ws, m) {
  const game = GAMES[m.game];
  const id = String(m.room || '').toLowerCase();
  const pid = String(m.id || '').slice(0, 64);
  if (!game || !/^[a-z0-9]{4,16}$/.test(id) || pid.length < 8) {
    return send(ws, { type: 'error', code: 'link', msg: 'Ungültiger Spiel-Link.' });
  }
  const key = game.id + ':' + id;
  let room = rooms.get(key);
  if (!room) {
    room = { key, game, id, seats: [null, null], state: game.create(), round: 0,
      score: [0, 0], draws: 0, rematch: new Set(), recorded: false, touched: Date.now() };
    rooms.set(key, room);
  }
  let seat = room.seats.findIndex((p) => p && p.id === pid);
  if (seat < 0) seat = room.seats.findIndex((p) => !p);
  if (seat < 0) return send(ws, { type: 'full' });

  const old = room.seats[seat];
  if (old && old.ws && old.ws !== ws) { old.ws.replaced = true; try { old.ws.close(4000, 'Neu verbunden'); } catch {} }
  room.seats[seat] = { id: pid, name: cleanName(m.name), ws };
  ws.room = room; ws.seat = seat;
  room.touched = Date.now();

  if (game.join) game.join(room.state, seat, m.data || {}, coreInfo(room));
  if (room.round === 0 && room.seats[0] && room.seats[1]) startRound(room);
  broadcast(room);
}

function handle(ws, m) {
  if (m.type === 'join') return join(ws, m);
  const room = ws.room, seat = ws.seat;
  if (!room || room.seats[seat]?.ws !== ws) return;
  room.touched = Date.now();
  const game = room.game;

  if (m.type === 'rematch') {
    if (!game.result(room.state)) return;
    room.rematch.add(seat);
    if (room.rematch.size === 2 || (game.rematch === 'any' && room.seats[0] && room.seats[1])) startRound(room);
    return broadcast(room);
  }

  if (m.type === 'resign') {
    if (!game.resign || room.round === 0 || game.result(room.state)) return;
    game.resign(room.state, seat, coreInfo(room));
    checkOver(room);
    return broadcast(room);
  }

  // Spielspezifische Aktion (Zug, Farbe wählen, Wort setzen …)
  if (m.type === 'act') {
    const core = coreInfo(room);
    const needsBoth = game.needsBoth !== false;
    if (needsBoth && !core.full) return send(ws, { type: 'error', msg: 'Warte auf deinen Mitspieler.' });
    let err;
    try { err = game.action(room.state, seat, m.act || {}, core); }
    catch (e) { console.error(`[${game.id}] Fehler:`, e); err = 'Das hat nicht geklappt.'; }
    if (err) return send(ws, { type: 'error', msg: err });
    checkOver(room);
    return broadcast(room);
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    try { handle(ws, m); } catch (e) { console.error('Fehler:', e); }
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const p = room.seats[ws.seat];
    if (p && p.ws === ws) { p.ws = null; broadcast(room); }
  });
});

// Tote Verbindungen erkennen (z. B. Handy im Standby)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30_000);

// Verlassene Räume aufräumen
setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL;
  for (const [key, room] of rooms) {
    const online = room.seats.some((p) => p && p.ws && p.ws.readyState === 1);
    if (!online && room.touched < cutoff) rooms.delete(key);
  }
}, 3600 * 1000);

server.listen(PORT, () => console.log(`Spiele-Sammlung läuft auf Port ${PORT}: ${Object.keys(GAMES).join(', ')}`));
