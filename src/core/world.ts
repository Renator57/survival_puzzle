// Weltkarte: Rohstofffelder, Zombie-Horden, Städte anderer Spieler und Märsche dorthin.
// Die Welt wird aus einem Seed erzeugt. Im Mehrspieler-Modus liefert später der Server
// dieselben Daten (und echte Spieler statt der simulierten Mitspieler).
import { armyLoad, armySize, armySpeed, fight, fighters, type Army, type UnitId } from './army';
import type { ResourceId, Resources } from './content';
import { troopBuffs } from './heroes';
import type { Player } from './player';
import { createRng, nextFloat, nextInt } from './rng';

export const WORLD_SIZE = 40;
export const SECONDS_PER_TILE = 4;
export const RESPAWN_MS = 20 * 60 * 1000;
export const SHIELD_MS = 30 * 60 * 1000;

export interface WorldTile {
  key: string;
  x: number;
  y: number;
  kind: 'res' | 'horde' | 'city';
  level: number;
  res?: ResourceId;
  botId?: number;
}

export interface Bot {
  id: number;
  key: string;
  name: string;
  alliance: string;
  level: number;
  army: Army;
  stash: Resources;
}

export interface Lake {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface World {
  tiles: WorldTile[];
  byKey: Map<string, WorldTile>;
  bots: Bot[];
  lakes: Lake[];
  home: { x: number; y: number };
}

export interface TileState {
  remaining?: number;
  respawnAt?: number;
  shieldUntil?: number;
}

export interface March {
  id: number;
  kind: 'gather' | 'attack';
  target: string;
  units: Army;
  departAt: number;
  arriveAt: number;
  travelMs: number;
  workEndsAt: number | null;
  returnAt: number | null;
  state: 'out' | 'working' | 'back';
  cargo: Resources;
}

export interface Report {
  id: number;
  at: number;
  title: string;
  text: string;
  win: boolean | null;
  loot?: Resources;
  losses?: Army;
  enemyLosses?: Army;
  read: boolean;
}

export const tileKey = (x: number, y: number) => `${x},${y}`;
const EMPTY: Resources = { food: 0, wood: 0, steel: 0 };

const NAME_A = ['Rost', 'Asche', 'Eisen', 'Nacht', 'Sturm', 'Wolf', 'Krähen', 'Blut', 'Stahl', 'Grau', 'Wild', 'Frost', 'Bunker', 'Schatten', 'Glut'];
const NAME_B = ['faust', 'jäger', 'zahn', 'herz', 'klinge', 'reiter', 'fuchs', 'bär', 'kralle', 'auge'];
const ALLIANCES = ['ASH', 'NRD', 'WLF', 'BRK', 'ZMB', 'TOX', ''];

const worlds = new Map<number, World>();

export function getWorld(seed: number): World {
  const cached = worlds.get(seed);
  if (cached) return cached;
  const rng = createRng(seed);
  const home = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
  const used = new Set<string>([tileKey(home.x, home.y)]);
  const dist = (x: number, y: number) => Math.hypot(x - home.x, y - home.y);

  const lakes: Lake[] = [];
  while (lakes.length < 5) {
    const lake = { x: 3 + nextFloat(rng) * (WORLD_SIZE - 6), y: 3 + nextFloat(rng) * (WORLD_SIZE - 6), rx: 1.5 + nextFloat(rng) * 2.5, ry: 1.2 + nextFloat(rng) * 2 };
    if (dist(lake.x, lake.y) < 7) continue;
    lakes.push(lake);
    for (let x = Math.floor(lake.x - lake.rx - 1); x <= lake.x + lake.rx + 1; x++)
      for (let y = Math.floor(lake.y - lake.ry - 1); y <= lake.y + lake.ry + 1; y++)
        if (((x + 0.5 - lake.x) / (lake.rx + 0.5)) ** 2 + ((y + 0.5 - lake.y) / (lake.ry + 0.5)) ** 2 <= 1) used.add(tileKey(x, y));
  }

  const freeCell = (minDist: number) => {
    for (;;) {
      const x = nextInt(rng, WORLD_SIZE);
      const y = nextInt(rng, WORLD_SIZE);
      const k = tileKey(x, y);
      if (used.has(k) || dist(x, y) < minDist) continue;
      used.add(k);
      return { x, y, d: dist(x, y) };
    }
  };

  const tiles: WorldTile[] = [];
  const bots: Bot[] = [];
  for (let i = 0; i < 28; i++) {
    const { x, y, d } = freeCell(4);
    const level = Math.max(1, Math.min(15, 1 + Math.floor(nextFloat(rng) * 4 + d / 4)));
    const total = Math.round(40 * level * 1.15 ** (level - 1));
    const w = [nextFloat(rng) + 0.2, nextFloat(rng) + 0.2, nextFloat(rng) + 0.2];
    const sum = w[0] + w[1] + w[2];
    const army: Army = {
      brawler: Math.round((total * w[0]) / sum),
      shooter: Math.round((total * w[1]) / sum),
      rider: Math.round((total * w[2]) / sum),
    };
    const f = level * 1.2 ** (level - 1);
    const name = NAME_A[nextInt(rng, NAME_A.length)] + NAME_B[nextInt(rng, NAME_B.length)];
    const bot: Bot = {
      id: i + 1, key: tileKey(x, y), name, alliance: ALLIANCES[nextInt(rng, ALLIANCES.length)], level, army,
      stash: { food: Math.round(500 * f), wood: Math.round(450 * f), steel: Math.round(120 * f) },
    };
    bots.push(bot);
    tiles.push({ key: bot.key, x, y, kind: 'city', level, botId: bot.id });
  }
  for (let i = 0; i < 150; i++) {
    const { x, y, d } = freeCell(2);
    const level = Math.max(1, Math.min(6, 1 + Math.floor(d / 5) + (nextFloat(rng) < 0.3 ? 1 : 0)));
    const r = nextFloat(rng);
    tiles.push({ key: tileKey(x, y), x, y, kind: 'res', level, res: r < 0.4 ? 'food' : r < 0.8 ? 'wood' : 'steel' });
  }
  for (let i = 0; i < 60; i++) {
    const { x, y, d } = freeCell(2);
    const level = Math.max(1, Math.min(12, 1 + Math.floor(d / 3.5) + (nextFloat(rng) < 0.3 ? 1 : 0)));
    tiles.push({ key: tileKey(x, y), x, y, kind: 'horde', level });
  }

  const world = { tiles, byKey: new Map(tiles.map((t) => [t.key, t])), bots, lakes, home };
  worlds.set(seed, world);
  return world;
}

// ---------- Werte der Felder ----------
export const resourceTotal = (level: number) => Math.round(800 * level * 1.35 ** (level - 1));
export const gatherRate = (level: number) => 4 + 3 * level; // pro Sekunde
export const hordeArmy = (level: number): Army => ({ zombie: Math.round(15 * level * 1.2 ** (level - 1)) });
export const hordeScale = (level: number) => 1 + 0.08 * (level - 1);
export function hordeReward(level: number): Resources {
  const f = level * 1.25 ** (level - 1);
  return { food: Math.round(150 * f), wood: Math.round(120 * f), steel: level >= 3 ? Math.round(40 * f) : 0 };
}

export const botOf = (world: World, tile: WorldTile) => world.bots.find((b) => b.id === tile.botId)!;
const stateOf = (player: Player, key: string): TileState => player.world.tiles[key] ?? {};

export function isAvailable(player: Player, tile: WorldTile, now: number): boolean {
  const s = stateOf(player, tile.key);
  if (tile.kind === 'city') return !s.shieldUntil || s.shieldUntil <= now;
  return !s.respawnAt || s.respawnAt <= now;
}

export function remaining(player: Player, tile: WorldTile, now: number): number {
  const s = stateOf(player, tile.key);
  if (s.respawnAt && s.respawnAt <= now) return resourceTotal(tile.level);
  return s.remaining ?? resourceTotal(tile.level);
}

export function distance(world: World, tile: WorldTile) {
  return Math.hypot(tile.x - world.home.x, tile.y - world.home.y);
}

export const travelMs = (world: World, tile: WorldTile, army: Army, speedBonus = 0) =>
  Math.round((distance(world, tile) * SECONDS_PER_TILE * 1000) / (armySpeed(army) * (1 + speedBonus)));

// Sammeltempo inkl. Helden-Bonus
export const gatherRateFor = (player: Player, level: number) => gatherRate(level) * (1 + troopBuffs(player).gather);

export const marchSlots = (player: Player) => 2 + Math.floor((player.buildings.hq.level - 1) / 4);

// ---------- Märsche ----------
export function sendMarch(player: Player, tileKeyStr: string, kind: March['kind'], units: Army, now: number): string | null {
  const world = getWorld(player.world.seed);
  const tile = world.byKey.get(tileKeyStr);
  if (!tile) return 'Unbekanntes Ziel.';
  if (armySize(units) === 0) return 'Wähle mindestens eine Einheit.';
  if (player.marches.length >= marchSlots(player)) return 'Alle Marsch-Plätze sind belegt.';
  for (const k of fighters(units)) {
    if (k === 'zombie' || (units[k] ?? 0) > player.troops[k]) return 'So viele Einheiten hast du nicht.';
  }
  if (!isAvailable(player, tile, now)) return tile.kind === 'city' ? 'Diese Stadt steht unter Schutzschild.' : 'Dieses Feld ist gerade leer.';
  if (kind === 'gather' && tile.kind !== 'res') return 'Hier kann man nicht sammeln.';
  if (kind === 'attack' && tile.kind === 'res') return 'Hier gibt es nichts anzugreifen.';
  if (player.marches.some((m) => m.target === tile.key && m.kind === 'gather' && kind === 'gather')) return 'Hier sammelt schon ein Trupp.';

  for (const k of fighters(units)) player.troops[k as UnitId] -= units[k]!;
  const travel = travelMs(world, tile, units, troopBuffs(player).speed);
  player.marches.push({
    id: player.nextId++, kind, target: tile.key, units: { ...units }, departAt: now, arriveAt: now + travel, travelMs: travel,
    workEndsAt: null, returnAt: null, state: 'out', cargo: { ...EMPTY },
  });
  return null;
}

// Marsch abbrechen: Trupp kehrt sofort um.
export function recallMarch(player: Player, id: number, now: number) {
  const m = player.marches.find((x) => x.id === id);
  if (!m || m.state === 'back') return;
  if (m.state === 'working') {
    // Bis jetzt Gesammeltes mitnehmen
    const world = getWorld(player.world.seed);
    const tile = world.byKey.get(m.target)!;
    const gathered = Math.floor(((now - m.arriveAt) / 1000) * gatherRateFor(player, tile.level));
    const amount = Math.min(gathered, m.cargo[tile.res!]);
    const state = (player.world.tiles[tile.key] ??= {});
    state.remaining = (state.remaining ?? 0) + (m.cargo[tile.res!] - amount);
    m.cargo[tile.res!] = amount;
    m.returnAt = now + m.travelMs;
  } else {
    m.travelMs = Math.max(1, now - m.departAt);
    m.returnAt = now + m.travelMs;
  }
  m.state = 'back';
}

function report(player: Player, r: Omit<Report, 'id' | 'read'>) {
  player.reports.unshift({ ...r, id: player.nextId++, read: false });
  player.reports.length = Math.min(player.reports.length, 30);
}

function arrive(player: Player, m: March, world: World) {
  const tile = world.byKey.get(m.target)!;
  const at = m.arriveAt;
  if (!isAvailable(player, tile, at)) {
    m.state = 'back';
    m.returnAt = at + m.travelMs;
    report(player, { at, title: 'Ziel verschwunden', text: 'Als dein Trupp ankam, war dort nichts mehr. Er kehrt um.', win: null });
    return;
  }
  const state = (player.world.tiles[tile.key] ??= {});

  if (m.kind === 'gather') {
    const amount = Math.min(armyLoad(m.units, troopBuffs(player).load), remaining(player, tile, at));
    state.remaining = remaining(player, tile, at) - amount;
    delete state.respawnAt;
    if (state.remaining <= 0) state.respawnAt = at + RESPAWN_MS;
    m.cargo[tile.res!] = amount; // reserviert, wird bei Rückkehr gutgeschrieben
    m.state = 'working';
    m.workEndsAt = at + Math.round((amount / gatherRateFor(player, tile.level)) * 1000);
    return;
  }

  // Angriff auf Horde oder Stadt
  const bot = tile.kind === 'city' ? botOf(world, tile) : null;
  const enemy = bot ? bot.army : hordeArmy(tile.level);
  const result = fight(m.units, enemy, bot ? 1 : hordeScale(tile.level), 1, troopBuffs(player));
  m.units = result.attackerLeft;
  m.state = 'back';
  m.returnAt = at + m.travelMs;
  const name = bot ? `${bot.alliance ? `[${bot.alliance}] ` : ''}${bot.name}` : `Zombie-Horde Stufe ${tile.level}`;

  if (!result.attackerWon) {
    report(player, {
      at, win: false, title: `Niederlage gegen ${name}`, losses: result.attackerLosses, enemyLosses: result.defenderLosses,
      text: 'Dein Trupp wurde zurückgeschlagen. Achte auf das Konter-Dreieck!',
    });
    return;
  }
  let loot: Resources;
  if (bot) {
    // Plündern: bis zur Tragkraft der Überlebenden, gleichmäßig über alle Rohstoffe
    const load = armyLoad(m.units, troopBuffs(player).load);
    const stashTotal = bot.stash.food + bot.stash.wood + bot.stash.steel;
    const f = Math.min(1, load / stashTotal);
    loot = { food: Math.floor(bot.stash.food * f), wood: Math.floor(bot.stash.wood * f), steel: Math.floor(bot.stash.steel * f) };
    state.shieldUntil = at + SHIELD_MS;
  } else {
    loot = hordeReward(tile.level);
    state.respawnAt = at + RESPAWN_MS;
  }
  m.cargo = loot;
  const diamonds = bot ? 3 : Math.floor(tile.level / 3);
  player.diamonds += diamonds;
  report(player, {
    at, win: true, title: `Sieg gegen ${name}`, loot, losses: result.attackerLosses, enemyLosses: result.defenderLosses,
    text: `${bot ? 'Die Stadt wurde geplündert und steht jetzt unter Schutzschild.' : 'Die Horde ist vernichtet.'}${diamonds ? ` +${diamonds} Diamanten!` : ''}`,
  });
}

// Bringt alle Märsche auf den Stand von `now`.
export function processMarches(player: Player, now: number) {
  const world = getWorld(player.world.seed);
  for (const m of [...player.marches]) {
    if (m.state === 'out' && m.arriveAt <= now) arrive(player, m, world);
    if (m.state === 'working' && m.workEndsAt! <= now) {
      m.state = 'back';
      m.returnAt = m.workEndsAt! + m.travelMs;
    }
    if (m.state === 'back' && m.returnAt! <= now) {
      for (const k of fighters(m.units)) player.troops[k as UnitId] += m.units[k]!;
      for (const r of ['food', 'wood', 'steel'] as const) player.resources[r] += m.cargo[r];
      player.marches.splice(player.marches.indexOf(m), 1);
      if (m.kind === 'gather') {
        const tile = world.byKey.get(m.target)!;
        report(player, {
          at: m.returnAt!, win: null, loot: m.cargo, title: 'Sammeltrupp zurück',
          text: `Gesammelt bei Feld Stufe ${tile.level} (${tile.x}:${tile.y}).`,
        });
      }
    }
  }
}

// Aktuelle Position eines Marsches (0 = Basis, 1 = Ziel) für die Anzeige.
export function marchProgress(m: March, now: number): number {
  if (m.state === 'out') return Math.min(1, (now - m.departAt) / Math.max(1, m.arriveAt - m.departAt));
  if (m.state === 'working') return 1;
  const start = m.returnAt! - m.travelMs;
  return Math.max(0, 1 - (now - start) / m.travelMs);
}
