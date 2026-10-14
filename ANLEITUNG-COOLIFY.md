# Spiele-Sammlung mit Coolify – Klick für Klick

Ziel: **eine** Coolify-Ressource statt vier. Danach laufen alle Spiele unter `spiele.deine-domain.de`, und die alten Links leiten automatisch weiter.

Dauer: ca. 20 Minuten. Kein Terminal nötig. Die alten Spiele laufen weiter, bis Schritt 4 sie ablöst.

> Hinweis: Coolify benennt Menüs je nach Version leicht anders. Bei dir heißt der Bereich für Domains **„Access“ → „Manage Domains“**.

## 1. Subdomain anlegen (IONOS)

IONOS → **Domains & SSL** → deine Domain → **DNS** → **Eintrag hinzufügen**:

| Typ | Hostname | Zeigt auf |
|---|---|---|
| A | `spiele` | IP deines VPS (dieselbe wie bei `vier`) |

Wirksam nach 5–30 Minuten.

## 2. Neue Ressource in Coolify

1. **Projects** → dein Projekt → **production** → **„+ New“ → „Public Repository“**
2. Adresse: `https://github.com/PushTheLimit23/spiele` → **Check repository**
3. **Build Pack: „Dockerfile“** → **Continue**
4. **Ports Exposes:** `3000`
5. **Access → Manage Domains:** `https://spiele.deine-domain.de` (mit `https://`) → **Save**
6. **Persistent Storage → „+ Add“ → Volume Mount**
   - Name: `spiele-data`
   - Destination Path: `/app/data`
   - Ohne diesen Schritt ist die Historie nach jedem Update weg.
7. **Deploy** (1–3 Minuten)

**Test:** `https://spiele.deine-domain.de/health` zeigt `ok`. Dann die Startseite öffnen und ein Spiel mit dir selbst in zwei Fenstern ausprobieren.

## 3. Alte Spiele prüfen

Bis hierhin laufen die vier alten Ressourcen unverändert weiter. Spiel ein, zwei Runden in der neuen Sammlung, bevor du weitermachst.

## 4. Alte Adressen auf die Sammlung umziehen

Für **jede** der vier alten Ressourcen (Vier Gewinnt, Dame, Mühle, Wortraten):

1. Alte Ressource öffnen → **Stop**
2. **Access → Manage Domains** → Domain entfernen → **Save**

Dann in der **neuen** Ressource `spiele`:

3. **Access → Manage Domains** → die alten Adressen **zusätzlich** eintragen, durch Komma getrennt:
   `https://spiele.deine-domain.de,https://vier.deine-domain.de,https://dame.deine-domain.de,https://muehle.deine-domain.de,https://wort.deine-domain.de`
4. **Save**, dann **Redeploy** (nur Speichern reicht nicht – sonst kommt „no server available“).

**Test:** `https://vier.deine-domain.de` öffnen → landet auf `https://spiele.deine-domain.de/vier/`.

Wenn alles läuft, kannst du die alten Ressourcen in Coolify löschen und die vier alten GitHub-Repos archivieren (GitHub → Repo → Settings → ganz unten „Archive this repository“).

## Updates

Neue Versionen lade ich direkt ins Repo `spiele`. Danach in Coolify bei der Ressource auf **Redeploy** klicken.

Optional: Coolify kann bei jedem Push automatisch neu bauen. Für öffentliche Repos geht das über einen Webhook (Ressource → **Webhooks** → GitHub). Ob deine Coolify-Version das ohne GitHub-App anbietet, prüfen wir am besten zusammen.

## Was sich für Mitspieler ändert

- Alte Links funktionieren weiter (Umleitung). Eine Partie, die gerade läuft, beginnt nach dem Umzug neu.
- Name und Historie gelten jetzt für alle Spiele. Die alte Historie der Einzelspiele wird nicht übernommen, und den Namen muss jeder einmal neu eingeben.
