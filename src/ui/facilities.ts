// Oberfläche für Forschung, Lazarett, Beschleuniger und Inventar.
import { audio } from '../audio';
import * as F from '../core/facilities';
import * as P from '../core/player';
import { actions, app, closeSheet, costChips, fmt, fmtTime, openSheet, pic, refreshSheet, timer, toast } from './shared';
import { armyChips } from './troops';

const RESEARCH_BLOCK: Record<Exclude<F.ResearchBlock, null>, string> = {
  lab: 'Forschungszentrum zu niedrig',
  busy: 'Es wird schon geforscht',
  max: 'Voll erforscht',
  resources: 'Zu wenig Rohstoffe',
};

const bar = (start: number, end: number) => `<div class="bar"><i data-pstart="${start}" data-pend="${end}"></i></div>`;
export const speedBtn = (target: string) => `<button class="btn small speed" data-action="speedup" data-arg="${target}">${pic('item-speed5m')}</button>`;

// ---------- Forschung (im Fenster des Forschungszentrums) ----------
export function labSection(p: P.Player): string {
  if (p.buildings.lab.level === 0) return '<p class="tip">Baue das Forschungszentrum, um Technologien zu erforschen.</p>';
  const r = p.researching;
  const current = r
    ? `<div class="queue">${pic(F.techDef(r.tech).img)}<div class="row-main"><b>${F.techDef(r.tech).name} → Stufe ${F.techLevel(p, r.tech) + 1}</b>${bar(r.startAt, r.endsAt)}</div>
        ${timer(r.endsAt, 'builder-time')}${speedBtn('r')}</div>`
    : '';
  const rows = F.TECHS.map((t) => {
    const level = F.techLevel(p, t.id);
    const block = F.researchBlock(p, t.id);
    const locked = block === 'lab';
    return `<div class="list-row tech ${locked ? 'locked' : ''}">
      ${pic(t.img, 'row-img')}
      <div class="row-main"><b>${t.name} <small>${level}/${t.max}</small></b>
        <span class="muted">${level ? t.text(level * t.per) : 'Noch nicht erforscht'}${level < t.max ? ` → <span class="next">${t.text((level + 1) * t.per)}</span>` : ''}</span>
        ${locked ? `<span class="muted small">Ab Forschungszentrum Stufe ${t.lab}</span>`
          : level < t.max ? `<span class="chips left small">${costChips(F.techCost(t, level), p)}<span class="chip">${pic('ui-hourglass')}${fmtTime(F.techSeconds(t, level))}</span></span>` : ''}
      </div>
      ${level < t.max && !locked ? `<button class="btn small primary" data-action="research" data-arg="${t.id}" ${block ? 'disabled' : ''}>Forschen</button>` : ''}
    </div>`;
  }).join('');
  return `<p class="label">Forschung</p>${current}<div class="list">${rows}</div>`;
}

// ---------- Lazarett ----------
export function hospitalSection(p: P.Player): string {
  if (p.buildings.hospital.level === 0) return '<p class="tip">Baue das Lazarett: 70&nbsp;% deiner Verluste auf der Weltkarte überleben dann verletzt.</p>';
  const cap = F.hospitalCapacity(p);
  const count = F.woundedCount(p);
  const h = p.healing;
  const cost = F.healCost(p.wounded);
  return `
    <div class="row-between"><span class="label">Belegt</span><b>${fmt(count)} / ${fmt(cap)}</b></div>
    ${count ? `<div class="chips left">${armyChips(p.wounded)}</div>` : '<p class="muted center">Keine Verletzten.</p>'}
    ${h ? `<div class="queue">${pic('ui-bandage')}<div class="row-main"><b>Heilt ${armyChips(h.units)}</b>${bar(h.startAt, h.endsAt)}</div>
        ${timer(h.endsAt, 'builder-time')}${speedBtn('h')}</div>` : ''}
    ${count && !h ? `<div class="row-between"><span class="label">Heilkosten</span><span class="chips">${costChips(cost, p)}<span class="chip">${pic('ui-hourglass')}${fmtTime(F.healSeconds(p.wounded))}</span></span></div>
      <button class="btn big primary" data-action="heal" ${P.canAfford(p, cost) ? '' : 'disabled'}>${pic('ui-bandage')} Alle heilen</button>` : ''}`;
}

// ---------- Beschleunigen ----------
function parseTarget(arg: string): F.TimerTarget {
  const [kind, id] = arg.split(':');
  if (kind === 'b') return { kind: 'building', id: id as keyof P.Player['buildings'] };
  if (kind === 'q') return { kind: 'queue', id: id as 'barracks' | 'workshop' };
  if (kind === 'r') return { kind: 'research' };
  return { kind: 'heal' };
}

let speedTarget = '';
function speedSheet(): string {
  const p = app.player;
  const end = F.timerEnd(p, parseTarget(speedTarget));
  const now = Date.now();
  if (!end || end <= now) return `<div class="sheet-hero">${pic('ui-check', 'sheet-img')}<div><h2>Fertig!</h2></div></div>`;
  const items = (Object.keys(F.ITEMS) as F.ItemId[]).map((id) => {
    const n = p.items[id] ?? 0;
    return `<div class="list-row ${n ? '' : 'claimed'}">${pic(F.ITEMS[id].img, 'row-img')}
      <div class="row-main"><b>${F.ITEMS[id].name}</b><span class="muted">Du hast ${n}</span></div>
      <button class="btn small primary" data-action="use-item" data-arg="${id}" ${n ? '' : 'disabled'}>Benutzen</button></div>`;
  }).join('');
  const cost = F.instantCost(end - now);
  return `
    <div class="sheet-hero">${pic('item-speed1h', 'sheet-img')}<div><p class="kicker">Beschleunigen</p><h2>Noch ${timer(end)}</h2>
      <p class="muted">Beschleuniger bekommst du aus Aufgaben, Login, Truhen und dem Titan-Angriff.</p></div></div>
    <div class="list">${items}</div>
    <button class="btn big epicbtn" data-action="finish-now" ${p.diamonds >= cost ? '' : 'disabled'}>Sofort fertig ${pic('ui-gem')} ${cost}</button>`;
}

function inventorySheet(): string {
  const p = app.player;
  const items = (Object.keys(F.ITEMS) as F.ItemId[]).map((id) =>
    `<div class="inv-item">${pic(F.ITEMS[id].img, 'inv-img')}<b>${p.items[id] ?? 0}</b><span>${F.ITEMS[id].name}</span></div>`).join('');
  return `
    <div class="sheet-hero">${pic('ui-bag', 'sheet-img')}<div><p class="kicker">Rucksack</p><h2>Inventar</h2>
      <p class="muted">Beschleuniger benutzt du über den ⏱-Knopf bei laufenden Bauten, Ausbildung, Forschung und Heilung.</p></div></div>
    <div class="inv-grid">${items}</div>`;
}

export const totalItems = (p: P.Player) => Object.values(p.items).reduce((a, b) => a + (b ?? 0), 0);

function done(msg: string) {
  audio.reward();
  toast(msg);
  app.save();
  app.render();
  refreshSheet();
}

Object.assign(actions, {
  research: (arg: string) => {
    const block = F.startResearch(app.player, arg as F.TechId, Date.now());
    if (block) return toast(RESEARCH_BLOCK[block]);
    audio.build();
    done('Forschung gestartet!');
  },
  heal: () => {
    const block = F.startHealing(app.player, Date.now());
    if (block) return toast(block === 'resources' ? 'Zu wenig Rohstoffe' : block === 'busy' ? 'Es wird schon geheilt' : 'Keine Verletzten');
    done('Heilung gestartet!');
  },
  speedup: (arg: string) => {
    speedTarget = arg;
    openSheet(speedSheet);
  },
  'use-item': (arg: string) => {
    if (!F.useItem(app.player, parseTarget(speedTarget), arg as F.ItemId, Date.now())) return;
    P.update(app.player, Date.now());
    done('Beschleunigt!');
  },
  'finish-now': () => {
    if (!F.finishNow(app.player, parseTarget(speedTarget), Date.now())) return toast('Nicht genug Diamanten');
    P.update(app.player, Date.now());
    closeSheet();
    done('Sofort fertig!');
  },
  inventory: () => openSheet(inventorySheet),
});

