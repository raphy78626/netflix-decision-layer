# Contributing to Decision Layer

Thanks for your interest in improving Decision Layer! The most valuable contributions fall into three buckets:

1. **New platform adapters** — support another streaming site (e.g. Disney+, Max, Hulu, Crunchyroll).
2. **Selector fixes** — when a supported site redesigns and cards stop being detected.
3. **Core improvements** — resolver accuracy, cache efficiency, the preference model, tests.

The shared core (resolver, IndexedDB cache, overlay, filter, preferences) is **platform-agnostic** and keyed by a platform-prefixed fingerprint. For site-specific breakage, only the adapter selectors should need to change.

## Adding / tuning a platform adapter

Adapters live in `src/content/platforms/<platform>.ts` and implement the `PlatformAdapter` interface from `src/content/platforms/platform.ts`:

```ts
export interface PlatformAdapter {
  readonly id: 'netflix' | 'hotstar' | 'primevideo' | /* your new id */ string;
  readonly name: string;
  matchesHost(host: string): boolean;
  findCards(root: ParentNode): HTMLElement[];
  extractCard(el: HTMLElement): TitleCard | null;
  getCardId(el: HTMLElement): string | undefined;
}
```

### Step-by-step

1. **Probe the live DOM.** Run the auto-probe against the target site (headed Chromium, persistent profile — log in / browse to a card grid first):

   ```bash
   npm run probe:<platform>      # add a script entry in package.json if missing
   ```

   The probe dumps selector match counts, sample card HTML, and a screenshot into `probe-<platform>.{json,png}`.

2. **Write the adapter.** Set `CARD_LINK_SELECTORS` to the anchors that uniquely identify a title card (prefer numeric ID-bearing hrefs). Set `NON_CARD_ANCESTOR_SELECTORS` to exclude nav / CTA / episode / ad chrome. Extract title from the most reliable attribute (usually `aria-label`, then `img[alt]` with a generic-name denylist). Extract the stable ID from the href or a `data-*` attribute.

3. **Register the adapter** in `src/content/platforms/platform.ts` (`ADAPTERS` array + `getActivePlatform`).

4. **Add the manifest matches.** Update `manifest.json` `host_permissions` and `content_scripts.matches` for the new domain(s).

5. **Add a DOM-shape test.** Create `tests/dom-shapes-<platform>.test.ts` built from the real captured DOM (see `tests/dom-shapes-prime.test.ts` as a template). Verify card extraction, ID/title parsing, and exclusion of nav/episode/ad cards.

6. **Update the platform status table** in the README.

## Development setup

```bash
npm install
npm run dev          # Vite + CRXJS HMR
npm run build        # outputs dist/
npm test             # Vitest unit tests
npm run typecheck    # tsc --noEmit
```

Load the unpacked extension from `dist/` via `chrome://extensions` → Developer mode → Load unpacked.

## Before opening a PR

- `npm run typecheck` passes.
- `npm test` passes (add tests for any new adapter logic).
- If you tuned selectors, include the `tests/dom-shapes-<platform>.test.ts` covering the real DOM you probed.
- Don't commit your OMDb API key, Playwright profiles, or probe output (`probe-*.json`, `probe-*.png`, `.playwright-profile-*/` are gitignored).
- Keep the shared core platform-agnostic — site-specific logic belongs in the adapter only.

## Reporting selector breakage

If a supported site stops showing badges after a redesign, please open an issue with:

- The site + URL where it broke.
- A paste of the new card's outer HTML (right-click a title card → Inspect → copy the `<a>` link's nearest container).
- Any `[NDL]` console messages.

`[NDL]` logs (prefixed in the page console) tell you exactly what the adapter found and what it rejected — that output is the fastest way to retune selectors.

## Code of conduct

Be kind and constructive. Attribute trademarks correctly in any new docs (IMDb / RT / Metacritic / Netflix / Hotstar / Prime Video belong to their owners; we're not affiliated).

## License

By contributing, you agree your contributions are licensed under the project's [MIT License](LICENSE).
