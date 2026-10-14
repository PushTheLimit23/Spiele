// Test-Gerüst für alle Spiele: startet den Server, spielt mit simulierten Spielern.
// Aufruf: npm test   (benötigt das Paket "ws")
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3900 + Math.floor(Math.random() * 90);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'spiele-test-'));
const BASE = `http://localhost:${PORT}`;
let failed = 0, passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.log('  ✗', msg); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function get(p, headers = {}) {
  return new Promise((res, rej) => {
    http.get(BASE + p, { headers }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: d }));
    }).on('error', rej);
  });
}

// Simulierter Spieler
class Player {
  constructor(game, room, id, name, data) { Object.assign(this, { game, room, id, name, data, msgs: [], state: null }); }
  connect() {
    return new Promise((res) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.on('open', () => { this.ws.send(JSON.stringify({ type: 'join', game: this.game, room: this.room, id: this.id, name: this.name, data: this.data || {} })); });
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw); this.msgs.push(m);
        if (m.type === 'state') this.state = m;
        if (this._w && this._w.pred(m)) { const w = this._w; this._w = null; w.res(m); }
      });
      this.ws.on('close', (code) => { this.closed = code; });
      setTimeout(res, 150);
    });
  }
  next(pred = () => true, ms = 1500) {
    return new Promise((res, rej) => { this._w = { pred, res }; setTimeout(() => { if (this._w) { this._w = null; rej(new Error('Zeitüberschreitung')); } }, ms); });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async act(a) { this.send({ type: 'act', act: a }); await wait(90); return this.state; }
  async rematch() { this.send({ type: 'rematch' }); await wait(120); }
  lastError() { return [...this.msgs].reverse().find((m) => m.type === 'error'); }
  close() { try { this.ws.close(); } catch {} }
}

let n = 0;
const room = () => ('t' + (++n).toString().padStart(3, '0') + Math.random().toString(36).slice(2, 6)).slice(0, 8);
const pair = async (game, data1, data2) => {
  const r = room();
  const a = new Player(game, r, 'aaaaaaaaaa' + n, 'Anna', data1);
  const b = new Player(game, r, 'bbbbbbbbbb' + n, 'Ben', data2);
  await a.connect(); await b.connect(); await wait(100);
  return [a, b, r];
};

async function main() {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await wait(600);
  const ctx = { ok, wait, get, Player, pair, room, BASE, PORT, DATA };
  try {
    const only = process.argv[2];
    for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort()) {
      if (only && !f.startsWith(only)) continue;
      console.log('\n▶', f);
      try { await require(path.join(__dirname, f))(ctx); }
      catch (e) { failed++; console.log('  ✗ Abbruch:', e.message); }
    }
  } finally {
    srv.kill();
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed ? 1 : 0);
}
main();
