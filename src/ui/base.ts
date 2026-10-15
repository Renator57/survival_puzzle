// Basis: Lager von oben mit antippbaren Gebäuden, dazu das Detailfenster zum Ausbauen.
import { BUILDINGS, type BuildingDef, type BuildingId } from '../core/content';
import * as P from '../core/player';
import { costChips, fmt, fmtTime, pic, RES_IMG, RES_NAMES, timer } from './shared';

const LAYOUT: Record<BuildingId, { x: number; y: number; w: number; img: string }> = {
  hq: { x: 50, y: 29, w: 31, img: 'b-hq' },
  farm: { x: 19, y: 49, w: 22, img: 'b-farm' },
  sawmill: { x: 81, y: 49, w: 22, img: 'b-sawmill' },
  warehouse: { x: 26, y: 75, w: 21, img: 'b-warehouse' },
  steelworks: { x: 74, y: 75, w: 24, img: 'b-steelworks' },
  wall: { x: 50, y: 91, w: 17, img: 'b-wall' },
};

const DECOR: [string, number, number, number][] = [
  ['deco-tree', 4, 6, 11], ['deco-tree2', 15, 3, 9], ['deco-tree', 86, 4, 10], ['deco-tree2', 96, 14, 9],
  ['deco-tree', 3, 36, 9], ['deco-tree2', 97, 33, 10], ['deco-tree', 2, 70, 10], ['deco-tree2', 97, 66, 9],
  ['deco-tree', 6, 95, 11], ['deco-tree2', 94, 95, 11], ['deco-rock', 90, 84, 7], ['deco-rock', 9, 83, 6],
  ['deco-tent', 22, 22, 11], ['deco-tent', 78, 22, 11], ['deco-barrel', 60, 63, 6], ['deco-barrel', 40, 63, 6],
  ['deco-log', 93, 60, 8], ['deco-car', 50, 51, 9],
];

export const BLOCK_TEXT: Record<Exclude<P.UpgradeBlock, null>, string> = {
  busy: 'Der Bautrupp ist gerade beschäftigt.',
  maxLevel: 'Baue zuerst das Hauptquartier aus.',
  locked: 'Noch gesperrt.',
  resources: 'Nicht genug Rohstoffe.',
};

function townSvg(player: P.Player) {
  const wall = player.buildings.wall.level;
  // Mauerring mit Tor unten: Ellipsenbogen von 100° bis 80° im Uhrzeigersinn
  const cx = 200, cy = 262, rx = 186, ry = 228;
  const pt = (deg: number) => [cx + rx * Math.cos((deg * Math.PI) / 180), cy + ry * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = pt(100);
  const [ex, ey] = pt(80);
  const ring = `M${sx.toFixed(1)},${sy.toFixed(1)} A${rx},${ry} 0 1 1 ${ex.toFixed(1)},${ey.toFixed(1)}`;
  const wallSvg = wall > 0
    ? `<path d="${ring}" stroke="#00000066" stroke-width="${12 + wall}" fill="none" transform="translate(0,4)"/>
       <path d="${ring}" stroke="#9a4b2c" stroke-width="${10 + wall}" fill="none"/>
       <path d="${ring}" stroke="#c26a43" stroke-width="${10 + wall}" fill="none" stroke-dasharray="16 3"/>`
    : `<path d="${ring}" stroke="#5a3d22" stroke-width="5" fill="none" stroke-dasharray="9 7" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <radialGradient id="grass" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="#5d7a3a"/><stop offset="1" stop-color="#2c3d1e"/></radialGradient>
      <radialGradient id="dirt" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#9b7b56"/><stop offset="0.8" stop-color="#7a5d3f"/><stop offset="1" stop-color="#7a5d3f" stop-opacity="0"/></radialGradient>
      <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffb347" stop-opacity="0.45"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="500" fill="url(#grass)"/>
    <ellipse cx="200" cy="265" rx="200" ry="245" fill="url(#dirt)"/>
    <path d="M200,500 L200,150 M200,300 Q120,300 76,250 M200,300 Q280,300 324,250 M200,380 Q140,380 104,375 M200,380 Q260,380 296,375"
      stroke="#b39371" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.55"/>
    <rect x="40" y="250" width="72" height="52" rx="6" fill="#6b4f2a"/>
    ${[0, 1, 2, 3, 4].map((i) => `<line x1="46" y1="${258 + i * 10}" x2="106" y2="${258 + i * 10}" stroke="#8fa64a" stroke-width="4" stroke-linecap="round"/>`).join('')}
    <ellipse cx="200" cy="300" rx="70" ry="50" fill="url(#glow)" class="fire-glow"/>
    ${wallSvg}
  </svg>`;
}

function buildingState(player: P.Player, b: BuildingDef) {
  const s = player.buildings[b.id];
  const block = P.upgradeBlock(player, b.id);
  return {
    s,
    block,
    upgrading: s.upgradeEndsAt !== null,
    locked: block === 'locked',
    ready: block === null,
  };
}

export function renderBase(player: P.Player): string {
  const active = P.activeUpgrade(player);
  const activeState = active && player.buildings[active.id];
  const total = active ? P.upgradeSeconds(active, activeState!.level) * 1000 : 0;

  const buildings = BUILDINGS.map((b) => {
    const { s, upgrading, locked, ready } = buildingState(player, b);
    const L = LAYOUT[b.id];
    return `<button class="bld ${locked ? 'locked' : ''} ${upgrading ? 'upgrading' : ''} ${s.level === 0 && !locked ? 'empty' : ''}"
        style="left:${L.x}%;top:${L.y}%;width:${L.w}%" data-action="building" data-arg="${b.id}">
      <span class="bld-shadow"></span>
      ${pic(L.img, 'bld-img')}
      ${upgrading ? pic('ui-crane', 'bld-crane') : ''}
      ${locked ? pic('ui-lock', 'bld-lock') : `<span class="bld-lvl">${s.level}</span>`}
      ${ready ? '<span class="bld-up">▲</span>' : ''}
      <span class="bld-name">${b.name}</span>
      ${upgrading ? timer(s.upgradeEndsAt!, 'bld-timer') : ''}
    </button>`;
  }).join('');

  const decor = DECOR.map(([name, x, y, w]) => `<img class="decor" src="img/${name}.webp" style="left:${x}%;top:${y}%;width:${w}%" alt="">`).join('');
  const cap = P.capacity(player);

  return `
    <div class="screen-head">
      <div><h1>Deine Basis</h1><p>Tippe ein Gebäude an, um es auszubauen.</p></div>
      <div class="pill">${pic('ui-muscle')} ${fmt(P.teamPower(player))}</div>
    </div>
    <div class="builder ${active ? 'busy' : ''}">
      ${pic('ui-hammer')}
      ${active
        ? `<div class="builder-main"><b>${active.name}</b> → Stufe ${activeState!.level + 1}
             <div class="bar"><i data-pstart="${activeState!.upgradeEndsAt! - total}" data-pend="${activeState!.upgradeEndsAt}"></i></div></div>
           ${timer(activeState!.upgradeEndsAt!, 'builder-time')}`
        : '<div class="builder-main"><b>Bautrupp bereit</b><span class="muted"> – wähle ein Gebäude</span></div>'}
    </div>
    <div class="town">
      ${townSvg(player)}
      ${decor}
      <img class="decor fire" src="img/deco-fire.webp" style="left:50%;top:59%;width:9%" alt="">
      ${buildings}
    </div>
    <div class="prod">
      ${P.RESOURCE_IDS.map((r) => `
        <div class="prod-item">${pic(RES_IMG[r])}
          <div><b>+${fmt(P.productionRate(player, r) * 3600)}/h</b><span>${RES_NAMES[r]} · max ${fmt(cap)}</span></div>
        </div>`).join('')}
    </div>`;
}

function effectRows(b: BuildingDef, level: number): [string, string, string][] {
  const next = level + 1;
  if (b.produces) {
    return [[`${RES_NAMES[b.produces]} pro Stunde`, `+${fmt(P.rateAt(b, level) * 3600)}`, `+${fmt(P.rateAt(b, next) * 3600)}`]];
  }
  if (b.id === 'warehouse') return [['Lagerkapazität', fmt(P.capacityAt(level)), fmt(P.capacityAt(next))]];
  if (b.id === 'wall') return [['Team-Lebenspunkte', `+${Math.round(P.wallBonusAt(level) * 100)} %`, `+${Math.round(P.wallBonusAt(next) * 100)} %`]];
  return [['Max. Gebäudestufe', String(level), String(next)]];
}

export function buildingSheet(player: P.Player, id: BuildingId): string {
  const b = BUILDINGS.find((x) => x.id === id)!;
  const { s, block, upgrading, locked } = buildingState(player, b);
  const L = LAYOUT[id];
  const maxed = s.level >= P.maxLevel(player, id) && id === 'hq';
  const cost = P.upgradeCost(b, s.level);
  const rows = effectRows(b, s.level)
    .map(([label, now, next]) => `<div class="effect-row"><span>${label}</span><b>${now}</b><span class="arrow">→</span><b class="next">${next}</b></div>`)
    .join('');
  const total = P.upgradeSeconds(b, s.level) * 1000;

  let action: string;
  if (locked) action = `<button class="btn big" disabled>${pic('ui-lock')} Ab Hauptquartier Stufe ${b.unlockHq}</button>`;
  else if (upgrading) {
    action = `<div class="upgrade-progress">
        <div class="bar big"><i data-pstart="${s.upgradeEndsAt! - total}" data-pend="${s.upgradeEndsAt}"></i></div>
        <p>${pic('ui-hourglass')} Fertig in ${timer(s.upgradeEndsAt!)}</p>
      </div>`;
  } else if (maxed) action = '<p class="hint center">Maximale Stufe erreicht.</p>';
  else {
    action = `
      <div class="row-between"><span class="label">Kosten</span>
        <span class="chips">${costChips(cost, player)}<span class="chip">${pic('ui-hourglass')}${fmtTime(P.upgradeSeconds(b, s.level))}</span></span></div>
      ${block && block !== 'resources' ? `<p class="hint center">${BLOCK_TEXT[block]}</p>` : ''}
      <button class="btn big primary" data-action="upgrade" data-arg="${id}" ${block ? 'disabled' : ''}>
        ${pic('ui-hammer')} ${s.level === 0 ? 'Bauen' : `Auf Stufe ${s.level + 1} ausbauen`}
      </button>`;
  }

  return `
    <div class="sheet-hero">
      ${pic(L.img, 'sheet-img')}
      <div>
        <p class="kicker">${s.level === 0 ? 'Noch nicht gebaut' : `Stufe ${s.level}`}</p>
        <h2>${b.name}</h2>
        <p class="muted">${b.text}</p>
      </div>
    </div>
    ${locked ? '' : `<div class="effects">${rows}</div>`}
    ${action}`;
}
