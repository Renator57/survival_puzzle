// Events: täglicher Titan-Angriff (Schaden zählt) und Dungeons je Wochentag.
// Alles skaliert mit dem Kampagnen-Fortschritt, damit es immer passend fordert.
import type { StageDef, ZombieKind } from './content';
import { heroDef, type HeroId } from './heroes';
import type { Player } from './player';
import { rollGear, type GearItem } from './gear';
import { dayKey, grant, type Reward } from './quests';

export const BOSS_TRIES = 3;
export const BOSS_MOVES = 15;
export const DUNGEON_TRIES = 2;

export interface EventState {
  day: string;
  bossTries: number;
  bossBest: number; // bester Schaden heute
  bossClaimed: number; // höchste abgeholte Stufe heute (Index + 1)
  dungeonTries: Record<string, number>;
}

export const emptyEventState = (): EventState => ({ day: '', bossTries: 0, bossBest: 0, bossClaimed: 0, dungeonTries: {} });

export function rollEvents(p: Player, now: number) {
  const day = dayKey(now);
  if (p.events.day === day) return;
  p.events = { ...emptyEventState(), day };
}

const progressScale = (p: Player) => 1.17 ** Math.max(0, p.stagesCleared - 1);

// ---------- Titan ----------
export const BOSS_TIERS: { damage: number; reward: Reward }[] = [
  { damage: 300, reward: { food: 800, wood: 800 } },
  { damage: 900, reward: { steel: 300, diamonds: 5, items: { speed5m: 2 } } },
  { damage: 2200, reward: { food: 2000, wood: 2000, diamonds: 10, gear: 1 } },
  { damage: 4500, reward: { steel: 1000, diamonds: 15, items: { speed1h: 1 } } },
  { damage: 9000, reward: { food: 5000, wood: 5000, diamonds: 25 } },
  { damage: 18000, reward: { steel: 3000, diamonds: 40, gear: 1 } },
];

export const bossTierDamage = (p: Player, i: number) => Math.round(BOSS_TIERS[i].damage * progressScale(p));

export function bossStage(p: Player): StageDef {
  return {
    id: 0, name: 'Titan-Angriff', mode: 'boss', moveLimit: BOSS_MOVES, waves: [['titan']], scale: progressScale(p),
    reward: { food: 0, wood: 0, steel: 0 }, obstacles: { crates: 3, ice: 2 },
  };
}

export const bossTriesLeft = (p: Player) => BOSS_TRIES - p.events.bossTries;

// Wertet einen Titan-Kampf aus und gibt alle neu erreichten Stufen aus.
export function finishBoss(p: Player, damage: number): { reward: Reward; tiers: number } {
  p.events.bossTries += 1;
  p.events.bossBest = Math.max(p.events.bossBest, damage);
  let reached = 0;
  BOSS_TIERS.forEach((_, i) => {
    if (p.events.bossBest >= bossTierDamage(p, i)) reached = i + 1;
  });
  const reward: Reward = {};
  for (let i = p.events.bossClaimed; i < reached; i++) addReward(reward, BOSS_TIERS[i].reward);
  const tiers = reached - p.events.bossClaimed;
  p.events.bossClaimed = reached;
  grant(p, reward);
  return { reward, tiers };
}

function addReward(into: Reward, r: Reward) {
  for (const k of ['food', 'wood', 'steel', 'diamonds', 'gear'] as const) if (r[k]) into[k] = (into[k] ?? 0) + r[k]!;
  for (const [k, n] of Object.entries(r.items ?? {})) {
    into.items ??= {};
    into.items[k as keyof typeof into.items] = (into.items[k as keyof typeof into.items] ?? 0) + n!;
  }
}

// ---------- Dungeons ----------
export type DungeonId = 'steel' | 'wood' | 'shards';

export const DUNGEONS: { id: DungeonId; name: string; text: string; img: string; days: number[] }[] = [
  { id: 'steel', name: 'Stahl-Labor', text: 'Verseuchtes Labor voller Panzer-Zombies – viel Stahl.', img: 'place-7', days: [1, 4, 0] },
  { id: 'wood', name: 'Holzfäller-Lager', text: 'Überranntes Lager im Wald – viel Holz und Nahrung.', img: 'w-forest', days: [2, 5, 0] },
  { id: 'shards', name: 'Helden-Friedhof', text: 'Hier liegen gefallene Helden – Splitter für deine Helden.', img: 'ui-skull', days: [3, 6, 0] },
];

export const DIFFICULTIES = ['Leicht', 'Mittel', 'Schwer'];
const DIFF_MULT = [1, 2.2, 4];

export const dungeonOpen = (id: DungeonId, now: number) => DUNGEONS.find((d) => d.id === id)!.days.includes(new Date(now).getUTCDay());
export const dungeonTriesLeft = (p: Player, id: DungeonId) => DUNGEON_TRIES - (p.events.dungeonTries[id] ?? 0);

export function dungeonStage(p: Player, id: DungeonId, diff: number): StageDef {
  const waves: Record<DungeonId, ZombieKind[][]> = {
    steel: [['shielder', 'walker'], ['shielder', 'bomber', 'shielder'], ['brute', 'shielder', 'healer']],
    wood: [['runner', 'runner', 'walker'], ['bomber', 'runner', 'runner'], ['brute', 'runner', 'healer']],
    shards: [['walker', 'healer'], ['spitter', 'healer', 'walker'], ['boss']],
  };
  return {
    id: 0,
    name: `${DUNGEONS.find((d) => d.id === id)!.name} · ${DIFFICULTIES[diff]}`,
    mode: 'dungeon',
    waves: waves[id],
    scale: progressScale(p) * (0.7 + diff * 0.45),
    reward: { food: 0, wood: 0, steel: 0 },
    obstacles: { crates: 2 + diff * 2, ice: diff * 2 },
  };
}

export function dungeonReward(p: Player, id: DungeonId, diff: number): Reward & { shards?: number } {
  const f = progressScale(p) * DIFF_MULT[diff];
  if (id === 'steel') return { steel: Math.round(400 * f), diamonds: diff };
  if (id === 'wood') return { wood: Math.round(1500 * f), food: Math.round(1000 * f), diamonds: diff };
  return { shards: 6 + diff * 6, diamonds: 2 + diff * 2 };
}

// Splitter gehen an einen zufälligen eigenen Helden (bevorzugt seltene).
export function finishDungeon(p: Player, id: DungeonId, diff: number, won: boolean, random: () => number = Math.random) {
  p.events.dungeonTries[id] = (p.events.dungeonTries[id] ?? 0) + 1;
  if (!won) return null;
  const { shards, ...reward } = dungeonReward(p, id, diff);
  grant(p, reward);
  let shardHero: HeroId | null = null;
  if (shards) {
    const owned = Object.keys(p.heroes);
    const weighted = owned.flatMap((h) => Array(1 + ['common', 'epic', 'legendary', 'mythic'].indexOf(heroDef(h).rarity) * 2).fill(h));
    const pick: HeroId = weighted[Math.floor(random() * weighted.length)];
    p.heroes[pick]!.shards += shards;
    shardHero = pick;
  }
  // Ausrüstung: Chance steigt mit der Schwierigkeit
  let gear: GearItem | null = null;
  if (random() < [0.3, 0.5, 0.8][diff]) gear = rollGear(p, random, [[0.7, 0.27, 0.03], [0.5, 0.42, 0.08], [0.3, 0.52, 0.18]][diff]);
  return { reward, shards: shards ?? 0, shardHero, gear };
}
