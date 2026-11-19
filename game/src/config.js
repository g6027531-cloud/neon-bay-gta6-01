// NEON BAY — every tuning number, colour and city constant in one place.
// The world is a fixed-size coastal city; the camera follows the player and
// the renderer scales the view to the window, so no rule below depends on
// the screen size.

export const STEP = 1 / 60;

/** World size in world units. The sea runs along the south edge. */
export const WORLD = { width: 3600, height: 2600, beachY: 2280, seaY: 2440 };

/** Roads run on a grid; every road is this wide, centres spaced GRID apart. */
export const GRID = 300;
export const ROAD_WIDTH = 96;
/** First road centre (the grid starts inside a margin so the map has edges). */
export const GRID_ORIGIN = 300;

/** Where the player wakes up: outside Rosa's garage on Palm Row. */
export const SPAWN = { x: 1050, y: 1050 };

/** Named places the story and the missions point at (x, y are world units). */
export const PLACES = {
  garage: { x: 1050, y: 1050, name: "Rosa's Garage" },
  docks: { x: 3150, y: 1950, name: 'The Docks' },
  beachBar: { x: 1950, y: 2220, name: 'Saltwater Bar' },
  marina: { x: 3150, y: 2250, name: 'Marina Office' },
  safehouse: { x: 450, y: 450, name: 'Safehouse' },
  casino: { x: 2550, y: 750, name: 'Casino Royale Bay' },
  yacht: { x: 3150, y: 2350, name: "Rosa's Yacht" },
  bank: { x: 1650, y: 1350, name: 'Bay Trust Bank' },
  downtown: { x: 1650, y: 750, name: 'Downtown' },
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchDamage: 25,
  punchRange: 46,
  punchArc: 1.1,
  punchCooldown: 0.35,
  shootCooldown: 0.32,
  bulletRange: 620,
  bulletDamage: 34,
};

export const CAR = {
  length: 64,
  width: 32,
  accel: 520,
  brake: 900,
  reverseAccel: 300,
  maxSpeed: 620,
  maxReverse: 220,
  steer: 3.4,
  grip: 3.2,
  offroadGrip: 1.4,
  health: 100,
};

export const TRAFFIC = { count: 14, speed: 150, speedJitter: 50 };
export const PEDESTRIAN = { count: 26, speed: 55, fleeSpeed: 170 };
export const POLICE = { maxCars: 6, maxFoot: 4, carSpeed: 560, footSpeed: 215 };

/** Wanted stars 0-5. Each star adds police; the level falls when unseen. */
export const WANTED = {
  decaySeconds: 9,
  decayUnseenSeconds: 5,
  sightRange: 520,
  stealCar: 1,
  hitPedestrian: 1,
  shoot: 1,
  killCop: 2,
  max: 5,
};

/** In-game clock: one real second is this many game minutes. */
export const CLOCK = { startHour: 8, startMinute: 0, minutesPerSecond: 1 };

export const SAVE_KEY = 'neon-bay.save.v1';
export const MUTE_KEY = 'neon-bay.muted';

/** Money the player starts with, and mission rewards live in missions.js. */
export const START_MONEY = 50;

/** Particle pool sizes: allocated once, reused, never grown mid-frame. */
export const PARTICLES = { max: 320 };

export const PALETTE = {
  backdrop: '#0b1020',
  grass: '#4a8f52',
  grassDark: '#3f7d47',
  block: '#3a3f4a',
  sidewalk: '#a8adb8',
  road: '#3a3f4c',
  roadLine: '#e8d95a',
  sand: '#e0c983',
  sea: '#2a86b8',
  seaDeep: '#1d6f9e',
  buildingRoof: '#4a4f5e',
  buildingRoof2: '#5d4a5e',
  buildingRoof3: '#465e5a',
  buildingEdge: '#23262e',
  player: '#ffcf3f',
  playerJacket: '#e5484d',
  cop: '#3f7dff',
  copCar: '#e8ecf2',
  trafficColors: ['#c94f4f', '#4f7dc9', '#4fc94f', '#c9a44f', '#8a4fc9', '#c9c9c9', '#4fc9c2'],
  pedColors: ['#e8e8e8', '#f2a541', '#7db3e8', '#e87db3', '#9be87d', '#c9c9c9'],
  text: '#f2f4f8',
  muted: '#9aa3b2',
  gold: '#f2c94c',
  red: '#e5484d',
  green: '#4fc94f',
  blue: '#3f7dff',
  panel: 'rgba(12, 16, 28, 0.88)',
  panelEdge: '#2e3648',
  minimapBg: 'rgba(10, 14, 24, 0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
