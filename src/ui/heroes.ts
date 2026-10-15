// Helden: Übersicht als Kartenraster und Detailfenster zum Trainieren.
import { HEROES, MAX_HERO_LEVEL, heroStats, heroUpgradeCost, type HeroId } from '../core/content';
import * as P from '../core/player';
import { costChips, fmt, pic } from './shared';

export const HERO_COLORS = ['#ef4b4b', '#3d8bfd', '#3fcf6b', '#ffc531', '#a66bff'];
const COLOR_NAMES = ['rote', 'blaue', 'grüne', 'gelbe', 'lila'];
const TILE_NAMES = ['Axt', 'Spritze', 'Zielscheibe', 'Blitz', 'Dolch'];

export function renderHeroes(player: P.Player): string {
  const cards = HEROES.map((def) => {
    const level = player.heroes[def.id];
    const stats = heroStats(def, level);
    const canTrain = level < MAX_HERO_LEVEL && P.canAfford(player, heroUpgradeCost(level));
    return `
      <button class="hero-card" style="--hero:${HERO_COLORS[def.color]}" data-action="hero" data-arg="${def.id}">
        <span class="hero-bg"></span>
        ${pic(`hero-${def.id}`, 'hero-img')}
        <span class="hero-lvl">Stufe ${level}</span>
        ${canTrain ? '<span class="bld-up">▲</span>' : ''}
        <span class="hero-info">
          <b>${def.name}</b>
          <small>${def.role}</small>
          <span class="hero-stats"><span>${pic('ui-swords')}${fmt(stats.attack)}</span><span>${pic('ui-heart')}${fmt(stats.hp)}</span></span>
        </span>
        <span class="hero-tile">${pic(`tile-${def.color}`)}</span>
      </button>`;
  }).join('');

  return `
    <div class="screen-head">
      <div><h1>Helden</h1><p>Jede Steinfarbe gehört zu einem Helden.</p></div>
      <div class="pill">${pic('ui-muscle')} ${fmt(P.teamPower(player))}</div>
    </div>
    <div class="hero-grid">${cards}</div>`;
}

export function heroSheet(player: P.Player, id: HeroId): string {
  const def = HEROES.find((h) => h.id === id)!;
  const level = player.heroes[id];
  const maxed = level >= MAX_HERO_LEVEL;
  const now = heroStats(def, level);
  const next = heroStats(def, level + 1);
  const cost = heroUpgradeCost(level);
  const affordable = P.canAfford(player, cost);
  const stat = (icon: string, label: string, a: number, b: number) =>
    `<div class="effect-row">${pic(icon)}<span>${label}</span><b>${fmt(a)}</b>${maxed ? '' : `<span class="arrow">→</span><b class="next">${fmt(b)}</b>`}</div>`;

  return `
    <div class="sheet-hero hero-sheet" style="--hero:${HERO_COLORS[def.color]}">
      <span class="hero-portrait">${pic(`hero-${id}`, 'sheet-img')}</span>
      <div>
        <p class="kicker">${def.role} · Stufe ${level}/${MAX_HERO_LEVEL}</p>
        <h2>${def.name}</h2>
        <p class="muted">Greift an, wenn du <b>${COLOR_NAMES[def.color]}</b> Steine (${pic(`tile-${def.color}`, 'ic inline')} ${TILE_NAMES[def.color]}) abräumst.</p>
      </div>
    </div>
    <div class="effects">
      ${stat('ui-swords', 'Angriff', now.attack, next.attack)}
      ${stat('ui-heart', 'Lebenspunkte', now.hp, next.hp)}
    </div>
    <div class="skill-box">
      ${pic('ui-sparkle')}
      <div><b>${def.skill.name}</b> <span class="muted">· ${def.skill.energy} Energie</span><p>${def.skill.text}</p></div>
    </div>
    ${maxed
      ? '<p class="hint center">Maximale Stufe erreicht.</p>'
      : `<div class="row-between"><span class="label">Kosten</span><span class="chips">${costChips(cost, player)}</span></div>
         <button class="btn big primary" data-action="train" data-arg="${id}" ${affordable ? '' : 'disabled'}>
           ${pic('ui-star')} Auf Stufe ${level + 1} trainieren
         </button>`}`;
}
