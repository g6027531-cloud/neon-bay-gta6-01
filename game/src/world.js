// NEON BAY's rules and state, with no drawing and no browser in it: the
// player on foot and in cars, traffic and pedestrians, police and the wanted
// level, combat, missions and the story, particles and the in-game clock.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sounds, banners) without the world knowing about
// screens. Pools are allocated once at boot and reused.
import {
  CAR, CLOCK, GRID, PARTICLES, PEDESTRIAN, PLACES, PLAYER, POLICE, SPAWN,
  START_MONEY, TRAFFIC, WANTED, WORLD,
} from './config.js';
import {
  ROAD_XS, ROAD_YS, buildCity, hitBuilding, nearestRoadX, nearestRoadY,
  onRoad, randomRoadPoint, resolveBuilding, terrainAt,
} from './city.js';
import { missionByNumber, missionCount } from './missions.js';

export const EVENT_SHOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_CRASH = 4;
export const EVENT_PICKUP = 8;
export const EVENT_MISSION = 16;
export const EVENT_MISSION_FAIL = 32;
export const EVENT_WASTED = 64;
export const EVENT_BUSTED = 128;
export const EVENT_WANTED_UP = 256;
export const EVENT_STEAL = 512;
export const EVENT_HIT = 1024;
export const EVENT_EXPLODE = 2048;
export const EVENT_SIREN = 4096;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function randRange(random, lo, hi) {
  return lo + random() * (hi - lo);
}

export function createWorld(random) {
  const city = buildCity(random);
  const buildings = city.buildings;

  const player = {
    x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2, health: PLAYER.health,
    money: START_MONEY, inCar: null, punchCd: 0, shootCd: 0, hurtT: 0,
    regenT: 0, moving: false,
  };

  // Cars: traffic (axis-locked road followers), parked, police, the Comet GT.
  const cars = [];
  for (let i = 0; i < TRAFFIC.count + 10 + POLICE.maxCars + 1; i += 1) {
    cars.push({
      active: false, kind: 'traffic', x: 0, y: 0, angle: 0, speed: 0,
      color: '#888888', health: CAR.health, driver: true, axis: 'x', sign: 1,
      targetSpeed: 150, turnCd: 0, chase: false, stuckT: 0, smokeT: 0,
    });
  }
  const peds = [];
  for (let i = 0; i < PEDESTRIAN.count; i += 1) {
    peds.push({
      active: false, x: 0, y: 0, angle: 0, speed: 0, state: 'walk', stateT: 0,
      color: '#e8e8e8', axis: 'x', sign: 1, lane: 0, dangerX: 0, dangerY: 0,
    });
  }
  const rivals = [];
  for (let i = 0; i < 6; i += 1) {
    rivals.push({ active: false, x: 0, y: 0, angle: 0, health: 50, attackCd: 0, speed: 190 });
  }
  const footCops = [];
  for (let i = 0; i < POLICE.maxFoot; i += 1) {
    footCops.push({ active: false, x: 0, y: 0, angle: 0, grabT: 0, stunT: 0 });
  }
  const particles = [];
  for (let i = 0; i < PARTICLES.max; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#ffffff', size: 3 });
  }

  const state = {
    player, cars, peds, rivals, footCops, particles, buildings,
    wanted: 0, wantedTimer: 0, unseenTimer: 0, shootWantedCd: 0,
    clockMinutes: CLOCK.startHour * 60 + CLOCK.startMinute,
    elapsed: 0,
    mission: { number: 1, step: 0, timer: 0, carrying: false, rivalsLeft: 0, active: false, failed: false },
    banner: null,
    shake: 0,
    storyDone: false,
    stats: { carsStolen: 0, shotsFired: 0, missionsDone: 0, rivalsDown: 0 },
    camera: { x: SPAWN.x, y: SPAWN.y },
    danger: { x: 0, y: 0, t: 0 },
  };

  // Events raised by helpers deep inside a step (crashes, explosions,
  // mission results) accumulate here and are returned by step().
  let pending = 0;

  // ---- particles -------------------------------------------------------
  function spawnParticle(x, y, vx, vy, life, color, size) {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (p.active) continue;
      p.active = true;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.color = color; p.size = size;
      return;
    }
  }
  function burst(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + random() * 0.5), color, size);
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
  }

  function setBanner(text, sub, dur) {
    state.banner = { text, sub: sub || '', t: 0, dur: dur || 2.6 };
  }

  function addWanted(n, reason) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    state.unseenTimer = 0;
    if (state.wanted > before) {
      setBanner(`WANTED LEVEL ${state.wanted}`, reason || '', 1.6);
      pending |= EVENT_WANTED_UP;
      return EVENT_WANTED_UP;
    }
    return 0;
  }

  // ---- spawning --------------------------------------------------------
  function freeCar() {
    for (const c of cars) if (!c.active) return c;
    return null;
  }
  function spawnTrafficCar(x, y) {
    const car = freeCar();
    if (!car) return null;
    car.active = true;
    car.kind = 'traffic';
    car.x = x; car.y = y;
    car.color = ['#c94f4f', '#4f7dc9', '#4fc94f', '#c9a44f', '#8a4fc9', '#c9c9c9', '#4fc9c2'][Math.floor(random() * 7)];
    car.health = CAR.health;
    car.driver = true;
    car.chase = false;
    car.stuckT = 0;
    if (Math.abs(y - nearestRoadY(y)) <= Math.abs(x - nearestRoadX(x))) {
      car.axis = 'x'; car.sign = random() < 0.5 ? 1 : -1;
      car.y = nearestRoadY(y);
      car.angle = car.sign > 0 ? 0 : Math.PI;
    } else {
      car.axis = 'y'; car.sign = random() < 0.5 ? 1 : -1;
      car.x = nearestRoadX(x);
      car.angle = car.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.targetSpeed = TRAFFIC.speed + randRange(random, -TRAFFIC.speedJitter, TRAFFIC.speedJitter);
    car.speed = car.targetSpeed;
    car.turnCd = 0;
    return car;
  }
  function spawnParkedCar(x, y, kind, color) {
    const car = freeCar();
    if (!car) return null;
    car.active = true;
    car.kind = kind || 'parked';
    car.x = x; car.y = y;
    car.color = color || ['#c94f4f', '#4f7dc9', '#c9a44f', '#c9c9c9'][Math.floor(random() * 4)];
    car.health = CAR.health;
    car.driver = false;
    car.chase = false;
    car.speed = 0;
    car.angle = random() < 0.5 ? 0 : Math.PI / 2;
    if (Math.abs(x - nearestRoadX(x)) < Math.abs(y - nearestRoadY(y))) {
      car.x = nearestRoadX(x);
      car.angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.y = nearestRoadY(y);
      car.angle = random() < 0.5 ? 0 : Math.PI;
    }
    return car;
  }
  function spawnPoliceCar() {
    const car = freeCar();
    if (!car) return null;
    const p = randomRoadPoint(random, player.x, player.y, 500);
    car.active = true;
    car.kind = 'police';
    car.x = p.x; car.y = p.y;
    car.color = '#e8ecf2';
    car.health = CAR.health;
    car.driver = true;
    car.chase = true;
    car.stuckT = 0;
    car.axis = 'x'; car.sign = 1;
    car.y = nearestRoadY(p.y);
    car.angle = 0;
    car.targetSpeed = POLICE.carSpeed;
    car.speed = POLICE.carSpeed * 0.6;
    car.turnCd = 0;
    return car;
  }
  function spawnPed(x, y) {
    for (const p of peds) {
      if (p.active) continue;
      p.active = true;
      p.x = x; p.y = y;
      p.color = ['#e8e8e8', '#f2a541', '#7db3e8', '#e87db3', '#9be87d', '#c9c9c9'][Math.floor(random() * 6)];
      p.state = 'walk';
      p.stateT = randRange(random, 2, 8);
      p.axis = random() < 0.5 ? 'x' : 'y';
      p.sign = random() < 0.5 ? 1 : -1;
      p.lane = (random() < 0.5 ? -1 : 1) * (52 + random() * 8);
      // Stand on the sidewalk beside the road, not in the middle of it.
      if (p.axis === 'x') p.y = nearestRoadY(p.y) + p.lane;
      else p.x = nearestRoadX(p.x) + p.lane;
      p.speed = PEDESTRIAN.speed * (0.8 + random() * 0.4);
      p.angle = p.axis === 'x' ? (p.sign > 0 ? 0 : Math.PI) : (p.sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      return p;
    }
    return null;
  }
  function spawnRival(x, y) {
    for (const r of rivals) {
      if (r.active) continue;
      r.active = true;
      r.x = x; r.y = y;
      r.health = 50;
      r.attackCd = 0;
      r.angle = random() * TAU;
      return r;
    }
    return null;
  }
  function spawnFootCop() {
    for (const c of footCops) {
      if (c.active) continue;
      const p = randomRoadPoint(random, player.x, player.y, 380);
      c.active = true;
      c.x = p.x; c.y = p.y;
      c.grabT = 0;
      c.stunT = 0;
      return c;
    }
    return null;
  }

  function populate() {
    for (const c of cars) c.active = false;
    for (const p of peds) p.active = false;
    for (const r of rivals) r.active = false;
    for (const c of footCops) c.active = false;
    for (const p of particles) p.active = false;
    // A parked car right by the garage so the first job can start at once.
    spawnParkedCar(930, 990);
    spawnParkedCar(930, 1230);
    for (let i = 0; i < 6; i += 1) {
      const p = randomRoadPoint(random, player.x, player.y, 350);
      spawnParkedCar(p.x, p.y);
    }
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const p = randomRoadPoint(random, player.x, player.y, 300);
      spawnTrafficCar(p.x, p.y);
    }
    for (let i = 0; i < PEDESTRIAN.count; i += 1) {
      const p = randomRoadPoint(random, player.x, player.y, 150);
      spawnPed(p.x, p.y);
    }
  }

  // ---- missions --------------------------------------------------------
  function currentMission() {
    return missionByNumber(state.mission.number);
  }
  function currentStep() {
    const m = currentMission();
    if (!m) return null;
    return m.steps[state.mission.step] ?? null;
  }
  function missionTarget() {
    const step = currentStep();
    if (!step || !step.place) return null;
    return PLACES[step.place];
  }

  function startMission(number) {
    const m = missionByNumber(number);
    if (!m) return;
    state.mission.number = number;
    state.mission.step = 0;
    state.mission.timer = m.timer || 0;
    state.mission.carrying = false;
    state.mission.rivalsLeft = 0;
    state.mission.active = true;
    state.mission.failed = false;
    if (m.startWanted) {
      state.wanted = m.startWanted;
      state.unseenTimer = 0;
    }
    if (m.id === 6) {
      // Marlo's Comet GT waits at the casino for the big score.
      let comet = null;
      for (const c of cars) if (c.active && c.kind === 'comet') comet = c;
      if (!comet) spawnParkedCar(PLACES.casino.x + 40, PLACES.casino.y + 30, 'comet', '#e5484d');
    }
    setBanner(`MISSION ${m.id}: ${m.title}`, m.brief, 4.2);
  }

  function advanceStep() {
    const m = currentMission();
    state.mission.step += 1;
    if (state.mission.step >= m.steps.length) {
      completeMission();
      return;
    }
    const step = currentStep();
    if (step.type === 'eliminate') {
      state.mission.rivalsLeft = step.count;
      for (let i = 0; i < step.count; i += 1) {
        const t = PLACES[step.place];
        spawnRival(t.x + randRange(random, -120, 120), t.y + randRange(random, -120, 120));
      }
      setBanner('RIVALS INBOUND', `${step.count} Sharks at the Docks`, 2.2);
    }
    if (step.type === 'wait' && step.alarmWanted) {
      addWanted(step.alarmWanted, 'The alarm went off!');
    }
  }

  function completeMission() {
    const m = currentMission();
    player.money += m.reward;
    state.stats.missionsDone += 1;
    state.mission.active = false;
    state.mission.carrying = false;
    setBanner('MISSION COMPLETE', `+$${m.reward} — ${m.title}`, 3.2);
    pending |= EVENT_MISSION;
    burst(player.x, player.y, 26, '#f2c94c', 260, 0.9, 4);
    state.mission.number += 1;
    if (state.mission.number > missionCount()) {
      state.storyDone = true;
      setBanner('NEON BAY LEGEND', 'Story complete — the city is yours. Free roam!', 5);
      state.mission.number = missionCount() + 1;
    } else {
      // Let the COMPLETE banner breathe before the next job's banner.
      state.mission.pendingT = 3.5;
    }
  }

  function failMission() {
    const m = currentMission();
    state.mission.failed = true;
    state.mission.active = false;
    state.mission.carrying = false;
    setBanner('MISSION FAILED', `${m.title} — try again from the start`, 3);
    pending |= EVENT_MISSION_FAIL;
    for (const r of rivals) r.active = false;
    state.mission.pendingT = 3;
  }

  function updateMission(dt) {
    const m = currentMission();
    if (!state.mission.active) {
      if (m && state.mission.pendingT > 0) {
        state.mission.pendingT -= dt;
        if (state.mission.pendingT <= 0) startMission(state.mission.number);
      }
      return;
    }
    const step = currentStep();
    if (!m || !step) return;
    if (m.timer) {
      state.mission.timer -= dt;
      if (state.mission.timer <= 0) {
        failMission();
        return;
      }
    }
    const t = step.place ? PLACES[step.place] : null;
    const d = t ? dist(player.x, player.y, t.x, t.y) : Infinity;
    if (step.type === 'steal') {
      if (player.inCar && (!step.carKind || player.inCar.kind === step.carKind)) advanceStep();
    } else if (step.type === 'goto') {
      if (d < step.radius && (!step.carKind || (player.inCar && player.inCar.kind === step.carKind))) advanceStep();
    } else if (step.type === 'pickup') {
      if (d < step.radius) {
        state.mission.carrying = true;
        setBanner('PACKAGE SECURED', 'Get it to the Saltwater Bar', 2);
        advanceStep();
      }
    } else if (step.type === 'deliver') {
      if (state.mission.carrying && d < step.radius) advanceStep();
    } else if (step.type === 'wait') {
      if (d < step.radius) {
        state.mission.waitProgress = (state.mission.waitProgress || 0) + dt;
        if (state.mission.waitProgress >= step.seconds) {
          state.mission.waitProgress = 0;
          advanceStep();
        }
      } else {
        state.mission.waitProgress = 0;
      }
    } else if (step.type === 'eliminate') {
      if (state.mission.rivalsLeft <= 0) advanceStep();
    } else if (step.type === 'loseheat') {
      if (state.wanted === 0) advanceStep();
    }
  }

  // ---- combat ----------------------------------------------------------
  function nearestCar(x, y, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const c of cars) {
      if (!c.active) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar() {
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      car.speed = 0;
      const side = car.angle + Math.PI / 2;
      player.x = car.x + Math.cos(side) * 44;
      player.y = car.y + Math.sin(side) * 44;
      player.angle = car.angle;
      resolveBuilding(buildings, player, PLAYER.radius);
      return 0;
    }
    const car = nearestCar(player.x, player.y, 78);
    if (!car) return 0;
    let events = EVENT_STEAL;
    if (car.kind === 'traffic' || car.kind === 'police') {
      if (car.driver) {
        // Yank the driver out; they run for it.
        const ped = spawnPed(car.x + 40, car.y + 40);
        if (ped) {
          ped.state = 'flee';
          ped.stateT = 4;
          ped.dangerX = player.x;
          ped.dangerY = player.y;
        }
        car.driver = false;
        events |= addWanted(WANTED.stealCar, 'You stole a car in broad daylight');
      }
    }
    if (car.kind === 'comet') {
      events |= addWanted(0, '');
    }
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    state.stats.carsStolen += 1;
    return events;
  }

  function punch() {
    if (player.punchCd > 0) return 0;
    player.punchCd = PLAYER.punchCooldown;
    let events = EVENT_PUNCH;
    const range = PLAYER.punchRange;
    const hitList = [];
    for (const p of peds) {
      if (p.active && p.state !== 'down' && dist(player.x, player.y, p.x, p.y) < range + 14) hitList.push(p);
    }
    for (const r of rivals) {
      if (r.active && dist(player.x, player.y, r.x, r.y) < range + 16) hitList.push(r);
    }
    for (const c of footCops) {
      if (c.active && c.stunT <= 0 && dist(player.x, player.y, c.x, c.y) < range + 14) hitList.push(c);
    }
    for (const target of hitList) {
      const a = angleTo(player.x, player.y, target.x, target.y);
      if (Math.abs(angleDiff(player.angle, a)) > PLAYER.punchArc) continue;
      if (target.health !== undefined) {
        target.health -= PLAYER.punchDamage;
        if (target.health <= 0) {
          target.active = false;
          state.mission.rivalsLeft = Math.max(0, state.mission.rivalsLeft - 1);
          state.stats.rivalsDown += 1;
          player.money += 25;
          burst(target.x, target.y, 18, '#e5484d', 240, 0.7, 4);
          events |= EVENT_PICKUP;
        }
      } else if (target.state !== undefined) {
        target.state = 'down';
        target.stateT = 4;
        burst(target.x, target.y, 10, '#e8e8e8', 160, 0.5, 3);
      } else {
        target.stunT = 3;
        burst(target.x, target.y, 10, '#3f7dff', 160, 0.5, 3);
        events |= addWanted(1, 'You hit a cop!');
      }
      const kx = Math.cos(a) * 180;
      const ky = Math.sin(a) * 180;
      target.x += kx * 0.06;
      target.y += ky * 0.06;
      events |= EVENT_HIT;
    }
    return events;
  }

  function shoot(aimX, aimY) {
    if (player.shootCd > 0 || player.inCar) return 0;
    player.shootCd = PLAYER.shootCooldown;
    state.stats.shotsFired += 1;
    let events = EVENT_SHOT;
    state.danger.x = player.x;
    state.danger.y = player.y;
    state.danger.t = 0.6;
    const a = angleTo(player.x, player.y, aimX, aimY);
    player.angle = a;
    const mx = player.x + Math.cos(a) * 26;
    const my = player.y + Math.sin(a) * 26;
    spawnParticle(mx, my, Math.cos(a) * 60, Math.sin(a) * 60, 0.08, '#ffd76a', 7);
    if (state.shootWantedCd <= 0) {
      events |= addWanted(WANTED.shoot, 'Shots fired!');
      state.shootWantedCd = 5;
    }
    // Hitscan: nearest thing the ray meets within range.
    let best = null;
    let bestD = PLAYER.bulletRange;
    const ex = player.x + Math.cos(a) * PLAYER.bulletRange;
    const ey = player.y + Math.sin(a) * PLAYER.bulletRange;
    function rayHit(x, y, r) {
      const dx = ex - player.x;
      const dy = ey - player.y;
      const len2 = dx * dx + dy * dy;
      let t = ((x - player.x) * dx + (y - player.y) * dy) / len2;
      t = clamp(t, 0, 1);
      const px = player.x + dx * t;
      const py = player.y + dy * t;
      const d = dist(x, y, px, py);
      if (d < r + 6) {
        const along = dist(player.x, player.y, px, py);
        if (along < bestD) { bestD = along; best = { x, y, r, kind: 'ped' }; }
      }
    }
    for (const r of rivals) if (r.active) rayHit(r.x, r.y, 18);
    for (const c of footCops) if (c.active && c.stunT <= 0) rayHit(c.x, c.y, 16);
    for (const p of peds) if (p.active && p.state !== 'down') rayHit(p.x, p.y, 14);
    for (const c of cars) if (c.active && c !== player.inCar) rayHit(c.x, c.y, 30);
    if (best) {
      burst(best.x, best.y, 8, '#e5484d', 180, 0.5, 3);
      events |= EVENT_HIT;
      // Apply damage to whichever entity is there.
      for (const r of rivals) {
        if (r.active && dist(r.x, r.y, best.x, best.y) < 4) {
          r.health -= PLAYER.bulletDamage;
          if (r.health <= 0) {
            r.active = false;
            state.mission.rivalsLeft = Math.max(0, state.mission.rivalsLeft - 1);
            state.stats.rivalsDown += 1;
            player.money += 25;
            burst(r.x, r.y, 18, '#e5484d', 240, 0.7, 4);
          }
        }
      }
      for (const c of footCops) {
        if (c.active && dist(c.x, c.y, best.x, best.y) < 4) {
          c.stunT = 3;
          events |= addWanted(WANTED.killCop, 'You shot a cop!');
        }
      }
      for (const c of cars) {
        if (c.active && dist(c.x, c.y, best.x, best.y) < 4) {
          c.health -= PLAYER.bulletDamage;
          if (c.health <= 0) explodeCar(c);
        }
      }
    }
    return events;
  }

  function explodeCar(car) {
    car.active = false;
    pending |= EVENT_EXPLODE;
    burst(car.x, car.y, 40, '#ff7a3c', 380, 1, 6);
    burst(car.x, car.y, 24, '#3a3f4a', 160, 1.4, 8);
    burst(car.x, car.y, 14, '#f2c94c', 300, 0.5, 4);
    state.shake = Math.max(state.shake, 14);
    if (player.inCar === car) {
      player.inCar = null;
      player.health -= 20;
      player.x = car.x + 50;
      player.y = car.y + 50;
    }
  }

  // ---- driving ---------------------------------------------------------
  function drivePlayerCar(dt, input) {
    const car = player.inCar;
    const throttle = (input.up ? 1 : 0) - (input.down ? 0.62 : 0);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const terrain = terrainAt(car.x, car.y);
    const grip = terrain === 'road' ? CAR.grip : CAR.offroadGrip;
    const maxSpeed = terrain === 'road' ? CAR.maxSpeed : CAR.maxSpeed * 0.55;
    if (throttle > 0) car.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) {
      // S brakes a moving car to a stop, then reverses — it never fights
      // itself: the brake clamps at zero instead of overshooting negative.
      if (car.speed > 0) car.speed = Math.max(0, car.speed - CAR.brake * dt);
      else car.speed -= CAR.reverseAccel * 0.62 * dt;
    }
    // Drag + rolling resistance; stronger off-road.
    car.speed -= car.speed * (terrain === 'road' ? 0.45 : 1.5) * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, maxSpeed);
    const steerAmount = steer * CAR.steer * clamp(Math.abs(car.speed) / 180, 0, 1) * (car.speed >= 0 ? 1 : -1);
    car.angle += steerAmount * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    car.x = nx;
    car.y = ny;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    // World bounds and the sea stop a car.
    if (car.x < 60) { car.x = 60; car.speed *= -0.3; }
    if (car.x > WORLD.width - 60) { car.x = WORLD.width - 60; car.speed *= -0.3; }
    if (car.y < 60) { car.y = 60; car.speed *= -0.3; }
    if (car.y > WORLD.seaY - 30) {
      car.y = WORLD.seaY - 30;
      car.speed *= -0.3;
    }
    // Buildings stop the car hard.
    if (resolveBuilding(buildings, car, 26)) {
      if (Math.abs(car.speed) > 260) {
        car.health -= 12;
        pending |= EVENT_CRASH;
        burst(car.x, car.y, 12, '#f2c94c', 220, 0.5, 3);
        state.shake = Math.max(state.shake, 7);
      }
      car.speed *= -0.25;
    }
    // Exhaust puffs while moving.
    if (Math.abs(car.speed) > 120 && random() < 0.3) {
      const bx = car.x - Math.cos(car.angle) * 34;
      const by = car.y - Math.sin(car.angle) * 34;
      spawnParticle(bx, by, -Math.cos(car.angle) * 40 + randRange(random, -20, 20), -Math.sin(car.angle) * 40 + randRange(random, -20, 20), 0.5, '#9aa3b2', 4);
    }
    // Smoke when wrecked.
    if (car.health < 35) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.12;
        spawnParticle(car.x, car.y - 10, randRange(random, -10, 10), -40, 0.9, '#3a3f4a', 7);
      }
    }
    if (car.health <= 0) explodeCar(car);
  }

  function walkPlayer(dt, input) {
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const mx = input.mx;
    const my = input.my;
    const len = Math.hypot(mx, my);
    player.moving = len > 0.05;
    if (len > 0.05) {
      const nx = mx / Math.max(1, len);
      const ny = my / Math.max(1, len);
      player.angle = Math.atan2(ny, nx);
      const terrain = terrainAt(player.x, player.y);
      const s = terrain === 'sand' ? speed * 0.7 : speed;
      player.x += nx * s * dt;
      player.y += ny * s * dt;
      player.x = clamp(player.x, 30, WORLD.width - 30);
      player.y = clamp(player.y, 30, WORLD.seaY - 16);
      resolveBuilding(buildings, player, PLAYER.radius);
      // Cars push the player.
      for (const c of cars) {
        if (!c.active) continue;
        const d = dist(player.x, player.y, c.x, c.y);
        if (d < 30 + PLAYER.radius && d > 0.01) {
          const push = (30 + PLAYER.radius - d) / d;
          player.x += (player.x - c.x) * push;
          player.y += (player.y - c.y) * push;
          if (Math.abs(c.speed) > 120) {
            player.health -= 14;
            player.hurtT = 0.6;
            state.shake = Math.max(state.shake, 6);
            burst(player.x, player.y, 8, '#e5484d', 180, 0.5, 3);
          }
        }
      }
    }
  }

  // ---- traffic AI ------------------------------------------------------
  function roadTurnChoices(car) {
    // Candidates: keep going, turn left, turn right (never reverse).
    const options = [];
    const atX = car.axis === 'x' ? car.x : nearestRoadX(car.x);
    const atY = car.axis === 'y' ? car.y : nearestRoadY(car.y);
    const gx = ROAD_XS.indexOf(Math.round(atX));
    const gy = ROAD_YS.indexOf(Math.round(atY));
    const moves = [
      { axis: car.axis, sign: car.sign },
      { axis: car.axis === 'x' ? 'y' : 'x', sign: 1 },
      { axis: car.axis === 'x' ? 'y' : 'x', sign: -1 },
    ];
    for (const move of moves) {
      let nx = gx;
      let ny = gy;
      if (move.axis === 'x') nx += move.sign;
      else ny += move.sign;
      if (nx < 0 || nx >= ROAD_XS.length || ny < 0 || ny >= ROAD_YS.length) continue;
      options.push({ ...move, gx: nx, gy: ny });
    }
    return { options, gx, gy };
  }

  function chooseTrafficTurn(car) {
    const { options } = roadTurnChoices(car);
    if (options.length === 0) return;
    // Mostly keep going; sometimes turn.
    if (random() < 0.62) {
      const keep = options.find((o) => o.axis === car.axis && o.sign === car.sign);
      if (keep) return;
    }
    const pick = options[Math.floor(random() * options.length)];
    car.axis = pick.axis;
    car.sign = pick.sign;
    car.angle = car.axis === 'x' ? (car.sign > 0 ? 0 : Math.PI) : (car.sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  function choosePoliceTurn(car) {
    const { options, gx, gy } = roadTurnChoices(car);
    if (options.length === 0) return;
    const pgx = ROAD_XS.indexOf(nearestRoadX(player.x));
    const pgy = ROAD_YS.indexOf(nearestRoadY(player.y));
    let best = options[0];
    let bestScore = Math.abs(best.gx - pgx) + Math.abs(best.gy - pgy);
    for (const o of options) {
      const score = Math.abs(o.gx - pgx) + Math.abs(o.gy - pgy) + random() * 0.6;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    // If the player is on the same road and close, just drive straight at them.
    if (Math.abs(player.y - car.y) < 40 && car.axis === 'x') {
      car.sign = player.x > car.x ? 1 : -1;
      car.angle = car.sign > 0 ? 0 : Math.PI;
      return;
    }
    if (Math.abs(player.x - car.x) < 40 && car.axis === 'y') {
      car.sign = player.y > car.y ? 1 : -1;
      car.angle = car.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
      return;
    }
    car.axis = best.axis;
    car.sign = best.sign;
    car.angle = car.axis === 'x' ? (car.sign > 0 ? 0 : Math.PI) : (car.sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  function driveRoadCar(car, dt, chooseTurn) {
    car.turnCd -= dt;
    // Slow for a car ahead on the same road.
    let target = car.targetSpeed;
    const aheadX = car.x + (car.axis === 'x' ? car.sign * 110 : 0);
    const aheadY = car.y + (car.axis === 'y' ? car.sign * 110 : 0);
    for (const other of cars) {
      if (!other.active || other === car) continue;
      if (dist(aheadX, aheadY, other.x, other.y) < 52) {
        target = Math.min(target, Math.abs(other.speed) * 0.7);
        break;
      }
    }
    if (car.speed < target) car.speed = Math.min(target, car.speed + 420 * dt);
    else if (car.speed > target) car.speed = Math.max(target, car.speed - 500 * dt);
    if (car.axis === 'x') car.x += car.sign * car.speed * dt;
    else car.y += car.sign * car.speed * dt;
    // At an intersection, snap and pick a new direction.
    const along = car.axis === 'x' ? car.x : car.y;
    const roads = car.axis === 'x' ? ROAD_XS : ROAD_YS;
    let nearest = roads[0];
    let nd = Math.abs(along - nearest);
    for (const r of roads) {
      const d = Math.abs(along - r);
      if (d < nd) { nd = d; nearest = r; }
    }
    if (nd < 12 && car.turnCd <= 0) {
      if (car.axis === 'x') car.x = nearest;
      else car.y = nearest;
      chooseTurn(car);
      car.turnCd = 0.5;
    }
    // Keep on the map; turn around at the edges.
    if (car.axis === 'x' && (car.x < ROAD_XS[0] || car.x > ROAD_XS[ROAD_XS.length - 1])) {
      car.sign *= -1;
      car.angle += Math.PI;
      car.x = clamp(car.x, ROAD_XS[0], ROAD_XS[ROAD_XS.length - 1]);
    }
    if (car.axis === 'y' && (car.y < ROAD_YS[0] || car.y > ROAD_YS[ROAD_YS.length - 1])) {
      car.sign *= -1;
      car.angle += Math.PI;
      car.y = clamp(car.y, ROAD_YS[0], ROAD_YS[ROAD_YS.length - 1]);
    }
    if (car.health < 35) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.15;
        spawnParticle(car.x, car.y - 10, randRange(random, -10, 10), -40, 0.9, '#3a3f4a', 7);
      }
    }
  }

  function collideCars() {
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (!a.active) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (!b.active) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d >= 52 || d < 0.01) continue;
        const push = (52 - d) / 2 / d;
        const px = (a.x - b.x) * push;
        const py = (a.y - b.y) * push;
        a.x += px; a.y += py;
        b.x -= px; b.y -= py;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 140) {
          a.health -= 6;
          b.health -= 6;
          pending |= EVENT_CRASH;
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#f2c94c', 200, 0.4, 3);
          state.shake = Math.max(state.shake, 4);
          // A hard hit scrubs speed off both cars — but only on the hit,
          // so a car leaning on another is pushed along, not pinned.
          a.speed *= 0.6;
          b.speed *= 0.6;
          if (a.health <= 0) explodeCar(a);
          if (b.health <= 0) explodeCar(b);
        }
      }
    }
  }

  // ---- pedestrians, rivals, foot cops ----------------------------------
  function updatePeds(dt) {
    for (const p of peds) {
      if (!p.active) continue;
      if (p.state === 'down') {
        p.stateT -= dt;
        if (p.stateT <= 0) {
          p.state = 'flee';
          p.stateT = 4;
          p.dangerX = player.x;
          p.dangerY = player.y;
        }
        continue;
      }
      // Danger nearby: flee from it.
      const dangerNear = (state.danger.t > 0 && dist(p.x, p.y, state.danger.x, state.danger.y) < 260)
        || (state.wanted >= 2 && dist(p.x, p.y, player.x, player.y) < 200);
      // A fast car bearing down scatters the sidewalk too.
      let carThreat = null;
      for (const c of cars) {
        if (c.active && Math.abs(c.speed) > 120 && dist(p.x, p.y, c.x, c.y) < 130) { carThreat = c; break; }
      }
      if (dangerNear && p.state !== 'flee') {
        p.state = 'flee';
        p.stateT = 3;
        p.dangerX = state.danger.t > 0 ? state.danger.x : player.x;
        p.dangerY = state.danger.t > 0 ? state.danger.y : player.y;
      } else if (carThreat && p.state !== 'flee') {
        p.state = 'flee';
        p.stateT = 2;
        // Flee from a point ahead of the car, so the ped steps off the
        // road instead of running down it in front of the car.
        p.dangerX = carThreat.x + Math.cos(carThreat.angle) * 120;
        p.dangerY = carThreat.y + Math.sin(carThreat.angle) * 120;
      }
      if (p.state === 'flee') {
        p.stateT -= dt;
        const a = angleTo(p.dangerX, p.dangerY, p.x, p.y);
        p.angle = a;
        p.x += Math.cos(a) * PEDESTRIAN.fleeSpeed * dt;
        p.y += Math.sin(a) * PEDESTRIAN.fleeSpeed * dt;
        p.x = clamp(p.x, 40, WORLD.width - 40);
        p.y = clamp(p.y, 40, WORLD.seaY - 20);
        resolveBuilding(buildings, p, 12);
        if (p.stateT <= 0) p.state = 'walk';
        continue;
      }
      // Stroll along the sidewalk beside a road.
      p.stateT -= dt;
      if (p.stateT <= 0) {
        p.stateT = randRange(random, 3, 9);
        if (random() < 0.4) {
          p.axis = random() < 0.5 ? 'x' : 'y';
          p.sign = random() < 0.5 ? 1 : -1;
          // Step onto the sidewalk of the new road.
          if (p.axis === 'x') p.y = nearestRoadY(p.y) + p.lane;
          else p.x = nearestRoadX(p.x) + p.lane;
        }
      }
      const a = p.axis === 'x' ? (p.sign > 0 ? 0 : Math.PI) : (p.sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.angle = a;
      p.x += Math.cos(a) * p.speed * dt;
      p.y += Math.sin(a) * p.speed * dt;
      p.x = clamp(p.x, 40, WORLD.width - 40);
      p.y = clamp(p.y, 40, WORLD.seaY - 20);
      resolveBuilding(buildings, p, 12);
      // Turn around at the map edges.
      if ((p.axis === 'x' && (p.x <= 50 || p.x >= WORLD.width - 50)) || (p.axis === 'y' && (p.y <= 50 || p.y >= WORLD.beachY))) {
        p.sign *= -1;
      }
    }
    // The player's car running someone over.
    if (player.inCar) {
      const car = player.inCar;
      for (const p of peds) {
        if (!p.active || p.state === 'down') continue;
        if (dist(p.x, p.y, car.x, car.y) < 34 && Math.abs(car.speed) > 60) {
          p.state = 'down';
          p.stateT = 4;
          pending |= EVENT_HIT;
          burst(p.x, p.y, 10, '#e5484d', 200, 0.6, 3);
          state.shake = Math.max(state.shake, 5);
          addWanted(WANTED.hitPedestrian, 'You ran someone over!');
        }
      }
    }
  }

  function updateRivals(dt) {
    for (const r of rivals) {
      if (!r.active) continue;
      r.attackCd -= dt;
      const d = dist(r.x, r.y, player.x, player.y);
      if (d > 700) continue;
      const a = angleTo(r.x, r.y, player.x, player.y);
      r.angle = a;
      if (d > 34) {
        r.x += Math.cos(a) * r.speed * dt;
        r.y += Math.sin(a) * r.speed * dt;
        resolveBuilding(buildings, r, 14);
      } else if (r.attackCd <= 0 && !player.inCar) {
        r.attackCd = 0.9;
        player.health -= 9;
        player.hurtT = 0.5;
        burst(player.x, player.y, 6, '#e5484d', 160, 0.4, 3);
        state.shake = Math.max(state.shake, 3);
      }
    }
  }

  function updateFootCops(dt) {
    for (const c of footCops) {
      if (!c.active) continue;
      if (c.stunT > 0) {
        c.stunT -= dt;
        continue;
      }
      const d = dist(c.x, c.y, player.x, player.y);
      if (player.inCar || d > 900) {
        c.grabT = 0;
        if (d > 900) { c.active = false; continue; }
      }
      const a = angleTo(c.x, c.y, player.x, player.y);
      c.angle = a;
      if (d > 26) {
        c.x += Math.cos(a) * POLICE.footSpeed * dt;
        c.y += Math.sin(a) * POLICE.footSpeed * dt;
        resolveBuilding(buildings, c, 13);
        c.grabT = 0;
      } else {
        c.grabT += dt;
      }
    }
  }

  // ---- police and wanted -------------------------------------------------
  function policeCount() {
    let n = 0;
    for (const c of cars) if (c.active && c.kind === 'police') n += 1;
    return n;
  }
  function updatePolice(dt) {
    const wanted = state.wanted;
    if (wanted > 0) {
      const wantCars = Math.min(POLICE.maxCars, wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : wanted === 4 ? 4 : 5);
      if (policeCount() < wantCars && random() < dt * 1.2) spawnPoliceCar();
      if (!player.inCar) {
        let foot = 0;
        for (const c of footCops) if (c.active) foot += 1;
        if (foot < Math.min(POLICE.maxFoot, wanted) && random() < dt * 0.8) spawnFootCop();
      }
    } else {
      // No heat: cops give up and drive off.
      for (const c of cars) {
        if (c.active && c.kind === 'police' && dist(c.x, c.y, player.x, player.y) > 1100) c.active = false;
      }
      for (const c of footCops) if (c.active) c.active = false;
    }
    // Seen by the law?
    let seen = false;
    for (const c of cars) {
      if (c.active && c.kind === 'police' && dist(c.x, c.y, player.x, player.y) < WANTED.sightRange) seen = true;
    }
    for (const c of footCops) {
      if (c.active && dist(c.x, c.y, player.x, player.y) < WANTED.sightRange) seen = true;
    }
    if (seen) {
      state.unseenTimer = 0;
      state.wantedTimer = 0;
    } else if (wanted > 0) {
      state.unseenTimer += dt;
      if (state.unseenTimer > WANTED.decayUnseenSeconds) {
        state.wantedTimer += dt;
        if (state.wantedTimer >= WANTED.decaySeconds) {
          state.wantedTimer = 0;
          state.wanted -= 1;
          if (state.wanted === 0) setBanner('CLEAN', 'The heat is off — for now', 2);
        }
      }
    }
    // Cop cars ram the player.
    for (const c of cars) {
      if (!c.active || c.kind !== 'police') continue;
      const d = dist(c.x, c.y, player.x, player.y);
      if (player.inCar) {
        if (d < 56) {
          player.inCar.health -= 8 * dt;
          player.inCar.speed *= 1 - 0.5 * dt;
          state.shake = Math.max(state.shake, 5);
          burst(player.x, player.y, 4, '#f2c94c', 160, 0.3, 3);
        }
      } else if (d < 34 && Math.abs(c.speed) > 80) {
        player.health -= 12;
        player.hurtT = 0.6;
        state.shake = Math.max(state.shake, 6);
      }
    }
  }

  function maintainPopulation(dt) {
    // Traffic stays near the player: recycle cars that drifted far away.
    let traffic = 0;
    for (const c of cars) if (c.active && c.kind === 'traffic') traffic += 1;
    for (const c of cars) {
      if (c.active && c.kind === 'traffic' && dist(c.x, c.y, player.x, player.y) > 1500) {
        c.active = false;
        traffic -= 1;
      }
    }
    while (traffic < TRAFFIC.count) {
      const p = randomRoadPoint(random, player.x, player.y, 320);
      if (spawnTrafficCar(p.x, p.y)) traffic += 1;
      else break;
    }
    let pedCount = 0;
    for (const p of peds) if (p.active) pedCount += 1;
    for (const p of peds) {
      if (p.active && dist(p.x, p.y, player.x, player.y) > 1300) {
        p.active = false;
        pedCount -= 1;
      }
    }
    while (pedCount < PEDESTRIAN.count) {
      const p = randomRoadPoint(random, player.x, player.y, 200);
      if (spawnPed(p.x, p.y)) pedCount += 1;
      else break;
    }
    // Parked cars: keep a few around.
    let parked = 0;
    for (const c of cars) if (c.active && (c.kind === 'parked' || c.kind === 'comet')) parked += 1;
    if (parked < 6 && random() < dt * 0.4) {
      const p = randomRoadPoint(random, player.x, player.y, 300);
      spawnParkedCar(p.x, p.y);
    }
  }

  // ---- the step ----------------------------------------------------------
  function step(dt, input, actions) {
    let events = 0;
    state.elapsed += dt;
    state.clockMinutes = (state.clockMinutes + dt * 1) % 1440;
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t >= state.banner.dur) state.banner = null;
    }
    state.shake = Math.max(0, state.shake - dt * 26);
    if (state.danger.t > 0) state.danger.t -= dt;
    if (state.shootWantedCd > 0) state.shootWantedCd -= dt;
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    player.hurtT = Math.max(0, player.hurtT - dt);

    if (actions) {
      if (actions.enter) events |= enterCar();
      if (actions.punch && !player.inCar) events |= punch();
      if (actions.shoot && !player.inCar) events |= shoot(input.aimX, input.aimY);
    }

    if (player.inCar) drivePlayerCar(dt, input);
    else walkPlayer(dt, input);

    for (const c of cars) {
      if (!c.active) continue;
      if (c === player.inCar) continue;
      if (c.kind === 'traffic') driveRoadCar(c, dt, chooseTrafficTurn);
      else if (c.kind === 'police') driveRoadCar(c, dt, choosePoliceTurn);
      if (c.health <= 0 && c.active) explodeCar(c);
    }
    collideCars();
    updatePeds(dt);
    updateRivals(dt);
    updateFootCops(dt);
    updatePolice(dt);
    updateMission(dt);
    maintainPopulation(dt);
    updateParticles(dt);

    // Health regens slowly when the player has been safe for a while.
    if (player.hurtT <= 0 && player.health > 0 && player.health < PLAYER.health) {
      player.regenT += dt;
      if (player.regenT > 8) player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    } else {
      player.regenT = 0;
    }

    // Camera follows the player, leading a little in the direction of travel.
    const lead = player.inCar ? 90 : 30;
    const tx = player.x + Math.cos(player.angle) * lead;
    const ty = player.y + Math.sin(player.angle) * lead;
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 4);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 4);

    // Busted: a foot cop held onto the player.
    for (const c of footCops) {
      if (c.active && c.grabT >= 1.5) {
        events |= EVENT_BUSTED;
        break;
      }
    }
    if (player.health <= 0) {
      player.health = 0;
      events |= EVENT_WASTED;
    }
    events |= pending;
    pending = 0;
    return events;
  }

  // ---- reset / save ------------------------------------------------------
  function reset() {
    player.x = SPAWN.x;
    player.y = SPAWN.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.money = START_MONEY;
    player.inCar = null;
    player.punchCd = 0;
    player.shootCd = 0;
    player.hurtT = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.unseenTimer = 0;
    state.shootWantedCd = 0;
    state.clockMinutes = CLOCK.startHour * 60 + CLOCK.startMinute;
    state.elapsed = 0;
    state.mission = { number: 1, step: 0, timer: 0, carrying: false, rivalsLeft: 0, active: false, failed: false, pendingT: 0, waitProgress: 0 };
    state.banner = null;
    state.shake = 0;
    state.storyDone = false;
    state.stats = { carsStolen: 0, shotsFired: 0, missionsDone: 0, rivalsDown: 0 };
    state.camera.x = SPAWN.x;
    state.camera.y = SPAWN.y;
    populate();
  }

  function save() {
    return {
      money: player.money,
      health: player.health,
      x: player.x,
      y: player.y,
      missionNumber: Math.min(state.mission.number, missionCount()),
      missionsDone: state.stats.missionsDone,
      clockMinutes: state.clockMinutes,
      storyDone: state.storyDone,
    };
  }

  function load(data) {
    if (!data || typeof data !== 'object') return false;
    reset();
    if (typeof data.money === 'number') player.money = data.money;
    if (typeof data.health === 'number') player.health = data.health;
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      player.x = clamp(data.x, 30, WORLD.width - 30);
      player.y = clamp(data.y, 30, WORLD.seaY - 16);
    }
    if (typeof data.clockMinutes === 'number') state.clockMinutes = data.clockMinutes % 1440;
    if (typeof data.missionsDone === 'number') state.stats.missionsDone = data.missionsDone;
    if (data.storyDone) state.storyDone = true;
    const n = typeof data.missionNumber === 'number' ? clamp(Math.floor(data.missionNumber), 1, missionCount()) : 1;
    state.mission.number = n;
    state.camera.x = player.x;
    state.camera.y = player.y;
    return true;
  }

  reset();
  return {
    state, reset, step, startMission, currentMission, currentStep, missionTarget,
    nearestCar, spawnPoliceCar, spawnParkedCar, spawnTrafficCar, setBanner,
    addWanted, explodeCar, save, load,
  };
}
