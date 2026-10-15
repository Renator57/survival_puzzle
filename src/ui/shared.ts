// Gemeinsame UI-Bausteine: Bilder, Zahlenformat, Kosten-Anzeige, Detailfenster (Bottom Sheet).
import type { Resources } from '../core/content';
import type { Player } from '../core/player';

export const img = (name: string) => `img/${name}.webp`;
export const pic = (name: string, cls = 'ic') => `<img class="${cls}" src="${img(name)}" alt="" draggable="false">`;

export const RES_IMG: Record<keyof Resources, string> = { food: 'res-food', wood: 'res-wood', steel: 'res-steel' };
export const RES_NAMES: Record<keyof Resources, string> = { food: 'Nahrung', wood: 'Holz', steel: 'Stahl' };

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n < 10_000) return n.toLocaleString('de-DE');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace('.', ',')}K`;
  return `${(n / 1_000_000).toFixed(2).replace('.', ',')}M`;
}

export function fmtTime(seconds: number): string {
  seconds = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

// Zeigt Kosten als Chips; fehlende Rohstoffe werden rot markiert.
export function costChips(cost: Resources, player?: Player, prefix = '') {
  return (Object.keys(cost) as (keyof Resources)[])
    .filter((r) => cost[r] > 0)
    .map((r) => {
      const missing = player && player.resources[r] < cost[r];
      return `<span class="chip ${missing ? 'missing' : ''}">${pic(RES_IMG[r])}${prefix}${fmt(cost[r])}</span>`;
    })
    .join('');
}

// Leeres Timer-Element; der Inhalt wird jede Sekunde von updateTimers() gesetzt.
export const timer = (endsAt: number, cls = 'timer') => `<span class="${cls}" data-ends="${endsAt}"></span>`;

export function updateTimers(now = Date.now()) {
  document.querySelectorAll<HTMLElement>('[data-ends]').forEach((el) => {
    el.textContent = fmtTime((Number(el.dataset.ends) - now) / 1000);
  });
  document.querySelectorAll<HTMLElement>('[data-pstart]').forEach((el) => {
    const start = Number(el.dataset.pstart);
    const end = Number(el.dataset.pend);
    el.style.width = `${Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)).toFixed(1)}%`;
  });
}

// Ersetzt den Inhalt nur, wenn sich das HTML wirklich geändert hat.
// So gehen Taps nicht verloren und Scroll-Positionen bleiben erhalten.
export function patch(el: HTMLElement, html: string): boolean {
  if (el.dataset.html === html) return false;
  el.innerHTML = html;
  el.dataset.html = html;
  return true;
}

export function toast(text: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.getElementById('toasts')!.append(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Detailfenster ----------
let sheet: { backdrop: HTMLElement; body: HTMLElement; build: () => string } | null = null;

export function openSheet(build: () => string) {
  closeSheet(true);
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = '<div class="sheet"><div class="sheet-grip"></div><div class="sheet-body"></div></div>';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  document.body.append(backdrop);
  sheet = { backdrop, body: backdrop.querySelector('.sheet-body')!, build };
  refreshSheet();
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

export function refreshSheet() {
  if (!sheet) return;
  patch(sheet.body, sheet.build());
}

export function closeSheet(instant = false) {
  if (!sheet) return;
  const { backdrop } = sheet;
  sheet = null;
  if (instant) return backdrop.remove();
  backdrop.classList.remove('open');
  setTimeout(() => backdrop.remove(), 250);
}

// ---------- App-Kontext ----------
// main.ts setzt Spieler und Funktionen; Bildschirme melden ihre Aktionen hier an.
export const app = {
  player: null as unknown as Player,
  save: () => {},
  render: () => {},
};

export const actions: Record<string, (arg: string) => void> = {};

export function timeAgo(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `vor ${h} h` : `vor ${Math.floor(h / 24)} T`;
}
