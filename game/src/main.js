// Coral Swift — Island Ring Run: the game loop, the mission and the screens.
// The mission: take off from the home runway, fly the five rings in order
// around the Coral Isles, then land back on the runway. Fuel is the budget —
// every second at full throttle is a second you do not get back.
import { SCORE, STEP, WORLD } from './config.js';
import { createPlane, stepPlane, EVENT_LANDED, EVENT_CRASHED, CRASH_WATER } from './physics.js';
import { drawScene } from './render.js';
import { createInput, readFlightInput, pressed, takeClick, hitButton } from './input.js';
import { createAudio, startAudio, updateAudio, playRingChime, playCrash, playLanding, toggleMute } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');

const input = createInput(canvas);
const audio = createAudio();

const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSED = 'paused';
const SCREEN_CRASHED = 'crashed';
const SCREEN_COMPLETE = 'complete';
const SCREEN_LANDED_EARLY = 'landed-early';

const BEST_KEY = 'coral-swift-best-score';

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Private mode or a host that blocks storage: the score still shows.
  }
}

function createGame() {
  return {
    screen: SCREEN_TITLE,
    plane: createPlane(),
    ringsDone: 0,
    score: 0,
    best: loadBest(),
    elapsed: 0,
    banner: '',
    bannerSub: '',
    bannerUntil: 0,
    crashTitle: '',
    crashLines: [],
    endLines: [],
    buttons: [],
    time: 0,
    muted: false,
  };
}

const game = createGame();

function showBanner(text, subtext, seconds) {
  game.banner = text;
  game.bannerSub = subtext;
  game.bannerUntil = game.time + seconds;
}

function ringDistance(plane, ring) {
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  return Math.hypot(dx, dy, dz);
}

function startFlight() {
  game.plane = createPlane();
  game.ringsDone = 0;
  game.score = 0;
  game.elapsed = 0;
  game.screen = SCREEN_PLAY;
  game.banner = '';
  game.bannerSub = '';
  showBanner('TAKE OFF!', 'Throttle up with W — the rings are waiting', 3);
  startAudio(audio);
}

function finishMission(landed) {
  const fuelBonus = Math.round(game.plane.fuel * SCORE.fuelBonusPerUnit);
  const timeBonus = Math.max(0, Math.round((SCORE.timeBonusCapSeconds - game.elapsed) * SCORE.timeBonusPerSecond));
  if (landed) {
    game.score += SCORE.landing + fuelBonus + timeBonus;
  }
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.best);
  }
  game.endLines = [
    `Rings flown: ${game.ringsDone} of 5  •  Time ${Math.floor(game.elapsed / 60)}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')}`,
    landed
      ? `Landing +${SCORE.landing}  •  Fuel bonus +${fuelBonus}  •  Time bonus +${timeBonus}`
      : 'The runway was there, but the rings were not all flown.',
    `Score ${game.score}  •  Best ${game.best}`,
  ];
  game.screen = landed ? SCREEN_COMPLETE : SCREEN_LANDED_EARLY;
  playLanding(audio);
}

function endCrash(kind) {
  game.crashTitle = kind === CRASH_WATER ? 'DITCHED IN THE SEA' : 'CRASHED';
  game.crashLines = [
    kind === CRASH_WATER
      ? 'The Coral Swift went down in the water. The sea keeps the plane.'
      : 'The Coral Swift met the ground. Rock and runway are not the same.',
    `Rings flown: ${game.ringsDone} of 5  •  Score ${game.score}`,
    `Best ${game.best} — press R to fly again`,
  ];
  game.screen = SCREEN_CRASHED;
  playCrash(audio);
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function frame(now) {
  requestAnimationFrame(frame);
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== Math.floor(width * (window.devicePixelRatio || 1))) resize();
  game.time = now / 1000;
  const dt = STEP;

  // Global keys, whatever the screen.
  if (pressed(input, 'm')) game.muted = toggleMute(audio);
  if (game.screen === SCREEN_TITLE) {
    if (pressed(input, 'enter') || pressed(input, ' ')) startFlight();
  } else if (game.screen === SCREEN_PLAY) {
    if (pressed(input, 'p') || pressed(input, 'escape')) game.screen = SCREEN_PAUSED;
  } else if (game.screen === SCREEN_PAUSED) {
    if (pressed(input, 'p') || pressed(input, 'escape')) game.screen = SCREEN_PLAY;
  } else if (game.screen === SCREEN_CRASHED || game.screen === SCREEN_COMPLETE || game.screen === SCREEN_LANDED_EARLY) {
    if (pressed(input, 'r') || pressed(input, 'enter')) startFlight();
  }

  if (game.screen === SCREEN_PLAY) {
    game.elapsed += dt;
    const flightInput = readFlightInput(input);
    const events = stepPlane(game.plane, flightInput, dt);
    // Ring check: flying close to the centre of the next ring counts.
    if (game.ringsDone < WORLD.rings.length) {
      const ring = WORLD.rings[game.ringsDone];
      if (ringDistance(game.plane, ring) < ring.radius) {
        game.ringsDone += 1;
        game.score += SCORE.ring;
        playRingChime(audio);
        if (game.ringsDone >= WORLD.rings.length) {
          showBanner('ALL RINGS!', 'Now bring her home — land on the runway', 4);
        } else {
          showBanner(`RING ${game.ringsDone} OF 5!`, `+${SCORE.ring} points — next ring ahead`, 2.5);
        }
      }
    }
    if (events & EVENT_LANDED) {
      if (game.ringsDone >= WORLD.rings.length) finishMission(true);
      else finishMission(false);
    } else if (events & EVENT_CRASHED) {
      endCrash(game.plane.crashKind);
    }
    updateAudio(audio, game.plane, true);
  } else {
    updateAudio(audio, game.plane, false);
  }

  if (game.time > game.bannerUntil) {
    game.banner = '';
    game.bannerSub = '';
  }

  // Clickable buttons on the menus.
  const click = takeClick(input);
  if (click && game.buttons.length > 0) {
    for (const button of game.buttons) {
      if (hitButton(click, button)) {
        startAudio(audio);
        startFlight();
        break;
      }
    }
  } else if (click && game.screen === SCREEN_PAUSED) {
    game.screen = SCREEN_PLAY;
  }

  const view = {
    plane: game.plane,
    screen: game.screen,
    ringsDone: game.ringsDone,
    score: game.score,
    elapsed: game.elapsed,
    banner: game.banner,
    bannerSub: game.bannerSub,
    best: game.best,
    time: game.time,
    crashTitle: game.crashTitle,
    crashLines: game.crashLines,
    endLines: game.endLines,
  };
  game.buttons = drawScene(ctx, width, height, view);
  statusLine.textContent = `Coral Swift — ${game.screen}, score ${game.score}, rings ${game.ringsDone} of 5, fuel ${Math.round(game.plane.fuel)} percent`;
}

/* ------------------------------------------------------------ boot up -- */

resize();
window.addEventListener('resize', resize);

// Screenshot mode: ?shot=menu|cover|ring|land stages a real played scene,
// so the screenshots show the game as it is actually played.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  const staged = stageShot(shot, game);
  if (staged) {
    game.screen = staged.screen;
    game.ringsDone = staged.ringsDone;
    game.score = staged.score;
    game.elapsed = staged.elapsed;
    game.banner = staged.banner;
    game.bannerSub = staged.bannerSub;
    game.bannerUntil = 999999;
    game.endLines = staged.endLines || [];
    game.crashTitle = staged.crashTitle || '';
    game.crashLines = staged.crashLines || [];
  }
}

requestAnimationFrame(frame);
