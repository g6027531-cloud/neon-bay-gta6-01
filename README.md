# NEON BAY — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/g6027531-cloud/neon-bay-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/g6027531-cloud/neon-bay-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

Vic rolls into **Neon Bay** — a sun-baked fictional coastal city — with $50
and a borrowed jacket. Rosa Marlowe, who runs the garage on Palm Row, has
work, if Vic can handle the heat: steal cars, run packages, settle scores
with Marlo Vane's Sharks at the docks, and stay one step ahead of Chief
Dray's police. An original top-down 2D open-world crime game built for
[make.fun's gta6-01 bounty](https://make.fun/bounty/gta6-01). Nothing in it
comes from any existing commercial game: the city, characters, vehicles,
story, art and sounds are all its own.

## How to play

- **WASD / arrows** — walk, or drive when you're in a car. **Shift** runs.
- **E** — enter or exit a car (steal one, if you dare — the driver objects,
  and the law notices).
- **Space** — punch. **F or click** — fire the pistol (aim with the mouse).
- **P / Esc** — pause. **M** — mute. Progress autosaves to the browser.

## What's in the city

- A full coastal city to explore on foot and by car: a road grid with
  traffic, sidewalks full of pedestrians, a beach and the sea, a marina,
  the docks, downtown and the casino.
- **6 story missions** for Rosa: Hot Wheels, Package Run, Lose the Heat,
  Dockside Payback, The Marina Job, and The Big Score — each with
  objectives, a timer where it matters, and a cash reward.
- **Wanted level 0–5 stars**: steal cars, hit pedestrians or fire shots
  and the police come after you — in cars and on foot. Break line of sight
  and the heat cools off, star by star.
- Traffic AI that drives the roads, pedestrians who flee from gunfire and
  crashes, rival gang members who fight back.
- HUD with a live minimap (roads, police, mission marker), health, money,
  wanted stars, speed, current objective and an in-game clock with a real
  day/night cycle.
- Synthesized WebAudio sound effects and a looping synthwave bassline — no
  audio files. Particles, screen shake, muzzle flashes and on-screen
  banners. Title, pause and game-over screens, and a localStorage save so
  you can continue your run.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

The game is plain static files under `game/` — no build step, no network
request, no library. It runs offline in a desktop browser.

## Files

- `game/index.html` — the page; `game/src/main.js` — boot and game loop.
- `game/src/world.js` — rules: driving, traffic, police, wanted, combat,
  missions, particles, clock, save.
- `game/src/city.js` — the road grid, buildings, beach and navigation.
- `game/src/missions.js` — the story and the 6 missions.
- `game/src/render.js` — drawing: city, cars, people, HUD, minimap, menus.
- `game/src/input.js`, `game/src/sound.js` (synthesized, no audio files),
  `game/src/shots.js`, `game/src/config.js`, `game/src/random.js`.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` with the vendored
  `vendor/makefun-game.ts`. `serve.ts` — a tiny static server for local play.
- `screenshots/` — 4 renders of the game taken in a browser (title,
  driving on a job, a 3-star police chase, the dockside fight), 1000×1000 PNG.
- `tools/` — the screenshot and playtest scripts used to verify the game.

## License

MIT — see [LICENSE](LICENSE).
