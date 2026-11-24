// Menus (DOM): title screen, pause menu, controls, settings, weapon shop, full map and the ending card.
import { GAME_TITLE, CITY_NAME } from './config.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look / camera'], ['Shift', 'Sprint'], ['Space', 'Jump  /  handbrake in a car'],
  ['F', 'Enter / exit vehicle, carjack'], ['LMB', 'Punch / fire weapon'], ['RMB', 'Aim (over the shoulder)'], ['1-4 / Wheel', 'Switch weapon'],
  ['R', 'Reload  /  change radio in a car'], ['H', 'Horn'], ['C', 'Look behind (car)'], ['E', 'Interact at shops, safehouse, hospital'],
  ['M / Tab', 'City map'], ['Enter', 'Skip dialogue line'], ['F5 / F9', 'Quick save / quick load'], ['Esc / P', 'Pause'],
];

export function createMenus(G, root) {
  const M = {};
  const layer = el('div', 'menu-layer', root);

  function clear() { layer.innerHTML = ''; layer.className = 'menu-layer'; }

  function button(parent, label, fn, cls = '') {
    const b = el('button', 'menu-btn ' + cls, parent, label);
    b.addEventListener('click', () => { G.audio?.uiSelect(); fn(); });
    b.addEventListener('mouseenter', () => G.audio?.uiMove());
    return b;
  }

  M.showTitle = () => {
    clear();
    layer.classList.add('title');
    const box = el('div', 'title-box', layer);
    el('div', 'title-kicker', box, `${CITY_NAME.toUpperCase()}  ·  AN OPEN-WORLD CRIME STORY`);
    el('h1', 'title-logo', box, GAME_TITLE);
    el('div', 'title-sub', box, 'Two years inside. One city that owes you everything.');
    const col = el('div', 'menu-col', box);
    const hasSave = G.save.exists();
    if (hasSave) {
      const b = button(col, `CONTINUE <small>${G.save.summary() ?? ''}</small>`, () => G.startGame(true), 'primary');
      void b;
    }
    button(col, 'NEW GAME', () => {
      if (hasSave && !confirm('Start a new game? Your saved progress will be kept until you save again.')) return;
      G.startGame(false);
    }, hasSave ? '' : 'primary');
    button(col, 'CONTROLS', () => M.showControls(() => M.showTitle()));
    button(col, 'SETTINGS', () => M.showSettings(() => M.showTitle()));
    el('div', 'title-foot', box, 'Keyboard + mouse · best in Chrome · click NEW GAME to begin');
    G.state = 'title';
  };

  M.showControls = (back) => {
    clear();
    layer.classList.add('panelbg');
    const box = el('div', 'panel-box', layer);
    el('h2', '', box, 'CONTROLS');
    const grid = el('div', 'controls-grid', box);
    for (const [k, v] of CONTROLS) {
      el('div', 'ckey', grid, `<kbd>${k}</kbd>`);
      el('div', 'cdesc', grid, v);
    }
    button(box, 'BACK', back);
  };

  M.showSettings = (back) => {
    clear();
    layer.classList.add('panelbg');
    const box = el('div', 'panel-box', layer);
    el('h2', '', box, 'SETTINGS');
    const s = G.save.settings();
    const row = (label, key, min, max, step, fmt) => {
      const r = el('div', 'setting', box);
      el('label', '', r, label);
      const inp = el('input', '', r);
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
      const out = el('span', 'sval', r, fmt(s[key]));
      inp.addEventListener('input', () => {
        s[key] = parseFloat(inp.value);
        out.textContent = fmt(s[key]);
        G.applySettings(s);
        G.save.saveSettings(s);
      });
    };
    row('Sound effects', 'sfx', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    row('Music / radio', 'music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    row('Mouse sensitivity', 'sens', 0.3, 2.5, 0.1, (v) => v.toFixed(1) + 'x');
    const q = el('div', 'setting', box);
    el('label', '', q, 'Graphics quality');
    const sel = el('select', '', q);
    for (const o of ['low', 'medium', 'high']) {
      const opt = el('option', '', sel, o.toUpperCase());
      opt.value = o;
      if (o === s.quality) opt.selected = true;
    }
    sel.addEventListener('change', () => { s.quality = sel.value; G.applySettings(s); G.save.saveSettings(s); });
    button(box, 'BACK', back);
  };

  M.showPause = () => {
    clear();
    layer.classList.add('pausebg');
    const box = el('div', 'panel-box small', layer);
    el('h2', '', box, 'PAUSED');
    button(box, 'RESUME', () => G.resume(), 'primary');
    button(box, 'SAVE GAME', () => { G.save.manual('Pause save'); });
    button(box, 'LOAD GAME', () => { if (G.save.exists()) G.startGame(true); else G.hud.notify('No save found', 'warn'); });
    button(box, 'CONTROLS', () => M.showControls(() => M.showPause()));
    button(box, 'SETTINGS', () => M.showSettings(() => M.showPause()));
    button(box, 'QUIT TO TITLE', () => G.toTitle());
    const stat = G.player.stats;
    el('div', 'pause-stats', box, `Missions ${G.missions.state.completed.length}/${G.missions.list.length} · Medallions ${G.pickups.medallions}/${G.pickups.medallionTotal} · Kills ${stat.kills} · Played ${Math.floor(stat.playTime / 60)} min`);
  };

  M.hide = () => { clear(); layer.classList.add('hidden'); };

  M.openShop = () => {
    G.paused = true;
    G.state = 'shop';
    G.input.unlock();
    renderShop();
  };
  function renderShop() {
    clear();
    layer.classList.add('panelbg');
    const box = el('div', 'panel-box', layer);
    el('h2', '', box, "GUNNAR'S ARMS");
    el('div', 'shop-cash', box, `Cash: <b>$${Math.floor(G.player.money).toLocaleString()}</b>`);
    const list = el('div', 'shop-list', box);
    for (const it of G.places.catalogue()) {
      const row = el('div', 'shop-row', list);
      el('div', 'shop-name', row, `${it.label}<small>${it.desc}</small>`);
      const b = button(row, `$${it.price.toLocaleString()}`, () => { G.places.buy(it.id); renderShop(); });
      if (G.player.money < it.price) b.classList.add('poor');
    }
    button(box, 'LEAVE', () => { G.state = 'play'; G.resume(); });
  }

  M.openMap = () => {
    G.paused = true;
    G.state = 'map';
    G.input.unlock();
    clear();
    layer.classList.add('mapbg');
    const c = el('canvas', 'fullmap', layer);
    c.width = 1100; c.height = 760;
    G.minimap.drawFull(c);
    const legend = el('div', 'map-legend', layer, 'Yellow M: next mission · G gun shop · P Pay\'n\'Spray · + hospital · H safehouse · R street race<br><small>Press M or Esc to close</small>');
    void legend;
    M.mapCanvas = c;
  };

  M.showEnding = () => {
    G.paused = true;
    G.state = 'ending';
    G.input.unlock();
    clear();
    layer.classList.add('panelbg');
    const box = el('div', 'panel-box', layer);
    el('h2', '', box, 'PALMERA BAY, AT SUNSET');
    el('p', 'ending-text', box, "Victor Hale's empire burned out on the coast road. Dani reopened Okafor Auto with a fresh sign. Detective Quint kept your file in a drawer, 'just in case'. The city sleeps. You don't. There are still medallions in the dust, races on Neon Lap, and a whole bay left to drive.");
    el('p', 'ending-text', box, `Missions ${G.missions.state.completed.length}/${G.missions.list.length} · Cash $${Math.floor(G.player.money).toLocaleString()} · Kills ${G.player.stats.kills}`);
    button(box, 'KEEP PLAYING', () => { G.state = 'play'; G.resume(); }, 'primary');
    button(box, 'TITLE', () => G.toTitle());
  };

  return M;
}
