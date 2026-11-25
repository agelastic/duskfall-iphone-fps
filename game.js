(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = Object.fromEntries([
    'startScreen', 'startButton', 'pauseScreen', 'resumeButton',
    'endScreen', 'endTitle', 'endMessage', 'restartButton',
    'healthValue', 'ammoValue', 'killsValue', 'objectiveText',
    'moveStick', 'moveKnob', 'lookStick', 'lookKnob',
    'fireButton', 'reloadButton', 'pauseButton', 'crosshair'
  ].map(id => [id, document.getElementById(id)]));
  const audio = window.GameAudio ? new window.GameAudio() : null;

  const SIZE = 24;
  const FOV = Math.PI / 2.8;
  const HALF_FOV_TAN = Math.tan(FOV / 2);
  const RAY_STEP = 2;
  const MAX_DISTANCE = 28;
  const TOTAL_ENEMIES = 8;
  const keys = new Set();
  const controls = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, firing: false };
  const wallTextures = [null, makeWallTexture(1), makeWallTexture(2), makeWallTexture(3)];
  const sprites = {
    enemy: makeEnemySprite(),
    health: makePickupSprite('health'),
    ammo: makePickupSprite('ammo'),
    exitLocked: makeExitSprite(false),
    exitOpen: makeExitSprite(true)
  };
  let world;
  let state;
  let screenWidth = 480;
  let screenHeight = 270;
  let depthBuffer = [];
  let lastFrame = 0;
  let frameHandle = 0;

  function makeWorld() {
    const grid = Array.from({ length: SIZE }, (_, y) =>
      Array.from({ length: SIZE }, (_, x) => x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? 1 : 0)
    );
    const rectangle = (x1, y1, x2, y2, type) => {
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) grid[y][x] = type;
      }
    };
    rectangle(4, 3, 6, 5, 1);
    rectangle(10, 2, 13, 4, 2);
    rectangle(17, 3, 19, 7, 1);
    rectangle(3, 9, 5, 12, 2);
    rectangle(8, 8, 10, 10, 3);
    rectangle(13, 9, 15, 12, 1);
    rectangle(19, 11, 21, 14, 2);
    rectangle(4, 16, 7, 18, 1);
    rectangle(10, 15, 12, 19, 3);
    rectangle(15, 17, 18, 19, 2);
    grid[7][11] = 3;
    grid[7][12] = 3;
    grid[14][7] = 2;
    grid[14][8] = 2;
    grid[20][14] = 1;
    return grid;
  }

  function newState() {
    return {
      mode: 'start',
      elapsed: 0,
      player: { x: 2.5, y: 2.5, angle: 0.22, pitch: 0, hp: 100, mag: 12, reserve: 48, kills: 0 },
      enemies: [
        [8.5, 2.5], [15.5, 3.5], [21.5, 6.5], [2.5, 14.5],
        [11.5, 13.5], [17.5, 15.5], [20.5, 20.5], [8.5, 21.5]
      ].map(([x, y], i) => ({ x, y, hp: 84, alive: true, alert: false, path: [], pathTimer: i * 0.07, attackTimer: 0, hitFlash: 0, phase: i * 1.91 })),
      pickups: [
        { x: 7.5, y: 7.5, kind: 'ammo', active: true },
        { x: 18.5, y: 8.5, kind: 'ammo', active: true },
        { x: 6.5, y: 20.5, kind: 'ammo', active: true },
        { x: 2.5, y: 17.5, kind: 'health', active: true },
        { x: 12.5, y: 13.5, kind: 'health', active: true },
        { x: 20.5, y: 18.5, kind: 'health', active: true }
      ],
      exit: { x: 21.5, y: 21.5 },
      fireCooldown: 0,
      reloadTimer: 0,
      recoil: 0,
      muzzle: 0,
      hurt: 0,
      shake: 0,
      stepDistance: 0,
      walkTime: 0,
      message: '',
      messageTimer: 0,
      noiseTimer: 0
    };
  }

  function random(seed) {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function makeWallTexture(type) {
    const tex = document.createElement('canvas');
    tex.width = tex.height = 64;
    const g = tex.getContext('2d');
    const rnd = random(1209 + type * 4301);
    const base = type === 1 ? '#3d4148' : type === 2 ? '#484951' : '#49383d';
    const light = type === 1 ? '#51575d' : type === 2 ? '#626670' : '#654b4b';
    const shadow = type === 1 ? '#22262e' : type === 2 ? '#252931' : '#2b2029';
    g.fillStyle = shadow;
    g.fillRect(0, 0, 64, 64);
    if (type === 2) {
      for (let x = 0; x < 64; x += 32) {
        g.fillStyle = base;
        g.fillRect(x + 2, 2, 28, 60);
        g.fillStyle = light;
        g.fillRect(x + 4, 3, 2, 57);
        g.fillStyle = '#252a32';
        g.fillRect(x + 27, 3, 2, 57);
        for (const y of [7, 31, 55]) {
          g.fillStyle = '#a17b48';
          g.fillRect(x + 8, y, 3, 3);
          g.fillRect(x + 22, y, 3, 3);
        }
      }
      g.fillStyle = '#ad572b';
      for (let i = -64; i < 128; i += 13) {
        g.beginPath();
        g.moveTo(i, 58);
        g.lineTo(i + 6, 58);
        g.lineTo(i + 12, 64);
        g.lineTo(i + 6, 64);
        g.fill();
      }
    } else {
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 ? -12 : 0;
        for (let x = offset; x < 64; x += 24) {
          const y = row * 16;
          g.fillStyle = base;
          g.fillRect(x + 1, y + 1, 22, 14);
          g.fillStyle = light;
          g.fillRect(x + 2, y + 2, 19, 2);
          g.fillStyle = shadow;
          g.fillRect(x + 21, y + 3, 2, 11);
        }
      }
      for (let n = 0; n < 95; n++) {
        const x = Math.floor(rnd() * 64);
        const y = Math.floor(rnd() * 64);
        g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,.15)' : 'rgba(220,196,166,.08)';
        g.fillRect(x, y, rnd() > 0.7 ? 3 : 1, 1);
      }
      if (type === 3) {
        g.strokeStyle = '#d56636';
        g.lineWidth = 2;
        g.shadowColor = '#e64b20';
        g.shadowBlur = 7;
        g.beginPath();
        g.moveTo(7, 6); g.lineTo(16, 21); g.lineTo(13, 31);
        g.lineTo(29, 39); g.lineTo(33, 57); g.moveTo(44, 1);
        g.lineTo(39, 19); g.lineTo(51, 28); g.lineTo(47, 42);
        g.stroke();
        g.shadowBlur = 0;
      }
    }
    return tex;
  }

  function polygon(g, colour, points) {
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.closePath();
    g.fill();
  }

  function makeEnemySprite() {
    const tex = document.createElement('canvas');
    tex.width = 72; tex.height = 96;
    const g = tex.getContext('2d');
    g.shadowColor = '#eb3c26';
    g.shadowBlur = 11;
    polygon(g, '#4e2028', [7, 17, 15, 3, 25, 20, 47, 20, 57, 3, 65, 18, 58, 37, 14, 37]);
    g.shadowBlur = 0;
    polygon(g, '#180f1b', [22, 79, 29, 58, 44, 58, 51, 79, 57, 96, 42, 96, 37, 79, 34, 79, 29, 96, 14, 96]);
    polygon(g, '#341b27', [17, 38, 27, 28, 45, 28, 55, 38, 54, 70, 43, 81, 29, 81, 18, 70]);
    polygon(g, '#8d3835', [21, 42, 30, 31, 43, 31, 51, 42, 46, 62, 25, 62]);
    polygon(g, '#4d2029', [20, 49, 7, 60, 2, 79, 13, 83, 20, 68]);
    polygon(g, '#4d2029', [52, 49, 65, 60, 70, 79, 59, 83, 52, 68]);
    polygon(g, '#a34b40', [20, 23, 28, 15, 44, 15, 52, 23, 48, 40, 37, 49, 24, 40]);
    polygon(g, '#54232a', [23, 28, 29, 24, 43, 24, 49, 28, 46, 40, 36, 45, 26, 40]);
    g.shadowColor = '#ff6b35'; g.shadowBlur = 8;
    polygon(g, '#ffb05b', [26, 30, 34, 31, 32, 36, 26, 35]);
    polygon(g, '#ffb05b', [46, 30, 38, 31, 40, 36, 46, 35]);
    g.shadowBlur = 0;
    polygon(g, '#1a0d18', [30, 40, 42, 40, 36, 45]);
    g.fillStyle = '#e6814b';
    g.fillRect(30, 55, 12, 2);
    g.fillRect(33, 64, 6, 2);
    return tex;
  }

  function makePickupSprite(kind) {
    const tex = document.createElement('canvas');
    tex.width = 48; tex.height = 48;
    const g = tex.getContext('2d');
    const glow = kind === 'health' ? '#5fe5a2' : '#e6b467';
    g.shadowColor = glow; g.shadowBlur = 15;
    polygon(g, '#171b23', [8, 12, 40, 12, 44, 36, 36, 43, 12, 43, 4, 36]);
    g.shadowBlur = 0;
    polygon(g, kind === 'health' ? '#2b765d' : '#856036', [9, 15, 39, 15, 39, 37, 9, 37]);
    g.strokeStyle = glow; g.lineWidth = 3;
    g.strokeRect(9, 15, 30, 22);
    g.fillStyle = glow;
    if (kind === 'health') {
      g.fillRect(21, 19, 6, 15);
      g.fillRect(16, 24, 16, 5);
    } else {
      for (let x = 16; x <= 32; x += 8) {
        g.fillRect(x, 22, 5, 12);
        g.fillRect(x + 1, 19, 3, 3);
      }
    }
    return tex;
  }

  function makeExitSprite(open) {
    const tex = document.createElement('canvas');
    tex.width = 64; tex.height = 112;
    const g = tex.getContext('2d');
    const glow = open ? '#77efc1' : '#ed5948';
    g.shadowColor = glow; g.shadowBlur = 18;
    g.strokeStyle = glow; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(8, 107); g.lineTo(8, 28); g.quadraticCurveTo(32, -4, 56, 28); g.lineTo(56, 107);
    g.stroke();
    g.shadowBlur = 0;
    const gradient = g.createLinearGradient(0, 18, 0, 110);
    gradient.addColorStop(0, open ? '#9af9dc' : '#f39d6c');
    gradient.addColorStop(.5, open ? '#2c907e' : '#922e3e');
    gradient.addColorStop(1, '#140d1c');
    g.fillStyle = gradient;
    g.beginPath();
    g.moveTo(14, 106); g.lineTo(14, 31); g.quadraticCurveTo(32, 7, 50, 31); g.lineTo(50, 106);
    g.closePath(); g.fill();
    g.fillStyle = open ? 'rgba(220,255,240,.65)' : 'rgba(255,175,115,.45)';
    for (let y = 31; y < 106; y += 13) g.fillRect(19, y, 26, 2);
    return tex;
  }

  function wallAt(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= SIZE || iy >= SIZE) return 1;
    return world[iy][ix];
  }

  function blocked(x, y, radius = .24) {
    return wallAt(x - radius, y - radius) || wallAt(x + radius, y - radius) ||
      wallAt(x - radius, y + radius) || wallAt(x + radius, y + radius);
  }

  function moveEntity(entity, dx, dy, radius) {
    if (!blocked(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (!blocked(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function angleDifference(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  function lineOfSight(x1, y1, x2, y2) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(length / .12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (wallAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  function pathToPlayer(startX, startY) {
    const start = Math.floor(startY) * SIZE + Math.floor(startX);
    const goal = Math.floor(state.player.y) * SIZE + Math.floor(state.player.x);
    if (start === goal) return [];
    const queue = [start];
    const previous = new Int16Array(SIZE * SIZE);
    previous.fill(-1);
    previous[start] = start;
    let head = 0;
    while (head < queue.length && previous[goal] < 0) {
      const current = queue[head++];
      const x = current % SIZE;
      const y = Math.floor(current / SIZE);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || world[ny][nx]) continue;
        const next = ny * SIZE + nx;
        if (previous[next] >= 0) continue;
        previous[next] = current;
        queue.push(next);
      }
    }
    if (previous[goal] < 0) return [];
    const path = [];
    for (let at = goal; at !== start; at = previous[at]) path.push({ x: at % SIZE + .5, y: Math.floor(at / SIZE) + .5 });
    path.reverse();
    return path;
  }

  function updateEnemies(dt) {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      const dist = distance(enemy, player);
      if (!enemy.alert && (dist < 5.5 && lineOfSight(enemy.x, enemy.y, player.x, player.y) ||
          state.noiseTimer > 0 && dist < 8)) enemy.alert = true;
      if (!enemy.alert) continue;
      if (dist < 1.1 && lineOfSight(enemy.x, enemy.y, player.x, player.y)) {
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = 1.25;
          player.hp = Math.max(0, player.hp - 9);
          state.hurt = .65;
          state.shake = .35;
          audio?.hit();
          updateHud();
          if (player.hp <= 0) finish(false);
        }
        continue;
      }
      if (dist > 15) continue;
      enemy.pathTimer -= dt;
      if (enemy.pathTimer <= 0) {
        enemy.path = pathToPlayer(enemy.x, enemy.y);
        enemy.pathTimer = .5 + Math.random() * .15;
      }
      let target = enemy.path[0] || player;
      if (enemy.path.length && distance(enemy, target) < .22) {
        enemy.path.shift();
        target = enemy.path[0] || player;
      }
      const direction = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      const speed = .77 + (1 - Math.min(1, dist / 10)) * .14;
      moveEntity(enemy, Math.cos(direction) * speed * dt, Math.sin(direction) * speed * dt, .25);
    }
  }

  function updatePickups() {
    const player = state.player;
    for (const pickup of state.pickups) {
      if (!pickup.active || distance(player, pickup) > .58) continue;
      if (pickup.kind === 'health') {
        if (player.hp >= 100) continue;
        player.hp = Math.min(100, player.hp + 35);
        showMessage('MEDKIT +35');
      } else {
        player.reserve = Math.min(99, player.reserve + 18);
        showMessage('SHELLS +18');
      }
      pickup.active = false;
      audio?.pickup();
      updateHud();
    }
    if (distance(player, state.exit) < .85) {
      if (player.kills === TOTAL_ENEMIES) finish(true);
      else if (state.messageTimer <= .2) showMessage('CLEAR HOSTILES TO EXTRACT', 1.1);
    }
  }

  function update(dt) {
    state.elapsed += dt;
    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    state.recoil = Math.max(0, state.recoil - dt * 3.8);
    state.muzzle = Math.max(0, state.muzzle - dt);
    state.hurt = Math.max(0, state.hurt - dt);
    state.shake = Math.max(0, state.shake - dt);
    state.noiseTimer = Math.max(0, state.noiseTimer - dt);
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (state.reloadTimer > 0) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        const amount = Math.min(12 - state.player.mag, state.player.reserve);
        state.player.mag += amount;
        state.player.reserve -= amount;
        state.reloadTimer = 0;
        updateHud();
      }
    }

    const p = state.player;
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - controls.moveY;
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + controls.moveX;
    const magnitude = Math.hypot(forward, strafe);
    if (magnitude > .06) {
      const norm = Math.max(1, magnitude);
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.35 : 2.55;
      const dx = (Math.cos(p.angle) * forward - Math.sin(p.angle) * strafe) / norm * speed * dt;
      const dy = (Math.sin(p.angle) * forward + Math.cos(p.angle) * strafe) / norm * speed * dt;
      const ox = p.x, oy = p.y;
      moveEntity(p, dx, dy, .22);
      const moved = Math.hypot(p.x - ox, p.y - oy);
      state.walkTime += moved * 11;
      state.stepDistance += moved;
      if (state.stepDistance > .75) {
        state.stepDistance = 0;
        audio?.step();
      }
    }
    const turn = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0) + controls.lookX;
    p.angle += turn * 2.25 * dt;
    p.pitch = Math.max(-.42, Math.min(.42, p.pitch - controls.lookY * .8 * dt));
    if (controls.firing || keys.has('Space')) fire();
    updateEnemies(dt);
    if (state.mode === 'playing') updatePickups();
  }

  function showMessage(message, seconds = 1.7) {
    state.message = message;
    state.messageTimer = seconds;
  }

  function fire() {
    if (state.mode !== 'playing' || state.fireCooldown > 0 || state.reloadTimer > 0) return;
    if (state.player.mag <= 0) {
      reload();
      return;
    }
    state.player.mag--;
    state.fireCooldown = .29;
    state.recoil = .3;
    state.muzzle = .09;
    state.shake = .08;
    state.noiseTimer = 1.5;
    audio?.fire();
    let target = null;
    let nearest = Infinity;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dist = distance(state.player, enemy);
      const angle = Math.atan2(enemy.y - state.player.y, enemy.x - state.player.x);
      if (Math.abs(angleDifference(angle, state.player.angle)) > Math.atan2(.29, dist) + .018) continue;
      if (dist >= nearest || !lineOfSight(state.player.x, state.player.y, enemy.x, enemy.y)) continue;
      nearest = dist;
      target = enemy;
    }
    if (target) {
      target.hp -= 42;
      target.hitFlash = .14;
      target.alert = true;
      target.pathTimer = 0;
      if (target.hp <= 0) {
        target.alive = false;
        state.player.kills++;
        audio?.enemyDeath();
        showMessage(state.player.kills === TOTAL_ENEMIES ? 'EXTRACTION UNLOCKED' : 'HOSTILE DOWN');
      } else {
        audio?.enemyHit();
        showMessage('DIRECT HIT', .5);
      }
    }
    updateHud();
  }

  function reload() {
    if (state.mode !== 'playing' || state.reloadTimer > 0 || state.player.mag === 12 || state.player.reserve <= 0) return;
    state.reloadTimer = 1.15;
    audio?.reload();
    showMessage('RELOADING', 1.1);
  }

  function finish(won) {
    if (state.mode !== 'playing') return;
    state.mode = 'ended';
    controls.firing = false;
    ui.endTitle.textContent = won ? 'EXTRACTION COMPLETE' : 'YOU FELL';
    ui.endMessage.textContent = won
      ? `All ${TOTAL_ENEMIES} hostiles cleared in ${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}. The facility is yours.`
      : `${state.player.kills} of ${TOTAL_ENEMIES} hostiles cleared. Regroup and try again.`;
    ui.endScreen.hidden = false;
    won ? audio?.win() : audio?.lose();
  }

  function updateHud() {
    ui.healthValue.textContent = String(state.player.hp);
    ui.ammoValue.textContent = `${state.player.mag} / ${state.player.reserve}`;
    ui.killsValue.textContent = `${state.player.kills} / ${TOTAL_ENEMIES}`;
    ui.objectiveText.textContent = state.player.kills === TOTAL_ENEMIES ? 'REACH THE GATE' : 'CLEAR HOSTILES';
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.min(720, Math.round(box.width * .78)));
    const height = Math.max(220, Math.round(width * box.height / Math.max(1, box.width)));
    if (width === screenWidth && height === screenHeight) return;
    screenWidth = width;
    screenHeight = height;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;
    depthBuffer = new Float32Array(Math.ceil(width / RAY_STEP));
  }

  function renderBackground(horizon) {
    const w = screenWidth, h = screenHeight;
    const ceiling = ctx.createLinearGradient(0, 0, 0, horizon);
    ceiling.addColorStop(0, '#160f1a');
    ceiling.addColorStop(.7, '#342029');
    ceiling.addColorStop(1, '#674039');
    ctx.fillStyle = ceiling;
    ctx.fillRect(0, 0, w, Math.max(0, horizon));
    const floor = ctx.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, '#52403a');
    floor.addColorStop(.34, '#302a2c');
    floor.addColorStop(1, '#171920');
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, w, h - horizon);
    const floorHeight = h - horizon;
    ctx.lineWidth = 1;
    for (const d of [2, 3, 4, 6, 9, 14]) {
      const y = horizon + h * .48 / d;
      if (y >= h) continue;
      ctx.strokeStyle = `rgba(223,130,87,${Math.max(.025, .16 / d)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (floorHeight > 0) {
      ctx.fillStyle = 'rgba(205,78,46,.035)';
      for (let i = 0; i < 15; i++) {
        const x = ((i * 139 + 37) % w);
        const y = horizon + ((i * 83 + 41) % floorHeight);
        ctx.fillRect(x, y, 3, 1);
      }
    }
  }

  function castWalls(horizon) {
    const p = state.player;
    const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    const planeX = -dirY * HALF_FOV_TAN, planeY = dirX * HALF_FOV_TAN;
    const w = screenWidth, h = screenHeight;
    for (let x = 0; x < w; x += RAY_STEP) {
      const cameraX = 2 * (x + .5) / w - 1;
      const rayX = dirX + planeX * cameraX;
      const rayY = dirY + planeY * cameraX;
      let mapX = Math.floor(p.x), mapY = Math.floor(p.y);
      const deltaX = Math.abs(1 / (rayX || .00001));
      const deltaY = Math.abs(1 / (rayY || .00001));
      const stepX = rayX < 0 ? -1 : 1;
      const stepY = rayY < 0 ? -1 : 1;
      let sideX = (rayX < 0 ? p.x - mapX : mapX + 1 - p.x) * deltaX;
      let sideY = (rayY < 0 ? p.y - mapY : mapY + 1 - p.y) * deltaY;
      let side = 0;
      let type = 0;
      for (let n = 0; n < 60; n++) {
        if (sideX < sideY) {
          sideX += deltaX; mapX += stepX; side = 0;
        } else {
          sideY += deltaY; mapY += stepY; side = 1;
        }
        type = mapX < 0 || mapY < 0 || mapX >= SIZE || mapY >= SIZE ? 1 : world[mapY][mapX];
        if (type) break;
      }
      const distanceToWall = Math.max(.08, side === 0 ? sideX - deltaX : sideY - deltaY);
      depthBuffer[Math.floor(x / RAY_STEP)] = distanceToWall;
      if (distanceToWall > MAX_DISTANCE) continue;
      const lineHeight = h / distanceToWall;
      const top = horizon - lineHeight * .5;
      let wallX = side === 0 ? p.y + distanceToWall * rayY : p.x + distanceToWall * rayX;
      wallX -= Math.floor(wallX);
      let texX = Math.floor(wallX * 64);
      if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = 63 - texX;
      ctx.drawImage(wallTextures[type] || wallTextures[1], texX, 0, 1, 64, x, top, RAY_STEP + 1, lineHeight);
      const darkness = Math.min(.78, distanceToWall * .037 + (side ? .16 : 0));
      ctx.fillStyle = `rgba(9,10,17,${darkness})`;
      ctx.fillRect(x, top, RAY_STEP + 1, lineHeight);
      if (type === 3 && distanceToWall < 9) {
        ctx.fillStyle = `rgba(252,75,36,${.08 * (1 - distanceToWall / 9)})`;
        ctx.fillRect(x, top, RAY_STEP + 1, lineHeight);
      }
    }
    return { dirX, dirY, planeX, planeY };
  }

  function renderSprites(camera, horizon) {
    const p = state.player;
    const items = [];
    for (const enemy of state.enemies) {
      if (enemy.alive) items.push({ x: enemy.x, y: enemy.y, image: sprites.enemy, scale: .98, lift: 0, enemy });
    }
    for (const pickup of state.pickups) {
      if (pickup.active) items.push({ x: pickup.x, y: pickup.y, image: sprites[pickup.kind], scale: .42, lift: -.1, pickup });
    }
    items.push({ x: state.exit.x, y: state.exit.y, image: p.kills === TOTAL_ENEMIES ? sprites.exitOpen : sprites.exitLocked, scale: 1.2, lift: 0, exit: true });
    items.sort((a, b) => distance(p, b) - distance(p, a));
    const determinant = camera.planeX * camera.dirY - camera.dirX * camera.planeY;
    const w = screenWidth, h = screenHeight;
    for (const item of items) {
      const dx = item.x - p.x, dy = item.y - p.y;
      const transformX = (camera.dirY * dx - camera.dirX * dy) / determinant;
      const transformY = (-camera.planeY * dx + camera.planeX * dy) / determinant;
      if (transformY <= .15 || transformY > MAX_DISTANCE) continue;
      const centreX = Math.floor(w * .5 * (1 + transformX / transformY));
      const bob = item.pickup ? Math.sin(state.elapsed * 3 + item.x) * 2.5 : item.enemy ? Math.sin(state.elapsed * 4 + item.enemy.phase) * 1.5 : 0;
      const height = Math.abs(h / transformY) * item.scale;
      const width = height * item.image.width / item.image.height;
      const startY = horizon + h / (2 * transformY) - height + item.lift * height + bob;
      const startX = centreX - width / 2;
      const left = Math.max(0, Math.floor(startX / RAY_STEP) * RAY_STEP);
      const right = Math.min(w, Math.ceil((startX + width) / RAY_STEP) * RAY_STEP);
      if (left >= right) continue;
      for (let x = left; x < right; x += RAY_STEP) {
        if (transformY >= depthBuffer[Math.floor(x / RAY_STEP)]) continue;
        const sourceX = Math.floor((x - startX) / width * item.image.width);
        if (sourceX < 0 || sourceX >= item.image.width) continue;
        ctx.drawImage(item.image, sourceX, 0, 1, item.image.height, x, startY, RAY_STEP + 1, height);
        if (item.enemy?.hitFlash > 0) {
          ctx.fillStyle = `rgba(255,218,155,${item.enemy.hitFlash * 3})`;
          ctx.fillRect(x, startY, RAY_STEP + 1, height);
        }
      }
    }
  }

  function renderWeapon() {
    const w = screenWidth, h = screenHeight;
    const scale = Math.min(w / 480, h / 260) * (w < h ? .9 : 1);
    const bob = state.mode === 'playing' ? Math.sin(state.walkTime) * 2.5 * scale : 0;
    const recoil = state.recoil * 34 * scale;
    const cx = w / 2 + (state.shake > 0 ? Math.sin(state.elapsed * 170) * state.shake * 5 : 0);
    const baseY = h + 9 * scale + bob + recoil;
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(scale, scale);
    polygon(ctx, '#161821', [-68, 0, -52, -41, -35, -48, -18, -30, 18, -30, 35, -48, 52, -41, 68, 0]);
    polygon(ctx, '#805342', [-64, 0, -53, -31, -39, -33, -30, -10, -16, 0]);
    polygon(ctx, '#805342', [64, 0, 53, -31, 39, -33, 30, -10, 16, 0]);
    polygon(ctx, '#363c49', [-32, -3, -27, -68, -18, -86, 18, -86, 27, -68, 32, -3]);
    polygon(ctx, '#59606a', [-22, -45, -17, -78, 17, -78, 22, -45]);
    polygon(ctx, '#171a24', [-16, -92, -12, -107, 12, -107, 16, -92, 12, -61, -12, -61]);
    ctx.fillStyle = '#0a0e15'; ctx.fillRect(-12, -106, 24, 12);
    ctx.fillStyle = '#9c6451'; ctx.fillRect(-16, -79, 3, 31);
    ctx.fillStyle = '#9c6451'; ctx.fillRect(13, -79, 3, 31);
    ctx.fillStyle = state.reloadTimer > 0 ? '#e79d53' : '#d95838';
    ctx.fillRect(-5, -42, 10, 4);
    ctx.fillStyle = '#151820'; ctx.fillRect(-26, -16, 52, 19);
    ctx.strokeStyle = '#6a6d73'; ctx.lineWidth = 2; ctx.strokeRect(-25, -15, 50, 16);
    if (state.muzzle > 0) {
      ctx.globalAlpha = Math.min(1, state.muzzle * 11);
      ctx.shadowColor = '#ffab45'; ctx.shadowBlur = 23;
      polygon(ctx, '#ffe8a3', [0, -115, -22, -143, -8, -147, -15, -178, 0, -160, 13, -181, 9, -146, 25, -139]);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function renderMinimap() {
    const w = screenWidth, h = screenHeight;
    const cell = w < h ? 3.45 : 3.55;
    const size = cell * SIZE;
    const x0 = w - size - 13;
    const y0 = 15;
    ctx.fillStyle = 'rgba(9,12,20,.72)';
    ctx.fillRect(x0 - 5, y0 - 5, size + 10, size + 10);
    ctx.strokeStyle = 'rgba(238,122,80,.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 5, y0 - 5, size + 10, size + 10);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (!world[y][x]) continue;
        ctx.fillStyle = world[y][x] === 3 ? '#a85840' : '#53606b';
        ctx.fillRect(x0 + x * cell, y0 + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.fillStyle = state.player.kills === TOTAL_ENEMIES ? '#6ff0bd' : '#d35b53';
    ctx.fillRect(x0 + state.exit.x * cell - 2, y0 + state.exit.y * cell - 2, 4, 4);
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      ctx.fillStyle = '#f47b58';
      ctx.fillRect(x0 + enemy.x * cell - 1, y0 + enemy.y * cell - 1, 3, 3);
    }
    const px = x0 + state.player.x * cell, py = y0 + state.player.y * cell;
    ctx.fillStyle = '#f6e8c0';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f6e8c0'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(state.player.angle) * 8, py + Math.sin(state.player.angle) * 8);
    ctx.stroke();
  }

  function render() {
    const p = state.player;
    const bob = state.mode === 'playing' ? Math.sin(state.walkTime) * 1.4 : 0;
    const horizon = screenHeight * (.5 + p.pitch * .32) + bob;
    ctx.save();
    if (state.shake > 0) ctx.translate(Math.sin(state.elapsed * 130) * state.shake * 3, Math.cos(state.elapsed * 157) * state.shake * 3);
    renderBackground(horizon);
    const camera = castWalls(horizon);
    renderSprites(camera, horizon);
    renderWeapon();
    ctx.restore();
    renderMinimap();
    ui.crosshair.style.top = `${Math.max(0, Math.min(100, horizon / screenHeight * 100))}%`;
    if (state.hurt > 0) {
      ctx.fillStyle = `rgba(188,22,37,${state.hurt * .19})`;
      ctx.fillRect(0, 0, screenWidth, screenHeight);
    }
    if (state.messageTimer > 0) {
      const fontSize = Math.max(12, Math.min(20, screenWidth * .03));
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,13,19,.8)';
      const textWidth = ctx.measureText(state.message).width;
      const y = screenHeight * .27;
      ctx.fillRect(screenWidth / 2 - textWidth / 2 - 12, y - fontSize - 7, textWidth + 24, fontSize + 18);
      ctx.fillStyle = '#ffe4b8';
      ctx.fillText(state.message, screenWidth / 2, y);
    }
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(.05, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    if (state.mode === 'playing') update(dt);
    render();
    frameHandle = requestAnimationFrame(frame);
  }

  function start() {
    world = makeWorld();
    state = newState();
    state.mode = 'playing';
    controls.firing = false;
    ui.startScreen.hidden = true;
    ui.pauseScreen.hidden = true;
    ui.endScreen.hidden = true;
    updateHud();
    audio?.init();
  }

  function pause() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    controls.firing = false;
    ui.pauseScreen.hidden = false;
  }

  function resume() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    ui.pauseScreen.hidden = true;
    audio?.resume();
  }

  function bindStick(stick, knob, xKey, yKey) {
    if (!stick || !knob) return;
    let activePointer = null;
    function change(event) {
      const box = stick.getBoundingClientRect();
      const radius = Math.max(1, Math.min(box.width, box.height) * .36);
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const length = Math.hypot(dx, dy);
      const factor = length > radius ? radius / length : 1;
      const x = dx * factor, y = dy * factor;
      controls[xKey] = x / radius;
      controls[yKey] = y / radius;
      knob.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }
    stick.addEventListener('pointerdown', event => {
      if (activePointer !== null) return;
      event.preventDefault();
      activePointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      change(event);
    });
    stick.addEventListener('pointermove', event => {
      if (event.pointerId === activePointer) change(event);
    });
    function release(event) {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      controls[xKey] = controls[yKey] = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    }
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    stick.addEventListener('lostpointercapture', release);
  }

  function bindControls() {
    ui.startButton.addEventListener('click', start);
    ui.restartButton.addEventListener('click', start);
    ui.pauseButton.addEventListener('click', () => state.mode === 'paused' ? resume() : pause());
    ui.resumeButton.addEventListener('click', resume);
    ui.reloadButton.addEventListener('click', reload);
    bindStick(ui.moveStick, ui.moveKnob, 'moveX', 'moveY');
    bindStick(ui.lookStick, ui.lookKnob, 'lookX', 'lookY');
    ui.fireButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      ui.fireButton.setPointerCapture(event.pointerId);
      controls.firing = true;
      fire();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      ui.fireButton.addEventListener(name, () => { controls.firing = false; });
    }
    window.addEventListener('keydown', event => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'KeyR') reload();
      if (event.code === 'Escape' || event.code === 'KeyP') state.mode === 'paused' ? resume() : pause();
      if (event.code === 'Enter' && (state.mode === 'start' || state.mode === 'ended')) start();
    });
    window.addEventListener('keyup', event => keys.delete(event.code));
    window.addEventListener('blur', () => { keys.clear(); controls.firing = false; if (state.mode === 'playing') pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.mode === 'playing') pause();
    });
    canvas.addEventListener('click', event => {
      if (event.pointerType === 'touch' || state.mode !== 'playing') return;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) canvas.requestPointerLock();
      fire();
    });
    document.addEventListener('mousemove', event => {
      if (document.pointerLockElement === canvas && state.mode === 'playing') {
        state.player.angle += event.movementX * .0025;
        state.player.pitch = Math.max(-.42, Math.min(.42, state.player.pitch + event.movementY * .0015));
      }
    });
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
  }

  world = makeWorld();
  state = newState();
  bindControls();
  updateHud();
  resize();
  frameHandle = requestAnimationFrame(frame);
  window.DuskfallDebug = {
    getState: () => ({ mode: state.mode, player: { ...state.player }, enemiesAlive: state.enemies.filter(e => e.alive).length }),
    getMap: () => world.map(row => row.slice())
  };
})();
