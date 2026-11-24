// Police eyesight: a cone of vision with range and line of sight, plus short-range "heard you" awareness.

const HEAR_RANGE = 7; // closer than this, facing doesn't matter
const FOOT_RANGE = 55, CAR_RANGE = 75;
const FOOT_FOV = 0.34; // cos(~70 deg) half-angle
const CAR_FOV = -0.2; // two officers and mirrors: almost all-round

export function canSee(G, ox, oy, oz, heading, tx, ty, tz, range, fovCos) {
  const dx = tx - ox, dz = tz - oz;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d > HEAR_RANGE && (dx * Math.sin(heading) + dz * Math.cos(heading)) / d < fovCos) return false;
  return G.collision.lineOfSight(ox, oy, oz, tx, ty, tz);
}

// How far officers can pick out the suspect right now: darker nights and a changed vehicle both help the player.
export function sightRangeScale(G) {
  const W = G.wanted;
  return (1 - 0.2 * G.env.night) * (W.search.active && W.descriptionStale ? 0.55 : 1);
}

export function officerSees(G, a, tx, ty, tz, scale = 1) {
  return canSee(G, a.x, a.y + 1.5, a.z, a.heading, tx, ty, tz, FOOT_RANGE * scale, FOOT_FOV);
}

export function cruiserSees(G, v, tx, ty, tz, scale = 1) {
  return canSee(G, v.x, 1.3, v.z, v.heading, tx, ty, tz, CAR_RANGE * scale, CAR_FOV);
}

// Does any officer (on foot, in a manned car, or the helicopter) see the point (x, z)? Used for crime witnesses.
export function copWitness(G, x, z) {
  for (const a of G.actors.list) {
    if (a.kind === 'cop' && !a.dead && !a.inVehicle && officerSees(G, a, x, 1, z)) return a;
  }
  for (const v of G.vehicles.list) {
    if (v.kind === 'police' && !v.dead && v.driver === 'ai' && v.occupant !== null && cruiserSees(G, v, x, 1, z)) return v;
  }
  if (G.police?.heliSees?.(x, z)) return 'heli';
  return null;
}

// Civilians who would phone it in: pedestrians nearby or drivers stopped close by.
export function civilianWitness(G, x, z) {
  for (const a of G.actors.list) {
    if (a.kind === 'ped' && !a.dead && !a.inVehicle && Math.abs(a.x - x) < 30 && Math.abs(a.z - z) < 30 && Math.hypot(a.x - x, a.z - z) < 30) return a;
  }
  for (const v of G.vehicles.list) {
    if (v.driver === 'ai' && v.kind === 'civil' && !v.dead && Math.hypot(v.x - x, v.z - z) < 22) return v;
  }
  return null;
}
