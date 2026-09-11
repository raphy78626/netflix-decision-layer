// OMDb API types
// Reference: https://www.omdbapi.com/

export interface OmdbRatingsEntry {
  Source: 'Internet Movie Database' | 'Rotten Tomatoes' | 'Metacritic' | string;
  Value: string; // e.g. "8.7/10", "73%", "74/100"
}

export interface OmdbResponse {
  Title?: string;
  Year?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string; // e.g. "148 min"
  Genre?: string; // e.g. "Adventure, Drama, Sci-Fi"
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Poster?: string;
  Ratings?: OmdbRatingsEntry[];
  Metascore?: string; // 0-100
  imdbRating?: string; // 0.0-10.0
  imdbVotes?: string;
  imdbID?: string; // e.g. tt1375666
  Type?: 'movie' | 'series' | 'episode';
  DVD?: string;
  BoxOffice?: string;
  Production?: string;
  Website?: string;
  Response: 'True' | 'False';
  Error?: string;
}

/** Normalized ratings record we cache and use across the extension */
export interface TitleRatings {
  imdbId: string;
  title: string;
  year?: number;
  type: 'movie' | 'series';
  imdbRating?: number; // 0-10
  imdbVotes?: number;
  rtCritics?: number; // 0-100 (Tomatometer)
  metacritic?: number; // 0-100
  genres: string[];
  runtimeMinutes?: number;
  plot?: string;
  poster?: string;
  director?: string;
  actors?: string;
  fetchedAt: number; // epoch ms
}
