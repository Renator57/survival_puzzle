// App-Rahmen: Navigation, Speichern, Aktionen. Die Bildschirme liegen in src/ui/, der Kampf in src/game/.
import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import Phaser from 'phaser';
import { createBattle } from './core/battle';
import { STAGES, type BuildingId, type HeroId, type Resources } from './core/content';
import * as P from './core/player';
import { BattleScene, HEIGHT, WIDTH, type BattleOutcome } from './game/BattleScene';
import { BLOCK_TEXT, buildingSheet, renderBase } from './ui/base';
import { heroSheet, renderHeroes } from './ui/heroes';
import { renderMap, scrollMapToCurrent, stageSheet } from './ui/map';
import { closeSheet, costChips, fmt, openSheet, patch, pic, refreshSheet, RES_IMG, RES_NAMES, toast, updateTimers } from './ui/shared';
import './style.css';

const SAVE_KEY = 'survival-puzzle-save';
type Tab = 'base' | 'map' | 'heroes';

let player = load();
let tab: Tab = 'base';
let game: Phaser.Game | null = null;

function load(): P.Player {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = P.deserialize(raw, now);
      P.update(p, now); // Offline-Produktion gutschreiben
      return p;
    }
  } catch (err) {
    console.error('Spielstand defekt, starte neu', err);
  }
  return P.createPlayer(now);
}

function save() {
  localStorage.setItem(SAVE_KEY, P.serialize(player));
}

// ---------- Darstellung ----------
function renderResources() {
  const cap = P.capacity(player);
  return P.RESOURCE_IDS.map((r) => {
    const value = player.resources[r];
    return `<div class="res ${value >= cap ? 'full' : ''}" title="${RES_NAMES[r]}">
      ${pic(RES_IMG[r], 'res-icon')}
      <span class="res-val">${fmt(value)}</span>
      <span class="res-bar"><i style="width:${Math.min(100, (value / cap) * 100).toFixed(0)}%"></i></span>
    </div>`;
  }).join('');
}

function render() {
  patch(document.getElementById('resbar')!, renderResources());
  const screen = document.getElementById('screen')!;
  const html = tab === 'base' ? renderBase(player) : tab === 'map' ? renderMap(player) : renderHeroes(player);
  screen.dataset.tab = tab;
  patch(screen, html);
  document.querySelectorAll<HTMLElement>('[data-action="tab"]').forEach((b) => b.classList.toggle('active', b.dataset.arg === tab));
  refreshSheet();
  updateTimers();
}

function switchTab(next: Tab) {
  if (next === tab) return;
  tab = next;
  closeSheet(true);
  render();
  const screen = document.getElementById('screen')!;
  if (tab === 'map') scrollMapToCurrent(screen);
  else screen.scrollTop = 0;
}

// ---------- Aktionen (alle Taps laufen über data-action) ----------
const actions: Record<string, (arg: string) => void> = {
  tab: (arg) => switchTab(arg as Tab),
  building: (arg) => openSheet(() => buildingSheet(player, arg as BuildingId)),
  upgrade: (arg) => {
    const block = P.startUpgrade(player, arg as BuildingId, Date.now());
    if (block) toast(BLOCK_TEXT[block]);
    else toast('Bau gestartet!');
    save();
    render();
  },
  stage: (arg) => openSheet(() => stageSheet(player, Number(arg))),
  battle: (arg) => {
    closeSheet(true);
    void startBattle(Number(arg));
  },
  hero: (arg) => openSheet(() => heroSheet(player, arg as HeroId)),
  train: (arg) => {
    if (P.upgradeHero(player, arg as HeroId)) {
      save();
      render();
    }
  },
};

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  actions[el.dataset.action!]?.(el.dataset.arg ?? '');
});

// Jede Sekunde: Produktion, Bau-Timer, Anzeige. patch() ändert nur, was sich wirklich geändert hat.
function tick() {
  if (game) return;
  const before = P.activeUpgrade(player);
  P.update(player, Date.now());
  if (before && !P.activeUpgrade(player)) {
    toast(`${before.name} ist fertig!`);
    save();
  }
  render();
}

// ---------- Kampf ----------
async function startBattle(stageId: number) {
  if (game) return;
  // Schriften vor dem Start laden, sonst zeichnet Phaser mit einer Ersatzschrift
  await Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('20px "Nunito Variable"')]).catch(() => undefined);
  const battle = createBattle({
    stageId,
    heroLevels: player.heroes,
    hpBonus: P.wallBonus(player),
    seed: (Math.random() * 2 ** 32) >>> 0,
  });
  if (import.meta.env.DEV) (window as unknown as { __battle: unknown }).__battle = battle; // für automatische Tests
  const layer = document.getElementById('battle-layer')!;
  layer.hidden = false;

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: layer,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#0d0f14',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    banner: false,
  });
  game.scene.add('battle', BattleScene, true, {
    battle,
    confirmFlee: () => confirm('Kampf abbrechen? Du bekommst keine Belohnung.'),
    onEnd: (outcome: BattleOutcome) => showResult(stageId, outcome),
  });
}

function showResult(stageId: number, outcome: BattleOutcome) {
  if (outcome === 'fled') return closeBattle();
  const won = outcome === 'won';
  const firstClear = won && stageId > player.stagesCleared;
  const reward: Resources | null = won ? P.completeStage(player, stageId) : null;
  save();
  const modal = document.createElement('div');
  modal.className = 'result';
  modal.innerHTML = `
    <div class="result-box ${won ? 'won' : 'lost'}">
      <div class="result-rays"></div>
      ${pic(won ? 'ui-trophy' : 'ui-skull', 'result-icon')}
      <h2>${won ? 'Sieg!' : 'Niederlage'}</h2>
      <p>${won
        ? firstClear ? `${STAGES[stageId - 1].name} ist befreit!` : 'Die Zone bleibt sicher.'
        : 'Die Zombies waren zu stark. Trainiere deine Helden und baue die Schutzmauer aus.'}</p>
      ${reward ? `<div class="chips center big">${costChips(reward, undefined, '+')}</div>` : ''}
      <div class="result-actions">
        ${won && stageId < STAGES.length ? `<button class="btn big primary" data-result="next">${pic('ui-swords')} Nächstes Level</button>` : ''}
        <div class="row">
          <button class="btn" data-result="retry">${won ? 'Nochmal' : 'Erneut versuchen'}</button>
          <button class="btn" data-result="close">${pic('ui-map', 'ic')} Karte</button>
        </div>
      </div>
    </div>`;
  document.getElementById('battle-layer')!.append(modal);
  modal.querySelectorAll<HTMLButtonElement>('[data-result]').forEach((btn) =>
    btn.addEventListener('click', () => {
      closeBattle();
      if (btn.dataset.result === 'retry') void startBattle(stageId);
      if (btn.dataset.result === 'next') void startBattle(stageId + 1);
    }),
  );
}

function closeBattle() {
  game?.destroy(true);
  game = null;
  const layer = document.getElementById('battle-layer')!;
  layer.innerHTML = '';
  layer.hidden = true;
  P.update(player, Date.now());
  tab = 'base'; // erzwingt Neuaufbau beim Wechsel zur Karte
  switchTab('map');
}

// ---------- Start ----------
render();
setInterval(tick, 1000);
setInterval(save, 15_000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
window.addEventListener('pagehide', save);
