// Kern: Seiten, Umleitungen, Beitritt, voll, Wiederverbinden, kaputte Links
module.exports = async ({ ok, get, Player, pair, room, wait }) => {
  ok((await get('/health')).body === 'ok', 'Health-Check antwortet');
  ok((await get('/')).body.includes('Vier Gewinnt'), 'Startseite listet die Spiele');
  ok((await get('/core.js')).body.includes('Platform'), 'Gemeinsamer Baustein wird ausgeliefert');
  const games = JSON.parse((await get('/api/games')).body).map((g) => g.id).sort().join(',');
  ok(games.length > 0, `Spiele geladen: ${games}`);
  const r1 = await get('/wort');
  ok(r1.status === 301 && r1.headers.location === '/wort/', '/wort ohne Schrägstrich wird ergänzt');
  ok((await get('/wort/?r=abc')).body.includes('Wortraten'), 'Spielseite wird ausgeliefert');
  ok((await get('/wort/irgendwas')).body.includes('Wortraten'), 'Unbekannte Pfade im Spiel -> Spielseite');
  ok((await get('/../server.js')).status !== 200 || !(await get('/../server.js')).body.includes('require('), 'Kein Zugriff außerhalb von public');

  // Alte Subdomains
  const v = await get('/r/ab12cd34', { host: 'vier.example.de' });
  ok(v.status === 301 && v.headers.location === 'https://spiele.example.de/vier/?r=ab12cd34', `vier.… /r/<code> -> ${v.headers.location}`);
  const d = await get('/?r=xyz98765', { host: 'dame.example.de' });
  ok(d.headers.location === 'https://spiele.example.de/dame/?r=xyz98765', 'dame.… ?r= -> /dame/');
  const m = await get('/', { host: 'muehle.example.de' });
  ok(m.headers.location === 'https://spiele.example.de/muehle/', 'muehle.… -> /muehle/');
  const w = await get('/?r=ABCDE', { host: 'wort.example.de' });
  ok(w.headers.location === 'https://spiele.example.de/wort/?r=ABCDE', 'wort.… -> /wort/');
  ok((await get('/', { host: 'spiele.example.de' })).status === 200, 'spiele.… wird nicht umgeleitet');
  ok((await get('/health', { host: 'vier.example.de' })).body === 'ok', 'Health-Check auf alter Subdomain ohne Umleitung');

  // Kaputter Link / unbekanntes Spiel
  const x = new Player('wort', 'a!', 'xxxxxxxxxx', 'X'); await x.connect();
  ok(x.lastError()?.code === 'link', 'Ungültiger Raumcode -> Fehlermeldung "link"');
  x.close();
  const y = new Player('gibtsnicht', 'abcd1234', 'yyyyyyyyyy', 'Y'); await y.connect();
  ok(x.lastError() && y.lastError()?.code === 'link', 'Unbekanntes Spiel -> Fehlermeldung');
  y.close();

  // Dritter Spieler, Wiederverbinden
  const [a, b, r] = await pair('wort');
  const c = new Player('wort', r, 'cccccccccc', 'Carla'); await c.connect();
  ok(c.msgs.some((m) => m.type === 'full'), 'Dritter Spieler wird abgewiesen');
  c.close();
  a.close(); await wait(150);
  ok(b.state.players[0].connected === false, 'Mitspieler sieht "nicht verbunden"');
  const a2 = new Player('wort', r, a.id, 'Anna neu'); await a2.connect();
  ok(a2.state && a2.state.you === 0, 'Wiederverbinden landet auf demselben Platz');
  ok(b.state.players[0].connected === true && b.state.players[0].name === 'Anna neu', 'Name wird beim Wiederverbinden aktualisiert');
  const a3 = new Player('wort', r, a.id, 'Anna Tab 2'); await a3.connect(); await wait(100);
  ok(a2.closed === 4000, 'Zweiter Tab ersetzt den ersten (Code 4000, kein Endlos-Wiederverbinden)');
  [a3, b].forEach((p) => p.close());

  // Gleicher Raumcode in zwei Spielen = zwei getrennte Räume
  const r2 = room();
  const p1 = new Player('wort', r2, 'pppppppppp', 'P1'); await p1.connect();
  const p2 = new Player('vier', r2, 'qqqqqqqqqq', 'P2'); await p2.connect();
  ok(p1.state && p2.state && p1.state.players[1] == null, 'Räume sind pro Spiel getrennt');
  p1.close(); p2.close();
};
