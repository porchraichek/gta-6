// Global tuning constants for PALMERA NIGHTS: world size, vehicle stats, weapons, palettes.

export const GAME_TITLE = 'PALMERA NIGHTS';
export const CITY_NAME = 'Palmera Bay';

// World grid: N x N blocks, roads in between and around the outside.
export const N = 12;
export const BLOCK = 72;
export const ROAD = 18;
export const PITCH = BLOCK + ROAD; // 90
export const HALF = (N * PITCH) / 2; // 540: road centre lines run from -HALF..HALF
export const ISLAND = HALF + 70; // walkable land edge
export const LANE = 4.5; // lane centre offset from road centre line
export const SIDEWALK_H = 0.18;

export const DISTRICTS = {
  downtown: { name: 'Aurelio Heights', color: '#ffd166' },
  midtown: { name: 'Cobalt Row', color: '#6ec6ff' },
  beach: { name: 'Coral Beach', color: '#ff8fa3' },
  harbor: { name: 'Port Marrow', color: '#9aa5b1' },
  hills: { name: 'Verde Hills', color: '#7bd88f' },
  park: { name: 'Central Palms', color: '#4caf50' },
};

// Vehicle archetypes. length/width/height are body size in metres.
export const VEHICLES = {
  compact: { name: 'Pico GT', length: 3.7, width: 1.7, height: 1.35, maxSpeed: 34, accel: 17, grip: 5.5, steer: 0.62, health: 100, mass: 0.8, price: 0 },
  sedan: { name: 'Marlin LX', length: 4.6, width: 1.85, height: 1.4, maxSpeed: 40, accel: 18, grip: 5, steer: 0.55, health: 130, mass: 1.0, price: 0 },
  sports: { name: 'Vesper RS', length: 4.4, width: 1.9, height: 1.15, maxSpeed: 58, accel: 31, grip: 6.5, steer: 0.6, health: 110, mass: 0.9, price: 0 },
  pickup: { name: 'Brute 4x4', length: 5.2, width: 2.0, height: 1.85, maxSpeed: 38, accel: 16, grip: 4.2, steer: 0.5, health: 190, mass: 1.5, price: 0 },
  van: { name: 'Hauler V', length: 5.4, width: 2.0, height: 2.4, maxSpeed: 33, accel: 12, grip: 4, steer: 0.48, health: 200, mass: 1.7, price: 0 },
  cruiser: { name: 'Patrol P7', length: 4.8, width: 1.9, height: 1.45, maxSpeed: 50, accel: 25, grip: 5.6, steer: 0.58, health: 170, mass: 1.2, price: 0 },
  swat: { name: 'Bulwark', length: 5.8, width: 2.2, height: 2.3, maxSpeed: 40, accel: 20, grip: 4.6, steer: 0.5, health: 320, mass: 2.2, price: 0 },
};

export const CIVILIAN_CARS = ['compact', 'sedan', 'sedan', 'sports', 'pickup', 'van', 'compact'];

export const CAR_COLORS = [
  0xe63946, 0xf4a261, 0xffd166, 0x2a9d8f, 0x3a86ff, 0xf1faee, 0x1d3557, 0xff6fb5, 0x8338ec, 0x2b2d42, 0xc0c7cf, 0x06d6a0,
];

// Weapons. kind: 'melee' | 'gun' | 'throw'. slot: number key (1-6) that selects it.
// Guns: spread = hip-fire cone (radians), aimSpread multiplier when RMB-aiming, recoil = camera pitch kick,
// bloom = spread added per shot, reload = seconds, sound = audio profile. zoomFov = scoped field of view.
// Throwables: mag 1 (one in hand), radius/damage of the blast, fuse seconds (0 = bursts on impact), burn = fire seconds.
export const WEAPONS = {
  fists: { name: 'Fists', kind: 'melee', slot: 1, damage: 18, rate: 0.42, range: 2.1, knock: 2, ammoMax: 0, auto: false, price: 0 },
  bat: { name: 'Ironwood Bat', kind: 'melee', slot: 1, damage: 40, rate: 0.62, range: 2.7, knock: 3.4, ammoMax: 0, auto: false, price: 180 },
  pistol: { name: 'Sidewinder .9', kind: 'gun', slot: 2, damage: 26, rate: 0.28, range: 90, ammoMax: 120, mag: 12, auto: false, spread: 0.022, aimSpread: 0.45, recoil: 0.022, bloom: 0.012, reload: 1.1, sound: 'pistol', price: 250, ammoPrice: 40 },
  smg: { name: 'Hornet SMG', kind: 'gun', slot: 3, damage: 14, rate: 0.085, range: 80, ammoMax: 300, mag: 30, auto: true, spread: 0.04, aimSpread: 0.6, recoil: 0.01, bloom: 0.006, reload: 1.5, sound: 'smg', price: 900, ammoPrice: 80 },
  shotgun: { name: 'Thumper 12', kind: 'gun', slot: 4, damage: 12, rate: 0.85, range: 40, ammoMax: 60, mag: 6, auto: false, spread: 0.09, aimSpread: 0.8, pellets: 8, recoil: 0.06, bloom: 0, reload: 1.9, sound: 'shotgun', price: 1500, ammoPrice: 90 },
  rifle: { name: 'Kestrel AR-7', kind: 'gun', slot: 5, damage: 24, rate: 0.11, range: 130, ammoMax: 240, mag: 30, auto: true, spread: 0.035, aimSpread: 0.4, recoil: 0.014, bloom: 0.005, reload: 1.7, sound: 'smg', price: 2400, ammoPrice: 120 },
  marksman: { name: 'Heron Longreach', kind: 'gun', slot: 5, damage: 90, rate: 0.95, range: 280, ammoMax: 40, mag: 5, auto: false, spread: 0.05, aimSpread: 0.03, recoil: 0.07, bloom: 0, reload: 2.2, sound: 'shotgun', zoomFov: 20, price: 3200, ammoPrice: 150 },
  grenade: { name: 'Thunder Egg', kind: 'throw', slot: 6, damage: 140, radius: 7.5, fuse: 2.2, rate: 0.9, range: 40, ammoMax: 8, mag: 1, auto: false, reload: 0, price: 600, ammoPrice: 300 },
  firebomb: { name: 'Bottle Blaze', kind: 'throw', slot: 6, damage: 24, radius: 4.2, fuse: 0, burn: 6, rate: 0.9, range: 40, ammoMax: 8, mag: 1, auto: false, reload: 0, price: 400, ammoPrice: 220 },
};
// Selection / mouse-wheel order. Keys 1-6 pick a slot; pressing again cycles weapons sharing that slot.
export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'marksman', 'grenade', 'firebomb'];

// Player on-foot tuning.
export const PLAYER_MOVE = {
  walk: 5.0, sprint: 7.9, aimWalk: 3.0, crouch: 2.4, accel: 9, airAccel: 2.5,
  sprintDrain: 1 / 6, staminaRegen: 1 / 3.5, rollCost: 0.22, rollSpeed: 9.5, rollTime: 0.5, rollInvuln: 0.32,
  jump: 7.2, climbMax: 2.9, regenTo: 0.5, regenDelay: 6, regenRate: 3,
};

export const WANTED_LABEL = ['Clean', 'Hot', 'Wanted', 'Dangerous', 'Armed & Dangerous', 'Public Enemy'];

export const START_MONEY = 350;
export const START_TIME_HOURS = 17.6; // golden hour
export const DAY_SECONDS = 1080; // one full day in real seconds

export const COLORS = {
  sidewalk: 0xcfc6b8,
  grass: 0x5d9a4a,
  sand: 0xe9d3a1,
  asphalt: 0x3a3d44,
  water: 0x1a8fa8,
};
