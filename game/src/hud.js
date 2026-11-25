// Heads-up display (DOM): objective, money, wanted stars, health/armor, weapon/ammo, speedometer, radio, prompts, feed, banners, death card.
import { WEAPONS } from './config.js';
import { streetAt, districtNameAt } from './streetNames.js';
import { weaponIcon } from './weaponIcons.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
// write-through caches so per-frame updates only touch the DOM on change
const setText = (e, v) => { if (e._t !== v) { e._t = v; e.textContent = v; } };
const setHTML = (e, v) => { if (e._h !== v) { e._h = v; e.innerHTML = v; } };
const setW = (e, f) => { const v = Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10; if (e._w !== v) { e._w = v; e.style.width = v + '%'; } };
const show = (e, on) => { if (e._s !== on) { e._s = on; e.style.display = on ? '' : 'none'; } };

const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.1.8-5.3 4.9 1.5 7.1L12 17.6l-6.4 3.6 1.5-7.1L1.8 9.2l7.1-.8z"/></svg>';
const SPEAKER_COLORS = { Nico: '#ffd166', Dani: '#7cf29a', Sal: '#8ecae6', Hale: '#ff6b6b', Quint: '#9bb7ff' };
// legacy banner wording from other modules mapped onto this game's own phrasing
const BANNER_WORDS = { 'MISSION PASSED': 'JOB DONE', 'MISSION FAILED': 'JOB FAILED' };
const GAUGE_LEN = 251; // arc length of the speedometer path below
const MAX_MPH = 140;

export function createHud(G, root) {
  const H = {};
  const hud = el('div', '', root);
  hud.id = 'hud';
  const fx = el('div', 'hud-fx', hud);
  const vignette = el('div', 'vignette', fx);
  const hurt = el('div', 'hurt', fx);
  void vignette;

  // ---- objective (top-left)
  const obj = el('div', 'glass objective', hud);
  const objKicker = el('div', 'obj-kicker', obj);
  const objTitle = el('div', 'obj-title', obj);
  const objText = el('div', 'obj-text', obj);
  const objRow = el('div', 'obj-row', obj);
  const objTimer = el('div', 'obj-timer', objRow);
  const objBar = el('div', 'obj-bar', objRow);
  const objBarFill = el('i', '', objBar);
  const raceEl = el('div', 'glass racepanel', hud);
  show(obj, false); show(raceEl, false);

  // ---- top-right cluster: weapon, money, stars
  const tr = el('div', 'topright', hud);
  const weaponEl = el('div', 'glass weapon', tr);
  const weaponIco = el('div', 'wicon', weaponEl);
  const weaponInfo = el('div', 'winfo', weaponEl);
  const weaponAmmo = el('div', 'wammo', weaponInfo);
  const weaponName = el('div', 'wname', weaponInfo);
  const moneyEl = el('div', 'money', tr, '$0');
  const popWrap = el('div', 'money-pops', tr);
  const starsEl = el('div', 'stars', tr);
  const stars = [];
  for (let i = 0; i < 5; i++) { const s = el('span', 'star', starsEl); s.innerHTML = STAR_SVG; stars.push(s); }
  const notifs = el('div', 'notifs', hud);

  // ---- bottom-left: minimap, location, bars
  const mmWrap = el('div', 'minimap-wrap', hud);
  const mmCanvas = el('canvas', 'minimap', mmWrap);
  mmCanvas.width = 220; mmCanvas.height = 220;
  const clockEl = el('div', 'clock', mmWrap);
  const bars = el('div', 'bars', mmWrap);
  const hpBar = el('div', 'bar hp', bars);
  const hpFill = el('i', '', hpBar);
  const arBar = el('div', 'bar ar', bars);
  const arFill = el('i', '', arBar);
  const stBar = el('div', 'bar st', mmWrap);
  const stFill = el('i', '', stBar);
  const locEl = el('div', 'location', mmWrap);
  const locDistrict = el('div', 'loc-district', locEl);
  const locStreet = el('div', 'loc-street', locEl);

  // ---- bottom-right: speedometer + radio
  const speedWrap = el('div', 'speedwrap', hud);
  speedWrap.innerHTML = `<svg class="gauge" viewBox="0 0 200 130"><defs><linearGradient id="hudGauge" x1="0" x2="1"><stop offset="0" stop-color="#ffd166"/><stop offset=".55" stop-color="#ff6b9a"/><stop offset="1" stop-color="#b04dff"/></linearGradient></defs>
    <path class="g-track" d="M20 115 A80 80 0 0 1 180 115"/><path class="g-fill" d="M20 115 A80 80 0 0 1 180 115" stroke-dasharray="0 ${GAUGE_LEN}"/></svg>`;
  const gaugeFill = speedWrap.querySelector('.g-fill');
  const speedEl = el('div', 'speed', speedWrap);
  const speedNum = el('b', '', speedEl, '0');
  el('small', '', speedEl, 'MPH');
  const carName = el('div', 'carname', speedWrap);
  const hpCar = el('div', 'carhp', speedWrap);
  const hpCarFill = el('i', '', hpCar);
  const radioEl = el('div', 'radio', speedWrap);
  show(speedWrap, false);
  const radioPop = el('div', 'radio-pop', hud);

  // ---- center / transient
  const subtitle = el('div', 'subtitle', hud);
  const subSpeaker = el('b', '', subtitle);
  const subText = el('span', '', subtitle);
  show(subtitle, false);
  const bannerEl = el('div', 'banner', hud);
  const bannerKicker = el('div', 'banner-kicker', bannerEl);
  const bannerTitle = el('div', 'banner-title', bannerEl);
  const bannerSub = el('div', 'banner-sub', bannerEl);
  const promptEl = el('div', 'prompt', hud);
  const hintEl = el('div', 'hint', hud);
  const crossEl = el('div', 'cross', hud);
  for (const d of ['t', 'b', 'l', 'r']) el('i', 'ch ' + d, crossEl);
  const hitEl = el('div', 'hitmark', crossEl);
  for (let i = 0; i < 4; i++) el('i', '', hitEl);
  const centerText = el('div', 'center-text', hud);
  const districtPop = el('div', 'district-pop', hud);
  const popTitle = el('div', 'dp-title', districtPop);
  const popSub = el('div', 'dp-sub', districtPop);

  // ---- death / arrest card
  const overlay = el('div', 'death-overlay', hud);
  const overlayKicker = el('div', 'death-kicker', overlay);
  const overlayTitle = el('div', 'death-title', overlay);
  const overlaySub = el('div', 'death-sub', overlay);
  const bill = el('div', 'death-bill', overlay);

  H.canvas = mmCanvas;
  H.visible = (on) => { hud.style.display = on ? '' : 'none'; };

  let shownMoney = null, lastObj = '', lastLoc = '', lastRadio = null, lastWeapon = '', bannerT = 0, hintT = 0, promptT = 0, centerT = 0, popT = 0, radioT = 0, moneyFlashT = 0;

  H.notify = (text, kind = 'info') => {
    const n = el('div', 'notif ' + kind, notifs);
    el('i', 'n-dot', n);
    el('span', '', n, text);
    setTimeout(() => n.classList.add('out'), 3800);
    setTimeout(() => n.remove(), 4400);
    while (notifs.children.length > 5) notifs.firstChild.remove();
  };
  H.moneyPop = (n) => {
    if (!n) return;
    const p = el('div', 'money-pop ' + (n > 0 ? 'plus' : 'minus'), popWrap, (n > 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString());
    setTimeout(() => p.remove(), 1800);
  };
  H.banner = (title, sub, kind = '') => {
    const t = BANNER_WORDS[title] ?? title;
    bannerKicker.textContent = kind === 'mission' ? 'NEW JOB' : kind === 'pass' ? 'PALMERA BAY' : kind === 'fail' ? 'TRY AGAIN' : '';
    bannerTitle.textContent = t;
    bannerSub.textContent = sub || '';
    bannerEl.className = 'banner show ' + kind;
    bannerT = kind === 'mission' ? 4.2 : 4.6;
  };
  H.hint = (text) => {
    hintEl.textContent = text;
    hintEl.classList.toggle('show', !!text);
    hintT = text ? 2.6 : 0;
  };
  H.prompt = (key, text) => {
    const k = (key || '') + '|' + text;
    if (promptEl._k !== k) {
      promptEl._k = k;
      promptEl.innerHTML = '';
      if (key) el('kbd', '', promptEl, key);
      el('span', '', promptEl, text);
    }
    promptEl.classList.add('show');
    promptT = 0.1;
  };
  H.centerText = (t) => { centerText.textContent = t; centerText.classList.add('show'); centerT = 0.9; };
  H.showSubtitle = (speaker, text) => {
    subSpeaker.textContent = speaker;
    subSpeaker.style.color = SPEAKER_COLORS[speaker] || '#fff';
    subText.textContent = text;
    show(subtitle, true);
  };
  H.hideSubtitle = () => show(subtitle, false);

  // kind: 'dead' | 'arrest' (older callers pass only a title)
  H.deathScreen = (title, sub, kind = 'dead') => {
    overlayKicker.textContent = kind === 'arrest' ? 'PALMERA PD · CASE CLOSED' : 'ST. AURELIA ER';
    overlayTitle.textContent = title;
    overlaySub.textContent = sub || '';
    bill.className = 'death-bill';
    overlay.dataset.kind = kind;
    overlay.className = 'death-overlay show';
    document.body.classList.add(kind === 'arrest' ? 'fx-arrest' : 'fx-flatline');
  };
  // second phase: the receipt (hospital bill / fine) while the world fades back in
  H.deathBill = (label, amount, note) => {
    bill.innerHTML = '';
    el('span', 'bill-label', bill, label);
    el('b', '', bill, '-$' + Math.max(0, Math.round(amount)).toLocaleString());
    if (note) el('small', '', bill, note);
    bill.className = 'death-bill show';
    overlay.classList.add('receipt');
    document.body.classList.remove('fx-flatline', 'fx-arrest');
  };
  H.hideDeath = () => {
    overlay.className = 'death-overlay';
    document.body.classList.remove('fx-flatline', 'fx-arrest');
  };

  function updateMoney(P, dt) {
    const m = Math.floor(P.money ?? 0);
    if (shownMoney === null) shownMoney = m;
    if (shownMoney !== m) {
      const diff = m - shownMoney;
      const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 7));
      shownMoney = Math.abs(diff) <= step ? m : shownMoney + Math.sign(diff) * Math.ceil(step);
      moneyEl.classList.toggle('down', diff < 0);
      moneyFlashT = 0.5;
    }
    moneyFlashT -= dt;
    moneyEl.classList.toggle('flash', moneyFlashT > 0);
    setText(moneyEl, '$' + shownMoney.toLocaleString());
  }

  function updateWanted() {
    const w = G.wanted;
    const n = w?.stars ?? 0;
    const searching = n > 0 && (w.search?.active || (w.unseen ?? 0) > 1.5);
    starsEl.classList.toggle('searching', !!searching);
    starsEl.classList.toggle('hot', n > 0 && !searching);
    starsEl.classList.toggle('hidden', n === 0);
    stars.forEach((s, i) => s.classList.toggle('on', i < n));
  }

  function updateWeapon(P) {
    const wid = P.weapon ?? 'fists';
    const wd = WEAPONS[wid] ?? {};
    if (wid !== lastWeapon) {
      lastWeapon = wid;
      weaponIco.innerHTML = weaponIcon(wid);
      setText(weaponName, (wd.name ?? wid).toUpperCase());
      weaponEl.classList.remove('swap'); void weaponEl.offsetWidth; weaponEl.classList.add('swap');
    }
    const mag = P.mag?.[wid] ?? 0, res = P.reserve?.[wid] ?? 0;
    if (wd.mag) {
      setHTML(weaponAmmo, P.reloadT > 0 ? '<em>RELOADING</em>' : `${mag}<small>/${res}</small>`);
      weaponAmmo.classList.toggle('low', mag <= Math.ceil(wd.mag * 0.25));
    } else setHTML(weaponAmmo, wid === 'fists' ? '' : '∞');
  }

  function updateVehicle(P, dt) {
    const v = P.mode === 'car' ? P.vehicle : null;
    show(speedWrap, !!v);
    const name = G.music?.name ?? 'Radio Off';
    if (v) {
      const mph = Math.round(Math.abs(v.speed ?? 0) * 2.237);
      setText(speedNum, String(mph));
      const f = Math.min(1, mph / MAX_MPH);
      const dash = `${(f * GAUGE_LEN).toFixed(1)} ${GAUGE_LEN}`;
      if (gaugeFill._d !== dash) { gaugeFill._d = dash; gaugeFill.setAttribute('stroke-dasharray', dash); }
      setText(carName, (v.def?.name ?? 'Vehicle').toUpperCase());
      const hf = Math.max(0, (v.health ?? 1) / (v.maxHealth ?? 1));
      setW(hpCarFill, hf);
      hpCar.classList.toggle('low', hf < 0.3);
      setHTML(radioEl, `<i>♪</i>${name}<kbd>R</kbd>`);
      if (lastRadio !== null && name !== lastRadio) {
        radioPop.innerHTML = `<small>NOW TUNED TO</small><b>${name}</b>`;
        radioPop.classList.add('show');
        radioT = 2.4;
      }
      lastRadio = name;
    } else lastRadio = null;
    if ((radioT -= dt) <= 0) radioPop.classList.remove('show');
  }

  function updateObjective() {
    const info = G.missions?.objectiveInfo?.();
    if (info) {
      show(obj, true);
      obj.classList.remove('free');
      const key = 'm' + info.title + info.text;
      if (key !== lastObj) {
        lastObj = key;
        objKicker.textContent = 'CURRENT JOB';
        objTitle.textContent = info.title;
        objText.textContent = info.text;
        obj.classList.remove('pulse'); void obj.offsetWidth; obj.classList.add('pulse');
      }
      if (info.timer) {
        show(objTimer, true);
        const t = Math.max(0, info.timer.t);
        setText(objTimer, `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
        objTimer.classList.toggle('low', t < 20);
      } else show(objTimer, false);
      if (info.progress != null) { show(objBar, true); setW(objBarFill, info.progress); } else show(objBar, false);
    } else if (G.missions?.startMarker) {
      const next = G.missions.list?.[G.missions.state?.next];
      show(obj, !!next);
      obj.classList.add('free');
      const key = 'next' + next?.id;
      if (next && key !== lastObj) {
        lastObj = key;
        objKicker.textContent = 'FREE ROAM';
        objTitle.textContent = next.title;
        objText.textContent = `Next job waits at ${G.city.landmarks[next.giver]?.name ?? 'the yellow marker'}.`;
      }
      show(objTimer, false); show(objBar, false);
    } else { show(obj, false); lastObj = ''; }

    const race = G.races?.info?.();
    show(raceEl, !!race);
    if (race) setHTML(raceEl, `<div class="obj-kicker">STREET RACE</div><div class="race-pos">${race.place}<small>/4</small></div><div>Checkpoint ${race.cp}/${race.total}</div><div class="race-t">${race.t.toFixed(1)}s</div>`);
  }

  function updateLocation(P) {
    const hr = G.env?.hour ?? 12;
    const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    setText(clockEl, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const dn = districtNameAt(P.x, P.z);
    const st = streetAt(P.x, P.z);
    setText(locDistrict, dn);
    setText(locStreet, st);
    if (dn !== lastLoc) {
      lastLoc = dn;
      popTitle.textContent = dn;
      popSub.textContent = st;
      districtPop.classList.remove('show'); void districtPop.offsetWidth;
      districtPop.classList.add('show');
      popT = 3.2;
    }
  }

  function updateCombat(P) {
    const gun = P.weapon && P.weapon !== 'fists';
    const aiming = P.mode !== 'car' && !P.dead && (P.aiming || (gun && G.input?.state?.rmb));
    show(crossEl, !!aiming);
    const lh = G.combat?.lastHitT;
    const recent = lh != null && G.time >= lh && G.time - lh < 0.22;
    const on = (P.hitMarker ?? 0) > 0 || recent;
    hitEl.classList.toggle('on', on);
    const kt = G.combat?.lastKillT;
    hitEl.classList.toggle('kill', on && kt != null && G.time - kt < 0.3);
  }

  H.update = (dt) => {
    const P = G.player;
    updateMoney(P, dt);
    updateWanted();
    const maxH = P.maxHealth || 100;
    const hp = Math.max(0, P.health ?? P.actor?.health ?? 0);
    setW(hpFill, hp / maxH);
    hpBar.classList.toggle('low', hp < maxH * 0.3);
    setW(arFill, (P.armor ?? 0) / 100);
    arBar.classList.toggle('empty', !(P.armor > 0));
    setW(stFill, P.stamina ?? 1);
    stBar.classList.toggle('full', (P.stamina ?? 1) >= 0.99);
    updateWeapon(P);
    updateVehicle(P, dt);
    updateObjective();
    updateLocation(P);
    updateCombat(P);

    if ((bannerT -= dt) <= 0) bannerEl.classList.remove('show');
    if ((hintT -= dt) <= 0) hintEl.classList.remove('show');
    if ((promptT -= dt) <= 0) promptEl.classList.remove('show');
    if ((centerT -= dt) <= 0) centerText.classList.remove('show');
    if ((popT -= dt) <= 0) districtPop.classList.remove('show');

    const low = hp < maxH * 0.25 && !P.dead ? 0.3 + Math.sin(G.time * 5) * 0.1 : 0;
    const hurtV = Math.min(0.9, (P.hurtFlash ?? 0) + low).toFixed(2);
    if (hurt._o !== hurtV) { hurt._o = hurtV; hurt.style.opacity = hurtV; }

    const bust = G.police?.bustT ?? 0;
    if (bust > 0.2) H.hint(`GETTING CUFFED: break free! ${Math.min(100, Math.floor((bust / 2.4) * 100))}%`);
  };

  return H;
}
