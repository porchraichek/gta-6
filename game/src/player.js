// The player: on-foot movement, melee and guns, entering/driving/carjacking vehicles, health, money and respawning.
import { WEAPONS, WEAPON_ORDER, START_MONEY } from './config.js';
import { clamp } from './random.js';

export function createPlayer(G) {
  const outfit = { style: 'hero', skin: 0xd9a27a, hair: 0x1b1410, shirt: 0xf4f4f0, pants: 0x1d3557, shoes: 0xe8e8e8 };
  const actor = G.actors.spawn('player', 0, 0, { outfit, health: 100, team: 'player' });
  actor.noCollide = false;

  const P = {
    actor,
    mode: 'foot',
    vehicle: null,
    money: START_MONEY,
    maxHealth: 100,
    weapons: { fists: true },
    reserve: {},
    mag: {},
    weapon: 'fists',
    reloadT: 0,
    attackT: 0,
    aiming: false,
    control: true,
    dead: false,
    deadT: 0,
    busted: false,
    stamina: 1,
    lastDamageT: 99,
    sprinting: false,
    enterT: 0,
    enterTarget: null,
    stats: { kills: 0, distance: 0, carsStolen: 0, crashes: 0, playTime: 0, punches: 0, shots: 0, wrecked: 0 },
    comboIdx: 0,
    comboT: 0,
    hurtFlash: 0,
    hitMarker: 0,
    armor: 0,
    get x() { return P.mode === 'car' ? P.vehicle.x : actor.x; },
    get z() { return P.mode === 'car' ? P.vehicle.z : actor.z; },
    get y() { return P.mode === 'car' ? P.vehicle.y : actor.y; },
    get heading() { return P.mode === 'car' ? P.vehicle.heading : actor.heading; },
    get speed() { return P.mode === 'car' ? P.vehicle.speed : actor.speed; },
    get health() { return actor.health; },
  };

  P.addMoney = (n) => {
    P.money += n;
    G.hud?.moneyPop(n);
  };
  P.spend = (n) => {
    if (P.money < n) return false;
    P.money -= n;
    return true;
  };

  P.giveWeapon = (id, ammo = 0) => {
    P.weapons[id] = true;
    const w = WEAPONS[id];
    if (w.mag) {
      P.mag[id] ??= 0;
      P.reserve[id] = Math.min(w.ammoMax, (P.reserve[id] || 0) + ammo);
      if (P.mag[id] === 0 && P.reserve[id] > 0) reloadInstant(id);
    }
  };
  function reloadInstant(id) {
    const w = WEAPONS[id];
    const need = w.mag - (P.mag[id] || 0);
    const take = Math.min(need, P.reserve[id] || 0);
    P.mag[id] = (P.mag[id] || 0) + take;
    P.reserve[id] = (P.reserve[id] || 0) - take;
  }
  P.selectWeapon = (id) => {
    if (!P.weapons[id] || P.weapon === id) return;
    P.weapon = id;
    P.reloadT = 0;
    G.actors.setWeapon(actor, id);
    G.audio?.click();
  };

  P.teleport = (x, z, heading) => {
    if (P.mode === 'car') P.exitVehicle(true);
    actor.x = x; actor.z = z; actor.heading = heading ?? actor.heading;
    actor.y = 0.2;
    actor.vx = actor.vz = actor.kx = actor.kz = 0;
    G.camera3?.snap();
  };

  P.heal = (n) => {
    actor.health = Math.min(P.maxHealth, actor.health + n);
  };

  P.takeDamage = (amount, attacker, opts = {}) => {
    if (P.dead || P.godMode) return;
    P.lastDamageT = 0;
    P.hurtFlash = Math.min(1, P.hurtFlash + amount / 40);
    if (P.armor > 0) {
      const ab = Math.min(P.armor, amount * 0.7);
      P.armor -= ab;
      amount -= ab;
    }
    actor.health -= amount;
    G.audio?.hurt();
    if (opts.dirX !== undefined) { actor.kx += opts.dirX; actor.kz += opts.dirZ; }
    G.fx.addShake(0.12);
    if (actor.health <= 0) P.die(attacker);
  };

  P.die = (attacker) => {
    if (P.dead) return;
    P.dead = true;
    P.deadT = 0;
    actor.health = 0;
    if (P.mode === 'car') {
      const v = P.vehicle;
      P.exitVehicle(true);
      v.input.throttle = 0;
    }
    actor.dead = true;
    actor.deadT = 0;
    G.events.emit('playerDied', attacker);
  };

  P.respawn = (spot, reason) => {
    P.dead = false;
    P.busted = false;
    actor.dead = false;
    actor.health = P.maxHealth;
    actor.model.group.rotation.x = 0;
    actor.deadT = 0;
    actor.stagger = 0;
    P.armor = 0;
    if (reason === 'busted') {
      const lose = Math.floor(P.money * 0.1);
      P.money -= lose;
      P.weapon = 'fists';
      G.actors.setWeapon(actor, 'fists');
      for (const k of Object.keys(P.reserve)) P.reserve[k] = Math.floor(P.reserve[k] * 0.4);
      G.hud?.notify(`Booked: fined $${lose}. Weapons confiscated.`, 'warn');
    } else {
      const lose = Math.min(P.money, Math.floor(250 + P.money * 0.05));
      P.money -= lose;
      G.hud?.notify(`Hospital bill: $${lose}`, 'warn');
    }
    G.wanted.clear();
    P.teleport(spot.x, spot.z, spot.heading);
  };

  // ------- vehicles
  function findEnterable() {
    let best = null, bd = 3.6;
    for (const v of G.vehicles.list) {
      if (v.dead || v.burning && v.health <= 0) continue;
      const d = Math.hypot(v.x - actor.x, v.z - actor.z) - v.def.length * 0.25;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  P.nearbyVehicle = findEnterable;

  P.enterVehicle = (v, jack = false) => {
    if (P.mode === 'car' || v.dead) return;
    // eject the current occupant
    if (v.driver && v.driver !== 'player') {
      ejectOccupant(v);
      P.stats.carsStolen++;
      G.events.emit('carjack', v);
    } else if (!v.playerOwned && !v.mission) {
      if (v.kind !== 'civil') G.events.emit('carjack', v);
    }
    v.ai = null;
    v.driver = 'player';
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = false;
    v.sirenOn = false;
    P.vehicle = v;
    P.mode = 'car';
    actor.inVehicle = v;
    actor.x = v.x; actor.z = v.z;
    G.events.emit('enterVehicle', v);
    G.audio?.doorClose();
    P.jack = jack;
  };

  function ejectOccupant(v) {
    const side = Math.cos(v.heading), sz = -Math.sin(v.heading);
    const x = v.x + side * (v.def.width / 2 + 0.8), z = v.z + sz * (v.def.width / 2 + 0.8);
    let a = v.occupant;
    if (a && !a.removed) {
      a.inVehicle = null;
      a.x = x; a.z = z;
    } else {
      a = G.pedestrians.spawnAt(x, z);
    }
    v.occupant = null;
    a.ai = { type: 'flee', t: 12, from: 'player' };
    a.kx = side * 4; a.kz = sz * 4;
    if (v.kind === 'police') {
      // a cop dragged from the cruiser fights back
      G.police.makeHostile(a);
    }
    v.driver = null;
  }

  P.exitVehicle = (force = false) => {
    if (P.mode !== 'car') return;
    const v = P.vehicle;
    if (!force && v.speed > 14) {
      G.hud?.notify('Slow down to get out!', 'info');
      return;
    }
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    // try left side, then right
    for (const side of [1, -1]) {
      const x = v.x + lx * side * (v.def.width / 2 + 0.7), z = v.z + lz * side * (v.def.width / 2 + 0.7);
      const res = G.collision.pushCircle(x, z, 0.4);
      if (!res.hit) { actor.x = x; actor.z = z; break; }
      actor.x = res.x; actor.z = res.z;
    }
    actor.y = v.y;
    actor.inVehicle = null;
    actor.heading = v.heading;
    actor.vx = v.vx * 0.4; actor.vz = v.vz * 0.4;
    v.driver = null;
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
    v.playerOwned = true;
    P.vehicle = null;
    P.mode = 'foot';
    G.events.emit('exitVehicle', v);
    G.audio?.doorClose();
  };

  // ------- per-frame
  const cam = () => G.camera3;
  const input = G.input;

  function updateFoot(dt) {
    const k = input;
    const yaw = cam().yaw;
    const f = k.axis('KeyS', 'KeyW'), r = k.axis('KeyA', 'KeyD');
    let mx = Math.sin(yaw) * f + -Math.cos(yaw) * r;
    let mz = Math.cos(yaw) * f + Math.sin(yaw) * r;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const hasGun = P.weapon !== 'fists';
    P.aiming = P.control && !P.dead && hasGun && (input.state.rmb || input.state.lmb);
    P.sprinting = k.down('ShiftLeft') && len > 0 && P.stamina > 0.05 && !P.aiming;
    let speed = P.sprinting ? 7.8 : 5.0;
    if (P.aiming) speed = 3.0;
    if (P.sprinting) P.stamina = Math.max(0, P.stamina - dt / 5.5);
    else P.stamina = Math.min(1, P.stamina + dt / 4);
    if (P.enterT > 0) { mx = mz = 0; }
    actor.wantVX = mx * speed;
    actor.wantVZ = mz * speed;
    if (P.aiming) actor.faceHeading = yaw;
    else actor.faceHeading = len > 0.1 ? null : actor.faceHeading ?? null;
    if (!P.aiming && len < 0.1) actor.faceHeading = null;
    actor.aiming = P.aiming;
    if (k.hit('Space') && actor.grounded && P.control && !P.dead) {
      actor.vy = 7.2;
      actor.grounded = false;
    }

    // weapon switching
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      if (k.hit('Digit' + (i + 1))) P.selectWeapon(WEAPON_ORDER[i]);
    }
    if (input.state.wheel) {
      const owned = WEAPON_ORDER.filter((w) => P.weapons[w]);
      const i = owned.indexOf(P.weapon);
      P.selectWeapon(owned[(i + Math.sign(input.state.wheel) + owned.length) % owned.length]);
    }

    P.attackT -= dt;
    P.comboT -= dt;
    const w = WEAPONS[P.weapon];
    if (P.reloadT > 0) {
      P.reloadT -= dt;
      if (P.reloadT <= 0) reloadInstant(P.weapon);
    }
    if (k.hit('KeyR') && w.mag && P.reloadT <= 0 && (P.mag[P.weapon] || 0) < w.mag && (P.reserve[P.weapon] || 0) > 0) {
      P.reloadT = 1.15;
      G.audio?.reload();
    }
    const wantFire = P.control && !P.dead && (w.auto ? input.state.lmb : input.state.lmbPressed);
    if (wantFire && P.attackT <= 0 && P.enterT <= 0) {
      if (P.weapon === 'fists') punch();
      else shoot();
    }
  }

  function punch() {
    const w = WEAPONS.fists;
    P.attackT = w.rate;
    P.comboIdx = P.comboT > 0 ? (P.comboIdx + 1) % 3 : 0;
    P.comboT = 0.9;
    actor.punchT = 0.28;
    actor.punchSide = P.comboIdx % 2;
    const yaw = cam().yaw;
    // lunge toward the camera direction when attacking
    actor.heading = yaw;
    actor.faceHeading = null;
    actor.kx += Math.sin(yaw) * 3;
    actor.kz += Math.cos(yaw) * 3;
    P.stats.punches++;
    G.audio?.swing();
    // delay the hit a hair so the animation reads
    setTimeout(() => {
      const hit = G.combat.melee(actor, 'fists', P.comboIdx === 2 ? 1.7 : 1);
      if (hit) { P.hitMarker = 0.2; G.fx.addShake(0.08); }
    }, 90);
  }

  function shoot() {
    const w = WEAPONS[P.weapon];
    if (P.reloadT > 0) return;
    if ((P.mag[P.weapon] || 0) <= 0) {
      if ((P.reserve[P.weapon] || 0) > 0) { P.reloadT = 1.15; G.audio?.reload(); }
      else { G.audio?.click(); G.hud?.notify('Out of ammo', 'info'); P.attackT = 0.4; }
      return;
    }
    P.attackT = w.rate;
    P.mag[P.weapon]--;
    P.stats.shots++;
    actor.fired = 0.14;
    const yaw = cam().yaw;
    actor.heading = yaw;
    // muzzle: right hand height, slightly ahead
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const mx = actor.x + s * 0.8 - c * 0.28 * -1, mz = actor.z + c * 0.8 + s * 0.28 * -1;
    const my = actor.y + 1.35;
    const ray = cam().aimRay();
    // find where the crosshair ray lands, then fire from the muzzle at that point
    const hit = G.combat.trace(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, w.range + 20, actor);
    const tx = ray.ox + ray.dx * hit.t, ty = ray.oy + ray.dy * hit.t, tz = ray.oz + ray.dz * hit.t;
    let dx = tx - mx, dy = ty - my, dz = tz - mz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const moving = actor.speed > 1 ? 1.6 : 1;
    const r = G.combat.fire(actor, P.weapon, mx, my, mz, dx, dy, dz, { spreadMult: moving });
    G.fx.muzzle(mx, my, mz, dx, dz);
    G.audio?.gunshot(P.weapon, mx, mz, true);
    if (r && (r.type === 'actor')) P.hitMarker = 0.2;
    G.fx.addShake(P.weapon === 'shotgun' ? 0.25 : 0.04);
    G.camera3?.kick(P.weapon === 'shotgun' ? 0.04 : 0.012);
    G.events.emit('playerShot', P.weapon);
  }

  function updateCar(dt) {
    const v = P.vehicle;
    const k = input;
    const f = k.axis('KeyS', 'KeyW');
    const inp = v.input;
    inp.throttle = P.control && !P.dead ? f : 0;
    inp.steer = P.control && !P.dead ? k.axis('KeyA', 'KeyD') * -1 : 0;
    // steering: A turns left. Heading increases counter-clockwise seen from above (towards +x when facing +z? see physics): handled by sign here.
    inp.handbrake = P.control && !P.dead && k.down('Space');
    if (k.hit('KeyH')) G.audio?.horn(true);
    if (k.hit('KeyR')) G.music?.next();
    v.hornT = k.down('KeyH') ? 1 : 0;
    actor.x = v.x; actor.z = v.z;
    P.aiming = false;
    P.sprinting = false;
  }

  P.update = (dt) => {
    P.stats.playTime += dt;
    P.lastDamageT += dt;
    P.hurtFlash = Math.max(0, P.hurtFlash - dt * 1.5);
    P.hitMarker = Math.max(0, P.hitMarker - dt);
    if (P.dead) {
      P.deadT += dt;
      return;
    }
    // health regeneration out of combat up to 60%
    if (P.lastDamageT > 7 && actor.health < P.maxHealth * 0.6) actor.health = Math.min(P.maxHealth * 0.6, actor.health + dt * 2.5);
    if (P.mode === 'car') updateCar(dt);
    else updateFoot(dt);

    if (P.control && input.hit('KeyF')) {
      if (P.mode === 'car') P.exitVehicle();
      else {
        const v = findEnterable();
        if (v) {
          const hasDriver = v.driver && v.driver !== 'player';
          P.enterVehicle(v, hasDriver);
        }
      }
    }
    if (P.mode === 'foot') {
      const dx = actor.x - (P.lastX ?? actor.x), dz = actor.z - (P.lastZ ?? actor.z);
      P.stats.distance += Math.hypot(dx, dz);
    } else {
      P.stats.distance += P.vehicle.speed * dt;
    }
    P.lastX = actor.x; P.lastZ = actor.z;
  };

  P.serialize = () => ({
    money: P.money, maxHealth: P.maxHealth, weapons: P.weapons, reserve: P.reserve, mag: P.mag, weapon: P.weapon, armor: P.armor, stats: P.stats,
    x: P.x, z: P.z, heading: P.heading, health: actor.health,
  });
  P.restore = (s) => {
    P.money = s.money ?? P.money;
    P.maxHealth = s.maxHealth ?? 100;
    P.weapons = s.weapons || { fists: true };
    P.reserve = s.reserve || {};
    P.mag = s.mag || {};
    P.armor = s.armor || 0;
    P.stats = { ...P.stats, ...(s.stats || {}) };
    actor.health = clamp(s.health ?? P.maxHealth, 20, P.maxHealth);
    P.weapon = P.weapons[s.weapon] ? s.weapon : 'fists';
    G.actors.setWeapon(actor, P.weapon);
  };
  P.resetNew = () => {
    P.money = START_MONEY;
    P.maxHealth = 100;
    actor.health = 100;
    P.weapons = { fists: true };
    P.reserve = {}; P.mag = {};
    P.weapon = 'fists';
    G.actors.setWeapon(actor, 'fists');
    P.armor = 0;
    P.stats = { kills: 0, distance: 0, carsStolen: 0, crashes: 0, playTime: 0, punches: 0, shots: 0, wrecked: 0 };
    P.dead = false;
    actor.dead = false;
  };

  return P;
}
