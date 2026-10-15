// Helden-Ausrüstung (Waffe, Rüstung, Helm) und Erwachen.
// Angelegte Teile liegen direkt im Helden-Zustand, damit die Werte-Berechnung ohne Spielerstand auskommt.
import type { HeroId, HeroState } from './heroes';
import type { Player } from './player';

export type Slot = 'weapon' | 'armor' | 'helmet';
export type GearRarity = 'common' | 'epic' | 'legendary';
export type GearStat = 'heroAttack' | 'heroHp' | 'skillPower';

export interface GearItem {
  uid: number;
  slot: Slot;
  rarity: GearRarity;
  level: number;
}

export const SLOTS: Slot[] = ['weapon', 'armor', 'helmet'];
export const SLOT_INFO: Record<Slot, { name: string; stat: GearStat; statName: string; names: Record<GearRarity, string> }> = {
  weapon: { name: 'Waffe', stat: 'heroAttack', statName: 'Angriff',
    names: { common: 'Rostiges Messer', epic: 'Kampfdolch', legendary: 'Plasma-Dreizack' } },
  armor: { name: 'Rüstung', stat: 'heroHp', statName: 'Leben',
    names: { common: 'Lederjacke', epic: 'Kevlarweste', legendary: 'Titan-Schild' } },
  helmet: { name: 'Helm', stat: 'skillPower', statName: 'Fähigkeitsstärke',
    names: { common: 'Bauhelm', epic: 'Gefechtshelm', legendary: 'Krone des Überlebens' } },
};

export const GEAR_RARITY: Record<GearRarity, { name: string; base: number; salvage: number; mult: number }> = {
  common: { name: 'Gewöhnlich', base: 0.06, salvage: 150, mult: 1 },
  epic: { name: 'Episch', base: 0.12, salvage: 500, mult: 2 },
  legendary: { name: 'Legendär', base: 0.2, salvage: 1500, mult: 4 },
};

export const MAX_GEAR_LEVEL = 20;
export const CRAFT_COST = 1500; // Stahl
export const AWAKEN_SHARDS = 60;
export const AWAKEN_STEEL = 5000;

export const gearValue = (item: GearItem) => GEAR_RARITY[item.rarity].base * (1 + 0.1 * (item.level - 1));
export const gearName = (item: GearItem) => SLOT_INFO[item.slot].names[item.rarity];
export const gearImg = (item: Pick<GearItem, 'slot' | 'rarity'>) => `gear-${item.slot}-${item.rarity}`;
export const upgradeCost = (item: GearItem) => Math.round(80 * GEAR_RARITY[item.rarity].mult * 1.22 ** (item.level - 1));

// Bonus aller angelegten Teile eines Helden für einen Wert
export function gearBonus(s: HeroState, stat: GearStat): number {
  return SLOTS.reduce((sum, slot) => {
    const item = s.gear?.[slot];
    return item && SLOT_INFO[slot].stat === stat ? sum + gearValue(item) : sum;
  }, 0);
}

export function rollGear(p: Player, random: () => number = Math.random, weights = [0.62, 0.3, 0.08]): GearItem {
  const r = random();
  const rarity: GearRarity = r < weights[2] ? 'legendary' : r < weights[2] + weights[1] ? 'epic' : 'common';
  const item: GearItem = { uid: p.nextId++, slot: SLOTS[Math.floor(random() * 3)], rarity, level: 1 };
  p.gear.push(item);
  return item;
}

export function craft(p: Player, slot: Slot, random: () => number = Math.random): GearItem | null {
  if (p.resources.steel < CRAFT_COST) return null;
  p.resources.steel -= CRAFT_COST;
  const item = rollGear(p, random);
  item.slot = slot;
  return item;
}

export function equip(p: Player, heroId: HeroId, uid: number): boolean {
  const s = p.heroes[heroId];
  const idx = p.gear.findIndex((g) => g.uid === uid);
  if (!s || idx === -1) return false;
  const [item] = p.gear.splice(idx, 1);
  s.gear ??= {};
  const old = s.gear[item.slot];
  if (old) p.gear.push(old);
  s.gear[item.slot] = item;
  return true;
}

export function unequip(p: Player, heroId: HeroId, slot: Slot): boolean {
  const s = p.heroes[heroId];
  const item = s?.gear?.[slot];
  if (!item) return false;
  delete s!.gear![slot];
  p.gear.push(item);
  return true;
}

// Teil finden – im Inventar oder an einem Helden
export function findGear(p: Player, uid: number): { item: GearItem; hero: HeroId | null } | null {
  const inv = p.gear.find((g) => g.uid === uid);
  if (inv) return { item: inv, hero: null };
  for (const [id, s] of Object.entries(p.heroes)) {
    for (const slot of SLOTS) if (s?.gear?.[slot]?.uid === uid) return { item: s.gear[slot]!, hero: id };
  }
  return null;
}

export function upgradeGear(p: Player, uid: number): boolean {
  const found = findGear(p, uid);
  if (!found || found.item.level >= MAX_GEAR_LEVEL) return false;
  const cost = upgradeCost(found.item);
  if (p.resources.steel < cost) return false;
  p.resources.steel -= cost;
  found.item.level += 1;
  return true;
}

// Zerlegen gibt Stahl zurück (nur nicht angelegte Teile)
export function salvage(p: Player, uid: number): number {
  const idx = p.gear.findIndex((g) => g.uid === uid);
  if (idx === -1) return 0;
  const [item] = p.gear.splice(idx, 1);
  const steel = Math.round(GEAR_RARITY[item.rarity].salvage * (1 + 0.2 * (item.level - 1)));
  p.resources.steel += steel;
  return steel;
}

// ---------- Erwachen ----------
export const canAwaken = (p: Player, id: HeroId) => {
  const s = p.heroes[id];
  return !!s && s.stars >= 5 && !s.awakened && s.shards >= AWAKEN_SHARDS && p.resources.steel >= AWAKEN_STEEL;
};

export function awaken(p: Player, id: HeroId): boolean {
  if (!canAwaken(p, id)) return false;
  const s = p.heroes[id]!;
  s.shards -= AWAKEN_SHARDS;
  p.resources.steel -= AWAKEN_STEEL;
  s.awakened = true;
  return true;
}

export const AWAKEN_BONUS = { stats: 0.25, skill: 0.3, buffs: 0.25 };
