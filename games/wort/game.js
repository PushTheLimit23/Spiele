// Wortraten – Regeln auf dem Server
// Einer gibt ein Wort vor, der andere rät. Jeder Fehler baut ein Teil am Fahrrad, 10 Fehler = verloren.
// Bei der Revanche wechseln die Rollen.
const WORDS = require('./words');

const MAX_ERRORS = 10;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ';

const normWord = (s) => String(s || '').replace(/ß/g, 'SS').toUpperCase().replace(/\s+/g, ' ').trim();
const validWord = (w) => w.length >= 3 && w.length <= 24 && /^[A-ZÄÖÜ][A-ZÄÖÜ \-]*[A-ZÄÖÜ]$/.test(w);
const masked = (s) => [...s.word].map((c) => (LETTERS.includes(c) && !s.guessed.includes(c) ? '_' : c)).join('');

function fresh(setter) {
  return { setter, phase: 'setting', word: '', hint: '', guessed: [], wrong: [], errors: 0, result: null, solveTry: null };
}

function finish(s, winner, how) { s.phase = 'over'; s.result = { winner, how }; }

function checkEnd(s) {
  const guesser = 1 - s.setter;
  if (!masked(s).includes('_')) finish(s, guesser, 'solved');
  else if (s.errors >= MAX_ERRORS) finish(s, s.setter, 'built');
}

module.exports = {
  title: 'Wortraten',
  blurb: 'Wort ausdenken, Buchstaben raten – jeder Fehler baut am Fahrrad.',
  rematch: 'any', // ein Klick reicht, die Rollen werden getauscht

  create() { return { ...fresh(0), phase: 'waiting' }; },

  // Runde 1: Spieler 1 gibt vor. Danach abwechselnd.
  start(_prev, round) { return fresh((round - 1) % 2); },

  action(s, seat, a) {
    const isSetter = seat === s.setter;

    if (a.t === 'setWord') {
      if (s.phase !== 'setting' || !isSetter) return;
      let word = normWord(a.word);
      let hint = String(a.hint || '').trim().slice(0, 40);
      if (a.random) { const [w, h] = WORDS[Math.floor(Math.random() * WORDS.length)]; word = normWord(w); hint = h; }
      if (!validWord(word)) return '3–24 Buchstaben, nur A–Z, Ä, Ö, Ü, Leerzeichen oder Bindestrich.';
      Object.assign(s, { word, hint, guessed: [], wrong: [], errors: 0, result: null, solveTry: null, phase: 'playing' });
      return;
    }

    if (a.t === 'guess') {
      if (s.phase !== 'playing' || isSetter) return;
      const L = String(a.letter || '').toUpperCase();
      if (L.length !== 1 || !LETTERS.includes(L) || s.guessed.includes(L) || s.wrong.includes(L)) return;
      if (s.word.includes(L)) s.guessed.push(L); else { s.wrong.push(L); s.errors++; }
      s.solveTry = null;
      checkEnd(s);
      return;
    }

    if (a.t === 'solve') {
      if (s.phase !== 'playing' || isSetter) return;
      const tryWord = normWord(a.word);
      if (!tryWord) return;
      if (tryWord === s.word) {
        for (const c of s.word) if (LETTERS.includes(c) && !s.guessed.includes(c)) s.guessed.push(c);
        finish(s, seat, 'solved');
      } else {
        s.errors = Math.min(MAX_ERRORS, s.errors + 2); // falscher Lösungsversuch kostet 2
        s.solveTry = tryWord.slice(0, 24);
        checkEnd(s);
      }
    }
  },

  result(s) {
    if (s.phase !== 'over') return null;
    return { winner: s.result.winner, reason: s.result.how, summary: s.word };
  },

  view(s, seat, core) {
    const over = s.phase === 'over';
    return {
      you: seat,
      phase: s.phase,
      setter: s.setter,
      players: core.players.map((p, i) => p && { name: p.name, connected: p.online, score: core.score[i] }),
      masked: s.word ? masked(s) : '',
      word: over || seat === s.setter ? s.word : null,
      hint: s.hint,
      guessed: s.guessed,
      wrong: s.wrong,
      errors: s.errors,
      maxErrors: MAX_ERRORS,
      result: s.result,
      solveTry: s.solveTry,
    };
  },
};
