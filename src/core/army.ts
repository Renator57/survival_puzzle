// Truppen und Armee-Kämpfe (Weltkarte). Komplett deterministisch: gleiche Armeen = gleiches Ergebnis.
// Dadurch kann die Vorschau exakt sein und ein Server jeden Kampf nachrechnen.
import type { Resources } from './content';

export type UnitId = 'brawler' | 'shooter' | 'rider' | 'wagon';
export type FighterId = UnitId | 'zombie';
export type Army = Partial<Record<FighterId, number>>;

export interface UnitDef {
  id: UnitId;
  name: string;
  plural: string;
  text: string;
  attack: number;
  defense: number;
  hp: number;
  load: number; // Tragkraft beim Sammeln/Plündern
  speed: number; // 1 = normal
  cost: Resources;
  seconds: number; // Ausbildungszeit pro Einheit
  building: 'barracks' | 'workshop';
  strongVs?: UnitId;
}

// Konter-Dreieck: Schläger > Fahrer > Schützen > Schläger
export const UNITS: UnitDef[] = [
  { id: 'brawler', name: 'Schläger', plural: 'Schläger', text: 'Robuste Nahkämpfer mit Schild. Halten Fahrer auf.',
    attack: 10, defense: 12, hp: 32, load: 8, speed: 1, cost: { food: 40, wood: 30, steel: 0 }, seconds: 2, building: 'barracks', strongVs: 'rider' },
  { id: 'shooter', name: 'Schütze', plural: 'Schützen', text: 'Treffen aus der Distanz. Zerlegen Schläger, bevor sie herankommen.',
    attack: 14, defense: 6, hp: 22, load: 6, speed: 1, cost: { food: 35, wood: 45, steel: 0 }, seconds: 2, building: 'barracks', strongVs: 'brawler' },
  { id: 'rider', name: 'Fahrer', plural: 'Fahrer', text: 'Schnelle Motorrad-Trupps. Überrennen Schützen.',
    attack: 12, defense: 9, hp: 26, load: 10, speed: 1.4, cost: { food: 50, wood: 20, steel: 12 }, seconds: 3, building: 'barracks', strongVs: 'shooter' },
  { id: 'wagon', name: 'Sammelwagen', plural: 'Sammelwagen', text: 'Kaum Kampfkraft, aber riesige Ladefläche – ideal zum Sammeln.',
    attack: 1, defense: 4, hp: 40, load: 150, speed: 0.8, cost: { food: 0, wood: 120, steel: 30 }, seconds: 15, building: 'workshop' },
];

const ZOMBIE = { attack: 9, defense: 4, hp: 26, load: 0 };

export const unitDef = (id: UnitId) => UNITS.find((u) => u.id === id)!;
const stats = (id: FighterId) => (id === 'zombie' ? ZOMBIE : unitDef(id));

export function counterMultiplier(attacker: FighterId, defender: FighterId): number {
  if (attacker === 'zombie' || defender === 'zombie') return 1;
  if (unitDef(attacker).strongVs === defender) return 1.5;
  if (unitDef(defender).strongVs === attacker) return 0.75;
  return 1;
}

export const fighters = (army: Army) => (Object.keys(army) as FighterId[]).filter((k) => (army[k] ?? 0) > 0);
export const armySize = (army: Army) => fighters(army).reduce((s, k) => s + (army[k] ?? 0), 0);
export const armyLoad = (army: Army) => fighters(army).reduce((s, k) => s + (army[k] ?? 0) * stats(k).load, 0);

export function armySpeed(army: Army): number {
  const units = fighters(army).filter((k): k is UnitId => k !== 'zombie');
  return units.length ? Math.min(...units.map((k) => unitDef(k).speed)) : 1;
}

// Grobe Kampfkraft für Anzeigen.
export function armyPower(army: Army, scale = 1): number {
  return Math.round(fighters(army).reduce((s, k) => {
    const u = stats(k);
    return s + (army[k] ?? 0) * (u.attack * 2 + u.defense + u.hp / 2) * scale;
  }, 0) / 10);
}

export interface FightResult {
  attackerWon: boolean;
  rounds: number;
  attackerLeft: Army;
  defenderLeft: Army;
  attackerLosses: Army;
  defenderLosses: Army;
}

const ROUND_FACTOR = 0.22;
const MAX_ROUNDS = 25;

function damageTo(from: Record<string, number>, to: Record<string, number>, fromScale: number) {
  const out: Record<string, number> = {};
  const total = Object.values(to).reduce((a, b) => a + b, 0);
  if (total <= 0) return out;
  for (const [a, na] of Object.entries(from)) {
    if (na <= 0) continue;
    for (const [d, nd] of Object.entries(to)) {
      if (nd <= 0) continue;
      const dmg = na * stats(a as FighterId).attack * fromScale * counterMultiplier(a as FighterId, d as FighterId) * (nd / total) * ROUND_FACTOR;
      out[d] = (out[d] ?? 0) + dmg;
    }
  }
  return out;
}

const effectiveHp = (id: FighterId, scale: number) => stats(id).hp * scale * (1 + (stats(id).defense * scale) / 40);

export function fight(attacker: Army, defender: Army, defenderScale = 1, attackerScale = 1): FightResult {
  const A: Record<string, number> = Object.fromEntries(fighters(attacker).map((k) => [k, attacker[k]!]));
  const D: Record<string, number> = Object.fromEntries(fighters(defender).map((k) => [k, defender[k]!]));
  const alive = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0) >= 0.5;
  let rounds = 0;
  while (rounds < MAX_ROUNDS && alive(A) && alive(D)) {
    rounds++;
    const toD = damageTo(A, D, attackerScale);
    const toA = damageTo(D, A, defenderScale);
    for (const k of Object.keys(D)) D[k] = Math.max(0, D[k] - (toD[k] ?? 0) / effectiveHp(k as FighterId, defenderScale));
    for (const k of Object.keys(A)) A[k] = Math.max(0, A[k] - (toA[k] ?? 0) / effectiveHp(k as FighterId, attackerScale));
  }
  const round = (x: Record<string, number>): Army => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v)]));
  const attackerLeft = round(A);
  const defenderLeft = round(D);
  const losses = (orig: Army, left: Army): Army =>
    Object.fromEntries(fighters(orig).map((k) => [k, orig[k]! - (left[k] ?? 0)]));
  return {
    attackerWon: armySize(defenderLeft) === 0 && armySize(attackerLeft) > 0,
    rounds,
    attackerLeft,
    defenderLeft,
    attackerLosses: losses(attacker, attackerLeft),
    defenderLosses: losses(defender, defenderLeft),
  };
}
