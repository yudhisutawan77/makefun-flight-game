// Renderer: everything the player sees is drawn here on one 2D canvas — a
// pseudo-3D chase view over the archipelago, the Coral Swift in frame, the
// runway and rings ahead, and a full instrument HUD. No images, no assets:
// sky, sea, terrain, town, plane and dials are all drawn from code.
import { WORLD } from './config.js';
import { terrainHeight } from './terrain.js';

// Grid rows ahead of the camera (metres) and columns across it: near rows are
// fine so the runway reads, far rows are coarse because the sea hides detail.
const ROW_DEPTHS = [8, 13, 20, 30, 44, 64, 90, 124, 165, 215, 275, 345, 430, 530, 660];
const COL_STEP = 55;
const COL_COUNT = 17;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dot(ax, ay, az, bx, by, bz) {
  return ax * bx + ay * by + az * bz;
}

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/**
 * Build a projector from a camera position, a look direction and a roll angle.
 * project(x, y, z) returns screen { x, y, scale } or null behind the camera.
 */
export function makeProjector(width, height, cam, look, roll) {
  const forward = normalize(look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]);
  // right = world-up x forward; flat when the camera looks level.
  let right = normalize(forward[2], 0, -forward[0]);
  if (Math.hypot(right[0], right[2]) < 0.001) right = [1, 0, 0];
  let up = normalize(
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  );
  // Roll the camera around its forward axis, as the plane banks.
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const rolledRight = [
    right[0] * cosR + up[0] * sinR,
    right[1] * cosR + up[1] * sinR,
    right[2] * cosR + up[2] * sinR,
  ];
  const rolledUp = [
    up[0] * cosR - right[0] * sinR,
    up[1] * cosR - right[1] * sinR,
    up[2] * cosR - right[2] * sinR,
  ];
  right = rolledRight;
  up = rolledUp;
  const focal = height * 0.95;
  return function project(x, y, z) {
    const dx = x - cam[0];
    const dy = y - cam[1];
    const dz = z - cam[2];
    const cz = dot(dx, dy, dz, forward[0], forward[1], forward[2]);
    if (cz < 2) return null;
    const cx = dot(dx, dy, dz, right[0], right[1], right[2]);
    const cy = dot(dx, dy, dz, up[0], up[1], up[2]);
    const scale = focal / cz;
    return { x: width / 2 + cx * scale, y: height * 0.52 - cy * scale, scale, depth: cz };
  };
}

/** Camera chase position: behind and above the plane, looking ahead of it. */
export function chaseCamera(plane) {
  const forwardX = Math.sin(plane.heading);
  const forwardZ = Math.cos(plane.heading);
  const back = 13;
  const cam = [
    plane.x - forwardX * back,
    plane.y + 4.4,
    plane.z - forwardZ * back,
  ];
  const look = [
    plane.x + forwardX * 42,
    plane.y + 1.5 + plane.pitch * 22,
    plane.z + forwardZ * 42,
  ];
  return { cam, look, roll: plane.roll * 0.55 };
}

function skyGradient(ctx, width, height, horizonY) {
  const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 1));
  gradient.addColorStop(0, '#2f6fd0');
  gradient.addColorStop(0.55, '#7fb2e8');
  gradient.addColorStop(1, '#cfe8f7');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, Math.max(horizonY, 0));
}

function drawSun(ctx, project, cam) {
  // Fixed sun direction, high in the west, so the light never moves.
  const sun = project(cam[0] - 800, cam[1] + 500, cam[2] - 1200);
  if (!sun) return;
  const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
  glow.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 232, 160, 0.55)');
  glow.addColorStop(1, 'rgba(255, 232, 160, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
  ctx.fill();
}

function seaFill(ctx, width, height, horizonY) {
  if (horizonY >= height) return;
  const gradient = ctx.createLinearGradient(0, horizonY, 0, height);
  gradient.addColorStop(0, '#3f8fc4');
  gradient.addColorStop(1, '#1d5f8f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, horizonY, width, height - horizonY);
}

/** Colour of ground at a height, with a little deterministic variation. */
export function groundColour(height, vary) {
  if (height < 0.4) return vary < 0.5 ? '#2f7fb0' : '#2a74a6';
  if (height < 2.5) return vary < 0.5 ? '#e8d49a' : '#dfc98c';
  if (height < 34) return vary < 0.33 ? '#5da24a' : vary < 0.66 ? '#549748' : '#67ab52';
  if (height < 62) return vary < 0.5 ? '#8a7a63' : '#7d6e59';
  return vary < 0.5 ? '#e8eef2' : '#dde5ea';
}

function drawFarIslands(ctx, project, cam) {
  for (let i = 0; i < WORLD.farIslands.length; i += 1) {
    const island = WORLD.farIslands[i];
    const base = project(island.x, 0, island.z);
    if (!base) continue;
    const w = island.width * base.scale * 0.5;
    const h = island.height * base.scale;
    if (w < 4 || h < 2) continue;
    ctx.fillStyle = 'rgba(74, 110, 92, 0.75)';
    ctx.beginPath();
    ctx.moveTo(base.x - w, base.y);
    ctx.quadraticCurveTo(base.x - w * 0.4, base.y - h, base.x, base.y - h * 0.8);
    ctx.quadraticCurveTo(base.x + w * 0.5, base.y - h * 0.6, base.x + w, base.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** The ground grid: rows ahead of the camera, columns across it, far to near. */
function drawTerrain(ctx, project, cam, look) {
  const forward = normalize(look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]);
  const right = normalize(forward[2], 0, -forward[0]);
  const half = Math.floor(COL_COUNT / 2);
  // Cache one row of projected vertices, then draw quads between rows.
  let prevRow = null;
  for (let r = 0; r < ROW_DEPTHS.length; r += 1) {
    const depth = ROW_DEPTHS[r];
    const row = [];
    for (let c = -half; c <= half; c += 1) {
      const lateral = c * COL_STEP;
      const wx = cam[0] + right[0] * lateral + forward[0] * depth;
      const wz = cam[2] + right[2] * lateral + forward[2] * depth;
      const h = terrainHeight(wx, wz);
      const p = project(wx, h, wz);
      // Colour variation from a hash of the world position, so patches read
      // as ground, not as stripes of the camera grid.
      const hash = Math.abs(Math.sin(wx * 12.9898 + wz * 78.233) * 43758.5453) % 1;
      row.push({ p, h, vary: hash });
    }
    if (prevRow) {
      for (let c = 0; c < row.length - 1; c += 1) {
        const a = prevRow[c];
        const b = prevRow[c + 1];
        const d = row[c + 1];
        const e = row[c];
        if (!a.p || !b.p || !d.p || !e.p) continue;
        const avgH = (a.h + b.h + d.h + e.h) / 4;
        // Slope shading: ground falling away from the camera reads darker.
        const slope = (e.h + d.h - a.h - b.h) / 2;
        ctx.fillStyle = groundColour(avgH, (a.vary + e.vary) / 2);
        ctx.globalAlpha = slope < -3 ? 0.82 : slope > 3 ? 1 : 0.92;
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.lineTo(e.p.x, e.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    prevRow = row;
  }
}

function drawRunway(ctx, project) {
  const runway = WORLD.runway;
  const y = WORLD.runwayElevation + 0.4;
  const x0 = runway.x - runway.halfWidth;
  const x1 = runway.x + runway.halfWidth;
  const a = project(x0, y, runway.zMin);
  const b = project(x1, y, runway.zMin);
  const c = project(x1, y, runway.zMax);
  const d = project(x0, y, runway.zMax);
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = '#3c4148';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes and edge lines, drawn as projected segments.
  ctx.strokeStyle = '#f2f2e8';
  ctx.lineWidth = 2;
  for (let z = runway.zMin + 10; z < runway.zMax - 5; z += 28) {
    const p1 = project(runway.x, y + 0.1, z);
    const p2 = project(runway.x, y + 0.1, z + 14);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(242, 242, 232, 0.8)';
  ctx.lineWidth = 1.5;
  for (const edge of [x0 + 1, x1 - 1]) {
    const p1 = project(edge, y + 0.1, runway.zMin + 4);
    const p2 = project(edge, y + 0.1, runway.zMax - 4);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // Threshold chevrons at both ends.
  ctx.fillStyle = '#f2f2e8';
  for (const zEnd of [runway.zMin + 8, runway.zMax - 8]) {
    for (let k = -2; k <= 2; k += 1) {
      const p1 = project(runway.x + k * 4 - 1.4, y + 0.1, zEnd);
      const p2 = project(runway.x + k * 4 + 1.4, y + 0.1, zEnd);
      if (!p1 || !p2) continue;
      ctx.fillRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x) + 1, 3);
    }
  }
}

function drawTown(ctx, project, cam) {
  for (let i = 0; i < WORLD.town.length; i += 1) {
    const house = WORLD.town[i];
    const hw = house.w / 2;
    const hd = house.d / 2;
    // Seat the box on the lowest ground under its corners, so it never floats.
    const ground = Math.min(
      terrainHeight(house.x - hw, house.z - hd),
      terrainHeight(house.x + hw, house.z - hd),
      terrainHeight(house.x + hw, house.z + hd),
      terrainHeight(house.x - hw, house.z + hd),
    );
    const top = ground + house.h;
    // Corners of the box.
    const corners = [
      project(house.x - hw, ground, house.z - hd),
      project(house.x + hw, ground, house.z - hd),
      project(house.x + hw, ground, house.z + hd),
      project(house.x - hw, ground, house.z + hd),
      project(house.x - hw, top, house.z - hd),
      project(house.x + hw, top, house.z - hd),
      project(house.x + hw, top, house.z + hd),
      project(house.x - hw, top, house.z + hd),
    ];
    if (corners.some((p) => p === null)) continue;
    const dist = Math.hypot(house.x - cam[0], house.z - cam[2]);
    if (dist > 700) continue;
    // Roof (top face), then the two side faces turned toward the camera.
    ctx.fillStyle = house.roof;
    ctx.beginPath();
    ctx.moveTo(corners[4].x, corners[4].y);
    ctx.lineTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[7].x, corners[7].y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#efe6d2';
    const faces = [
      { corners: [0, 1, 5, 4], cx: house.x, cz: house.z - hd },
      { corners: [1, 2, 6, 5], cx: house.x + hw, cz: house.z },
      { corners: [2, 3, 7, 6], cx: house.x, cz: house.z + hd },
      { corners: [3, 0, 4, 7], cx: house.x - hw, cz: house.z },
    ];
    // Draw the two wall faces turned toward the camera (nearest first is
    // wrong for a box — the far face hides behind the near one, so draw the
    // two whose centres the camera sees, farthest first).
    const visible = faces
      .map((face) => ({ face, dist: Math.hypot(face.cx - cam[0], face.cz - cam[2]) }))
      .sort((a, b) => b.dist - a.dist)
      .slice(0, 2);
    for (let k = 0; k < visible.length; k += 1) {
      const entry = visible[k];
      const face = entry.face.corners;
      ctx.beginPath();
      ctx.moveTo(corners[face[0]].x, corners[face[0]].y);
      ctx.lineTo(corners[face[1]].x, corners[face[1]].y);
      ctx.lineTo(corners[face[2]].x, corners[face[2]].y);
      ctx.lineTo(corners[face[3]].x, corners[face[3]].y);
      ctx.closePath();
      ctx.fill();
      // Shade the farther wall so the box reads as a solid, not a card.
      if (k === 1) {
        ctx.fillStyle = 'rgba(20, 30, 40, 0.14)';
        ctx.fill();
        ctx.fillStyle = '#efe6d2';
      }
    }
  }
}

function drawTrees(ctx, project, cam) {
  for (let i = 0; i < WORLD.trees.length; i += 1) {
    const tree = WORLD.trees[i];
    const dist = Math.hypot(tree[0] - cam[0], tree[1] - cam[2]);
    if (dist > 420) continue;
    const ground = terrainHeight(tree[0], tree[1]);
    const base = project(tree[0], ground, tree[1]);
    const top = project(tree[0], ground + 9, tree[1]);
    if (!base || !top) continue;
    const size = Math.abs(base.y - top.y);
    if (size < 2) continue;
    ctx.fillStyle = '#2e6b34';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(base.x - size * 0.45, base.y);
    ctx.lineTo(base.x + size * 0.45, base.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawClouds(ctx, project) {
  for (let i = 0; i < WORLD.clouds.length; i += 1) {
    const cloud = WORLD.clouds[i];
    const centre = project(cloud.x, cloud.y, cloud.z);
    if (!centre) continue;
    const r = Math.min(110, cloud.r * centre.scale);
    if (r < 3) continue;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (const puff of [[-0.5, 0.1, 0.55], [0, -0.15, 0.7], [0.5, 0.08, 0.5]]) {
      ctx.beginPath();
      ctx.ellipse(centre.x + puff[0] * r, centre.y + puff[1] * r, puff[2] * r, puff[2] * r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The next ring glows; passed rings fade to a thin green ghost. */
function drawRings(ctx, project, ringsDone, nextRing) {
  for (let i = 0; i < WORLD.rings.length; i += 1) {
    const ring = WORLD.rings[i];
    const centre = project(ring.x, ring.y, ring.z);
    if (!centre) continue;
    const radius = ring.radius * centre.scale;
    if (radius < 1.5) continue;
    const isNext = i === nextRing;
    const isDone = i < ringsDone;
    // A ring just flown sits around the camera: skip the ghost until the
    // plane is clear of it, or it would fill the whole frame.
    if (isDone && centre.depth < 60) continue;
    // A light beam down to the ground so a far ring can be found at a glance.
    if (isNext) {
      const ground = project(ring.x, terrainHeight(ring.x, ring.z), ring.z);
      if (ground) {
        const beam = ctx.createLinearGradient(centre.x, centre.y, ground.x, ground.y);
        beam.addColorStop(0, 'rgba(255, 176, 32, 0.35)');
        beam.addColorStop(1, 'rgba(255, 176, 32, 0)');
        ctx.strokeStyle = beam;
        ctx.lineWidth = Math.min(14, Math.max(2, radius * 0.12));
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y);
        ctx.lineTo(ground.x, ground.y);
        ctx.stroke();
      }
    }
    ctx.lineWidth = Math.min(18, Math.max(2, radius * 0.14));
    ctx.strokeStyle = isDone ? 'rgba(90, 200, 120, 0.55)' : isNext ? '#ffb020' : '#ff7a3c';
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext) {
      ctx.lineWidth = Math.max(1, radius * 0.05);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      // Tick marks around the ring, like a target.
      for (let k = 0; k < 4; k += 1) {
        const angle = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(centre.x + Math.cos(angle) * radius * 1.12, centre.y + Math.sin(angle) * radius * 1.12);
        ctx.lineTo(centre.x + Math.cos(angle) * radius * 1.32, centre.y + Math.sin(angle) * radius * 1.32);
        ctx.stroke();
      }
    }
  }
}

/** The Coral Swift from behind and above: wings, tail, coral fuselage. */
export function drawPlane(ctx, width, height, plane, time) {
  const cx = width / 2;
  const cy = height * 0.66;
  const s = Math.min(width, height) / 620;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll * 0.85);
  ctx.scale(s, s);
  // Prop wash shimmer under the tail.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 96, 26 + Math.sin(time * 31) * 3, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Main wings: cream with coral tips, slight dihedral.
  ctx.fillStyle = '#f5ead6';
  ctx.beginPath();
  ctx.moveTo(-14, 8);
  ctx.lineTo(-168, 34);
  ctx.lineTo(-176, 52);
  ctx.lineTo(-16, 34);
  ctx.closePath();
  ctx.moveTo(14, 8);
  ctx.lineTo(168, 34);
  ctx.lineTo(176, 52);
  ctx.lineTo(16, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8533f';
  ctx.beginPath();
  ctx.moveTo(-138, 28);
  ctx.lineTo(-168, 34);
  ctx.lineTo(-176, 52);
  ctx.lineTo(-142, 46);
  ctx.closePath();
  ctx.moveTo(138, 28);
  ctx.lineTo(168, 34);
  ctx.lineTo(176, 52);
  ctx.lineTo(142, 46);
  ctx.closePath();
  ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#f5ead6';
  ctx.beginPath();
  ctx.moveTo(-10, 78);
  ctx.lineTo(-64, 92);
  ctx.lineTo(-66, 104);
  ctx.lineTo(-10, 96);
  ctx.closePath();
  ctx.moveTo(10, 78);
  ctx.lineTo(64, 92);
  ctx.lineTo(66, 104);
  ctx.lineTo(10, 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8533f';
  ctx.beginPath();
  ctx.moveTo(-8, 62);
  ctx.lineTo(8, 62);
  ctx.lineTo(4, 20);
  ctx.lineTo(-4, 20);
  ctx.closePath();
  ctx.fill();
  // Fuselage: coral, tapering away from the camera, white cheatline.
  ctx.fillStyle = '#e8533f';
  ctx.beginPath();
  ctx.moveTo(-22, 96);
  ctx.quadraticCurveTo(-26, 40, -14, -18);
  ctx.quadraticCurveTo(-8, -34, 0, -34);
  ctx.quadraticCurveTo(8, -34, 14, -18);
  ctx.quadraticCurveTo(26, 40, 22, 96);
  ctx.quadraticCurveTo(0, 104, -22, 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f7f3ea';
  ctx.beginPath();
  ctx.moveTo(-15, 70);
  ctx.quadraticCurveTo(-17, 30, -10, -8);
  ctx.lineTo(-4, -8);
  ctx.quadraticCurveTo(-9, 30, -7, 70);
  ctx.closePath();
  ctx.moveTo(15, 70);
  ctx.quadraticCurveTo(17, 30, 10, -8);
  ctx.lineTo(4, -8);
  ctx.quadraticCurveTo(9, 30, 7, 70);
  ctx.closePath();
  ctx.fill();
  // Canopy glass.
  ctx.fillStyle = '#274b63';
  ctx.beginPath();
  ctx.ellipse(0, -6, 9, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.ellipse(-3, -12, 3, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights: red left, green right, blinking with time.
  const blink = Math.sin(time * 6) > 0;
  if (blink) {
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath();
    ctx.arc(-176, 43, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2eff5e';
    ctx.beginPath();
    ctx.arc(176, 43, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A soft shadow on the ground under the plane when it flies low. */
function drawPlaneShadow(ctx, project, plane) {
  if (plane.y > 120) return;
  const ground = terrainHeight(plane.x, plane.z);
  const shadow = project(plane.x, ground + 0.5, plane.z);
  if (!shadow) return;
  const size = clamp(90 - plane.y * 0.7, 8, 90) * shadow.scale * 0.12;
  ctx.fillStyle = `rgba(20, 30, 40, ${clamp(0.35 - plane.y * 0.002, 0.05, 0.35)})`;
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y, size * 3.2, size, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ HUD -- */

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 22, 34, 0.62)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function headingLabel(degrees) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return names[index];
}

function drawCompass(ctx, width, plane) {
  const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  const w = 340;
  const x = width / 2 - w / 2;
  const y = 14;
  panel(ctx, x, y, w, 44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, 44);
  ctx.clip();
  ctx.fillStyle = '#e8f2fa';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let offset = -90; offset <= 90; offset += 15) {
    const deg = Math.round((headingDeg + offset) / 15) * 15;
    const norm = ((deg % 360) + 360) % 360;
    const px = width / 2 + offset * 1.7;
    const isCardinal = norm % 90 === 0;
    ctx.fillStyle = isCardinal ? '#ffd34d' : '#e8f2fa';
    ctx.fillText(isCardinal ? headingLabel(norm) : String(norm), px, y + 15);
    ctx.fillRect(px - 0.5, y + 30, 1, isCardinal ? 10 : 6);
  }
  ctx.restore();
  // Fixed lubber line and the numeric heading.
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 6, y + 2);
  ctx.lineTo(width / 2 + 6, y + 2);
  ctx.lineTo(width / 2, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, width / 2, y + 34);
}

function drawFlightData(ctx, width, plane, ringsDone, score, elapsed) {
  const knots = Math.round(plane.speed * 1.94384);
  const feet = Math.round(plane.y / 0.3048);
  panel(ctx, 14, 14, 168, 96);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('AIRSPEED', 26, 32);
  ctx.fillText('ALTITUDE', 26, 64);
  ctx.fillText('VERT SPEED', 26, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(`${knots}`, 96, 36);
  ctx.fillText(`${feet}`, 96, 68);
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillStyle = '#cfe3f2';
  ctx.fillText('KT', 150, 36);
  ctx.fillText('FT', 150, 68);
  const vsi = Math.round(plane.verticalSpeed / 0.3048 / 60);
  ctx.fillStyle = vsi > 50 ? '#7ddc8a' : vsi < -50 ? '#ff9a7a' : '#cfe3f2';
  ctx.fillText(`${vsi >= 0 ? '+' : ''}${vsi} FPM`, 96, 96);

  // Right panel: fuel, throttle, rings, score, time.
  const rx = 14;
  const rw = 168;
  const rightX = width - rx - rw;
  panel(ctx, rightX, 14, rw, 128);
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('FUEL', rightX + 12, 32);
  ctx.fillText('THROTTLE', rightX + 12, 62);
  ctx.fillStyle = plane.fuel < 20 ? '#ff6a5e' : '#7ddc8a';
  ctx.fillRect(rightX + 12, 38, rw - 24, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(rightX + 12 + (rw - 24) * (plane.fuel / 100), 38, (rw - 24) * (1 - plane.fuel / 100), 8);
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(rightX + 12, 68, (rw - 24) * plane.throttle, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(rightX + 12 + (rw - 24) * plane.throttle, 68, (rw - 24) * (1 - plane.throttle), 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(`RINGS  ${ringsDone}/5`, rightX + 12, 98);
  ctx.fillText(`SCORE  ${score}`, rightX + 12, 120);
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '600 12px system-ui, sans-serif';
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  ctx.fillText(`TIME ${minutes}:${String(seconds).padStart(2, '0')}`, rightX + 12, 140 - 2);
}

/** Artificial horizon: a little round attitude indicator, bottom left. */
function drawAttitude(ctx, width, height, plane) {
  const cx = 78;
  const cy = height - 78;
  const r = 56;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2f6fd0';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchShift = clamp(plane.pitch * 90, -r, r);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(-r, pitchShift, r * 2, r * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchShift);
  ctx.lineTo(r, pitchShift);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (const offset of [-30, -15, 15, 30]) {
    ctx.beginPath();
    ctx.moveTo(-18, pitchShift + offset);
    ctx.lineTo(18, pitchShift + offset);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol on top of the moving horizon.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, cy + r + 16);
}

function drawNextRingArrow(ctx, width, height, project, nextRing) {
  if (nextRing === null || nextRing >= WORLD.rings.length) return;
  const ring = WORLD.rings[nextRing];
  const p = project(ring.x, ring.y, ring.z);
  if (p && p.x > 60 && p.x < width - 60 && p.y > 80 && p.y < height - 120) return;
  // Off screen (or behind): point at the screen edge toward it.
  const dx = p ? p.x - width / 2 : Math.sin(0);
  const dy = p ? p.y - height / 2 : -1;
  const angle = Math.atan2(dy, dx);
  const ex = width / 2 + Math.cos(angle) * (width / 2 - 50);
  const ey = height / 2 + Math.sin(angle) * (height / 2 - 90);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffb020';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`RING ${nextRing + 1}`, ex, ey + 28);
}

function drawWarnings(ctx, width, plane) {
  const warnings = [];
  if (plane.fuel > 0 && plane.fuel < 20) warnings.push('LOW FUEL');
  if (plane.fuel <= 0) warnings.push('FUEL EMPTY — GLIDING');
  if (!plane.onGround && plane.speed < 24 && plane.speed > 2) warnings.push('STALL!');
  if (warnings.length === 0) return;
  const blink = Math.sin(performance.now() / 180) > -0.2;
  if (!blink) return;
  ctx.fillStyle = '#ff5a4e';
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(warnings.join('   •   '), width / 2, 108);
}

function drawBanner(ctx, width, height, text, subtext) {
  if (!text) return;
  ctx.fillStyle = 'rgba(10, 22, 34, 0.55)';
  const w = Math.max(340, ctx.measureText(text).width + 80);
  ctx.beginPath();
  ctx.roundRect(width / 2 - w / 2, height * 0.3 - 44, w, subtext ? 96 : 72, 12);
  ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height * 0.3);
  if (subtext) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(subtext, width / 2, height * 0.3 + 30);
  }
}

/* --------------------------------------------------------------- screens -- */

export function drawTitle(ctx, width, height, best) {
  ctx.fillStyle = 'rgba(8, 20, 34, 0.45)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillText('CORAL SWIFT', width / 2, height * 0.26);
  ctx.fillStyle = '#ffd34d';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillText('— Island Ring Run —', width / 2, height * 0.26 + 44);
  ctx.fillStyle = '#e8f2fa';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText('Fly the five rings around the Coral Isles, then bring her home', width / 2, height * 0.42);
  ctx.fillText('to the runway. Watch your fuel — a sortie is a decision.', width / 2, height * 0.42 + 26);
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#cfe3f2';
  ctx.fillText('↑ ↓  pitch      ← →  bank & turn      W / S  throttle      P  pause      M  sound', width / 2, height * 0.56);
  ctx.fillText('Land gently on the runway after the last ring. Water and rock end the flight.', width / 2, height * 0.56 + 26);
  if (best > 0) {
    ctx.fillStyle = '#ffd34d';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText(`Best score: ${best}`, width / 2, height * 0.56 + 58);
  }
  const button = { x: width / 2 - 110, y: height * 0.68, w: 220, h: 56, label: 'TAKE OFF  ▶' };
  ctx.fillStyle = '#e8533f';
  ctx.beginPath();
  ctx.roundRect(button.x, button.y, button.w, button.h, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillText(button.label, width / 2, button.y + 36);
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText('or press ENTER', width / 2, button.y + 82);
  return [button];
}

function drawEndScreen(ctx, width, height, title, lines, buttonLabel) {
  ctx.fillStyle = 'rgba(8, 20, 34, 0.55)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 52px system-ui, sans-serif';
  ctx.fillText(title, width / 2, height * 0.3);
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillStyle = '#e8f2fa';
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, height * 0.3 + 46 + i * 30);
  });
  const button = { x: width / 2 - 110, y: height * 0.3 + 46 + lines.length * 30 + 30, w: 220, h: 56, label: buttonLabel };
  ctx.fillStyle = '#e8533f';
  ctx.beginPath();
  ctx.roundRect(button.x, button.y, button.w, button.h, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillText(button.label, width / 2, button.y + 36);
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText('or press R', width / 2, button.y + 82);
  return [button];
}

export function drawPaused(ctx, width, height) {
  ctx.fillStyle = 'rgba(8, 20, 34, 0.5)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px system-ui, sans-serif';
  ctx.fillText('PAUSED', width / 2, height * 0.42);
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText('Press P or click to keep flying', width / 2, height * 0.42 + 34);
  return [];
}

/** Index of the next ring, or null once every ring is flown. */
function nextRingIndex(ringsDone) {
  return ringsDone < WORLD.rings.length ? ringsDone : null;
}

/* ------------------------------------------------------------ drawScene -- */

/**
 * Draw one frame. `view` carries everything the scene needs: the plane, the
 * mission state, the screen name, timers and the banner text. Returns the
 * clickable buttons drawn this frame (empty while flying).
 */
export function drawScene(ctx, width, height, view) {
  const { plane, screen, ringsDone, score, elapsed, banner, bannerSub, best, time } = view;
  const { cam, look, roll } = chaseCamera(plane);
  const project = makeProjector(width, height, cam, look, roll);
  // Horizon: where a far point at sea level lands on screen.
  const horizonPoint = project(cam[0] + (look[0] - cam[0]) * 400, 0, cam[2] + (look[2] - cam[2]) * 400);
  const horizonY = horizonPoint ? horizonPoint.y : height * 0.5;

  skyGradient(ctx, width, height, horizonY);
  drawSun(ctx, project, cam);
  drawClouds(ctx, project);
  seaFill(ctx, width, height, horizonY);
  drawFarIslands(ctx, project, cam);
  drawTerrain(ctx, project, cam, look);
  drawRunway(ctx, project);
  drawTown(ctx, project, cam);
  drawTrees(ctx, project, cam);
  drawRings(ctx, project, ringsDone, screen === 'play' || screen === 'paused' ? nextRingIndex(ringsDone) : null);
  drawPlaneShadow(ctx, project, plane);
  if (screen === 'play' || screen === 'paused' || screen === 'crashed' || screen === 'complete' || screen === 'landed-early') {
    drawPlane(ctx, width, height, plane, time);
  }

  if (screen === 'title') {
    return drawTitle(ctx, width, height, best);
  }
  drawCompass(ctx, width, plane);
  drawFlightData(ctx, width, plane, ringsDone, score, elapsed);
  drawAttitude(ctx, width, height, plane);
  drawWarnings(ctx, width, plane);
  drawNextRingArrow(ctx, width, height, project, screen === 'play' ? nextRingIndex(ringsDone) : null);
  drawBanner(ctx, width, height, banner, bannerSub);

  if (screen === 'paused') return drawPaused(ctx, width, height);
  if (screen === 'crashed') {
    return drawEndScreen(ctx, width, height, view.crashTitle, view.crashLines, 'FLY AGAIN');
  }
  if (screen === 'complete') {
    return drawEndScreen(ctx, width, height, 'MISSION COMPLETE', view.endLines, 'FLY AGAIN');
  }
  if (screen === 'landed-early') {
    return drawEndScreen(ctx, width, height, 'LANDED EARLY', view.endLines, 'FLY AGAIN');
  }
  return [];
}
