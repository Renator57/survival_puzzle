import { describe, expect, it } from 'vitest';
import { fight } from '../src/core/army';
import * as H from '../src/core/heroes';
import * as P from '../src/core/player';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('Helden', () => {
  it('jeder Held hat Bild-ID, gültige Farbe und eindeutige ID', () => {
    expect(new Set(H.HEROES.map((h) => h.id)).size).toBe(H.HEROES.length);
    for (const h of H.HEROES) expect(h.color).toBeGreaterThanOrEqual(0);
    for (let c = 0; c < 5; c++) expect(H.HEROES.some((h) => h.color === c && h.obtain === 'start')).toBe(true);
  });

  it('Seltenheit und Sterne machen Helden stärker', () => {
    const s = H.newHeroState();
    const common = H.heroStats(H.heroDef('brutus'), s).attack;
    const legendary = H.heroStats(H.heroDef('valkyra'), s).attack;
    expect(legendary).toBeGreaterThan(common);
    expect(H.heroStats(H.heroDef('rex'), { ...s, stars: 3 }).attack).toBeGreaterThan(H.heroStats(H.heroDef('rex'), s).attack);
  });

  it('Sterne-Aufstieg kostet Splitter', () => {
    const p = P.createPlayer(0);
    expect(H.starUp(p, 'rex')).toBe(false);
    p.heroes.rex!.shards = 10;
    expect(H.starUp(p, 'rex')).toBe(true);
    expect(p.heroes.rex!.stars).toBe(2);
    expect(p.heroes.rex!.shards).toBe(0);
  });
});

describe('Talentbaum', () => {
  it('Punkte durch Stufen, Voraussetzungen im Ast, Zurücksetzen kostet Diamanten', () => {
    const p = P.createPlayer(0);
    expect(H.learnTalent(p, 'rex', 'a1')).toBe('points');
    p.heroes.rex!.level = 10; // 9 Punkte
    for (let i = 0; i < 5; i++) expect(H.learnTalent(p, 'rex', 'a1')).toBeNull();
    expect(H.learnTalent(p, 'rex', 'a1')).toBe('max');
    expect(H.learnTalent(p, 'rex', 'a3')).toBe('requires');
    expect(H.learnTalent(p, 'rex', 'a2')).toBeNull();
    const before = H.heroStats(H.heroDef('rex'), H.newHeroState()).attack;
    expect(H.heroStats(H.heroDef('rex'), { ...p.heroes.rex!, level: 1 }).attack).toBeGreaterThan(before);
    expect(H.resetTalents(p, 'rex')).toBe(true);
    expect(p.diamonds).toBe(300 - H.TALENT_RESET_COST);
    expect(H.spentPoints(p.heroes.rex!)).toBe(0);
  });
});

describe('Kombos und Truppen-Boni', () => {
  it('Fraktionen und Duos werden erkannt', () => {
    const combos = H.activeCombos(['rex', 'mara', 'ivy', 'bolt', 'nyx']);
    expect(combos.map((c) => c.name)).toEqual(expect.arrayContaining(['Überlebende ×3', 'Rettungsteam']));
    const bonus = H.teamBonus(['rex', 'mara', 'ivy', 'bolt', 'nyx']);
    expect(bonus.heroAttack).toBeCloseTo(0.1);
    expect(bonus.heroHp).toBeCloseTo(0.05 + 0.12);
  });

  it('Helden-Boni machen Truppen stärker', () => {
    const p = P.createPlayer(0);
    p.heroes.ghost = H.newHeroState();
    H.setTeamSlot(p, 'ghost'); // +22 % Schützen-Angriff
    const buffs = H.troopBuffs(p);
    expect(buffs.attack.shooter).toBeCloseTo(0.22);
    const plain = fight({ shooter: 100 }, { shooter: 100 });
    const buffed = fight({ shooter: 100 }, { shooter: 100 }, 1, 1, buffs);
    expect(plain.attackerWon).toBe(false);
    expect(buffed.attackerWon).toBe(true);
  });

  it('nur eigene Helden passen ins Team, immer auf ihre Farbe', () => {
    const p = P.createPlayer(0);
    expect(H.setTeamSlot(p, 'valkyra')).toBe(false);
    p.heroes.valkyra = H.newHeroState();
    expect(H.setTeamSlot(p, 'valkyra')).toBe(true);
    expect(p.team[0]).toBe('valkyra');
  });
});

describe('Beschwörung', () => {
  it('kostet Diamanten, Duplikate werden zu Splittern', () => {
    const p = P.createPlayer(0);
    const r1 = H.summon(p, 1, seq([0.9, 0]))!; // gewöhnlich, erster im Pool (Rex, schon vorhanden)
    expect(p.diamonds).toBe(150);
    expect(r1[0]).toEqual({ id: 'rex', isNew: false, shards: 5 });
    expect(p.heroes.rex!.shards).toBe(5);
    const r2 = H.summon(p, 1, seq([0.01, 0]))!; // legendär
    expect(r2[0].isNew).toBe(true);
    expect(H.heroDef(r2[0].id).rarity).toBe('legendary');
    expect(H.summon(p, 1)).toBeNull(); // keine Diamanten mehr
  });

  it('garantiert spätestens nach 40 Beschwörungen einen Legendären', () => {
    const p = P.createPlayer(0);
    p.diamonds = 1e6;
    const results = Array.from({ length: 4 }, () => H.summon(p, 10, () => 0.99)!).flat();
    expect(results.some((r) => H.heroDef(r.id).rarity === 'legendary')).toBe(true);
  });

  it('mythische Helden gibt es nicht in der Beschwörung', () => {
    const p = P.createPlayer(0);
    p.diamonds = 1e7;
    const results = Array.from({ length: 30 }, () => H.summon(p, 10)!).flat();
    expect(results.some((r) => H.heroDef(r.id).rarity === 'mythic')).toBe(false);
    expect(H.grantShopHero(p, 'phoenix')).toBe(true);
    expect(H.grantShopHero(p, 'phoenix')).toBe(false);
  });

  it('erster Level-Sieg gibt Diamanten, Wiederholung nicht', () => {
    const p = P.createPlayer(0);
    expect(P.completeStage(p, 1).diamonds).toBe(15);
    expect(P.completeStage(p, 1).diamonds).toBe(0);
    expect(P.completeStage(p, 4).diamonds).toBe(50); // Boss
  });

  it('alter Spielstand wird übernommen', () => {
    const old = { ...JSON.parse(P.serialize(P.createPlayer(0))), heroes: { rex: 7, mara: 3 }, version: 1 };
    delete old.team;
    delete old.diamonds;
    const p = P.deserialize(JSON.stringify(old), 0);
    expect(p.heroes.rex!.level).toBe(7);
    expect(p.team).toHaveLength(5);
    expect(p.diamonds).toBe(300);
  });
});
