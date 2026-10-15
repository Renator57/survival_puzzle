import { describe, expect, it } from 'vitest';
import { armyLoad, fight } from '../src/core/army';
import * as P from '../src/core/player';
import { getWorld, hordeArmy, marchSlots, processMarches, sendMarch } from '../src/core/world';

describe('Konter-Dreieck', () => {
  it.each([
    ['brawler', 'rider'],
    ['rider', 'shooter'],
    ['shooter', 'brawler'],
  ] as const)('%s schlägt %s bei gleicher Anzahl', (strong, weak) => {
    const result = fight({ [strong]: 100 }, { [weak]: 100 });
    expect(result.attackerWon).toBe(true);
    const reverse = fight({ [weak]: 100 }, { [strong]: 100 });
    expect(reverse.attackerWon).toBe(false);
  });

  it('Kämpfe sind deterministisch und Verluste passen zur Ausgangslage', () => {
    const a = { brawler: 80, shooter: 40 };
    const d = { rider: 60, shooter: 30 };
    const r1 = fight(a, d);
    expect(fight(a, d)).toEqual(r1);
    expect((r1.attackerLeft.brawler ?? 0) + (r1.attackerLosses.brawler ?? 0)).toBe(80);
  });

  it('Sammelwagen tragen viel, kämpfen schlecht', () => {
    expect(armyLoad({ wagon: 1 })).toBeGreaterThan(armyLoad({ brawler: 10 }));
    expect(fight({ wagon: 10 }, { zombie: 20 }).attackerWon).toBe(false);
  });
});

describe('Ausbildung', () => {
  it('kostet Rohstoffe, braucht Zeit und Platz', () => {
    const p = P.createPlayer(0);
    const before = p.troops.shooter;
    expect(P.startTraining(p, 'shooter', 10, 0)).toBeNull();
    expect(p.resources.food).toBe(1000 - 350);
    expect(P.startTraining(p, 'brawler', 5, 0)).toBe('busy');
    P.update(p, 60_000);
    expect(p.troops.shooter).toBe(before + 10);
    expect(P.startTraining(p, 'brawler', 10_000, 60_000)).toBe('capacity');
    expect(P.startTraining(p, 'wagon', 1, 60_000)).toBe('locked'); // Werkstatt noch nicht gebaut
  });
});

describe('Weltkarte', () => {
  it('ist pro Seed gleich und hat alle Feldtypen', () => {
    const w = getWorld(42);
    expect(getWorld(42)).toBe(w);
    for (const kind of ['res', 'horde', 'city']) expect(w.tiles.some((t) => t.kind === kind)).toBe(true);
    expect(new Set(w.tiles.map((t) => t.key)).size).toBe(w.tiles.length);
  });

  it('Sammeln: hin, sammeln, zurück – Rohstoffe kommen an', () => {
    const p = P.createPlayer(0);
    const world = getWorld(p.world.seed);
    const field = world.tiles.find((t) => t.kind === 'res' && t.res === 'wood')!;
    const woodBefore = p.resources.wood;
    expect(sendMarch(p, field.key, 'gather', { brawler: 20 }, 0)).toBeNull();
    expect(p.troops.brawler).toBe(10);
    expect(P.totalUnits(p, 'brawler')).toBe(30);
    processMarches(p, 10 * 60 * 1000);
    expect(p.marches).toHaveLength(0);
    expect(p.troops.brawler).toBe(30);
    expect(p.resources.wood).toBe(woodBefore + 160);
    expect(p.reports[0].title).toContain('Sammeltrupp');
  });

  it('Angriff auf schwache Horde gewinnt Beute, starke Horde schlägt zurück', () => {
    const p = P.createPlayer(0);
    const world = getWorld(p.world.seed);
    const weak = world.tiles.find((t) => t.kind === 'horde' && t.level === 1)!;
    expect(hordeArmy(1).zombie).toBeLessThan(30);
    expect(sendMarch(p, weak.key, 'attack', { brawler: 30, shooter: 30 }, 0)).toBeNull();
    processMarches(p, 10 * 60 * 1000);
    expect(p.reports[0].win).toBe(true);
    expect(p.resources.food).toBeGreaterThan(1000);
    // Horde ist weg, bis sie neu erscheint
    expect(sendMarch(p, weak.key, 'attack', { shooter: 5 }, 10 * 60 * 1000)).toContain('leer');
  });

  it('begrenzt die Zahl gleichzeitiger Märsche', () => {
    const p = P.createPlayer(0);
    const fields = getWorld(p.world.seed).tiles.filter((t) => t.kind === 'res');
    for (let i = 0; i < marchSlots(p); i++) expect(sendMarch(p, fields[i].key, 'gather', { rider: 1 }, 0)).toBeNull();
    expect(sendMarch(p, fields[9].key, 'gather', { rider: 1 }, 0)).toContain('Marsch-Plätze');
  });
});
