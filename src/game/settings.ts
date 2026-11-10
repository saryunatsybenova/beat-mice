/** Единственное место для настройки правил и сложности. Все времена — в мс. */
export const BALANCE = {
  durationMs: 90_000,
  hitPoints: 1,
  missLives: 1,
  startLives: 5,
  gridCols: 3,
  gridRows: 3,
  mouseHitRadius: 58,
  phase2Score: 10,
  phaseTransitionMs: 1_200,
  phaseShakeMs: 300,
  phaseShakeAmplitude: 4,
  phaseSignalMs: 280,
  phase2TintAlpha: 0.08,
  phases: {
    1: { spawnIntervalMs: 1_400, mouseVisibleMs: 1_400 },
    2: { spawnIntervalMs: 1_100, mouseVisibleMs: 1_000 },
  },
} as const;
