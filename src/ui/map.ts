// Einsatzkarte: Landschaft als SVG, Level als Orte entlang einer Straße (unten = Start).
import { STAGES, ZOMBIES, type ZombieKind } from '../core/content';
import { claimStarChest, isStageUnlocked, recommendedPower, STAR_CHESTS, stageReward, teamPower, totalStars, type Player } from '../core/player';
import { hasArt } from '../art';
import { bossTriesLeft } from '../core/events';
import { renderEvents } from './events';
import { actions, app, costChips, fmt, img, openSheet, pic, refreshSheet, toast } from './shared';

let mapView: 'campaign' | 'events' = 'campaign';
export const isCampaignView = () => mapView === 'campaign';

const W = 400;
const GAP = 150;
const TOP = 230;
const BOTTOM = 170;
const H = TOP + (STAGES.length - 1) * GAP + BOTTOM;

const ZONES = [
  { name: 'Vorstadt', from: 1, ground: '#3f5b2c', decor: ['deco-tree', 'deco-tree2', 'deco-ruin', 'deco-car', 'deco-rock'] },
  { name: 'Innenstadt', from: 7, ground: '#4a4b52', decor: ['deco-car', 'deco-barrier', 'deco-ruin', 'deco-warning', 'deco-barrel'] },
  { name: 'Flussufer', from: 13, ground: '#36522f', decor: ['deco-tree', 'deco-tree2', 'deco-rock', 'deco-log', 'deco-tent'] },
  { name: 'Hafen & Labor', from: 19, ground: '#5b5040', decor: ['deco-barrel', 'deco-warning', 'deco-rock', 'deco-car', 'deco-barrier'] },
];

const nodeX = (i: number) => W / 2 + Math.sin(i * 0.85) * 100;
const nodeY = (i: number) => H - BOTTOM - i * GAP;
const zoneOf = (stageId: number) => [...ZONES].reverse().find((z) => stageId >= z.from)!;
const zoneAtY = (y: number) => zoneOf(Math.max(1, Math.min(STAGES.length, Math.round((H - BOTTOM - y) / GAP) + 1)));
const RIVER_Y = nodeY(13) + GAP / 2;

// Straße: weiche Kurve durch alle Orte (Catmull-Rom → Bézier).
function smoothPath(points: [number, number][]) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const [p1, p2] = [points[i], points[i + 1]];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function roadXAt(y: number) {
  const t = (H - BOTTOM - y) / GAP;
  const i = Math.max(0, Math.min(STAGES.length - 2, Math.floor(t)));
  const f = Math.max(0, Math.min(1, t - i));
  return nodeX(i) * (1 - f) + nodeX(i + 1) * f;
}

// Landschaft wird nur einmal gebaut (ändert sich nie), der Nebel hängt vom Fortschritt ab.
let landscape = '';
function buildLandscape() {
  if (landscape) return landscape;
  let seed = 1234;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Boden mit Zonenfarben, weich ineinander übergehend
  const stops = ZONES.map((z) => {
    const offset = Math.max(0, Math.min(1, (nodeY(z.from - 1) + GAP * 0.6) / H));
    return `<stop offset="${offset.toFixed(3)}" stop-color="${z.ground}"/>`;
  }).reverse();
  let svg = `<defs>
      <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">${stops.join('')}</linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7fb8"/><stop offset="1" stop-color="#1f5d8a"/></linearGradient>
      <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#ground)"/>`;

  // Flecken für Struktur
  for (let i = 0; i < 160; i++) {
    const y = rand() * H;
    const light = rand() > 0.5;
    svg += `<ellipse cx="${(rand() * W).toFixed(0)}" cy="${y.toFixed(0)}" rx="${(20 + rand() * 50).toFixed(0)}" ry="${(10 + rand() * 25).toFixed(0)}"
      fill="${light ? '#ffffff' : '#000000'}" opacity="${(0.03 + rand() * 0.05).toFixed(2)}"/>`;
  }

  // Häuserblöcke in der Innenstadt
  const city = ZONES[1];
  const cityTop = nodeY(ZONES[2].from - 1) + GAP * 0.6;
  const cityBottom = nodeY(city.from - 1) + GAP * 0.6;
  for (let y = cityTop + 30; y < cityBottom - 40; y += 70) {
    for (let x = 10; x < W - 30; x += 64 + rand() * 20) {
      if (Math.abs(x + 25 - roadXAt(y + 20)) < 75 || rand() < 0.3) continue;
      const w = 34 + rand() * 22;
      const h = 30 + rand() * 20;
      svg += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="3" fill="#2e2f35"/>
        <rect x="${(x + 3).toFixed(0)}" y="${(y + 3).toFixed(0)}" width="${(w - 6).toFixed(0)}" height="${(h - 10).toFixed(0)}" rx="2" fill="#3c3d45"/>`;
    }
  }

  // Fluss mit Brücke
  let river = `M0,${RIVER_Y}`;
  for (let x = 0; x <= W; x += 40) river += ` Q${x + 20},${RIVER_Y + (x % 80 ? 14 : -14)} ${x + 40},${RIVER_Y}`;
  svg += `<path d="${river}" stroke="#8fc7e8" stroke-width="64" fill="none" opacity="0.35"/>
    <path d="${river}" stroke="url(#water)" stroke-width="52" fill="none"/>
    <path d="${river}" stroke="#ffffff" stroke-width="2" fill="none" stroke-dasharray="6 18" opacity="0.4"/>`;

  // Küste am Hafen
  const coastTop = nodeY(21) - 60;
  const coastBottom = nodeY(18) + 40;
  let coast = `M${W},${coastTop} L340,${coastTop}`;
  for (let y = coastTop; y <= coastBottom; y += 40) coast += ` Q${325 + (y % 80 ? -12 : 12)},${y + 20} 340,${y + 40}`;
  coast += ` L${W},${coastBottom + 40} Z`;
  svg += `<path d="${coast}" fill="url(#water)"/><path d="${coast}" fill="none" stroke="#8fc7e8" stroke-width="5" opacity="0.5"/>`;

  // Straße
  const pts: [number, number][] = [[nodeX(0), H], ...STAGES.map((_, i) => [nodeX(i), nodeY(i)] as [number, number]), [nodeX(STAGES.length - 1), 0]];
  const road = smoothPath(pts);
  svg += `<path d="${road}" stroke="#00000055" stroke-width="34" fill="none" stroke-linecap="round" transform="translate(0,4)"/>
    <path d="${road}" stroke="#56514b" stroke-width="30" fill="none" stroke-linecap="round"/>
    <path d="${road}" stroke="#35322f" stroke-width="24" fill="none" stroke-linecap="round"/>
    <path d="${road}" stroke="#e8c45a" stroke-width="2.5" fill="none" stroke-dasharray="10 12" opacity="0.8"/>`;

  // Brückengeländer über dem Fluss
  const bx = roadXAt(RIVER_Y);
  svg += `<rect x="${bx - 22}" y="${RIVER_Y - 34}" width="44" height="68" fill="#6b625a" rx="4"/>
    <rect x="${bx - 16}" y="${RIVER_Y - 34}" width="32" height="68" fill="#35322f"/>
    <line x1="${bx - 20}" y1="${RIVER_Y - 34}" x2="${bx - 20}" y2="${RIVER_Y + 34}" stroke="#a89c8f" stroke-width="3"/>
    <line x1="${bx + 20}" y1="${RIVER_Y - 34}" x2="${bx + 20}" y2="${RIVER_Y + 34}" stroke="#a89c8f" stroke-width="3"/>`;

  // Deko-Objekte abseits der Straße
  for (let i = 0; i < 150; i++) {
    const y = 30 + rand() * (H - 60);
    const x = 10 + rand() * (W - 50);
    const size = 26 + rand() * 20;
    if (Math.abs(x + size / 2 - roadXAt(y + size / 2)) < 50 + size / 2) continue;
    if (Math.abs(y + size / 2 - RIVER_Y) < 50) continue;
    if (x > 300 && y > coastTop - 30 && y < coastBottom + 60) continue;
    const zone = zoneAtY(y);
    const decor = zone.decor[Math.floor(rand() * zone.decor.length)];
    svg += `<image href="${img(decor)}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${size.toFixed(0)}" height="${size.toFixed(0)}" opacity="0.92"/>`;
  }
  svg += `<image href="${img('place-6')}" x="350" y="${nodeY(19) - 20}" width="44" height="44"/>`;
  svg += `<rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
  landscape = svg;
  return svg;
}

export function renderMap(player: Player): string {
  const segments = `<div class="segments two">
    <button class="seg ${mapView === 'campaign' ? 'active' : ''}" data-action="map-view" data-arg="campaign">Kampagne</button>
    <button class="seg ${mapView === 'events' ? 'active' : ''}" data-action="map-view" data-arg="events">Events${bossTriesLeft(player) > 0 ? '<span class="dot"></span>' : ''}</button>
  </div>`;
  if (mapView === 'events') {
    return `<div class="screen-head"><div><h1>Events</h1><p>Täglich neue Herausforderungen.</p></div>${segments}</div>${renderEvents(player)}`;
  }
  const firstLocked = player.stagesCleared + 1; // Index des ersten gesperrten Levels
  const fogY = firstLocked < STAGES.length ? nodeY(firstLocked) + 85 : -1;
  const fog = fogY > 0
    ? `<defs><linearGradient id="fog" gradientUnits="userSpaceOnUse" x1="0" y1="${fogY - 170}" x2="0" y2="${fogY}">
         <stop offset="0" stop-color="#0d0f14" stop-opacity="0.82"/><stop offset="1" stop-color="#0d0f14" stop-opacity="0"/></linearGradient></defs>
       <rect width="${W}" height="${fogY}" fill="url(#fog)"/>`
    : '';

  const nodes = STAGES.map((stage, i) => {
    const unlocked = isStageUnlocked(player, stage.id);
    const cleared = stage.id <= player.stagesCleared;
    const current = unlocked && !cleared;
    const boss = stage.waves.flat().includes('boss');
    const state = cleared ? 'cleared' : current ? 'current' : 'locked';
    return `<button class="node ${state} ${boss ? 'boss' : ''}" style="left:${((nodeX(i) / W) * 100).toFixed(2)}%;top:${((nodeY(i) / H) * 100).toFixed(3)}%"
        data-action="stage" data-arg="${stage.id}" aria-label="Level ${stage.id}">
      <span class="node-disc">${pic(`place-${Math.floor(i / 3) % 8}`, 'node-img')}</span>
      <span class="node-num">${stage.id}</span>
      ${cleared ? `<span class="node-stars">${[1, 2, 3].map((n) => `<i class="${n <= (player.stageStars[stage.id] ?? 1) ? 'on' : ''}">★</i>`).join('')}</span>` : ''}
      ${cleared ? `<span class="node-badge ok">${pic('ui-check')}</span>` : ''}
      ${!unlocked ? `<span class="node-badge">${pic('ui-lock')}</span>` : ''}
      ${boss ? `<span class="node-boss">${pic('zombie-boss')}</span>` : ''}
      ${current ? '<span class="node-cta">Kämpfen!</span>' : ''}
    </button>`;
  }).join('');

  const zones = ZONES.map((z, k) => {
    const y = nodeY(z.from - 1) + (k === 0 ? 100 : GAP / 2 + 6);
    // Neben die Straße setzen, damit kein Ort verdeckt wird
    const x = k === 0 ? 50 : roadXAt(y) > W / 2 ? 22 : 78;
    return `<div class="zone-label" style="left:${x}%;top:${((y / H) * 100).toFixed(3)}%"><span>Zone ${k + 1}</span>${z.name}</div>`;
  }).join('');

  return `
    <div class="screen-head">
      <div><h1>Einsatzkarte</h1><p>Erobere die Stadt Ort für Ort zurück.</p></div>
      <button class="pill star-pill ${chestReady(player) ? 'ready' : ''}" data-action="star-chests">${pic('ui-star')} ${totalStars(player)}/${STAGES.length * 3}${chestReady(player) ? `<span class="badge">!</span>` : ''}</button>
      ${segments}
    </div>
    <div class="map" style="aspect-ratio:${W}/${H}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${buildLandscape()}${fog}</svg>
      ${zones}
      ${nodes}
    </div>`;
}

export function scrollMapToCurrent(screen: HTMLElement) {
  const node = screen.querySelector<HTMLElement>('.node.current') ?? screen.querySelector<HTMLElement>('.node.cleared:last-of-type');
  if (!node) return;
  const target = node.offsetTop + (node.offsetParent as HTMLElement).offsetTop - screen.clientHeight / 2;
  screen.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
}

const ZOMBIE_NAMES = (kind: ZombieKind) => ZOMBIES[kind].name;
export const ZOMBIE_IMG: Record<ZombieKind, string> = {
  walker: 'zombie-walker', runner: 'zombie-runner', brute: 'zombie-brute', spitter: 'zombie-walker',
  shielder: 'zombie-brute', bomber: 'zombie-walker', healer: 'zombie-runner', boss: 'zombie-boss', titan: 'zombie-boss',
};
const ZOMBIE_BADGE: Partial<Record<ZombieKind, string>> = { shielder: 'ui-shield', bomber: 'ui-bomb', healer: 'ui-virus' };

export function foeHtml(k: ZombieKind) {
  // Eigenes Bild für diesen Zombie-Typ? Dann ohne Färbung und Symbol
  if (hasArt(`zombie-${k}`)) return `<span class="foe" title="${ZOMBIE_NAMES(k)}">${pic(`zombie-${k}`)}</span>`;
  return `<span class="foe ${k}" title="${ZOMBIE_NAMES(k)}">${pic(ZOMBIE_IMG[k])}${ZOMBIE_BADGE[k] ? pic(ZOMBIE_BADGE[k]!, 'foe-badge') : ''}</span>`;
}

const starsInline = (n: number) => `<span class="stars big">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;

const chestReady = (p: Player) => STAR_CHESTS.some((c, i) => !p.starChests.includes(i) && totalStars(p) >= c.stars);

function chestSheet(): string {
  const p = app.player;
  const stars = totalStars(p);
  return `
    <div class="sheet-hero">${pic('ui-gift', 'sheet-img')}<div><p class="kicker">Sterne sammeln</p><h2>Sterne-Truhen</h2>
      <p class="muted">Du hast <b>${stars}</b> von ${STAGES.length * 3} Sternen. Mehr Leben am Kampfende = mehr Sterne.</p></div></div>
    <div class="list">${STAR_CHESTS.map((c, i) => {
      const got = p.starChests.includes(i);
      const ready = !got && stars >= c.stars;
      return `<div class="list-row quest ${ready ? 'ready' : got ? 'claimed' : ''}">
        ${pic('ui-gift', 'row-img')}
        <div class="row-main"><b>${c.stars} Sterne</b>
          <div class="bar"><i style="width:${Math.min(100, (stars / c.stars) * 100)}%"></i></div>
          <span class="chips left small">${costChips(c.reward, undefined, '+')}<span class="chip gem">${pic('ui-gem')}+${c.reward.diamonds}</span></span></div>
        ${got ? '<span class="owned-tag">✓</span>' : `<button class="btn small ${ready ? 'primary' : ''}" data-action="claim-chest" data-arg="${i}" ${ready ? '' : 'disabled'}>Öffnen</button>`}
      </div>`;
    }).join('')}</div>`;
}

Object.assign(actions, {
  'map-view': (arg: string) => {
    mapView = arg as typeof mapView;
    app.render();
    const screen = document.getElementById('screen')!;
    if (mapView === 'campaign') scrollMapToCurrent(screen);
    else screen.scrollTop = 0;
  },
  'star-chests': () => openSheet(chestSheet),
  'claim-chest': (arg: string) => {
    if (!claimStarChest(app.player, Number(arg))) return;
    toast('Truhe geöffnet!');
    app.save();
    app.render();
    refreshSheet();
  },
});

export function stageSheet(player: Player, stageId: number): string {
  const stage = STAGES[stageId - 1];
  const unlocked = isStageUnlocked(player, stageId);
  const cleared = stageId <= player.stagesCleared;
  const reward = stageReward(player, stageId);
  const zone = zoneOf(stageId);
  const recommended = recommendedPower(stageId);
  const power = teamPower(player);
  const waves = stage.waves.map((wave, w) => `
    <div class="wave-row">
      <span class="wave-no">Welle ${w + 1}</span>
      <span class="wave-foes">${wave.map((k) => foeHtml(k)).join('')}</span>
    </div>`).join('');
  const specials = [...new Set(stage.waves.flat())].filter((k) => ZOMBIE_BADGE[k] || k === 'boss');
  const tips = specials.map((k) => `<p class="tip">${pic(ZOMBIE_BADGE[k] ?? 'zombie-boss')} <span><b>${ZOMBIES[k].name}:</b> ${ZOMBIES[k].text}</span></p>`).join('')
    + (stage.obstacles.crates ? `<p class="tip">${pic('b-warehouse')} <span><b>${stage.obstacles.crates} Kisten:</b> zerbrechen, wenn daneben Steine abgeräumt werden.</span></p>` : '')
    + (stage.obstacles.ice ? `<p class="tip">${pic('ui-ice')} <span><b>${stage.obstacles.ice} Eis-Steine:</b> nicht verschiebbar, tauen durch Treffer daneben auf.</span></p>` : '');
  return `
    <div class="sheet-hero stage-hero">
      ${pic(`place-${Math.floor((stageId - 1) / 3) % 8}`, 'sheet-img')}
      <div>
        <p class="kicker">Zone ${ZONES.indexOf(zone) + 1} · ${zone.name}</p>
        <h2>${stageId}. ${stage.name}</h2>
        <p class="muted">${cleared ? 'Bereits gesäubert – Wiederholen gibt ein Drittel der Beute.' : 'Noch von Zombies besetzt.'}</p>
      </div>
    </div>
    <div class="waves">${waves}</div>
    ${tips}
    ${cleared ? `<div class="row-between"><span class="label">Beste Wertung</span>${starsInline(player.stageStars[stageId] ?? 1)}</div>` : ''}
    <div class="row-between">
      <span class="label">Beute</span>
      <span class="chips">${costChips(reward, undefined, '+')}</span>
    </div>
    <div class="row-between">
      <span class="label">Empfohlene Stärke</span>
      <span class="chip ${power < recommended ? 'missing' : 'good'}">${pic('ui-muscle')}${fmt(recommended)} <small>(du: ${fmt(power)})</small></span>
    </div>
    ${unlocked
      ? `<button class="btn big ${cleared ? '' : 'danger'}" data-action="battle" data-arg="${stageId}">${pic('ui-swords')} ${cleared ? 'Erneut kämpfen' : 'Angreifen'}</button>`
      : `<button class="btn big" disabled>${pic('ui-lock')} Erst Level ${stageId - 1} schaffen</button>`}`;
}
