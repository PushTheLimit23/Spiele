# Ein neues Spiel hinzufügen

Jedes Spiel ist ein Ordner unter `games/<id>/`. Der Ordnername ist die Adresse: `games/schach/` → `spiele.deine-domain.de/schach/`.

```
games/<id>/
  game.js        Regeln auf dem Server (Pflicht)
  public/
    index.html   Seite des Spiels, bindet /core.js und app.js ein
    app.js       Brett und Bedienung im Browser
    style.css    Optik
```

Danach noch eine Kachel in `public/index.html` (Startseite) ergänzen. Mehr ist nicht nötig: kein neues Repo, keine neue Coolify-Ressource.

## Was der Kern übernimmt

Räume per Link, Spieler-ID und Name (gelten für alle Spiele), Wiederverbinden, „Spiel ist voll“, Revanche, Punktestand, Historie (Datei im Volume), Aufräumen alter Räume, robuster Einladungslink.

## game.js – Schnittstelle

```js
module.exports = {
  title: 'Mein Spiel',
  blurb: 'Ein Satz für die Startseite.',
  rematch: 'both',      // 'both' (Standard): beide müssen zustimmen · 'any': ein Klick reicht
  live: false,          // true: Browser darf Live-Vorschau an den Mitspieler senden (P.live, z. B. Zielen)
  needsBoth: true,      // Standard: Aktionen erst, wenn zwei Spieler da sind

  create()                      // Zustand, solange erst ein Spieler da ist
  start(prev, round)            // neue Runde (1, 2, 3 …): z. B. Startspieler/Farben abwechseln
  join(state, seat, data, core) // optional: Spieler kommt dazu (data = Wünsche, z. B. Farbe)
  action(state, seat, act, core)// Zug prüfen und ausführen; Fehlertext zurückgeben oder nichts
  resign(state, seat, core)     // optional: Aufgeben
  result(state)                 // null, solange die Runde läuft, sonst
                                // { winner: 0 | 1 | -1 (Remis), reason, summary }
  view(state, seat, core)       // was Spieler `seat` sehen darf (z. B. geheimes Wort weglassen)
};
```

`seat` ist 0 oder 1 und bleibt für einen Spieler im Raum gleich, auch bei Revanchen. Farben oder Rollen tauscht das Spiel selbst anhand von `round`.

`core` enthält: `players` (Name, online), `score`, `draws`, `round`, `rematch`, `full`.

## Browser – gemeinsamer Baustein `/core.js`

```js
const P = Platform.init('<id>');
P.name / P.room / P.brokenLink   // Name, Raumcode, kaputter Link?
P.newRoom(); P.link(); P.share(titel);
P.connect({ onState, onError, onFull, onBadLink, onDisconnect, onOpen, joinData });
P.act({ t: 'move', … }); P.rematch(); P.resign();
P.live({ … });                   // Live-Vorschau, kommt beim Mitspieler als onLive(data, seat) an
P.history(); P.renderHistory(element); P.toast(text);
```

## Testen

`npm test` startet den Server und spielt jedes Spiel mit simulierten Spielern durch. Für ein neues Spiel eine Datei `test/50-<id>.test.js` nach dem Muster der vorhandenen anlegen.
