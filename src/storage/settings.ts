// chrome.storage.local wrapper for user settings.
//
// We use .local (not .sync) deliberately: .sync has a 1,800-writes-per-10-minutes
// quota that the threshold sliders can blow through (they fire on every `input`
// event), causing silent write failures — including for the OMDb API key save.
// .local has a 10 MB quota and no sync rate limits. Cross-device sync is a fair
// trade-off for reliability.

export interface Settings {
  omdbApiKey: string;
  overlayEnabled: boolean;
  filterEnabled: boolean;
  personalizationEnabled: boolean;
  minImdb: number; // 0-10
  minRt: number; // 0-100
  minMetacritic: number; // 0-100
  filterMode: 'hide' | 'fade';
}

export const DEFAULT_SETTINGS: Settings = {
  omdbApiKey: '',
  overlayEnabled: true,
  filterEnabled: false,
  personalizationEnabled: true,
  minImdb: 0,
  minRt: 0,
  minMetacritic: 0,
  filterMode: 'fade',
};

const KEY = 'ndl_settings';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [KEY]: next }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(`storage.local.set failed: ${err.message}`));
      else resolve();
    });
  });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area === 'local' && changes[KEY]) {
      cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
}
