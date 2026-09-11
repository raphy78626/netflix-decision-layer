// User signals feed into the preference model.
// Signals: hover (>2s), click into title, watched, not-for-me, thumbs up/down.

export type SignalKind = 'hover' | 'click' | 'watched' | 'notforme' | 'thumbUp' | 'thumbDown';

export interface Signal {
  kind: SignalKind;
  imdbId: string;
  title: string;
  genres: string[];
  year?: number;
  runtimeMinutes?: number;
  type: 'movie' | 'series';
  at: number;
}

// Signal weights — how strongly each signal updates the preference vector
export const SIGNAL_WEIGHT: Record<SignalKind, number> = {
  hover: 0.3,
  click: 0.7,
  watched: 1.5,
  notforme: -1.5,
  thumbUp: 1.0,
  thumbDown: -1.0,
};

const HOVER_THRESHOLD_MS = 2000;

export function shouldRecordHover(hoverMs: number): boolean {
  return hoverMs >= HOVER_THRESHOLD_MS;
}
