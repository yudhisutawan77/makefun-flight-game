// Coral Swift — Island Ring Run: every tunable number lives here.
// Units: metres, seconds, radians. Speeds are m/s; the HUD converts to knots / feet.
export const WORLD = {
  size: 2400,
  waterLevel: 0,
  runwayElevation: 6,
  // Runway rectangle on the home island (metres, world x / z).
  runway: { x: 0, zMin: -200, zMax: 200, halfWidth: 14 },
  start: { x: 0, y: 8, z: -160, heading: 0 },
  // Five target rings, in the order the mission asks for them.
  rings: [
    { x: 0, y: 55, z: 300, radius: 14 },
    { x: 480, y: 80, z: 470, radius: 14 },
    { x: 640, y: 75, z: -260, radius: 14 },
    { x: -80, y: 100, z: -660, radius: 14 },
    { x: -590, y: 85, z: -360, radius: 14 },
  ],
  // Islands: gaussian bumps (centre x/z, radius, height). The first is home.
  islands: [
    { x: 0, z: 0, radius: 330, height: 52 },
    { x: 150, z: -110, radius: 130, height: 46 },
    { x: 0, z: -700, radius: 230, height: 92 },
    { x: 650, z: -260, radius: 190, height: 48 },
    { x: -600, z: -360, radius: 210, height: 72 },
    { x: 470, z: 560, radius: 130, height: 26 },
    { x: -500, z: 520, radius: 110, height: 22 },
    { x: -1050, z: 150, radius: 260, height: 60 },
    { x: 1050, z: 350, radius: 240, height: 44 },
  ],
  // Distant silhouettes drawn on the horizon so the sea never ends in flat blue.
  farIslands: [
    { x: -1400, z: -1100, width: 700, height: 90 },
    { x: 900, z: -1400, width: 900, height: 120 },
    { x: 1700, z: -300, width: 600, height: 70 },
    { x: -1700, z: 700, width: 800, height: 80 },
  ],
  // Little harbour town east of the runway: small boxes with coloured roofs.
  town: [
    { x: 105, z: -120, w: 12, d: 10, h: 8, roof: '#c94f43' },
    { x: 128, z: -95, w: 10, d: 9, h: 6, roof: '#3f7d5a' },
    { x: 110, z: -70, w: 13, d: 10, h: 9, roof: '#d8a13c' },
    { x: 135, z: -45, w: 10, d: 9, h: 7, roof: '#4a6fa5' },
    { x: 108, z: -18, w: 12, d: 10, h: 8, roof: '#c94f43' },
    { x: 132, z: 8, w: 10, d: 9, h: 6, roof: '#3f7d5a' },
    { x: 112, z: 38, w: 13, d: 10, h: 8, roof: '#d8a13c' },
    { x: 138, z: 62, w: 10, d: 9, h: 6, roof: '#4a6fa5' },
    { x: 110, z: 92, w: 11, d: 10, h: 7, roof: '#c94f43' },
    { x: 95, z: -150, w: 10, d: 9, h: 6, roof: '#3f7d5a' },
    { x: 96, z: 130, w: 10, d: 9, h: 6, roof: '#4a6fa5' },
  ],
  // Deterministic tree spots (x, z) on the home island's grass.
  trees: [
    [90, -180], [120, -160], [105, -120], [-90, -170], [-120, -140], [-100, -100],
    [130, -60], [110, -30], [-130, -40], [-110, 10], [120, 90], [100, 130],
    [-95, 60], [-125, 110], [95, 170], [-85, 180], [150, 30], [-150, -70],
    [170, -110], [-170, 40], [60, -190], [-60, -195], [200, -20], [-200, 90],
  ],
  // Puffy clouds: fixed world spots, drawn as soft white blobs.
  clouds: [
    { x: -300, y: 190, z: -500, r: 90 },
    { x: 250, y: 210, z: -200, r: 110 },
    { x: 700, y: 180, z: 300, r: 80 },
    { x: -700, y: 200, z: 100, r: 100 },
    { x: 100, y: 230, z: -900, r: 120 },
    { x: -450, y: 170, z: 650, r: 85 },
    { x: 900, y: 200, z: -700, r: 95 },
    { x: -100, y: 190, z: 800, r: 90 },
  ],
};

export const PLANE = {
  maxSpeed: 95,
  cruiseSpeed: 62,
  stallSpeed: 24,
  maxPitch: 0.42,
  maxRoll: 0.95,
  pitchRate: 1.6,
  rollRate: 2.6,
  engineAccel: 14,
  dragDecel: 9,
  fuelBurn: 0.34,
  fuelIdle: 0.10,
  fuelStart: 100,
  ringRadius: 14,
};

export const SCORE = {
  ring: 100,
  landing: 250,
  fuelBonusPerUnit: 2,
  timeBonusPerSecond: 2,
  timeBonusCapSeconds: 240,
};

export const STEP = 1 / 60;
export const MS_PER_KNOT = 1.94384;
export const M_PER_FOOT = 0.3048;
