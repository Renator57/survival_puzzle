// Helden-System: Seltenheiten, Fraktionen, Sterne, Talentbaum, Kombos, Truppen-Boni und Beschwörung.
// Reine Logik ohne Grafik – kann so auch auf dem Server laufen (Beschwörungen müssen dort passieren!).
import type { UnitId } from './army';
import type { Player } from './player';

export type HeroId = string;
export type Rarity = 'common' | 'epic' | 'legendary' | 'mythic';
export type Faction = 'survivor' | 'military' | 'science' | 'shadow';
export type SkillKind = 'strike' | 'heal' | 'volley' | 'stun' | 'drain';
export type BuffStat = 'attack' | 'defense' | 'hp' | 'load' | 'speed' | 'gather';

export interface TroopBuff {
  stat: BuffStat;
  unit?: UnitId; // ohne Einheit = alle Truppen
  value: number; // 0.1 = +10 %
}

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  rarity: Rarity;
  faction: Faction;
  color: number; // Steinfarbe im Puzzle-Kampf
  baseAttack: number;
  baseHp: number;
  skill: { kind: SkillKind; name: string; power: number; energy: number };
  buffs: TroopBuff[];
  obtain: 'start' | 'summon' | 'shop';
  price?: string;
}

export interface HeroState {
  level: number;
  stars: number;
  shards: number;
  talents: Record<string, number>;
}

export const RARITY: Record<Rarity, { name: string; mult: number; dupShards: number; order: number }> = {
  common: { name: 'Gewöhnlich', mult: 1, dupShards: 5, order: 0 },
  epic: { name: 'Episch', mult: 1.3, dupShards: 10, order: 1 },
  legendary: { name: 'Legendär', mult: 1.7, dupShards: 20, order: 2 },
  mythic: { name: 'Mythisch', mult: 2.2, dupShards: 30, order: 3 },
};

export const FACTIONS: Record<Faction, string> = {
  survivor: 'Überlebende',
  military: 'Militär',
  science: 'Wissenschaft',
  shadow: 'Schatten',
};

const h = (
  id: string, name: string, title: string, rarity: Rarity, faction: Faction, color: number,
  skill: HeroDef['skill'], buffs: TroopBuff[], obtain: HeroDef['obtain'] = 'summon', price?: string,
): HeroDef => {
  const base = [[34, 260], [20, 250], [30, 190], [24, 240], [28, 210]][color];
  return { id, name, title, rarity, faction, color, baseAttack: base[0], baseHp: base[1], skill, buffs, obtain, price };
};

export const HEROES: HeroDef[] = [
  // Start-Helden
  h('rex', 'Rex', 'Feuerwehrmann', 'common', 'survivor', 0,
    { kind: 'strike', name: 'Feueraxt', power: 6, energy: 12 }, [{ stat: 'defense', unit: 'brawler', value: 0.08 }], 'start'),
  h('mara', 'Mara', 'Ärztin', 'common', 'survivor', 1,
    { kind: 'heal', name: 'Erste Hilfe', power: 0.3, energy: 12 }, [{ stat: 'hp', value: 0.06 }], 'start'),
  h('ivy', 'Ivy', 'Polizistin', 'common', 'military', 2,
    { kind: 'volley', name: 'Kugelhagel', power: 2.5, energy: 14 }, [{ stat: 'attack', unit: 'shooter', value: 0.08 }], 'start'),
  h('bolt', 'Bolt', 'Mechaniker', 'common', 'survivor', 3,
    { kind: 'stun', name: 'Elektrozaun', power: 1, energy: 12 }, [{ stat: 'load', value: 0.1 }], 'start'),
  h('nyx', 'Nyx', 'Ninja', 'common', 'shadow', 4,
    { kind: 'drain', name: 'Lebensraub', power: 4, energy: 12 }, [{ stat: 'attack', unit: 'rider', value: 0.08 }], 'start'),
  // Gewöhnlich
  h('brutus', 'Brutus', 'Bauarbeiter', 'common', 'survivor', 0,
    { kind: 'strike', name: 'Abrissbirne', power: 6.5, energy: 13 }, [{ stat: 'attack', unit: 'brawler', value: 0.08 }]),
  h('hawk', 'Hawk', 'Detektiv', 'common', 'military', 2,
    { kind: 'volley', name: 'Spurensuche', power: 2.4, energy: 13 }, [{ stat: 'speed', value: 0.08 }]),
  // Episch
  h('kane', 'Kane', 'Gardist', 'epic', 'military', 0,
    { kind: 'strike', name: 'Bajonettsturm', power: 7, energy: 12 }, [{ stat: 'attack', unit: 'brawler', value: 0.14 }]),
  h('hale', 'Dr. Hale', 'Forscher', 'epic', 'science', 1,
    { kind: 'heal', name: 'Serum X', power: 0.35, energy: 12 }, [{ stat: 'defense', value: 0.08 }]),
  h('jo', 'Jo', 'Farmerin', 'epic', 'survivor', 2,
    { kind: 'volley', name: 'Schrotladung', power: 2.8, energy: 13 }, [{ stat: 'gather', value: 0.2 }]),
  h('ace', 'Ace', 'Pilot', 'epic', 'military', 3,
    { kind: 'stun', name: 'Tiefflug', power: 1.5, energy: 12 }, [{ stat: 'attack', unit: 'rider', value: 0.14 }]),
  h('sparky', 'Sparky', 'Ingenieurin', 'epic', 'science', 3,
    { kind: 'stun', name: 'Tesla-Spule', power: 1.4, energy: 11 }, [{ stat: 'load', value: 0.18 }]),
  h('raven', 'Raven', 'Vampirin', 'epic', 'shadow', 4,
    { kind: 'drain', name: 'Blutdurst', power: 4.5, energy: 12 }, [{ stat: 'defense', unit: 'rider', value: 0.14 }]),
  // Legendär
  h('valkyra', 'Valkyra', 'Heldin der Ruinen', 'legendary', 'military', 0,
    { kind: 'strike', name: 'Walkürenschlag', power: 8, energy: 11 }, [{ stat: 'attack', value: 0.1 }]),
  h('athena', 'Athena', 'Erzmagierin', 'legendary', 'science', 1,
    { kind: 'heal', name: 'Lebensquelle', power: 0.45, energy: 11 }, [{ stat: 'hp', value: 0.12 }]),
  h('ghost', 'Ghost', 'Scharfschützin', 'legendary', 'shadow', 2,
    { kind: 'volley', name: 'Todeszone', power: 3.4, energy: 12 }, [{ stat: 'attack', unit: 'shooter', value: 0.22 }]),
  h('luna', 'Luna', 'Astronautin', 'legendary', 'science', 3,
    { kind: 'stun', name: 'Orbitalschlag', power: 2.2, energy: 11 }, [{ stat: 'speed', value: 0.2 }]),
  h('zero', 'Zero', 'Schurke', 'legendary', 'shadow', 4,
    { kind: 'drain', name: 'Leere', power: 5.5, energy: 11 }, [{ stat: 'attack', unit: 'rider', value: 0.22 }]),
  // Mythisch – nur im Shop
  h('phoenix', 'Phoenix', 'Der Unsterbliche', 'mythic', 'military', 0,
    { kind: 'strike', name: 'Flammenwiedergeburt', power: 10, energy: 10 },
    [{ stat: 'attack', value: 0.15 }, { stat: 'hp', value: 0.08 }], 'shop', '9,99 €'),
  h('oracle', 'Oracle', 'Die Allwissende', 'mythic', 'science', 1,
    { kind: 'heal', name: 'Zeitumkehr', power: 0.6, energy: 10 },
    [{ stat: 'hp', value: 0.15 }, { stat: 'gather', value: 0.25 }], 'shop', '9,99 €'),
  h('nocturne', 'Nocturne', 'Fürst der Nacht', 'mythic', 'shadow', 4,
    { kind: 'drain', name: 'Ewige Nacht', power: 7, energy: 10 },
    [{ stat: 'defense', value: 0.15 }, { stat: 'attack', unit: 'rider', value: 0.15 }], 'shop', '14,99 €'),
];

export const STARTER_TEAM: HeroId[] = ['rex', 'mara', 'ivy', 'bolt', 'nyx'];
export const MAX_HERO_LEVEL = 30;
export const MAX_STARS = 5;
export const SUMMON_COST = 150;
export const SUMMON_10_COST = 1350;
export const PITY = 40; // spätestens nach so vielen Beschwörungen kommt ein Legendärer
export const TALENT_RESET_COST = 100;

const byId = new Map(HEROES.map((x) => [x.id, x]));
export const heroDef = (id: HeroId) => byId.get(id)!;
export const newHeroState = (): HeroState => ({ level: 1, stars: 1, shards: 0, talents: {} });

// ---------- Talentbaum ----------
export type TalentStat = 'heroAttack' | 'heroHp' | 'skillPower' | 'energy' | 'troopBuff' | 'troopAttack' | 'troopDefense' | 'load';
export type Branch = 'attack' | 'defense' | 'command';

export interface TalentNode {
  id: string;
  branch: Branch;
  tier: number; // 0–3, Reihe im Baum
  name: string;
  stat: TalentStat;
  perRank: number;
  max: number;
  requires: number; // benötigte Punkte im selben Ast
}

export const BRANCHES: Record<Branch, string> = { attack: 'Angriff', defense: 'Verteidigung', command: 'Kommando' };

export const TALENTS: TalentNode[] = [
  { id: 'a1', branch: 'attack', tier: 0, name: 'Scharfe Klinge', stat: 'heroAttack', perRank: 0.03, max: 5, requires: 0 },
  { id: 'a2', branch: 'attack', tier: 1, name: 'Präzision', stat: 'skillPower', perRank: 0.05, max: 5, requires: 5 },
  { id: 'a3', branch: 'attack', tier: 2, name: 'Raserei', stat: 'heroAttack', perRank: 0.05, max: 3, requires: 10 },
  { id: 'a4', branch: 'attack', tier: 3, name: 'Vernichter', stat: 'skillPower', perRank: 0.2, max: 1, requires: 13 },
  { id: 'd1', branch: 'defense', tier: 0, name: 'Zähigkeit', stat: 'heroHp', perRank: 0.04, max: 5, requires: 0 },
  { id: 'd2', branch: 'defense', tier: 1, name: 'Schnelle Erholung', stat: 'energy', perRank: 1, max: 2, requires: 5 },
  { id: 'd3', branch: 'defense', tier: 2, name: 'Eiserner Wille', stat: 'heroHp', perRank: 0.06, max: 3, requires: 7 },
  { id: 'd4', branch: 'defense', tier: 3, name: 'Unbeugsam', stat: 'heroHp', perRank: 0.15, max: 1, requires: 10 },
  { id: 'c1', branch: 'command', tier: 0, name: 'Anführer', stat: 'troopBuff', perRank: 0.1, max: 5, requires: 0 },
  { id: 'c2', branch: 'command', tier: 1, name: 'Drill', stat: 'troopAttack', perRank: 0.01, max: 5, requires: 5 },
  { id: 'c3', branch: 'command', tier: 2, name: 'Logistik', stat: 'load', perRank: 0.03, max: 3, requires: 10 },
  { id: 'c4', branch: 'command', tier: 3, name: 'Feldmarschall', stat: 'troopDefense', perRank: 0.05, max: 1, requires: 13 },
];

export const TALENT_TEXT: Record<TalentStat, (v: number) => string> = {
  heroAttack: (v) => `+${Math.round(v * 100)} % Angriff des Helden`,
  heroHp: (v) => `+${Math.round(v * 100)} % Leben des Helden`,
  skillPower: (v) => `+${Math.round(v * 100)} % Fähigkeitsstärke`,
  energy: (v) => `Fähigkeit braucht ${v} Energie weniger`,
  troopBuff: (v) => `Truppen-Boni des Helden +${Math.round(v * 100)} %`,
  troopAttack: (v) => `+${Math.round(v * 100)} % Angriff aller Truppen`,
  troopDefense: (v) => `+${Math.round(v * 100)} % Verteidigung aller Truppen`,
  load: (v) => `+${Math.round(v * 100)} % Tragkraft`,
};

export const talentPoints = (s: HeroState) => s.level - 1;
export const spentPoints = (s: HeroState, branch?: Branch) =>
  TALENTS.filter((t) => !branch || t.branch === branch).reduce((sum, t) => sum + (s.talents[t.id] ?? 0), 0);
export const talentValue = (s: HeroState, stat: TalentStat) =>
  TALENTS.filter((t) => t.stat === stat).reduce((sum, t) => sum + (s.talents[t.id] ?? 0) * t.perRank, 0);

export type TalentBlock = 'points' | 'max' | 'requires' | null;
export function talentBlock(s: HeroState, nodeId: string): TalentBlock {
  const node = TALENTS.find((t) => t.id === nodeId)!;
  if ((s.talents[nodeId] ?? 0) >= node.max) return 'max';
  if (spentPoints(s, node.branch) < node.requires) return 'requires';
  if (spentPoints(s) >= talentPoints(s)) return 'points';
  return null;
}

export function learnTalent(player: Player, id: HeroId, nodeId: string): TalentBlock {
  const s = player.heroes[id];
  if (!s) return 'points';
  const block = talentBlock(s, nodeId);
  if (block) return block;
  s.talents[nodeId] = (s.talents[nodeId] ?? 0) + 1;
  return null;
}

export function resetTalents(player: Player, id: HeroId): boolean {
  const s = player.heroes[id];
  if (!s || spentPoints(s) === 0 || player.diamonds < TALENT_RESET_COST) return false;
  player.diamonds -= TALENT_RESET_COST;
  s.talents = {};
  return true;
}

// ---------- Werte ----------
export const starMult = (stars: number) => 1 + 0.15 * (stars - 1);

export function heroStats(def: HeroDef, s: HeroState) {
  const f = RARITY[def.rarity].mult * starMult(s.stars) * 1.12 ** (s.level - 1);
  return {
    attack: Math.round(def.baseAttack * f * (1 + talentValue(s, 'heroAttack'))),
    hp: Math.round(def.baseHp * f * (1 + talentValue(s, 'heroHp'))),
    skillPower: def.skill.power * (1 + talentValue(s, 'skillPower')),
    energy: Math.max(6, def.skill.energy - talentValue(s, 'energy')),
  };
}

export const heroUpgradeCost = (level: number) => ({
  food: Math.round(80 * 1.32 ** level),
  wood: Math.round(40 * 1.32 ** level),
  steel: level >= 10 ? Math.round(10 * 1.32 ** level) : 0,
});

export const STAR_COST = [0, 10, 20, 40, 60]; // Splitter für den Aufstieg auf Stern 2, 3, 4, 5
export const starCost = (stars: number) => STAR_COST[stars] ?? Infinity;

export function starUp(player: Player, id: HeroId): boolean {
  const s = player.heroes[id];
  if (!s || s.stars >= MAX_STARS || s.shards < starCost(s.stars)) return false;
  s.shards -= starCost(s.stars);
  s.stars += 1;
  return true;
}

// Truppen-Boni eines Helden (mit Sternen und Kommando-Talenten)
export function heroBuffs(def: HeroDef, s: HeroState): TroopBuff[] {
  const f = (1 + 0.2 * (s.stars - 1)) * (1 + talentValue(s, 'troopBuff'));
  return def.buffs.map((b) => ({ ...b, value: b.value * f }));
}

// ---------- Kombos ----------
export interface ComboBonus {
  heroAttack?: number;
  heroHp?: number;
  skillPower?: number;
  energy?: number;
  troopAttack?: number;
  load?: number;
}

export const FACTION_BONUS: Record<number, ComboBonus> = {
  2: { heroAttack: 0.05 },
  3: { heroAttack: 0.1, heroHp: 0.05 },
  4: { heroAttack: 0.15, heroHp: 0.1 },
  5: { heroAttack: 0.25, heroHp: 0.15, troopAttack: 0.05 },
};

export const DUOS: { id: string; name: string; heroes: [HeroId, HeroId]; bonus: ComboBonus }[] = [
  { id: 'rescue', name: 'Rettungsteam', heroes: ['rex', 'mara'], bonus: { heroHp: 0.12 } },
  { id: 'night', name: 'Nachtschicht', heroes: ['nyx', 'raven'], bonus: { skillPower: 0.2 } },
  { id: 'elite', name: 'Elitetrupp', heroes: ['kane', 'valkyra'], bonus: { heroAttack: 0.12 } },
  { id: 'lab', name: 'Laborgenies', heroes: ['hale', 'athena'], bonus: { energy: 2 } },
  { id: 'harvest', name: 'Erntehelfer', heroes: ['jo', 'bolt'], bonus: { load: 0.15 } },
  { id: 'ashes', name: 'Helden der Asche', heroes: ['phoenix', 'valkyra'], bonus: { heroAttack: 0.15, troopAttack: 0.05 } },
  { id: 'void', name: 'Leere und Nacht', heroes: ['zero', 'nocturne'], bonus: { skillPower: 0.25, heroHp: 0.1 } },
];

export const BONUS_TEXT: Record<keyof ComboBonus, (v: number) => string> = {
  heroAttack: (v) => `+${Math.round(v * 100)} % Helden-Angriff`,
  heroHp: (v) => `+${Math.round(v * 100)} % Helden-Leben`,
  skillPower: (v) => `+${Math.round(v * 100)} % Fähigkeitsstärke`,
  energy: (v) => `−${v} Energie für Fähigkeiten`,
  troopAttack: (v) => `+${Math.round(v * 100)} % Truppen-Angriff`,
  load: (v) => `+${Math.round(v * 100)} % Tragkraft`,
};

export const bonusText = (b: ComboBonus) =>
  (Object.keys(b) as (keyof ComboBonus)[]).map((k) => BONUS_TEXT[k](b[k]!)).join(', ');

export interface ActiveCombo {
  name: string;
  kind: 'faction' | 'duo';
  bonus: ComboBonus;
}

export function activeCombos(team: HeroId[]): ActiveCombo[] {
  const out: ActiveCombo[] = [];
  const counts = new Map<Faction, number>();
  for (const id of team) counts.set(heroDef(id).faction, (counts.get(heroDef(id).faction) ?? 0) + 1);
  for (const [faction, n] of counts) {
    if (n >= 2) out.push({ name: `${FACTIONS[faction]} ×${n}`, kind: 'faction', bonus: FACTION_BONUS[n] });
  }
  for (const duo of DUOS) {
    if (duo.heroes.every((x) => team.includes(x))) out.push({ name: duo.name, kind: 'duo', bonus: duo.bonus });
  }
  return out;
}

export function teamBonus(team: HeroId[]): Required<ComboBonus> {
  const sum: Required<ComboBonus> = { heroAttack: 0, heroHp: 0, skillPower: 0, energy: 0, troopAttack: 0, load: 0 };
  for (const c of activeCombos(team)) for (const k of Object.keys(c.bonus) as (keyof ComboBonus)[]) sum[k] += c.bonus[k]!;
  return sum;
}

// ---------- Team ----------
export const ownedHeroes = (player: Player) => HEROES.filter((d) => player.heroes[d.id]);

export function setTeamSlot(player: Player, id: HeroId): boolean {
  const def = heroDef(id);
  if (!def || !player.heroes[id]) return false;
  player.team[def.color] = id;
  return true;
}

export interface BattleHeroSetup {
  id: HeroId;
  color: number;
  attack: number;
  hp: number;
  maxEnergy: number;
  skill: { kind: SkillKind; power: number };
}

// Die fünf Helden für den Puzzle-Kampf inkl. Kombo-Boni (Reihenfolge = Steinfarbe 0–4).
export function battleTeam(player: Player): BattleHeroSetup[] {
  const bonus = teamBonus(player.team);
  return player.team.map((id) => {
    const def = heroDef(id);
    const stats = heroStats(def, player.heroes[id]!);
    return {
      id,
      color: def.color,
      attack: Math.round(stats.attack * (1 + bonus.heroAttack)),
      hp: Math.round(stats.hp * (1 + bonus.heroHp)),
      maxEnergy: Math.max(6, stats.energy - bonus.energy),
      skill: { kind: def.skill.kind, power: stats.skillPower * (1 + bonus.skillPower) },
    };
  });
}

// ---------- Truppen-Boni für die Weltkarte ----------
export interface Buffs {
  attack: Partial<Record<UnitId | 'all', number>>;
  defense: Partial<Record<UnitId | 'all', number>>;
  hp: Partial<Record<UnitId | 'all', number>>;
  load: number;
  speed: number;
  gather: number;
}

export const emptyBuffs = (): Buffs => ({ attack: {}, defense: {}, hp: {}, load: 0, speed: 0, gather: 0 });

export function troopBuffs(player: Player): Buffs {
  const buffs = emptyBuffs();
  const add = (rec: Partial<Record<string, number>>, key: string, v: number) => (rec[key] = (rec[key] ?? 0) + v);
  for (const id of player.team) {
    const s = player.heroes[id];
    if (!s) continue;
    for (const b of heroBuffs(heroDef(id), s)) {
      if (b.stat === 'load' || b.stat === 'speed' || b.stat === 'gather') buffs[b.stat] += b.value;
      else add(buffs[b.stat], b.unit ?? 'all', b.value);
    }
    add(buffs.attack, 'all', talentValue(s, 'troopAttack'));
    add(buffs.defense, 'all', talentValue(s, 'troopDefense'));
    buffs.load += talentValue(s, 'load');
  }
  const bonus = teamBonus(player.team);
  add(buffs.attack, 'all', bonus.troopAttack);
  buffs.load += bonus.load;
  return buffs;
}

// ---------- Beschwörung ----------
export interface SummonResult {
  id: HeroId;
  isNew: boolean;
  shards: number;
}

const POOL = HEROES.filter((d) => d.obtain === 'summon' || d.obtain === 'start');

export function rollRarity(r: number, pityHit: boolean): Rarity {
  if (pityHit || r < 0.05) return 'legendary';
  if (r < 0.3) return 'epic';
  return 'common';
}

export function summon(player: Player, count: 1 | 10, random: () => number = Math.random): SummonResult[] | null {
  const cost = count === 10 ? SUMMON_10_COST : SUMMON_COST;
  if (player.diamonds < cost) return null;
  player.diamonds -= cost;
  const results: SummonResult[] = [];
  for (let i = 0; i < count; i++) {
    player.pity += 1;
    const rarity = rollRarity(random(), player.pity >= PITY);
    if (rarity === 'legendary') player.pity = 0;
    const pool = POOL.filter((d) => d.rarity === rarity);
    const def = pool[Math.floor(random() * pool.length)];
    const state = player.heroes[def.id];
    if (state) {
      const shards = RARITY[rarity].dupShards;
      state.shards += shards;
      results.push({ id: def.id, isNew: false, shards });
    } else {
      player.heroes[def.id] = newHeroState();
      results.push({ id: def.id, isNew: true, shards: 0 });
    }
  }
  return results;
}

// Kauf eines Shop-Helden – im Mehrspieler-Modus prüft der Server die Zahlung (Google Play / App Store).
export function grantShopHero(player: Player, id: HeroId): boolean {
  const def = heroDef(id);
  if (!def || def.obtain !== 'shop' || player.heroes[id]) return false;
  player.heroes[id] = newHeroState();
  return true;
}

export function upgradeHeroLevel(player: Player, id: HeroId, pay: (cost: ReturnType<typeof heroUpgradeCost>) => boolean): boolean {
  const s = player.heroes[id];
  if (!s || s.level >= MAX_HERO_LEVEL) return false;
  if (!pay(heroUpgradeCost(s.level))) return false;
  s.level += 1;
  return true;
}
