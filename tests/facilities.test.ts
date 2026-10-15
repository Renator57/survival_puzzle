import { describe, expect, it } from 'vitest';
import * as F from '../src/core/facilities';
import * as P from '../src/core/player';
import * as Q from '../src/core/quests';
import { getWorld, marchSlots, processMarches, sendMarch } from '../src/core/world';

const rich = () => {
  const p = P.createPlayer(0);
  p.resources = { food: 1e6, wood: 1e6, steel: 1e6 };
  return p;
};

describe('Forschung', () => {
  it('braucht das Forschungszentrum, kostet Zeit und wirkt danach', () => {
    const p = rich();
    expect(F.startResearch(p, 'food', 0)).toBe('lab');
    p.buildings.lab.level = 1;
    const rate = P.productionRate(p, 'food');
    expect(F.startResearch(p, 'food', 0)).toBeNull();
    expect(F.startResearch(p, 'wood', 0)).toBe('busy');
    P.update(p, 10 * 60_000);
    expect(F.techLevel(p, 'food')).toBe(1);
    expect(P.productionRate(p, 'food')).toBeCloseTo(rate * 1.1);
  });

  it('Bautechnik verkürzt die Bauzeit, Logistik gibt Marsch-Plätze', () => {
    const p = rich();
    const before = P.buildSeconds(p, { baseTime: 100 } as never, 1);
    p.research.build = 5;
    expect(P.buildSeconds(p, { baseTime: 100 } as never, 1)).toBeLessThan(before);
    const slots = marchSlots(p);
    p.research.march = 2;
    expect(marchSlots(p)).toBe(slots + 2);
  });
});

describe('Lazarett', () => {
  it('Verluste landen teilweise im Lazarett und können geheilt werden', () => {
    const p = rich();
    p.buildings.hospital.level = 1;
    const sent = F.sendToHospital(p, { brawler: 100 });
    expect(sent).toBe(70);
    expect(F.woundedCount(p)).toBe(70);
    const before = p.troops.brawler;
    expect(F.startHealing(p, 0)).toBeNull();
    expect(F.woundedCount(p)).toBe(0);
    P.update(p, 10 * 60_000);
    expect(p.troops.brawler).toBe(before + 70);
  });

  it('ohne Lazarett sterben alle Verluste, Platz ist begrenzt', () => {
    const p = rich();
    expect(F.sendToHospital(p, { brawler: 100 })).toBe(0);
    p.buildings.hospital.level = 1;
    expect(F.sendToHospital(p, { brawler: 1000 })).toBe(F.hospitalCapacity(p));
  });

  it('verlorener Weltkarten-Angriff schickt Verletzte ins Lazarett', () => {
    const p = rich();
    p.buildings.hospital.level = 2;
    const world = getWorld(p.world.seed);
    const strong = world.tiles.filter((t) => t.kind === 'horde').sort((a, b) => b.level - a.level)[0];
    sendMarch(p, strong.key, 'attack', { brawler: 30 }, 0);
    processMarches(p, 3_600_000);
    expect(p.reports[0].win).toBe(false);
    expect(F.woundedCount(p)).toBeGreaterThan(0);
  });
});

describe('Beschleuniger', () => {
  it('verkürzen Bauzeit, Sofort-fertig kostet Diamanten', () => {
    const p = rich();
    P.startUpgrade(p, 'hq', 0);
    const end = p.buildings.hq.upgradeEndsAt!;
    expect(F.useItem(p, { kind: 'building', id: 'hq' }, 'speed5m', 0)).toBe(true);
    expect(p.buildings.hq.upgradeEndsAt).toBe(end - 5 * 60_000);
    expect(p.items.speed5m).toBe(2);
    P.startTraining(p, 'brawler', 50, 0);
    const d = p.diamonds;
    expect(F.finishNow(p, { kind: 'queue', id: 'barracks' }, 0)).toBe(true);
    expect(p.diamonds).toBeLessThan(d);
    P.update(p, 1);
    expect(p.queues.barracks).toBeNull();
  });

  it('kommen als Belohnung', () => {
    const p = P.createPlayer(0);
    const before = p.items.speed5m ?? 0;
    p.stats.trained = 20;
    p.quests.mainClaimed = ['m1', 'm2'];
    Q.claimMain(p);
    expect(p.items.speed5m).toBe(before + 3);
  });
});
