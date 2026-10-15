import { describe, expect, it } from 'vitest';
import * as E from '../src/core/events';
import * as P from '../src/core/player';

const DAY = 24 * 3600 * 1000;

describe('Titan-Angriff', () => {
  it('Schaden schaltet Stufen frei, jede Stufe nur einmal pro Tag', () => {
    const p = P.createPlayer(0);
    P.update(p, 1000);
    const d = p.diamonds;
    const r1 = E.finishBoss(p, E.bossTierDamage(p, 1)); // Stufe 1 und 2
    expect(r1.tiers).toBe(2);
    expect(p.diamonds).toBe(d + 5);
    const r2 = E.finishBoss(p, 10); // schlechter als vorher: nichts Neues
    expect(r2.tiers).toBe(0);
    expect(E.bossTriesLeft(p)).toBe(1);
    P.update(p, DAY + 1000);
    expect(E.bossTriesLeft(p)).toBe(3);
    expect(p.events.bossClaimed).toBe(0);
  });

  it('Boss-Level hat Zuglimit und wächst mit dem Fortschritt', () => {
    const p = P.createPlayer(0);
    const early = E.bossStage(p);
    p.stagesCleared = 10;
    expect(E.bossStage(p).scale).toBeGreaterThan(early.scale);
    expect(early.moveLimit).toBe(E.BOSS_MOVES);
  });
});

describe('Dungeons', () => {
  it('öffnen je Wochentag, sonntags alle', () => {
    const monday = Date.UTC(2026, 9, 12);
    const sunday = Date.UTC(2026, 9, 18);
    expect(E.dungeonOpen('steel', monday)).toBe(true);
    expect(E.dungeonOpen('wood', monday)).toBe(false);
    for (const d of E.DUNGEONS) expect(E.dungeonOpen(d.id, sunday)).toBe(true);
  });

  it('Sieg gibt Belohnung, schwerer gibt mehr, Versuche werden gezählt', () => {
    const p = P.createPlayer(0);
    P.update(p, 1000);
    expect(E.dungeonReward(p, 'steel', 2).steel!).toBeGreaterThan(E.dungeonReward(p, 'steel', 0).steel!);
    const steel = p.resources.steel;
    E.finishDungeon(p, 'steel', 0, true);
    expect(p.resources.steel).toBeGreaterThan(steel);
    E.finishDungeon(p, 'steel', 0, false);
    expect(E.dungeonTriesLeft(p, 'steel')).toBe(0);
  });

  it('Friedhof gibt Splitter an eigene Helden', () => {
    const p = P.createPlayer(0);
    const r = E.finishDungeon(p, 'shards', 1, true, () => 0)!;
    expect(r.shards).toBe(12);
    expect(p.heroes[r.shardHero!]!.shards).toBe(12);
  });
});
