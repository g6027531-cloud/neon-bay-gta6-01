// Drawing only: the world's state and the current screen in, pixels out.
// The camera follows the player; the view shows about 860 world units of
// height, scaled to the window. Canvas shapes and text only — no images —
// so the game needs no assets. The HUD, minimap, banners and menus are all
// drawn here too.
import { CAR, FONT, GRID, PALETTE, PLACES, PLAYER, WORLD } from './config.js';
import { ROAD_XS, ROAD_YS, terrainAt } from './city.js';
import { STORY_END, STORY_INTRO } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const VIEW_HEIGHT = 860;
const MINIMAP = { x: 0, y: 0, w: 216, h: 158, scale: 0.06 };
const STAR = '★';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, w: 0, h: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = height / VIEW_HEIGHT;
    view.w = width;
    view.h = height;
    MINIMAP.x = width / view.scale - MINIMAP.w - 14;
    MINIMAP.y = 14;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function textPlain(value, x, y, size, color, align, baseline) {
    if (!fonts.has(-size)) fonts.set(-size, `${size}px ${FONT}`);
    ctx.font = fonts.get(-size);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(value, x, y);
  }

  // ---- world -----------------------------------------------------------
  function drawTerrain(state) {
    const cam = state.camera;
    const left = cam.x - (view.w / view.scale) / 2 - 60;
    const top = cam.y - VIEW_HEIGHT / 2 - 60;
    const right = cam.x + (view.w / view.scale) / 2 + 60;
    const bottom = cam.y + VIEW_HEIGHT / 2 + 60;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(left, top, right - left, bottom - top);
    // Mow stripes for the lawns.
    ctx.fillStyle = PALETTE.grassDark;
    const stripe = 120;
    for (let y = Math.floor(top / stripe) * stripe; y < bottom; y += stripe * 2) {
      ctx.fillRect(left, y, right - left, stripe);
    }
    // Beach and sea.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(left, WORLD.beachY, right - left, WORLD.seaY - WORLD.beachY);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(left, WORLD.seaY, right - left, bottom - WORLD.seaY + 200);
    ctx.fillStyle = PALETTE.seaDeep;
    const wave = (state.elapsed * 24) % 46;
    for (let x = Math.floor(left / 92) * 92; x < right; x += 92) {
      ctx.fillRect(x + wave - 46, WORLD.seaY + 26, 40, 5);
      ctx.fillRect(x + 40 - wave, WORLD.seaY + 64, 40, 5);
    }
    // Roads: asphalt bands, then centre dashes.
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROAD_XS) ctx.fillRect(rx - 48, 0, 96, WORLD.beachY);
    for (const ry of ROAD_YS) ctx.fillRect(0, ry - 48, WORLD.width, 96);
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of ROAD_XS) {
      for (let y = 60; y < WORLD.beachY; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
    }
    for (const ry of ROAD_YS) {
      for (let x = 60; x < WORLD.width; x += 64) ctx.fillRect(x, ry - 2, 30, 4);
    }
    // Sidewalk edges along the roads.
    ctx.strokeStyle = PALETTE.sidewalk;
    ctx.lineWidth = 4;
    for (const rx of ROAD_XS) {
      ctx.beginPath();
      ctx.moveTo(rx - 50, 0);
      ctx.lineTo(rx - 50, WORLD.beachY);
      ctx.moveTo(rx + 50, 0);
      ctx.lineTo(rx + 50, WORLD.beachY);
      ctx.stroke();
    }
    for (const ry of ROAD_YS) {
      ctx.beginPath();
      ctx.moveTo(0, ry - 50);
      ctx.lineTo(WORLD.width, ry - 50);
      ctx.moveTo(0, ry + 50);
      ctx.lineTo(WORLD.width, ry + 50);
      ctx.stroke();
    }
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      // Fake height: a darker offset slab behind the roof.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(b.x + 6, b.y + b.height * 0.5, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Rooftop details: a vent or two.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, 14, 10);
      ctx.fillRect(b.x + b.w * 0.65, b.y + b.h * 0.6, 10, 14);
    }
  }

  function drawPlaces(state) {
    const labels = {
      garage: ['G', "Rosa's Garage"], docks: ['D', 'The Docks'],
      beachBar: ['B', 'Saltwater Bar'], marina: ['M', 'Marina Office'],
      safehouse: ['S', 'Safehouse'], casino: ['C', 'Casino Royale Bay'],
      yacht: ['Y', "Rosa's Yacht"], bank: ['$', 'Bay Trust Bank'],
      downtown: ['DT', 'Downtown'],
    };
    for (const [key, place] of Object.entries(PLACES)) {
      const [letter, name] = labels[key];
      ctx.fillStyle = 'rgba(12, 16, 28, 0.75)';
      ctx.beginPath();
      ctx.arc(place.x, place.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
      text(letter, place.x, place.y + 6, 16, PALETTE.gold, 'center');
      textPlain(name, place.x, place.y + 40, 15, PALETTE.text, 'center');
    }
  }

  function drawCar(car, state) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    rr(ctx, -CAR.length / 2 + 4, -CAR.width / 2 + 5, CAR.length, CAR.width, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    rr(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 9);
    ctx.fill();
    // Windshield and rear window.
    ctx.fillStyle = 'rgba(20, 30, 50, 0.85)';
    rr(ctx, 6, -CAR.width / 2 + 4, 14, CAR.width - 8, 4);
    ctx.fill();
    rr(ctx, -CAR.length / 2 + 6, -CAR.width / 2 + 4, 10, CAR.width - 8, 4);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 6);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 9, 3, 6);
    if (car.kind === 'police') {
      // Flashing light bar.
      const phase = Math.floor(state.elapsed * 6) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3f7dff';
      ctx.fillRect(-6, -CAR.width / 2 + 2, 12, 7);
      ctx.fillStyle = phase ? '#3f7dff' : '#ff3b30';
      ctx.fillRect(-6, CAR.width / 2 - 9, 12, 7);
      textPlain('POLICE', 0, -CAR.width / 2 - 6, 11, PALETTE.text, 'center');
    }
    if (car.kind === 'comet') {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(-CAR.length / 2 + 8, -2, CAR.length - 16, 4);
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, body, jacket, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(2, 3, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick.
    ctx.strokeStyle = body;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    ctx.lineTo(Math.cos(angle) * (radius + 9), Math.sin(angle) * (radius + 9));
    ctx.stroke();
    ctx.restore();
  }

  function drawEntities(state) {
    for (const c of state.cars) {
      if (!c.active) continue;
      drawCar(c, state);
      // The player's own car gets a gold ring so it never blends in.
      if (c === state.player.inCar) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - 52);
        ctx.lineTo(c.x + 9, c.y - 36);
        ctx.lineTo(c.x - 9, c.y - 36);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const p of state.peds) {
      if (!p.active) continue;
      if (p.state === 'down') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(0.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(-12, -5, 24, 10);
        ctx.restore();
      } else {
        drawPerson(p.x, p.y, p.angle, '#e8c9a0', p.color, 11);
      }
    }
    for (const r of state.rivals) {
      if (!r.active) continue;
      drawPerson(r.x, r.y, r.angle, '#2b2f38', '#e5484d', 13);
      // Health bar over a rival.
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x - 14, r.y - 24, 28, 5);
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(r.x - 14, r.y - 24, 28 * (r.health / 50), 5);
    }
    for (const c of state.footCops) {
      if (!c.active) continue;
      drawPerson(c.x, c.y, c.angle, '#e8c9a0', '#3f7dff', 12);
    }
    const player = state.player;
    if (!player.inCar) {
      // A gold ring marks the player on foot, too.
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
      // The player: yellow jacket, and a pistol line when aiming.
      drawPerson(player.x, player.y, player.angle, '#e8c9a0', PALETTE.playerJacket, PLAYER.radius);
      ctx.strokeStyle = '#2b2f38';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(player.angle) * 10, player.y + Math.sin(player.angle) * 10);
      ctx.lineTo(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26);
      ctx.stroke();
      if (player.hurtT > 0 && Math.floor(player.hurtT * 12) % 2 === 0) {
        ctx.strokeStyle = 'rgba(229, 72, 77, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Particles.
    for (const p of state.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMissionMarker(state, ui) {
    const target = ui.target;
    if (!target) return;
    const pulse = 1 + Math.sin(state.elapsed * 5) * 0.12;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 44 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(12, -34);
    ctx.lineTo(-12, -34);
    ctx.closePath();
    ctx.fill();
    // Beacon pillar.
    ctx.fillStyle = 'rgba(242, 201, 76, 0.16)';
    ctx.fillRect(-8, -260, 16, 260);
    ctx.restore();
    // Edge arrow when the target is off-screen.
    const cam = state.camera;
    const halfW = view.w / view.scale / 2;
    const halfH = VIEW_HEIGHT / 2;
    const dx = target.x - cam.x;
    const dy = target.y - cam.y;
    if (Math.abs(dx) > halfW - 40 || Math.abs(dy) > halfH - 40) {
      const a = Math.atan2(dy, dx);
      const ax = cam.x + Math.cos(a) * (halfW - 70);
      const ay = cam.y + Math.sin(a) * (halfH - 70);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      textPlain(`${Math.round(Math.hypot(dx, dy))}m`, ax, ay - 22, 15, PALETTE.gold, 'center');
    }
  }

  // ---- day / night -------------------------------------------------------
  function nightAlpha(minutes) {
    const h = minutes / 60;
    if (h >= 7 && h < 17) return 0;
    if (h >= 17 && h < 20) return (h - 17) / 3 * 0.16;
    if (h >= 20 || h < 5) return 0.26;
    return (7 - h) / 2 * 0.16;
  }

  // ---- HUD ---------------------------------------------------------------
  function drawHud(state, ui) {
    const player = state.player;
    const w = view.w / view.scale;
    const h = VIEW_HEIGHT;
    // Top-left: money and health.
    ctx.fillStyle = PALETTE.panel;
    rr(ctx, 14, 14, 250, 84, 10);
    ctx.fill();
    text(`$${player.money}`, 28, 48, 30, PALETTE.gold, 'left');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, 28, 62, 220, 14, 7);
    ctx.fill();
    ctx.fillStyle = player.health > 30 ? PALETTE.green : PALETTE.red;
    rr(ctx, 28, 62, 220 * (player.health / 100), 14, 7);
    ctx.fill();
    textPlain(`HEALTH ${Math.ceil(player.health)}`, 28, 94, 13, PALETTE.muted, 'left');
    // Top-centre: wanted stars and the clock.
    const hour = Math.floor(state.clockMinutes / 60);
    const minute = Math.floor(state.clockMinutes % 60);
    const clockStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    text(clockStr, w / 2, 44, 26, PALETTE.text, 'center');
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += STAR;
    text(stars, w / 2, 78, 26, state.wanted > 0 ? PALETTE.gold : 'rgba(255,255,255,0.25)', 'center');
    if (state.wanted > 0) {
      // Filled stars only up to the wanted level, drawn over the faint row.
      let filled = '';
      for (let i = 0; i < state.wanted; i += 1) filled += STAR;
      text(filled, w / 2 - ctx.measureText(stars).width / 2, 78, 26, PALETTE.gold, 'left');
    }
    // Bottom-centre: current objective.
    if (ui.objective) {
      const lines = ui.objective.split('\n');
      const panelW = 640;
      const panelH = 34 + lines.length * 24;
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, (w - panelW) / 2, h - panelH - 16, panelW, panelH, 10);
      ctx.fill();
      for (let i = 0; i < lines.length; i += 1) {
        textPlain(lines[i], w / 2, h - panelH + 8 + i * 24, i === 0 ? 17 : 15, i === 0 ? PALETTE.text : PALETTE.muted, 'center');
      }
    }
    // Bottom-right: speed while driving.
    if (player.inCar) {
      const mph = Math.round(Math.abs(player.inCar.speed) * 0.14);
      text(`${mph}`, w - 30, h - 44, 44, PALETTE.text, 'right');
      textPlain('MPH', w - 30, h - 18, 14, PALETTE.muted, 'right');
    }
    // Controls hint, bottom-left.
    textPlain('WASD drive / walk · E enter car · Space punch · F / click shoot · P pause · M mute', 16, h - 16, 13, PALETTE.muted, 'left');
  }

  function drawMinimap(state, ui) {
    const { x, y, w, h, scale } = MINIMAP;
    ctx.fillStyle = PALETTE.minimapBg;
    rr(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    rr(ctx, x, y, w, h, 8);
    ctx.clip();
    const ox = x + 8;
    const oy = y + 8;
    // Sea and sand.
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(ox, oy + WORLD.seaY * scale, w - 16, h - WORLD.seaY * scale - 8);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(ox, oy + WORLD.beachY * scale, w - 16, (WORLD.seaY - WORLD.beachY) * scale);
    // Roads.
    ctx.strokeStyle = '#5a6272';
    ctx.lineWidth = 2;
    for (const rx of ROAD_XS) {
      ctx.beginPath();
      ctx.moveTo(ox + rx * scale, oy);
      ctx.lineTo(ox + rx * scale, oy + WORLD.beachY * scale);
      ctx.stroke();
    }
    for (const ry of ROAD_YS) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + ry * scale);
      ctx.lineTo(ox + WORLD.width * scale, oy + ry * scale);
      ctx.stroke();
    }
    // Mission target.
    if (ui.target) {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(ox + ui.target.x * scale, oy + ui.target.y * scale, 5 + Math.sin(state.elapsed * 5) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#6aa5ff';
    for (const c of state.cars) {
      if (c.active && c.kind === 'police') {
        ctx.beginPath();
        ctx.arc(ox + c.x * scale, oy + c.y * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Traffic.
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const c of state.cars) {
      if (c.active && c.kind !== 'police') {
        ctx.fillRect(ox + c.x * scale - 1, oy + c.y * scale - 1, 2, 2);
      }
    }
    // Player arrow.
    const player = state.player;
    ctx.save();
    ctx.translate(ox + player.x * scale, oy + player.y * scale);
    ctx.rotate(player.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 8);
    ctx.stroke();
    textPlain('NEON BAY', x + 10, y + 16, 12, PALETTE.muted, 'left');
  }

  function drawBanner(state) {
    const b = state.banner;
    if (!b) return;
    const w = view.w / view.scale;
    const fade = b.t < 0.25 ? b.t / 0.25 : b.t > b.dur - 0.4 ? Math.max(0, (b.dur - b.t) / 0.4) : 1;
    ctx.globalAlpha = fade;
    text(b.text, w / 2, 190, 52, PALETTE.gold, 'center');
    if (b.sub) textPlain(b.sub, w / 2, 226, 20, PALETTE.text, 'center');
    ctx.globalAlpha = 1;
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = view.w / view.scale;
    const h = VIEW_HEIGHT;
    const panelW = 680;
    const lineH = 26;
    const panelH = 150 + lines.length * lineH + 66;
    const x = (w - panelW) / 2;
    const y = (h - panelH) / 2;
    ctx.fillStyle = 'rgba(6, 9, 18, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.panel;
    rr(ctx, x, y, panelW, panelH, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    rr(ctx, x, y, panelW, panelH, 14);
    ctx.stroke();
    text(title, w / 2, y + 74, 46, accent || PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      textPlain(lines[i], w / 2, y + 122 + i * lineH, 18, PALETTE.muted, 'center');
    }
    text(prompt, w / 2, y + panelH - 30, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, ui) {
    drawPanel(
      'NEON BAY',
      [
        ...STORY_INTRO,
        '',
        'Drive, steal, run jobs for Rosa — and stay ahead of Chief Dray.',
        'WASD move / drive · E enter a car · Space punch · F shoot',
      ],
      ui.saveExists ? 'Press Space to continue — or N for a new game' : 'Press Space or click to start',
      PALETTE.gold,
    );
    if (ui.saveExists) {
      textPlain(`Saved: $${ui.saveMoney} · ${ui.saveMissions} mission${ui.saveMissions === 1 ? '' : 's'} done`, view.w / view.scale / 2, VIEW_HEIGHT / 2 + 190, 15, PALETTE.muted, 'center');
    }
  }

  function drawOver(state, ui) {
    const wasted = ui.overKind === 'wasted';
    const lines = wasted
      ? ['Vic got taken down on the streets of Neon Bay.', `You kept $${state.player.money} and your progress is saved.`]
      : ['Chief Dray’s cops finally caught up with Vic.', `You kept $${state.player.money} and your progress is saved.`];
    drawPanel(wasted ? 'WASTED' : 'BUSTED', lines, 'Press Space to get back out there', wasted ? PALETTE.red : PALETTE.blue);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, view.w, view.h);
    const cam = state.camera;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const scale = view.scale;
    const tx = view.w / 2 - (cam.x + shakeX) * scale;
    const ty = VIEW_HEIGHT / 2 * scale - (cam.y + shakeY) * scale;
    ctx.setTransform(scale, 0, 0, scale, tx, ty);
    drawTerrain(state);
    drawBuildings(state);
    drawPlaces(state);
    drawMissionMarker(state, ui);
    drawEntities(state);
    // Day/night tint over the world.
    const alpha = nightAlpha(state.clockMinutes);
    if (alpha > 0) {
      ctx.fillStyle = `rgba(8, 14, 38, ${alpha})`;
      const vw = view.w / scale;
      ctx.fillRect(cam.x - vw / 2 - 80, cam.y - VIEW_HEIGHT / 2 - 80, vw + 160, VIEW_HEIGHT + 160);
    }
    // Back to screen space for the HUD.
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    drawMinimap(state, ui);
    drawBanner(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for no one — except now.', ui.muted ? 'Sound: off (M to turn on)' : 'Sound: on (M to mute)'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawOver(state, ui);
    } else if (screen === SCREEN_PLAY && state.storyDone && ui.showStoryEnd) {
      // The story-end card fades in over free roam for a while.
      textPlain(STORY_END[2], view.w / scale / 2, 300, 20, PALETTE.gold, 'center');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Screen pixels to world units, for aiming with the mouse. */
    screenToWorld(clientX, clientY, cam) {
      const rect = canvas.getBoundingClientRect();
      const sx = (clientX - rect.left) * (canvas.width / rect.width);
      const sy = (clientY - rect.top) * (canvas.height / rect.height);
      return { x: (sx - view.w / 2) / view.scale + cam.x, y: (sy - (VIEW_HEIGHT / 2) * view.scale) / view.scale + cam.y };
    },
    view,
  };
}
