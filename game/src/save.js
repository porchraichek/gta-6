// Save/load to localStorage: progress, money, weapons, missions, medallions, clock and settings.

const KEY = 'palmera-nights-save-v1';
const SETTINGS_KEY = 'palmera-nights-settings-v1';

export function createSave(G) {
  const S = {};

  S.exists = () => {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  };

  S.read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
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

  S.write = (label) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S.snapshot(label)));
      return true;
    } catch { return false; }
  };

  S.manual = (label = 'Quick save') => {
    if (S.write(label)) G.hud.notify('Game saved', 'good');
    else G.hud.notify('Could not save (storage unavailable)', 'warn');
  };
  S.auto = (label) => {
    if (G.state === 'play' && S.write(label)) G.hud.notify('Progress saved', 'info');
  };

  S.summary = () => {
    const d = S.read();
    if (!d) return null;
    const done = d.missions?.completed?.length ?? 0;
    return `${done} missions, $${Math.floor(d.player?.money ?? 0).toLocaleString()}`;
  };

  S.settings = () => {
    try {
      return { sfx: 0.8, music: 0.6, sens: 1, quality: 'high', ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch { return { sfx: 0.8, music: 0.6, sens: 1, quality: 'high' }; }
  };
  S.saveSettings = (s) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  };

  S.erase = () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  return S;
}
