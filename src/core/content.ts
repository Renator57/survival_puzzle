// Spielinhalte: Helden, Zombies, Gebäude, Level. Hier wird das Balancing eingestellt.

export type HeroId = 'rex' | 'mara' | 'ivy' | 'bolt' | 'nyx';
export type SkillKind = 'strike' | 'heal' | 'volley' | 'stun' | 'drain';

export interface HeroDef {
  id: HeroId;
  name: string;
  role: string;
  color: number; // Index der Steinfarbe auf dem Spielfeld
  baseAttack: number;
  baseHp: number;
  skill: { kind: SkillKind; name: string; text: string; energy: number };
}

export const HEROES: HeroDef[] = [
  { id: 'rex', name: 'Rex', role: 'Nahkämpfer', color: 0, baseAttack: 34, baseHp: 260,
    skill: { kind: 'strike', name: 'Vorschlaghammer', text: '6-facher Schaden am vordersten Zombie.', energy: 12 } },
  { id: 'mara', name: 'Mara', role: 'Sanitäterin', color: 1, baseAttack: 20, baseHp: 220,
    skill: { kind: 'heal', name: 'Erste Hilfe', text: 'Heilt das Team um 30 %.', energy: 12 } },
  { id: 'ivy', name: 'Ivy', role: 'Scharfschützin', color: 2, baseAttack: 30, baseHp: 180,
    skill: { kind: 'volley', name: 'Kugelhagel', text: '2,5-facher Schaden an allen Zombies.', energy: 14 } },
  { id: 'bolt', name: 'Bolt', role: 'Techniker', color: 3, baseAttack: 24, baseHp: 240,
    skill: { kind: 'stun', name: 'Elektrozaun', text: 'Alle Zombies verlieren 2 Züge und nehmen Schaden.', energy: 12 } },
  { id: 'nyx', name: 'Nyx', role: 'Jägerin', color: 4, baseAttack: 28, baseHp: 200,
    skill: { kind: 'drain', name: 'Lebensraub', text: '4-facher Schaden, heilt das Team um 10 %.', energy: 12 } },
];

export const MAX_HERO_LEVEL = 30;

export function heroStats(def: HeroDef, level: number) {
  const f = 1.12 ** (level - 1);
  return { attack: Math.round(def.baseAttack * f), hp: Math.round(def.baseHp * f) };
}

export function heroUpgradeCost(level: number) {
  return { food: Math.round(80 * 1.32 ** level), wood: Math.round(40 * 1.32 ** level), steel: 0 };
}

export type ZombieKind = 'walker' | 'runner' | 'brute' | 'spitter' | 'boss';

export const ZOMBIES: Record<ZombieKind, { name: string; hp: number; attack: number; countdown: number; size: number }> = {
  walker: { name: 'Streuner', hp: 120, attack: 30, countdown: 3, size: 1 },
  runner: { name: 'Sprinter', hp: 70, attack: 22, countdown: 2, size: 0.85 },
  brute: { name: 'Koloss', hp: 320, attack: 70, countdown: 4, size: 1.3 },
  spitter: { name: 'Spucker', hp: 110, attack: 45, countdown: 3, size: 1 },
  boss: { name: 'Mutant', hp: 1100, attack: 110, countdown: 3, size: 1.7 },
};

export interface StageDef {
  id: number;
  name: string;
  waves: ZombieKind[][];
  scale: number; // Multiplikator für Zombie-Werte
  reward: Resources;
}

export type ResourceId = 'food' | 'wood' | 'steel';
export type Resources = Record<ResourceId, number>;

const STAGE_NAMES = ['Tankstelle', 'Supermarkt', 'Krankenhaus', 'Polizeiwache', 'Brücke', 'Fabrik', 'Hafen', 'Labor'];

// 24 Level, alle 4 Level ein Boss. Werte steigen gleichmäßig.
export const STAGES: StageDef[] = Array.from({ length: 24 }, (_, i) => {
  const n = i + 1;
  const pool: ZombieKind[] = n < 3 ? ['walker'] : n < 6 ? ['walker', 'runner'] : ['walker', 'runner', 'spitter', 'brute'];
  const waveCount = 2 + Math.min(2, Math.floor(n / 5));
  const waves: ZombieKind[][] = Array.from({ length: waveCount }, (_, w) => {
    const size = Math.min(4, 2 + Math.floor((n + w) / 6));
    return Array.from({ length: size }, (_, k) => pool[(n * 3 + w * 2 + k) % pool.length]);
  });
  if (n % 4 === 0) waves[waves.length - 1] = ['boss', ...(n >= 8 ? (['runner'] as ZombieKind[]) : [])];
  return {
    id: n,
    name: `${STAGE_NAMES[Math.floor(i / 3) % STAGE_NAMES.length]} ${(i % 3) + 1}`,
    waves,
    scale: 1.17 ** i,
    reward: {
      food: Math.round(150 * 1.2 ** i),
      wood: Math.round(110 * 1.2 ** i),
      steel: n >= 3 ? Math.round(30 * 1.2 ** i) : 0,
    },
  };
});

export type BuildingId = 'hq' | 'farm' | 'sawmill' | 'steelworks' | 'warehouse' | 'wall' | 'barracks' | 'workshop';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  text: string;
  baseCost: Resources;
  baseTime: number; // Sekunden für Stufe 1
  produces?: ResourceId;
  rate?: number; // pro Sekunde auf Stufe 1
  unlockHq?: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'hq', name: 'Hauptquartier', icon: '🏛️', text: 'Bestimmt, wie weit andere Gebäude ausgebaut werden können.',
    baseCost: { food: 300, wood: 300, steel: 0 }, baseTime: 10 },
  { id: 'farm', name: 'Farm', icon: '🌾', text: 'Produziert Nahrung.',
    baseCost: { food: 60, wood: 120, steel: 0 }, baseTime: 4, produces: 'food', rate: 1.2 },
  { id: 'sawmill', name: 'Sägewerk', icon: '🪵', text: 'Produziert Holz.',
    baseCost: { food: 120, wood: 60, steel: 0 }, baseTime: 4, produces: 'wood', rate: 1 },
  { id: 'steelworks', name: 'Stahlwerk', icon: '⚙️', text: 'Produziert Stahl.', unlockHq: 2,
    baseCost: { food: 400, wood: 400, steel: 0 }, baseTime: 8, produces: 'steel', rate: 0.4 },
  { id: 'warehouse', name: 'Lager', icon: '📦', text: 'Erhöht die Lagerkapazität aller Rohstoffe.',
    baseCost: { food: 150, wood: 200, steel: 0 }, baseTime: 5 },
  { id: 'wall', name: 'Schutzmauer', icon: '🧱', text: '+8 % Team-Lebenspunkte im Kampf pro Stufe.',
    baseCost: { food: 100, wood: 250, steel: 40 }, baseTime: 6 },
  { id: 'barracks', name: 'Kaserne', icon: '🪖', text: 'Bildet Soldaten aus. Jede Stufe bringt mehr Platz und schnellere Ausbildung.',
    baseCost: { food: 200, wood: 250, steel: 0 }, baseTime: 6 },
  { id: 'workshop', name: 'Werkstatt', icon: '🧰', text: 'Baut Sammelwagen mit riesiger Ladefläche für die Weltkarte.', unlockHq: 2,
    baseCost: { food: 150, wood: 300, steel: 60 }, baseTime: 8 },
];

export const MAX_HQ_LEVEL = 15;
