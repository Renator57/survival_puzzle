// Kampfszene: zeichnet Spielfeld, Helden und Zombies und animiert die Ereignisse aus dem Kern.
// Die Szene entscheidet nichts selbst – alle Regeln stecken in src/core/battle.ts.
import Phaser from 'phaser';
import { COLS, ROWS, isAdjacent, type Pos, type Special, type Tile } from '../core/board';
import { canUseSkill, swap, useSkill, type Battle, type BattleEvent, type Enemy } from '../core/battle';
import { HEROES, STAGES, ZOMBIES, type HeroId, type ZombieKind } from '../core/content';

export const WIDTH = 720;
export const HEIGHT = 1280;
const TILE = 96;
const BOARD_X = (WIDTH - COLS * TILE) / 2;
const BOARD_Y = 660;
const GROUND_Y = 410;
const FONT = '"Lilita One", system-ui, sans-serif';

export const TILE_COLORS = ['#ef4b4b', '#3d8bfd', '#3fcf6b', '#ffc531', '#a66bff'];
const SPECIALS: Special[] = ['none', 'row', 'col', 'bomb'];
const ZOMBIE_LOOK: Record<ZombieKind, { key: string; tint?: number }> = {
  walker: { key: 'zombie-walker' },
  runner: { key: 'zombie-runner' },
  brute: { key: 'zombie-brute', tint: 0xd8c0b0 },
  spitter: { key: 'zombie-walker', tint: 0xb0ff90 },
  boss: { key: 'zombie-boss' },
};

const hex = (css: string) => parseInt(css.slice(1), 16);

function shade(css: string, amount: number): string {
  const n = hex(css);
  const ch = (shift: number) => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

const cellX = (col: number) => BOARD_X + col * TILE + TILE / 2;
const cellY = (row: number) => BOARD_Y + row * TILE + TILE / 2;
const tileKey = (t: Pick<Tile, 'color' | 'special'>) => `gem-${t.color}-${t.special}`;

export type BattleOutcome = 'won' | 'lost' | 'fled';

export interface BattleSceneData {
  battle: Battle;
  onEnd: (outcome: BattleOutcome) => void;
  confirmFlee: () => boolean;
}

interface EnemyView {
  uid: number;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  countText: Phaser.GameObjects.Text;
  hp: number;
  maxHp: number;
  barWidth: number;
}

interface HeroView {
  id: HeroId;
  color: number;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  ready: Phaser.GameObjects.Text;
  energy: number;
  maxEnergy: number;
}

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private onEnd!: BattleSceneData['onEnd'];
  private confirmFlee!: BattleSceneData['confirmFlee'];
  private tiles = new Map<number, Phaser.GameObjects.Image>();
  private enemyViews = new Map<number, EnemyView>();
  private heroViews: HeroView[] = [];
  private busy = false;
  private ended = false;
  private selected: Pos | null = null;
  private drag: { cell: Pos; x: number; y: number } | null = null;
  private selectMarker!: Phaser.GameObjects.Rectangle;
  private targetMarker!: Phaser.GameObjects.Text;
  private teamFill!: Phaser.GameObjects.Rectangle;
  private teamText!: Phaser.GameObjects.Text;
  private teamHpShown = 0;
  private waveText!: Phaser.GameObjects.Text;

  constructor() {
    super('battle');
  }

  init(data: BattleSceneData) {
    this.battle = data.battle;
    this.onEnd = data.onEnd;
    this.confirmFlee = data.confirmFlee;
    this.tiles.clear();
    this.enemyViews.clear();
    this.heroViews = [];
    this.busy = false;
    this.ended = false;
    this.selected = null;
  }

  preload() {
    for (const def of HEROES) this.load.image(`hero-${def.id}`, `img/hero-${def.id}.webp`);
    for (const kind of ['walker', 'runner', 'brute', 'boss']) this.load.image(`zombie-${kind}`, `img/zombie-${kind}.webp`);
    for (let c = 0; c < TILE_COLORS.length; c++) this.load.image(`tile-${c}`, `img/tile-${c}.webp`);
    this.load.image('ui-boom', 'img/ui-boom.webp');
  }

  create() {
    this.makeTextures();
    this.add.image(0, 0, 'backdrop').setOrigin(0);
    this.createHud();
    this.createEnemies(this.battle.enemies);
    this.createHeroes();
    this.createBoard();
    this.setupInput();
    this.syncState();
  }

  // ---------- Grafiken (per Canvas gezeichnet, keine Bilddateien nötig) ----------
  private makeTextures() {
    for (let c = 0; c < TILE_COLORS.length; c++) {
      for (const special of SPECIALS) {
        const key = tileKey({ color: c, special });
        if (this.textures.exists(key)) continue;
        const tex = this.textures.createCanvas(key, TILE, TILE)!;
        const icon = this.textures.get(`tile-${c}`).getSourceImage() as HTMLImageElement;
        const boom = this.textures.get('ui-boom').getSourceImage() as HTMLImageElement;
        drawTile(tex.getContext(), c, special, icon, boom);
        tex.refresh();
      }
    }
    if (!this.textures.exists('backdrop')) {
      const tex = this.textures.createCanvas('backdrop', WIDTH, HEIGHT)!;
      drawBackdrop(tex.getContext());
      tex.refresh();
    }
  }

  private createHud() {
    const stage = STAGES[this.battle.stageId - 1];
    this.add.text(WIDTH / 2, 34, `${this.battle.stageId}. ${stage.name}`, {
      fontFamily: FONT, fontSize: '30px', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.waveText = this.add.text(WIDTH / 2, 72, '', {
      fontFamily: FONT, fontSize: '22px', color: '#ffd27a', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    const flee = this.add.text(44, 44, '✕', {
      fontFamily: FONT, fontSize: '34px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 14, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    flee.on('pointerup', () => {
      if (!this.ended && this.confirmFlee()) this.finish('fled');
    });

    // Team-Lebensbalken
    const barY = 462;
    this.add.rectangle(WIDTH / 2, barY, 640, 30, 0x000000, 0.65).setStrokeStyle(2, 0xffffff, 0.25);
    this.teamFill = this.add.rectangle(WIDTH / 2 - 316, barY, 632, 22, 0x3fcf6b).setOrigin(0, 0.5);
    this.teamText = this.add.text(WIDTH / 2, barY, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.teamHpShown = this.battle.teamHp;

    this.targetMarker = this.add.text(0, 0, '▼', {
      fontFamily: FONT, fontSize: '28px', color: '#ffd27a', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: this.targetMarker, y: '+=10', yoyo: true, repeat: -1, duration: 500 });
  }

  // ---------- Zombies ----------
  private enemyX(index: number, count: number) {
    return WIDTH / 2 + (index - (count - 1) / 2) * Math.min(170, 620 / count);
  }

  private createEnemies(enemies: Enemy[], walkIn = false) {
    enemies.forEach((enemy, i) => {
      const z = ZOMBIES[enemy.kind];
      const look = ZOMBIE_LOOK[enemy.kind];
      const x = this.enemyX(i, enemies.length);
      const size = z.size * (enemies.length > 3 ? 0.85 : 1);
      const container = this.add.container(walkIn ? x + 500 : x, GROUND_Y);

      const shadow = this.add.ellipse(0, 0, 100 * size, 22 * size, 0x000000, 0.45);
      const body = this.add.image(0, 8, look.key).setOrigin(0.5, 1).setDisplaySize(150 * size, 150 * size);
      if (look.tint) body.setTint(look.tint);
      const barWidth = 100 * Math.max(1, size * 0.9);
      const hpBg = this.add.rectangle(0, 22, barWidth + 4, 14, 0x000000, 0.75);
      const hpFill = this.add.rectangle(-barWidth / 2, 22, barWidth, 10, 0xe5484d).setOrigin(0, 0.5);
      const badgeY = -132 * size - 14;
      const badge = this.add.circle(0, badgeY, 20, 0x2a0d10).setStrokeStyle(3, 0xff6b5a);
      const countText = this.add.text(0, badgeY, '', {
        fontFamily: FONT, fontSize: '22px', color: '#ffffff',
      }).setOrigin(0.5);
      container.add([shadow, body, hpBg, hpFill, badge, countText]);

      // Leichtes Wanken, damit die Zombies lebendig wirken
      this.tweens.add({ targets: body, angle: { from: -3, to: 3 }, yoyo: true, repeat: -1, duration: 900 + i * 130, ease: 'Sine.easeInOut' });
      if (walkIn) this.tweens.add({ targets: container, x, duration: 700, delay: i * 120, ease: 'Cubic.easeOut' });

      this.enemyViews.set(enemy.uid, {
        uid: enemy.uid, container, body, hpFill, countText, hp: enemy.hp, maxHp: enemy.maxHp, barWidth,
      });
    });
  }

  // ---------- Helden ----------
  private createHeroes() {
    this.add.rectangle(WIDTH / 2, 560, WIDTH, 170, 0x0d0f14, 1).setDepth(10);
    HEROES.forEach((def, i) => {
      const x = 72 + i * 144;
      const y = 556;
      const color = hex(TILE_COLORS[def.color]);
      const container = this.add.container(x, y).setDepth(11);
      const base = this.add.circle(0, 0, 50, 0x1a1d26);
      const inner = this.add.circle(0, 0, 40, color, 0.9);
      const icon = this.add.image(0, 2, `hero-${def.id}`).setDisplaySize(78, 78);
      const ring = this.add.graphics();
      const name = this.add.text(0, 66, def.name, {
        fontFamily: FONT, fontSize: '20px', color: '#f1f2f7', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      const ready = this.add.text(0, -62, 'BEREIT', {
        fontFamily: FONT, fontSize: '17px', color: '#2a1503', backgroundColor: '#ffc048', padding: { x: 8, y: 2 },
      }).setOrigin(0.5).setVisible(false);
      container.add([base, inner, icon, ring, name, ready]);
      container.setSize(110, 110).setInteractive({ useHandCursor: true });
      container.on('pointerup', () => this.trySkill(def.id));
      this.tweens.add({ targets: ready, scale: 1.12, yoyo: true, repeat: -1, duration: 420 });
      const hero = this.battle.heroes.find((h) => h.id === def.id)!;
      this.heroViews.push({ id: def.id, color: def.color, x, y, container, ring, ready, energy: hero.energy, maxEnergy: hero.maxEnergy });
    });
  }

  private drawHeroRing(view: HeroView) {
    const frac = view.energy / view.maxEnergy;
    const g = view.ring.clear();
    g.lineStyle(8, 0x000000, 0.6).beginPath().arc(0, 0, 46, 0, Math.PI * 2).strokePath();
    if (frac > 0) {
      g.lineStyle(8, frac >= 1 ? 0xffd27a : hex(TILE_COLORS[view.color]), 1)
        .beginPath()
        .arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
        .strokePath();
    }
    view.ready.setVisible(frac >= 1 && !this.ended);
  }

  // ---------- Spielfeld ----------
  private createBoard() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55).fillRoundedRect(BOARD_X - 10, BOARD_Y - 10, COLS * TILE + 20, ROWS * TILE + 20, 22);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if ((r + c) % 2 === 0) g.fillStyle(0xffffff, 0.04).fillRect(BOARD_X + c * TILE, BOARD_Y + r * TILE, TILE, TILE);

    this.selectMarker = this.add.rectangle(0, 0, TILE - 4, TILE - 4).setStrokeStyle(5, 0xffffff).setVisible(false).setDepth(6);
    this.battle.board.grid.forEach((row, r) =>
      row.forEach((tile, c) => {
        const img = this.add.image(cellX(c), cellY(r), tileKey(tile)).setDepth(5);
        this.tiles.set(tile.id, img);
      }),
    );
  }

  private cellAt(x: number, y: number): Pos | null {
    const col = Math.floor((x - BOARD_X) / TILE);
    const row = Math.floor((y - BOARD_Y) / TILE);
    return row >= 0 && row < ROWS && col >= 0 && col < COLS ? { row, col } : null;
  }

  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const cell = this.cellAt(p.worldX, p.worldY);
      this.drag = cell ? { cell, x: p.worldX, y: p.worldY } : null;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dx = p.worldX - this.drag.x;
      const dy = p.worldY - this.drag.y;
      if (Math.hypot(dx, dy) < 32) return;
      const from = this.drag.cell;
      const to = Math.abs(dx) > Math.abs(dy)
        ? { row: from.row, col: from.col + Math.sign(dx) }
        : { row: from.row + Math.sign(dy), col: from.col };
      this.drag = null;
      this.select(null);
      void this.trySwap(from, to);
    });
    this.input.on('pointerup', () => {
      if (!this.drag) return;
      const cell = this.drag.cell;
      this.drag = null;
      if (this.selected && isAdjacent(this.selected, cell)) {
        const from = this.selected;
        this.select(null);
        void this.trySwap(from, cell);
      } else {
        this.select(this.selected && this.selected.row === cell.row && this.selected.col === cell.col ? null : cell);
      }
    });
  }

  private select(cell: Pos | null) {
    this.selected = cell;
    this.selectMarker.setVisible(!!cell);
    if (cell) this.selectMarker.setPosition(cellX(cell.col), cellY(cell.row));
  }

  private tileAt(p: Pos) {
    return this.tiles.get(this.battle.board.grid[p.row]?.[p.col]?.id ?? -1);
  }

  private async trySwap(a: Pos, b: Pos) {
    if (this.busy || this.ended) return;
    if (b.row < 0 || b.row >= ROWS || b.col < 0 || b.col >= COLS) return;
    const imgA = this.tileAt(a);
    const imgB = this.tileAt(b);
    if (!imgA || !imgB) return;
    this.busy = true;

    const events = swap(this.battle, a, b);
    const moveA = this.tween({ targets: imgA, x: cellX(b.col), y: cellY(b.row), duration: 150 });
    const moveB = this.tween({ targets: imgB, x: cellX(a.col), y: cellY(a.row), duration: 150 });
    await Promise.all([moveA, moveB]);

    if (!events) {
      // Ungültiger Zug: zurücktauschen
      await Promise.all([
        this.tween({ targets: imgA, x: cellX(a.col), y: cellY(a.row), duration: 150 }),
        this.tween({ targets: imgB, x: cellX(b.col), y: cellY(b.row), duration: 150 }),
      ]);
    } else {
      await this.play(events);
    }
    this.busy = false;
  }

  private async trySkill(heroId: HeroId) {
    if (this.busy || this.ended || !canUseSkill(this.battle, heroId)) return;
    this.busy = true;
    const events = useSkill(this.battle, heroId)!;
    await this.play(events);
    this.busy = false;
  }

  // ---------- Ereignisse abspielen ----------
  private async play(events: BattleEvent[]) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'attack') {
        // Aufeinanderfolgende Angriffe gleichzeitig (leicht versetzt) abspielen
        const batch: Extract<BattleEvent, { type: 'attack' }>[] = [];
        while (events[i]?.type === 'attack') batch.push(events[i++] as Extract<BattleEvent, { type: 'attack' }>);
        i--;
        await Promise.all(batch.map((e, k) => this.animateAttack(e, k * 70)));
        continue;
      }
      await this.animate(event);
    }
    this.syncState();
  }

  private async animate(event: BattleEvent) {
    switch (event.type) {
      case 'cascade':
        return this.animateCascade(event.step, event.combo);
      case 'enemyAttack':
        return this.animateEnemyAttack(event.enemyUid, event.damage);
      case 'heal':
        this.floatText(WIDTH / 2, 430, `+${event.amount}`, '#7dff9c');
        this.setTeamHp(this.teamHpShown + event.amount);
        return this.wait(250);
      case 'stun':
        this.cameras.main.flash(250, 255, 240, 140);
        return this.wait(250);
      case 'skill': {
        const def = HEROES.find((h) => h.id === event.heroId)!;
        const view = this.heroViews.find((h) => h.id === event.heroId)!;
        view.energy = 0;
        this.drawHeroRing(view);
        return this.banner(def.skill.name, TILE_COLORS[def.color]);
      }
      case 'wave':
        for (const v of this.enemyViews.values()) v.container.destroy();
        this.enemyViews.clear();
        await this.banner(`Welle ${event.index + 1}`, '#ffd27a');
        this.createEnemies(event.enemies, true);
        this.updateWaveText(event.index);
        return this.wait(500);
      case 'result':
        await this.wait(500);
        this.finish(event.result);
        return;
    }
  }

  private async animateCascade(step: Extract<BattleEvent, { type: 'cascade' }>['step'], combo: number) {
    if (combo > 0) this.floatText(WIDTH / 2, BOARD_Y + 40, `Kombo ×${combo + 1}!`, '#ffd27a', 44);
    await Promise.all(
      step.cleared.map((c) => {
        const img = this.tiles.get(c.id);
        if (!img) return Promise.resolve();
        this.tiles.delete(c.id);
        this.flyToHero(c.color, img.x, img.y);
        return this.tween({ targets: img, scale: 0, alpha: 0, angle: 45, duration: 180 }).then(() => img.destroy());
      }),
    );
    for (const view of this.heroViews) {
      const count = step.cleared.filter((c) => c.color === view.color).length;
      if (count) {
        view.energy = Math.min(view.maxEnergy, view.energy + count);
        this.drawHeroRing(view);
      }
    }
    for (const created of step.created) {
      const img = this.tiles.get(created.id);
      if (img) this.tweens.add({ targets: img, scale: { from: 1.4, to: 1 }, duration: 250, ease: 'Back.easeOut' });
    }
    await this.layout(step.grid);
  }

  // Alle Steine an ihre Zielposition bringen; neue fallen von oben herein.
  private layout(grid: Tile[][]) {
    const fresh = new Array(COLS).fill(0);
    for (const row of grid) row.forEach((t, c) => (fresh[c] += this.tiles.has(t.id) ? 0 : 1));
    const moves: Promise<void>[] = [];
    grid.forEach((row, r) =>
      row.forEach((tile, c) => {
        let img = this.tiles.get(tile.id);
        if (!img) {
          img = this.add.image(cellX(c), cellY(r) - fresh[c] * TILE, tileKey(tile)).setDepth(5).setAlpha(0);
          this.tiles.set(tile.id, img);
        }
        if (img.texture.key !== tileKey(tile)) img.setTexture(tileKey(tile));
        const distance = Math.hypot(img.x - cellX(c), img.y - cellY(r));
        if (distance < 1 && img.alpha === 1) return;
        moves.push(this.tween({
          targets: img, x: cellX(c), y: cellY(r), alpha: 1, scale: 1, angle: 0,
          duration: 160 + distance * 0.45, ease: 'Bounce.easeOut',
        }));
      }),
    );
    return Promise.all(moves).then(() => undefined);
  }

  private flyToHero(color: number, x: number, y: number) {
    const view = this.heroViews.find((h) => h.color === color);
    if (!view) return;
    const dot = this.add.circle(x, y, 9, hex(TILE_COLORS[color])).setDepth(12);
    this.tweens.add({
      targets: dot, x: view.x, y: view.y, scale: 0.4, duration: 320 + Math.random() * 120, ease: 'Cubic.easeIn',
      onComplete: () => dot.destroy(),
    });
  }

  private async animateAttack(event: Extract<BattleEvent, { type: 'attack' }>, delay: number) {
    await this.wait(delay);
    const hero = this.heroViews.find((h) => h.id === event.heroId)!;
    const enemy = this.enemyViews.get(event.enemyUid);
    if (!enemy) return;
    this.tweens.add({ targets: hero.container, scale: 1.15, yoyo: true, duration: 100 });

    const shot = this.add.circle(hero.x, hero.y - 40, 10, hex(TILE_COLORS[hero.color])).setDepth(12);
    shot.setStrokeStyle(3, 0xffffff, 0.8);
    await this.tween({ targets: shot, x: enemy.container.x, y: GROUND_Y - 70, duration: 200, ease: 'Quad.easeIn' });
    shot.destroy();

    enemy.hp = Math.max(0, enemy.hp - event.damage);
    enemy.hpFill.width = enemy.barWidth * (enemy.hp / enemy.maxHp);
    this.floatText(enemy.container.x + (Math.random() - 0.5) * 40, GROUND_Y - 150, `-${event.damage}`, TILE_COLORS[hero.color]);
    this.tweens.add({ targets: enemy.body, x: { from: -10, to: 0 }, duration: 160, ease: 'Elastic.easeOut' });
    enemy.body.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    this.time.delayedCall(70, () => {
      enemy.body.setTintMode(Phaser.TintModes.MULTIPLY);
      const look = ZOMBIE_LOOK[this.enemyKind(event.enemyUid)];
      if (look?.tint) enemy.body.setTint(look.tint);
      else enemy.body.clearTint();
    });

    if (event.killed) {
      this.enemyViews.delete(event.enemyUid);
      this.tweens.add({
        targets: enemy.container, alpha: 0, y: GROUND_Y + 30, angle: 20, duration: 400,
        onComplete: () => enemy.container.destroy(),
      });
      this.updateTargetMarker();
    }
  }

  private enemyKind(uid: number): ZombieKind {
    return this.battle.enemies.find((e) => e.uid === uid)?.kind ?? 'walker';
  }

  private async animateEnemyAttack(uid: number, damage: number) {
    const view = this.enemyViews.get(uid);
    if (view) await this.tween({ targets: view.container, y: GROUND_Y + 40, scale: 1.15, yoyo: true, duration: 140 });
    this.cameras.main.shake(220, 0.012);
    this.floatText(WIDTH / 2, 430, `-${damage}`, '#ff6b5a', 40);
    this.setTeamHp(this.teamHpShown - damage);
    await this.wait(200);
  }

  // ---------- Anzeige-Hilfen ----------
  private setTeamHp(value: number) {
    this.teamHpShown = Math.max(0, Math.min(this.battle.teamMaxHp, value));
    const frac = this.teamHpShown / this.battle.teamMaxHp;
    this.tweens.add({ targets: this.teamFill, width: 632 * frac, duration: 250 });
    this.teamFill.fillColor = frac > 0.5 ? 0x3fcf6b : frac > 0.25 ? 0xffc531 : 0xef4b4b;
    this.teamText.setText(`${Math.round(this.teamHpShown)} / ${this.battle.teamMaxHp}`);
  }

  private updateWaveText(index = this.battle.waveIndex) {
    this.waveText.setText(`Welle ${index + 1} / ${STAGES[this.battle.stageId - 1].waves.length}`);
  }

  private updateTargetMarker() {
    const front = this.battle.enemies.find((e) => e.hp > 0 && this.enemyViews.has(e.uid));
    const view = front && this.enemyViews.get(front.uid);
    this.targetMarker.setVisible(!!view && !this.ended);
    if (view) this.targetMarker.setX(view.container.x).setY(GROUND_Y - 220 * ZOMBIES[front.kind].size + 10);
  }

  // Nach jeder Aktion: Anzeige exakt an den Zustand im Kern angleichen.
  private syncState() {
    for (const enemy of this.battle.enemies) {
      const view = this.enemyViews.get(enemy.uid);
      if (!view) continue;
      view.countText.setText(String(enemy.countdown));
      view.countText.setColor(enemy.countdown === 1 ? '#ff6b5a' : '#ffffff');
    }
    for (const view of this.heroViews) {
      view.energy = this.battle.heroes.find((h) => h.id === view.id)!.energy;
      this.drawHeroRing(view);
    }
    this.setTeamHp(this.battle.teamHp);
    this.updateWaveText();
    this.updateTargetMarker();
  }

  private floatText(x: number, y: number, text: string, color: string, size = 34) {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private async banner(text: string, color: string) {
    const t = this.add.text(WIDTH / 2, 260, text, {
      fontFamily: FONT, fontSize: '64px', color, stroke: '#000000', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(30).setScale(0.3).setAlpha(0);
    await this.tween({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    await this.wait(380);
    await this.tween({ targets: t, alpha: 0, y: 220, duration: 220 });
    t.destroy();
  }

  private finish(outcome: BattleOutcome) {
    if (this.ended) return;
    this.ended = true;
    this.targetMarker.setVisible(false);
    this.onEnd(outcome);
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    return new Promise<void>((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => this.time.delayedCall(ms, resolve));
  }
}

// ---------- Canvas-Zeichnungen ----------
function drawTile(ctx: CanvasRenderingContext2D, color: number, special: Special, icon: HTMLImageElement, boom: HTMLImageElement) {
  const base = TILE_COLORS[color];
  const s = TILE;
  const pad = 5;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(pad, pad + 5, s - pad * 2, s - pad * 2, 22);
  ctx.fill();

  const grad = ctx.createLinearGradient(0, pad, 0, s - pad);
  grad.addColorStop(0, shade(base, 55));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, shade(base, -55));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(pad, pad, s - pad * 2, s - pad * 2 - 2, 22);
  ctx.fill();

  // Glanz und heller Rand
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const gloss = ctx.createLinearGradient(0, pad, 0, s / 2);
  gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.roundRect(pad + 6, pad + 4, s - pad * 2 - 12, s / 2 - 10, 16);
  ctx.fill();

  if (special === 'row' || special === 'col') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    for (const o of [-26, 26]) {
      if (special === 'row') ctx.fillRect(pad + 4, s / 2 + o - 3, s - pad * 2 - 8, 6);
      else ctx.fillRect(s / 2 + o - 3, pad + 4, 6, s - pad * 2 - 8);
    }
    ctx.shadowBlur = 0;
  }
  if (special === 'bomb') {
    const glow = ctx.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, 42);
    glow.addColorStop(0, 'rgba(255,240,180,0.95)');
    glow.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
  }

  // 3D-Symbol des Helden
  const size = special === 'none' ? 60 : 54;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowOffsetY = 4;
  ctx.shadowBlur = 5;
  ctx.drawImage(icon, (s - size) / 2, (s - size) / 2 - 1, size, size);
  ctx.restore();
  if (special === 'bomb') ctx.drawImage(boom, s - 40, 4, 34, 34);
}

function drawBackdrop(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
  sky.addColorStop(0, '#1b0f2e');
  sky.addColorStop(0.55, '#5a1f2a');
  sky.addColorStop(1, '#c2562b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, GROUND_Y + 40);

  // Blutroter Mond
  const moon = ctx.createRadialGradient(560, 140, 10, 560, 140, 140);
  moon.addColorStop(0, 'rgba(255,190,140,0.95)');
  moon.addColorStop(0.35, 'rgba(255,120,80,0.5)');
  moon.addColorStop(1, 'rgba(255,80,60,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, WIDTH, GROUND_Y);

  // Ruinen-Skyline mit festem Muster
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [color, base, maxH] of [['#2a1424', 300, 170], ['#160a14', 350, 140]] as const) {
    let x = -20;
    while (x < WIDTH) {
      const w = 40 + rand() * 70;
      const h = 40 + rand() * maxH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, base + 80);
      ctx.lineTo(x, base - h);
      ctx.lineTo(x + w * (0.3 + rand() * 0.4), base - h - rand() * 25); // eingestürzte Kante
      ctx.lineTo(x + w, base - h + rand() * 20);
      ctx.lineTo(x + w, base + 80);
      ctx.fill();
      if (color === '#2a1424' && rand() > 0.5) {
        ctx.fillStyle = 'rgba(255,190,90,0.35)';
        ctx.fillRect(x + w * 0.3, base - h * 0.6, 6, 8);
      }
      x += w + rand() * 12;
    }
  }

  const ground = ctx.createLinearGradient(0, GROUND_Y - 30, 0, GROUND_Y + 60);
  ground.addColorStop(0, '#3a2a22');
  ground.addColorStop(1, '#120c0a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, GROUND_Y - 30, WIDTH, 90);

  const fog = ctx.createLinearGradient(0, GROUND_Y - 120, 0, GROUND_Y);
  fog.addColorStop(0, 'rgba(200,120,100,0)');
  fog.addColorStop(1, 'rgba(200,120,100,0.18)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, GROUND_Y - 120, WIDTH, 120);

  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, GROUND_Y + 60, WIDTH, HEIGHT - GROUND_Y - 60);
}
