// Heads-up display (DOM): objective, money, wanted stars, health/armor, weapon/ammo, speedometer, prompts, subtitles and banners.
import { WEAPONS, DISTRICTS } from './config.js';
import { districtOf } from './citygen.js';
import { HALF, PITCH, N } from './config.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function createHud(G, root) {
  const H = {};
  const hud = el('div', '', root);
  hud.id = 'hud';

  const obj = el('div', 'panel objective', hud);
  const objTitle = el('div', 'obj-title', obj);
  const objText = el('div', 'obj-text', obj);
  const objTimer = el('div', 'obj-timer', obj);
  const objBar = el('div', 'obj-bar', obj);
  const objBarFill = el('i', '', objBar);
  obj.style.display = 'none';

  const tr = el('div', 'topright', hud);
  const moneyEl = el('div', 'money', tr, '$0');
  const starsEl = el('div', 'stars', tr);
  const stars = [];
  for (let i = 0; i < 5; i++) stars.push(el('span', 'star', starsEl, '★'));
  const weaponEl = el('div', 'weapon', tr);
  const weaponName = el('span', 'wname', weaponEl);
  const weaponAmmo = el('span', 'wammo', weaponEl);

  const mmWrap = el('div', 'minimap-wrap', hud);
  const mmCanvas = el('canvas', 'minimap', mmWrap);
  mmCanvas.width = 220; mmCanvas.height = 220;
  const districtEl = el('div', 'district', mmWrap);
  const clockEl = el('div', 'clock', mmWrap);
  const bars = el('div', 'bars', hud);
  const hpBar = el('div', 'bar hp', bars);
  const hpFill = el('i', '', hpBar);
  const hpText = el('span', '', hpBar, '100');
  const arBar = el('div', 'bar ar', bars);
  const arFill = el('i', '', arBar);
  const stBar = el('div', 'bar st', bars);
  const stFill = el('i', '', stBar);

  const speedWrap = el('div', 'speedwrap', hud);
  const speedEl = el('div', 'speed', speedWrap);
  const carName = el('div', 'carname', speedWrap);
  const radioEl = el('div', 'radio', speedWrap);
  const hpCar = el('div', 'carhp', speedWrap);
  const hpCarFill = el('i', '', hpCar);
  speedWrap.style.display = 'none';

  const subtitle = el('div', 'subtitle', hud);
  const subSpeaker = el('b', '', subtitle);
  const subText = el('span', '', subtitle);
  subtitle.style.display = 'none';
  const notifs = el('div', 'notifs', hud);
  const bannerEl = el('div', 'banner', hud);
  const bannerTitle = el('div', 'banner-title', bannerEl);
  const bannerSub = el('div', 'banner-sub', bannerEl);
  const promptEl = el('div', 'prompt', hud);
  const hintEl = el('div', 'hint', hud);
  const crossEl = el('div', 'cross', hud);
  const hitEl = el('div', 'hit', crossEl);
  const vignette = el('div', 'vignette', hud);
  const centerText = el('div', 'center-text', hud);
  const raceEl = el('div', 'panel racepanel', hud);
  raceEl.style.display = 'none';
  const districtPop = el('div', 'district-pop', hud);
  const overlay = el('div', 'death-overlay', hud);
  const overlayTitle = el('div', 'death-title', overlay);
  const overlaySub = el('div', 'death-sub', overlay);
  const hurt = el('div', 'hurt', hud);

  H.canvas = mmCanvas;
  H.visible = (on) => { hud.style.display = on ? '' : 'none'; };

  let lastMoney = -1, lastObj = '', lastDistrict = '', bannerT = 0, hintT = 0, promptT = 0, centerT = 0, popT = 0;
  const moneyPops = [];

  H.notify = (text, kind = 'info') => {
    const n = el('div', 'notif ' + kind, notifs, text);
    setTimeout(() => n.classList.add('out'), 3600);
    setTimeout(() => n.remove(), 4200);
    while (notifs.children.length > 5) notifs.firstChild.remove();
  };
  H.moneyPop = (n) => {
    if (n === 0) return;
    const p = el('div', 'money-pop ' + (n > 0 ? 'plus' : 'minus'), tr, (n > 0 ? '+$' : '-$') + Math.abs(n).toLocaleString());
    setTimeout(() => p.remove(), 1800);
  };
  H.banner = (title, sub, kind) => {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    bannerEl.className = 'banner show ' + (kind || '');
    bannerT = kind === 'mission' ? 4.2 : 4.6;
  };
  H.hint = (text) => { hintEl.textContent = text; hintEl.classList.add('show'); hintT = 2.4; };
  H.prompt = (key, text) => {
    promptEl.innerHTML = '';
    if (key) el('kbd', '', promptEl, key);
    el('span', '', promptEl, text);
    promptEl.classList.add('show');
    promptT = 0.1;
  };
  H.centerText = (t) => { centerText.textContent = t; centerText.classList.add('show'); centerT = 0.9; };
  H.showSubtitle = (speaker, text) => {
    subSpeaker.textContent = speaker + ': ';
    subSpeaker.style.color = ({ Nico: '#ffd166', Dani: '#7cf29a', Sal: '#8ecae6', Hale: '#ff6b6b', Quint: '#9bb7ff' })[speaker] || '#fff';
    subText.textContent = text;
    subtitle.style.display = '';
  };
  H.hideSubtitle = () => { subtitle.style.display = 'none'; };
  H.deathScreen = (title, sub) => {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub || '';
    overlay.classList.add('show');
    overlay.dataset.kind = title;
  };
  H.hideDeath = () => overlay.classList.remove('show');

  H.update = (dt) => {
    const P = G.player;
    // money
    const m = Math.floor(P.money);
    if (m !== lastMoney) { moneyEl.textContent = '$' + m.toLocaleString(); lastMoney = m; }
    // wanted stars
    const w = G.wanted;
    const blink = w.stars > 0 && w.unseen > 1.5 && Math.floor(G.time * 3) % 2 === 0;
    stars.forEach((s, i) => {
      s.classList.toggle('on', i < w.stars);
      s.classList.toggle('blink', blink && i < w.stars);
    });
    // health
    const hp = Math.max(0, P.health);
    hpFill.style.width = `${(hp / P.maxHealth) * 100}%`;
    hpText.textContent = Math.ceil(hp);
    arBar.style.display = P.armor > 0 ? '' : 'none';
    arFill.style.width = `${P.armor}%`;
    stFill.style.width = `${P.stamina * 100}%`;
    stBar.style.opacity = P.stamina < 0.99 ? 1 : 0.25;
    hpBar.classList.toggle('low', hp < P.maxHealth * 0.3);
    // weapon
    const wid = P.weapon;
    const wd = WEAPONS[wid];
    weaponName.textContent = wd.name;
    weaponAmmo.textContent = wd.mag ? `${P.mag[wid] || 0} / ${P.reserve[wid] || 0}${P.reloadT > 0 ? '  reloading…' : ''}` : '';
    // vehicle
    if (P.mode === 'car') {
      speedWrap.style.display = '';
      const v = P.vehicle;
      speedEl.innerHTML = `${Math.round(v.speed * 3.6)}<small> km/h</small>`;
      carName.textContent = v.def.name;
      radioEl.textContent = '♪ ' + (G.music?.name ?? 'Radio Off') + '   [R]';
      hpCarFill.style.width = `${Math.max(0, v.health / v.maxHealth) * 100}%`;
      hpCarFill.style.background = v.health / v.maxHealth < 0.3 ? '#ff4d5e' : '#7cf29a';
    } else speedWrap.style.display = 'none';
    // objective
    const info = G.missions?.objectiveInfo();
    const race = G.races?.info();
    if (info) {
      obj.style.display = '';
      const key = info.title + info.text;
      if (key !== lastObj) { objTitle.textContent = info.title; objText.textContent = info.text; lastObj = key; }
      if (info.timer) { objTimer.style.display = ''; const t = Math.max(0, info.timer.t); objTimer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; objTimer.classList.toggle('low', t < 20); }
      else objTimer.style.display = 'none';
      if (info.progress != null) { objBar.style.display = ''; objBarFill.style.width = `${info.progress * 100}%`; } else objBar.style.display = 'none';
    } else if (G.missions?.startMarker) {
      const next = G.missions.list[G.missions.state.next];
      obj.style.display = '';
      const key = 'next' + next.id;
      if (key !== lastObj) {
        objTitle.textContent = 'FREE ROAM';
        objText.textContent = `Next job: "${next.title}": head to the yellow marker (${G.city.landmarks[next.giver].name}).`;
        lastObj = key;
      }
      objTimer.style.display = 'none';
      objBar.style.display = 'none';
    } else obj.style.display = 'none';
    if (race) {
      raceEl.style.display = '';
      raceEl.innerHTML = `<b>STREET RACE</b><div>Position ${race.place}/4</div><div>Checkpoint ${race.cp}/${race.total}</div><div>${race.t.toFixed(1)}s</div>`;
    } else raceEl.style.display = 'none';

    // clock + district
    const hr = G.env.hour;
    const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    clockEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const bi = Math.floor((P.x + HALF) / PITCH), bj = Math.floor((P.z + HALF) / PITCH);
    let dn = 'Open Sea';
    if (bi >= 0 && bi < N && bj >= 0 && bj < N) dn = DISTRICTS[districtOf(bi, bj)].name;
    else if (Math.abs(P.x) < HALF + 80 && Math.abs(P.z) < HALF + 80) dn = P.x > HALF ? 'Coral Beach' : 'Palmera Shore';
    if (dn !== lastDistrict) {
      lastDistrict = dn;
      districtEl.textContent = dn;
      districtPop.textContent = dn;
      districtPop.classList.add('show');
      popT = 3;
    }
    // transient
    if ((bannerT -= dt) <= 0) bannerEl.classList.remove('show');
    if ((hintT -= dt) <= 0) hintEl.classList.remove('show');
    if ((promptT -= dt) <= 0) promptEl.classList.remove('show');
    if ((centerT -= dt) <= 0) centerText.classList.remove('show');
    if ((popT -= dt) <= 0) districtPop.classList.remove('show');
    // crosshair
    crossEl.style.display = P.aiming && P.mode === 'foot' ? '' : 'none';
    hitEl.style.opacity = P.hitMarker > 0 ? 1 : 0;
    // hurt vignette
    hurt.style.opacity = Math.min(0.85, P.hurtFlash + (hp < P.maxHealth * 0.25 ? 0.25 + Math.sin(G.time * 5) * 0.08 : 0));
    // busting meter
    if (G.police.bustT > 0.2) H.hint(`BEING ARRESTED… keep moving! ${Math.floor(G.police.bustT / 2.4 * 100)}%`);
    void moneyPops;
  };

  return H;
}
