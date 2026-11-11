// Airhockey – Echtzeit auf dem Server. Physik: public/physics.js (auch im Browser zur Vorhersage).
// Spieler 0 verteidigt unten, Spieler 1 oben (jeder sieht sein Tor unten). Erster mit 7 Toren gewinnt.
// Anstoß: Runde 1 Spieler 0, danach abwechselnd. Nach einem Tor bekommt der Getroffene den Puck.
const F = require('./public/physics.js');

const PAUSE_GOAL = 1.4;   // Sekunden nach einem Tor
const PAUSE_START = 2.0;  // Countdown vor dem Anstoß
const HALF_LIMIT = 7;     // Zeitregel: höchstens 7 s in einer Hälfte, sonst wechselt der Puck

module.exports = {
  title: 'Airhockey',
  blurb: 'Echtzeit-Duell: wer zuerst 7 Tore schießt.',

  create() {
    return { round: 0, phase: 'waiting', score: [0, 0], puck: F.placePuck(0), pads: F.newPads(), wait: 0, winner: -2, reason: '', lastGoal: -1, seq: 0, hits: 0 };
  },

  start(_prev, round) {
    const serve = (round - 1) % 2;
    return { round, phase: 'ready', score: [0, 0], puck: F.placePuck(serve), pads: F.newPads(), wait: PAUSE_START, winner: -2, reason: '', lastGoal: -1, seq: 0, hits: 0 };
  },

  // Schlägerposition vom Spieler (Tischkoordinaten)
  input(s, seat, d) {
    const x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const [cx, cy] = F.clampPad(seat, x, y);
    s.pads[seat].tx = cx; s.pads[seat].ty = cy;
  },

  // Ein Takt. Gibt true zurück, wenn sich etwas Wichtiges geändert hat (Tor, Ende, Pause).
  tick(s, dt, core) {
    if (s.phase === 'over' || s.phase === 'waiting') return false;
    const online = core.players.every((p) => p && p.online);
    if (!online) {
      if (s.phase !== 'paused') { s.resume = s.phase; s.phase = 'paused'; return true; }
      return false;
    }
    if (s.phase === 'paused') { s.phase = 'ready'; s.wait = PAUSE_START; return true; }
    s.seq++;
    if (s.phase === 'ready' || s.phase === 'goal') {
      // Schläger dürfen sich bewegen, der Puck ruht
      F.step({ x: -999, y: -999, vx: 0, vy: 0 }, s.pads, dt, { noGoal: true });
      s.wait -= dt;
      if (s.wait <= 0) { s.phase = 'play'; s.note = ''; s.sideT = 0; return true; }
      return false;
    }
    const ev = F.step(s.puck, s.pads, dt);
    // Zeitregel: Liegt der Puck zu lange in einer Hälfte (z. B. weil jemand nicht spielt), bekommt ihn der andere
    const side = s.puck.y > F.H / 2 ? 0 : 1;
    if (side !== s.side) { s.side = side; s.sideT = 0; } else s.sideT = (s.sideT || 0) + dt;
    if (!(ev && ev.goal !== undefined) && s.sideT > HALF_LIMIT) {
      s.puck = F.placePuck(1 - side); s.side = 1 - side; s.sideT = 0;
      s.phase = 'ready'; s.wait = 1.2; s.note = 'time';
      return true;
    }
    if (ev && ev.hit) s.hits++;
    if (ev && ev.goal !== undefined) {
      const scorer = ev.goal;
      s.score[scorer]++;
      s.lastGoal = scorer;
      if (s.score[scorer] >= F.WIN) { s.phase = 'over'; s.winner = scorer; s.reason = 'goals'; return true; }
      s.phase = 'goal'; s.wait = PAUSE_GOAL; s.note = '';
      s.puck = F.placePuck(1 - scorer); // Getroffener bekommt den Puck
      return true;
    }
    return false;
  },

  resign(s, seat) {
    if (s.phase === 'over' || s.round === 0) return;
    s.phase = 'over'; s.winner = 1 - seat; s.reason = 'resign';
  },

  result(s) {
    if (s.phase !== 'over') return null;
    const w = s.winner;
    return { winner: w, reason: s.reason, summary: `${s.score[w]}:${s.score[1 - w]}` };
  },

  // Kleine Momentaufnahme für jeden Takt (gerundet, damit sie klein bleibt)
  snapshot(s) {
    const r = Math.round;
    return {
      n: s.seq, ph: s.phase, w: Math.max(0, Math.round(s.wait * 10) / 10),
      p: [r(s.puck.x), r(s.puck.y), r(s.puck.vx), r(s.puck.vy)],
      a: [r(s.pads[0].x), r(s.pads[0].y), r(s.pads[0].vx), r(s.pads[0].vy)],
      b: [r(s.pads[1].x), r(s.pads[1].y), r(s.pads[1].vx), r(s.pads[1].vy)],
      s: s.score,
    };
  },

  view(s, seat, core) {
    return {
      you: seat,
      players: core.players.map((p) => p && { name: p.name, online: p.online }),
      phase: s.phase, note: s.note || '', score: s.score, winner: s.winner, reason: s.reason, lastGoal: s.lastGoal, target: F.WIN,
      match: core.score, draws: core.draws, rematch: core.rematch, round: core.round,
      snap: this.snapshot(s),
    };
  },
};
