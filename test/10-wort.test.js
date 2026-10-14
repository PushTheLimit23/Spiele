// Wortraten
module.exports = async ({ ok, get, pair, wait }) => {
  const [a, b] = await pair('wort');
  ok(a.state.phase === 'setting' && a.state.setter === 0, 'Runde 1: Anna gibt das Wort vor');
  await a.act({ t: 'setWord', word: 'x1' });
  ok(/3–24/.test(a.lastError()?.msg || ''), 'Ungültiges Wort wird abgelehnt');
  await a.act({ t: 'setWord', word: 'Straße', hint: 'Ort' });
  await wait(80);
  ok(b.state.phase === 'playing' && b.state.masked === '_______' && b.state.word === null, 'Ben sieht nur Striche (ß -> SS)');
  ok(a.state.word === 'STRASSE', 'Wortgeberin sieht das Wort');
  await a.act({ t: 'guess', letter: 'S' });
  ok(a.state.guessed.length === 0, 'Wortgeberin darf nicht raten');
  await b.act({ t: 'guess', letter: 'S' });
  await b.act({ t: 'guess', letter: 'Q' });
  ok(b.state.masked === 'S___SS_' && b.state.errors === 1, 'Treffer und Fehler werden gezählt');
  await b.act({ t: 'solve', word: 'STRAUSS' });
  ok(b.state.errors === 3 && b.state.solveTry === 'STRAUSS', 'Falsches Lösungswort kostet 2 Fehler');
  await b.act({ t: 'solve', word: 'strasse' });
  await wait(80);
  ok(b.state.phase === 'over' && b.state.result.winner === 1, 'Richtiges Lösungswort gewinnt');
  ok(a.state.players[1].score === 1 && a.state.players[0].score === 0, 'Punktestand 0:1');

  await a.rematch(); await wait(80);
  ok(a.state.phase === 'setting' && a.state.setter === 1, 'Revanche mit einem Klick, Rollen getauscht');
  await b.act({ t: 'setWord', random: true });
  await wait(80);
  ok(a.state.phase === 'playing' && a.state.hint, 'Zufallswort mit Tipp');
  for (const L of 'QXYJVWÖÄÜ') await a.act({ t: 'guess', letter: L });
  await a.act({ t: 'guess', letter: 'Z' });
  await wait(80);
  const st = a.state;
  ok(st.phase === 'over' || st.errors >= 8, `Fehler zählen hoch (${st.errors})`);

  const h = JSON.parse((await get(`/api/history?id=${b.id}&game=wort`)).body);
  ok(h.length >= 1 && h.at(-1).result === 'win' && h.at(-1).summary === 'STRASSE' && h.at(-1).opp === 'Anna', 'Historie auf dem Server: Sieg gegen Anna mit STRASSE');
  a.close(); b.close();
};
