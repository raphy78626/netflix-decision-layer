import { getSettings, setSettings, type Settings } from '@/storage/settings';
import { getVector, resetVector } from '@/storage/preferences';
import { omdbSearch } from '@/background/omdb-client';

async function init(): Promise<void> {
  const s = await getSettings();
  bindField('omdbApiKey', s, 'omdbApiKey', 'text');
  bindToggle('filterEnabled', s, 'filterEnabled');
  bindSelect('filterMode', s, 'filterMode');
  bindRange('minImdb', s, 'minImdb', 1);
  bindRange('minRt', s, 'minRt', 0);
  bindRange('minMetacritic', s, 'minMetacritic', 0);
  bindToggle('overlayEnabled', s, 'overlayEnabled');
  bindToggle('personalizationEnabled', s, 'personalizationEnabled');

  document.getElementById('saveBtn')?.addEventListener('click', async () => {
    const apiKey = (document.getElementById('omdbApiKey') as HTMLInputElement).value.trim();
    if (!apiKey) {
      showMsg('Enter an API key first.', false);
      return;
    }
    try {
      await setSettings({ omdbApiKey: apiKey });
      // Read back to confirm it actually persisted
      const readBack = await getSettings();
      if (readBack.omdbApiKey === apiKey) {
        showMsg(`Saved and verified (key starts with "${apiKey.slice(0, 4)}…").`, true);
      } else {
        showMsg(
          `Save reported success but read-back mismatch — got "${readBack.omdbApiKey || '<empty>'}". Storage may be failing.`,
          false,
        );
      }
    } catch (e) {
      showMsg(`Save failed: ${(e as Error).message}`, false);
    }
  });

  document.getElementById('validateBtn')?.addEventListener('click', async () => {
    const apiKey = (document.getElementById('omdbApiKey') as HTMLInputElement).value.trim();
    if (!apiKey) return showMsg('Enter an API key first.', false);
    try {
      const res = await omdbSearch({ title: 'Inception', year: 2010, type: 'movie', apiKey });
      if (res.Response === 'True') {
        // Also persist the validated key so the service worker can use it
        await setSettings({ omdbApiKey: apiKey });
        showMsg('Valid key. OMDb reachable. Saved.', true);
      } else showMsg(`OMDb error: ${res.Error ?? 'unknown'}`, false);
    } catch (e) {
      showMsg(`Validation failed: ${(e as Error).message}`, false);
    }
  });

  document.getElementById('resetPrefsBtn')?.addEventListener('click', async () => {
    await resetVector();
    await renderAffinity();
    showMsg('Preferences reset.', true);
  });

  await renderAffinity();
}

function showMsg(msg: string, ok: boolean): void {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = msg;
  el.className = `msg ${ok ? 'ok' : 'err'}`;
}

function bindField(id: keyof Settings, s: Settings, key: keyof Settings, _kind: 'text' | 'number'): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.value = String(s[key] ?? '');
  el.addEventListener('change', () => void setSettings({ [key]: el.value } as Partial<Settings>));
}

function bindToggle(id: keyof Settings, s: Settings, key: keyof Settings): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.checked = Boolean(s[key]);
  el.addEventListener('change', () => void setSettings({ [key]: el.checked } as Partial<Settings>));
}

function bindSelect(id: keyof Settings, s: Settings, key: keyof Settings): void {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (!el) return;
  el.value = String(s[key]);
  el.addEventListener('change', () => void setSettings({ [key]: el.value } as Partial<Settings>));
}

function bindRange(id: keyof Settings, s: Settings, key: keyof Settings, decimals: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  const valEl = document.getElementById(`${id}Val`);
  if (!el) return;
  el.value = String(s[key]);
  if (valEl) valEl.textContent = decimals > 0 ? Number(s[key]).toFixed(decimals) : String(s[key]);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (valEl) valEl.textContent = decimals > 0 ? v.toFixed(decimals) : String(v);
    void setSettings({ [key]: v } as Partial<Settings>);
  });
}

async function renderAffinity(): Promise<void> {
  const v = await getVector();
  const container = document.getElementById('affinity');
  if (!container) return;
  const entries = Object.entries(v.genreAffinity)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 12);
  if (entries.length === 0) {
    container.innerHTML = '<em>None yet. Hover and click titles on Netflix to teach the model.</em>';
    return;
  }
  const maxAbs = Math.max(1, ...entries.map((e) => Math.abs(e[1])));
  container.innerHTML = `<div style="font-size:12px;color:#666;margin-bottom:6px">${v.signalCount} signals recorded</div>` +
    entries
      .map(([name, val]) => {
        const pct = Math.round((Math.abs(val) / maxAbs) * 100);
        const dir = val >= 0 ? '+' : '';
        return `<div class="bar-row"><span class="name">${escapeHtml(name)}</span><div class="bar"><div class="fill" style="width:${pct}%"></div></div><span class="num">${dir}${val.toFixed(2)}</span></div>`;
      })
      .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

void init();
