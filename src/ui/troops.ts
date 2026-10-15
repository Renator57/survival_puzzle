// Truppen: Konter-Dreieck, Einheiten ausbilden, laufende Märsche und Kampfberichte.
import { UNITS, armySize, fighters, unitDef, type Army, type UnitId } from '../core/army';
import * as P from '../core/player';
import { getWorld, marchSlots, recallMarch, type March } from '../core/world';
import { actions, app, closeSheet, costChips, fmt, fmtTime, openSheet, pic, refreshSheet, timeAgo, timer, toast } from './shared';

const TRAIN_BLOCK: Record<Exclude<P.TrainBlock, null>, string> = {
  locked: 'Baue zuerst das passende Gebäude.',
  busy: 'Hier wird gerade schon ausgebildet.',
  capacity: 'Kein Platz mehr – baue die Kaserne/Werkstatt aus.',
  resources: 'Nicht genug Rohstoffe.',
  amount: 'Wähle eine Anzahl.',
};

export const unitImg = (id: string) => (id === 'zombie' ? 'zombie-walker' : `unit-${id}`);

export function armyChips(army: Army, prefix = '') {
  return fighters(army)
    .map((k) => `<span class="chip">${pic(unitImg(k))}${prefix}${fmt(army[k]!)}</span>`)
    .join('');
}

export function targetName(m: March, seed: number) {
  const world = getWorld(seed);
  const tile = world.byKey.get(m.target)!;
  if (tile.kind === 'res') return `Rohstofffeld Stufe ${tile.level}`;
  if (tile.kind === 'horde') return `Zombie-Horde Stufe ${tile.level}`;
  const bot = world.bots.find((b) => b.id === tile.botId)!;
  return `${bot.alliance ? `[${bot.alliance}] ` : ''}${bot.name}`;
}

export function marchRow(m: March, player: P.Player) {
  const status =
    m.state === 'out' ? ['Unterwegs', m.arriveAt] : m.state === 'working' ? ['Sammelt', m.workEndsAt!] : ['Rückkehr', m.returnAt!];
  const cargo = m.cargo.food + m.cargo.wood + m.cargo.steel;
  return `
    <div class="list-row">
      ${pic(m.kind === 'gather' ? 'unit-wagon' : 'ui-swords', 'row-img')}
      <div class="row-main">
        <b>${targetName(m, player.world.seed)}</b>
        <span class="muted">${status[0]} · ${timer(status[1] as number)}${cargo > 0 ? ` · ${fmt(cargo)} Fracht` : ''}</span>
        <span class="chips left small">${armyChips(m.units)}</span>
      </div>
      ${m.state !== 'back' ? `<button class="btn small" data-action="recall" data-arg="${m.id}">Zurück</button>` : ''}
    </div>`;
}

export function renderTroops(player: P.Player): string {
  const queues = (['barracks', 'workshop'] as const).map((q) => {
    const t = player.queues[q];
    const name = q === 'barracks' ? 'Kaserne' : 'Werkstatt';
    if (player.buildings[q].level === 0) return '';
    if (!t) return `<div class="queue idle">${pic(`b-${q}`)}<div><b>${name}</b><span class="muted">bereit für Ausbildung</span></div></div>`;
    return `<div class="queue">${pic(unitImg(t.unit))}
      <div class="row-main"><b>${t.amount} ${unitDef(t.unit).plural}</b>
        <div class="bar"><i data-pstart="${t.startAt}" data-pend="${t.endsAt}"></i></div></div>
      ${timer(t.endsAt, 'builder-time')}</div>`;
  }).join('');

  const cards = UNITS.map((u) => {
    const home = player.troops[u.id];
    const total = P.totalUnits(player, u.id);
    const locked = player.buildings[u.building].level === 0;
    return `
      <button class="unit-card ${locked ? 'locked' : ''}" data-action="unit" data-arg="${u.id}">
        ${pic(unitImg(u.id), 'unit-img')}
        <b>${u.plural}</b>
        <span class="unit-count">${fmt(home)}${total !== home ? `<small> / ${fmt(total)}</small>` : ''}</span>
        <span class="unit-stats"><span>⚔ ${u.attack}</span><span>🛡 ${u.defense}</span><span>❤ ${u.hp}</span><span>📦 ${u.load}</span></span>
        ${u.strongVs ? `<span class="strong">stark gegen ${pic(unitImg(u.strongVs), 'ic inline')}</span>` : '<span class="strong neutral">Sammeln</span>'}
        ${locked ? pic('ui-lock', 'unit-lock') : ''}
      </button>`;
  }).join('');

  const marches = player.marches.length
    ? player.marches.map((m) => marchRow(m, player)).join('')
    : '<p class="empty">Keine Märsche unterwegs. Schicke Trupps über die Weltkarte los.</p>';

  const reports = player.reports.length
    ? player.reports.slice(0, 12).map((r) => `
      <div class="list-row report ${r.win === true ? 'win' : r.win === false ? 'lose' : ''}">
        ${pic(r.win === true ? 'ui-trophy' : r.win === false ? 'ui-skull' : 'ui-scroll', 'row-img')}
        <div class="row-main">
          <b>${r.title}</b>
          <span class="muted">${r.text} · ${timeAgo(r.at)}</span>
          ${r.loot ? `<span class="chips left small">${costChips(r.loot, undefined, '+')}</span>` : ''}
          ${r.losses && armySize(r.losses) ? `<span class="chips left small losses">${armyChips(r.losses, '−')}</span>` : ''}
        </div>
      </div>`).join('')
    : '<p class="empty">Noch keine Berichte.</p>';

  return `
    <div class="screen-head">
      <div><h1>Truppen</h1><p>Bilde Soldaten aus und nutze ihre Konter.</p></div>
      <div class="pill">${pic('unit-brawler')} ${fmt(P.totalSoldiers(player))}/${fmt(P.soldierCap(player))}</div>
    </div>
    <div class="section">
      <div class="counter-card">
        <div class="tri">
          <span class="tri-node a">${pic('unit-brawler')}<small>Schläger</small></span>
          <span class="tri-node b">${pic('unit-rider')}<small>Fahrer</small></span>
          <span class="tri-node c">${pic('unit-shooter')}<small>Schützen</small></span>
          <svg viewBox="0 0 200 170" aria-hidden="true">
            <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ffc048"/></marker></defs>
            <path d="M118,32 L160,104" stroke="#ffc048" stroke-width="4" marker-end="url(#arr)"/>
            <path d="M142,138 L58,138" stroke="#ffc048" stroke-width="4" marker-end="url(#arr)"/>
            <path d="M40,104 L82,32" stroke="#ffc048" stroke-width="4" marker-end="url(#arr)"/>
          </svg>
        </div>
        <p>Jede Truppe macht <b>+50&nbsp;%</b> Schaden gegen die, auf die ihr Pfeil zeigt – und nur 75&nbsp;% gegen ihren Konter. Mische deine Armee passend zum Gegner!</p>
      </div>
    </div>
    ${queues ? `<div class="section">${queues}</div>` : ''}
    <div class="unit-grid">${cards}</div>
    <h2 class="section-title">${pic('ui-flag')} Märsche <small>${player.marches.length}/${marchSlots(player)}</small></h2>
    <div class="section list">${marches}</div>
    <h2 class="section-title">${pic('ui-scroll')} Berichte</h2>
    <div class="section list">${reports}</div>`;
}

// ---------- Ausbildungsfenster ----------
let trainUnit: UnitId = 'brawler';
let trainAmount = 10;

function unitSheet(): string {
  const player = app.player;
  const u = unitDef(trainUnit);
  const max = P.maxTrainable(player, u.id);
  const amount = Math.max(0, Math.min(trainAmount, Math.max(max, 0)));
  const block = P.trainBlock(player, u.id, amount);
  const strongVs = u.strongVs && unitDef(u.strongVs);
  const weakVs = UNITS.find((x) => x.strongVs === u.id);
  return `
    <div class="sheet-hero">
      ${pic(unitImg(u.id), 'sheet-img')}
      <div>
        <p class="kicker">${u.building === 'barracks' ? 'Kaserne' : 'Werkstatt'} · ${fmt(player.troops[u.id])} zu Hause</p>
        <h2>${u.plural}</h2>
        <p class="muted">${u.text}</p>
      </div>
    </div>
    <div class="effects stat-grid">
      <div><span>Angriff</span><b>${u.attack}</b></div><div><span>Verteidigung</span><b>${u.defense}</b></div>
      <div><span>Leben</span><b>${u.hp}</b></div><div><span>Tragkraft</span><b>${u.load}</b></div>
      <div><span>Tempo</span><b>${u.speed}×</b></div><div><span>Zeit/Stück</span><b>${u.seconds}s</b></div>
    </div>
    ${strongVs ? `<div class="counter-line">${pic('ui-swords')} Stark gegen <b>${strongVs.plural}</b> · schwach gegen <b>${weakVs?.plural}</b></div>` : ''}
    <div class="stepper">
      <button class="btn" data-action="train-amt" data-arg="-10">−10</button>
      <button class="btn" data-action="train-amt" data-arg="-1">−</button>
      <span class="stepper-val">${amount}</span>
      <button class="btn" data-action="train-amt" data-arg="1">+</button>
      <button class="btn" data-action="train-amt" data-arg="10">+10</button>
      <button class="btn" data-action="train-amt" data-arg="max">Max</button>
    </div>
    <div class="row-between"><span class="label">Kosten</span>
      <span class="chips">${costChips(P.trainCost(u.id, Math.max(1, amount)), player)}<span class="chip">${pic('ui-hourglass')}${fmtTime(P.trainSeconds(player, u.id, Math.max(1, amount)))}</span></span></div>
    <p class="hint center">${block ? TRAIN_BLOCK[block] : `Freie Plätze: ${fmt(P.freeSlots(player, u.id))}`}</p>
    <button class="btn big primary" data-action="train-go" ${block ? 'disabled' : ''}>${pic(`b-${u.building}`)} ${amount} ausbilden</button>`;
}

Object.assign(actions, {
  unit: (arg: string) => {
    trainUnit = arg as UnitId;
    trainAmount = Math.min(10, Math.max(1, P.maxTrainable(app.player, trainUnit)));
    openSheet(unitSheet);
  },
  'train-amt': (arg: string) => {
    const max = P.maxTrainable(app.player, trainUnit);
    trainAmount = arg === 'max' ? max : Math.max(0, Math.min(max, trainAmount + Number(arg)));
    refreshSheet();
  },
  'train-go': () => {
    const block = P.startTraining(app.player, trainUnit, trainAmount, Date.now());
    if (block) return toast(TRAIN_BLOCK[block]);
    toast(`${trainAmount} ${unitDef(trainUnit).plural} in Ausbildung`);
    closeSheet();
    app.save();
    app.render();
  },
  recall: (arg: string) => {
    recallMarch(app.player, Number(arg), Date.now());
    app.save();
    app.render();
  },
});
