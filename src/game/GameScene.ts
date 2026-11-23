import Phaser from 'phaser';
import { GameState, type TransitionStage } from './GameState';
import { MouseField, type Hole } from './MouseField';
import { GameUI } from './ui/GameUI';
import { BALANCE } from './settings';
import { COLORS } from './theme';
import { ProgressStore } from './ProgressStore';
import type { MouseType, UsefulItemType } from './visuals';

/** Связывает правила, поле и интерфейс; здесь остаются ввод и жизненный цикл Phaser. */
export class GameScene extends Phaser.Scene {
  private readonly state = new GameState();
  private readonly progress = new ProgressStore();
  private field!: MouseField;
  private ui!: GameUI;
  private pausedTweens: Phaser.Tweens.Tween[] = [];
  private phaseTransitionTimer?: Phaser.Time.TimerEvent;
  private mouseAppearances = 0;
  private nextItem?: { at: number; guaranteedCheese: boolean };
  private activeItem?: { hole: Hole; expiresAt: number };
  private holeBlock?: { holes: Hole[]; target: number; expiresAt?: number };
  private phaseAudio?: AudioContext;
  private bestScoreAtGameStart = 0;
  private hadRecordAtGameStart = false;
  private showedRecordNotification = false;

  constructor() { super('GameScene'); }

  create(data: { startImmediately?: boolean } = {}): void {
    this.state.reset();
    this.time.paused = false;
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.pausedTweens = [];
    this.field = new MouseField(this, hole => this.tryPendingFieldActions(hole), () => this.handleMouseAppeared());
    this.ui = new GameUI(this, this.state, {
      start: () => this.startGame(),
      resume: () => this.resumeGame(),
      restart: () => this.scene.restart({ startImmediately: true }),
      menu: () => this.scene.restart({ startImmediately: false }),
    }, () => this.progress.snapshot);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.on('keydown', this.handlePauseKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.ui.showMenu();
    if (data.startImmediately) this.startGame();
  }

  private layout(): void {
    const portrait = this.scale.width < this.scale.height;
    const compact = !portrait && this.scale.height < 480;
    const width = portrait ? 480 : compact ? 800 : 960;
    const height = portrait ? 760 : compact ? 500 : 640;
    const zoom = Math.min(this.scale.width / width, this.scale.height / height);
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
    this.field.resize(width, height);
    this.ui.resize(width, height);
    this.updateBlockIndicators();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state.phase !== 'playing') return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.field.isBlockedAt(point.x, point.y)) return;
    const item = this.field.findItem(point.x, point.y);
    if (item) {
      this.collectUsefulItem(item);
      return;
    }
    const hole = this.field.findMouse(point.x, point.y);
    if (hole) {
      this.hitMouse(hole);
    } else if (this.field.findEmptyHole(point.x, point.y) && this.state.breakStreak()) {
      this.ui.showStreakNotice(false);
    }
  }

  private handlePauseKey(event: KeyboardEvent): void {
    if (event.repeat || (event.code !== 'KeyP' && event.code !== 'Escape')) return;
    if (this.state.phase !== 'playing' && this.state.phase !== 'transition' &&
      this.state.phase !== 'paused') return;
    event.preventDefault();
    if (this.state.phase === 'playing' || this.state.phase === 'transition') this.pauseGame();
    else this.resumeGame();
  }

  private startGame(): void {
    if (this.state.phase !== 'menu') return;
    const progress = this.progress.snapshot;
    this.bestScoreAtGameStart = progress.bestScore;
    this.hadRecordAtGameStart = progress.hasBestScore;
    this.showedRecordNotification = false;
    this.field.setStage(1);
    this.state.start();
    this.ui.start();
    this.scheduleSpawns();
    this.spawnMouse();
  }

  private pauseGame(): void {
    const phase = this.state.phase;
    if (phase !== 'playing' && phase !== 'transition') return;
    this.state.pause();
    this.time.paused = true;
    this.pausedTweens = this.tweens.getTweens().filter(tween => !tween.isPaused());
    this.pausedTweens.forEach(tween => tween.pause());
    this.ui.showPause();
  }

  private resumeGame(): void {
    if (this.state.phase !== 'paused') return;
    this.state.resume();
    this.ui.hideOverlay();
    this.time.paused = false;
    this.pausedTweens.forEach(tween => tween.resume());
    this.pausedTweens = [];
  }

  private scheduleSpawns(): void {
    this.field.scheduleSpawns(this.state.spawnIntervalMs, () => this.spawnMouse());
  }

  private spawnMouse(): void {
    if (this.state.phase !== 'playing') return;
    const type = this.chooseMouseType();
    const visibleMs = this.state.mouseVisibleMs *
      (type === 'helmet' ? BALANCE.helmetVisibleTimeMultiplier : 1);
    this.field.spawnMouse(visibleMs, hole => this.missMouse(hole), type);
  }

  private chooseMouseType(): MouseType {
    if (this.state.gameStage < 2) return 'normal';

    const roll = Math.random();
    const { normal, decoy, golden, helmet } = BALANCE.phase2MouseChances;
    if (roll < normal) return 'normal';
    if (roll < normal + decoy) return 'decoy';
    if (roll < normal + decoy + golden) return 'golden';
    if (roll < normal + decoy + golden + helmet) return 'helmet';
    return 'normal';
  }

  private hitMouse(hole: Hole): void {
    if (this.state.phase !== 'playing' || hole.mouse === null) return;
    if (hole.mouseType === 'decoy') {
      const brokeStreak = this.state.miss();
      this.ui.showMiss();
      this.ui.showDecoyWarning();
      this.ui.feedback(hole.x, hole.y, '−♥', COLORS.pink);
      this.field.clearMouse(hole, true);
      if (this.state.lives === 0) this.endGame();
      if (brokeStreak) this.ui.showStreakNotice(false);
      return;
    }

    if (hole.mouseType === 'helmet' && !hole.helmetRemoved) {
      this.field.removeHelmet(hole);
      this.ui.showHelmetHint(hole.x, hole.y);
      return;
    }

    if (hole.mouseType === 'golden') {
      this.ui.showGoldenHit(hole.x, hole.y);
      this.rewardMouse(hole, BALANCE.goldenHitPoints);
      return;
    }

    const points = hole.mouseType === 'helmet'
      ? BALANCE.helmetHitPoints : BALANCE.hitPoints;
    this.rewardMouse(hole, points);
  }

  private rewardMouse(hole: Hole, basePoints: number): void {
    const reward = this.state.hit(basePoints);
    if (!reward) return;
    this.progress.recordScore(this.state.score);
    const newRecord = this.hadRecordAtGameStart && !this.showedRecordNotification &&
      this.state.score > this.bestScoreAtGameStart;
    if (newRecord) this.showedRecordNotification = true;
    this.ui.updateScore(newRecord);
    this.ui.feedback(hole.x, hole.y, `+${reward.points}`, COLORS.buttonPressed);
    this.field.clearMouse(hole, true);
    if (reward.enteredPhase) this.startPhaseTransition(reward.enteredPhase);
    if (this.state.streak === BALANCE.streakThreshold) this.ui.showStreakNotice(true);
    else this.ui.updateStreak();
  }

  private startPhaseTransition(stage: TransitionStage): void {
    this.field.clearMice();
    this.field.setItemsVisible(false);
    this.playPhaseTransition(stage);
  }

  private playPhaseTransition(stage: TransitionStage): void {
    this.field.setStage(stage);
    this.field.shake(BALANCE.phaseShakeMs, BALANCE.phaseShakeAmplitude);
    this.ui.showStage(stage);
    this.ui.showPhaseTransition(stage);
    this.playPhaseSignal(stage);
    this.phaseTransitionTimer = this.time.delayedCall(BALANCE.phaseTransitionMs, () => {
      this.phaseTransitionTimer = undefined;
      const transition = this.state.finishPhaseTransition();
      if (!transition) return;
      this.ui.hidePhaseTransition();
      if (stage === 3) {
        this.nextItem = {
          at: this.mouseAppearances + BALANCE.phase3FirstItemAppearances,
          guaranteedCheese: true,
        };
      }
      if (transition.nextStage) {
        this.playPhaseTransition(transition.nextStage);
        return;
      }

      this.field.setItemsVisible(true);
      this.ui.updateStreak();
      this.tryPendingFieldActions();
      this.scheduleSpawns();
      if (stage !== 4) this.spawnMouse();
    });
  }

  private handleMouseAppeared(): void {
    if (this.state.phase !== 'playing' || this.state.lives === 0) return;
    // Сначала учитываем мышь, затем обновляем действующие эффекты и предлагаем предмет.
    // Новые сроки считаются от уже обновлённого числа появлений.
    this.mouseAppearances++;
    this.advanceHoleBlock();
    this.advanceActiveItem();
    this.tryOfferItem();
  }

  private tryPendingFieldActions(freedHole?: Hole): void {
    if (this.state.phase !== 'playing' || this.state.gameStage < 3 || this.state.lives === 0) return;
    if (this.holeBlock) {
      if (this.holeBlock.holes.length < this.holeBlock.target) this.fillBlockGroup(freedHole);
    } else {
      this.tryOfferItem(freedHole);
    }
  }

  private tryOfferItem(freedHole?: Hole): void {
    const offer = this.nextItem;
    if (!offer || this.mouseAppearances < offer.at || this.activeItem ||
      this.holeBlock) return;

    const type = offer.guaranteedCheese ? 'cheese' : this.chooseUsefulItemType();
    const hole = this.field.spawnUsefulItem(type, freedHole);
    if (!hole) return; // Наступивший срок остаётся в силе до освобождения норы.
    this.nextItem = undefined;
    this.activeItem = { hole, expiresAt: this.mouseAppearances + BALANCE.usefulItemVisibleAppearances };
    this.field.updateItemCount(hole, BALANCE.usefulItemVisibleAppearances);
  }

  private advanceActiveItem(): void {
    if (!this.activeItem) return;
    const { hole, expiresAt } = this.activeItem;
    const remaining = expiresAt - this.mouseAppearances;
    if (remaining > 0) {
      this.field.updateItemCount(hole, remaining);
      return;
    }
    this.activeItem = undefined;
    this.field.clearItem(hole);
    this.scheduleNextItem();
  }

  private chooseUsefulItemType(): UsefulItemType {
    const { cheese, bigCheese, heart } = BALANCE.usefulItemChances;
    const heartWeight = this.state.lives < BALANCE.startLives ? heart : 0;
    const roll = Math.random() * (cheese + bigCheese + heartWeight);
    if (roll < cheese) return 'cheese';
    return roll < cheese + bigCheese ? 'bigCheese' : 'heart';
  }

  private scheduleNextItem(): void {
    if (this.holeBlock) return;
    const appearances = Phaser.Math.Between(BALANCE.usefulItemWaitMinAppearances, BALANCE.usefulItemWaitMaxAppearances);
    this.nextItem = { at: this.mouseAppearances + appearances, guaranteedCheese: false };
  }

  private collectUsefulItem(hole: Hole): void {
    const type = hole.itemType;
    if (!type) return;
    this.activeItem = undefined;
    this.nextItem = undefined;
    if (type !== 'heart') {
      // Нора сыра участвует в случайном выборе вместе с другими свободными норами.
      this.field.clearItem(hole, { animate: false, notify: false });
      this.applyCheese(BALANCE.cheeseBlockedHoles[type]);
      if (type === 'bigCheese') this.ui.showBigCheeseNotice();
      return;
    }

    this.field.clearItem(hole);
    const restored = this.state.restoreLife();
    this.ui.showLifeRestored(hole.x, hole.y, restored);
    this.scheduleNextItem();
  }

  private applyCheese(target: number): void {
    const group = this.holeBlock ??= { holes: [], target };
    group.target = Math.max(group.target, target);
    if (group.expiresAt !== undefined) group.expiresAt = this.mouseAppearances + BALANCE.cheeseBlockAppearances;
    this.fillBlockGroup();
  }

  private fillBlockGroup(freedHole?: Hole): void {
    const group = this.holeBlock;
    if (!group) return;
    while (group.holes.length < group.target) {
      const hole = this.field.blockHole(freedHole);
      if (!hole) break;
      group.holes.push(hole);
      if (freedHole) break;
    }
    const firstHole = group.holes[0];
    if (firstHole && group.expiresAt === undefined) {
      group.expiresAt = this.mouseAppearances + BALANCE.cheeseBlockAppearances;
      if (group.target === BALANCE.cheeseBlockedHoles.cheese) {
        this.ui.feedback(firstHole.x, firstHole.y, 'Нора закрыта!', COLORS.buttonPressed);
      }
    }
    this.updateBlockIndicators();
  }

  private advanceHoleBlock(): void {
    const group = this.holeBlock;
    if (group?.expiresAt === undefined) return;
    if (this.mouseAppearances >= group.expiresAt) {
      this.holeBlock = undefined;
      for (const hole of group.holes) this.field.unblockHole(hole);
      this.scheduleNextItem();
    }
    this.updateBlockIndicators();
  }

  private updateBlockIndicators(): void {
    const group = this.holeBlock;
    const remaining = group?.expiresAt === undefined ? undefined : group.expiresAt - this.mouseAppearances;
    if (group && remaining !== undefined) {
      for (const hole of group.holes) this.field.updateBlockCount(hole, remaining);
    }
    this.ui.updateBlockGroup(group?.holes.length, remaining);
  }

  private resetAppearanceEffects(): void {
    this.mouseAppearances = 0;
    this.nextItem = undefined;
    this.activeItem = undefined;
    this.holeBlock = undefined;
  }

  private playPhaseSignal(stage: TransitionStage): void {
    if (!BALANCE.phaseSignalSoundEnabled || typeof AudioContext === 'undefined') return;
    try {
      const context = this.phaseAudio ?? new AudioContext();
      this.phaseAudio = context;
      const play = () => {
        if (this.phaseAudio !== context || context.state === 'closed' ||
          !this.state.isTransitioning || this.state.gameStage !== stage) return;
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = 'sine';
        const mid = now + BALANCE.phaseSignalMs / 2_000;
        oscillator.frequency.setValueAtTime(stage === 4 ? 523 : 460, now);
        oscillator.frequency.linearRampToValueAtTime(stage === 4 ? 659 : 680, mid);
        if (stage === 4) oscillator.frequency.linearRampToValueAtTime(784, now + BALANCE.phaseSignalMs / 1_000);
        volume.gain.setValueAtTime(0.0001, now);
        volume.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, now + BALANCE.phaseSignalMs / 1_000);
        oscillator.connect(volume);
        volume.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + BALANCE.phaseSignalMs / 1_000);
      };
      if (context.state === 'suspended') {
        void context.resume().then(play).catch(() => undefined);
      } else {
        play();
      }
    } catch {
      this.phaseAudio = undefined;
    }
  }

  private missMouse(hole: Hole): void {
    if (this.state.phase !== 'playing' || hole.mouse === null) return;
    const brokeStreak = this.state.miss();
    this.ui.showMiss();
    this.ui.feedback(hole.x, hole.y, '−♥', COLORS.pink);
    this.field.clearMouse(hole);
    if (this.state.lives === 0) this.endGame();
    if (brokeStreak) this.ui.showStreakNotice(false);
  }

  private endGame(): void {
    if (!this.state.end()) return;
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.resetAppearanceEffects();
    this.updateBlockIndicators();
    this.ui.hidePhaseTransition();
    this.progress.addCompletedGame(this.state.score);
    this.field.clearAll();
    this.ui.showGameOver();
  }

  private cleanup(): void {
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.resetAppearanceEffects();
    this.phaseAudio?.close().catch(() => undefined);
    this.phaseAudio = undefined;
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.off('keydown', this.handlePauseKey, this);
    this.scale.off('resize', this.layout, this);
    this.time.paused = false;
    this.pausedTweens = [];
    this.field.dispose();
    this.ui.dispose();
  }
}
