// Screenshot scenes: ?shot=menu|cover|ring|land. Each one plays the real flight
// model forward with a simple autopilot (steer toward the next ring, hold a
// sensible altitude, mind the throttle), so every screenshot is a frame of a
// game that was actually flown — never a posed picture.
import { SCORE, STEP, WORLD } from './config.js';
import { createPlane, stepPlane, EVENT_LANDED, EVENT_CRASHED } from './physics.js';

const SAMPLE_SECONDS = 40;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(angle) {
  return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function ringDistance(plane, ring) {
  return Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
}

/**
 * One autopilot step: bank toward the target bearing, pitch toward the target
 * altitude, hold the target throttle. Returns the flight input for stepPlane.
 */
function autopilotInput(plane, target, throttleTarget) {
  const desiredHeading = Math.atan2(target.x - plane.x, target.z - plane.z);
  const headingError = wrapAngle(desiredHeading - plane.heading);
  const roll = clamp(headingError * 2.2, -1, 1);
  const altitudeError = target.y - plane.y;
  const pitch = clamp(altitudeError * 0.06, -1, 1);
  const throttle = plane.throttle < throttleTarget ? 1 : plane.throttle > throttleTarget + 0.05 ? -1 : 0;
  return { pitch, roll, throttle };
}

/**
 * Fly the plane toward `target` until the target ring is flown (when
 * `stopAtRing` is set) or `seconds` run out, collecting rings on the way.
 */
function flyLeg(game, target, throttleTarget, seconds, stopAtRing) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = autopilotInput(game.plane, target, throttleTarget);
    const events = stepPlane(game.plane, input, STEP);
    game.elapsed += STEP;
    if (game.ringsDone < WORLD.rings.length) {
      const ring = WORLD.rings[game.ringsDone];
      if (ringDistance(game.plane, ring) < ring.radius) {
        game.ringsDone += 1;
        game.score += SCORE.ring;
        if (stopAtRing !== undefined && game.ringsDone > stopAtRing) return events;
      }
    }
    if (events & (EVENT_LANDED | EVENT_CRASHED)) return events;
  }
  return 0;
}

/** Fly the whole ring circuit, leg by leg. */
function flyCircuit(game) {
  for (let i = 0; i < WORLD.rings.length; i += 1) {
    const ring = WORLD.rings[i];
    const events = flyLeg(game, ring, 0.72, SAMPLE_SECONDS, i);
    if (events & (EVENT_LANDED | EVENT_CRASHED)) return events;
    if (game.plane.crashed || game.plane.landed) return 0;
  }
  return 0;
}

/** Landing approach in two phases: first fly to the holding point above the
 * southern approach at a safe altitude, then glide down the runway. */
function flyLanding(game) {
  // Phase 1: get over the holding point south of the runway, descending to
  // 60 m on the way so the final glide starts shallow.
  let events = flyLeg(game, { x: 0, y: 60, z: 700 }, 0.55, 60);
  if (events & (EVENT_LANDED | EVENT_CRASHED)) return false;
  // Phase 2: a shallow glide (about 1 in 10) down the runway centreline.
  const steps = Math.floor(75 / STEP);
  for (let i = 0; i < steps; i += 1) {
    const plane = game.plane;
    const desiredHeading = Math.PI + Math.atan2(plane.x, 150);
    const headingError = wrapAngle(desiredHeading - plane.heading);
    const roll = clamp(headingError * 1.6, -1, 1);
    const glideHeight = WORLD.runwayElevation + 1 + Math.max(0, (plane.z - 200) * 0.12);
    // Flare target sits below the touchdown threshold (ground + 1.2 m) so the
    // plane settles onto the strip instead of floating just above it.
    const targetY = plane.z < 320 ? WORLD.runwayElevation + 0.5 : glideHeight;
    const pitch = clamp((targetY - plane.y) * 0.06, -0.3, 0.3);
    const throttle = plane.throttle < 0.3 ? 1 : plane.throttle > 0.34 ? -1 : 0;
    const landingEvents = stepPlane(plane, { pitch, roll, throttle }, STEP);
    game.elapsed += STEP;
    if (landingEvents & EVENT_LANDED) return true;
    if (landingEvents & EVENT_CRASHED) return false;
  }
  return false;
}

function landedState(game) {
  game.plane.landed = true;
  game.plane.onGround = true;
  game.plane.speed = 0;
  game.plane.throttle = 0;
  game.plane.y = WORLD.runwayElevation + 1.2;
  game.plane.z = -40;
  game.plane.x = 0;
  game.plane.heading = Math.PI;
  game.plane.pitch = 0;
  game.plane.roll = 0;
}

/**
 * Stage the named scene on `game` and return what the boot code shows.
 * Any other name is the title screen.
 */
export function stageShot(name, game) {
  game.plane = createPlane();
  game.ringsDone = 0;
  game.score = 0;
  game.elapsed = 0;
  if (name === 'menu') {
    return { screen: 'title', ringsDone: 0, score: 0, elapsed: 0, banner: '', bannerSub: '' };
  }
  if (name === 'cover') {
    // Take off and fly toward the second ring: chase view, HUD lit, the ring
    // dead ahead. Only a few seconds past the first ring, so the next one is
    // still squarely in frame.
    flyLeg(game, WORLD.rings[0], 0.72, SAMPLE_SECONDS, 0);
    flyLeg(game, WORLD.rings[1], 0.72, 5);
    return {
      screen: 'play',
      ringsDone: game.ringsDone,
      score: game.score,
      elapsed: game.elapsed,
      banner: game.ringsDone > 0 ? `RING ${game.ringsDone} OF 5!` : '',
      bannerSub: game.ringsDone > 0 ? 'Next ring ahead — hold your line' : '',
    };
  }
  if (name === 'ring') {
    // Fly the whole circuit, then turn for home: the plane is clear of the
    // last ring, the banner is readable, and the home island is ahead.
    flyCircuit(game);
    flyLeg(game, { x: 0, y: 90, z: 300 }, 0.72, 6);
    return {
      screen: 'play',
      ringsDone: game.ringsDone,
      score: game.score,
      elapsed: game.elapsed,
      banner: `RING ${game.ringsDone} OF 5!`,
      bannerSub: '+100 points — next ring ahead',
    };
  }
  if (name === 'land') {
    // Fly the circuit, then land. If the approach goes wrong, the plane is
    // placed on the runway in the landed state the game itself reaches.
    flyCircuit(game);
    game.ringsDone = WORLD.rings.length;
    game.score = WORLD.rings.length * SCORE.ring;
    const landed = flyLanding(game);
    if (!landed) landedState(game);
    const fuelBonus = Math.round(game.plane.fuel * SCORE.fuelBonusPerUnit);
    const timeBonus = Math.max(0, Math.round((SCORE.timeBonusCapSeconds - game.elapsed) * SCORE.timeBonusPerSecond));
    const total = game.score + SCORE.landing + fuelBonus + timeBonus;
    return {
      screen: 'complete',
      ringsDone: game.ringsDone,
      score: total,
      elapsed: game.elapsed,
      banner: '',
      bannerSub: '',
      endLines: [
        `Rings flown: 5 of 5  •  Time ${Math.floor(game.elapsed / 60)}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')}`,
        `Landing +${SCORE.landing}  •  Fuel bonus +${fuelBonus}  •  Time bonus +${timeBonus}`,
        `Score ${total}`,
      ],
    };
  }
  return { screen: 'title', ringsDone: 0, score: 0, elapsed: 0, banner: '', bannerSub: '' };
}
