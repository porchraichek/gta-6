# PALMERA NIGHTS

An original open-world crime game for the make.fun "Make GTA 6" bounty, built with three.js and plain ES modules (no build step).

You are Nico Vega, two years out of prison and back in Palmera Bay, a sun-soaked island city of beaches, glass towers, hills and docks. Crime boss Victor Hale owes you everything.

## Play

Serve `game/` with any static server (for example `node serve.ts`, then open http://localhost:8080) in desktop Chrome. Everything is generated in code (city, textures, models, sound and music), so nothing loads over the network.

Keyboard and mouse: WASD move/drive, mouse look, Shift sprint, Space jump/handbrake, F enter/exit/carjack, LMB punch/shoot, RMB aim, 1-4 weapons, R reload (radio in a car), H horn, C look back, E interact, M map, Esc/P pause, F5/F9 quick save/load.

## What is in it

- A procedural 12x12-block island city with five districts (Aurelio Heights downtown, Cobalt Row, Coral Beach, Port Marrow docks, Verde Hills), a day/night cycle, a procedural sky and sea.
- Traffic that follows lanes and traffic lights, parked cars, pedestrians that stroll, cross, flee and fight back.
- Seven vehicle types with arcade physics, damage, fire and explosions, skid marks and sirens.
- Wanted level (1-5 stars) with cruisers that route to you, foot cops, SWAT vans, a helicopter, arrests and respawns.
- Eight story missions (go-to, steal, brawl, gunfight, timed delivery, chase, heist and escape), a street race, Sun Medallion collectibles, weapon shop, Pay'n'Spray, hospital and safehouse saves.
- HUD with minimap and full map, objective, money, stars, health/armor, ammo, speedometer, dialogue subtitles; start, pause, controls, settings screens; localStorage save.
- WebAudio engine, tyres, guns, explosions, sirens, and three procedural radio stations.

Source layout: `game/src/` has one file per job (city generation, meshes, vehicles, traffic, police, missions, HUD, minimap, audio, music, save, ...). Showcase scenes for screenshots use `?shot=chase|combat|night|beach|title`.

## License

MIT
