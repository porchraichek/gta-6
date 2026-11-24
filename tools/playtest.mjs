// End-to-end play-test in headless Chrome: boots the game, then checks the frame loop, driving,
// police response, completing the first story mission and a save/load round trip.
// Usage: node tools/playtest.mjs
import { fileURLToPath } from 'node:url';
import { openGame } from './browser.mjs';

const page = await openGame('');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

try {
  await page.waitFor('window.__game && window.__game.state === "title"');
  check('title screen', await page.eval('!!document.querySelector("#ui") && __game.state === "title"'));

  // New game through the real menu code path, then let real frames run.
  await page.eval('__game.save.erase?.(); __game.startGame(false); true');
  const t0 = await page.eval('__game.time');
  await page.sleep(2500);
  const t1 = await page.eval('__game.time');
  check('game loop runs', t1 > t0 + 0.05, `time ${t0.toFixed(2)} -> ${t1.toFixed(2)}`);
  check('first mission starts', await page.eval('!!__game.missions.active'), await page.eval('__game.missions.active?.def?.title || ""'));

  // Driving: get in the parked starter car and hold W with real key events.
  const drive = await page.eval(`(() => {
    const G = __game, P = G.player;
    const v = G.vehicles.list.filter(v => !v.driver && !v.removed).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    P.teleport(v.x + 2.5, v.z, 0);
    P.enterVehicle(v, false);
    for (let i = 0; i < 60; i++) G.step(1 / 30);
    return { mode: P.mode, x: v.x, z: v.z };
  })()`);
  // hold W as a real key event, stepping the simulation while it is held (headless frames are slow)
  await page.key('KeyW', 'down');
  await page.eval('for (let i = 0; i < 90; i++) __game.step(1 / 30); true');
  await page.key('KeyW', 'up');
  const after = await page.eval('({ mode: __game.player.mode, speed: __game.player.vehicle?.speed ?? 0, x: __game.player.vehicle?.x, z: __game.player.vehicle?.z })');
  const moved = Math.hypot(after.x - drive.x, after.z - drive.z);
  check('driving', drive.mode === 'car' && moved > 3, `mode ${drive.mode}, moved ${moved.toFixed(1)} m, speed ${after.speed.toFixed(1)}`);

  // Police: raise the wanted level and let units respond.
  const cops = await page.eval(`(() => {
    const G = __game; G.wanted.setStars(3);
    for (let i = 0; i < 450; i++) G.step(1 / 30);
    const units = G.actors.list.filter(a => a.kind === 'cop' || a.kind === 'swat').length;
    const cars = G.vehicles.list.filter(v => v.type === 'cruiser' || v.type === 'swat' || v.police).length;
    return { stars: G.wanted.stars, units, cars, heli: !!(G.police.heli || G.police.helicopter) };
  })()`);
  check('police respond', cops.stars >= 1 && cops.units + cops.cars > 0, JSON.stringify(cops));
  await page.eval('__game.wanted.clear(); true');

  // Mission: finish the opening mission (debug helper if present, else drive the objective).
  const mission = await page.eval(`(async () => {
    const G = __game, M = G.missions;
    const before = M.state.completed.length;
    const title = M.active?.def?.title;
    for (let k = 0; k < 400 && M.active; k++) {
      const m = M.active, o = m.objective;
      if (o && o.x != null) {
        const tgt = G.player.vehicle || null;
        if (tgt) { tgt.x = o.x; tgt.z = o.z; tgt.vx = tgt.vz = 0; tgt.speed = 0; }
        else G.player.teleport(o.x, o.z, 0);
      }
      for (let i = 0; i < 30; i++) G.step(1 / 30);
      G.dialogue.skip?.();
    }
    return { title, before, after: M.state.completed.length, active: !!M.active };
  })()`);
  check('mission completes', mission.after > mission.before, JSON.stringify(mission));

  // Save / load round trip.
  const sl = await page.eval(`(() => {
    const G = __game, P = G.player;
    P.money = 12345;
    G.save.manual('Playtest');
    const done = G.missions.state.completed.length;
    P.money = 1;
    G.startGame(true);
    return { money: P.money, done, doneAfter: G.missions.state.completed.length, state: G.state };
  })()`);
  check('save/load', sl.money === 12345 && sl.doneAfter === sl.done && sl.state === 'play', JSON.stringify(sl));

  await page.sleep(1500);
  check('frames still running', (await page.eval('__game.time')) > t1);
  await page.screenshot(fileURLToPath(new URL('../.scratch/playtest.jpg', import.meta.url)));
} catch (e) {
  check('no exception in test', false, e.message);
}
check('no page errors', page.errors.length === 0, page.errors.slice(0, 8).join(' | '));
check('no network requests', page.requests.length === 0, page.requests.slice(0, 5).join(' '));
await page.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
