import { describe, expect, it } from 'vitest';
import { COLS, ROWS, createBoard, hasMatch, hasValidMove, isValidSwap, playSwap, type Board, type Pos } from '../src/core/board';
import { createBattle, swap, useSkill } from '../src/core/battle';
import { STAGES } from '../src/core/content';
import { battleTeam } from '../src/core/heroes';
import * as P from '../src/core/player';
import { createRng } from '../src/core/rng';

const team = battleTeam(P.createPlayer(0));

function findMove(board: Board): [Pos, Pos] {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const a = { row: r, col: c };
      for (const b of [{ row: r, col: c + 1 }, { row: r + 1, col: c }]) if (isValidSwap(board, a, b)) return [a, b];
    }
  throw new Error('kein Zug');
}

function setGrid(board: Board, colors: number[][]) {
  board.grid = colors.map((row) => row.map((color) => ({ id: board.nextId++, color, special: 'none' as const })));
}

describe('Spielfeld', () => {
  it('startet ohne Treffer, aber mit möglichem Zug', () => {
    for (let seed = 1; seed < 50; seed++) {
      const board = createBoard(createRng(seed));
      expect(hasMatch(board.grid)).toBe(false);
      expect(hasValidMove(board)).toBe(true);
    }
  });

  it('lehnt Züge ohne Treffer ab', () => {
    const board = createBoard(createRng(1));
    setGrid(board, [
      [0, 1, 2, 3, 4, 0, 1],
      [1, 2, 3, 4, 0, 1, 2],
      [2, 3, 4, 0, 1, 2, 3],
      [3, 4, 0, 1, 2, 3, 4],
      [4, 0, 1, 2, 3, 4, 0],
      [0, 1, 2, 3, 4, 0, 1],
    ]);
    expect(playSwap(board, createRng(1), { row: 0, col: 0 }, { row: 5, col: 0 })).toBeNull(); // nicht benachbart
    expect(isValidSwap(board, { row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
  });

  it('Viererreihe erzeugt einen Spezialstein, Fünferreihe eine Bombe', () => {
    const board = createBoard(createRng(2));
    setGrid(board, [
      [1, 1, 0, 1, 2, 3, 4],
      [2, 3, 1, 4, 3, 2, 3],
      [3, 4, 2, 3, 4, 3, 2],
      [4, 2, 3, 4, 2, 4, 3],
      [2, 3, 4, 2, 3, 2, 4],
      [3, 4, 2, 3, 4, 3, 2],
    ]);
    const steps = playSwap(board, createRng(2), { row: 1, col: 2 }, { row: 0, col: 2 })!;
    expect(steps[0].created).toEqual([expect.objectContaining({ special: 'row' })]);
    expect(steps[0].cleared).toHaveLength(3);

    setGrid(board, [
      [1, 1, 0, 1, 1, 3, 4],
      [2, 3, 1, 4, 3, 2, 3],
      [3, 4, 2, 3, 4, 3, 2],
      [4, 2, 3, 4, 2, 4, 3],
      [2, 3, 4, 2, 3, 2, 4],
      [3, 4, 2, 3, 4, 3, 2],
    ]);
    const steps2 = playSwap(board, createRng(2), { row: 1, col: 2 }, { row: 0, col: 2 })!;
    expect(steps2[0].created[0].special).toBe('bomb');
  });

  it('getauschter Spezialstein räumt die ganze Reihe', () => {
    const board = createBoard(createRng(3));
    board.grid[2][3].special = 'row';
    const steps = playSwap(board, createRng(3), { row: 2, col: 3 }, { row: 1, col: 3 })!;
    expect(steps[0].cleared.length).toBeGreaterThanOrEqual(COLS);
  });

  it('Feld bleibt nach vielen Zügen gültig und voll', () => {
    const board = createBoard(createRng(9));
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const [a, b] = findMove(board);
      expect(playSwap(board, rng, a, b)).not.toBeNull();
      expect(hasMatch(board.grid)).toBe(false);
      expect(board.grid.flat()).toHaveLength(ROWS * COLS);
      const ids = new Set(board.grid.flat().map((t) => t.id));
      expect(ids.size).toBe(ROWS * COLS);
    }
  });
});

describe('Kampf', () => {
  it('ist mit gleichem Seed reproduzierbar (Grundlage für Server-Prüfung)', () => {
    const run = () => {
      const battle = createBattle({ stageId: 1, team, hpBonus: 0, seed: 42 });
      for (let i = 0; i < 15 && battle.result === 'ongoing'; i++) swap(battle, ...findMove(battle.board));
      return JSON.stringify(battle);
    };
    expect(run()).toBe(run());
  });

  it('Level 1 ist mit normalen Zügen schaffbar', () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const battle = createBattle({ stageId: 1, team, hpBonus: 0, seed });
      for (let i = 0; i < 100 && battle.result === 'ongoing'; i++) {
        swap(battle, ...findMove(battle.board));
        for (const h of battle.heroes) useSkill(battle, h.id);
      }
      if (battle.result === 'won') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(18);
  });

  it('Zombies greifen an, wenn ihr Zähler abläuft', () => {
    const battle = createBattle({ stageId: 1, team, hpBonus: 0, seed: 5 });
    for (const e of battle.enemies) {
      e.hp = e.maxHp = 1e9;
      e.countdown = 1;
    }
    const events = swap(battle, ...findMove(battle.board))!;
    expect(events.some((e) => e.type === 'enemyAttack')).toBe(true);
    expect(battle.teamHp).toBeLessThan(battle.teamMaxHp);
  });

  it('Fähigkeit nur mit voller Energie', () => {
    const battle = createBattle({ stageId: 1, team, hpBonus: 0, seed: 5 });
    expect(useSkill(battle, 'rex')).toBeNull();
    battle.heroes[0].energy = battle.heroes[0].maxEnergy;
    expect(useSkill(battle, 'rex')).not.toBeNull();
    expect(battle.heroes[0].energy).toBe(0);
  });
});

describe('Basis', () => {
  it('produziert Rohstoffe bis zur Kapazität', () => {
    const p = P.createPlayer(0);
    P.update(p, 10_000);
    expect(p.resources.food).toBeCloseTo(1000 + 12);
    P.update(p, 1e9);
    expect(p.resources.food).toBe(P.capacity(p));
    expect(p.resources.steel).toBe(0);
  });

  it('Bauauftrag kostet Rohstoffe, dauert und blockiert weitere Aufträge', () => {
    const p = P.createPlayer(0);
    expect(P.startUpgrade(p, 'farm', 0)).toBe('maxLevel'); // Farm darf nicht über HQ-Stufe
    expect(P.startUpgrade(p, 'hq', 0)).toBeNull();
    expect(p.resources.food).toBeLessThan(1000);
    expect(P.startUpgrade(p, 'sawmill', 0)).toBe('busy');
    P.update(p, 5_000);
    expect(p.buildings.hq.level).toBe(1);
    P.update(p, 60_000);
    expect(p.buildings.hq.level).toBe(2);
    expect(P.startUpgrade(p, 'farm', 60_000)).toBeNull();
  });

  it('Stahlwerk erst ab HQ 2', () => {
    const p = P.createPlayer(0);
    expect(P.upgradeBlock(p, 'steelworks')).toBe('locked');
  });

  it('Level-Belohnung: voll beim ersten Sieg, danach weniger', () => {
    const p = P.createPlayer(0);
    expect(P.isStageUnlocked(p, 2)).toBe(false);
    const first = P.completeStage(p, 1);
    expect(first).toMatchObject(STAGES[0].reward);
    expect(P.isStageUnlocked(p, 2)).toBe(true);
    expect(P.completeStage(p, 1).food).toBeLessThan(first.food);
  });

  it('Spielstand übersteht Speichern und Laden', () => {
    const p = P.createPlayer(0);
    P.upgradeHero(p, 'rex');
    const loaded = P.deserialize(P.serialize(p), 0);
    expect(loaded).toEqual(p);
  });
});
