# Spiele

Online-Spiele für zwei per Link: **Vier Gewinnt, Dame, Mühle, Wortraten**. Ein Server, eine Adresse, eine Startseite.

- Startseite: `spiele.deine-domain.de`
- Spiele: `/vier/`, `/dame/`, `/muehle/`, `/wort/`
- Alte Adressen (`vier.…`, `dame.…`, `muehle.…`, `wort.…`) leiten automatisch weiter, wenn sie auf denselben Server zeigen.

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
