// Netflix-side types

export type NetflixTitleType = 'movie' | 'series' | 'episode' | 'unknown';

export interface NetflixCard {
  /** Netflix's internal ID for the title (from card attributes) */
  netflixId: string;
  /** Display title (may be localized) */
  title: string;
  /** Release year if available */
  year?: number;
  /** movie / series / episode / unknown */
  type: NetflixTitleType;
  /** The DOM element the data was extracted from */
  element: HTMLElement;
}

export interface NetflixCardFingerprint {
  /** Stable hash of title|year|type */
  fingerprint: string;
  title: string;
  year?: number;
  type: NetflixTitleType;
}
