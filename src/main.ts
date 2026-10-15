// App-Rahmen: Navigation, Speichern, Aktionen. Die Bildschirme liegen in src/ui/, der Kampf in src/game/.
import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import Phaser from 'phaser';
import { createBattle } from './core/battle';
import { STAGES, type BuildingId, type Resources } from './core/content';
import { battleTeam } from './core/heroes';
import * as P from './core/player';
import { BattleScene, HEIGHT, WIDTH, type BattleOutcome } from './game/BattleScene';
import { BLOCK_TEXT, buildingSheet, renderBase } from './ui/base';
import { renderHeroes } from './ui/heroes';
import { renderMap, scrollMapToCurrent, stageSheet } from './ui/map';
import { actions, app, closeSheet, costChips, fmt, openSheet, patch, pic, refreshSheet, RES_IMG, RES_NAMES, toast, updateTimers } from './ui/shared';
import { renderTroops } from './ui/troops';
import { mountWorld, renderWorld, updateWorldMarches } from './ui/world';
import { audio } from './audio';
import * as Q from './core/quests';
import { openQuests } from './ui/quests';
import './style.css';

const SAVE_KEY = 'survival-puzzle-save';
type Tab = 'base' | 'troops' | 'map' | 'world' | 'heroes';

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
  const diamonds = `<button class="res gem" data-action="tab" data-arg="heroes" title="Diamanten">
      ${pic('ui-gem', 'res-icon')}<span class="res-val">${fmt(player.diamonds)}</span></button>`;
  const gear = `<button class="res-gear" data-action="settings" aria-label="Einstellungen">⚙</button>`;
  return diamonds + P.RESOURCE_IDS.map((r) => {
    const value = player.resources[r];
    return `<div class="res ${value >= cap ? 'full' : ''}" title="${RES_NAMES[r]}">
      ${pic(RES_IMG[r], 'res-icon')}
      <span class="res-val">${fmt(value)}</span>
      <span class="res-bar"><i style="width:${Math.min(100, (value / cap) * 100).toFixed(0)}%"></i></span>
    </div>`;
  }).join('') + gear;
}

function render() {
  patch(document.getElementById('resbar')!, renderResources());
  const screen = document.getElementById('screen')!;
  const html =
    tab === 'base' ? renderBase(player)
    : tab === 'troops' ? renderTroops(player)
    : tab === 'map' ? renderMap(player)
    : tab === 'world' ? renderWorld(player)
    : renderHeroes(player);
  screen.dataset.tab = tab;
  if (patch(screen, html) && tab === 'world') mountWorld();
  if (tab === 'world') updateWorldMarches(player);
  if (tab === 'troops') player.reports.forEach((r) => (r.read = true));
  const unread = player.reports.filter((r) => !r.read).length;
  const claimable = Q.claimableCount(player, Date.now());
  const baseBadge = document.getElementById('badge-base')!;
  baseBadge.textContent = String(claimable);
  baseBadge.hidden = claimable === 0;
  const badge = document.getElementById('badge-troops')!;
  badge.textContent = String(unread);
  badge.hidden = unread === 0;
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
app.player = player;
app.save = save;
app.render = render;
app.reset = () => {
  localStorage.removeItem(SAVE_KEY);
  window.removeEventListener('pagehide', save);
  location.reload();
};

Object.assign(actions, {
  tab: (arg: string) => switchTab(arg as Tab),
  building: (arg: string) => openSheet(() => buildingSheet(player, arg as BuildingId)),
  upgrade: (arg: string) => {
    const block = P.startUpgrade(player, arg as BuildingId, Date.now());
    if (block) toast(BLOCK_TEXT[block]);
    else {
      audio.build();
      toast('Bau gestartet!');
    }
    save();
    render();
  },
  stage: (arg: string) => openSheet(() => stageSheet(player, Number(arg))),
  battle: (arg: string) => {
    closeSheet(true);
    void startBattle(Number(arg));
  },
} satisfies Record<string, (arg: string) => void>);

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  audio.ui();
  actions[el.dataset.action!]?.(el.dataset.arg ?? '');
});

// Jede Sekunde: Produktion, Bau-Timer, Anzeige. patch() ändert nur, was sich wirklich geändert hat.
function tick() {
  if (game) return;
  const before = P.activeUpgrade(player);
  const queues = { ...player.queues };
  const reportCount = player.reports.length ? player.reports[0].id : 0;
  P.update(player, Date.now());
  if (before && !P.activeUpgrade(player)) toast(`${before.name} ist fertig!`);
  for (const q of ['barracks', 'workshop'] as const) {
    const t = queues[q];
    if (t && !player.queues[q]) toast(`Ausbildung fertig: ${t.amount} Einheiten`);
  }
  const fresh = player.reports.filter((r) => r.id > reportCount);
  for (const r of fresh.reverse()) toast(r.title);
  if (before || fresh.length || queues.barracks || queues.workshop) save();
  render();
}

// ---------- Kampf ----------
async function startBattle(stageId: number) {
  if (game) return;
  // Schriften vor dem Start laden, sonst zeichnet Phaser mit einer Ersatzschrift
  await Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('20px "Nunito Variable"')]).catch(() => undefined);
  const battle = createBattle({
    stageId,
    team: battleTeam(player),
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
    tutorial: player.stats.battlesWon === 0,
  });
}

function showResult(stageId: number, outcome: BattleOutcome) {
  if (outcome === 'fled') return closeBattle();
  const won = outcome === 'won';
  const firstClear = won && stageId > player.stagesCleared;
  const result = won ? P.completeStage(player, stageId) : null;
  const reward: Resources | null = result && { food: result.food, wood: result.wood, steel: result.steel };
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
      ${reward ? `<div class="chips center big">${costChips(reward, undefined, '+')}${result!.diamonds ? `<span class="chip gem">${pic('ui-gem')}+${result!.diamonds}</span>` : ''}</div>` : ''}
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
// Ton erst nach der ersten Berührung (Browser-Regel)
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
P.update(player, Date.now());
render();
// Login-Belohnung bereit → Aufgaben-Fenster kurz nach dem Start zeigen
if (Q.loginReady(player, Date.now())) setTimeout(openQuests, 700);
setInterval(tick, 1000);
setInterval(save, 15_000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
window.addEventListener('pagehide', save);
