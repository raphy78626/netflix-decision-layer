// Thin dispatcher: delegates to the active platform's adapter based on the
// current hostname. The real per-platform logic lives in
// src/content/platforms/<platform>.ts.
//
// This module preserves the function names the observer and index modules
// already import (findCards, extractCard, getCardId) so the multi-platform
// refactor is transparent to the shared core.

import { getActivePlatform } from './platforms/platform';
import type { PlatformAdapter } from './platforms/platform';
import type { TitleCard } from '@/types/title';

let activeAdapter: PlatformAdapter | null = null;
function adapter(): PlatformAdapter | null {
  if (activeAdapter === null) activeAdapter = getActivePlatform();
  return activeAdapter;
}

/** The active platform id ('netflix' | 'hotstar' | 'primevideo') or null. */
export function activePlatformId(): PlatformAdapter['id'] | null {
  return adapter()?.id ?? null;
}

/** Find all title-card containers on the current page. */
export function findCards(root: ParentNode = document): HTMLElement[] {
  return adapter()?.findCards(root) ?? [];
}

/** Extract a TitleCard from a container element, or null. */
export function extractCard(card: HTMLElement): TitleCard | null {
  return adapter()?.extractCard(card) ?? null;
}

/** Read the platform title id from a card element (for stale detection). */
export function getCardId(card: HTMLElement): string | undefined {
  return adapter()?.getCardId(card);
}
