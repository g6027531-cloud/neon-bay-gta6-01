// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between four screens: title, play, paused and game over (wasted/busted).
// Progress (money, missions, health, position, clock) autosaves to
// localStorage, so a visit can continue where the last one left off.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { PLAYER, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_EXPLODE, EVENT_HIT, EVENT_MISSION,
  EVENT_MISSION_FAIL, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_STEAL,
  EVENT_WANTED_UP, EVENT_WASTED, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH,
  ACTION_SHOOT, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.save()));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Exposed for debugging and playtests, as in game mode.
  window.__neon = { get state() { return world.state; }, world };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let overKind = 'wasted';
  let save = readSave();
  let saveTimer = 0;
  let accumulator = 0;
  let last = performance.now();
  let newGameKey = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && !event.repeat) newGameKey = true;
  });

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    world.startMission(1);
    screen = SCREEN_PLAY;
    save = null;
    writeSave();
    sound.unlock();
    announce('Playing. Mission 1: Hot Wheels. Steal a car and bring it to Rosa’s Garage.');
  }

  function continueGame() {
    if (!save) {
      startNewGame();
      return;
    }
    world.load(save);
    world.startMission(save.missionNumber || 1);
    screen = SCREEN_PLAY;
    sound.unlock();
    announce(`Welcome back. Mission ${save.missionNumber || 1}.`);
  }

  function endGame(kind) {
    overKind = kind;
    screen = SCREEN_OVER;
    // The save keeps the money and the missions — but not the flatline:
    // Vic walks out of the hospital (or the precinct) patched up.
    world.state.player.health = PLAYER.health;
    world.state.player.inCar = null;
    world.state.wanted = 0;
    writeSave();
    if (kind === 'wasted') {
      sound.fail();
      announce('Wasted. Press Space to get back out there.');
    } else {
      sound.fail();
      announce('Busted. Press Space to get back out there.');
    }
  }

  function respawn() {
    const kept = readSave();
    if (kept) {
      world.load(kept);
      world.startMission(kept.missionNumber || 1);
    } else {
      startNewGame();
      return;
    }
    screen = SCREEN_PLAY;
    announce('Back on the streets.');
  }

  function playEventSounds(events) {
    if (events & EVENT_SHOT) sound.shoot();
    if (events & EVENT_PUNCH) sound.punch();
    if (events & EVENT_CRASH) sound.crash();
    if (events & EVENT_EXPLODE) sound.explode();
    if (events & EVENT_PICKUP) sound.pickup();
    if (events & EVENT_STEAL) sound.steal();
    if (events & EVENT_MISSION) {
      sound.mission();
      writeSave();
    }
    if (events & EVENT_MISSION_FAIL) sound.fail();
    if (events & EVENT_WANTED_UP) sound.wanted();
    if (events & EVENT_HIT) sound.hurt();
  }

  function missionObjective() {
    const m = world.currentMission();
    if (!m) return 'Free roam — the city is yours.';
    const step = world.currentStep();
    if (!world.state.mission.active) return `${m.title} — next job from Rosa coming up…`;
    let line = `${m.title}: ${step ? step.text : ''}`;
    if (m.timer && world.state.mission.timer > 0) line += `\nTime left: ${Math.ceil(world.state.mission.timer)}s`;
    if (step && step.type === 'eliminate') line += ` — ${world.state.mission.rivalsLeft} left`;
    if (step && step.type === 'wait' && world.state.mission.waitProgress > 0) {
      line += ` — ${Math.ceil(step.seconds - world.state.mission.waitProgress)}s`;
    }
    return line;
  }

  function buildUi() {
    return {
      target: world.missionTarget(),
      objective: missionObjective(),
      saveExists: !!save,
      saveMoney: save ? save.money : 0,
      saveMissions: save ? save.missionsDone || 0 : 0,
      overKind,
      muted: sound.muted,
      showStoryEnd: world.state.storyDone,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const wasPlaying = screen === SCREEN_PLAY;
    const actions = input.takeActions();
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (actions & ACTION_MUTE) {
      const muted = sound.toggle();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (newGameKey) startNewGame();
      else if (actions & ACTION_CONFIRM) {
        if (!save) startNewGame();
        else continueGame();
      }
      newGameKey = false;
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) respawn();
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }

    if (screen === SCREEN_TITLE) {
      // The city idles behind the title: traffic drives, nobody scores.
      world.step(STEP, { mx: 0, my: 0, up: false, down: false, left: false, right: false, run: false, aimX: 0, aimY: 0 }, null);
      accumulator = 0;
    } else if (screen === SCREEN_PLAY) {
      const held = input.held;
      const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y, world.state.camera);
      const worldInput = {
        mx: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        my: (held.down ? 1 : 0) - (held.up ? 1 : 0),
        up: held.up, down: held.down, left: held.left, right: held.right,
        run: held.run, aimX: aim.x, aimY: aim.y,
      };
      const playActions = wasPlaying
        ? {
          enter: !!(actions & ACTION_ENTER),
          punch: !!(actions & ACTION_PUNCH),
          shoot: !!(actions & ACTION_SHOOT),
        }
        : null;
      let first = true;
      while (accumulator >= STEP) {
        const events = world.step(STEP, worldInput, first ? playActions : null);
        first = false;
        accumulator -= STEP;
        playEventSounds(events);
        if (events & EVENT_WASTED) endGame('wasted');
        else if (events & EVENT_BUSTED) endGame('busted');
        if (screen !== SCREEN_PLAY) break;
      }
      // Engine drone while driving.
      if (world.state.player.inCar) {
        sound.engine(Math.abs(world.state.player.inCar.speed) / 620);
      }
      saveTimer += 1 / 60;
      if (saveTimer > 15) {
        saveTimer = 0;
        writeSave();
      }
    } else {
      accumulator = 0;
    }

    renderer.draw(world.state, screen, buildUi());
  }

  // Leaving the tab pauses a running game rather than letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });
  window.addEventListener('beforeunload', writeSave);

  // For playtests and screenshots: the live game, read-only from outside.
  window.__neon = {
    get state() { return world.state; },
    get screen() { return screen; },
    world,
    startNewGame,
    continueGame,
  };

  announce('NEON BAY. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
