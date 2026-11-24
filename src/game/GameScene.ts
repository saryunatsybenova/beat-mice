import Phaser from 'phaser';
import { GameState, type TransitionStage } from './GameState';
import { GardenVisitors } from './GardenVisitors';
import { GardenEvents } from './GardenEvents';
import { GardenEventEffects } from './GardenEventEffects';
import { MouseField, type Hole } from './MouseField';
import { GameUI } from './ui/GameUI';
import { availableItems, drawUsefulItem } from './itemBalance';
import { BALANCE, GARDEN_EVENTS } from './settings';
import { COLORS } from './theme';
import { ProgressStore } from './ProgressStore';
import type { MouseType } from './visuals';

/** Связывает правила, поле и интерфейс; здесь остаются ввод и жизненный цикл Phaser. */
export class GameScene extends Phaser.Scene {
  private readonly state = new GameState();
  private readonly progress = new ProgressStore();
  private readonly gardenEvents = new GardenEvents();
  private field!: MouseField;
  private visitors!: GardenVisitors;
  private eventEffects!: GardenEventEffects;
  private ui!: GameUI;
  private pausedTweens: Phaser.Tweens.Tween[] = [];
  private phaseTransitionTimer?: Phaser.Time.TimerEvent;
  private eventWarningTimer?: Phaser.Time.TimerEvent;
  private mouseAppearances = 0;
  private predictionsRemaining = 0;
  private cloverRemaining = 0;
  private flowerActive = false;
  private nextItem?: { at: number; guaranteedCheese: boolean };
  private activeItem?: { hole: Hole; expiresAt: number };
  private holeBlock?: { holes: Hole[]; target: number; expiresAt?: number };
  private signalAudio?: AudioContext;
  private signalOscillator?: OscillatorNode;
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
    this.field = new MouseField(this, hole => this.tryPendingFieldActions(hole),
      (hole, predicted, convertedByClover) => this.handleMouseAppeared(hole, predicted, convertedByClover));
    this.visitors = new GardenVisitors(this);
    this.eventEffects = new GardenEventEffects(this);
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

  update(_time: number, delta: number): void {
    if (this.state.phase !== 'playing' || this.state.lives === 0) return;
    if (this.gardenEvents.prepare(this.mouseAppearances)) this.showEventWarning();
    this.visitors.update(this.state.gameStage, this.mouseAppearances, delta, !this.gardenEvents.current);
    this.eventEffects.update(delta, this.activeGardenEvent);
  }

  private layout(): void {
    const portrait = this.scale.width < this.scale.height;
    const compact = !portrait && this.scale.height < 480;
    const width = portrait ? 480 : compact ? 800 : 960;
    const height = portrait ? 760 : compact ? 500 : 640;
    const zoom = Math.min(this.scale.width / width, this.scale.height / height);
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
    this.field.resize(width, height);
    this.eventEffects.resize(this.field.gardenBounds);
    this.visitors.resize(this.field.gardenBounds, this.field.holes[0].y, this.field.holes[BALANCE.gridCols].y, compact);
    this.ui.resize(width, height);
    this.updateBlockIndicators();
    this.ui.updatePredictions(this.predictionsRemaining);
    this.ui.updateClover(this.cloverRemaining);
    this.ui.updateFlower(this.flowerActive);
    this.updateEventPresentation();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state.phase !== 'playing') return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.field.isBlockedAt(point.x, point.y) || this.field.isPredictionAt(point.x, point.y)) return;
    const item = this.field.findItem(point.x, point.y);
    if (item) {
      this.collectUsefulItem(item);
      return;
    }
    const hole = this.field.findMouse(point.x, point.y);
    if (hole) {
      this.hitMouse(hole);
    } else {
      const emptyHole = this.field.findEmptyHole(point.x, point.y);
      if (emptyHole) this.handleMistake(emptyHole, 'empty');
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
    if (phase === 'playing') this.stopSignal();
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
    const warn = this.state.gameStage >= 4 ? () => this.warnAboutMouse() : undefined;
    this.field.scheduleSpawns(this.spawnIntervalMs, () => this.spawnMouse(), warn);
  }

  private get activeGardenEvent() {
    const event = this.gardenEvents.current;
    return event?.status === 'active' ? event.type : undefined;
  }

  private get spawnIntervalMs(): number {
    return this.state.spawnIntervalMs * (this.activeGardenEvent === 'invasion' ? GARDEN_EVENTS.invasionSpawnMultiplier : 1);
  }

  private get goldenLimit(): number {
    return this.activeGardenEvent === 'goldRush' ? GARDEN_EVENTS.goldRushGoldenLimit : GARDEN_EVENTS.normalGoldenLimit;
  }

  private warnAboutMouse(): void {
    if (this.state.phase !== 'playing' || this.predictionsRemaining === 0) return;
    this.field.reserveMouse(this.chooseMouseType(), this.cloverRemaining, this.flowerActive, this.goldenLimit);
  }

  private spawnMouse(): void {
    if (this.state.phase !== 'playing' || this.state.lives === 0) return;
    const miss = (hole: Hole) => this.handleMistake(hole, 'miss');
    const visibleMs = this.state.mouseVisibleMs;
    if (this.field.predictedType) this.field.spawnPredictedMouse(visibleMs, miss);
    else this.field.spawnMouse(visibleMs, miss, this.chooseMouseType(),
      this.cloverRemaining, this.flowerActive, this.goldenLimit);
  }

  private chooseMouseType(): MouseType {
    if (this.state.gameStage < 2) return 'normal';

    const { normal, decoy, golden, helmet } = this.activeGardenEvent === 'goldRush'
      ? GARDEN_EVENTS.goldRushMouseWeights : BALANCE.phase2MouseChances;
    const roll = Math.random() * (normal + decoy + golden + helmet);
    if (roll < normal) return 'normal';
    if (roll < normal + decoy) return 'decoy';
    if (roll < normal + decoy + golden) return 'golden';
    if (roll < normal + decoy + golden + helmet) return 'helmet';
    return 'normal';
  }

  private hitMouse(hole: Hole): void {
    if (this.state.phase !== 'playing' || hole.mouse === null) return;
    if (hole.mouseType === 'friendly') {
      const restored = this.state.restoreLife(this.mouseAppearances, BALANCE.friendlyMouseLifeGain);
      this.field.clearMouse(hole, true);
      this.ui.showLifeRestored(hole.x, hole.y, restored);
      return;
    }
    if (hole.mouseType === 'decoy') {
      this.handleMistake(hole, 'decoy');
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
    if (hole.mouse === null) return;
    const reward = this.state.hit(basePoints);
    if (!reward) return;
    this.progress.recordScore(this.state.score);
    const newRecord = this.hadRecordAtGameStart && !this.showedRecordNotification &&
      this.state.score > this.bestScoreAtGameStart;
    if (newRecord) this.showedRecordNotification = true;
    this.ui.updateScore(newRecord);
    const label = reward.coinBonus > 0
      ? `+${reward.points - reward.coinBonus} +${reward.coinBonus}` : `+${reward.points}`;
    this.ui.feedback(hole.x, hole.y, label, COLORS.buttonPressed);
    if (reward.coinBonus > 0) this.ui.showCoinSpent();
    this.field.clearMouse(hole, true);
    if (reward.enteredPhase) this.startPhaseTransition(reward.enteredPhase);
    if (this.state.streak === BALANCE.streakThreshold) this.ui.showStreakNotice(true);
    else this.ui.updateStreak();
  }

  private startPhaseTransition(stage: TransitionStage): void {
    if (this.eventWarningTimer) this.eventWarningTimer.paused = true;
    this.stopSignal();
    this.updateEventPresentation();
    this.eventEffects.setSuspended(true);
    this.visitors.hide();
    this.field.clearMice(true);
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
      if (stage === 2) {
        this.visitors.startCounting(this.mouseAppearances);
        this.gardenEvents.startCounting(this.mouseAppearances);
      }
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
      if (this.eventWarningTimer) this.eventWarningTimer.paused = false;
      this.updateEventPresentation();
      this.eventEffects.setSuspended(false);
      this.ui.updateStreak();
      this.tryPendingFieldActions();
      this.scheduleSpawns();
      if (stage < 4) this.spawnMouse();
    });
  }

  private handleMouseAppeared(hole: Hole, predicted: boolean, convertedByClover: boolean): void {
    if (this.state.phase !== 'playing' || this.state.lives === 0) return;
    // Сначала учитываем мышь, затем обновляем действующие эффекты и предлагаем предмет.
    // Новые сроки считаются от уже обновлённого числа появлений.
    this.mouseAppearances++;
    if (hole.mouseType === 'friendly') {
      this.flowerActive = false;
      this.ui.updateFlower(false);
      this.ui.showFriendlyMouse();
    }
    if (predicted && this.predictionsRemaining > 0) {
      this.predictionsRemaining--;
      this.ui.updatePredictions(this.predictionsRemaining);
    }
    if (convertedByClover && this.cloverRemaining > 0) {
      this.cloverRemaining--;
      this.ui.updateClover(this.cloverRemaining);
      this.ui.showCloverTransformation(hole.x, hole.y);
    }
    this.advanceHoleBlock();
    this.advanceActiveItem();
    this.tryOfferItem();
    const event = this.gardenEvents.current;
    if (event?.status === 'active') {
      this.eventEffects.onMouseAppeared(event.type, hole);
      this.gardenEvents.onMouseAppeared(this.mouseAppearances);
      if (!this.gardenEvents.current && event.type === 'invasion') this.field.setSpawnInterval(this.spawnIntervalMs);
      this.updateEventPresentation();
    }
  }

  private showEventWarning(): void {
    this.updateEventPresentation();
    this.eventWarningTimer = this.time.delayedCall(GARDEN_EVENTS.warningMs, () => {
      this.eventWarningTimer = undefined;
      this.gardenEvents.activate();
      this.updateEventPresentation();
      const event = this.gardenEvents.current;
      if (event?.status === 'active') {
        this.eventEffects.start(event.type, this.ui.gardenEventLabelPosition, this.field.holes);
      }
      if (event?.type === 'invasion') {
        this.field.setSpawnInterval(this.spawnIntervalMs);
        this.playSignal(GARDEN_EVENTS.invasionSignalFrequencies, GARDEN_EVENTS.invasionSignalMs,
          () => this.state.phase === 'playing' && this.gardenEvents.current === event);
      }
    });
  }

  private updateEventPresentation(): void {
    const event = this.state.isTransitioning ? undefined : this.gardenEvents.current;
    this.ui.updateGardenEvent(event);
    this.field.setEventAccent(event?.status === 'active' ? event.type : undefined);
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
    if (this.state.phase !== 'playing' || this.state.gameStage < 3 || this.state.lives === 0) return;
    const offer = this.nextItem;
    if (!offer || this.mouseAppearances < offer.at || this.activeItem ||
      this.holeBlock) return;

    const choices = availableItems(this.state.gameStage, {
      canOfferHealing: this.state.canOfferHealing(this.mouseAppearances),
      hasShield: this.state.hasShield,
      hasCoinBonus: this.state.hasCoinBonus,
      hasFlowerCharge: this.flowerActive || this.field.predictedType === 'friendly',
    });
    if (!offer.guaranteedCheese && choices.length === 0) {
      this.scheduleNextItem();
      return;
    }
    const hole = this.field.spawnUsefulItem(
      () => offer.guaranteedCheese ? 'cheese' : drawUsefulItem(choices), freedHole);
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
    if (type === 'cheese' || type === 'bigCheese') {
      // Нора сыра участвует в случайном выборе вместе с другими свободными норами.
      this.field.clearItem(hole, { animate: false, notify: false });
      this.applyCheese(BALANCE.cheeseBlockedHoles[type]);
      if (type === 'bigCheese') this.ui.showBigCheeseNotice();
      return;
    }

    this.field.clearItem(hole, { animate: type === 'heart' });
    if (type === 'shield') {
      this.ui.showShieldPickup(this.state.activateShield());
    } else if (type === 'glasses') {
      this.predictionsRemaining = BALANCE.glassesPredictions;
      this.ui.updatePredictions(this.predictionsRemaining);
      this.ui.showGlassesPickup();
    } else if (type === 'clover') {
      this.cloverRemaining = BALANCE.cloverConversions;
      this.ui.updateClover(this.cloverRemaining);
      this.ui.showCloverPickup();
    } else if (type === 'coin') {
      this.state.activateCoinBonus();
      this.ui.showCoinPickup();
    } else if (type === 'flower') {
      this.flowerActive = true;
      this.ui.updateFlower(true);
      this.ui.showFlowerPickup();
    } else {
      this.ui.showLifeRestored(hole.x, hole.y, this.state.restoreLife(this.mouseAppearances));
    }
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
    this.eventWarningTimer?.remove();
    this.eventWarningTimer = undefined;
    this.gardenEvents.reset();
    this.eventEffects.clear();
    this.stopSignal();
    this.visitors.clear();
    this.mouseAppearances = 0;
    this.predictionsRemaining = 0;
    this.cloverRemaining = 0;
    this.flowerActive = false;
    this.nextItem = undefined;
    this.activeItem = undefined;
    this.holeBlock = undefined;
  }

  private playPhaseSignal(stage: TransitionStage): void {
    this.playSignal(stage >= 4 ? [523, 659, 784] : [460, 680], BALANCE.phaseSignalMs,
      () => this.state.isTransitioning && this.state.gameStage === stage);
  }

  private playSignal(frequencies: readonly number[], durationMs: number, isCurrent: () => boolean): void {
    if (!BALANCE.phaseSignalSoundEnabled || typeof AudioContext === 'undefined') return;
    try {
      const context = this.signalAudio ?? new AudioContext();
      this.signalAudio = context;
      const play = () => {
        if (this.signalAudio !== context || context.state === 'closed' || !isCurrent()) return;
        this.stopSignal();
        const now = context.currentTime;
        const duration = durationMs / 1_000;
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequencies[0], now);
        frequencies.slice(1).forEach((frequency, index) => {
          oscillator.frequency.linearRampToValueAtTime(frequency, now + duration * (index + 1) / 2);
        });
        volume.gain.setValueAtTime(0.0001, now);
        volume.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(volume);
        volume.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          volume.disconnect();
          if (this.signalOscillator === oscillator) this.signalOscillator = undefined;
        };
        oscillator.start(now);
        oscillator.stop(now + duration);
        this.signalOscillator = oscillator;
      };
      if (context.state === 'suspended') {
        void context.resume().then(play).catch(() => undefined);
      } else {
        play();
      }
    } catch {
      this.signalAudio = undefined;
    }
  }

  private stopSignal(): void {
    this.signalOscillator?.stop();
    this.signalOscillator = undefined;
  }

  private handleMistake(hole: Hole, kind: 'miss' | 'decoy' | 'empty'): void {
    const losesLife = kind !== 'empty';
    if (losesLife && hole.mouse === null) return;
    const outcome = this.state.applyMistake(losesLife);
    if (!outcome) return;

    if (losesLife) this.field.clearMouse(hole, kind === 'decoy');
    if (outcome.protected) {
      this.ui.showShieldSaved();
      return;
    }

    if (losesLife) {
      this.ui.showMiss();
      if (kind === 'decoy') this.ui.showDecoyWarning();
      this.ui.feedback(hole.x, hole.y, '−♥', COLORS.pink);
      if (this.state.lives === 0) this.endGame();
    }
    if (outcome.brokeStreak) this.ui.showStreakNotice(false);
  }

  private endGame(): void {
    if (!this.state.end()) return;
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.resetAppearanceEffects();
    this.updateEventPresentation();
    this.updateBlockIndicators();
    this.ui.updateShield();
    this.ui.updateCoin();
    this.ui.updatePredictions(0);
    this.ui.updateClover(0);
    this.ui.updateFlower(false);
    this.ui.hidePhaseTransition();
    this.progress.addCompletedGame(this.state.score);
    this.field.clearAll();
    this.ui.showGameOver();
  }

  private cleanup(): void {
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.resetAppearanceEffects();
    this.state.clearShield();
    this.state.clearCoinBonus();
    this.signalAudio?.close().catch(() => undefined);
    this.signalAudio = undefined;
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.off('keydown', this.handlePauseKey, this);
    this.scale.off('resize', this.layout, this);
    this.time.paused = false;
    this.pausedTweens = [];
    this.field.dispose();
    this.ui.dispose();
  }
}
