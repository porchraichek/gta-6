// Interactive places: weapon shop, Pay'n'Spray, hospital, safehouse garage and the diner.
import { WEAPONS } from './config.js';

export function createPlaces(G) {
  const Pl = { current: null };
  const L = () => G.city.landmarks;

  const spots = [
    { id: 'arms', color: 0xff5d5d, icon: 'shop', label: "Gunnar's Arms", radius: 3.2, foot: true },
    { id: 'spray', color: 0x6ee7ff, icon: 'spray', label: "Pay'n'Spray", radius: 4.6, car: true },
    { id: 'hospital', color: 0xffffff, icon: 'hospital', label: 'Hospital', radius: 3.2, foot: true },
    { id: 'garage', color: 0x7cf29a, icon: 'home', label: 'Safehouse', radius: 3.4, foot: true },
    { id: 'diner', color: 0xff8fa3, icon: 'food', label: 'Seagull Diner', radius: 3.2, foot: true, offset: [-5, 0] },
  ];

  Pl.setup = () => {
    for (const s of spots) {
      const lm = L()[s.id];
      const x = lm.x + (s.offset ? s.offset[0] : 0), z = lm.z + (s.offset ? s.offset[1] : 0);
      s.m = G.markers.add({ x, z, color: s.color, radius: s.radius, blip: true, icon: s.icon, label: s.label, pillar: s.id !== 'garage' && s.id !== 'diner', height: 14, far: 500 });
    }
    // car-only repaint ring: moved onto the road in front of the shop
    const sp = spots.find((s) => s.id === 'spray');
    G.markers.remove(sp.m);
    sp.x = L().spray.roadX; sp.z = L().spray.z + 14;
    sp.m = G.markers.add({ x: sp.x, z: sp.z, color: sp.color, radius: 5, blip: true, icon: 'spray', label: "Pay'n'Spray", pillar: true, height: 14, far: 500 });
  };

  function nearSpot() {
    const P = G.player;
    for (const s of spots) {
      if (!s.m) continue;
      const d = Math.hypot(P.x - s.m.x, P.z - s.m.z);
      if (d < s.radius + (P.mode === 'car' ? 2.5 : 0.8)) {
        if (s.car && P.mode !== 'car') continue;
        if (s.foot && P.mode !== 'foot') continue;
        return s;
      }
    }
    return null;
  }

  const FOOD_COST = 20;

  Pl.update = (dt) => {
    const P = G.player;
    const s = nearSpot();
    Pl.current = s;
    if (!s || P.dead || G.missions?.active && s.id === 'garage' && false) return;
    switch (s.id) {
      case 'arms':
        G.hud.prompt('E', "Open Gunnar's Arms");
        if (G.input.hit('KeyE')) G.menus.openShop();
        break;
      case 'hospital': {
        const need = Math.ceil(P.maxHealth - P.health);
        G.hud.prompt('E', need > 1 ? `Treatment: heal ${need} HP for $${Math.min(120, need * 2)}` : 'Hospital: you are healthy');
        if (G.input.hit('KeyE') && need > 1) {
          const cost = Math.min(120, need * 2);
          if (P.spend(cost)) { P.heal(need); G.hud.notify(`Treated for $${cost}`, 'good'); G.audio?.pickup(); }
          else G.hud.notify('Not enough cash', 'warn');
        }
        break;
      }
      case 'garage':
        G.hud.prompt('E', 'Rest at the safehouse: save game');
        if (G.input.hit('KeyE')) {
          P.heal(P.maxHealth);
          G.save.manual('Okafor Auto');
          G.audio?.pickup();
        }
        break;
      case 'diner':
        G.hud.prompt('E', `Buy a Seagull burger ($${FOOD_COST}, +30 HP)`);
        if (G.input.hit('KeyE')) {
          if (P.spend(FOOD_COST)) { P.heal(30); G.hud.notify('Tasty. +30 HP', 'good'); G.audio?.cash(); }
          else G.hud.notify('Not enough cash', 'warn');
        }
        break;
      case 'spray': {
        const v = P.vehicle;
        if (P.sprayCooldown > 0) { P.sprayCooldown -= dt; break; }
        const cost = G.wanted.stars > 0 ? 250 : 120;
        G.hud.prompt('', `Pay'n'Spray: stop in the ring ($${cost})`);
        if (v.speed < 4 && !v.dead) {
          if (P.spend(cost)) {
            v.health = v.maxHealth;
            v.burning = false;
            v.model.bodyMat.color.setHex([0xe63946, 0x3a86ff, 0xffd166, 0x2a9d8f, 0xf1faee][Math.floor(Math.random() * 5)]);
            G.wanted.clear();
            G.hud.notify(`Fresh paint, clean record. -$${cost}`, 'good');
            G.audio?.cash();
            s.m.group.visible = false;
            setTimeout(() => (s.m.group.visible = true), 3000);
            P.sprayCooldown = 3;
          } else G.hud.notify('Not enough cash', 'warn');
        }
        break;
      }
    }
  };

  // weapon shop catalogue used by the menu
  Pl.catalogue = () => {
    const P = G.player;
    const items = [];
    for (const id of ['pistol', 'smg', 'shotgun']) {
      const w = WEAPONS[id];
      if (!P.weapons[id]) {
        items.push({ id: 'w-' + id, label: `${w.name}`, desc: `Damage ${w.damage}${w.pellets ? 'x' + w.pellets : ''}, ${w.auto ? 'full auto' : 'semi'}`, price: w.price });
      } else items.push({ id: 'a-' + id, label: `${w.name} ammo`, desc: `+${Math.round(w.mag * 3)} rounds (reserve ${P.reserve[id] || 0}/${w.ammoMax})`, price: w.ammoPrice });
    }
    items.push({ id: 'armor', label: 'Body armor', desc: 'Absorbs 70% of damage until depleted', price: 350 });
    items.push({ id: 'health', label: 'First-aid kit', desc: 'Restore full health', price: 150 });
    return items;
  };
  Pl.buy = (id) => {
    const P = G.player;
    const item = Pl.catalogue().find((i) => i.id === id);
    if (!item) return false;
    if (!P.spend(item.price)) { G.hud.notify('Not enough cash', 'warn'); G.audio?.click(); return false; }
    if (id.startsWith('w-')) P.giveWeapon(id.slice(2), WEAPONS[id.slice(2)].mag * 3);
    else if (id.startsWith('a-')) {
      const w = id.slice(2);
      P.reserve[w] = Math.min(WEAPONS[w].ammoMax, (P.reserve[w] || 0) + WEAPONS[w].mag * 3);
    } else if (id === 'armor') P.armor = 100;
    else if (id === 'health') P.heal(P.maxHealth);
    G.audio?.cash();
    G.hud.notify(`Bought ${item.label}`, 'good');
    return true;
  };

  return Pl;
}
