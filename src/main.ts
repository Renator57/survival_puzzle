// App-Rahmen: Navigation, Speichern, Aktionen. Die Bildschirme liegen in src/ui/, der Kampf in src/game/.
import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import type { BuildingId } from './core/content';
import * as P from './core/player';
import { BLOCK_TEXT, buildingSheet, renderBase } from './ui/base';
import { renderHeroes } from './ui/heroes';
import { isCampaignView, renderMap, scrollMapToCurrent, stageSheet } from './ui/map';
import { actions, app, closeSheet, fmt, img, openSheet, patch, pic, refreshSheet, RES_IMG, RES_NAMES, toast, updateTimers } from './ui/shared';
import { inBattle } from './ui/battles';
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
  if (tab === 'map' && isCampaignView()) scrollMapToCurrent(screen);
  else screen.scrollTop = 0;
}

// ---------- Aktionen (alle Taps laufen über data-action) ----------
app.player = player;
app.save = save;
app.render = render;
app.afterBattle = () => {
  tab = 'base'; // erzwingt Neuaufbau beim Wechsel zur Karte
  switchTab('map');
};
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
} satisfies Record<string, (arg: string) => void>);

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  audio.ui();
  actions[el.dataset.action!]?.(el.dataset.arg ?? '');
});

// Jede Sekunde: Produktion, Bau-Timer, Anzeige. patch() ändert nur, was sich wirklich geändert hat.
function tick() {
  if (inBattle()) return;
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

// ---------- Start ----------
// Feste Bilder in index.html auf eigene Grafiken umstellen, falls vorhanden
document.querySelectorAll<HTMLImageElement>('img[data-img]').forEach((el) => (el.src = img(el.dataset.img!)));
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
