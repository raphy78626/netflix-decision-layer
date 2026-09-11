import { getSettings, setSettings } from '@/storage/settings';
import { getStatus } from '@/background/rate-limiter';

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

async function init(): Promise<void> {
  const s = await getSettings();
  const overlay = byId<HTMLInputElement>('overlayEnabled');
  const filter = byId<HTMLInputElement>('filterEnabled');
  const pers = byId<HTMLInputElement>('personalizationEnabled');
  const status = byId<HTMLDivElement>('status');
  const optionsLink = byId<HTMLAnchorElement>('options');

  if (overlay) overlay.checked = s.overlayEnabled;
  if (filter) filter.checked = s.filterEnabled;
  if (pers) pers.checked = s.personalizationEnabled;

  overlay?.addEventListener('change', () => void setSettings({ overlayEnabled: overlay.checked }));
  filter?.addEventListener('change', () => void setSettings({ filterEnabled: filter.checked }));
  pers?.addEventListener('change', () => void setSettings({ personalizationEnabled: pers.checked }));

  optionsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const st = await getStatus();
  if (status) {
    if (!s.omdbApiKey) {
      status.textContent = 'No OMDb API key set. Open settings to add one.';
    } else {
      status.textContent = `OMDb usage: ${st.dayCount}/${st.dayLimit} today`;
    }
  }
}

void init();
