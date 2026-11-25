// Menus (DOM): title screen, pause menu (stats, save/load slots, settings, controls), weapon shop, full map and the ending card.
// Keyboard: Up/Down (or W/S) moves between buttons, Enter/Space selects, Esc goes back.
import { GAME_TITLE, CITY_NAME } from './config.js';
import { SLOT_COUNT } from './save.js';
import { BLIP_STYLE } from './minimap.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const money = (n) => '$' + Math.floor(n ?? 0).toLocaleString();

const CONTROLS = {
  'On foot': [['W A S D', 'Move'], ['Mouse', 'Look'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['LMB', 'Punch / fire'], ['RMB', 'Aim'], ['1-4 / Wheel', 'Switch weapon'], ['R', 'Reload'], ['E', 'Interact: shops, safehouse, hospital']],
  Driving: [['W / S', 'Throttle / brake & reverse'], ['A / D', 'Steer'], ['Space', 'Handbrake'], ['F', 'Enter / exit, carjack'], ['R', 'Next radio station'], ['H', 'Horn'], ['C', 'Look behind']],
  General: [['M / Tab', 'City map (click to set a waypoint)'], ['Enter', 'Skip dialogue line'], ['F5 / F9', 'Quick save / quick load'], ['Esc / P', 'Pause']],
};
const LEGEND = ['mission', 'obj', 'waypoint', 'shop', 'spray', 'hospital', 'home', 'food', 'race'];

export function createMenus(G, root) {
  const M = {};
  const layer = el('div', 'menu-layer hidden', root);
  let onBack = null, mapLoop = 0;

  function clear(cls) {
    layer.innerHTML = '';
    layer.className = 'menu-layer' + (cls ? ' ' + cls : '');
    onBack = null;
  }

  function button(parent, label, fn, cls = '') {
    const b = el('button', 'menu-btn ' + cls, parent, label);
    b.type = 'button';
    b.addEventListener('click', () => { G.audio?.uiSelect?.(); fn(b); });
    b.addEventListener('mouseenter', () => { G.audio?.uiMove?.(); b.focus({ preventScroll: true }); });
    return b;
  }
  const focusFirst = () => layer.querySelector('.menu-btn.primary, .menu-btn')?.focus({ preventScroll: true });

  // ---- keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (layer.classList.contains('hidden') || G.state === 'map' || G.state === 'play') return;
    const btns = [...layer.querySelectorAll('.menu-btn:not([disabled])')].filter((b) => b.offsetParent);
    const i = btns.indexOf(document.activeElement);
    const move = (d) => { const n = btns[(i + d + btns.length) % btns.length]; n?.focus({ preventScroll: true }); G.audio?.uiMove?.(); };
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { move(i < 0 ? 0 : 1); e.preventDefault(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { move(i < 0 ? 0 : -1); e.preventDefault(); }
    else if ((e.code === 'Enter' || e.code === 'Space') && i >= 0) { btns[i].click(); e.preventDefault(); }
    else if (e.code === 'Escape' && onBack) { e.preventDefault(); onBack(); }
  });

  // ---- shared page renderers (used both on the title screen and inside the pause menu)
  function renderControls(c) {
    el('h2', '', c, 'CONTROLS');
    const cols = el('div', 'controls-cols', c);
    for (const [group, rows] of Object.entries(CONTROLS)) {
      const g = el('div', 'controls-group', cols);
      el('h3', '', g, group);
      for (const [k, v] of rows) el('div', 'ctl', g, `<span>${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</span><em>${v}</em>`);
    }
  }

  function renderSettings(c) {
    el('h2', '', c, 'SETTINGS');
    const s = G.save.settings();
    const apply = () => { G.applySettings(s); G.save.saveSettings(s); };
    const slider = (label, key, min, max, step, fmt) => {
      const r = el('label', 'setting', c);
      el('span', 'set-label', r, label);
      const inp = el('input', '', r);
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
      const out = el('span', 'sval', r, fmt(s[key]));
      inp.addEventListener('input', () => { s[key] = parseFloat(inp.value); out.textContent = fmt(s[key]); apply(); });
    };
    slider('Sound effects', 'sfx', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    slider('Music / radio', 'music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    slider('Mouse sensitivity', 'sens', 0.3, 2.5, 0.1, (v) => v.toFixed(1) + 'x');
    const q = el('div', 'setting', c);
    el('span', 'set-label', q, 'Graphics quality');
    const seg = el('div', 'segmented', q);
    for (const o of ['low', 'medium', 'high']) {
      const b = button(seg, o.toUpperCase(), () => { s.quality = o; apply(); seg.querySelectorAll('.menu-btn').forEach((x) => x.classList.toggle('on', x === b)); }, 'seg' + (s.quality === o ? ' on' : ''));
    }
    const inv = el('div', 'setting', c);
    el('span', 'set-label', inv, 'Invert mouse Y');
    const t = button(inv, s.invertY ? 'ON' : 'OFF', () => { s.invertY = !s.invertY; t.textContent = s.invertY ? 'ON' : 'OFF'; t.classList.toggle('on', s.invertY); apply(); }, 'seg toggle' + (s.invertY ? ' on' : ''));
  }

  function statRows() {
    const st = G.player.stats ?? {};
    const done = G.missions?.state?.completed?.length ?? 0, total = G.missions?.list?.length ?? 0;
    const km = ((st.driven ?? st.distance ?? 0) / 1000).toFixed(1);
    const mins = Math.floor((st.playTime ?? 0) / 60);
    return {
      done, total,
      rows: [
        ['Jobs completed', `${done} / ${total}`], ['Cash', money(G.player.money)], ['Sun Medallions', `${G.pickups?.medallions ?? 0} / ${G.pickups?.medallionTotal ?? '?'}`],
        ['Takedowns', st.kills ?? 0], ['Distance travelled', `${km} km`], ['Cars borrowed', st.carsStolen ?? 0], ['Vehicles wrecked', st.wrecked ?? 0],
        ['Shots fired', st.shots ?? 0], ['Street races won', G.races?.wins ?? 0], ['Best lap', G.races?.best != null ? `${G.races.best.toFixed(1)}s` : '—'],
        ['Street rep', G.missions?.state?.rep ?? 0], ['Time on the streets', `${Math.floor(mins / 60)}h ${mins % 60}m`],
      ],
    };
  }

  function renderStats(c) {
    el('h2', '', c, 'STATS');
    const { done, total, rows } = statRows();
    const pct = total ? Math.round((done / total) * 100) : 0;
    el('div', 'story-progress', c, `<span>STORY ${pct}%</span><div class="sp-bar"><i style="width:${pct}%"></i></div>`);
    const grid = el('div', 'stats-grid', c);
    for (const [k, v] of rows) el('div', 'stat', grid, `<em>${k}</em><b>${esc(v)}</b>`);
  }

  // mode: 'save' | 'load'
  function renderSlots(c, mode, rerender) {
    el('h2', '', c, mode === 'save' ? 'SAVE GAME' : 'LOAD GAME');
    const list = el('div', 'slots', c);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const d = G.save.describe(G.save.readSlot(i));
      const info = d
        ? `<b>${esc(d.label)}</b><span>${d.missions} jobs · ${money(d.money)} · ${d.minutes} min</span><small>${d.date ? d.date.toLocaleString() : ''}</small>`
        : '<b>Empty slot</b><span>—</span>';
      const row = el('div', 'slot-row' + (i === G.save.active ? ' active' : ''), list);
      const b = button(row, `<i class="slot-n">${i + 1}</i><div class="slot-info">${info}</div>`, (btn) => {
        if (mode === 'load') { if (d) G.save.loadSlot(i); return; }
        if (d && !btn.dataset.armed) { btn.dataset.armed = '1'; btn.querySelector('b').textContent = 'Overwrite? Click again'; return; }
        G.save.manual(`Slot ${i + 1} · ${G.city ? 'Palmera Bay' : ''}`.trim(), i);
        rerender();
      }, 'slot' + (!d && mode === 'load' ? ' empty' : ''));
      if (!d && mode === 'load') b.disabled = true;
      if (d) button(row, '✕', () => { G.save.eraseSlot(i); rerender(); }, 'slot-del').title = 'Delete save';
    }
  }

  function renderCredits(c) {
    el('h2', '', c, 'CREDITS');
    el('p', 'credits', c, `<b>${GAME_TITLE}</b> is an original open-world crime game set in the fictional city of ${CITY_NAME}.<br>
      Built for the make.fun "open-world crime" bounty with three.js and plain JavaScript modules.<br><br>
      City, cars, characters, missions and the three radio stations are all generated in code: no external assets, fonts or network calls.<br><br>
      All names, places and events are fictional. Drive safe out there.`);
  }

  // A full-screen panel page (title-screen sub pages).
  function panelPage(render, back) {
    clear('panelbg');
    const box = el('div', 'panel-box glass-panel', layer);
    const body = el('div', 'panel-body', box);
    render(body);
    button(box, '‹ BACK', back, 'back');
    onBack = back;
    focusFirst();
  }

  // ---- title
  M.showTitle = () => {
    clear('title');
    G.state = 'title';
    el('div', 'title-sun', layer);
    const box = el('div', 'title-box', layer);
    el('div', 'title-kicker', box, `${CITY_NAME.toUpperCase()} · AN ORIGINAL OPEN-WORLD CRIME STORY`);
    const logo = el('h1', 'title-logo', box);
    const [w1, ...rest] = GAME_TITLE.split(' ');
    el('span', 'logo-a', logo, w1);
    el('span', 'logo-b', logo, rest.join(' ') || '');
    el('div', 'title-sub', box, 'Two years inside. One city that owes you everything.');
    const col = el('div', 'menu-col', box);
    const latest = G.save.latestSlot();
    if (latest >= 0) button(col, `CONTINUE <small>${G.save.summary(latest) ?? ''}</small>`, () => G.save.loadSlot(latest), 'primary');
    const newBtn = button(col, 'NEW GAME', (b) => {
      if (latest >= 0 && !b.dataset.armed) {
        b.dataset.armed = '1';
        b.innerHTML = `NEW GAME <small>click again · saves go to slot ${freeSlot() + 1}</small>`;
        return;
      }
      G.save.setActive(freeSlot());
      G.startGame(false);
    }, latest >= 0 ? '' : 'primary');
    void newBtn;
    if (latest >= 0) button(col, 'LOAD GAME', () => panelPage((c) => renderSlots(c, 'load', () => M.showTitle()), M.showTitle));
    button(col, 'SETTINGS', () => panelPage(renderSettings, M.showTitle));
    button(col, 'CONTROLS', () => panelPage(renderControls, M.showTitle));
    button(col, 'CREDITS', () => panelPage(renderCredits, M.showTitle));
    el('div', 'title-foot', box, '<kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> select · best with keyboard + mouse');
    focusFirst();
  };
  // first empty slot, else the active one
  function freeSlot() {
    const s = G.save.slots();
    const i = s.findIndex((d) => !d);
    return i >= 0 ? i : G.save.active;
  }

  // ---- pause (two panes: nav + page)
  M.showPause = (page = 'stats') => {
    clear('pausebg');
    const box = el('div', 'pause-box glass-panel', layer);
    const nav = el('div', 'pause-nav', box);
    el('div', 'pause-title', nav, 'PAUSED');
    const content = el('div', 'pause-content', box);
    const pages = {
      stats: renderStats,
      save: (c) => renderSlots(c, 'save', () => M.showPause('save')),
      load: (c) => renderSlots(c, 'load', () => M.showPause('load')),
      settings: renderSettings,
      controls: renderControls,
    };
    const open = (p) => {
      content.innerHTML = '';
      pages[p](content);
      nav.querySelectorAll('.menu-btn').forEach((b) => b.classList.toggle('on', b.dataset.page === p));
    };
    button(nav, 'RESUME', () => G.resume(), 'primary');
    button(nav, 'MAP', () => M.openMap());
    for (const [p, label] of [['stats', 'STATS'], ['save', 'SAVE'], ['load', 'LOAD'], ['settings', 'SETTINGS'], ['controls', 'CONTROLS']]) {
      button(nav, label, () => open(p)).dataset.page = p;
    }
    const quit = button(nav, 'QUIT TO TITLE', (b) => {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.innerHTML = 'QUIT? <small>unsaved progress is lost</small>'; return; }
      G.toTitle();
    }, 'danger');
    void quit;
    el('div', 'pause-foot', nav, '<kbd>Esc</kbd> resume');
    open(page);
    onBack = () => G.resume();
    focusFirst();
  };

  M.hide = () => {
    cancelAnimationFrame(mapLoop);
    clear('hidden');
  };

  // ---- weapon shop
  M.openShop = () => {
    G.paused = true;
    G.state = 'shop';
    G.input.unlock();
    renderShop();
  };
  function renderShop() {
    clear('panelbg');
    const box = el('div', 'panel-box glass-panel', layer);
    el('h2', '', box, "GUNNAR'S ARMS");
    el('div', 'shop-cash', box, `Cash <b>${money(G.player.money)}</b>`);
    const list = el('div', 'shop-list', box);
    for (const it of G.places.catalogue()) {
      const row = el('div', 'shop-row', list);
      el('div', 'shop-name', row, `${it.label}<small>${it.desc}</small>`);
      const b = button(row, money(it.price), () => { G.places.buy(it.id); renderShop(); }, 'price');
      if (G.player.money < it.price) b.classList.add('poor');
    }
    const leave = () => { G.state = 'play'; G.resume(); };
    button(box, 'LEAVE', leave, 'back');
    onBack = leave;
    focusFirst();
  }

  // ---- full map with legend and click-to-set waypoint
  M.openMap = () => {
    G.paused = true;
    G.state = 'map';
    G.input.unlock();
    clear('mapbg');
    const wrap = el('div', 'map-wrap', layer);
    const c = el('canvas', 'fullmap', wrap);
    c.width = 900; c.height = 900;
    const side = el('div', 'map-side glass-panel', wrap);
    el('h2', '', side, 'PALMERA BAY');
    const legend = el('div', 'legend', side);
    for (const k of LEGEND) {
      const [color, glyph, label] = BLIP_STYLE[k];
      el('div', 'lg', legend, `<i class="lg-${k}" style="background:${color}">${glyph}</i>${label}`);
    }
    el('div', 'lg', legend, '<i class="lg-cop"></i>Police');
    el('div', 'lg', legend, '<i class="lg-route"></i>GPS route');
    el('div', 'map-help', side, '<kbd>Click</kbd> set waypoint<br><kbd>Right click</kbd> clear waypoint<br><kbd>M</kbd> / <kbd>Esc</kbd> close');
    const draw = () => {
      if (G.state !== 'map') return;
      G.minimap.drawFull(c);
      mapLoop = requestAnimationFrame(() => setTimeout(draw, 120));
    };
    const toWorld = (e) => {
      const r = c.getBoundingClientRect();
      return G.minimap.fullTransform?.toWorld(((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
    };
    c.addEventListener('click', (e) => {
      const p = toWorld(e);
      if (!p) return;
      const wp = G.minimap.waypoint;
      if (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 25) G.minimap.setWaypoint(null);
      else G.minimap.setWaypoint(p);
      G.audio?.uiSelect?.();
      G.minimap.drawFull(c);
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); G.minimap.setWaypoint(null); G.minimap.drawFull(c); });
    draw();
    M.mapCanvas = c;
  };

  // ---- ending card
  M.showEnding = () => {
    G.paused = true;
    G.state = 'ending';
    G.input.unlock();
    clear('panelbg');
    const box = el('div', 'panel-box glass-panel', layer);
    el('h2', '', box, 'PALMERA BAY, AT SUNSET');
    el('p', 'ending-text', box, "Victor Hale's empire burned out on the coast road. Dani reopened Okafor Auto with a fresh sign. Detective Quint kept your file in a drawer, 'just in case'. The city sleeps. You don't. There are still medallions in the dust, races on Neon Lap, and a whole bay left to drive.");
    renderStats(el('div', 'ending-stats', box));
    button(box, 'KEEP PLAYING', () => { G.state = 'play'; G.resume(); }, 'primary');
    button(box, 'TITLE', () => G.toTitle());
    focusFirst();
  };

  return M;
}
