// Aufgaben (Ziel-Banner, Tagesaufgaben, Login-Kalender) und Einstellungen.
import { audio } from '../audio';
import * as Q from '../core/quests';
import type { Player } from '../core/player';
import { actions, app, closeSheet, fmt, openSheet, pic, refreshSheet, toast } from './shared';

export function rewardChips(r: Q.Reward) {
  const parts: string[] = [];
  if (r.diamonds) parts.push(`<span class="chip gem">${pic('ui-gem')}+${fmt(r.diamonds)}</span>`);
  for (const [k, img] of [['food', 'res-food'], ['wood', 'res-wood'], ['steel', 'res-steel']] as const) {
    if (r[k]) parts.push(`<span class="chip">${pic(img)}+${fmt(r[k]!)}</span>`);
  }
  for (const [id, n] of Object.entries(r.items ?? {})) parts.push(`<span class="chip">${pic(`item-${id}`)}×${n}</span>`);
  return parts.join('');
}

// Ziel-Banner oben in der Basis – führt neue Spieler durchs Spiel
export function questBanner(player: Player): string {
  const q = Q.currentMainQuest(player);
  const count = Q.claimableCount(player, Date.now());
  const questsBtn = `<button class="quest-btn" data-action="quests">${pic('ui-scroll')}<span>Aufgaben</span>${count ? `<span class="badge">${count}</span>` : ''}</button>`;
  if (!q) return `<div class="goal done">${pic('ui-trophy', 'goal-img')}<div class="row-main"><b>Alle Hauptaufgaben geschafft!</b></div>${questsBtn}</div>`;
  const [cur, goal] = q.progress(player);
  const done = cur >= goal;
  return `
    <div class="goal ${done ? 'ready' : ''}">
      ${pic(done ? 'ui-gift' : 'ui-pin', 'goal-img')}
      <div class="row-main">
        <span class="kicker">Ziel</span>
        <b>${q.text}</b>
        ${done ? '' : `<div class="bar"><i style="width:${Math.min(100, (cur / goal) * 100)}%"></i></div><span class="muted">${q.tip}</span>`}
        <span class="chips left small">${rewardChips(q.reward)}</span>
      </div>
      <div class="goal-actions">
        ${done ? '<button class="btn small primary" data-action="claim-main">Abholen</button>' : `<button class="btn small" data-action="tab" data-arg="${q.goto}">Los</button>`}
        ${questsBtn}
      </div>
    </div>`;
}

function questsSheet(): string {
  const p = app.player;
  const now = Date.now();
  const login = Q.LOGIN_REWARDS.map((r, i) => {
    const streakDay = p.quests.loginStreak % Q.LOGIN_REWARDS.length;
    const claimedToday = !Q.loginReady(p, now);
    const state = i < streakDay || (claimedToday && i === streakDay - 1) ? 'got' : i === streakDay && !claimedToday ? 'today' : '';
    return `<div class="login-day ${state} ${i === 6 ? 'big' : ''}"><span>Tag ${i + 1}</span>${rewardChips(r)}</div>`;
  }).join('');
  const daily = Q.DAILY_QUESTS.map((q) => {
    const prog = Q.dailyProgress(p, q);
    const claimed = p.quests.dailyClaimed.includes(q.id);
    const done = prog >= q.goal;
    return `<div class="list-row quest ${claimed ? 'claimed' : done ? 'ready' : ''}">
      <div class="row-main"><b>${q.text}</b>
        <div class="bar"><i style="width:${(prog / q.goal) * 100}%"></i></div>
        <span class="muted">${fmt(prog)} / ${fmt(q.goal)}</span></div>
      <span class="chips small">${rewardChips(q.reward)}</span>
      ${claimed ? `<span class="owned-tag">✓</span>` : `<button class="btn small ${done ? 'primary' : ''}" data-action="claim-daily" data-arg="${q.id}" ${done ? '' : 'disabled'}>Abholen</button>`}
    </div>`;
  }).join('');
  const chestDone = p.quests.dailyClaimed.includes('chest');
  return `
    <div class="sheet-hero">${pic('ui-scroll', 'sheet-img')}<div><p class="kicker">Jeden Tag neu</p><h2>Aufgaben</h2>
      <p class="muted">Tagesaufgaben starten um Mitternacht (UTC) neu.</p></div></div>
    <p class="label">Login-Belohnung · Tag ${(p.quests.loginStreak % 7) + (Q.loginReady(p, now) ? 1 : 0) || 7} von 7</p>
    <div class="login-row">${login}</div>
    ${Q.loginReady(p, now) ? '<button class="btn big primary" data-action="claim-login">Heutige Belohnung abholen</button>' : ''}
    <p class="label">Tägliche Aufgaben</p>
    <div class="list">${daily}</div>
    <div class="list-row chest ${Q.dailyChestReady(p) ? 'ready' : ''}">
      ${pic('ui-gift', 'row-img')}
      <div class="row-main"><b>Tagestruhe</b><span class="muted">Alle 5 Tagesaufgaben abholen</span></div>
      <span class="chips small">${rewardChips(Q.DAILY_CHEST)}</span>
      ${chestDone ? '<span class="owned-tag">✓</span>' : `<button class="btn small primary" data-action="claim-daily" data-arg="chest" ${Q.dailyChestReady(p) ? '' : 'disabled'}>Öffnen</button>`}
    </div>`;
}

function settingsSheet(): string {
  const s = audio.settings;
  return `
    <div class="sheet-hero">${pic('ui-crystal', 'sheet-img')}<div><p class="kicker">Survival Puzzle</p><h2>Einstellungen</h2></div></div>
    <label class="slider"><span>🎵 Musik</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-volume="music"></label>
    <label class="slider"><span>🔊 Effekte</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-volume="sfx"></label>
    <div class="effects">
      <div class="effect-row"><span>Grafiken</span><b class="small">Microsoft Fluent Emoji (MIT)</b></div>
      <div class="effect-row"><span>Schriften</span><b class="small">Lilita One, Nunito (OFL)</b></div>
      <div class="effect-row"><span>Musik & Sound</span><b class="small">live erzeugt</b></div>
    </div>
    <button class="btn big danger" data-action="reset-save">Spielstand löschen</button>`;
}

// Lautstärke-Regler reagieren sofort
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.volume) audio.setVolume(el.dataset.volume as 'music' | 'sfx', Number(el.value));
});

function claimed(r: Q.Reward | null) {
  if (!r) return;
  audio.reward();
  toast('Belohnung erhalten!');
  app.save();
  app.render();
  refreshSheet();
}

export function openQuests() {
  openSheet(questsSheet);
}

Object.assign(actions, {
  quests: () => openQuests(),
  'claim-main': () => claimed(Q.claimMain(app.player)),
  'claim-daily': (arg: string) => claimed(Q.claimDaily(app.player, arg)),
  'claim-login': () => claimed(Q.claimLogin(app.player, Date.now())),
  settings: () => openSheet(settingsSheet),
  'reset-save': () => {
    if (!confirm('Wirklich den ganzen Spielstand löschen? Das kann man nicht rückgängig machen.')) return;
    closeSheet(true);
    app.reset();
  },
});
