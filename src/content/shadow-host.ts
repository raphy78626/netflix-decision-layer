// Shadow DOM host helper — isolates our injected UI from Netflix CSS.

export function createShadowHost(id: string): { host: HTMLElement; root: ShadowRoot } {
  let host = document.getElementById(id) as HTMLElement | null;
  if (host && host.shadowRoot) {
    return { host, root: host.shadowRoot };
  }
  if (!host) {
    host = document.createElement('div');
    host.id = id;
    host.style.cssText = 'all: initial;';
    document.documentElement.appendChild(host);
  }
  const root = host.attachShadow({ mode: 'open' });
  return { host, root };
}

/** Attach a Shadow DOM to a Netflix card for badges/hover card */
export function attachCardShadow(card: HTMLElement): ShadowRoot {
  let host = card.querySelector<HTMLElement>(':scope > .ndl-card-host');
  if (host && host.shadowRoot) return host.shadowRoot;
  host = document.createElement('div');
  host.className = 'ndl-card-host';
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
  // Ensure card is positioned
  const cs = getComputedStyle(card);
  if (cs.position === 'static') card.style.position = 'relative';
  card.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

/**
 * Remove any badge/hover shadow we attached to a card.
 * Used when Netflix reuses a DOM node for a DIFFERENT title (rows recycle
 * elements when they re-render): the old badge would otherwise keep showing
 * the previous title's rating on the new title's tile.
 */
export function discardCardShadow(card: HTMLElement): void {
  card.querySelectorAll<HTMLElement>(':scope > .ndl-card-host').forEach((h) => h.remove());
}
