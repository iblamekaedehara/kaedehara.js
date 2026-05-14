/**
 * Shared clock store — one interval for all time-based UI updates.
 *
 * Components register their desired granularity and receive
 * the current timestamp via subscription. This eliminates
 * duplicated intervals across components and tabs.
 */

type TickListener = (now: number) => void;

const listeners = new Set<TickListener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 1000; // 1-second granularity

function start() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    const now = Date.now();
    for (const fn of listeners) fn(now);
  }, TICK_MS);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export const sharedClock = {
  subscribe(fn: TickListener): () => void {
    listeners.add(fn);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) stop();
    };
  },

  now(): number {
    return Date.now();
  },
};