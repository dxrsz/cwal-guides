/** Seconds -> "m:ss", the way the game clock reads. */
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
