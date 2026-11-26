# Coral Swift — Island Ring Run

![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)
![Rank](https://make.fun/badge/best-flight-game-20261126-0057/yudhisutawan77/makefun-flight-game/rank.svg)
![Reward](https://make.fun/badge/best-flight-game-20261126-0057/yudhisutawan77/makefun-flight-game/reward.svg)

An entry for [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) on make.fun.

Fly the little coral propeller plane, the *Coral Swift*, around the Coral Isles:
take off from the home runway, thread all five glowing rings in order, then
bring her home and land gently on the runway. Fuel is the budget — every
second at full throttle is a second you do not get back, and the sea and the
mountains end a careless sortie.

## How to play

- **↑ / ↓** — pitch up / down
- **← / →** — bank and turn
- **W / S** — throttle up / down
- **P** — pause, **M** — sound on/off, **R** — fly again
- Mouse: click the TAKE OFF / FLY AGAIN buttons on the menus

The HUD shows airspeed, altitude and vertical speed, a heading compass, an
artificial horizon, fuel and throttle, the rings flown and the score. Land on
the runway after the last ring for the landing, fuel and time bonuses.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

The game is plain static files under `game/` — no build step, no network,
no assets beyond the code itself. Sound is synthesised with WebAudio.

## Layout

- `game/index.html` — the page
- `game/src/config.js` — world, islands, rings, plane and scoring constants
- `game/src/terrain.js` — the deterministic island heightfield
- `game/src/physics.js` — the arcade flight model
- `game/src/render.js` — pseudo-3D chase view, plane, HUD and screens
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised engine, wind, chimes and fanfare
- `game/src/shots.js` — the autopilot that stages the screenshots
- `game/src/main.js` — the loop, the mission and the screens
- `main.ts` — the make.fun hand-in program (Node 22, stdlib only)
