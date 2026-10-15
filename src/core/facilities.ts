// Forschungszentrum (Technologiebaum), Lazarett (verletzte Soldaten) und Beschleuniger-Gegenstände.
import { fighters, unitDef, type Army, type UnitId } from './army';
import type { Resources } from './content';
import type { Player } from './player';

const RES = ['food', 'wood', 'steel'] as const;
const canPay = (p: Player, c: Resources) => RES.every((r) => p.resources[r] >= c[r]);
const pay = (p: Player, c: Resources) => RES.forEach((r) => (p.resources[r] -= c[r]));

// ---------- Forschung ----------
export type TechId =
  | 'food' | 'wood' | 'steel' | 'build' | 'train' | 'gather'
  | 'attack' | 'defense' | 'hp' | 'march' | 'hospital';

export interface TechDef {
  id: TechId;
  name: string;
  text: (v: number) => string;
  per: number; // Wert pro Stufe
  max: number;
  lab: number; // nötige Stufe des Forschungszentrums
  img: string;
  cost: Resources;
  seconds: number;
}

export const TECHS: TechDef[] = [
  { id: 'food', name: 'Bessere Ernte', text: (v) => `+${Math.round(v * 100)} % Nahrung`, per: 0.1, max: 5, lab: 1, img: 'res-food', cost: { food: 300, wood: 400, steel: 0 }, seconds: 20 },
  { id: 'wood', name: 'Schärfere Sägen', text: (v) => `+${Math.round(v * 100)} % Holz`, per: 0.1, max: 5, lab: 1, img: 'res-wood', cost: { food: 400, wood: 300, steel: 0 }, seconds: 20 },
  { id: 'build', name: 'Bautechnik', text: (v) => `−${Math.round(v * 100)} % Bauzeit`, per: 0.06, max: 5, lab: 1, img: 'ui-hammer', cost: { food: 500, wood: 600, steel: 0 }, seconds: 30 },
  { id: 'steel', name: 'Hochofen', text: (v) => `+${Math.round(v * 100)} % Stahl`, per: 0.1, max: 5, lab: 2, img: 'res-steel', cost: { food: 600, wood: 600, steel: 100 }, seconds: 40 },
  { id: 'train', name: 'Drill-Methoden', text: (v) => `−${Math.round(v * 100)} % Ausbildungszeit`, per: 0.08, max: 5, lab: 2, img: 'b-barracks', cost: { food: 700, wood: 500, steel: 100 }, seconds: 40 },
  { id: 'gather', name: 'Sammeltechnik', text: (v) => `+${Math.round(v * 100)} % Sammeltempo`, per: 0.08, max: 5, lab: 2, img: 'unit-wagon', cost: { food: 500, wood: 800, steel: 100 }, seconds: 40 },
  { id: 'attack', name: 'Waffenkunde', text: (v) => `+${Math.round(v * 100)} % Truppen-Angriff`, per: 0.03, max: 5, lab: 3, img: 'ui-swords', cost: { food: 900, wood: 900, steel: 300 }, seconds: 60 },
  { id: 'defense', name: 'Panzerung', text: (v) => `+${Math.round(v * 100)} % Truppen-Verteidigung`, per: 0.03, max: 5, lab: 3, img: 'ui-shield', cost: { food: 900, wood: 900, steel: 300 }, seconds: 60 },
  { id: 'hospital', name: 'Sanitätswesen', text: (v) => `+${Math.round(v * 100)} % Lazarett-Platz`, per: 0.2, max: 5, lab: 3, img: 'ui-bandage', cost: { food: 800, wood: 700, steel: 200 }, seconds: 50 },
  { id: 'hp', name: 'Feldmedizin', text: (v) => `+${Math.round(v * 100)} % Truppen-Leben`, per: 0.03, max: 5, lab: 4, img: 'ui-heart', cost: { food: 1200, wood: 1200, steel: 500 }, seconds: 80 },
  { id: 'march', name: 'Logistik', text: (v) => `+${v} Marsch-Platz`, per: 1, max: 2, lab: 5, img: 'ui-flag', cost: { food: 3000, wood: 3000, steel: 1500 }, seconds: 300 },
];

export const techDef = (id: TechId) => TECHS.find((t) => t.id === id)!;
export const techLevel = (p: Player, id: TechId) => p.research[id] ?? 0;
export const techValue = (p: Player, id: TechId) => techLevel(p, id) * techDef(id).per;

export function techCost(t: TechDef, level: number): Resources {
  const f = 1.8 ** level;
  return { food: Math.round(t.cost.food * f), wood: Math.round(t.cost.wood * f), steel: Math.round(t.cost.steel * f) };
}
export const techSeconds = (t: TechDef, level: number) => Math.round(t.seconds * 1.7 ** level);

export type ResearchBlock = 'lab' | 'busy' | 'max' | 'resources' | null;

export function researchBlock(p: Player, id: TechId): ResearchBlock {
  const t = techDef(id);
  if (p.buildings.lab.level < t.lab) return 'lab';
  if (techLevel(p, id) >= t.max) return 'max';
  if (p.researching) return 'busy';
  if (!canPay(p, techCost(t, techLevel(p, id)))) return 'resources';
  return null;
}

export function startResearch(p: Player, id: TechId, now: number): ResearchBlock {
  const block = researchBlock(p, id);
  if (block) return block;
  const t = techDef(id);
  const level = techLevel(p, id);
  pay(p, techCost(t, level));
  p.researching = { tech: id, startAt: now, endsAt: now + techSeconds(t, level) * 1000 };
  return null;
}

// ---------- Lazarett ----------
export const hospitalCapacity = (p: Player) =>
  Math.round(p.buildings.hospital.level * 120 * (1 + techValue(p, 'hospital')));
export const woundedCount = (p: Player) => fighters(p.wounded).reduce((s, k) => s + (p.wounded[k] ?? 0), 0);

// Ein Teil der Verluste landet verletzt im Lazarett statt zu sterben (so viel Platz da ist).
export function sendToHospital(p: Player, losses: Army): number {
  let free = hospitalCapacity(p) - woundedCount(p) - (p.healing ? fighters(p.healing.units).reduce((s, k) => s + p.healing!.units[k]!, 0) : 0);
  let total = 0;
  for (const k of fighters(losses)) {
    if (k === 'zombie' || free <= 0) continue;
    const n = Math.min(free, Math.floor(losses[k]! * 0.7));
    p.wounded[k] = (p.wounded[k] ?? 0) + n;
    free -= n;
    total += n;
  }
  return total;
}

export function healCost(units: Army): Resources {
  const c: Resources = { food: 0, wood: 0, steel: 0 };
  for (const k of fighters(units)) {
    if (k === 'zombie') continue;
    for (const r of RES) c[r] += Math.ceil(unitDef(k).cost[r] * 0.4 * units[k]!);
  }
  return c;
}

export const healSeconds = (units: Army) =>
  Math.max(1, Math.round(fighters(units).reduce((s, k) => s + (k === 'zombie' ? 0 : unitDef(k).seconds * 0.5 * units[k]!), 0)));

export type HealBlock = 'none' | 'busy' | 'resources' | null;

export function startHealing(p: Player, now: number): HealBlock {
  if (woundedCount(p) === 0) return 'none';
  if (p.healing) return 'busy';
  const units = { ...p.wounded };
  const cost = healCost(units);
  if (!canPay(p, cost)) return 'resources';
  pay(p, cost);
  p.wounded = {};
  p.healing = { units, startAt: now, endsAt: now + healSeconds(units) * 1000 };
  return null;
}

// ---------- Beschleuniger ----------
export type ItemId = 'speed5m' | 'speed1h' | 'speed8h';
export const ITEMS: Record<ItemId, { name: string; ms: number; img: string }> = {
  speed5m: { name: 'Beschleuniger 5 Min.', ms: 5 * 60_000, img: 'item-speed5m' },
  speed1h: { name: 'Beschleuniger 1 Std.', ms: 3600_000, img: 'item-speed1h' },
  speed8h: { name: 'Beschleuniger 8 Std.', ms: 8 * 3600_000, img: 'item-speed8h' },
};

export type TimerTarget =
  | { kind: 'building'; id: keyof Player['buildings'] }
  | { kind: 'queue'; id: 'barracks' | 'workshop' }
  | { kind: 'research' }
  | { kind: 'heal' };

export function timerEnd(p: Player, t: TimerTarget): number | null {
  if (t.kind === 'building') return p.buildings[t.id].upgradeEndsAt;
  if (t.kind === 'queue') return p.queues[t.id]?.endsAt ?? null;
  if (t.kind === 'research') return p.researching?.endsAt ?? null;
  return p.healing?.endsAt ?? null;
}

function shiftTimer(p: Player, t: TimerTarget, ms: number) {
  if (t.kind === 'building') p.buildings[t.id].upgradeEndsAt! -= ms;
  else if (t.kind === 'queue') p.queues[t.id]!.endsAt -= ms;
  else if (t.kind === 'research') p.researching!.endsAt -= ms;
  else p.healing!.endsAt -= ms;
}

export function useItem(p: Player, t: TimerTarget, item: ItemId, now: number): boolean {
  const end = timerEnd(p, t);
  if (end === null || end <= now || (p.items[item] ?? 0) <= 0) return false;
  p.items[item]! -= 1;
  shiftTimer(p, t, ITEMS[item].ms);
  return true;
}

// Sofort fertigstellen: 1 Diamant pro angefangene 3 Minuten
export const instantCost = (remainingMs: number) => Math.max(1, Math.ceil(remainingMs / 180_000));

export function finishNow(p: Player, t: TimerTarget, now: number): boolean {
  const end = timerEnd(p, t);
  if (end === null || end <= now) return false;
  const cost = instantCost(end - now);
  if (p.diamonds < cost) return false;
  p.diamonds -= cost;
  shiftTimer(p, t, end - now);
  return true;
}

// Wird in update() aufgerufen: Forschung und Heilung abschließen.
export function completeFacilities(p: Player, now: number) {
  if (p.researching && p.researching.endsAt <= now) {
    p.research[p.researching.tech] = techLevel(p, p.researching.tech) + 1;
    p.researching = null;
  }
  if (p.healing && p.healing.endsAt <= now) {
    for (const k of fighters(p.healing.units)) p.troops[k as UnitId] += p.healing.units[k]!;
    p.healing = null;
  }
}

