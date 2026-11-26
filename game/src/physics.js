// Flight model: an arcade plane with throttle, pitch and bank. Speed chases the
// throttle setting, pitch trades speed for climb, bank turns the nose, and below
// stall speed the wing gives up and the plane sinks. The numbers are tuned so a
// gentle hand flies straight and level at cruise, and a ham hand stalls.
import { PLANE, STEP, WORLD } from './config.js';
import { onRunway, terrainHeight } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_EMPTY = 8;

export const CRASH_GROUND = 'ground';
export const CRASH_WATER = 'water';

/** A fresh plane sitting at the start of the runway, engine idling. */
export function createPlane() {
  return {
    x: WORLD.start.x,
    y: WORLD.start.y,
    z: WORLD.start.z,
    heading: WORLD.start.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelStart,
    verticalSpeed: 0,
    onGround: true,
    crashed: false,
    landed: false,
    crashKind: null,
    time: 0,
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function approach(value, target, rate, dt) {
  const delta = target - value;
  const step = rate * dt;
  if (Math.abs(delta) <= step) return target;
  return value + Math.sign(delta) * step;
}

/**
 * Advance the plane one fixed step. `input` is { pitch: -1..1, roll: -1..1,
 * throttle: -1..1 } from the keyboard. Returns an event bitmask.
 */
export function stepPlane(plane, input, dt) {
  let events = EVENT_NONE;
  if (plane.crashed || plane.landed) return events;
  plane.time += dt;

  // Throttle: W/S (or the input's throttle axis) moves the lever, fuel gates it.
  plane.throttle = clamp(plane.throttle + input.throttle * dt * 0.9, 0, 1);
  if (plane.fuel <= 0) {
    if (plane.throttle > 0) events |= EVENT_FUEL_EMPTY;
    plane.throttle = 0;
  }
  plane.fuel = Math.max(0, plane.fuel - (PLANE.fuelIdle + plane.throttle * PLANE.fuelBurn) * dt);

  // Speed chases throttle * maxSpeed; drag pulls it back when the lever is low.
  const targetSpeed = plane.throttle * PLANE.maxSpeed;
  const rate = targetSpeed > plane.speed ? PLANE.engineAccel : PLANE.dragDecel;
  plane.speed = approach(plane.speed, targetSpeed, rate, dt);

  // Attitude: pitch and roll ease toward what the stick asks for.
  const controlAuthority = clamp(plane.speed / PLANE.stallSpeed, 0.25, 1);
  plane.pitch = approach(plane.pitch, input.pitch * PLANE.maxPitch, PLANE.pitchRate * controlAuthority, dt);
  plane.roll = approach(plane.roll, input.roll * PLANE.maxRoll, PLANE.rollRate * controlAuthority, dt);

  // Bank turns the nose: right stick banks right and the heading follows.
  // The turn radius at full bank is about 150 m at any speed.
  plane.heading += plane.roll * (plane.speed / 150) * dt;
  plane.heading = (plane.heading + Math.PI) % (Math.PI * 2) - Math.PI;

  // Climb comes from pitch times speed; below stall speed an airborne plane
  // sinks — but a plane still rolling on the runway stays glued to it.
  let verticalSpeed = plane.speed * Math.sin(plane.pitch);
  if (!plane.onGround && plane.speed < PLANE.stallSpeed) {
    verticalSpeed -= (PLANE.stallSpeed - plane.speed) * 0.55;
  }
  plane.verticalSpeed = verticalSpeed;

  const forwardX = Math.sin(plane.heading);
  const forwardZ = Math.cos(plane.heading);
  plane.x += forwardX * plane.speed * Math.cos(plane.pitch) * dt;
  plane.z += forwardZ * plane.speed * Math.cos(plane.pitch) * dt;
  plane.y += verticalSpeed * dt;

  // Keep the sortie inside the charted sea.
  const bound = WORLD.size / 2;
  if (plane.x < -bound || plane.x > bound || plane.z < -bound || plane.z > bound) {
    plane.heading += Math.PI;
    plane.x = clamp(plane.x, -bound, bound);
    plane.z = clamp(plane.z, -bound, bound);
  }

  // Ground contact: rolling, landing, or a crash.
  const ground = terrainHeight(plane.x, plane.z);
  if (plane.onGround) {
    // Takeoff roll: lift off once fast enough and pulling up, else stay put.
    if (plane.speed >= 28 && plane.pitch > 0.05) {
      plane.onGround = false;
    } else {
      plane.y = ground + 1.2;
      plane.verticalSpeed = 0;
      return events;
    }
  }
  if (plane.y <= ground + 1.2) {
    plane.y = ground + 1.2;
    const gentle = Math.abs(verticalSpeed) < 4.5 && plane.speed < 46 && Math.abs(plane.roll) < 0.35
      && Math.abs(plane.pitch) < 0.2 && onRunway(plane.x, plane.z);
    if (gentle) {
      plane.landed = true;
      plane.onGround = true;
      events |= EVENT_LANDED;
    } else {
      plane.crashed = true;
      plane.onGround = true;
      plane.crashKind = ground <= 0.5 ? CRASH_WATER : CRASH_GROUND;
      events |= EVENT_CRASHED;
    }
  } else {
    plane.onGround = false;
  }
  return events;
}
