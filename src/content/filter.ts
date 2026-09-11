import type { Settings } from '@/storage/settings';
import type { TitleRatings } from '@/types/omdb';

export interface FilterDecision {
  pass: boolean;
  fade: boolean;
}

export function evaluateFilter(ratings: TitleRatings | null, settings: Settings): FilterDecision {
  if (!settings.filterEnabled) return { pass: true, fade: false };
  if (!ratings) return { pass: true, fade: false }; // don't filter what we don't have ratings for

  const passes =
    (settings.minImdb === 0 || (ratings.imdbRating ?? 0) >= settings.minImdb) &&
    (settings.minRt === 0 || (ratings.rtCritics ?? 0) >= settings.minRt) &&
    (settings.minMetacritic === 0 || (ratings.metacritic ?? 0) >= settings.minMetacritic);

  if (passes) return { pass: true, fade: false };

  if (settings.filterMode === 'hide') return { pass: false, fade: false };
  return { pass: true, fade: true };
}

export function applyFilterToCard(card: HTMLElement, decision: FilterDecision): void {
  if (decision.pass && !decision.fade) {
    card.style.opacity = '';
    card.style.pointerEvents = '';
    card.style.display = '';
    return;
  }
  if (!decision.pass) {
    card.style.display = 'none';
    return;
  }
  if (decision.fade) {
    card.style.opacity = '0.35';
    card.style.pointerEvents = 'none';
  }
}
