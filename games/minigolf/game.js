// Minigolf – Regeln auf dem Server
// 18 Bahnen. Pro Bahn spielt erst der eine Spieler, bis sein Ball im Loch ist, dann der andere.
// Wer anfängt, wechselt von Bahn zu Bahn (und bei jeder Revanche).
// Höchstens 6 Schläge pro Bahn – wer dann nicht eingelocht hat, bekommt 7.
// Wasser: Der Schlag zählt, der Ball kommt zurück an die Stelle, von der aus geschlagen wurde.
// Physik und Bahnen: public/course.js (läuft identisch im Browser).
const C = require('./public/course.js');

const N = C.HOLES.length;
const firstOn = (hole, round) => (hole + Math.max(round, 1) - 1) % 2;
const total = (row) => row.reduce((s, v) => s + (v || 0), 0);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function newRound(round) {
  const first = firstOn(0, round);
  return {
    round, hole: 0, turn: first, ball: C.HOLES[0].tee.slice(), cur: 0,
    strokes: [Array(N).fill(null), Array(N).fill(null)],
    shot: null, shotId: 0, over: false, resigned: -1,
  };
}

// Spieler hat die Bahn beendet (eingelocht oder Höchstzahl erreicht)
function finishHole(s, n) {
  const seat = s.turn, other = 1 - seat;
  s.strokes[seat][s.hole] = n;
  s.cur = 0;
  if (s.strokes[other][s.hole] == null) {
    s.turn = other;
  } else if (s.hole === N - 1) {
    s.over = true;
    return;
  } else {
    s.hole++;
    s.turn = firstOn(s.hole, s.round);
  }
  s.ball = C.HOLES[s.hole].tee.slice();
}

module.exports = {
  title: 'Minigolf',
  blurb: '18 Bahnen – wer braucht weniger Schläge?',
  live: true, // Zielen wird live an den Mitspieler übertragen

  create() { return newRound(0); },
  start(prev, round) {
    const s = newRound(round);
    s.shotId = prev && prev.shotId ? prev.shotId : 0; // Browser erkennt neue Schläge an der ID
    return s;
  },

  action(s, seat, a) {
    if (a.t !== 'shoot') return 'Unbekannte Aktion.';
    if (s.over) return 'Die Runde ist vorbei.';
    if (seat !== s.turn) return 'Dein Mitspieler ist dran.';
    const angle = num(a.a), power = num(a.p);
    if (angle == null || power == null || power <= 0 || power > 1) return 'Ungültiger Schlag.';

    const hole = C.HOLES[s.hole];
    const from = s.ball.slice();
    const r = C.simulate(hole, from, angle, power);
    s.cur++;
    s.shotId++;
    let outcome = r.holed ? 'holed' : r.water ? 'water' : null;
    s.ball = r.water ? from : r.end;
    s.shot = { id: s.shotId, seat, hole: s.hole, from, path: r.path, end: s.ball.slice(), stroke: s.cur, outcome };

    if (r.holed) finishHole(s, s.cur);
    else if (s.cur >= C.MAX_STROKES) { s.shot.outcome = r.water ? 'water-max' : 'max'; finishHole(s, C.MAX_STROKES + 1); }
    return null;
  },

  resign(s, seat) {
    if (s.over) return;
    s.over = true;
    s.resigned = seat;
  },

  result(s) {
    if (!s.over) return null;
    const t = [total(s.strokes[0]), total(s.strokes[1])];
    if (s.resigned >= 0) {
      return { winner: 1 - s.resigned, reason: 'resign', summary: `aufgegeben auf Bahn ${s.hole + 1}` };
    }
    if (t[0] === t[1]) return { winner: -1, reason: 'strokes', summary: `beide ${t[0]} Schläge` };
    const w = t[0] < t[1] ? 0 : 1;
    return { winner: w, reason: 'strokes', summary: `${t[w]} zu ${t[1 - w]} Schläge` };
  },

  view(s, seat, core) {
    const r = module.exports.result(s);
    return {
      you: seat,
      players: core.players.map((p) => p && { name: p.name, online: p.online }),
      score: core.score, draws: core.draws, rematch: core.rematch,
      round: s.round, hole: s.hole, turn: s.turn, ball: s.ball, cur: s.cur,
      strokes: s.strokes, totals: [total(s.strokes[0]), total(s.strokes[1])],
      first: firstOn(s.hole, s.round),
      shot: s.shot, over: s.over, resigned: s.resigned,
      winner: r ? r.winner : null,
    };
  },
};
