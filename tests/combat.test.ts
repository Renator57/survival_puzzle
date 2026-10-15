import { describe, expect, it } from 'vitest';
import { COLS, CRATE, ROWS, createBoard, hasMatch, isValidSwap, playSwap, type Board } from '../src/core/board';
import { createBattle, swap, useSkill, type Battle } from '../src/core/battle';
import { STAGES, ZOMBIES, type StageDef, type ZombieKind } from '../src/core/content';
import { battleTeam } from '../src/core/heroes';
import * as P from '../src/core/player';
import { createRng } from '../src/core/rng';

const team = battleTeam(P.createPlayer(0));
const stage = (waves: ZombieKind[][], extra: Partial<StageDef> = {}): StageDef => ({
  id: 99, name: 'Test', waves, scale: 1, reward: { food: 0, wood: 0, steel: 0 }, obstacles: { crates: 0, ice: 0 }, ...extra,
});

function anyMove(b: Board): [{ row: number; col: number }, { row: number; col: number }] {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const n of [{ row: r, col: c + 1 }, { row: r + 1, col: c }])
        if (isValidSwap(b, { row: r, col: c }, n)) return [{ row: r, col: c }, n];
  throw new Error('kein Zug');
}

describe('Hindernisse', () => {
  it('Feld mit Kisten und Eis entsteht korrekt und ist spielbar', () => {
    const b = createBoard(createRng(4), { crates: 6, ice: 4 });
    const tiles = b.grid.flat();
    expect(tiles.filter((t) => t.color === CRATE)).toHaveLength(6);
    expect(tiles.filter((t) => t.frozen)).toHaveLength(4);
    expect(hasMatch(b.grid)).toBe(false);
  });

  it('Kisten und Eis lassen sich nicht tauschen', () => {
    const b = createBoard(createRng(5), { crates: 0, ice: 0 });
    b.grid[0][0].color = CRATE;
    b.grid[2][2].frozen = true;
    expect(isValidSwap(b, { row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
    expect(isValidSwap(b, { row: 2, col: 2 }, { row: 2, col: 3 })).toBe(false);
  });

  it('Kiste neben einem Treffer zerbricht, Eis taut auf', () => {
    const b = createBoard(createRng(6));
    b.grid = [
      [1, 1, 0, 1, 2, 3, 4],
      [2, 3, 1, 4, 3, 2, 3],
      [3, 4, 2, 3, 4, 3, 2],
      [4, 2, 3, 4, 2, 4, 3],
      [2, 3, 4, 2, 3, 2, 4],
      [3, 4, 2, 3, 4, 3, 2],
    ].map((row) => row.map((color) => ({ id: b.nextId++, color, special: 'none' as const })));
    b.grid[1][0].color = CRATE; // unter dem Treffer in Reihe 0
    b.grid[1][1].frozen = true;
    const crateId = b.grid[1][0].id;
    const steps = playSwap(b, createRng(6), { row: 1, col: 2 }, { row: 0, col: 2 })!;
    expect(steps[0].cleared.some((t) => t.id === crateId)).toBe(true);
    expect(b.grid.flat().some((t) => t.frozen)).toBe(false);
  });

  it('nach vielen Zügen mit Hindernissen bleibt das Feld gültig', () => {
    const b = createBoard(createRng(7), { crates: 8, ice: 6 });
    const rng = createRng(7);
    for (let i = 0; i < 150; i++) {
      const [x, y] = anyMove(b);
      playSwap(b, rng, x, y);
      expect(hasMatch(b.grid)).toBe(false);
      expect(new Set(b.grid.flat().map((t) => t.id)).size).toBe(ROWS * COLS);
    }
  });
});

describe('Spezial-Zombies', () => {
  it('Schild schluckt normalen Schaden, Fähigkeit bricht ihn', () => {
    const battle = createBattle({ stage: stage([['shielder']]), team, hpBonus: 0, seed: 1 });
    const z = battle.enemies[0];
    expect(z.shield).toBe(ZOMBIES.shielder.shield);
    swap(battle, ...anyMove(battle.board));
    expect(z.shield).toBeLessThan(z.maxShield);
    expect(z.hp).toBe(z.maxHp); // Schaden ging nur ins Schild
    battle.heroes[0].energy = battle.heroes[0].maxEnergy;
    useSkill(battle, battle.heroes[0].id);
    expect(z.shield).toBe(0);
    expect(z.hp).toBeLessThan(z.maxHp);
  });

  it('Seuchen-Doktor heilt andere statt anzugreifen', () => {
    const battle = createBattle({ stage: stage([['healer', 'brute']]), team, hpBonus: 0, seed: 2 });
    const [healer, brute] = battle.enemies;
    healer.countdown = 1;
    healer.hp = healer.maxHp = 1e9; // soll überleben
    brute.hp = Math.round(brute.maxHp / 2);
    brute.countdown = 99;
    const hpBefore = battle.teamHp;
    const events = swap(battle, ...anyMove(battle.board))!;
    expect(events.some((e) => e.type === 'zombieHeal')).toBe(true);
    expect(battle.teamHp).toBe(hpBefore);
  });

  it('Explodierer wirft Kisten', () => {
    const battle = createBattle({ stage: stage([['bomber']]), team, hpBonus: 0, seed: 3 });
    const z = battle.enemies[0];
    z.hp = z.maxHp = 1e9;
    z.countdown = 1;
    const events = swap(battle, ...anyMove(battle.board))!;
    expect(events.some((e) => e.type === 'crates')).toBe(true);
    expect(battle.board.grid.flat().filter((t) => t.color === CRATE).length).toBeGreaterThan(0);
  });
});

describe('Sterne und Boss-Modus', () => {
  const win = (b: Battle) => {
    for (const e of b.enemies) e.hp = 1;
    b.heroes[0].energy = b.heroes[0].maxEnergy;
    for (let i = 0; i < 30 && b.result === 'ongoing'; i++) {
      for (const h of b.heroes) {
        h.energy = h.maxEnergy;
        useSkill(b, h.id);
      }
      for (const e of b.enemies) e.hp = Math.min(e.hp, 1);
    }
  };

  it('volle Leben = 3 Sterne, wenig Leben = 1 Stern', () => {
    const b1 = createBattle({ stage: stage([['walker']]), team, hpBonus: 0, seed: 4 });
    win(b1);
    expect(b1.result).toBe('won');
    expect(b1.stars).toBe(3);
    const b2 = createBattle({ stage: stage([['walker']]), team, hpBonus: 0, seed: 4 });
    b2.teamHp = Math.round(b2.teamMaxHp * 0.2);
    win(b2);
    expect(b2.stars).toBe(1);
  });

  it('Boss-Modus endet nach dem Zuglimit und zählt den Schaden', () => {
    const b = createBattle({ stage: stage([['titan']], { moveLimit: 5, mode: 'boss' }), team, hpBonus: 10, seed: 5 });
    for (let i = 0; i < 10 && b.result === 'ongoing'; i++) swap(b, ...anyMove(b.board));
    expect(b.turn).toBe(5);
    expect(b.result).toBe('won');
    expect(b.damageDealt).toBeGreaterThan(0);
  });

  it('Sterne werden gespeichert, Truhe ab genug Sternen', () => {
    const p = P.createPlayer(0);
    for (let i = 1; i <= 3; i++) P.completeStage(p, i, 3);
    P.completeStage(p, 1, 1); // schlechtere Wertung überschreibt nicht
    expect(P.totalStars(p)).toBe(9);
    expect(P.claimStarChest(p, 0)).toBe(true);
    expect(P.claimStarChest(p, 0)).toBe(false);
    expect(P.claimStarChest(p, 1)).toBe(false);
  });

  it('Kampagnen-Level mit Spezial-Zombies und Hindernissen sind erzeugt', () => {
    expect(STAGES[4].obstacles.crates).toBeGreaterThan(0);
    expect(STAGES.some((s) => s.waves.flat().includes('healer'))).toBe(true);
  });
});
