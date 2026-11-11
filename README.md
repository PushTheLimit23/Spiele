# Spiele

Online-Spiele für zwei per Link: **Vier Gewinnt, Dame, Mühle, Wortraten, Minigolf, Halma, Airhockey**. Ein Server, eine Adresse, eine Startseite.

- Startseite: `spiele.deine-domain.de`
- Spiele: `/vier/`, `/dame/`, `/muehle/`, `/wort/`, `/minigolf/`, `/halma/`, `/airhockey/`
- Alte Adressen (`vier.…`, `dame.…`, `muehle.…`, `wort.…`) leiten automatisch weiter, wenn sie auf denselben Server zeigen.

## Minigolf: zwei Plätze

Klassik (18 Bahnen, Par 49), Abenteuer (18 Bahnen mit Eis, Förderbändern, Portalen, Hügeln/Mulden, Windmühlen und Schiebetoren, Par 61) und Marathon (alle 36). Wer das Spiel anlegt, wählt den Platz; nach jeder Runde kann für die Revanche gewechselt werden. Bahnen und Physik: `games/minigolf/public/course.js`.

## Airhockey: Echtzeit

Der Server rechnet die Physik mit 60 Takten pro Sekunde (`game.tick`) und schickt jedem Spieler eine kleine Momentaufnahme. Der Browser schickt nur die Schlägerposition (`P.input`), zeigt den eigenen Schläger sofort an und rechnet den Puck ab der letzten Momentaufnahme kurz voraus (gleiche Physik: `games/airhockey/public/physics.js`).

## Aufbau

```
server.js        Kern: Räume, Spieler, Revanche, Punktestand, Historie, Umleitungen
public/          Startseite und gemeinsamer Browser-Baustein (core.js)
games/<id>/      ein Ordner pro Spiel (Regeln + Oberfläche), siehe games/README.md
test/            automatische Tests mit simulierten Spielern (npm test)
```

## Betrieb

- Läuft mit Docker (siehe `Dockerfile`), Port 3000.
- Spielhistorie liegt in `/app/data/history.jsonl` → in Coolify als Persistent Storage einbinden.
- Einrichtung Schritt für Schritt: [ANLEITUNG-COOLIFY.md](ANLEITUNG-COOLIFY.md)

## Lokal starten

```
npm install
npm start          # http://localhost:3000
npm test
```
