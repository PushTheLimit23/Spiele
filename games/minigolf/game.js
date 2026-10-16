// Minigolf – Regeln auf dem Server
// Plätze: Klassik (18), Abenteuer (18, schwerer), Marathon (alle 36). Wer das Spiel anlegt, wählt den Platz;
// nach einer Runde kann jeder für die Revanche einen anderen Platz wählen.
// Pro Bahn spielt erst der eine Spieler, bis sein Ball im Loch ist, dann der andere.
// Wer anfängt, wechselt von Bahn zu Bahn (und bei jeder Revanche).
// Höchstens 6 Schläge pro Bahn – wer dann nicht eingelocht hat, bekommt 7.
// Wasser: Der Schlag zählt, der Ball kommt zurück an die Stelle, von der aus geschlagen wurde.
// Physik und Bahnen: public/course.js (läuft identisch im Browser).
const C = require('./public/course.js');

const firstOn = (hole, round) => (hole + Math.max(round, 1) - 1) % 2;
const total = (row) => row.reduce((s, v) => s + (v || 0), 0);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const DEFAULT = 'klassik';
const holeOf = (s, i = s.hole) => C.HOLES[C.COURSES[s.course].holes[i]];
// Uhr der beweglichen Hindernisse (Sekunden, alle 10 Minuten von vorn)
const CLOCK = 600;
const clock = () => (Date.now() / 1000) % CLOCK;

function newRound(round, course = DEFAULT) {
  const n = C.COURSES[course].holes.length;
  const s = {
    round, course, nextCourse: null, courseSet: false,
    hole: 0, turn: firstOn(0, round), ball: null, cur: 0,
    strokes: [Array(n).fill(null), Array(n).fill(null)],
    shot: null, shotId: 0, over: false, resigned: -1,
  };
  s.ball = holeOf(s).tee.slice();
  return s;
}

// Spieler hat die Bahn beendet (eingelocht oder Höchstzahl erreicht)
function finishHole(s, n) {
  const seat = s.turn, other = 1 - seat;
  s.strokes[seat][s.hole] = n;
  s.cur = 0;
  if (s.strokes[other][s.hole] == null) {
    s.turn = other;
  } else if (s.hole === s.strokes[0].length - 1) {
    s.over = true;
    return;
  } else {
    s.hole++;
    s.turn = firstOn(s.hole, s.round);
  }
  s.ball = holeOf(s).tee.slice();
}

module.exports = {
  title: 'Minigolf',
  blurb: '36 Bahnen auf zwei Plätzen – wer braucht weniger Schläge?',
  live: true, // Zielen wird live an den Mitspieler übertragen

  create() { return newRound(0); },
  // Wer den Raum anlegt (erster Spieler), bestimmt den Platz
  join(s, seat, data, core) {
    if (s.courseSet || s.round !== 0) return;
    s.courseSet = true;
    const c = data && C.COURSES[data.course] ? data.course : DEFAULT;
    if (core.players.filter(Boolean).length === 1 && c !== s.course) Object.assign(s, newRound(0, c), { courseSet: true });
  },
  start(prev, round) {
    const s = newRound(round, (prev && (prev.nextCourse || prev.course)) || DEFAULT);
    s.courseSet = true;
    s.shotId = prev && prev.shotId ? prev.shotId : 0; // Browser erkennt neue Schläge an der ID
    return s;
  },

  action(s, seat, a) {
    if (a.t === 'course') {
      if (!s.over) return 'Den Platz kannst du nach der Runde wechseln.';
      if (!C.COURSES[a.c]) return 'Unbekannter Platz.';
      s.nextCourse = a.c === s.course ? null : a.c;
      return null;
    }
    if (a.t !== 'shoot') return 'Unbekannte Aktion.';
    if (s.over) return 'Die Runde ist vorbei.';
    if (seat !== s.turn) return 'Dein Mitspieler ist dran.';
    const angle = num(a.a), power = num(a.p);
    if (angle == null || power == null || power <= 0 || power > 1) return 'Ungültiger Schlag.';

    const gi = C.COURSES[s.course].holes[s.hole];
    const hole = C.HOLES[gi];
    const from = s.ball.slice();
    // Bewegliche Hindernisse: Zeitpunkt, den der Spieler beim Loslassen gesehen hat (max. 3 s Abweichung)
    const now = clock();
    let t0 = num(a.tm);
    if (t0 == null || t0 < 0 || t0 >= CLOCK || Math.min(Math.abs(t0 - now), CLOCK - Math.abs(t0 - now)) > 3) t0 = now;
    t0 = Math.round(t0 * 1000) / 1000;
    const r = C.simulate(hole, from, angle, power, t0);
    s.cur++;
    s.shotId++;
    let outcome = r.holed ? 'holed' : r.water ? 'water' : null;
    s.ball = r.water ? from : r.end;
    s.shot = { id: s.shotId, seat, hole: gi, from, path: r.path, jumps: r.jumps, t0, end: s.ball.slice(), stroke: s.cur, outcome };

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
    const on = C.COURSES[s.course].name;
    if (t[0] === t[1]) return { winner: -1, reason: 'strokes', summary: `${on} · beide ${t[0]} Schläge` };
    const w = t[0] < t[1] ? 0 : 1;
    return { winner: w, reason: 'strokes', summary: `${on} · ${t[w]} zu ${t[1 - w]} Schläge` };
  },

  view(s, seat, core) {
    const r = module.exports.result(s);
    return {
      you: seat,
      players: core.players.map((p) => p && { name: p.name, online: p.online }),
      score: core.score, draws: core.draws, rematch: core.rematch,
      course: s.course, holes: C.COURSES[s.course].holes, nextCourse: s.nextCourse, now: Date.now(),
      round: s.round, hole: s.hole, turn: s.turn, ball: s.ball, cur: s.cur,
      strokes: s.strokes, totals: [total(s.strokes[0]), total(s.strokes[1])],
      first: firstOn(s.hole, s.round),
      shot: s.shot, over: s.over, resigned: s.resigned,
      winner: r ? r.winner : null,
    };
  },
};
