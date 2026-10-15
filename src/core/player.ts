// Spielerstand und Basis: Rohstoffe, Gebäude mit Bauzeiten, Helden-Level, Fortschritt.
// Alle Funktionen bekommen die Uhrzeit (`now`) übergeben – so kann später der Server rechnen.
import {
  BUILDINGS,
  HEROES,
  MAX_HERO_LEVEL,
  MAX_HQ_LEVEL,
  STAGES,
  heroStats,
  heroUpgradeCost,
  type BuildingDef,
  type BuildingId,
  type HeroId,
  type ResourceId,
  type Resources,
} from './content';
import { armySize, unitDef, UNITS, type Army, type UnitId } from './army';
import { processMarches, type March, type Report, type TileState } from './world';

export const SAVE_VERSION = 1;
export const RESOURCE_IDS: ResourceId[] = ['food', 'wood', 'steel'];

export interface BuildingState {
  level: number;
  upgradeEndsAt: number | null;
}

export interface Training {
  unit: UnitId;
  amount: number;
  startAt: number;
  endsAt: number;
}

export type TrainingBuilding = 'barracks' | 'workshop';

export interface Player {
  version: number;
  resources: Resources;
  buildings: Record<BuildingId, BuildingState>;
  heroes: Record<HeroId, number>;
  stagesCleared: number;
  troops: Record<UnitId, number>; // Einheiten zu Hause (unterwegs zählen die Märsche)
  queues: Record<TrainingBuilding, Training | null>;
  marches: March[];
  reports: Report[];
  world: { seed: number; tiles: Record<string, TileState> };
  nextId: number;
  lastUpdate: number;
}

const START_LEVELS: Record<BuildingId, number> = {
  hq: 1, farm: 1, sawmill: 1, steelworks: 0, warehouse: 1, wall: 0, barracks: 1, workshop: 0,
};

export function createPlayer(now: number): Player {
  return {
    version: SAVE_VERSION,
    resources: { food: 1000, wood: 1000, steel: 0 },
    buildings: Object.fromEntries(
      BUILDINGS.map((b) => [b.id, { level: START_LEVELS[b.id], upgradeEndsAt: null }]),
    ) as Record<BuildingId, BuildingState>,
    heroes: Object.fromEntries(HEROES.map((h) => [h.id, 1])) as Record<HeroId, number>,
    stagesCleared: 0,
    troops: { brawler: 30, shooter: 30, rider: 20, wagon: 0 },
    queues: { barracks: null, workshop: null },
    marches: [],
    reports: [],
    world: { seed: (now % 2147483646) + 1, tiles: {} },
    nextId: 1,
    lastUpdate: now,
  };
}

const def = (id: BuildingId) => BUILDINGS.find((b) => b.id === id)!;

// Werte einer bestimmten Stufe – für Anzeigen wie „aktuell → nächste Stufe“.
export const capacityAt = (warehouseLevel: number) => Math.round(2000 * 1.6 ** (warehouseLevel - 1));
export const rateAt = (b: BuildingDef, level: number) => (level > 0 && b.rate ? b.rate * level * 1.18 ** (level - 1) : 0);
export const wallBonusAt = (level: number) => level * 0.08;

export function capacity(player: Player): number {
  return capacityAt(player.buildings.warehouse.level);
}

export function productionRate(player: Player, resource: ResourceId): number {
  return BUILDINGS.filter((b) => b.produces === resource).reduce((sum, b) => sum + rateAt(b, player.buildings[b.id].level), 0);
}

export function wallBonus(player: Player): number {
  return wallBonusAt(player.buildings.wall.level);
}

export function maxLevel(player: Player, id: BuildingId): number {
  return id === 'hq' ? MAX_HQ_LEVEL : player.buildings.hq.level;
}

export function upgradeCost(b: BuildingDef, level: number): Resources {
  const f = 1.55 ** level;
  return { food: Math.round(b.baseCost.food * f), wood: Math.round(b.baseCost.wood * f), steel: Math.round(b.baseCost.steel * f) };
}

export function upgradeSeconds(b: BuildingDef, level: number): number {
  return Math.round(b.baseTime * 1.7 ** level);
}

export const canAfford = (player: Player, cost: Resources) => RESOURCE_IDS.every((r) => player.resources[r] >= cost[r]);

function pay(player: Player, cost: Resources) {
  for (const r of RESOURCE_IDS) player.resources[r] -= cost[r];
}

// Bauaufträge abschließen und Produktion seit dem letzten Update gutschreiben.
export function update(player: Player, now: number) {
  for (const b of BUILDINGS) {
    const s = player.buildings[b.id];
    if (s.upgradeEndsAt !== null && s.upgradeEndsAt <= now) {
      s.level += 1;
      s.upgradeEndsAt = null;
    }
  }
  for (const q of ['barracks', 'workshop'] as const) {
    const t = player.queues[q];
    if (t && t.endsAt <= now) {
      player.troops[t.unit] += t.amount;
      player.queues[q] = null;
    }
  }
  processMarches(player, now);
  const seconds = Math.max(0, (now - player.lastUpdate) / 1000);
  const cap = capacity(player);
  for (const r of RESOURCE_IDS) {
    const current = player.resources[r];
    // Über der Kapazität (z. B. durch Kampfbeute) wird nichts abgezogen, nur nicht weiter produziert.
    if (current < cap) player.resources[r] = Math.min(cap, current + productionRate(player, r) * seconds);
  }
  player.lastUpdate = now;
}

export const activeUpgrade = (player: Player) => BUILDINGS.find((b) => player.buildings[b.id].upgradeEndsAt !== null);

export type UpgradeBlock = 'busy' | 'maxLevel' | 'locked' | 'resources' | null;

export function upgradeBlock(player: Player, id: BuildingId): UpgradeBlock {
  const b = def(id);
  const s = player.buildings[id];
  if (b.unlockHq && player.buildings.hq.level < b.unlockHq) return 'locked';
  if (activeUpgrade(player)) return 'busy';
  if (s.level >= maxLevel(player, id)) return 'maxLevel';
  if (!canAfford(player, upgradeCost(b, s.level))) return 'resources';
  return null;
}

export function startUpgrade(player: Player, id: BuildingId, now: number): UpgradeBlock {
  update(player, now);
  const block = upgradeBlock(player, id);
  if (block) return block;
  const b = def(id);
  const s = player.buildings[id];
  pay(player, upgradeCost(b, s.level));
  s.upgradeEndsAt = now + upgradeSeconds(b, s.level) * 1000;
  return null;
}

// ---------- Truppen ----------
export const soldierCap = (player: Player) => 100 + 150 * player.buildings.barracks.level;
export const wagonCap = (player: Player) => 3 * player.buildings.workshop.level;
export const trainSpeed = (level: number) => 1 + 0.15 * Math.max(0, level - 1);

// Alle Einheiten eines Typs: zu Hause, unterwegs und in Ausbildung.
export function totalUnits(player: Player, unit: UnitId): number {
  const marching = player.marches.reduce((s, m) => s + (m.units[unit] ?? 0), 0);
  const training = Object.values(player.queues).reduce((s, t) => s + (t?.unit === unit ? t.amount : 0), 0);
  return player.troops[unit] + marching + training;
}

export const totalSoldiers = (player: Player) =>
  UNITS.filter((u) => u.building === 'barracks').reduce((s, u) => s + totalUnits(player, u.id), 0);

export function freeSlots(player: Player, unit: UnitId): number {
  return unitDef(unit).building === 'workshop'
    ? wagonCap(player) - totalUnits(player, 'wagon')
    : soldierCap(player) - totalSoldiers(player);
}

export const trainCost = (unit: UnitId, amount: number): Resources => {
  const c = unitDef(unit).cost;
  return { food: c.food * amount, wood: c.wood * amount, steel: c.steel * amount };
};

export function trainSeconds(player: Player, unit: UnitId, amount: number): number {
  const u = unitDef(unit);
  return Math.max(1, Math.round((u.seconds * amount) / trainSpeed(player.buildings[u.building].level)));
}

export function maxTrainable(player: Player, unit: UnitId): number {
  const c = unitDef(unit).cost;
  const byRes = RESOURCE_IDS.map((r) => (c[r] > 0 ? Math.floor(player.resources[r] / c[r]) : Infinity));
  return Math.max(0, Math.min(freeSlots(player, unit), ...byRes));
}

export type TrainBlock = 'locked' | 'busy' | 'capacity' | 'resources' | 'amount' | null;

export function trainBlock(player: Player, unit: UnitId, amount: number): TrainBlock {
  const u = unitDef(unit);
  if (player.buildings[u.building].level === 0) return 'locked';
  if (player.queues[u.building]) return 'busy';
  if (amount <= 0) return 'amount';
  if (amount > freeSlots(player, unit)) return 'capacity';
  if (!canAfford(player, trainCost(unit, amount))) return 'resources';
  return null;
}

export function startTraining(player: Player, unit: UnitId, amount: number, now: number): TrainBlock {
  update(player, now);
  const block = trainBlock(player, unit, amount);
  if (block) return block;
  pay(player, trainCost(unit, amount));
  player.queues[unitDef(unit).building] = { unit, amount, startAt: now, endsAt: now + trainSeconds(player, unit, amount) * 1000 };
  return null;
}

export const homeArmy = (player: Player): Army => ({ ...player.troops });
export const hasTroopsHome = (player: Player) => armySize(player.troops) > 0;

export function upgradeHero(player: Player, id: HeroId): boolean {
  const level = player.heroes[id];
  const cost = heroUpgradeCost(level);
  if (level >= MAX_HERO_LEVEL || !canAfford(player, cost)) return false;
  pay(player, cost);
  player.heroes[id] = level + 1;
  return true;
}

export const isStageUnlocked = (player: Player, stageId: number) => stageId <= player.stagesCleared + 1;

// Erster Sieg gibt die volle Belohnung, Wiederholungen ein Drittel.
export function stageReward(player: Player, stageId: number): Resources {
  const base = STAGES[stageId - 1].reward;
  const f = stageId > player.stagesCleared ? 1 : 1 / 3;
  return { food: Math.round(base.food * f), wood: Math.round(base.wood * f), steel: Math.round(base.steel * f) };
}

export function completeStage(player: Player, stageId: number): Resources {
  const reward = stageReward(player, stageId);
  for (const r of RESOURCE_IDS) player.resources[r] += reward[r];
  player.stagesCleared = Math.max(player.stagesCleared, stageId);
  return reward;
}

// Kampfkraft des Teams (Angriff zählt 10-fach, dazu Lebenspunkte und Mauer-Bonus).
export function teamPower(player: Player): number {
  const raw = HEROES.reduce((sum, h) => {
    const s = heroStats(h, player.heroes[h.id]);
    return sum + s.attack * 10 + s.hp;
  }, 0);
  return Math.round((raw / 10) * (1 + wallBonus(player)));
}

// Grob aus Kampfsimulationen abgeleitet: ab dieser Stärke ist ein Level gut schaffbar.
export function recommendedPower(stageId: number): number {
  return Math.round(123 * STAGES[stageId - 1].scale);
}

export function serialize(player: Player): string {
  return JSON.stringify(player);
}

export function deserialize(json: string, now: number): Player {
  const data = JSON.parse(json) as Partial<Player>;
  const fresh = createPlayer(now);
  return {
    ...fresh,
    ...data,
    resources: { ...fresh.resources, ...data.resources },
    buildings: { ...fresh.buildings, ...data.buildings },
    heroes: { ...fresh.heroes, ...data.heroes },
    troops: { ...fresh.troops, ...data.troops },
    queues: { ...fresh.queues, ...data.queues },
    world: { ...fresh.world, ...data.world },
    version: SAVE_VERSION,
  };
}
