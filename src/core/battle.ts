// Kampflogik: Treffer auf dem Spielfeld lassen den Helden der passenden Farbe angreifen.
// Nach jedem Zug zählen die Zombies herunter und greifen bei 0 an.
import { createBoard, playSwap, type Board, type CascadeStep, type Pos } from './board';
import { STAGES, ZOMBIES, type ZombieKind } from './content';
import type { BattleHeroSetup, HeroId, SkillKind } from './heroes';
import { createRng, type Rng } from './rng';

export interface BattleHero {
  id: HeroId;
  color: number;
  attack: number;
  energy: number;
  maxEnergy: number;
  skill: { kind: SkillKind; power: number };
}

export interface Enemy {
  uid: number;
  kind: ZombieKind;
  hp: number;
  maxHp: number;
  attack: number;
  countdown: number;
  maxCountdown: number;
}

export interface Battle {
  stageId: number;
  rng: Rng;
  board: Board;
  heroes: BattleHero[];
  teamHp: number;
  teamMaxHp: number;
  waveIndex: number;
  enemies: Enemy[];
  turn: number;
  result: 'ongoing' | 'won' | 'lost';
  nextUid: number;
}

export type BattleEvent =
  | { type: 'cascade'; step: CascadeStep; combo: number }
  | { type: 'attack'; heroId: HeroId; enemyUid: number; damage: number; killed: boolean }
  | { type: 'skill'; heroId: HeroId }
  | { type: 'heal'; amount: number }
  | { type: 'stun'; turns: number }
  | { type: 'enemyAttack'; enemyUid: number; damage: number }
  | { type: 'wave'; index: number; enemies: Enemy[] }
  | { type: 'result'; result: 'won' | 'lost' };

export interface BattleSetup {
  stageId: number;
  team: BattleHeroSetup[]; // fünf Helden, einer pro Steinfarbe (inkl. Kombo-Boni)
  hpBonus: number; // z. B. 0.16 für +16 % durch die Schutzmauer
  seed: number;
}

export function createBattle(setup: BattleSetup): Battle {
  const rng = createRng(setup.seed);
  const heroes = setup.team.map((t) => ({
    id: t.id,
    color: t.color,
    attack: t.attack,
    energy: 0,
    maxEnergy: t.maxEnergy,
    skill: { ...t.skill },
  }));
  const teamMaxHp = Math.round(setup.team.reduce((sum, t) => sum + t.hp, 0) * (1 + setup.hpBonus));
  const battle: Battle = {
    stageId: setup.stageId,
    rng,
    board: createBoard(rng),
    heroes,
    teamHp: teamMaxHp,
    teamMaxHp,
    waveIndex: 0,
    enemies: [],
    turn: 0,
    result: 'ongoing',
    nextUid: 1,
  };
  spawnWave(battle);
  return battle;
}

function spawnWave(battle: Battle) {
  const stage = STAGES[battle.stageId - 1];
  battle.enemies = stage.waves[battle.waveIndex].map((kind) => {
    const z = ZOMBIES[kind];
    const hp = Math.round(z.hp * stage.scale);
    return {
      uid: battle.nextUid++,
      kind,
      hp,
      maxHp: hp,
      attack: Math.round(z.attack * stage.scale),
      countdown: z.countdown,
      maxCountdown: z.countdown,
    };
  });
}

const alive = (b: Battle) => b.enemies.filter((e) => e.hp > 0);

function damageEnemy(heroId: HeroId, enemy: Enemy, amount: number, events: BattleEvent[]) {
  const damage = Math.max(1, Math.round(amount));
  enemy.hp = Math.max(0, enemy.hp - damage);
  events.push({ type: 'attack', heroId, enemyUid: enemy.uid, damage, killed: enemy.hp === 0 });
}

// Schaden geht an den vordersten Zombie; Überschuss trifft den nächsten.
function damageFront(battle: Battle, heroId: HeroId, amount: number, events: BattleEvent[]) {
  let rest = amount;
  for (const enemy of alive(battle)) {
    if (rest <= 0) break;
    const dealt = Math.min(rest, enemy.hp);
    damageEnemy(heroId, enemy, dealt, events);
    rest -= dealt;
  }
}

function heal(battle: Battle, fraction: number, events: BattleEvent[]) {
  const amount = Math.round(battle.teamMaxHp * fraction);
  battle.teamHp = Math.min(battle.teamMaxHp, battle.teamHp + amount);
  events.push({ type: 'heal', amount });
}

// Prüft Wellenende und Sieg/Niederlage.
function checkProgress(battle: Battle, events: BattleEvent[]) {
  if (battle.teamHp <= 0) {
    battle.result = 'lost';
    events.push({ type: 'result', result: 'lost' });
    return;
  }
  if (alive(battle).length > 0) return;
  const stage = STAGES[battle.stageId - 1];
  if (battle.waveIndex + 1 >= stage.waves.length) {
    battle.result = 'won';
    events.push({ type: 'result', result: 'won' });
    return;
  }
  battle.waveIndex += 1;
  spawnWave(battle);
  events.push({ type: 'wave', index: battle.waveIndex, enemies: battle.enemies.map((e) => ({ ...e })) });
}

export function swap(battle: Battle, a: Pos, b: Pos): BattleEvent[] | null {
  if (battle.result !== 'ongoing') return null;
  const steps = playSwap(battle.board, battle.rng, a, b);
  if (!steps) return null;

  const events: BattleEvent[] = [];
  battle.turn += 1;
  steps.forEach((step, combo) => {
    events.push({ type: 'cascade', step, combo });
    const perColor = new Map<number, number>();
    for (const t of step.cleared) perColor.set(t.color, (perColor.get(t.color) ?? 0) + 1);
    for (const hero of battle.heroes) {
      const count = perColor.get(hero.color) ?? 0;
      if (!count || battle.result !== 'ongoing') continue;
      hero.energy = Math.min(hero.maxEnergy, hero.energy + count);
      // Dreierreihe = 1× Angriff, jede Kettenreaktion +25 %
      damageFront(battle, hero.id, (hero.attack * count * (1 + combo * 0.25)) / 3, events);
      checkProgress(battle, events);
    }
  });

  if (battle.result === 'ongoing') enemyTurn(battle, events);
  return events;
}

function enemyTurn(battle: Battle, events: BattleEvent[]) {
  for (const enemy of alive(battle)) {
    enemy.countdown -= 1;
    if (enemy.countdown > 0) continue;
    enemy.countdown = enemy.maxCountdown;
    battle.teamHp = Math.max(0, battle.teamHp - enemy.attack);
    events.push({ type: 'enemyAttack', enemyUid: enemy.uid, damage: enemy.attack });
    if (battle.teamHp <= 0) break;
  }
  checkProgress(battle, events);
}

export function canUseSkill(battle: Battle, heroId: HeroId): boolean {
  const hero = battle.heroes.find((h) => h.id === heroId);
  return !!hero && battle.result === 'ongoing' && hero.energy >= hero.maxEnergy;
}

// Fähigkeiten kosten keinen Zug.
export function useSkill(battle: Battle, heroId: HeroId): BattleEvent[] | null {
  if (!canUseSkill(battle, heroId)) return null;
  const hero = battle.heroes.find((h) => h.id === heroId)!;
  const power = hero.skill.power;
  hero.energy = 0;
  const events: BattleEvent[] = [{ type: 'skill', heroId }];
  switch (hero.skill.kind) {
    case 'strike':
      damageFront(battle, heroId, hero.attack * power, events);
      break;
    case 'heal':
      heal(battle, power, events);
      break;
    case 'volley':
      for (const e of alive(battle)) damageEnemy(heroId, e, Math.min(e.hp, hero.attack * power), events);
      break;
    case 'stun':
      for (const e of alive(battle)) {
        e.countdown += 2;
        damageEnemy(heroId, e, Math.min(e.hp, hero.attack * power), events);
      }
      events.push({ type: 'stun', turns: 2 });
      break;
    case 'drain':
      damageFront(battle, heroId, hero.attack * power, events);
      heal(battle, 0.1, events);
      break;
  }
  checkProgress(battle, events);
  return events;
}
