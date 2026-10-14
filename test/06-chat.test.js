// Chat im Kern: Zustellung an beide, Verlauf beim Wiederverbinden, Grenzen
module.exports = async ({ ok, pair, Player, wait }) => {
  const [a, b, r] = await pair('vier');
  ok(a.msgs.some((m) => m.type === 'chatlog' && m.you === 0 && m.msgs.length === 0), 'Beim Beitritt kommt ein (leerer) Chat-Verlauf');

  a.send({ type: 'chat', text: '  Hallo Ben!  ' }); await wait(100);
  const got = b.msgs.filter((m) => m.type === 'chat');
  ok(got.length === 1 && got[0].msg.text === 'Hallo Ben!' && got[0].msg.name === 'Anna' && got[0].msg.seat === 0, 'Nachricht kommt beim Mitspieler an (mit Name, getrimmt)');
  ok(a.msgs.some((m) => m.type === 'chat' && m.msg.text === 'Hallo Ben!'), 'Absenderin bekommt ihre Nachricht zurück');

  b.send({ type: 'chat', text: '<b>x</b>' + 'y'.repeat(400) }); await wait(100);
  const long = a.msgs.filter((m) => m.type === 'chat').at(-1).msg.text;
  ok(long.length === 300 && long.startsWith('<b>'), 'Max. 300 Zeichen; Text bleibt Text (Darstellung escaped im Browser)');
  b.send({ type: 'chat', text: '   ' }); await wait(80);
  ok(a.msgs.filter((m) => m.type === 'chat').length === 2, 'Leere Nachrichten werden ignoriert');

  for (let i = 0; i < 8; i++) a.send({ type: 'chat', text: 'spam ' + i });
  await wait(150);
  ok(b.msgs.filter((m) => m.type === 'chat' && /spam/.test(m.msg.text)).length === 5 && /schnell/.test(a.lastError()?.msg || ''), 'Bremse: höchstens 6 Nachrichten in 10 s');

  // Wiederverbinden: Verlauf ist wieder da
  b.close(); await wait(100);
  const b2 = new Player('vier', r, b.id, 'Ben'); await b2.connect();
  const log = b2.msgs.find((m) => m.type === 'chatlog');
  ok(log && log.you === 1 && log.msgs.length === 7 && log.msgs[0].text === 'Hallo Ben!', 'Verlauf nach Neuladen wieder da');

  // Chat stört das Spiel nicht
  await a.act({ t: 'move', col: 2 });
  ok(b2.state.moves === 1, 'Spielzüge laufen normal weiter');

  // Andere Räume bekommen nichts
  const [c, d] = await pair('vier');
  ok(!c.msgs.some((m) => m.type === 'chat') && !d.msgs.some((m) => m.type === 'chat'), 'Kein Übersprechen zwischen Räumen');
  [a, b2, c, d].forEach((p) => p.close());
};
