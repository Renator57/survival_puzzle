// Kampflogik: Treffer auf dem Spielfeld lassen den Helden der passenden Farbe angreifen.
// Nach jedem Zug zählen die Zombies herunter und handeln bei 0 (angreifen, heilen, Kisten werfen).
import { addCrates, createBoard, playSwap, type Board, type CascadeStep, type Pos, type Tile } from './board';
import { ZOMBIES, type StageDef, type ZombieKind } from './content';
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
  shield: number;
  maxShield: number;
  attack: number;
  countdown: number;
  maxCountdown: number;
}

export interface Battle {
  stage: StageDef;
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
  stars: number; // 1–3 nach dem Sieg
  damageDealt: number; // für das Boss-Event
  awakened: HeroId[]; // nur für die Anzeige
  nextUid: number;
}

export type BattleEvent =
  | { type: 'cascade'; step: CascadeStep; combo: number }
  | { type: 'attack'; heroId: HeroId; enemyUid: number; damage: number; absorbed: number; shieldBroken: boolean; killed: boolean }
  | { type: 'skill'; heroId: HeroId }
  | { type: 'heal'; amount: number }
  | { type: 'stun'; turns: number }
  | { type: 'enemyAttack'; enemyUid: number; damage: number }
  | { type: 'zombieHeal'; enemyUid: number; targets: { uid: number; amount: number }[] }
  | { type: 'crates'; enemyUid: number; grid: Tile[][] }
  | { type: 'wave'; index: number; enemies: Enemy[] }
  | { type: 'result'; result: 'won' | 'lost' };

export interface BattleSetup {
  stage: StageDef;
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
    stage: setup.stage,
    stageId: setup.stage.id,
    rng,
    board: createBoard(rng, setup.stage.obstacles),
    heroes,
    teamHp: teamMaxHp,
    teamMaxHp,
    waveIndex: 0,
    enemies: [],
    turn: 0,
    result: 'ongoing',
    stars: 0,
    damageDealt: 0,
    awakened: setup.team.filter((t) => t.awakened).map((t) => t.id),
    nextUid: 1,
  };
  spawnWave(battle);
  return battle;
}

function spawnWave(battle: Battle) {
  const stage = battle.stage;
  battle.enemies = stage.waves[battle.waveIndex].map((kind) => {
    const z = ZOMBIES[kind];
    const hp = Math.round(z.hp * stage.scale);
    const shield = Math.round((z.shield ?? 0) * stage.scale);
    return {
      uid: battle.nextUid++,
      kind,
      hp,
      maxHp: hp,
      shield,
      maxShield: shield,
      attack: Math.round(z.attack * stage.scale),
      countdown: z.countdown,
      maxCountdown: z.countdown,
    };
  });
}

const alive = (b: Battle) => b.enemies.filter((e) => e.hp > 0);

// Schild schluckt normalen Schaden; Fähigkeiten zerstören es sofort.
function damageEnemy(battle: Battle, heroId: HeroId, enemy: Enemy, amount: number, events: BattleEvent[], fromSkill = false) {
  let rest = Math.max(1, Math.round(amount));
  let absorbed = 0;
  let shieldBroken = false;
  if (enemy.shield > 0) {
    if (fromSkill) {
      enemy.shield = 0;
      shieldBroken = true;
    } else {
      absorbed = Math.min(enemy.shield, rest);
      enemy.shield -= absorbed;
      rest -= absorbed;
      shieldBroken = enemy.shield === 0;
    }
  }
  const damage = Math.min(enemy.hp, rest);
  enemy.hp -= damage;
  battle.damageDealt += damage;
  events.push({ type: 'attack', heroId, enemyUid: enemy.uid, damage, absorbed, shieldBroken, killed: enemy.hp === 0 });
}

// Schaden geht an den vordersten Zombie; Überschuss trifft den nächsten.
function damageFront(battle: Battle, heroId: HeroId, amount: number, events: BattleEvent[], fromSkill = false) {
  let rest = amount;
  for (const enemy of alive(battle)) {
    if (rest <= 0) break;
    const capacity = enemy.hp + (fromSkill ? 0 : enemy.shield);
    const dealt = Math.min(rest, capacity);
    damageEnemy(battle, heroId, enemy, dealt, events, fromSkill);
    rest -= dealt;
  }
}

function heal(battle: Battle, fraction: number, events: BattleEvent[]) {
  const amount = Math.round(battle.teamMaxHp * fraction);
  battle.teamHp = Math.min(battle.teamMaxHp, battle.teamHp + amount);
  events.push({ type: 'heal', amount });
}

function finish(battle: Battle, result: 'won' | 'lost', events: BattleEvent[]) {
  battle.result = result;
  const frac = battle.teamHp / battle.teamMaxHp;
  battle.stars = result === 'won' ? (frac >= 0.7 ? 3 : frac >= 0.35 ? 2 : 1) : 0;
  events.push({ type: 'result', result });
}

// Prüft Wellenende und Sieg/Niederlage.
function checkProgress(battle: Battle, events: BattleEvent[]) {
  if (battle.result !== 'ongoing') return;
  if (battle.teamHp <= 0) return finish(battle, 'lost', events);
  if (alive(battle).length > 0) return;
  if (battle.waveIndex + 1 >= battle.stage.waves.length) return finish(battle, 'won', events);
  battle.waveIndex += 1;
  spawnWave(battle);
  events.push({ type: 'wave', index: battle.waveIndex, enemies: battle.enemies.map((e) => ({ ...e })) });
}

export const movesLeft = (battle: Battle) => (battle.stage.moveLimit ? battle.stage.moveLimit - battle.turn : Infinity);

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
  // Boss-Event: nach dem letzten Zug ist Schluss – gewertet wird der Schaden
  if (battle.result === 'ongoing' && movesLeft(battle) <= 0) finish(battle, 'won', events);
  return events;
}

function enemyTurn(battle: Battle, events: BattleEvent[]) {
  for (const enemy of alive(battle)) {
    enemy.countdown -= 1;
    if (enemy.countdown > 0) continue;
    enemy.countdown = enemy.maxCountdown;
    const z = ZOMBIES[enemy.kind];

    if (z.heal) {
      const targets = alive(battle)
        .filter((e) => e !== enemy && e.hp < e.maxHp)
        .map((e) => {
          const amount = Math.min(e.maxHp - e.hp, Math.round(e.maxHp * z.heal!));
          e.hp += amount;
          return { uid: e.uid, amount };
        });
      events.push({ type: 'zombieHeal', enemyUid: enemy.uid, targets });
      continue;
    }
    battle.teamHp = Math.max(0, battle.teamHp - enemy.attack);
    events.push({ type: 'enemyAttack', enemyUid: enemy.uid, damage: enemy.attack });
    if (z.crates) events.push({ type: 'crates', enemyUid: enemy.uid, grid: addCrates(battle.board, battle.rng, z.crates) });
    if (battle.teamHp <= 0) break;
  }
  checkProgress(battle, events);
}

export function canUseSkill(battle: Battle, heroId: HeroId): boolean {
  const hero = battle.heroes.find((h) => h.id === heroId);
  return !!hero && battle.result === 'ongoing' && hero.energy >= hero.maxEnergy;
}

// Fähigkeiten kosten keinen Zug und durchbrechen Schilde.
export function useSkill(battle: Battle, heroId: HeroId): BattleEvent[] | null {
  if (!canUseSkill(battle, heroId)) return null;
  const hero = battle.heroes.find((h) => h.id === heroId)!;
  const power = hero.skill.power;
  hero.energy = 0;
  const events: BattleEvent[] = [{ type: 'skill', heroId }];
  switch (hero.skill.kind) {
    case 'strike':
      damageFront(battle, heroId, hero.attack * power, events, true);
      break;
    case 'heal':
      heal(battle, power, events);
      break;
    case 'volley':
      for (const e of alive(battle)) damageEnemy(battle, heroId, e, Math.min(e.hp, hero.attack * power), events, true);
      break;
    case 'stun':
      for (const e of alive(battle)) {
        e.countdown += 2;
        damageEnemy(battle, heroId, e, Math.min(e.hp, hero.attack * power), events, true);
      }
      events.push({ type: 'stun', turns: 2 });
      break;
    case 'drain':
      damageFront(battle, heroId, hero.attack * power, events, true);
      heal(battle, 0.1, events);
      break;
  }
  checkProgress(battle, events);
  return events;
}

