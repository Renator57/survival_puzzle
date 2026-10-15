# Grafik-Anleitung: eigene KI-Bilder ins Spiel bringen

Alle Bilder im Spiel sind im Moment Platzhalter (Emojis). Jedes Bild, das du nach dieser Anleitung
erstellst, ersetzt den Platzhalter **automatisch** – du kannst also Schritt für Schritt austauschen.

## Ablauf

1. **Bild erzeugen** mit einem Bild-Generator (z. B. Leonardo.ai, Midjourney, Adobe Firefly, ChatGPT/DALL·E).
   - Format **1:1 (quadratisch)**, möglichst groß (1024 × 1024).
   - Prompt = **Stil-Prompt** (unten) + **Bild-Prompt** aus der Tabelle.
2. **Speichern** als `art-src/<Dateiname>.png` (oder `.jpg`/`.webp`), z. B. `art-src/hero-rex.png`.
   Der Ordner `art-src/` liegt im Projektordner.
3. **Aufbereiten:** `npm run art`
   - entfernt den einfarbigen Hintergrund (weiß, grün, …) automatisch,
   - schneidet zu, macht das Bild quadratisch, verkleinert es und speichert `public/art/<Name>.webp`.
4. **Ansehen:** `npm run dev` – das neue Bild ist sofort überall im Spiel.
   In ⚙ **Einstellungen → Grafik-Übersicht** siehst du, welche Bilder schon ersetzt sind.
5. **Sichern:** `git add public/art src/art-manifest.ts` und committen (oder schick mir Bescheid).

> **Tipp für einen einheitlichen Look:** Mach zuerst einen Helden, mit dem du zufrieden bist, und nutze ihn
> danach als **Stil-Referenz** (Leonardo: „Style Reference“, Midjourney: `--sref <Bild-URL>`).
> So sehen alle Bilder aus wie aus einem Guss.

> **Rechte:** Prüfe die Nutzungsbedingungen deines Bild-Generators. Für ein Spiel, das du verkaufen
> oder mit Werbung/Käufen betreiben willst, brauchst du in der Regel einen Tarif mit kommerzieller Nutzung.

> **Hintergrund:** Wenn der Generator den Hintergrund nicht sauber weiß macht, schreib statt
> „plain solid white background“ einfach „plain solid bright green background“ – das Skript erkennt jede
> einfarbige Fläche am Rand. Bilder mit echter Transparenz (PNG) werden unverändert übernommen.

## Stil-Prompt (immer anhängen)

```
stylized 3D game art like a modern mobile strategy game, post-apocalyptic zombie survival theme, bold readable silhouette, rich saturated colors, soft cinematic lighting, high detail, centered, whole subject visible, isolated on a plain solid white background, no text, no frame, no ground shadow
```

**Beispiel komplett (Rex):**

```
waist-up portrait of a rugged male firefighter, red helmet, soot on his face, holding a fire axe over his shoulder, facing the viewer at a slight angle, confident pose, stylized 3D game art like a modern mobile strategy game, post-apocalyptic zombie survival theme, bold readable silhouette, rich saturated colors, soft cinematic lighting, high detail, centered, whole subject visible, isolated on a plain solid white background, no text, no frame, no ground shadow
```

## Reihenfolge

Fang mit den **5 Start-Helden, den 4 Zombies und den 10 Gebäuden** an – die sieht man am häufigsten.
Die Symbole der Oberfläche (Abschnitt 7) kommen zuletzt.


## 1. Helden (wichtigste Bilder)

*Brustbild (Hüfte aufwärts), leicht schräg zum Betrachter.* Vorlage: `waist-up portrait of a …, facing the viewer at a slight angle, confident pose`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `hero-rex.png` | Rex – Feuerwehrmann (Rot) | waist-up portrait of a rugged male firefighter, red helmet, soot on his face, holding a fire axe over his shoulder, facing the viewer at a slight angle, confident pose |
| `hero-mara.png` | Mara – Ärztin (Blau) | waist-up portrait of a young female field doctor, white coat over blue scrubs, stethoscope, holding a glowing blue medkit, facing the viewer at a slight angle, confident pose |
| `hero-ivy.png` | Ivy – Polizistin (Grün) | waist-up portrait of a female police officer, tactical vest, green armband, ponytail, holding a pistol, facing the viewer at a slight angle, confident pose |
| `hero-bolt.png` | Bolt – Mechaniker (Gelb) | waist-up portrait of a cheerful male mechanic, yellow overalls, goggles on forehead, big wrench, sparks, facing the viewer at a slight angle, confident pose |
| `hero-nyx.png` | Nyx – Ninja (Lila) | waist-up portrait of a female ninja in dark purple outfit, face mask, katana on her back, glowing violet eyes, facing the viewer at a slight angle, confident pose |
| `hero-brutus.png` | Brutus – Bauarbeiter (Rot) | waist-up portrait of a huge male construction worker, orange high-visibility vest, hard hat, sledgehammer, facing the viewer at a slight angle, confident pose |
| `hero-hawk.png` | Hawk – Detektiv (Grün) | waist-up portrait of a male detective in a long trench coat and fedora, green scarf, revolver, facing the viewer at a slight angle, confident pose |
| `hero-kane.png` | Kane – Gardist (Rot) | waist-up portrait of a stern male royal guard soldier, red coat, tall bearskin hat, rifle with bayonet, facing the viewer at a slight angle, confident pose |
| `hero-hale.png` | Dr. Hale – Forscher (Blau) | waist-up portrait of a male scientist, lab coat, round glasses, holding a glowing blue serum syringe, facing the viewer at a slight angle, confident pose |
| `hero-jo.png` | Jo – Farmerin (Grün) | waist-up portrait of a tough female farmer, straw hat, plaid shirt, double-barrel shotgun, facing the viewer at a slight angle, confident pose |
| `hero-ace.png` | Ace – Pilot (Gelb) | waist-up portrait of a male pilot, brown aviator jacket with yellow details, flight goggles, scarf, facing the viewer at a slight angle, confident pose |
| `hero-sparky.png` | Sparky – Ingenieurin (Gelb) | waist-up portrait of a female engineer, welding goggles, electric tesla gauntlet crackling with yellow lightning, facing the viewer at a slight angle, confident pose |
| `hero-raven.png` | Raven – Vampirin (Lila) | waist-up portrait of a elegant vampire woman, dark purple gothic coat, pale skin, red eyes, sharp nails, facing the viewer at a slight angle, confident pose |
| `hero-valkyra.png` | Valkyra – Heldin (Rot, legendär) | waist-up portrait of a female warrior heroine, battle-worn red armor, flowing cape, glowing sword, legendary aura, facing the viewer at a slight angle, confident pose |
| `hero-athena.png` | Athena – Erzmagierin (Blau, legendär) | waist-up portrait of a female archmage, long white hair, blue robes, glowing crystal staff, legendary aura, facing the viewer at a slight angle, confident pose |
| `hero-ghost.png` | Ghost – Scharfschützin (Grün, legendär) | waist-up portrait of a elf sniper woman, green hooded cloak, long scoped rifle, legendary aura, facing the viewer at a slight angle, confident pose |
| `hero-luna.png` | Luna – Astronautin (Gelb, legendär) | waist-up portrait of a female astronaut in a damaged spacesuit with yellow details, energy blaster, legendary aura, facing the viewer at a slight angle, confident pose |
| `hero-zero.png` | Zero – Schurke (Lila, legendär) | waist-up portrait of a masked villain in purple and black armor, dark void energy swirling in his hands, facing the viewer at a slight angle, confident pose |
| `hero-phoenix.png` | Phoenix – Mythisch (Rot) | waist-up portrait of a male superhero with flaming wings, golden-red armor, fire aura, epic and powerful, facing the viewer at a slight angle, confident pose |
| `hero-oracle.png` | Oracle – Mythisch (Blau) | waist-up portrait of a mystical seer woman with glowing blue eyes, floating crystals around her, ethereal robes, facing the viewer at a slight angle, confident pose |
| `hero-nocturne.png` | Nocturne – Mythisch (Lila) | waist-up portrait of a vampire lord in regal black and purple armor, bat wings, crimson aura, crown, facing the viewer at a slight angle, confident pose |

## 2. Zombies

*Ganzkörper, leicht gebückt, Blick zum Betrachter.* Vorlage: `full-body …, menacing but stylized, facing the viewer`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `zombie-walker.png` | Streuner | full-body classic shambling zombie, torn clothes, grey-green skin, arms reaching forward, menacing but stylized, facing the viewer |
| `zombie-runner.png` | Sprinter | full-body fast thin zombie in a ragged hoodie, running pose, menacing but stylized, facing the viewer |
| `zombie-brute.png` | Koloss | full-body huge muscular zombie brute, torn shirt, massive fists, menacing but stylized, facing the viewer |
| `zombie-boss.png` | Mutant (Boss) | full-body giant mutant zombie boss, exposed muscles, glowing red eyes, bone spikes, menacing but stylized, facing the viewer |
| `zombie-shielder.png` | Panzer-Zombie (optional) | full-body zombie in riot police armor holding a dented riot shield, menacing but stylized, facing the viewer |
| `zombie-bomber.png` | Explodierer (optional) | full-body zombie carrying explosive barrels on its back, burning fuse, menacing but stylized, facing the viewer |
| `zombie-healer.png` | Seuchen-Doktor (optional) | full-body plague doctor zombie with a beak mask, green toxic vials on his belt, menacing but stylized, facing the viewer |
| `zombie-spitter.png` | Spucker (optional) | full-body bloated zombie with a swollen green throat, dripping acid, menacing but stylized, facing the viewer |
| `zombie-titan.png` | Titan (optional, Event-Boss) | full-body colossal kaiju-like mutant zombie titan, towering, glowing cracks in its skin, menacing but stylized, facing the viewer |

## 3. Gebäude

*Isometrische Ansicht (von schräg oben), kleines Diorama.* Vorlage: `isometric 3/4 view of a …, small diorama-like building on a tiny patch of ground`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `b-hq.png` | Hauptquartier | isometric 3/4 view of a fortified headquarters built from an old town hall, sandbags, radio antenna, flag on the roof, small diorama-like building on a tiny patch of ground |
| `b-farm.png` | Farm | isometric 3/4 view of a small survivor farm with a greenhouse and vegetable beds, small diorama-like building on a tiny patch of ground |
| `b-sawmill.png` | Sägewerk | isometric 3/4 view of a sawmill with a big circular saw and stacked logs, small diorama-like building on a tiny patch of ground |
| `b-steelworks.png` | Stahlwerk | isometric 3/4 view of a scrap metal steel foundry with a smoking chimney and glowing furnace, small diorama-like building on a tiny patch of ground |
| `b-warehouse.png` | Lager | isometric 3/4 view of a storage depot with crates, barrels and a shipping container, small diorama-like building on a tiny patch of ground |
| `b-wall.png` | Schutzmauer | isometric 3/4 view of a fortified gate with spiked barricades, sandbags and a watchtower, small diorama-like building on a tiny patch of ground |
| `b-barracks.png` | Kaserne | isometric 3/4 view of a military barracks tent with weapon racks and a training dummy, small diorama-like building on a tiny patch of ground |
| `b-workshop.png` | Werkstatt | isometric 3/4 view of a vehicle workshop garage with tools and a half-built armored truck, small diorama-like building on a tiny patch of ground |
| `b-hospital.png` | Lazarett | isometric 3/4 view of a field hospital tent with a red cross, stretchers and medical supplies, small diorama-like building on a tiny patch of ground |
| `b-lab.png` | Forschungszentrum | isometric 3/4 view of a research lab container with antennas, glowing screens and test tubes, small diorama-like building on a tiny patch of ground |

## 4. Truppen

*Ganzkörper bzw. ganzes Fahrzeug.* Vorlage: `full-body …`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `unit-brawler.png` | Schläger | full-body survivor soldier with a riot shield and a spiked baseball bat |
| `unit-shooter.png` | Schütze | full-body survivor archer with a crossbow and a quiver of bolts |
| `unit-rider.png` | Fahrer | full-body raider on a rugged motorcycle with spikes |
| `unit-wagon.png` | Sammelwagen | full-body armored pickup truck loaded with supply crates |

## 5. Spielsteine, Rohstoffe, Gegenstände, Ausrüstung

*Einzelnes Objekt als Symbol, wuchtige Form.* Vorlage: `game icon of a …, chunky shape, glossy`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `tile-0.png` | Stein Rot (Axt) | game icon of a fire axe, chunky shape, glossy |
| `tile-1.png` | Stein Blau (Spritze) | game icon of a medical syringe, chunky shape, glossy |
| `tile-2.png` | Stein Grün (Zielscheibe) | game icon of a sniper crosshair target, chunky shape, glossy |
| `tile-3.png` | Stein Gelb (Blitz) | game icon of a lightning bolt, chunky shape, glossy |
| `tile-4.png` | Stein Lila (Dolch) | game icon of a dagger, chunky shape, glossy |
| `res-food.png` | Nahrung | game icon of a sack of grain with canned food, chunky shape, glossy |
| `res-wood.png` | Holz | game icon of a stack of chopped logs, chunky shape, glossy |
| `res-steel.png` | Stahl | game icon of a stack of steel plates and bolts, chunky shape, glossy |
| `ui-gem.png` | Diamant | game icon of a glowing blue diamond gem, chunky shape, glossy |
| `item-speed5m.png` | Beschleuniger 5 Min. | game icon of a silver stopwatch, chunky shape, glossy |
| `item-speed1h.png` | Beschleuniger 1 Std. | game icon of a golden hourglass, chunky shape, glossy |
| `item-speed8h.png` | Beschleuniger 8 Std. | game icon of a ornate golden alarm clock, chunky shape, glossy |
| `gear-weapon-common.png` | Waffe gewöhnlich | game icon of a rusty survival knife, chunky shape, glossy |
| `gear-weapon-epic.png` | Waffe episch | game icon of a tactical combat dagger with purple glow, chunky shape, glossy |
| `gear-weapon-legendary.png` | Waffe legendär | game icon of a golden plasma trident with energy glow, chunky shape, glossy |
| `gear-armor-common.png` | Rüstung gewöhnlich | game icon of a worn leather jacket, chunky shape, glossy |
| `gear-armor-epic.png` | Rüstung episch | game icon of a kevlar tactical vest with purple accents, chunky shape, glossy |
| `gear-armor-legendary.png` | Rüstung legendär | game icon of a golden titan shield, chunky shape, glossy |
| `gear-helmet-common.png` | Helm gewöhnlich | game icon of a dented construction hard hat, chunky shape, glossy |
| `gear-helmet-epic.png` | Helm episch | game icon of a military combat helmet with purple stripe, chunky shape, glossy |
| `gear-helmet-legendary.png` | Helm legendär | game icon of a golden survivor crown, chunky shape, glossy |

## 6. Karte, Weltkarte, Deko

*Isometrisch, klein und gut erkennbar.* Vorlage: `isometric 3/4 view of a …, small and clearly readable`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `place-0.png` | Ort: Tankstelle | isometric 3/4 view of a small abandoned gas station, small and clearly readable |
| `place-1.png` | Ort: Supermarkt | isometric 3/4 view of a small looted supermarket, small and clearly readable |
| `place-2.png` | Ort: Krankenhaus | isometric 3/4 view of a small ruined hospital, small and clearly readable |
| `place-3.png` | Ort: Polizeiwache | isometric 3/4 view of a small police station with a police car, small and clearly readable |
| `place-4.png` | Ort: Brücke | isometric 3/4 view of a small broken suspension bridge, small and clearly readable |
| `place-5.png` | Ort: Fabrik | isometric 3/4 view of a small abandoned factory, small and clearly readable |
| `place-6.png` | Ort: Hafen | isometric 3/4 view of a small harbor with a rusty ship, small and clearly readable |
| `place-7.png` | Ort: Labor | isometric 3/4 view of a small secret laboratory with toxic barrels, small and clearly readable |
| `w-city2.png` | Weltkarte: Mitspieler-Stadt | isometric 3/4 view of a small walled survivor settlement, small and clearly readable |
| `w-city.png` | Weltkarte: große Stadt | isometric 3/4 view of a large fortified survivor city, small and clearly readable |
| `w-field.png` | Weltkarte: Farmfeld | isometric 3/4 view of a patch of wheat field, small and clearly readable |
| `w-forest.png` | Weltkarte: Wald | isometric 3/4 view of a small cluster of pine trees, small and clearly readable |
| `w-mine.png` | Weltkarte: Stahlmine | isometric 3/4 view of a small mine entrance with ore carts, small and clearly readable |
| `deco-tree.png` | Deko: Baum | isometric 3/4 view of a single green pine tree, small and clearly readable |
| `deco-tree2.png` | Deko: Baum 2 | isometric 3/4 view of a single leafy tree, small and clearly readable |
| `deco-rock.png` | Deko: Fels | isometric 3/4 view of a mossy rock, small and clearly readable |
| `deco-ruin.png` | Deko: Ruine | isometric 3/4 view of a small ruined house, small and clearly readable |
| `deco-car.png` | Deko: Autowrack | isometric 3/4 view of a rusty abandoned car, small and clearly readable |
| `deco-tent.png` | Deko: Zelt | isometric 3/4 view of a green survivor tent, small and clearly readable |
| `deco-fire.png` | Deko: Lagerfeuer | isometric 3/4 view of a campfire with flames, small and clearly readable |
| `deco-barrel.png` | Deko: Fass | isometric 3/4 view of a blue oil barrel, small and clearly readable |
| `deco-warning.png` | Deko: Warnschild | isometric 3/4 view of a yellow warning sign, small and clearly readable |
| `deco-barrier.png` | Deko: Absperrung | isometric 3/4 view of a striped road barrier, small and clearly readable |
| `deco-log.png` | Deko: Holzstamm | isometric 3/4 view of a fallen log, small and clearly readable |

## 7. Symbole der Oberfläche (zuletzt)

*Kleines, klares Symbol.* Vorlage: `game UI icon of a …, simple chunky shape, glossy`

| Datei (`art-src/…`) | Was | Bild-Prompt |
| --- | --- | --- |
| `ui-swords.png` | Kampf | game UI icon of a two crossed swords, simple chunky shape, glossy |
| `ui-shield.png` | Schild | game UI icon of a round metal shield, simple chunky shape, glossy |
| `ui-skull.png` | Totenkopf | game UI icon of a skull, simple chunky shape, glossy |
| `ui-trophy.png` | Pokal | game UI icon of a golden trophy, simple chunky shape, glossy |
| `ui-star.png` | Stern | game UI icon of a golden star, simple chunky shape, glossy |
| `ui-lock.png` | Schloss | game UI icon of a padlock, simple chunky shape, glossy |
| `ui-check.png` | Haken | game UI icon of a green check mark badge, simple chunky shape, glossy |
| `ui-hammer.png` | Hammer | game UI icon of a building hammer, simple chunky shape, glossy |
| `ui-hourglass.png` | Sanduhr | game UI icon of a hourglass, simple chunky shape, glossy |
| `ui-muscle.png` | Stärke | game UI icon of a flexed muscular arm, simple chunky shape, glossy |
| `ui-heart.png` | Herz | game UI icon of a red heart, simple chunky shape, glossy |
| `ui-map.png` | Karte | game UI icon of a folded treasure map, simple chunky shape, glossy |
| `ui-globe.png` | Weltkugel | game UI icon of a earth globe, simple chunky shape, glossy |
| `ui-flag.png` | Flagge | game UI icon of a red banner flag, simple chunky shape, glossy |
| `ui-scroll.png` | Schriftrolle | game UI icon of a parchment scroll, simple chunky shape, glossy |
| `ui-gift.png` | Truhe | game UI icon of a treasure chest, simple chunky shape, glossy |
| `ui-bag.png` | Rucksack | game UI icon of a survival backpack, simple chunky shape, glossy |
| `ui-forge.png` | Schmiede | game UI icon of a anvil with hammer, simple chunky shape, glossy |
| `ui-portal.png` | Portal | game UI icon of a swirling magic portal, simple chunky shape, glossy |
| `ui-sparkle.png` | Funkeln | game UI icon of a sparkles, simple chunky shape, glossy |
| `ui-glowstar.png` | Leuchtstern | game UI icon of a glowing star, simple chunky shape, glossy |
| `ui-crystal.png` | Kristall | game UI icon of a crystal ball, simple chunky shape, glossy |
| `ui-medal.png` | Medaille | game UI icon of a medal with ribbon, simple chunky shape, glossy |
| `ui-pin.png` | Ziel | game UI icon of a map pin, simple chunky shape, glossy |
| `ui-bomb.png` | Bombe | game UI icon of a round bomb with fuse, simple chunky shape, glossy |
| `ui-virus.png` | Virus | game UI icon of a green virus, simple chunky shape, glossy |
| `ui-ice.png` | Eis | game UI icon of a ice cube, simple chunky shape, glossy |
| `ui-boom.png` | Explosion | game UI icon of a cartoon explosion, simple chunky shape, glossy |
| `ui-bandage.png` | Verband | game UI icon of a bandage roll, simple chunky shape, glossy |
| `ui-crane.png` | Baukran | game UI icon of a construction crane, simple chunky shape, glossy |
| `ui-cart.png` | Warenkorb | game UI icon of a shopping cart, simple chunky shape, glossy |
| `ui-search.png` | Lupe | game UI icon of a magnifying glass, simple chunky shape, glossy |


## 8. Hintergrund (optional)

| Datei | Was | Prompt (Format **3:2** quer) |
| --- | --- | --- |
| `bg-battle.png` | Kampf-Hintergrund oben | wide illustration of a ruined city street at dusk, red sky, abandoned cars, collapsed buildings, empty ground in the foreground, mobile game background, no characters, no text |

Dateien, die mit `bg-` beginnen, werden **nicht** freigestellt, sondern nur verkleinert.
