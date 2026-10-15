import { describe, expect, it } from 'vitest';
import * as P from '../src/core/player';
import * as Q from '../src/core/quests';

const DAY = 24 * 3600 * 1000;

describe('Hauptaufgaben', () => {
  it('führen der Reihe nach durchs Spiel und geben Belohnungen', () => {
    const p = P.createPlayer(0);
    expect(Q.currentMainQuest(p)!.id).toBe('m1');
    expect(Q.claimMain(p)).toBeNull(); // noch nicht erfüllt
    p.buildings.hq.level = 2;
    const food = p.resources.food;
    expect(Q.claimMain(p)).toEqual({ food: 500, wood: 500 });
    expect(p.resources.food).toBe(food + 500);
    expect(Q.currentMainQuest(p)!.id).toBe('m2');
  });
});

describe('Tägliche Aufgaben', () => {
  it('zählen ab Tagesbeginn und setzen sich am nächsten Tag zurück', () => {
    const p = P.createPlayer(0);
    P.update(p, 1000);
    P.completeStage(p, 1);
    P.completeStage(p, 1);
    P.completeStage(p, 2);
    const battle = Q.DAILY_QUESTS.find((q) => q.id === 'd-battle')!;
    expect(Q.dailyProgress(p, battle)).toBe(3);
    expect(Q.claimDaily(p, 'd-battle')).toEqual({ food: 800 });
    expect(Q.claimDaily(p, 'd-battle')).toBeNull();
    P.update(p, DAY + 1000); // neuer Tag
    expect(Q.dailyProgress(p, battle)).toBe(0);
    expect(p.quests.dailyClaimed).toEqual([]);
  });

  it('Truhe erst, wenn alle Tagesaufgaben abgeholt sind', () => {
    const p = P.createPlayer(0);
    P.update(p, 1000);
    expect(Q.claimDaily(p, 'chest')).toBeNull();
    p.quests.dailyClaimed = Q.DAILY_QUESTS.map((q) => q.id);
    const d = p.diamonds;
    expect(Q.claimDaily(p, 'chest')).toEqual({ diamonds: 30 });
    expect(p.diamonds).toBe(d + 30);
  });
});

describe('Login-Belohnung', () => {
  it('einmal pro Tag, steigend über 7 Tage', () => {
    const p = P.createPlayer(0);
    expect(Q.claimLogin(p, 0)).toEqual({ food: 1000 });
    expect(Q.claimLogin(p, 1000)).toBeNull();
    expect(Q.claimLogin(p, DAY)).toEqual({ wood: 1000 });
    for (let d = 2; d < 6; d++) Q.claimLogin(p, d * DAY);
    expect(Q.claimLogin(p, 6 * DAY)).toEqual({ diamonds: 100 });
  });
});
