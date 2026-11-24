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

export const WEAPONS = {
  fists: { name: 'Fists', damage: 18, rate: 0.42, range: 2.1, ammoMax: 0, auto: false, price: 0 },
  pistol: { name: 'Sidewinder .9', damage: 26, rate: 0.28, range: 90, ammoMax: 120, mag: 12, auto: false, spread: 0.012, price: 250, ammoPrice: 40 },
  smg: { name: 'Hornet SMG', damage: 14, rate: 0.085, range: 80, ammoMax: 300, mag: 30, auto: true, spread: 0.035, price: 900, ammoPrice: 80 },
  shotgun: { name: 'Thumper 12', damage: 12, rate: 0.85, range: 40, ammoMax: 60, mag: 6, auto: false, spread: 0.09, pellets: 8, price: 1500, ammoPrice: 90 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

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
