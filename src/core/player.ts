// Spielerstand und Basis: Rohstoffe, Gebäude mit Bauzeiten, Helden-Level, Fortschritt.
// Alle Funktionen bekommen die Uhrzeit (`now`) übergeben – so kann später der Server rechnen.
import {
  BUILDINGS,
  HEROES,
  MAX_HERO_LEVEL,
  MAX_HQ_LEVEL,
  STAGES,
  heroUpgradeCost,
  type BuildingDef,
  type BuildingId,
  type HeroId,
  type ResourceId,
  type Resources,
} from './content';

export const SAVE_VERSION = 1;
export const RESOURCE_IDS: ResourceId[] = ['food', 'wood', 'steel'];

export interface BuildingState {
  level: number;
  upgradeEndsAt: number | null;
}

export interface Player {
  version: number;
  resources: Resources;
  buildings: Record<BuildingId, BuildingState>;
  heroes: Record<HeroId, number>;
  stagesCleared: number;
  lastUpdate: number;
}

const START_LEVELS: Record<BuildingId, number> = { hq: 1, farm: 1, sawmill: 1, steelworks: 0, warehouse: 1, wall: 0 };

export function createPlayer(now: number): Player {
  return {
    version: SAVE_VERSION,
    resources: { food: 1000, wood: 1000, steel: 0 },
    buildings: Object.fromEntries(
      BUILDINGS.map((b) => [b.id, { level: START_LEVELS[b.id], upgradeEndsAt: null }]),
    ) as Record<BuildingId, BuildingState>,
    heroes: Object.fromEntries(HEROES.map((h) => [h.id, 1])) as Record<HeroId, number>,
    stagesCleared: 0,
    lastUpdate: now,
  };
}

const def = (id: BuildingId) => BUILDINGS.find((b) => b.id === id)!;

export function capacity(player: Player): number {
  return Math.round(2000 * 1.6 ** (player.buildings.warehouse.level - 1));
}

export function productionRate(player: Player, resource: ResourceId): number {
  return BUILDINGS.filter((b) => b.produces === resource).reduce((sum, b) => {
    const level = player.buildings[b.id].level;
    return sum + (level > 0 ? b.rate! * level * 1.18 ** (level - 1) : 0);
  }, 0);
}

export function wallBonus(player: Player): number {
  return player.buildings.wall.level * 0.08;
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

export function teamPower(player: Player): number {
  return HEROES.reduce((sum, h) => sum + player.heroes[h.id] * 100, 0) + player.buildings.wall.level * 50;
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
    version: SAVE_VERSION,
  };
}
