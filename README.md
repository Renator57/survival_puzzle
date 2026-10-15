# Survival Puzzle

Handy-Spiel im Stil von *Puzzles & Survival*: **Match-3-Kämpfe gegen Zombie-Wellen** und
**Basisbau** mit Rohstoffen, Bauzeiten und Helden-Training.

| Kampf | Basis | Helden |
| --- | --- | --- |
| ![Kampf](docs/kampf.png) | ![Basis](docs/basis.png) | ![Helden](docs/helden.png) |

## Spielprinzip

- **Kampf:** Tausche benachbarte Steine, um 3 oder mehr gleiche in eine Reihe zu bringen. Jede Farbe gehört zu
  einem Helden – triffst du seine Farbe, greift er an. Kettenreaktionen geben Kombo-Bonus.
  - 4 in einer Reihe → **Linienstein** (räumt eine Reihe/Spalte), 5 in einer Reihe oder L/T-Form → **Bombe** (3×3)
  - Die Zahl über jedem Zombie zeigt, in wie vielen Zügen er angreift.
  - Getroffene Steine laden die Helden auf. Volle Helden antippen → **Fähigkeit** (kostet keinen Zug).
- **Basis:** Farm, Sägewerk und Stahlwerk produzieren auch offline. Das Lager begrenzt die Menge,
  die Schutzmauer gibt mehr Lebenspunkte im Kampf. Das Hauptquartier begrenzt die Stufe aller Gebäude.
- **Helden:** Mit Nahrung und Holz trainieren (bis Stufe 30).
- **Karte:** 24 Level, alle 4 Level ein Boss.

## Technik

| | |
| --- | --- |
| Sprache | TypeScript |
| Kampf-Grafik | [Phaser 4](https://phaser.io) |
| Menüs | HTML/CSS |
| Android/iOS-App | [Capacitor](https://capacitorjs.com) |
| Tests | Vitest |

**Wichtig für Mehrspieler:** Die komplette Spiellogik liegt in `src/core/` und hat keinerlei Abhängigkeit
zu Grafik oder Browser. Dieselben Dateien können später unverändert auf einem Server laufen (z. B.
[Nakama](https://heroiclabs.com/nakama/) oder [Colyseus](https://colyseus.io)). Kämpfe nutzen einen
festen Zufalls-Seed, sodass der Server jeden Kampf nachrechnen und Schummeln erkennen kann.

```
src/core/      Spielregeln (Server-tauglich): board.ts, battle.ts, player.ts, content.ts
src/game/      Phaser-Kampfszene (nur Darstellung)
src/main.ts    Menüs, Speichern, Navigation
tests/         Tests der Spielregeln
```

Balancing (Helden, Zombies, Gebäude, Level) steht komplett in `src/core/content.ts`.

## Entwickeln

Voraussetzung: [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run dev        # startet den Entwicklungsserver
npm test           # Tests
npm run build      # Produktions-Build nach dist/
```

`npm run dev` zeigt auch eine Netzwerk-Adresse (z. B. `http://192.168.x.x:5173`). Die kannst du auf dem
Handy im selben WLAN öffnen und direkt spielen.

## Als App auf das Handy

**Android** (braucht [Android Studio](https://developer.android.com/studio)):

```bash
npx cap add android   # nur beim ersten Mal
npm run android       # baut, kopiert und öffnet Android Studio → dort auf ▶ drücken
```

**iOS** (braucht einen Mac mit Xcode):

```bash
npx cap add ios       # nur beim ersten Mal
npm run ios
```

Für den Play Store brauchst du ein Google-Play-Entwicklerkonto (einmalig 25 $), für den App Store
das Apple Developer Program (99 $/Jahr).

## Fahrplan

1. ~~Match-3-Kampf, Helden, Basis, 24 Level~~ ✅
2. Musik und Soundeffekte, bessere Grafiken (Sprites statt Emojis), Tutorial
3. Mehr Inhalte: Helden-Sammeln (Seltenheiten), Ausrüstung, tägliche Aufgaben
4. **Server**: Konto-Anmeldung, Spielstand in der Cloud, Kämpfe vom Server prüfen
5. **Mehrspieler**: Allianzen, Chat, Ranglisten, Angriffe auf andere Basen, Weltkarte
