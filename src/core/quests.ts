// Aufgaben: Hauptaufgaben (führen neue Spieler durchs Spiel), tägliche Aufgaben und Login-Belohnung.
import { STAGES, type Resources } from './content';
import { heroDef, type Faction } from './heroes';
import type { ItemId } from './facilities';
import type { Player } from './player';

export interface Stats {
  battlesWon: number;
  trained: number;
  gathered: number;
  hordes: number;
  plunders: number;
  upgrades: number;
  heroTrains: number;
  summons: number;
}

export const emptyStats = (): Stats => ({
  battlesWon: 0, trained: 0, gathered: 0, hordes: 0, plunders: 0, upgrades: 0, heroTrains: 0, summons: 0,
});

export type Reward = Partial<Resources> & { diamonds?: number; items?: Partial<Record<ItemId, number>> };
export type GoTo = 'base' | 'troops' | 'map' | 'world' | 'heroes';

export interface MainQuest {
  id: string;
  text: string;
  tip: string;
  goto: GoTo;
  progress: (p: Player) => [number, number]; // [aktuell, Ziel]
  reward: Reward;
}

const maxSameFaction = (p: Player) => {
  const counts = new Map<Faction, number>();
  for (const id of p.team) counts.set(heroDef(id).faction, (counts.get(heroDef(id).faction) ?? 0) + 1);
  return Math.max(...counts.values());
};

export const MAIN_QUESTS: MainQuest[] = [
  { id: 'm1', text: 'Baue das Hauptquartier auf Stufe 2', tip: 'Tippe in der Basis auf das Hauptquartier.', goto: 'base',
    progress: (p) => [p.buildings.hq.level, 2], reward: { food: 500, wood: 500 } },
  { id: 'm2', text: 'Gewinne Level 1 auf der Einsatzkarte', tip: 'Tausche Steine – jede Farbe lässt einen Helden angreifen.', goto: 'map',
    progress: (p) => [p.stagesCleared, 1], reward: { diamonds: 30 } },
  { id: 'm3', text: 'Bilde 20 Soldaten aus', tip: 'In „Truppen“ eine Einheit antippen und ausbilden.', goto: 'troops',
    progress: (p) => [p.stats.trained, 20], reward: { food: 600, wood: 600, items: { speed5m: 3 } } },
  { id: 'm4', text: 'Schicke einen Sammeltrupp los', tip: 'Auf der Weltkarte ein Feld mit Weizen, Wald oder Mine antippen.', goto: 'world',
    progress: (p) => [p.stats.gathered > 0 || p.marches.some((m) => m.kind === 'gather') ? 1 : 0, 1], reward: { wood: 800 } },
  { id: 'm5', text: 'Trainiere einen Helden auf Stufe 3', tip: 'Helden → Sammlung → Held antippen → Training.', goto: 'heroes',
    progress: (p) => [Math.max(...Object.values(p.heroes).map((h) => h!.level)), 3], reward: { food: 800, diamonds: 20 } },
  { id: 'm6', text: 'Besiege eine Zombie-Horde', tip: 'Auf der Weltkarte eine Horde antippen – achte auf die Prognose.', goto: 'world',
    progress: (p) => [p.stats.hordes, 1], reward: { food: 1000, wood: 1000 } },
  { id: 'm7', text: 'Beschwöre einen Helden', tip: 'Helden → Beschwören.', goto: 'heroes',
    progress: (p) => [p.stats.summons, 1], reward: { diamonds: 50 } },
  { id: 'm8', text: 'Baue die Werkstatt', tip: 'Sammelwagen tragen 150 Rohstoffe auf einmal.', goto: 'base',
    progress: (p) => [p.buildings.workshop.level, 1], reward: { wood: 1500, steel: 200 } },
  { id: 'm9', text: 'Besiege den ersten Boss (Level 4)', tip: 'Spare Fähigkeiten für den Boss auf.', goto: 'map',
    progress: (p) => [p.stagesCleared, 4], reward: { diamonds: 60 } },
  { id: 'm10', text: 'Stelle 3 Helden einer Fraktion ins Team', tip: 'Fraktions-Kombos geben bis zu +25 % Angriff.', goto: 'heroes',
    progress: (p) => [maxSameFaction(p), 3], reward: { diamonds: 40 } },
  { id: 'm11', text: 'Plündere eine Mitspieler-Stadt', tip: 'Schau dir ihre Armee an und schicke den passenden Konter.', goto: 'world',
    progress: (p) => [p.stats.plunders, 1], reward: { food: 2000, wood: 2000, steel: 400 } },
  { id: 'm12', text: 'Baue das Hauptquartier auf Stufe 5', tip: 'Höheres HQ = höhere Gebäude.', goto: 'base',
    progress: (p) => [p.buildings.hq.level, 5], reward: { diamonds: 80 } },
  { id: 'm13', text: 'Gewinne Level 12', tip: 'Die Innenstadt wartet.', goto: 'map',
    progress: (p) => [p.stagesCleared, 12], reward: { diamonds: 100 } },
  { id: 'm14', text: `Befreie die ganze Stadt (Level ${STAGES.length})`, tip: 'Der letzte Boss wartet im Labor.', goto: 'map',
    progress: (p) => [p.stagesCleared, STAGES.length], reward: { diamonds: 300 } },
];

export const currentMainQuest = (p: Player) => MAIN_QUESTS.find((q) => !p.quests.mainClaimed.includes(q.id));
export const isMainDone = (p: Player, q: MainQuest) => {
  const [cur, goal] = q.progress(p);
  return cur >= goal;
};

// ---------- Tägliche Aufgaben ----------
export interface DailyQuest {
  id: string;
  text: string;
  stat: keyof Stats;
  goal: number;
  reward: Reward;
}

export const DAILY_QUESTS: DailyQuest[] = [
  { id: 'd-battle', text: 'Gewinne 3 Puzzle-Kämpfe', stat: 'battlesWon', goal: 3, reward: { food: 800 } },
  { id: 'd-train', text: 'Bilde 50 Soldaten aus', stat: 'trained', goal: 50, reward: { wood: 800 } },
  { id: 'd-gather', text: 'Sammle 2.000 Rohstoffe auf der Weltkarte', stat: 'gathered', goal: 2000, reward: { steel: 200 } },
  { id: 'd-horde', text: 'Besiege 2 Zombie-Horden', stat: 'hordes', goal: 2, reward: { diamonds: 10 } },
  { id: 'd-build', text: 'Starte einen Bau oder trainiere einen Helden', stat: 'upgrades', goal: 1, reward: { food: 500, wood: 500, items: { speed5m: 2 } } },
];
export const DAILY_CHEST: Reward = { diamonds: 30, items: { speed1h: 1 } };

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

// Neuer Tag → Zähler-Stand merken, damit Tagesaufgaben bei 0 beginnen.
export function rollDay(p: Player, now: number) {
  const day = dayKey(now);
  if (p.quests.day === day) return;
  p.quests.day = day;
  p.quests.dayStart = { ...p.stats };
  p.quests.dailyClaimed = [];
}

export function dailyProgress(p: Player, q: DailyQuest): number {
  const value = q.stat === 'upgrades' ? p.stats.upgrades + p.stats.heroTrains : p.stats[q.stat];
  const start = q.stat === 'upgrades' ? p.quests.dayStart.upgrades + p.quests.dayStart.heroTrains : p.quests.dayStart[q.stat];
  return Math.min(q.goal, value - start);
}

export const dailyChestReady = (p: Player) => DAILY_QUESTS.every((q) => p.quests.dailyClaimed.includes(q.id)) && !p.quests.dailyClaimed.includes('chest');

// ---------- Login-Belohnung ----------
export const LOGIN_REWARDS: Reward[] = [
  { food: 1000 }, { wood: 1000, items: { speed5m: 3 } }, { diamonds: 20 }, { steel: 300, items: { speed1h: 1 } },
  { food: 2000, wood: 2000 }, { diamonds: 40, items: { speed1h: 2 } }, { diamonds: 100, items: { speed8h: 1 } },
];

export const loginReady = (p: Player, now: number) => p.quests.lastLogin !== dayKey(now);

export function claimLogin(p: Player, now: number): Reward | null {
  if (!loginReady(p, now)) return null;
  const reward = LOGIN_REWARDS[p.quests.loginStreak % LOGIN_REWARDS.length];
  p.quests.loginStreak += 1;
  p.quests.lastLogin = dayKey(now);
  grant(p, reward);
  return reward;
}

// ---------- Abholen ----------
export function grant(p: Player, reward: Reward) {
  for (const r of ['food', 'wood', 'steel'] as const) p.resources[r] += reward[r] ?? 0;
  p.diamonds += reward.diamonds ?? 0;
  for (const [k, n] of Object.entries(reward.items ?? {})) p.items[k as ItemId] = (p.items[k as ItemId] ?? 0) + n!;
}

export function claimMain(p: Player): Reward | null {
  const q = currentMainQuest(p);
  if (!q || !isMainDone(p, q)) return null;
  p.quests.mainClaimed.push(q.id);
  grant(p, q.reward);
  return q.reward;
}

export function claimDaily(p: Player, id: string): Reward | null {
  if (p.quests.dailyClaimed.includes(id)) return null;
  if (id === 'chest') {
    if (!dailyChestReady(p)) return null;
    p.quests.dailyClaimed.push('chest');
    grant(p, DAILY_CHEST);
    return DAILY_CHEST;
  }
  const q = DAILY_QUESTS.find((x) => x.id === id);
  if (!q || dailyProgress(p, q) < q.goal) return null;
  p.quests.dailyClaimed.push(id);
  grant(p, q.reward);
  return q.reward;
}

export function claimableCount(p: Player, now: number): number {
  const main = currentMainQuest(p);
  return (main && isMainDone(p, main) ? 1 : 0)
    + DAILY_QUESTS.filter((q) => !p.quests.dailyClaimed.includes(q.id) && dailyProgress(p, q) >= q.goal).length
    + (dailyChestReady(p) ? 1 : 0)
    + (loginReady(p, now) ? 1 : 0);
}

export interface QuestState {
  mainClaimed: string[];
  day: string;
  dayStart: Stats;
  dailyClaimed: string[];
  lastLogin: string;
  loginStreak: number;
}

export const emptyQuestState = (): QuestState => ({
  mainClaimed: [], day: '', dayStart: emptyStats(), dailyClaimed: [], lastLogin: '', loginStreak: 0,
});

