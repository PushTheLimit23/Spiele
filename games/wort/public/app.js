// Wortraten – Browser-Seite
const $ = id => document.getElementById(id);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ';
const P = Platform.init('wort');
const esc = P.esc;
let state = null;

$('nameInput').value = P.name;

// ---------- Startseite ----------
if (P.room) {
  $('lobbyText').textContent = 'Du wurdest zu einer Runde Wortraten eingeladen.';
  $('startBtn').textContent = 'Mitspielen';
} else if (P.brokenLink) {
  $('lobbyText').textContent = 'Dieser Einladungslink ist unvollständig. Bitte lass ihn dir nochmal schicken – oder starte ein neues Spiel.';
}
P.renderHistory($('history'), { title: 'Deine letzten Runden' });

$('startBtn').onclick = () => {
  const name = $('nameInput').value.trim();
  if (!name) { $('nameInput').focus(); return; }
  P.name = name;
  if (!P.room) P.newRoom();
  connect();
};
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('startBtn').click(); });

// Automatisch wieder einsteigen, wenn Name schon bekannt (z. B. nach Neuladen)
if (P.room && P.name) connect();

// ---------- Verbindung ----------
function connect() {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('status').textContent = 'Verbinde …';
  P.connect({
    onState(m) { state = m; render(); },
    onError(msg) { $('formError').textContent = msg; },
    onFull() { $('status').textContent = 'Dieses Spiel ist schon voll.'; hideAll(); },
    onBadLink(msg) { $('status').textContent = msg; hideAll(); },
    onDisconnect() { $('status').textContent = 'Verbindung weg – verbinde neu …'; },
  });
}
const send = (a) => P.act(a);

// ---------- Eingaben ----------
$('copyBtn').onclick = async () => {
  const how = await P.share('Wortraten');
  if (how === 'copied') { $('copyBtn').textContent = 'Kopiert ✓'; setTimeout(() => ($('copyBtn').textContent = 'Einladen'), 1500); }
};
$('eyeBtn').onclick = () => { const i = $('wordInput'); i.type = i.type === 'password' ? 'text' : 'password'; };
$('setBtn').onclick = () => { $('formError').textContent = ''; send({ t: 'setWord', word: $('wordInput').value, hint: $('hintInput').value }); };
$('wordInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('setBtn').click(); });
$('randomBtn').onclick = () => { $('formError').textContent = ''; send({ t: 'setWord', random: true }); };
$('rematchBtn').onclick = () => P.rematch();
$('solveForm').onsubmit = e => {
  e.preventDefault();
  const w = $('solveInput').value.trim();
  if (w) { send({ t: 'solve', word: w }); $('solveInput').value = ''; }
};

const kb = $('keyboard');
for (const L of LETTERS) {
  const b = document.createElement('button');
  b.className = 'key'; b.textContent = L; b.dataset.l = L;
  b.onclick = () => send({ t: 'guess', letter: L });
  kb.appendChild(b);
}
document.addEventListener('keydown', e => {
  if (!state || state.phase !== 'playing' || state.you === state.setter) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const L = e.key.toUpperCase();
  if (L.length === 1 && LETTERS.includes(L)) send({ t: 'guess', letter: L });
});

// ---------- Darstellung ----------
function hideAll() { ['share', 'setForm', 'play', 'over'].forEach(id => $(id).classList.add('hidden')); }

function render() {
  const s = state, me = s.you, opp = 1 - me;
  const meP = s.players[me], oppP = s.players[opp];
  const iSet = me === s.setter;
  hideAll();

  // Punktestand
  const sc = $('scores');
  if (oppP) {
    sc.classList.remove('hidden');
    sc.innerHTML = `${esc(meP.name)} ${meP.score} : ${oppP.score} <span class="${oppP.connected ? '' : 'off'}">${esc(oppP.name)}${oppP.connected ? '' : ' (offline)'}</span>`;
  } else sc.classList.add('hidden');

  const status = $('status');
  if (s.phase === 'waiting') {
    status.textContent = 'Warte auf Mitspieler …';
    $('share').classList.remove('hidden');
    $('shareLink').value = P.link();
    return;
  }
  if (s.phase === 'setting') {
    if (iSet) {
      status.textContent = `Denk dir ein Wort für ${oppP.name} aus`;
      $('setForm').classList.remove('hidden');
      if (!$('setForm').dataset.shown) { $('wordInput').value = ''; $('hintInput').value = ''; $('wordInput').type = 'password'; $('setForm').dataset.shown = '1'; }
    } else status.textContent = `${oppP.name} denkt sich ein Wort aus …`;
    return;
  }
  delete $('setForm').dataset.shown;

  // Spiel / Ende
  $('play').classList.remove('hidden');
  const parts = document.querySelectorAll('#bike .part');
  parts.forEach((p, i) => { p.classList.toggle('on', i < s.errors); p.classList.toggle('ghost', i >= s.errors && s.phase === 'playing'); });
  $('lives').textContent = `Fehler: ${s.errors} / ${s.maxErrors}` + (guessingNow(s) ? ' · falsches Wort = 2 Fehler' : '') + (s.solveTry ? ` · „${s.solveTry}“ war falsch` : '');
  $('hint').textContent = s.hint ? `Tipp: ${s.hint}` : '';

  const over = s.phase === 'over';
  const full = s.word || s.masked;
  $('word').innerHTML = [...s.masked].map((c, i) => {
    if (c === ' ') return '<span class="gap"></span>';
    const real = full[i];
    if (c === '_' && over) return `<span class="missed">${real}</span>`;
    if (c === '_' && iSet) return `<span style="opacity:.35">${real}</span>`;
    return `<span class="${c !== '_' && iSet ? 'hit' : ''}">${c === '_' ? '&nbsp;' : c}</span>`;
  }).join('');
  fitWord(s.masked.length);

  $('secret').classList.toggle('hidden', !(iSet && !over));
  $('secret').textContent = 'Nur du siehst die blassen Buchstaben.';

  const guessing = s.phase === 'playing' && !iSet;
  kb.classList.toggle('readonly', !guessing);
  kb.querySelectorAll('.key').forEach(b => {
    const L = b.dataset.l;
    b.className = 'key' + (s.guessed.includes(L) ? ' right' : s.wrong.includes(L) ? ' wrong' : '');
    b.disabled = !guessing || s.guessed.includes(L) || s.wrong.includes(L);
  });
  $('solveForm').classList.toggle('hidden', !guessing);

  if (!over) {
    status.textContent = iSet ? `${oppP.name} rät dein Wort …` : 'Du bist dran – rate einen Buchstaben';
    return;
  }
  const iWon = s.result.winner === me;
  const txt = s.result.how === 'solved'
    ? (iWon ? 'Gelöst! 🎉' : `${oppP.name} hat dein Wort erraten.`)
    : (iWon ? `Das Fahrrad ist fertig – ${oppP.name} hat es nicht geschafft. Punkt für dich!` : 'Das Fahrrad ist fertig – leider verloren.');
  status.textContent = iWon ? 'Gewonnen!' : 'Verloren';
  $('over').classList.remove('hidden');
  $('overText').textContent = txt;
}

function fitWord(n) {
  const w = $('word').parentElement.clientWidth || 320;
  const fit = Math.floor(w / (n * 1.2));
  const el = $('word');
  el.style.fontSize = (fit >= 24 ? Math.min(34, fit) : 26) + 'px';
  el.style.flexWrap = fit >= 24 ? 'nowrap' : 'wrap';
}
window.addEventListener('resize', () => state && state.masked && fitWord(state.masked.length));

function guessingNow(s) { return s.phase === 'playing' && s.you !== s.setter && !s.solveTry; }
