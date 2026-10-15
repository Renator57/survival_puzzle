import { describe, expect, it } from 'vitest';
import * as G from '../src/core/gear';
import * as H from '../src/core/heroes';
import * as P from '../src/core/player';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('Ausrüstung', () => {
  it('Schmieden kostet Stahl und erzeugt ein Teil im gewählten Platz', () => {
    const p = P.createPlayer(0);
    expect(G.craft(p, 'weapon')).toBeNull(); // kein Stahl
    p.resources.steel = 5000;
    const item = G.craft(p, 'weapon', seq([0.01, 0]))!;
    expect(item.slot).toBe('weapon');
    expect(item.rarity).toBe('legendary');
    expect(p.resources.steel).toBe(5000 - G.CRAFT_COST);
    expect(p.gear).toHaveLength(1);
  });

  it('Anlegen erhöht die Werte, Tauschen legt das alte zurück ins Inventar', () => {
    const p = P.createPlayer(0);
    p.resources.steel = 10000;
    const a = G.craft(p, 'weapon', seq([0.9, 0]))!;
    const b = G.craft(p, 'weapon', seq([0.01, 0]))!;
    const before = H.heroStats(H.heroDef('rex'), p.heroes.rex!).attack;
    expect(G.equip(p, 'rex', a.uid)).toBe(true);
    const withA = H.heroStats(H.heroDef('rex'), p.heroes.rex!).attack;
    expect(withA).toBeGreaterThan(before);
    G.equip(p, 'rex', b.uid);
    expect(p.gear.map((g) => g.uid)).toEqual([a.uid]);
    expect(H.heroStats(H.heroDef('rex'), p.heroes.rex!).attack).toBeGreaterThan(withA);
    expect(G.unequip(p, 'rex', 'weapon')).toBe(true);
    expect(p.gear).toHaveLength(2);
  });

  it('Aufwerten kostet Stahl, Zerlegen gibt Stahl', () => {
    const p = P.createPlayer(0);
    p.resources.steel = 10000;
    const item = G.craft(p, 'helmet', seq([0.5, 0]))!;
    const steel = p.resources.steel;
    expect(G.upgradeGear(p, item.uid)).toBe(true);
    expect(item.level).toBe(2);
    expect(p.resources.steel).toBeLessThan(steel);
    const s2 = p.resources.steel;
    expect(G.salvage(p, item.uid)).toBeGreaterThan(0);
    expect(p.resources.steel).toBeGreaterThan(s2);
    expect(p.gear).toHaveLength(0);
  });

  it('angelegte Teile lassen sich aufwerten, aber nicht zerlegen', () => {
    const p = P.createPlayer(0);
    p.resources.steel = 10000;
    const item = G.craft(p, 'armor')!;
    G.equip(p, 'mara', item.uid);
    expect(G.upgradeGear(p, item.uid)).toBe(true);
    expect(G.salvage(p, item.uid)).toBe(0);
  });
});

describe('Erwachen', () => {
  it('erst ab 5 Sternen, kostet Splitter und Stahl, macht deutlich stärker', () => {
    const p = P.createPlayer(0);
    const s = p.heroes.rex!;
    expect(G.canAwaken(p, 'rex')).toBe(false);
    s.stars = 5;
    s.shards = G.AWAKEN_SHARDS;
    p.resources.steel = G.AWAKEN_STEEL;
    const before = H.heroStats(H.heroDef('rex'), s);
    const buffBefore = H.heroBuffs(H.heroDef('rex'), s)[0].value;
    expect(G.awaken(p, 'rex')).toBe(true);
    expect(s.awakened).toBe(true);
    expect(H.heroStats(H.heroDef('rex'), s).attack).toBeGreaterThan(before.attack * 1.2);
    expect(H.heroBuffs(H.heroDef('rex'), s)[0].value).toBeGreaterThan(buffBefore);
    expect(G.awaken(p, 'rex')).toBe(false);
  });

  it('Ausrüstung kommt aus Belohnungen', () => {
    const p = P.createPlayer(0);
    for (let i = 1; i <= 3; i++) P.completeStage(p, i, 3);
    P.claimStarChest(p, 0);
    expect(p.gear).toHaveLength(1);
  });
});
