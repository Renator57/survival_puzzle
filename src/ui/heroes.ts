// Helden: Team, Sammlung, Beschwörung, Shop, Profil mit Talentbaum.
import { audio } from '../audio';
import { unitDef, type UnitId } from '../core/army';
import * as G from '../core/gear';
import * as H from '../core/heroes';
import * as P from '../core/player';
import { RARITY_COLORS } from '../game/colors';
import { actions, app, closeSheet, costChips, fmt, openSheet, pic, refreshSheet, toast } from './shared';

export const HERO_COLORS = ['#ef4b4b', '#3d8bfd', '#3fcf6b', '#ffc531', '#a66bff'];
const COLOR_NAMES = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila'];
const TALENT_ICONS: Record<H.Branch, string> = { attack: 'ui-swords', defense: 'ui-shield', command: 'ui-flag' };

type View = 'team' | 'collection' | 'gear' | 'summon' | 'shop';
let view: View = 'team';
let profileId: H.HeroId = 'rex';

const stars = (n: number, max = H.MAX_STARS) =>
  `<span class="stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;

const rarityStyle = (def: H.HeroDef) => `--hero:${HERO_COLORS[def.color]};--rar:${RARITY_COLORS[def.rarity]}`;

function buffText(b: H.TroopBuff): string {
  const pct = `+${Math.round(b.value * 100)} %`;
  const who = b.unit ? unitDef(b.unit).plural : 'Alle Truppen';
  switch (b.stat) {
    case 'attack': return `${who}: ${pct} Angriff`;
    case 'defense': return `${who}: ${pct} Verteidigung`;
    case 'hp': return `${who}: ${pct} Leben`;
    case 'load': return `${pct} Tragkraft`;
    case 'speed': return `${pct} Marschtempo`;
    case 'gather': return `${pct} Sammeltempo`;
  }
}

const buffIcon = (b: H.TroopBuff) =>
  b.unit ? `unit-${b.unit}` : b.stat === 'load' ? 'unit-wagon' : b.stat === 'speed' ? 'unit-rider' : b.stat === 'gather' ? 'res-wood' : 'ui-swords';

// Animiertes Porträt mit Aura je nach Seltenheit
export function portrait(def: H.HeroDef, cls = '') {
  return `<span class="portrait-fx r-${def.rarity} ${cls}" style="${rarityStyle(def)}">
    <span class="aura"></span><span class="sparkles"></span>
    ${pic(`hero-${def.id}`, 'portrait-img')}
  </span>`;
}

// ---------- Bildschirm ----------
export function renderHeroes(player: P.Player): string {
  const tabs = (['team', 'collection', 'gear', 'summon', 'shop'] as View[]).map((v) => {
    const label = { team: 'Team', collection: 'Sammlung', gear: 'Ausrüstung', summon: 'Rufen', shop: 'Shop' }[v];
    return `<button class="seg ${view === v ? 'active' : ''}" data-action="hero-view" data-arg="${v}">${label}</button>`;
  }).join('');
  const body = view === 'team' ? teamView(player) : view === 'collection' ? collectionView(player) : view === 'gear' ? gearView(player)
    : view === 'summon' ? summonView(player) : shopView();
  return `
    <div class="screen-head">
      <div><h1>Helden</h1><p>${H.ownedHeroes(player).length} von ${H.HEROES.length} gesammelt</p></div>
      <div class="pill">${pic('ui-muscle')} ${fmt(P.teamPower(player))}</div>
    </div>
    <div class="segments five">${tabs}</div>
    ${body}`;
}

function teamView(player: P.Player) {
  const slots = player.team.map((id, color) => {
    const def = H.heroDef(id);
    const s = player.heroes[id]!;
    return `<button class="team-slot r-${def.rarity} ${s.awakened ? 'awakened' : ''}" style="${rarityStyle(def)}" data-action="team-slot" data-arg="${color}">
      <span class="slot-color">${pic(`tile-${color}`)}</span>
      ${portrait(def, 'small')}
      <b>${def.name}</b>
      <span class="slot-lvl">Stufe ${s.level}</span>
      ${stars(s.stars)}
    </button>`;
  }).join('');

  const active = H.activeCombos(player.team);
  const duoRows = H.DUOS.map((duo) => {
    const on = duo.heroes.every((x) => player.team.includes(x));
    const owned = duo.heroes.every((x) => player.heroes[x]);
    return `<div class="combo ${on ? 'on' : ''}">
      <span class="combo-heroes">${duo.heroes.map((x) => `<span class="mini ${player.heroes[x] ? '' : 'missing'}">${pic(`hero-${x}`)}</span>`).join('')}</span>
      <div class="row-main"><b>${duo.name}</b><span class="muted">${H.bonusText(duo.bonus)}</span></div>
      <span class="combo-state">${on ? 'Aktiv' : owned ? 'Bereit' : '–'}</span>
    </div>`;
  }).join('');
  const factionRows = active.filter((c) => c.kind === 'faction').map((c) =>
    `<div class="combo on"><span class="combo-badge">${pic('ui-medal')}</span><div class="row-main"><b>${c.name}</b><span class="muted">${H.bonusText(c.bonus)}</span></div><span class="combo-state">Aktiv</span></div>`).join('');

  const buffs = H.troopBuffs(player);
  const buffLines: string[] = [];
  const unitLabel = (k: string) => (k === 'all' ? 'Alle' : unitDef(k as UnitId).plural);
  for (const stat of ['attack', 'defense', 'hp'] as const) {
    const label = { attack: 'Angriff', defense: 'Verteidigung', hp: 'Leben' }[stat];
    for (const [k, v] of Object.entries(buffs[stat])) if (v) buffLines.push(`<span class="chip">${pic(k === 'all' ? 'ui-swords' : `unit-${k}`)}${unitLabel(k)} +${Math.round(v * 100)} % ${label}</span>`);
  }
  if (buffs.load) buffLines.push(`<span class="chip">${pic('unit-wagon')}+${Math.round(buffs.load * 100)} % Tragkraft</span>`);
  if (buffs.speed) buffLines.push(`<span class="chip">${pic('unit-rider')}+${Math.round(buffs.speed * 100)} % Marschtempo</span>`);
  if (buffs.gather) buffLines.push(`<span class="chip">${pic('res-wood')}+${Math.round(buffs.gather * 100)} % Sammeltempo</span>`);

  return `
    <p class="section-hint">Ein Held pro Steinfarbe. Tippe einen Platz an, um zu tauschen.</p>
    <div class="team-row">${slots}</div>
    <h2 class="section-title">${pic('ui-medal')} Kombos</h2>
    <p class="section-hint">2–5 Helden derselben Fraktion geben Boni – bestimmte Duos zusätzlich.</p>
    <div class="section list">${factionRows}${duoRows}</div>
    <h2 class="section-title">${pic('unit-brawler')} Truppen-Boni auf der Weltkarte</h2>
    <div class="section"><div class="chips left wrap">${buffLines.join('') || '<span class="muted">Keine</span>'}</div></div>`;
}

function collectionView(player: P.Player) {
  const sorted = [...H.HEROES].sort((a, b) => H.RARITY[b.rarity].order - H.RARITY[a.rarity].order || a.color - b.color);
  return `<div class="collection">${sorted.map((def) => {
    const s = player.heroes[def.id];
    const inTeam = player.team.includes(def.id);
    return `<button class="hero-tile r-${def.rarity} ${s ? '' : 'locked'} ${s?.awakened ? 'awakened' : ''}" style="${rarityStyle(def)}" data-action="hero" data-arg="${def.id}">
      <span class="tile-rarity">${H.RARITY[def.rarity].name}</span>
      ${portrait(def, 'tiny')}
      <b>${s ? def.name : '???'}</b>
      ${s ? stars(s.stars) : `<span class="muted small">${def.obtain === 'shop' ? 'Shop' : 'Beschwörung'}</span>`}
      ${inTeam ? '<span class="in-team">Team</span>' : ''}
      ${s && canImprove(player, def.id) ? '<span class="bld-up">▲</span>' : ''}
    </button>`;
  }).join('')}</div>`;
}

function canImprove(player: P.Player, id: H.HeroId) {
  const s = player.heroes[id]!;
  return (s.stars < H.MAX_STARS && s.shards >= H.starCost(s.stars)) || H.spentPoints(s) < H.talentPoints(s);
}

function summonView(player: P.Player) {
  const featured = ['valkyra', 'ghost', 'luna', 'zero', 'athena'].map((id, i) =>
    `<span class="feat f${i}">${pic(`hero-${id}`)}</span>`).join('');
  return `
    <div class="summon-banner">
      <div class="banner-glow"></div>
      <div class="banner-heroes">${featured}</div>
      <div class="banner-text">
        <p class="kicker">Beschwörung</p>
        <h2>Legenden der Ruinen</h2>
        <p>Legendär garantiert in <b>${H.PITY - player.pity}</b> Beschwörungen</p>
      </div>
    </div>
    <div class="section rates">
      <span class="rate r-legendary">Legendär 5&nbsp;%</span>
      <span class="rate r-epic">Episch 25&nbsp;%</span>
      <span class="rate r-common">Gewöhnlich 70&nbsp;%</span>
    </div>
    <div class="summon-buttons">
      <button class="btn big epicbtn" data-action="summon" data-arg="1" ${player.diamonds < H.SUMMON_COST ? 'disabled' : ''}>
        <span>1× beschwören</span><span class="price">${pic('ui-gem')} ${H.SUMMON_COST}</span></button>
      <button class="btn big primary" data-action="summon" data-arg="10" ${player.diamonds < H.SUMMON_10_COST ? 'disabled' : ''}>
        <span>10× beschwören</span><span class="price">${pic('ui-gem')} ${fmt(H.SUMMON_10_COST)}</span></button>
    </div>
    <div class="section"><p class="tip">${pic('ui-gem')} Diamanten sind selten: erster Sieg pro Level (+15, Boss +50), große Zombie-Horden und Plünderungen auf der Weltkarte. Doppelte Helden werden zu Splittern für Sterne.</p></div>`;
}

const DIAMOND_PACKS = [
  { id: 'd1', diamonds: 300, price: '1,99 €' },
  { id: 'd2', diamonds: 1600, price: '9,99 €', tag: 'Beliebt' },
  { id: 'd3', diamonds: 3500, price: '19,99 €', tag: 'Bester Wert' },
];

function shopView() {
  const mythics = H.HEROES.filter((d) => d.obtain === 'shop').map((def) => {
    const owned = !!app.player.heroes[def.id];
    return `<div class="shop-hero r-mythic" style="${rarityStyle(def)}">
      ${portrait(def)}
      <div class="row-main">
        <p class="kicker">Mythisch · ${H.FACTIONS[def.faction]}</p>
        <b>${def.name}</b><span class="muted">${def.title}</span>
        <span class="chips left small">${def.buffs.map((b) => `<span class="chip">${pic(buffIcon(b))}${buffText(b)}</span>`).join('')}</span>
      </div>
      ${owned ? '<span class="owned-tag">Besitzt du</span>' : `<button class="btn primary" data-action="shop" data-arg="${def.id}">${def.price}</button>`}
    </div>`;
  }).join('');
  const packs = DIAMOND_PACKS.map((p) => `
    <button class="pack" data-action="shop" data-arg="${p.id}">
      ${p.tag ? `<span class="pack-tag">${p.tag}</span>` : ''}
      ${pic('ui-gem', 'pack-img')}<b>${fmt(p.diamonds)}</b><span class="btn small primary">${p.price}</span>
    </button>`).join('');
  return `
    <h2 class="section-title">${pic('ui-crystal')} Mythische Helden <small>nur hier</small></h2>
    <div class="section list">${mythics}</div>
    <h2 class="section-title">${pic('ui-gem')} Diamanten</h2>
    <div class="packs">${packs}</div>`;
}

// ---------- Ausrüstung ----------
const gearCard = (item: G.GearItem, extra = '') => `
  <span class="gear r-${item.rarity}" style="--rar:${RARITY_COLORS[item.rarity]}">
    ${pic(G.gearImg(item), 'gear-img')}<span class="gear-lvl">${item.level}</span>${extra}
  </span>`;

function gearSlots(s: H.HeroState): string {
  return `<div class="gear-slots">${G.SLOTS.map((slot) => {
    const item = s.gear?.[slot];
    return `<button class="gear-slot" data-action="gear-slot" data-arg="${slot}">
      ${item ? gearCard(item) : `<span class="gear empty">${pic(G.gearImg({ slot, rarity: 'common' }), 'gear-img')}<b>+</b></span>`}
      <small>${item ? `+${Math.round(G.gearValue(item) * 100)}\u00a0% ${G.SLOT_INFO[slot].statName}` : G.SLOT_INFO[slot].name}</small>
    </button>`;
  }).join('')}</div>`;
}

function awakenCard(p: P.Player, id: H.HeroId): string {
  const s = p.heroes[id]!;
  if (s.awakened) return '';
  const ready = G.canAwaken(p, id);
  return `<div class="awaken-card ${s.stars >= 5 ? '' : 'locked'}">
    ${pic('gear-helmet-legendary', 'row-img')}
    <div class="row-main"><b>Erwachen</b>
      <span class="muted">${s.stars >= 5 ? `+${G.AWAKEN_BONUS.stats * 100}\u00a0% Werte, +${G.AWAKEN_BONUS.skill * 100}\u00a0% Fähigkeit, +${G.AWAKEN_BONUS.buffs * 100}\u00a0% Truppen-Boni` : 'Ab 5 Sternen möglich'}</span>
      ${s.stars >= 5 ? `<span class="chips left small"><span class="chip ${s.shards >= G.AWAKEN_SHARDS ? '' : 'missing'}">${pic('ui-glowstar')}${s.shards}/${G.AWAKEN_SHARDS} Splitter</span>${costChips({ food: 0, wood: 0, steel: G.AWAKEN_STEEL }, p)}</span>` : ''}
    </div>
    ${s.stars >= 5 ? `<button class="btn small primary" data-action="awaken" ${ready ? '' : 'disabled'}>Erwecken</button>` : ''}
  </div>`;
}

let gearUid = 0;
let gearSlotSel: G.Slot = 'weapon';

function gearView(player: P.Player): string {
  const all = [
    ...player.gear.map((item) => ({ item, hero: null as H.HeroId | null })),
    ...Object.entries(player.heroes).flatMap(([id, s]) => G.SLOTS.filter((sl) => s?.gear?.[sl]).map((sl) => ({ item: s!.gear![sl]!, hero: id }))),
  ].sort((a, b) => ['legendary', 'epic', 'common'].indexOf(a.item.rarity) - ['legendary', 'epic', 'common'].indexOf(b.item.rarity) || b.item.level - a.item.level);
  const forge = G.SLOTS.map((slot) => `
    <button class="forge-btn" data-action="craft" data-arg="${slot}" ${player.resources.steel >= G.CRAFT_COST ? '' : 'disabled'}>
      ${pic(G.gearImg({ slot, rarity: 'epic' }), 'gear-img')}<b>${G.SLOT_INFO[slot].name}</b>
      <span class="chip">${pic('res-steel')}${fmt(G.CRAFT_COST)}</span>
    </button>`).join('');
  return `
    <div class="forge-card">
      <div class="forge-head">${pic('ui-forge', 'row-img')}<div class="row-main"><b>Schmiede</b>
        <span class="muted">Stelle ein zufälliges Teil her: 62&nbsp;% gewöhnlich, 30&nbsp;% episch, 8&nbsp;% legendär.</span></div></div>
      <div class="forge-row">${forge}</div>
    </div>
    <h2 class="section-title">${pic('ui-bag')} Inventar <small>${all.length} Teile</small></h2>
    ${all.length ? `<div class="gear-grid">${all.map(({ item, hero }) => `
      <button class="gear-tile" data-action="gear-item" data-arg="${item.uid}">
        ${gearCard(item, hero ? `<span class="gear-owner">${pic(`hero-${hero}`)}</span>` : '')}
        <small>${G.gearName(item)}</small>
      </button>`).join('')}</div>`
    : '<p class="empty" style="margin:0 12px">Noch keine Ausrüstung. Schmiede ein Teil oder hol dir welche aus Dungeons, dem Titan und Sterne-Truhen.</p>'}`;
}

function gearItemSheet(): string {
  const p = app.player;
  const found = G.findGear(p, gearUid);
  if (!found) return '<p class="muted">Teil nicht gefunden.</p>';
  const { item, hero } = found;
  const info = G.SLOT_INFO[item.slot];
  const maxed = item.level >= G.MAX_GEAR_LEVEL;
  const next = { ...item, level: item.level + 1 };
  const cost = G.upgradeCost(item);
  return `
    <div class="sheet-hero">${gearCard(item)}
      <div><p class="kicker" style="color:${RARITY_COLORS[item.rarity]}">${G.GEAR_RARITY[item.rarity].name} · ${info.name}</p><h2>${G.gearName(item)}</h2>
        <p class="muted">${hero ? `Angelegt bei ${H.heroDef(hero).name}` : 'Im Inventar'}</p></div></div>
    <div class="effects">
      <div class="effect-row"><span>${info.statName}</span><b>+${Math.round(G.gearValue(item) * 100)}\u00a0%</b>${maxed ? '' : `<span class="arrow">→</span><b class="next">+${Math.round(G.gearValue(next) * 100)}\u00a0%</b>`}</div>
      <div class="effect-row"><span>Stufe</span><b>${item.level}/${G.MAX_GEAR_LEVEL}</b></div>
    </div>
    ${maxed ? '' : `<button class="btn big primary" data-action="gear-upgrade" ${p.resources.steel >= cost ? '' : 'disabled'}>Aufwerten ${pic('res-steel')} ${fmt(cost)}</button>`}
    ${hero ? `<button class="btn big" data-action="gear-unequip" data-arg="${hero}:${item.slot}">Ablegen</button>` : `
      <p class="label">Anlegen bei</p>
      <div class="hero-picks">${H.ownedHeroes(p).map((d) => `<button class="hero-pick" data-action="gear-equip" data-arg="${d.id}">${pic(`hero-${d.id}`)}<small>${d.name}</small></button>`).join('')}</div>
      <button class="btn" data-action="gear-salvage">Zerlegen (+${fmt(Math.round(G.GEAR_RARITY[item.rarity].salvage * (1 + 0.2 * (item.level - 1))))} Stahl)</button>`}`;
}

function gearSlotSheet(): string {
  const p = app.player;
  const s = p.heroes[profileId]!;
  const current = s.gear?.[gearSlotSel];
  const options = p.gear.filter((g) => g.slot === gearSlotSel).sort((a, b) => G.gearValue(b) - G.gearValue(a));
  return `
    <div class="sheet-hero">${pic(G.gearImg({ slot: gearSlotSel, rarity: 'epic' }), 'sheet-img small')}
      <div><p class="kicker">${H.heroDef(profileId).name}</p><h2>${G.SLOT_INFO[gearSlotSel].name}</h2>
      <p class="muted">Gibt +${G.SLOT_INFO[gearSlotSel].statName}.</p></div></div>
    ${current ? `<div class="list-row">${gearCard(current)}<div class="row-main"><b>${G.gearName(current)}</b>
      <span class="muted">+${Math.round(G.gearValue(current) * 100)}\u00a0% · angelegt</span></div>
      <button class="btn small" data-action="gear-item" data-arg="${current.uid}">Details</button></div>` : ''}
    <p class="label">Im Inventar</p>
    <div class="list">${options.map((g) => `<div class="list-row">${gearCard(g)}
      <div class="row-main"><b>${G.gearName(g)}</b><span class="muted">+${Math.round(G.gearValue(g) * 100)}\u00a0% ${G.SLOT_INFO[g.slot].statName}</span></div>
      <button class="btn small primary" data-action="gear-put" data-arg="${g.uid}">Anlegen</button></div>`).join('') || '<p class="empty">Kein passendes Teil. Schmiede eins unter Helden → Ausrüstung.</p>'}</div>`;
}

// ---------- Profil ----------
function profileSheet(): string {
  const player = app.player;
  const def = H.heroDef(profileId);
  const s = player.heroes[profileId];
  const head = `
    <div class="profile-head r-${def.rarity} ${s?.awakened ? 'awakened' : ''}" style="${rarityStyle(def)}">
      ${portrait(def, 'big')}
      <div class="profile-info">
        <span class="rarity-badge">${H.RARITY[def.rarity].name}</span>${s?.awakened ? '<span class="awake-badge">Erwacht</span>' : ''}
        <h2>${def.name}</h2>
        <p class="muted">${def.title} · ${H.FACTIONS[def.faction]}</p>
        ${s ? stars(s.stars) : ''}
        <p class="color-line">${pic(`tile-${def.color}`, 'ic inline')} Steinfarbe ${COLOR_NAMES[def.color]}</p>
      </div>
    </div>`;
  const shown = s ?? H.newHeroState();
  const stats = H.heroStats(def, shown);
  const buffs = H.heroBuffs(def, shown);
  const duos = H.DUOS.filter((d) => d.heroes.includes(def.id));
  const info = `
    <div class="effects stat-grid">
      <div><span>Stufe</span><b>${shown.level}/${H.MAX_HERO_LEVEL}</b></div>
      <div><span>Angriff</span><b>${fmt(stats.attack)}</b></div>
      <div><span>Leben</span><b>${fmt(stats.hp)}</b></div>
    </div>
    <div class="skill-box">${pic('ui-sparkle')}
      <div><b>${def.skill.name}</b> <span class="muted">· ${stats.energy} Energie</span><p>${skillText(def, stats.skillPower)}</p></div></div>
    <div class="buff-box"><p class="label">Truppen-Boni</p>${buffs.map((b) => `<span class="chip">${pic(buffIcon(b))}${buffText(b)}</span>`).join('')}</div>
    ${duos.length ? `<div class="buff-box"><p class="label">Duos</p>${duos.map((d) => {
      const partner = H.heroDef(d.heroes.find((x) => x !== def.id)!);
      return `<span class="chip">${pic(`hero-${partner.id}`)}${d.name}: ${H.bonusText(d.bonus)}</span>`;
    }).join('')}</div>` : ''}`;

  if (!s) {
    return `${head}${info}
      <p class="tip">${pic(def.obtain === 'shop' ? 'ui-cart' : 'ui-portal')} ${def.obtain === 'shop'
        ? `Nur im Shop erhältlich (${def.price}).` : `In der Beschwörung erhältlich (${H.RARITY[def.rarity].name}).`}</p>
      <button class="btn big primary" data-action="hero-view" data-arg="${def.obtain === 'shop' ? 'shop' : 'summon'}">${def.obtain === 'shop' ? 'Zum Shop' : 'Zur Beschwörung'}</button>`;
  }

  const cost = H.heroUpgradeCost(s.level);
  const maxed = s.level >= H.MAX_HERO_LEVEL;
  const starNeed = H.starCost(s.stars);
  const free = H.talentPoints(s) - H.spentPoints(s);
  const inTeam = player.team.includes(def.id);
  const replaced = H.heroDef(player.team[def.color]);
  return `${head}${info}
    <div class="upgrade-row">
      <div class="up-card">
        <p class="label">Training</p>
        ${maxed ? '<p class="muted">Max. Stufe</p>' : `<span class="chips left small">${costChips(cost, player)}</span>
          <button class="btn primary" data-action="hero-train" ${P.canAfford(player, cost) ? '' : 'disabled'}>Stufe ${s.level + 1}</button>`}
      </div>
      <div class="up-card">
        <p class="label">Sterne</p>
        ${s.stars >= H.MAX_STARS ? '<p class="muted">Max. Sterne</p>' : `
          <div class="bar"><i style="width:${Math.min(100, (s.shards / starNeed) * 100)}%"></i></div>
          <span class="muted small">${s.shards}/${starNeed} Splitter</span>
          <button class="btn epicbtn" data-action="hero-star" ${s.shards >= starNeed ? '' : 'disabled'}>★ ${s.stars + 1}</button>`}
      </div>
    </div>
    ${gearSlots(s)}
    ${awakenCard(player, def.id)}
    <button class="btn big talentbtn" data-action="talents">${pic('ui-glowstar')} Talentbaum ${free > 0 ? `<span class="badge-inline">${free}</span>` : ''}</button>
    ${inTeam ? '<p class="hint center">Ist in deinem Team.</p>'
      : `<button class="btn big" data-action="team-set" data-arg="${def.id}">Ins Team (ersetzt ${replaced.name})</button>`}`;
}

function skillText(def: H.HeroDef, power: number) {
  const p = (x: number) => `${x.toFixed(1).replace('.', ',')}-fachen`;
  switch (def.skill.kind) {
    case 'strike': return `Verursacht ${p(power)} Schaden am vordersten Zombie.`;
    case 'heal': return `Heilt das Team um ${Math.round(power * 100)} %.`;
    case 'volley': return `Verursacht ${p(power)} Schaden an allen Zombies.`;
    case 'stun': return `Alle Zombies verlieren 2 Züge und nehmen ${p(power)} Schaden.`;
    case 'drain': return `Verursacht ${p(power)} Schaden und heilt das Team um 10 %.`;
  }
}

// ---------- Talentbaum ----------
const TALENT_BLOCK: Record<Exclude<H.TalentBlock, null>, string> = {
  points: 'Keine freien Punkte – trainiere den Helden.',
  max: 'Schon voll ausgebaut.',
  requires: 'Erst mehr Punkte in diesem Ast verteilen.',
};

function talentSheet(): string {
  const player = app.player;
  const def = H.heroDef(profileId);
  const s = player.heroes[profileId]!;
  const free = H.talentPoints(s) - H.spentPoints(s);
  const columns = (Object.keys(H.BRANCHES) as H.Branch[]).map((branch) => {
    const spent = H.spentPoints(s, branch);
    const nodes = H.TALENTS.filter((t) => t.branch === branch).sort((a, b) => a.tier - b.tier).map((t) => {
      const rank = s.talents[t.id] ?? 0;
      const block = H.talentBlock(s, t.id);
      const state = rank >= t.max ? 'maxed' : block === 'requires' ? 'locked' : block === null ? 'ready' : rank > 0 ? 'partial' : 'open';
      return `<button class="tnode ${state} tier${t.tier}" data-action="talent" data-arg="${t.id}">
        ${pic(TALENT_ICONS[branch], 'tnode-img')}
        <b>${t.name}</b>
        <span class="trank">${rank}/${t.max}</span>
        <small>${H.TALENT_TEXT[t.stat](t.perRank)}${t.max > 1 ? ' je Stufe' : ''}</small>
        ${t.requires ? `<span class="treq">ab ${t.requires}</span>` : ''}
      </button>`;
    }).join('<span class="tlink"></span>');
    return `<div class="tcol ${branch}"><div class="thead">${pic(TALENT_ICONS[branch])}<b>${H.BRANCHES[branch]}</b><span>${spent} Pkt.</span></div>${nodes}</div>`;
  }).join('');
  return `
    <div class="sheet-hero">
      ${portrait(def, 'small')}
      <div><p class="kicker">Talentbaum</p><h2>${def.name}</h2>
        <p class="muted">Freie Punkte: <b class="next">${free}</b> von ${H.talentPoints(s)} · 1 Punkt pro Stufe</p></div>
    </div>
    <div class="ttree">${columns}</div>
    <button class="btn" data-action="talent-reset" ${H.spentPoints(s) && player.diamonds >= H.TALENT_RESET_COST ? '' : 'disabled'}>
      Zurücksetzen ${pic('ui-gem')} ${H.TALENT_RESET_COST}</button>`;
}

// ---------- Team-Auswahl ----------
let slotColor = 0;
function teamPickSheet(): string {
  const player = app.player;
  const options = H.ownedHeroes(player).filter((d) => d.color === slotColor);
  return `
    <div class="sheet-hero">${pic(`tile-${slotColor}`, 'sheet-img small')}
      <div><p class="kicker">Steinfarbe ${COLOR_NAMES[slotColor]}</p><h2>Held wählen</h2>
      <p class="muted">Nur Helden dieser Farbe können diesen Platz besetzen.</p></div></div>
    <div class="list">${options.map((def) => {
      const s = player.heroes[def.id]!;
      const st = H.heroStats(def, s);
      const active = player.team[slotColor] === def.id;
      return `<div class="list-row pick-hero r-${def.rarity}" style="${rarityStyle(def)}">
        ${portrait(def, 'tiny')}
        <div class="row-main"><b>${def.name}</b><span class="muted">${H.RARITY[def.rarity].name} · ${H.FACTIONS[def.faction]} · Stufe ${s.level}</span>
          <span class="muted">⚔ ${fmt(st.attack)} · ❤ ${fmt(st.hp)}</span></div>
        ${active ? '<span class="owned-tag">Im Team</span>' : `<button class="btn small primary" data-action="team-set" data-arg="${def.id}">Wählen</button>`}
      </div>`;
    }).join('')}</div>
    ${options.length < H.HEROES.filter((d) => d.color === slotColor).length ? `<p class="tip">${pic('ui-portal')} Weitere ${COLOR_NAMES[slotColor].toLowerCase()}e Helden gibt es in der Beschwörung.</p>` : ''}`;
}

// ---------- Beschwörungs-Animation ----------
function playSummon(results: H.SummonResult[]) {
  const best = results.reduce((m, r) => Math.max(m, H.RARITY[H.heroDef(r.id).rarity].order), 0);
  audio.summon(best);
  const fx = document.createElement('div');
  fx.className = `summon-fx best-${best}`;
  fx.innerHTML = `
    <div class="portal">${pic('ui-portal', 'portal-img')}<span class="portal-flash"></span></div>
    <div class="reveal ${results.length > 1 ? 'grid' : 'single'}">
      ${results.map((r, i) => {
        const def = H.heroDef(r.id);
        return `<div class="rcard r-${def.rarity}" style="${rarityStyle(def)};--d:${1.3 + i * 0.22}s">
          <div class="rcard-inner">
            <div class="rcard-back">${pic('ui-portal')}</div>
            <div class="rcard-front">
              ${portrait(def, results.length > 1 ? 'tiny' : 'big')}
              <b>${def.name}</b>
              <span class="rr">${H.RARITY[def.rarity].name}</span>
              ${r.isNew ? '<span class="new-tag">NEU!</span>' : `<span class="shard-tag">+${r.shards} Splitter</span>`}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <button class="btn big primary summon-close" style="--d:${1.6 + results.length * 0.22}s">Weiter</button>`;
  document.body.append(fx);
  fx.querySelector('.summon-close')!.addEventListener('click', () => {
    fx.classList.add('closing');
    setTimeout(() => fx.remove(), 250);
  });
}

// ---------- Aktionen ----------
function gearDone(msg: string, sheet?: () => string) {
  audio.reward();
  toast(msg);
  app.save();
  app.render();
  if (sheet) openSheet(sheet);
  else refreshSheet();
}

Object.assign(actions, {
  'hero-view': (arg: string) => {
    view = arg as View;
    closeSheet(true);
    app.render();
  },
  hero: (arg: string) => {
    profileId = arg;
    openSheet(profileSheet);
  },
  'team-slot': (arg: string) => {
    slotColor = Number(arg);
    openSheet(teamPickSheet);
  },
  'team-set': (arg: string) => {
    if (H.setTeamSlot(app.player, arg)) {
      toast(`${H.heroDef(arg).name} ist jetzt im Team`);
      closeSheet();
      app.save();
      app.render();
    }
  },
  'hero-train': () => {
    if (P.upgradeHero(app.player, profileId)) {
      app.save();
      app.render();
    }
  },
  'gear-slot': (arg: string) => {
    gearSlotSel = arg as G.Slot;
    openSheet(gearSlotSheet);
  },
  'gear-put': (arg: string) => {
    if (G.equip(app.player, profileId, Number(arg))) gearDone('Angelegt!', profileSheet);
  },
  'gear-item': (arg: string) => {
    gearUid = Number(arg);
    openSheet(gearItemSheet);
  },
  'gear-upgrade': () => {
    if (G.upgradeGear(app.player, gearUid)) gearDone('Aufgewertet!');
  },
  'gear-unequip': (arg: string) => {
    const [hero, slot] = arg.split(':');
    if (G.unequip(app.player, hero, slot as G.Slot)) gearDone('Abgelegt.');
  },
  'gear-equip': (arg: string) => {
    if (G.equip(app.player, arg, gearUid)) gearDone(`Angelegt bei ${H.heroDef(arg).name}!`);
  },
  'gear-salvage': () => {
    const steel = G.salvage(app.player, gearUid);
    if (steel) {
      closeSheet();
      gearDone(`Zerlegt: +${fmt(steel)} Stahl`);
    }
  },
  craft: (arg: string) => {
    const item = G.craft(app.player, arg as G.Slot);
    if (!item) return toast('Nicht genug Stahl.');
    audio.summon(['common', 'epic', 'legendary'].indexOf(item.rarity));
    gearUid = item.uid;
    app.save();
    app.render();
    openSheet(gearItemSheet);
    toast(`${G.GEAR_RARITY[item.rarity].name}: ${G.gearName(item)}!`);
  },
  awaken: () => {
    if (!G.awaken(app.player, profileId)) return;
    playSummon([{ id: profileId, isNew: false, shards: 0 }]);
    toast(`${H.heroDef(profileId).name} ist erwacht!`);
    app.save();
    app.render();
    refreshSheet();
  },
  'hero-star': () => {
    if (H.starUp(app.player, profileId)) {
      toast(`${H.heroDef(profileId).name} erreicht ${app.player.heroes[profileId]!.stars} Sterne!`);
      app.save();
      app.render();
    }
  },
  talents: () => openSheet(talentSheet),
  talent: (arg: string) => {
    const block = H.learnTalent(app.player, profileId, arg);
    if (block) return toast(TALENT_BLOCK[block]);
    app.save();
    refreshSheet();
    app.render();
  },
  'talent-reset': () => {
    if (confirm(`Alle Talentpunkte zurücksetzen? Kostet ${H.TALENT_RESET_COST} Diamanten.`) && H.resetTalents(app.player, profileId)) {
      app.save();
      app.render();
    }
  },
  summon: (arg: string) => {
    const results = H.summon(app.player, Number(arg) as 1 | 10);
    if (!results) return toast('Nicht genug Diamanten.');
    app.save();
    app.render();
    playSummon(results);
  },
  shop: (arg: string) => {
    const hero = H.HEROES.find((d) => d.id === arg);
    const pack = DIAMOND_PACKS.find((p) => p.id === arg);
    openSheet(() => `
      <div class="sheet-hero">${hero ? portrait(hero, 'small') : pic('ui-gem', 'sheet-img')}
        <div><p class="kicker">Shop</p><h2>${hero ? hero.name : `${fmt(pack!.diamonds)} Diamanten`}</h2>
        <p class="muted">${hero ? hero.price : pack!.price}</p></div></div>
      <p class="tip">${pic('ui-shield')} Echtgeld-Käufe laufen über Google Play bzw. den App Store und werden vom Spiel-Server geprüft.
        Sie werden freigeschaltet, sobald der Mehrspieler-Server läuft.</p>
      <button class="btn big" disabled>${pic('ui-cart')} Kaufen – bald verfügbar</button>
      ${import.meta.env.DEV ? `<button class="btn big epicbtn" data-action="dev-grant" data-arg="${arg}">Entwickler-Test: gratis erhalten</button>` : ''}`);
  },
  'dev-grant': (arg: string) => {
    const pack = DIAMOND_PACKS.find((p) => p.id === arg);
    if (pack) app.player.diamonds += pack.diamonds;
    else if (H.grantShopHero(app.player, arg)) playSummon([{ id: arg, isNew: true, shards: 0 }]);
    closeSheet();
    app.save();
    app.render();
  },
});
