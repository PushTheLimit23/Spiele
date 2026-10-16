// Platz übernehmen (z. B. Link erst in Notion-Vorschau geöffnet, dann im Browser)
module.exports = async ({ ok, pair, Player, wait }) => {
  const [a, b, r] = await pair('vier');
  await a.act({ t: 'move', col: 3 });
  const c = new Player('vier', r, 'cccccccccc77', 'Ben im Browser'); await c.connect();
  const full = c.msgs.find((m) => m.type === 'full');
  ok(full && full.seats.length === 2 && full.seats[1].name === 'Ben' && full.seats[1].online === true, '„Voll“ nennt die Plätze mit Namen und Status');
  c.close();

  const d = new Player('vier', r, 'dddddddddd77', 'Ben');
  d.data = {};
  await new Promise((res) => {
    const WebSocket = require('ws');
    d.ws = new WebSocket(b.ws.url);
    d.ws.on('open', () => d.ws.send(JSON.stringify({ type: 'join', game: 'vier', room: r, id: d.id, name: 'Ben', takeover: 1 })));
    d.ws.on('message', (raw) => { const m = JSON.parse(raw); d.msgs.push(m); if (m.type === 'state') d.state = m; });
    setTimeout(res, 250);
  });
  ok(d.state && d.state.you === 1 && d.state.moves === 1, 'Übernahme: Ben sitzt auf Platz 2, Partie läuft weiter');
  ok(b.closed === 4001, 'Vorschau-Fenster wird mit 4001 abgemeldet (kein Endlos-Wiederverbinden)');
  ok(a.state.players[1].connected === true, 'Anna sieht Ben weiterhin verbunden');
  await d.act({ t: 'move', col: 4 });
  ok(a.state.moves === 2, 'Ben kann im Browser weiterspielen');
  const e = new Player('vier', r, 'eeeeeeeeee77', 'Fremd'); await e.connect();
  ok(e.msgs.some((m) => m.type === 'full'), 'Ohne Übernahme bleibt das Spiel für Dritte voll');
  [a, d, e].forEach((p) => p.close());
};
