import type { TitleRatings } from '@/types/omdb';

export interface HoverState {
  ratings: TitleRatings;
  matchPercent?: number;
  personalizationWarming?: boolean;
}

const STYLE = `
:host { all: initial; }
.ndl-hover {
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  min-width: 260px;
  max-width: 320px;
  background: #141414;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.7);
}
.ndl-hover h3 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
}
.ndl-row { display: flex; justify-content: space-between; padding: 3px 0; }
.ndl-row .label { color: #aaa; }
.ndl-row .val { font-weight: 600; }
.ndl-meta { margin: 8px 0; color: #ccc; font-size: 12px; line-height: 1.4; }
.ndl-links { display: flex; gap: 6px; margin-top: 8px; }
.ndl-links a {
  flex: 1; text-align: center; text-decoration: none;
  padding: 5px 8px; border-radius: 4px;
  background: #2a2a2a; color: #fff; font-size: 12px;
}
.ndl-links a:hover { background: #e50914; }
.ndl-match { font-size: 15px; font-weight: 700; color: #ff4d8d; }
.ndl-warm { font-size: 11px; color: #888; }
`;

export function showHover(shadow: ShadowRoot, state: HoverState, x: number, y: number): void {
  let style = shadow.querySelector('style.ndl-hover-style');
  if (!style) {
    style = document.createElement('style');
    style.className = 'ndl-hover-style';
    style.textContent = STYLE;
    shadow.appendChild(style);
  }

  let panel = shadow.querySelector<HTMLDivElement>('.ndl-hover');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'ndl-hover';
    shadow.appendChild(panel);
  }

  const r = state.ratings;
  const year = r.year ?? '';
  const runtime = r.runtimeMinutes ? `${Math.floor(r.runtimeMinutes / 60)}h ${r.runtimeMinutes % 60}m` : '';
  panel.innerHTML = `
    <h3>${escapeHtml(r.title)} ${year ? `(${year})` : ''}</h3>
    <div class="ndl-row"><span class="label">Audience (IMDb)</span><span class="val">${r.imdbRating?.toFixed(1) ?? '—'} / 10</span></div>
    <div class="ndl-row"><span class="label">Critics (RT)</span><span class="val">${r.rtCritics !== undefined ? r.rtCritics + '%' : '—'}</span></div>
    <div class="ndl-row"><span class="label">Critics (Metacritic)</span><span class="val">${r.metacritic ?? '—'}</span></div>
    ${state.matchPercent !== undefined ? `<div class="ndl-row"><span class="label">Your match</span><span class="ndl-match">${state.matchPercent}%</span></div>${state.personalizationWarming ? '<div class="ndl-warm">Warming up — using IMDb as proxy</div>' : ''}` : ''}
    ${r.genres.length ? `<div class="ndl-meta">${escapeHtml(r.genres.join(' / '))}${runtime ? ' · ' + escapeHtml(runtime) : ''}</div>` : ''}
    ${r.plot ? `<div class="ndl-meta">${escapeHtml(r.plot)}</div>` : ''}
    <div class="ndl-links">
      <a href="https://www.imdb.com/title/${encodeURIComponent(r.imdbId)}" target="_blank" rel="noopener">IMDb</a>
      <a href="https://www.rottentomatoes.com/search?search=${encodeURIComponent(r.title)}" target="_blank" rel="noopener">RT</a>
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(r.title + ' ' + year + ' trailer')}" target="_blank" rel="noopener">Trailer</a>
    </div>
  `;

  // Position near cursor, clamped to viewport
  const rect = panel.getBoundingClientRect();
  const px = Math.min(x + 14, window.innerWidth - rect.width - 8);
  const py = Math.min(y + 14, window.innerHeight - rect.height - 8);
  panel.style.left = `${px}px`;
  panel.style.top = `${py}px`;
}

export function hideHover(shadow: ShadowRoot): void {
  const panel = shadow.querySelector('.ndl-hover');
  if (panel) panel.remove();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
