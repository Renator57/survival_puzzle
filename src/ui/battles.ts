// Kampf starten (Kampagne, Boss-Event, Dungeons) und Ergebnisfenster anzeigen.
import Phaser from 'phaser';
import { createBattle, type Battle } from '../core/battle';
import { STAGES, type StageDef } from '../core/content';
import { battleTeam } from '../core/heroes';
import * as P from '../core/player';
import { BattleScene, HEIGHT, WIDTH, type BattleOutcome } from '../game/BattleScene';
import { actions, app, closeSheet, costChips, pic } from './shared';

let game: Phaser.Game | null = null;
export const inBattle = () => game !== null;

export interface ResultView {
  won: boolean;
  title: string;
  text: string;
  rewardHtml?: string;
  stars?: number;
  buttons: { label: string; cls?: string; run: () => void }[];
}

export async function launchBattle(stage: StageDef, onDone: (battle: Battle, outcome: 'won' | 'lost') => ResultView) {
  if (game) return;
  // Schriften vor dem Start laden, sonst zeichnet Phaser mit einer Ersatzschrift
  await Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('20px "Nunito Variable"')]).catch(() => undefined);
  const player = app.player;
  const battle = createBattle({ stage, team: battleTeam(player), hpBonus: P.wallBonus(player), seed: (Math.random() * 2 ** 32) >>> 0 });
  if (import.meta.env.DEV) (window as unknown as { __battle: unknown }).__battle = battle; // für automatische Tests
  const layer = document.getElementById('battle-layer')!;
  layer.hidden = false;
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
    tutorial: player.stats.battlesWon === 0 && (stage.mode ?? 'campaign') === 'campaign',
    onEnd: (outcome: BattleOutcome) => {
      if (outcome === 'fled') return closeBattle();
      const view = onDone(battle, outcome);
      app.save();
      showResult(view);
    },
  });
}

export function starsHtml(n: number) {
  return `<div class="result-stars">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>`;
}

function showResult(view: ResultView) {
  const modal = document.createElement('div');
  modal.className = 'result';
  modal.innerHTML = `
    <div class="result-box ${view.won ? 'won' : 'lost'}">
      <div class="result-rays"></div>
      ${pic(view.won ? 'ui-trophy' : 'ui-skull', 'result-icon')}
      <h2>${view.title}</h2>
      ${view.stars ? starsHtml(view.stars) : ''}
      <p>${view.text}</p>
      ${view.rewardHtml ? `<div class="chips center big">${view.rewardHtml}</div>` : ''}
      <div class="result-actions">
        ${view.buttons.map((b, i) => `<button class="btn ${b.cls ?? ''}" data-result="${i}">${b.label}</button>`).join('')}
      </div>
    </div>`;
  document.getElementById('battle-layer')!.append(modal);
  modal.querySelectorAll<HTMLButtonElement>('[data-result]').forEach((btn) =>
    btn.addEventListener('click', () => {
      closeBattle();
      view.buttons[Number(btn.dataset.result)].run();
    }),
  );
}

export function closeBattle() {
  game?.destroy(true);
  game = null;
  const layer = document.getElementById('battle-layer')!;
  layer.innerHTML = '';
  layer.hidden = true;
  P.update(app.player, Date.now());
  app.afterBattle();
}

// ---------- Kampagne ----------
export function startCampaign(stageId: number) {
  void launchBattle(STAGES[stageId - 1], (battle, outcome) => {
    const player = app.player;
    const won = outcome === 'won';
    const firstClear = won && stageId > player.stagesCleared;
    const result = won ? P.completeStage(player, stageId, battle.stars) : null;
    const reward = result && { food: result.food, wood: result.wood, steel: result.steel };
    const buttons: ResultView['buttons'] = [];
    if (won && stageId < STAGES.length) buttons.push({ label: `${pic('ui-swords')} Nächstes Level`, cls: 'big primary', run: () => startCampaign(stageId + 1) });
    buttons.push({ label: won ? 'Nochmal' : 'Erneut versuchen', run: () => startCampaign(stageId) });
    buttons.push({ label: `${pic('ui-map')} Karte`, run: () => undefined });
    return {
      won,
      title: won ? 'Sieg!' : 'Niederlage',
      stars: won ? battle.stars : undefined,
      text: won
        ? `${firstClear ? `${STAGES[stageId - 1].name} ist befreit!` : 'Die Zone bleibt sicher.'}${battle.stars < 3 ? ' Mehr Leben übrig = mehr Sterne.' : ''}`
        : 'Die Zombies waren zu stark. Trainiere deine Helden und baue die Schutzmauer aus.',
      rewardHtml: reward
        ? costChips(reward, undefined, '+') + (result!.diamonds ? `<span class="chip gem">${pic('ui-gem')}+${result!.diamonds}</span>` : '')
        : undefined,
      buttons,
    };
  });
}

Object.assign(actions, {
  battle: (arg: string) => {
    closeSheet(true);
    startCampaign(Number(arg));
  },
});
