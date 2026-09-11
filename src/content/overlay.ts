import type { TitleRatings } from '@/types/omdb';

export interface OverlayState {
  ratings: TitleRatings;
  matchPercent?: number;
  personalizationWarming?: boolean;
}

const STYLE = `
:host { all: initial; }
.ndl-badges {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.9);
}
.ndl-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}
.ndl-badge .ico { font-size: 10px; }
.ndl-badge.imdb { background: rgba(0,0,0,0.6); }
.ndl-badge.rt-fresh { background: rgba(20,90,30,0.85); }
.ndl-badge.rt-rotten { background: rgba(120,20,20,0.85); }
.ndl-badge.meta { background: rgba(60,60,90,0.85); }
.ndl-badge.match { background: rgba(180,40,90,0.85); }
.ndl-badge.muted { opacity: 0.5; }
`;

export function injectBadges(shadow: ShadowRoot, state: OverlayState): void {
  let style = shadow.querySelector('style.ndl-badge-style');
  if (!style) {
    style = document.createElement('style');
    style.className = 'ndl-badge-style';
    style.textContent = STYLE;
    shadow.appendChild(style);
  }

  let container = shadow.querySelector<HTMLDivElement>('.ndl-badges');
  if (!container) {
    container = document.createElement('div');
    container.className = 'ndl-badges';
    shadow.appendChild(container);
  }
  container.innerHTML = '';

  const r = state.ratings;
  // Guard against null AND undefined AND NaN (OMDb can return null/empty for ratings)
  if (typeof r.imdbRating === 'number' && Number.isFinite(r.imdbRating)) {
    container.appendChild(badge('imdb', `⭐ ${r.imdbRating.toFixed(1)}`, 'Audience (IMDb)'));
  }
  if (typeof r.rtCritics === 'number' && Number.isFinite(r.rtCritics)) {
    const cls = r.rtCritics >= 60 ? 'rt-fresh' : 'rt-rotten';
    container.appendChild(badge(cls, `🍅 ${r.rtCritics}%`, 'Critics (RT)'));
  }
  if (typeof r.metacritic === 'number' && Number.isFinite(r.metacritic)) {
    container.appendChild(badge('meta', `🎯 ${r.metacritic}`, 'Critics (Metacritic)'));
  }
  if (state.matchPercent !== undefined) {
    const label = state.personalizationWarming ? 'Match (warming up)' : 'Your match';
    container.appendChild(badge('match', `♥ ${state.matchPercent}%`, label));
  }
}

function badge(cls: string, text: string, title: string): HTMLElement {
  const b = document.createElement('div');
  b.className = `ndl-badge ${cls}`;
  b.title = title;
  b.textContent = text;
  return b;
}

/** Mark a card as unresolved (no ratings found) */
export function injectNotFound(shadow: ShadowRoot): void {
  let style = shadow.querySelector('style.ndl-badge-style');
  if (!style) {
    style = document.createElement('style');
    style.className = 'ndl-badge-style';
    style.textContent = STYLE;
    shadow.appendChild(style);
  }
  let container = shadow.querySelector<HTMLDivElement>('.ndl-badges');
  if (!container) {
    container = document.createElement('div');
    container.className = 'ndl-badges';
    shadow.appendChild(container);
  }
  container.innerHTML = '';
  const b = document.createElement('div');
  b.className = 'ndl-badge muted';
  b.textContent = '—';
  b.title = 'No ratings found';
  container.appendChild(b);
}
