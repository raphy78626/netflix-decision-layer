// Platform adapter contract + registry.
//
// Each streaming site (Netflix, Jio Hotstar, Amazon Prime Video) implements
// a PlatformAdapter that knows how to find title cards on its DOM and extract
// (id, title, year, type) from them. Everything else — OMDb resolution, cache,
// overlay badges, hover card, filter, preferences — is platform-agnostic and
// lives in the shared core, keyed by the platform-prefixed fingerprint.
//
// To add a new platform: implement PlatformAdapter, register it in
// ADAPTERS below, and add its host to manifest.json content_scripts.matches.

import type { TitleCard } from '@/types/title';

export interface PlatformAdapter {
  /** Stable id used in the fingerprint prefix: 'netflix' | 'hotstar' | 'primevideo'. */
  readonly id: 'netflix' | 'hotstar' | 'primevideo';
  /** Human-readable name for logs / UI. */
  readonly name: string;
  /** Return true if this adapter handles the given hostname. */
  matchesHost(host: string): boolean;
  /** Find all title-card container elements under `root`. */
  findCards(root: ParentNode): HTMLElement[];
  /** Extract a TitleCard from a container element, or null if not a real card. */
  extractCard(el: HTMLElement): TitleCard | null;
  /** Read the platform's title id from a card element (for stale-badge detection). */
  getCardId(el: HTMLElement): string | undefined;
}

import { netflixAdapter } from './netflix';
import { hotstarAdapter } from './hotstar';
import { primevideoAdapter } from './primevideo';

export const ADAPTERS: PlatformAdapter[] = [netflixAdapter, hotstarAdapter, primevideoAdapter];

/**
 * Return the adapter whose matchesHost() accepts location.hostname, or null
 * if the current page isn't on a supported platform.
 */
export function getActivePlatform(host: string = location.hostname): PlatformAdapter | null {
  return ADAPTERS.find((a) => a.matchesHost(host)) ?? null;
}
