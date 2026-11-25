// Save/load to localStorage: three save slots (progress, money, weapons, missions, medallions, clock) plus settings.
// Legacy API kept: exists / read / write / manual / auto / summary / settings / saveSettings / erase all act on the active slot.

const SLOT_KEYS = ['palmera-nights-save-v1', 'palmera-nights-save-v1-slot2', 'palmera-nights-save-v1-slot3'];
const ACTIVE_KEY = 'palmera-nights-active-slot';
const SETTINGS_KEY = 'palmera-nights-settings-v1';
export const SLOT_COUNT = SLOT_KEYS.length;
const DEFAULT_SETTINGS = { sfx: 0.8, music: 0.6, sens: 1, quality: 'high', invertY: false };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

export function createSave(G) {
  const S = {};
  S.active = Math.max(0, Math.min(SLOT_COUNT - 1, parseInt(store.get(ACTIVE_KEY) ?? '0', 10) || 0));

  S.readSlot = (i) => {
    try { const raw = store.get(SLOT_KEYS[i]); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  S.slots = () => SLOT_KEYS.map((_, i) => S.readSlot(i));
  S.setActive = (i) => { S.active = i; store.set(ACTIVE_KEY, String(i)); };
  // most recently written slot (used by Continue)
  S.latestSlot = () => {
    let best = -1, t = -1;
    S.slots().forEach((d, i) => { if (d && (d.savedAt ?? 0) > t) { t = d.savedAt ?? 0; best = i; } });
    return best;
  };

  S.exists = () => S.latestSlot() >= 0;
  // G.startGame(true) loads through this: the active slot if it has data, else the newest one
  S.read = () => S.readSlot(S.active) ?? (S.exists() ? S.readSlot(S.latestSlot()) : null);
  S.loadSlot = (i) => {
    if (!S.readSlot(i)) return false;
    S.setActive(i);
    G.startGame(true);
    return true;
  };

  S.snapshot = (label) => ({
    version: 1,
    label,
    savedAt: Date.now(),
    hour: G.env.hour,
    player: G.player.serialize(),
    missions: G.missions.serialize(),
    medallions: [...G.pickups.collected],
    race: { wins: G.races.wins, best: G.races.best },
  });

  S.writeSlot = (i, label) => {
    const ok = store.set(SLOT_KEYS[i], JSON.stringify(S.snapshot(label)));
    if (ok) S.setActive(i);
    return ok;
  };
  S.write = (label) => S.writeSlot(S.active, label);

  S.manual = (label = 'Quick save', slot = S.active) => {
    if (S.writeSlot(slot, label)) G.hud.notify(`Game saved · Slot ${slot + 1}`, 'good');
    else G.hud.notify('Could not save (storage unavailable)', 'warn');
  };
  S.auto = (label) => {
    if (G.state === 'play' && S.write(label)) G.hud.notify('Progress saved', 'info');
  };

  S.describe = (d) => {
    if (!d) return null;
    const done = d.missions?.completed?.length ?? 0;
    const mins = Math.floor((d.player?.stats?.playTime ?? 0) / 60);
    return { label: d.label ?? 'Save', missions: done, money: Math.floor(d.player?.money ?? 0), minutes: mins, date: d.savedAt ? new Date(d.savedAt) : null };
  };
  S.summary = (i = S.latestSlot()) => {
    const s = i >= 0 ? S.describe(S.readSlot(i)) : null;
    return s ? `${s.missions} jobs · $${s.money.toLocaleString()}` : null;
  };

  S.settings = () => {
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(store.get(SETTINGS_KEY)) || {}) }; } catch { return { ...DEFAULT_SETTINGS }; }
  };
  S.saveSettings = (s) => { store.set(SETTINGS_KEY, JSON.stringify(s)); };

  S.eraseSlot = (i) => store.del(SLOT_KEYS[i]);
  S.erase = () => S.eraseSlot(S.active);

  return S;
}
