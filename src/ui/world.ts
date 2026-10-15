// Weltkarte: verschiebbar/zoombar, Felder antippen → Trupps zum Sammeln oder Angreifen schicken.
import { UNITS, armyLoad, armyPower, armySize, fight, fighters, unitDef, type Army, type UnitId } from '../core/army';
import { troopBuffs } from '../core/heroes';
import * as P from '../core/player';
import {
  WORLD_SIZE, botOf, gatherRateFor, getWorld, hordeArmy, hordeReward, hordeScale, isAvailable, marchProgress, marchSlots,
  remaining, resourceTotal, sendMarch, travelMs, type World, type WorldTile,
} from '../core/world';
import { actions, app, closeSheet, costChips, fmt, fmtTime, img, openSheet, pic, refreshSheet, RES_NAMES, toast } from './shared';
import { armyChips, unitImg } from './troops';

const T = 72; // Pixel pro Feld
const RES_TILE_IMG = { food: 'w-field', wood: 'w-forest', steel: 'w-mine' } as const;
const RES_TILE_NAME = { food: 'Farmfeld', wood: 'Wald', steel: 'Stahlmine' } as const;

const view = { x: 0, y: 0, scale: 1, ready: false };

function hordeImg(level: number) {
  return level >= 10 ? 'zombie-boss' : level >= 6 ? 'zombie-brute' : level >= 3 ? 'zombie-runner' : 'zombie-walker';
}

const botLabel = (world: World, tile: WorldTile) => {
  const bot = botOf(world, tile);
  return `${bot.alliance ? `<em>[${bot.alliance}]</em> ` : ''}${bot.name}`;
};

// Boden einmal pro Welt erzeugen
const groundCache = new Map<number, string>();
function ground(world: World, seed: number) {
  const cached = groundCache.get(seed);
  if (cached) return cached;
  const size = WORLD_SIZE * T;
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let svg = `<svg class="world-ground" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <radialGradient id="wg" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#557a35"/><stop offset="0.7" stop-color="#3b5626"/><stop offset="1" stop-color="#26381a"/></radialGradient>
      <pattern id="grid" width="${T}" height="${T}" patternUnits="userSpaceOnUse"><path d="M${T},0 L0,0 0,${T}" fill="none" stroke="#000" stroke-opacity="0.08"/></pattern>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#wg)"/>`;
  for (let i = 0; i < 260; i++) {
    svg += `<ellipse cx="${(rand() * size).toFixed(0)}" cy="${(rand() * size).toFixed(0)}" rx="${(40 + rand() * 120).toFixed(0)}" ry="${(25 + rand() * 70).toFixed(0)}"
      fill="${rand() > 0.55 ? '#7a6a42' : '#ffffff'}" opacity="${(0.04 + rand() * 0.06).toFixed(2)}"/>`;
  }
  for (const l of world.lakes) {
    svg += `<ellipse cx="${(l.x + 0.5) * T}" cy="${(l.y + 0.5) * T}" rx="${(l.rx + 0.7) * T}" ry="${(l.ry + 0.7) * T}" fill="#8fc7e8" opacity="0.35"/>
      <ellipse cx="${(l.x + 0.5) * T}" cy="${(l.y + 0.5) * T}" rx="${(l.rx + 0.5) * T}" ry="${(l.ry + 0.5) * T}" fill="#2f7fb8"/>
      <ellipse cx="${(l.x + 0.3) * T}" cy="${(l.y + 0.2) * T}" rx="${(l.rx * 0.5) * T}" ry="${(l.ry * 0.3) * T}" fill="#ffffff" opacity="0.12"/>`;
  }
  // Deko auf freien Feldern
  const occupied = new Set(world.tiles.map((t) => t.key));
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(rand() * WORLD_SIZE);
    const y = Math.floor(rand() * WORLD_SIZE);
    if (occupied.has(`${x},${y}`) || Math.hypot(x - world.home.x, y - world.home.y) < 2) continue;
    if (world.lakes.some((l) => ((x + 0.5 - l.x) / (l.rx + 1)) ** 2 + ((y + 0.5 - l.y) / (l.ry + 1)) ** 2 <= 1)) continue;
    const deco = ['deco-tree', 'deco-tree2', 'deco-rock', 'deco-ruin', 'deco-car'][Math.floor(rand() * 5)];
    const sz = 28 + rand() * 18;
    svg += `<image href="${img(deco)}" x="${(x * T + rand() * (T - sz)).toFixed(0)}" y="${(y * T + rand() * (T - sz)).toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" opacity="0.85"/>`;
  }
  svg += `<rect width="${size}" height="${size}" fill="url(#grid)"/></svg>`;
  groundCache.set(seed, svg);
  return svg;
}

export function renderWorld(player: P.Player): string {
  const now = Date.now();
  const world = getWorld(player.world.seed);
  const tiles = world.tiles.map((t) => {
    if (!isAvailable(player, t, now) && t.kind !== 'city') return '';
    const pos = `left:${t.x * T}px;top:${t.y * T}px`;
    if (t.kind === 'res') {
      const rest = remaining(player, t, now) / resourceTotal(t.level);
      return `<button class="wt res ${t.res}" style="${pos}" data-action="tile" data-arg="${t.key}">
        ${pic(RES_TILE_IMG[t.res!], 'wt-img')}<span class="wt-lvl">${t.level}</span>
        ${rest < 1 ? `<span class="wt-bar"><i style="width:${(rest * 100).toFixed(0)}%"></i></span>` : ''}</button>`;
    }
    if (t.kind === 'horde') {
      return `<button class="wt horde" style="${pos}" data-action="tile" data-arg="${t.key}">
        ${pic(hordeImg(t.level), 'wt-img')}<span class="wt-lvl red">${t.level}</span></button>`;
    }
    const shielded = !isAvailable(player, t, now);
    return `<button class="wt city" style="${pos}" data-action="tile" data-arg="${t.key}">
      ${pic('w-city2', 'wt-img')}${shielded ? '<span class="wt-shield"></span>' : ''}
      <span class="wt-lvl blue">${t.level}</span><span class="wt-name">${botLabel(world, t)}</span></button>`;
  }).join('');

  const home = `<button class="wt home" style="left:${world.home.x * T}px;top:${world.home.y * T}px" data-action="tile" data-arg="home">
    ${pic('b-hq', 'wt-img')}<span class="wt-name you">Deine Basis</span></button>`;

  return `
    <div class="world-viewport" id="world-viewport">
      <div class="world-plane" id="world-plane" style="width:${WORLD_SIZE * T}px;height:${WORLD_SIZE * T}px">
        ${ground(world, player.world.seed)}
        ${tiles}
        ${home}
        <svg class="world-routes" id="world-routes" width="${WORLD_SIZE * T}" height="${WORLD_SIZE * T}"></svg>
        <div id="world-marches"></div>
      </div>
      <div class="world-hud">
        <div class="pill">${pic('ui-globe')} Welt · ${world.bots.length} Mitspieler</div>
        <div class="pill small">${pic('ui-flag')} ${player.marches.length}/${marchSlots(player)}</div>
      </div>
      <div class="world-controls">
        <button class="round-btn" data-action="world-zoom" data-arg="1.25">+</button>
        <button class="round-btn" data-action="world-zoom" data-arg="0.8">−</button>
        <button class="round-btn" data-action="world-home">${pic('ui-pin')}</button>
      </div>
    </div>`;
}

// ---------- Verschieben & Zoomen ----------
function applyView() {
  const plane = document.getElementById('world-plane');
  if (plane) plane.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function clampView(vp: HTMLElement) {
  const size = WORLD_SIZE * T * view.scale;
  view.x = Math.min(vp.clientWidth / 2, Math.max(vp.clientWidth / 2 - size, view.x));
  view.y = Math.min(vp.clientHeight / 2, Math.max(vp.clientHeight / 2 - size, view.y));
}

function centerOn(x: number, y: number) {
  const vp = document.getElementById('world-viewport');
  if (!vp) return;
  view.x = vp.clientWidth / 2 - (x + 0.5) * T * view.scale;
  view.y = vp.clientHeight / 2 - (y + 0.5) * T * view.scale;
  applyView();
}

function zoomAt(factor: number, cx: number, cy: number) {
  const next = Math.min(1.8, Math.max(0.35, view.scale * factor));
  const f = next / view.scale;
  view.x = cx - (cx - view.x) * f;
  view.y = cy - (cy - view.y) * f;
  view.scale = next;
}

// Wird aufgerufen, wenn die Weltkarte neu ins DOM kommt.
export function mountWorld() {
  const vp = document.getElementById('world-viewport');
  if (!vp) return;
  if (!view.ready) {
    view.ready = true;
    const home = getWorld(app.player.world.seed).home;
    centerOn(home.x, home.y);
  }
  applyView();
  if (vp.dataset.bound) return;
  vp.dataset.bound = '1';

  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  vp.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  vp.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      view.x += cur.x - prev.x;
      view.y += cur.y - prev.y;
      moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      if (moved > 8 && !vp.hasPointerCapture(e.pointerId)) vp.setPointerCapture(e.pointerId);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = vp.getBoundingClientRect();
      zoomAt(d / pinch, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      pinch = d;
      moved += 100;
    }
    clampView(vp);
    applyView();
  });
  const up = (e: PointerEvent) => pointers.delete(e.pointerId);
  vp.addEventListener('pointerup', up);
  vp.addEventListener('pointercancel', up);
  // Nach dem Ziehen keinen „Klick“ auf ein Feld auslösen
  vp.addEventListener('click', (e) => {
    if (moved > 8) {
      e.stopPropagation();
      moved = 0;
    }
  }, true);
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
    clampView(vp);
    applyView();
  }, { passive: false });
}

// Märsche: Linien und Trupp-Symbole jede Sekunde verschieben (weich per CSS-Übergang).
export function updateWorldMarches(player: P.Player) {
  const layer = document.getElementById('world-marches');
  const routes = document.getElementById('world-routes');
  if (!layer || !routes) return;
  const now = Date.now();
  const world = getWorld(player.world.seed);
  const hx = (world.home.x + 0.5) * T;
  const hy = (world.home.y + 0.5) * T;
  let lines = '';
  const ids = new Set<string>();
  for (const m of player.marches) {
    const tile = world.byKey.get(m.target)!;
    const tx = (tile.x + 0.5) * T;
    const ty = (tile.y + 0.5) * T;
    const color = m.kind === 'gather' ? '#7dd3fc' : '#ff6b5a';
    lines += `<line x1="${hx}" y1="${hy}" x2="${tx}" y2="${ty}" stroke="${color}" stroke-width="4" stroke-dasharray="10 8" stroke-linecap="round" opacity="0.85"/>`;
    const p = marchProgress(m, now);
    const id = String(m.id);
    ids.add(id);
    let el = layer.querySelector<HTMLElement>(`[data-march="${id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = `march ${m.kind}`;
      el.dataset.march = id;
      el.style.left = `${hx + (tx - hx) * p}px`;
      el.style.top = `${hy + (ty - hy) * p}px`;
      layer.append(el);
    }
    const icon = m.kind === 'gather' ? (m.units.wagon ? 'unit-wagon' : unitImg(fighters(m.units)[0] ?? 'brawler')) : 'ui-swords';
    const html = `${pic(icon)}${m.state === 'working' ? '<span class="march-tag">sammelt</span>' : ''}`;
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
    el.classList.toggle('back', m.state === 'back');
    el.style.left = `${hx + (tx - hx) * p}px`;
    el.style.top = `${hy + (ty - hy) * p}px`;
  }
  routes.innerHTML = lines;
  layer.querySelectorAll<HTMLElement>('[data-march]').forEach((el) => {
    if (!ids.has(el.dataset.march!)) el.remove();
  });
}

// ---------- Feld-Fenster mit Truppenauswahl ----------
let sheetTile = '';
let selection: Army = {};

function picker(player: P.Player, units: UnitId[]) {
  return units.map((id) => {
    const have = player.troops[id];
    const sel = selection[id] ?? 0;
    return `<div class="pick-row ${have === 0 ? 'none' : ''}">
      ${pic(unitImg(id), 'row-img')}
      <div class="row-main"><b>${unitDef(id).plural}</b><span class="muted">${fmt(have)} verfügbar</span></div>
      <button class="btn small" data-action="sel" data-arg="${id}:-" ${sel === 0 ? 'disabled' : ''}>−</button>
      <span class="pick-val">${fmt(sel)}</span>
      <button class="btn small" data-action="sel" data-arg="${id}:+" ${sel >= have ? 'disabled' : ''}>+</button>
      <button class="btn small" data-action="sel" data-arg="${id}:all" ${have === 0 ? 'disabled' : ''}>Alle</button>
    </div>`;
  }).join('');
}

function sheetFor(): string {
  const player = app.player;
  const now = Date.now();
  const world = getWorld(player.world.seed);

  if (sheetTile === 'home') {
    return `<div class="sheet-hero">${pic('b-hq', 'sheet-img')}<div><p class="kicker">${world.home.x}:${world.home.y}</p><h2>Deine Basis</h2>
      <p class="muted">Von hier ziehen deine Trupps los.</p></div></div>
      <div class="row-between"><span class="label">Zu Hause</span><span class="chips">${armyChips(player.troops) || '–'}</span></div>
      <button class="btn big" data-action="tab" data-arg="base">${pic('b-hq')} Zur Basis</button>`;
  }

  const tile = world.byKey.get(sheetTile)!;
  const coords = `${tile.x}:${tile.y}`;
  const available = isAvailable(player, tile, now);
  const slotsFree = player.marches.length < marchSlots(player);
  const size = armySize(selection);
  const buffs = troopBuffs(player);
  const travel = size ? travelMs(world, tile, selection, buffs.speed) / 1000 : 0;
  const pickerUnits = UNITS.map((u) => u.id);

  if (tile.kind === 'res') {
    const rest = remaining(player, tile, now);
    const load = armyLoad(selection, buffs.load);
    const amount = Math.min(load, rest);
    const busy = player.marches.some((m) => m.target === tile.key);
    return `
      <div class="sheet-hero">${pic(RES_TILE_IMG[tile.res!], 'sheet-img')}<div>
        <p class="kicker">Stufe ${tile.level} · ${coords}</p><h2>${RES_TILE_NAME[tile.res!]}</h2>
        <p class="muted">${fmt(rest)} ${RES_NAMES[tile.res!]} übrig · ${fmt(gatherRateFor(player, tile.level))}/s Sammeltempo</p></div></div>
      <p class="tip">${pic('unit-wagon')} Tipp: Sammelwagen tragen ${unitDef('wagon').load} – so viel wie ${Math.round(unitDef('wagon').load / unitDef('brawler').load)} Schläger.</p>
      <div class="picker">${picker(player, pickerUnits)}</div>
      <div class="effects">
        <div class="effect-row"><span>Tragkraft</span><b>${fmt(load)}</b></div>
        <div class="effect-row"><span>Ertrag</span><b class="next">+${fmt(amount)} ${RES_NAMES[tile.res!]}</b></div>
        <div class="effect-row"><span>Dauer (hin, sammeln, zurück)</span><b>${size ? fmtTime(travel * 2 + amount / gatherRateFor(player, tile.level)) : '–'}</b></div>
      </div>
      <button class="btn big primary" data-action="send" data-arg="gather" ${!size || !slotsFree || busy || !available ? 'disabled' : ''}>
        ${pic('unit-wagon')} ${busy ? 'Hier sammelt schon ein Trupp' : !slotsFree ? 'Alle Marsch-Plätze belegt' : 'Sammeln schicken'}</button>`;
  }

  // Horde oder Stadt
  const bot = tile.kind === 'city' ? botOf(world, tile) : null;
  const enemy = bot ? bot.army : hordeArmy(tile.level);
  const scale = bot ? 1 : hordeScale(tile.level);
  const prediction = size ? fight(selection, enemy, scale, 1, buffs) : null;
  const reward = bot ? bot.stash : hordeReward(tile.level);
  const main = bot ? fighters(bot.army).sort((a, b) => (bot.army[b] ?? 0) - (bot.army[a] ?? 0))[0] : null;
  const counter = main && UNITS.find((u) => u.strongVs === main);
  const head = bot
    ? `${pic('w-city2', 'sheet-img')}<div><p class="kicker">Mitspieler · Stufe ${tile.level} · ${coords}</p><h2>${botLabel(world, tile)}</h2>
        <p class="muted">${bot.alliance ? `Allianz [${bot.alliance}] · ` : ''}Macht ${fmt(armyPower(enemy) * 10)}</p></div>`
    : `${pic(hordeImg(tile.level), 'sheet-img')}<div><p class="kicker">Stufe ${tile.level} · ${coords}</p><h2>Zombie-Horde</h2>
        <p class="muted">${fmt(enemy.zombie!)} Zombies · Macht ${fmt(armyPower(enemy, scale) * 10)}</p></div>`;
  const shieldText = bot && !available ? `<p class="hint center">${pic('ui-shield')} Steht unter Schutzschild – später wieder angreifbar.</p>` : '';

  return `
    <div class="sheet-hero">${head}</div>
    <div class="row-between"><span class="label">Gegner</span><span class="chips">${armyChips(enemy)}</span></div>
    ${counter ? `<p class="tip">${pic('ui-search')} Viele ${unitDef(main as UnitId).plural} – schicke ${counter.plural}!</p>` : ''}
    <div class="row-between"><span class="label">${bot ? 'Plünderbar' : 'Beute'}</span><span class="chips">${costChips(reward, undefined, '+')}</span></div>
    ${shieldText}
    <div class="picker">${picker(player, pickerUnits.filter((u) => u !== 'wagon'))}</div>
    <div class="effects">
      <div class="effect-row"><span>Marschzeit</span><b>${size ? fmtTime(travel) : '–'}</b></div>
      <div class="effect-row"><span>Prognose</span>${prediction
        ? prediction.attackerWon
          ? `<b class="next">Sieg</b><span class="muted">Verluste ${fmt(armySize(prediction.attackerLosses))}</span>`
          : '<b class="bad">Niederlage</b>'
        : '<b>–</b>'}</div>
    </div>
    <button class="btn big danger" data-action="send" data-arg="attack" ${!size || !slotsFree || !available ? 'disabled' : ''}>
      ${pic('ui-swords')} ${!slotsFree ? 'Alle Marsch-Plätze belegt' : 'Angreifen'}</button>`;
}

function defaultSelection(tile: WorldTile | undefined) {
  const t = app.player.troops;
  if (!tile) return {};
  if (tile.kind === 'res') {
    if (t.wagon > 0) return { wagon: t.wagon };
    return { rider: t.rider, brawler: t.brawler };
  }
  return { brawler: t.brawler, shooter: t.shooter, rider: t.rider };
}

Object.assign(actions, {
  tile: (arg: string) => {
    sheetTile = arg;
    selection = arg === 'home' ? {} : defaultSelection(getWorld(app.player.world.seed).byKey.get(arg));
    openSheet(sheetFor);
  },
  sel: (arg: string) => {
    const [id, op] = arg.split(':') as [UnitId, string];
    const have = app.player.troops[id];
    const step = Math.max(1, Math.round(have / 10));
    const cur = selection[id] ?? 0;
    selection[id] = op === 'all' ? have : Math.max(0, Math.min(have, cur + (op === '+' ? step : -step)));
    refreshSheet();
  },
  send: (arg: string) => {
    const units = Object.fromEntries(fighters(selection).map((k) => [k, selection[k]])) as Army;
    if (arg === 'attack') delete units.wagon;
    const error = sendMarch(app.player, sheetTile, arg as 'gather' | 'attack', units, Date.now());
    if (error) return toast(error);
    toast(arg === 'gather' ? 'Sammeltrupp unterwegs!' : 'Angriff gestartet!');
    closeSheet();
    app.save();
    app.render();
  },
  'world-zoom': (arg: string) => {
    const vp = document.getElementById('world-viewport');
    if (!vp) return;
    zoomAt(Number(arg), vp.clientWidth / 2, vp.clientHeight / 2);
    clampView(vp);
    applyView();
  },
  'world-home': () => {
    const home = getWorld(app.player.world.seed).home;
    centerOn(home.x, home.y);
  },
});

