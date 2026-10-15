// Events-Ansicht im Kampf-Reiter: Titan-Angriff und Dungeons.
import { teamPower, type Player } from '../core/player';
import * as E from '../core/events';
import { heroDef } from '../core/heroes';
import { launchBattle, type ResultView } from './battles';
import { rewardChips } from './quests';
import { actions, app, closeSheet, fmt, openSheet, pic } from './shared';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function renderEvents(player: Player): string {
  const now = Date.now();
  const tries = E.bossTriesLeft(player);
  const tiers = E.BOSS_TIERS.map((t, i) => {
    const need = E.bossTierDamage(player, i);
    const got = player.events.bossBest >= need;
    return `<div class="tier ${got ? 'got' : ''}"><span>${fmt(need)}</span>${got ? '✓' : `<small>${rewardChips(t.reward)}</small>`}</div>`;
  }).join('');
  const best = player.events.bossBest;
  const next = E.BOSS_TIERS.findIndex((_, i) => best < E.bossTierDamage(player, i));
  const progress = next === -1 ? 100 : (best / E.bossTierDamage(player, next)) * 100;

  const dungeons = E.DUNGEONS.map((d) => {
    const open = E.dungeonOpen(d.id, now);
    const left = E.dungeonTriesLeft(player, d.id);
    return `<button class="dungeon ${open ? '' : 'closed'}" data-action="dungeon" data-arg="${d.id}">
      ${pic(d.img, 'dungeon-img')}
      <div class="row-main"><b>${d.name}</b><span class="muted">${d.text}</span>
        <span class="dungeon-state">${open ? `Heute offen · ${left}/${E.DUNGEON_TRIES} Versuche` : `Geschlossen · offen am ${d.days.map((x) => DAY_NAMES[x]).join(', ')}`}</span></div>
    </button>`;
  }).join('');

  return `
    <div class="boss-card">
      <div class="boss-glow"></div>
      ${pic('zombie-boss', 'boss-img')}
      <div class="boss-text">
        <p class="kicker">Täglich · ${tries}/${E.BOSS_TRIES} Versuche</p>
        <h2>Titan-Angriff</h2>
        <p>${E.BOSS_MOVES} Züge – mach so viel Schaden wie möglich!</p>
      </div>
      <div class="boss-progress"><div class="bar big"><i style="width:${progress.toFixed(0)}%"></i></div>
        <span>Bester Schaden heute: <b>${fmt(best)}</b></span></div>
      <div class="tiers">${tiers}</div>
      <button class="btn big danger" data-action="boss-start" ${tries > 0 ? '' : 'disabled'}>${pic('ui-swords')} ${tries > 0 ? 'Angreifen' : 'Morgen wieder'}</button>
    </div>
    <h2 class="section-title">${pic('ui-skull')} Dungeons</h2>
    <div class="section list">${dungeons}</div>`;
}

function dungeonSheet(id: E.DungeonId): string {
  const p = app.player;
  const d = E.DUNGEONS.find((x) => x.id === id)!;
  const open = E.dungeonOpen(id, Date.now());
  const left = E.dungeonTriesLeft(p, id);
  const power = teamPower(p);
  const rows = E.DIFFICULTIES.map((name, diff) => {
    const stage = E.dungeonStage(p, id, diff);
    const reward = E.dungeonReward(p, id, diff);
    const recommended = Math.round(123 * stage.scale);
    return `<div class="list-row diff">
      <div class="row-main"><b>${name}</b>
        <span class="chips left small">${rewardChips(reward)}${reward.shards ? `<span class="chip">${pic('ui-glowstar')}${reward.shards} Splitter</span>` : ''}</span>
        <span class="muted ${power < recommended ? 'bad' : ''}">Empfohlen: ${fmt(recommended)} Stärke</span></div>
      <button class="btn small danger" data-action="dungeon-start" data-arg="${id}:${diff}" ${open && left > 0 ? '' : 'disabled'}>Start</button>
    </div>`;
  }).join('');
  return `
    <div class="sheet-hero">${pic(d.img, 'sheet-img')}<div><p class="kicker">${open ? `${left}/${E.DUNGEON_TRIES} Versuche heute` : 'Heute geschlossen'}</p>
      <h2>${d.name}</h2><p class="muted">${d.text}</p></div></div>
    <div class="list">${rows}</div>
    <p class="tip">${pic('ui-muscle')} Deine Stärke: ${fmt(power)}. Ein verlorener Kampf verbraucht ebenfalls einen Versuch.</p>`;
}

function startBoss() {
  const p = app.player;
  if (E.bossTriesLeft(p) <= 0) return;
  closeSheet(true);
  void launchBattle(E.bossStage(p), (battle) => {
    const { reward, tiers } = E.finishBoss(p, battle.damageDealt);
    const buttons: ResultView['buttons'] = [];
    if (E.bossTriesLeft(p) > 0) buttons.push({ label: `Nochmal (${E.bossTriesLeft(p)} übrig)`, cls: 'big primary', run: startBoss });
    buttons.push({ label: 'Zu den Events', run: () => undefined });
    return {
      won: true,
      title: 'Titan-Angriff beendet',
      text: `Schaden: <b>${fmt(battle.damageDealt)}</b> · Bester heute: ${fmt(p.events.bossBest)}${tiers ? ` · ${tiers} neue Stufe${tiers > 1 ? 'n' : ''}!` : ''}${
        p.events.bossClaimed < E.BOSS_TIERS.length ? `<br>Nächste Stufe ab ${fmt(E.bossTierDamage(p, p.events.bossClaimed))} Schaden.` : ''}`,
      rewardHtml: rewardChips(reward) || undefined,
      buttons,
    };
  });
}

function startDungeon(id: E.DungeonId, diff: number) {
  const p = app.player;
  if (!E.dungeonOpen(id, Date.now()) || E.dungeonTriesLeft(p, id) <= 0) return;
  closeSheet(true);
  void launchBattle(E.dungeonStage(p, id, diff), (battle, outcome) => {
    const won = outcome === 'won';
    const result = E.finishDungeon(p, id, diff, won);
    const buttons: ResultView['buttons'] = [];
    if (E.dungeonTriesLeft(p, id) > 0) buttons.push({ label: 'Nochmal', cls: 'big primary', run: () => startDungeon(id, diff) });
    buttons.push({ label: 'Zu den Events', run: () => undefined });
    return {
      won,
      title: won ? 'Dungeon geschafft!' : 'Niederlage',
      stars: won ? battle.stars : undefined,
      text: won
        ? result!.shardHero ? `+${result!.shards} Splitter für ${heroDef(result!.shardHero).name}!` : 'Beute gesichert.'
        : 'Zu stark – versuch eine leichtere Stufe oder trainiere deine Helden.',
      rewardHtml: won ? rewardChips(result!.reward) : undefined,
      buttons,
    };
  });
}

Object.assign(actions, {
  'boss-start': () => startBoss(),
  dungeon: (arg: string) => openSheet(() => dungeonSheet(arg as E.DungeonId)),
  'dungeon-start': (arg: string) => {
    const [id, diff] = arg.split(':');
    startDungeon(id as E.DungeonId, Number(diff));
  },
});
