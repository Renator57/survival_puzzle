// App-Rahmen: Menüs (Basis, Karte, Helden) als HTML, der Kampf läuft in Phaser.
import Phaser from 'phaser';
import { createBattle } from './core/battle';
import {
  BUILDINGS,
  HEROES,
  MAX_HERO_LEVEL,
  STAGES,
  ZOMBIES,
  heroStats,
  heroUpgradeCost,
  type BuildingId,
  type HeroId,
  type Resources,
} from './core/content';
import * as P from './core/player';
import { BattleScene, HEIGHT, TILE_COLORS, WIDTH, type BattleOutcome } from './game/BattleScene';
import './style.css';

const SAVE_KEY = 'survival-puzzle-save';
const RES_ICONS: Record<keyof Resources, string> = { food: '🌾', wood: '🪵', steel: '⚙️' };
const RES_NAMES: Record<keyof Resources, string> = { food: 'Nahrung', wood: 'Holz', steel: 'Stahl' };
const HERO_ICONS: Record<HeroId, string> = { rex: '🪓', mara: '💉', ivy: '🎯', bolt: '⚡', nyx: '🗡️' };

type Tab = 'base' | 'map' | 'heroes';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

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

// ---------- Formatierung ----------
function fmt(n: number): string {
  n = Math.floor(n);
  if (n < 10_000) return n.toLocaleString('de-DE');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace('.', ',')}K`;
  return `${(n / 1_000_000).toFixed(2).replace('.', ',')}M`;
}

function fmtTime(seconds: number): string {
  seconds = Math.ceil(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function costHtml(cost: Resources) {
  return (Object.keys(cost) as (keyof Resources)[])
    .filter((r) => cost[r] > 0)
    .map((r) => `<span class="cost ${player.resources[r] < cost[r] ? 'missing' : ''}">${RES_ICONS[r]} ${fmt(cost[r])}</span>`)
    .join('');
}

function toast(text: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Rohstoffleiste ----------
function renderResources() {
  const cap = P.capacity(player);
  $('#resbar').innerHTML = P.RESOURCE_IDS.map((r) => {
    const rate = P.productionRate(player, r) * 3600;
    const full = player.resources[r] >= cap;
    return `<div class="res ${full ? 'full' : ''}" title="${RES_NAMES[r]}">
      <span class="res-icon">${RES_ICONS[r]}</span>
      <span class="res-val">${fmt(player.resources[r])}</span>
      <span class="res-rate">${rate > 0 ? `+${fmt(rate)}/h` : '—'}</span>
    </div>`;
  }).join('');
}

// ---------- Basis ----------
const BLOCK_TEXT: Record<Exclude<P.UpgradeBlock, null>, string> = {
  busy: 'Bautrupp beschäftigt',
  maxLevel: 'HQ zuerst ausbauen',
  locked: 'Gesperrt',
  resources: 'Zu wenig Rohstoffe',
};

function renderBase() {
  const now = Date.now();
  const active = P.activeUpgrade(player);
  const screen = $('#screen');
  screen.innerHTML = `
    <section class="hero-banner base-banner">
      <div>
        <h1>Deine Basis</h1>
        <p>${active ? `🔨 Baut: <b>${active.name}</b>` : '🔨 Bautrupp bereit'} · 📦 Lager: ${fmt(P.capacity(player))}</p>
      </div>
      <div class="power">💪 ${fmt(P.teamPower(player))}</div>
    </section>
    <div class="cards">
      ${BUILDINGS.map((b) => {
        const s = player.buildings[b.id];
        const block = P.upgradeBlock(player, b.id);
        const upgrading = s.upgradeEndsAt !== null;
        const cost = P.upgradeCost(b, s.level);
        const locked = block === 'locked';
        let effect = '';
        if (b.produces) effect = `+${fmt(b.rate! * Math.max(1, s.level) * 1.18 ** Math.max(0, s.level - 1) * 3600)} ${RES_ICONS[b.produces]}/h`;
        if (b.id === 'warehouse') effect = `Kapazität ${fmt(P.capacity(player))}`;
        if (b.id === 'wall') effect = `+${Math.round(P.wallBonus(player) * 100)} % Team-LP`;
        if (b.id === 'hq') effect = `Max. Gebäudestufe ${s.level}`;
        const remaining = upgrading ? (s.upgradeEndsAt! - now) / 1000 : 0;
        const total = P.upgradeSeconds(b, s.level);
        return `
          <article class="card building ${locked ? 'locked' : ''} ${upgrading ? 'upgrading' : ''}">
            <div class="b-icon">${b.icon}</div>
            <div class="b-main">
              <div class="b-head"><h3>${b.name}</h3><span class="lvl">${s.level === 0 ? 'Neu' : `Stufe ${s.level}`}</span></div>
              <p class="muted">${locked ? `Ab Hauptquartier Stufe ${b.unlockHq}` : b.text}</p>
              ${effect && !locked ? `<p class="effect">${effect}</p>` : ''}
              ${upgrading
                ? `<div class="progress"><div style="width:${Math.min(100, (1 - remaining / total) * 100)}%"></div></div>
                   <p class="timer" data-ends="${s.upgradeEndsAt}">⏳ ${fmtTime(remaining)}</p>`
                : locked ? '' : `
                  <div class="b-actions">
                    <div class="costs">${costHtml(cost)} <span class="cost time">⏱ ${fmtTime(P.upgradeSeconds(b, s.level))}</span></div>
                    <button class="btn primary" data-build="${b.id}" ${block ? 'disabled' : ''}>
                      ${s.level === 0 ? 'Bauen' : 'Ausbauen'}
                    </button>
                  </div>
                  ${block && block !== 'resources' ? `<p class="hint">${BLOCK_TEXT[block]}</p>` : ''}`}
            </div>
          </article>`;
      }).join('')}
    </div>`;

  screen.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const block = P.startUpgrade(player, btn.dataset.build as BuildingId, Date.now());
      if (block) toast(BLOCK_TEXT[block]);
      save();
      render();
    }),
  );
}

// ---------- Karte ----------
function renderMap() {
  const screen = $('#screen');
  screen.innerHTML = `
    <section class="hero-banner map-banner">
      <div><h1>Einsatzkarte</h1><p>Säubere die Stadt Zone für Zone.</p></div>
      <div class="power">⭐ ${player.stagesCleared} / ${STAGES.length}</div>
    </section>
    <div class="cards">
      ${STAGES.map((stage) => {
        const unlocked = P.isStageUnlocked(player, stage.id);
        const cleared = stage.id <= player.stagesCleared;
        const boss = stage.waves.flat().includes('boss');
        const reward = P.stageReward(player, stage.id);
        const enemies = stage.waves.flat().length;
        return `
          <article class="card stage ${unlocked ? '' : 'locked'} ${cleared ? 'cleared' : ''} ${boss ? 'boss' : ''}">
            <div class="stage-num">${cleared ? '✔' : unlocked ? stage.id : '🔒'}</div>
            <div class="b-main">
              <div class="b-head"><h3>${stage.id}. ${stage.name}</h3>${boss ? '<span class="lvl boss-tag">BOSS</span>' : ''}</div>
              <p class="muted">${stage.waves.length} Wellen · ${enemies} Zombies · Stärke ${fmt(ZOMBIES.walker.hp * stage.scale)}</p>
              ${unlocked ? `
                <div class="b-actions">
                  <div class="costs">${(Object.keys(reward) as (keyof Resources)[]).filter((r) => reward[r] > 0)
                    .map((r) => `<span class="cost reward">${RES_ICONS[r]} +${fmt(reward[r])}</span>`).join('')}</div>
                  <button class="btn ${cleared ? '' : 'danger'}" data-stage="${stage.id}">${cleared ? 'Wiederholen' : 'Kämpfen'}</button>
                </div>` : ''}
            </div>
          </article>`;
      }).join('')}
    </div>`;
  screen.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((btn) =>
    btn.addEventListener('click', () => startBattle(Number(btn.dataset.stage))),
  );
  // Zum aktuellen Level scrollen
  const current = screen.querySelectorAll('.stage')[Math.min(player.stagesCleared, STAGES.length - 1)];
  current?.scrollIntoView({ block: 'center' });
}

// ---------- Helden ----------
function renderHeroes() {
  const screen = $('#screen');
  screen.innerHTML = `
    <section class="hero-banner heroes-banner">
      <div><h1>Helden</h1><p>Jede Steinfarbe gehört zu einem Helden. Triffst du sie, greift er an.</p></div>
    </section>
    <div class="cards">
      ${HEROES.map((def) => {
        const level = player.heroes[def.id];
        const stats = heroStats(def, level);
        const next = heroStats(def, level + 1);
        const cost = heroUpgradeCost(level);
        const maxed = level >= MAX_HERO_LEVEL;
        return `
          <article class="card hero" style="--hero:${TILE_COLORS[def.color]}">
            <div class="portrait">${HERO_ICONS[def.id]}</div>
            <div class="b-main">
              <div class="b-head"><h3>${def.name} <small>${def.role}</small></h3><span class="lvl">Stufe ${level}</span></div>
              <div class="stats">
                <span>⚔️ ${stats.attack}${maxed ? '' : ` <em>→ ${next.attack}</em>`}</span>
                <span>❤️ ${stats.hp}${maxed ? '' : ` <em>→ ${next.hp}</em>`}</span>
              </div>
              <p class="skill"><b>${def.skill.name}</b> (${def.skill.energy} ⚡): ${def.skill.text}</p>
              ${maxed ? '<p class="effect">Maximale Stufe erreicht</p>' : `
                <div class="b-actions">
                  <div class="costs">${costHtml(cost)}</div>
                  <button class="btn primary" data-hero="${def.id}" ${P.canAfford(player, cost) ? '' : 'disabled'}>Trainieren</button>
                </div>`}
            </div>
          </article>`;
      }).join('')}
    </div>`;
  screen.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (P.upgradeHero(player, btn.dataset.hero as HeroId)) {
        save();
        render();
      }
    }),
  );
}

// ---------- Navigation ----------
function render() {
  renderResources();
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'base') renderBase();
  if (tab === 'map') renderMap();
  if (tab === 'heroes') renderHeroes();
}

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab as Tab;
    $('#screen').scrollTop = 0;
    render();
  }),
);

// Jede Sekunde: Produktion und Bau-Timer. Komplett neu zeichnen nur, wenn sich etwas
// Wichtiges geändert hat – sonst nur Zahlen anpassen, damit Taps nicht verloren gehen.
let lastSignature = '';
function tick() {
  if (game) return;
  const now = Date.now();
  P.update(player, now);
  const signature = JSON.stringify([
    BUILDINGS.map((b) => player.buildings[b.id]),
    tab === 'map' ? 0 : BUILDINGS.map((b) => P.upgradeBlock(player, b.id)),
    tab === 'heroes' ? HEROES.map((h) => P.canAfford(player, heroUpgradeCost(player.heroes[h.id]))) : 0,
  ]);
  if (signature !== lastSignature) {
    lastSignature = signature;
    render();
  } else {
    renderResources();
    document.querySelectorAll<HTMLElement>('.timer[data-ends]').forEach((el) => {
      el.textContent = `⏳ ${fmtTime((Number(el.dataset.ends) - now) / 1000)}`;
    });
  }
}

// ---------- Kampf ----------
function startBattle(stageId: number) {
  if (game) return;
  const battle = createBattle({
    stageId,
    heroLevels: player.heroes,
    hpBonus: P.wallBonus(player),
    seed: (Math.random() * 2 ** 32) >>> 0,
  });
  if (import.meta.env.DEV) (window as unknown as { __battle: unknown }).__battle = battle; // für automatische Tests
  const layer = $('#battle-layer');
  layer.hidden = false;
  document.body.classList.add('in-battle');

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
  });
}

function showResult(stageId: number, outcome: BattleOutcome) {
  if (outcome === 'fled') return closeBattle();
  const won = outcome === 'won';
  const reward = won ? P.completeStage(player, stageId) : null;
  save();
  const modal = document.createElement('div');
  modal.className = 'result';
  modal.innerHTML = `
    <div class="result-box ${won ? 'won' : 'lost'}">
      <div class="result-icon">${won ? '🏆' : '💀'}</div>
      <h2>${won ? 'Sieg!' : 'Niederlage'}</h2>
      <p>${won ? 'Die Zone ist sicher. Beute:' : 'Die Zombies waren zu stark. Trainiere deine Helden und baue die Schutzmauer aus.'}</p>
      ${reward ? `<div class="costs big">${(Object.keys(reward) as (keyof Resources)[]).filter((r) => reward[r] > 0)
        .map((r) => `<span class="cost reward">${RES_ICONS[r]} +${fmt(reward[r])}</span>`).join('')}</div>` : ''}
      <div class="result-actions">
        <button class="btn" data-act="retry">${won ? 'Nochmal' : 'Erneut versuchen'}</button>
        ${won && stageId < STAGES.length ? '<button class="btn primary" data-act="next">Nächstes Level</button>' : ''}
        <button class="btn" data-act="close">Zur Karte</button>
      </div>
    </div>`;
  $('#battle-layer').append(modal);
  modal.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) =>
    btn.addEventListener('click', () => {
      closeBattle();
      if (btn.dataset.act === 'retry') startBattle(stageId);
      if (btn.dataset.act === 'next') startBattle(stageId + 1);
    }),
  );
}

function closeBattle() {
  game?.destroy(true);
  game = null;
  const layer = $('#battle-layer');
  layer.innerHTML = '';
  layer.hidden = true;
  document.body.classList.remove('in-battle');
  tab = 'map';
  P.update(player, Date.now());
  render();
}

// ---------- Start ----------
render();
setInterval(tick, 1000);
setInterval(save, 15_000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
window.addEventListener('pagehide', save);
