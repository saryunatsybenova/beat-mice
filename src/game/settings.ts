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
  phases: {
    1: { spawnIntervalMs: 1_200, mouseVisibleMs: 1_000 },
    2: { spawnIntervalMs: 800, mouseVisibleMs: 700 },
  },
} as const;
