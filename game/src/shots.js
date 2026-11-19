// The screenshot scenes behind ?shot=start|play|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what a short game
// really looks like and the same seed always gives the same frame.
//
// The driving autopilot plans a route on the road grid (breadth-first
// search over the road intersections) and steers the car from waypoint to
// waypoint; the on-foot autopilot walks at the nearest rival and punches.
import { PLACES, STEP } from './config.js';
import { ROAD_XS, ROAD_YS, nearestRoadX, nearestRoadY } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 11;
const CHASE_SECONDS = 7;
const MISSION_SECONDS = 3.5;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Breadth-first route over road intersections, as world points. */
function planRoute(fromX, fromY, toX, toY) {
  const sx = ROAD_XS.indexOf(nearestRoadX(fromX));
  const sy = ROAD_YS.indexOf(nearestRoadY(fromY));
  const tx = ROAD_XS.indexOf(nearestRoadX(toX));
  const ty = ROAD_YS.indexOf(nearestRoadY(toY));
  const w = ROAD_XS.length;
  const h = ROAD_YS.length;
  const prev = new Array(w * h).fill(-1);
  const queue = [sy * w + sx];
  prev[sy * w + sx] = sy * w + sx;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === ty * w + tx) break;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (prev[ny * w + nx] !== -1) continue;
      prev[ny * w + nx] = cur;
      queue.push(ny * w + nx);
    }
  }
  const route = [];
  let cur = ty * w + tx;
  if (prev[cur] === -1) return [{ x: toX, y: toY }];
  while (cur !== sy * w + sx) {
    route.unshift({ x: ROAD_XS[cur % w], y: ROAD_YS[Math.floor(cur / w)] });
    cur = prev[cur];
  }
  route.unshift({ x: ROAD_XS[sx], y: ROAD_YS[sy] });
  return route;
}

/** Steer a car along a route of waypoints; returns the input for one step. */
function driveAlong(car, route, state, speedCap) {
  let wp = route[0];
  while (route.length > 1 && Math.hypot(car.x - wp.x, car.y - wp.y) < 50) {
    route.shift();
    wp = route[0];
  }
  // Overtake: if a car is sitting in the way ahead, swing around it.
  let tx = wp.x;
  let ty = wp.y;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (!other.active || other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (ahead > 0 && ahead < 110 && side < 46) {
      tx = wp.x - fy * 50;
      ty = wp.y + fx * 50;
      break;
    }
  }
  const speed = Math.abs(car.speed || 0);
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  // Brake for the turn ahead: when the next waypoint turns, slow right down.
  let slowForTurn = false;
  if (route[1] && Math.hypot(car.x - wp.x, car.y - wp.y) < 320) {
    const nextDiff = Math.abs(angleDiff(car.angle, Math.atan2(route[1].y - car.y, route[1].x - car.x)));
    slowForTurn = nextDiff > 0.7;
  }
  const cap = slowForTurn ? 120 : (speedCap ?? 280);
  // Exactly behind the waypoint, the turn direction is ambiguous and the
  // steering flips back and forth: commit to one side until it resolves.
  const turn = Math.abs(diff) > 2.9 ? 1 : diff > 0.08 ? 1 : diff < -0.08 ? -1 : 0;
  // Stuck against something while trying to reach the waypoint: back out.
  if (Math.abs(car.speed || 0) < 20 && Math.hypot(car.x - wp.x, car.y - wp.y) > 80) {
    car._stuck = (car._stuck || 0) + 1;
  } else {
    car._stuck = 0;
  }
  if (car._stuck > 40) {
    car._reverseT = 30;
    car._stuck = 0;
  }
  if (car._reverseT > 0) {
    car._reverseT -= 1;
    return { mx: 0, my: 0, up: false, down: true, left: turn < 0, right: turn > 0, run: false, aimX: wp.x, aimY: wp.y };
  }
  return {
    mx: 0, my: 0,
    // Facing away from the waypoint: reverse out of it (a three-point turn).
    up: Math.abs(diff) < 2.6 && speed < cap,
    down: (Math.abs(diff) >= 2.6 && speed < 40) || (slowForTurn && speed > 150) || (Math.abs(diff) > 1.1 && speed > 240),
    left: turn < 0,
    right: turn > 0,
    run: false, aimX: wp.x, aimY: wp.y,
  };
}

function uiFor(world) {
  const m = world.currentMission();
  const step = world.currentStep();
  let objective = m && step ? `${m.title}: ${step.text}` : 'Free roam — the city is yours.';
  if (step && step.type === 'eliminate') objective += ` — ${world.state.mission.rivalsLeft} left`;
  return {
    target: world.missionTarget(),
    objective,
    saveExists: false, saveMoney: 0, saveMissions: 0,
    overKind: 'wasted', muted: false, showStoryEnd: false,
  };
}

function putPlayerInCar(world) {
  const state = world.state;
  const player = state.player;
  let car = null;
  for (const c of state.cars) {
    if (c.active && c.kind === 'parked') { car = c; break; }
  }
  if (!car) return false;
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  return true;
}

/**
 * Set `world` to the named scene (start, play, chase or mission; any other
 * name is start) and return the screen to draw over it and the UI to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'chase' && name !== 'mission') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, up: false, down: false, left: false, right: false, run: false, aimX: 0, aimY: 0 }, null);
    }
    return { screen: SCREEN_TITLE, ui: { ...uiFor(world), saveExists: true, saveMoney: 240, saveMissions: 1 } };
  }

  if (name === 'play') {
    world.startMission(2);
    putPlayerInCar(world);
    const target = world.missionTarget();
    const route = planRoute(state.player.x, state.player.y, target.x, target.y);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, driveAlong(state.player.inCar || state.player, route, state), null);
      if (!state.player.inCar) break;
    }
    return { screen: SCREEN_PLAY, ui: uiFor(world) };
  }

  if (name === 'chase') {
    // A getaway in progress: three stars, two police cars closing in, the
    // player already rolling east toward the docks at speed.
    state.wanted = 3;
    putPlayerInCar(world);
    const car = state.player.inCar;
    car.x = 1200;
    car.y = 900;
    car.angle = 0;
    car.speed = 350;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = 0;
    // The pursuit starts behind the player, closing in down the same road.
    const cop1 = world.spawnPoliceCar();
    if (cop1) { cop1.x = 700; cop1.y = 900; cop1.axis = 'x'; cop1.sign = 1; cop1.angle = 0; }
    const cop2 = world.spawnPoliceCar();
    if (cop2) { cop2.x = 500; cop2.y = 900; cop2.axis = 'x'; cop2.sign = 1; cop2.angle = 0; }
    const target = PLACES.docks;
    const route = planRoute(car.x, car.y, target.x, target.y);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      world.step(STEP, driveAlong(state.player.inCar || state.player, route, state, 460), null);
      if (!state.player.inCar) break;
    }
    return {
      screen: SCREEN_PLAY,
      ui: { ...uiFor(world), target, objective: 'WANTED — 3 stars: break line of sight and lose the heat' },
    };
  }

  // mission: the dockside fight — Vic on foot among the Sharks.
  world.startMission(4);
  state.player.x = 3150;
  state.player.y = 1900;
  state.player.angle = 0;
  // Walk into the docks to trigger the eliminate step and spawn the rivals.
  for (let i = 0; i < 2 / STEP; i += 1) {
    world.step(STEP, { mx: 0, my: 0.4, up: false, down: true, left: false, right: false, run: false, aimX: 3150, aimY: 1950 }, null);
    if (world.currentStep() && world.currentStep().type === 'eliminate') break;
  }
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    // Kite the nearest rival: close in to shoot, strafe around the pack so
    // the fight stays at the docks, back off when they rush in. Stop with
    // one Shark left standing, so the shot still shows the fight.
    if (state.mission.rivalsLeft <= 1) break;
    let rival = null;
    let bd = Infinity;
    for (const r of state.rivals) {
      if (!r.active) continue;
      const d = Math.hypot(r.x - state.player.x, r.y - state.player.y);
      if (d < bd) { bd = d; rival = r; }
    }
    if (!rival) break;
    const a = Math.atan2(rival.y - state.player.y, rival.x - state.player.x);
    const orbit = (Math.floor(i / 45) % 2 === 0 ? 1 : -1) * Math.PI / 2;
    let mx = Math.cos(a + orbit);
    let my = Math.sin(a + orbit);
    if (bd > 260) { mx = Math.cos(a); my = Math.sin(a); }
    if (bd < 150) { mx = -Math.cos(a); my = -Math.sin(a); }
    // Keep the fight at the docks: drift back if it wanders off.
    const anchor = PLACES.docks;
    if (Math.hypot(state.player.x - anchor.x, state.player.y - anchor.y) > 200) {
      const aa = Math.atan2(anchor.y - state.player.y, anchor.x - state.player.x);
      mx = Math.cos(aa);
      my = Math.sin(aa);
    }
    const actions = bd < 50
      ? { enter: false, punch: true, shoot: false }
      : { enter: false, punch: false, shoot: bd < 500 };
    world.step(STEP, { mx, my, up: false, down: false, left: false, right: false, run: true, aimX: rival.x, aimY: rival.y }, actions);
  }
  return { screen: SCREEN_PLAY, ui: uiFor(world) };
}
