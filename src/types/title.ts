// Platform-neutral title-card types shared by every streaming-site adapter.

export type TitleType = 'movie' | 'series' | 'episode' | 'unknown';

/** Which streaming site a card was detected on. */
export type PlatformId = 'netflix' | 'hotstar' | 'primevideo' | 'unknown';

export interface TitleCard {
  /** The platform this card was found on (netflix | hotstar | primevideo). */
  platform: PlatformId;
  /** The platform's internal ID for the title (numeric or slug, per platform). */
  id: string;
  /** Display title (may be localized). */
  title: string;
  /** Release year if available. */
  year?: number;
  /** movie / series / episode / unknown. */
  type: TitleType;
  /** The DOM element the data was extracted from. */
  element: HTMLElement;
}
