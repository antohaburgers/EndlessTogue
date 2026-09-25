(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const TAU = Math.PI * 2;
  const ROAD_WIDTH = 560;
  const SHOULDER_WIDTH = 110;
  const MAX_DT = 1 / 30;
  const DPR_CAP = 2;

  let W = 0;
  let H = 0;
  let DPR = 1;
  let lastTime = 0;
  let running = true;

  const state = {
    mode: 'menu',
    score: 0,
    best: Number(localStorage.getItem('etd_best') || 0),
    maxCombo: 1,
    bestDrift: 0,
    runTime: 0,
    finishTime: 0,
    combo: 1,
    comboBank: 0,
    driftNow: 0,
    driftGrace: 0,
    isDrifting: false,
    shake: 0,
  };

  const input = {
    steerTarget: 0,
    steer: 0,
    throttle: false,
    brake: false,
    handbrake: false,
    pointers: new Map(),
    joyPointer: null,
    joystick: { x: 132, y: 0, r: 68, knob: 0, active: false },
    buttons: {},
  };

  const car = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    yaw: 0,
    steer: 0,
    rearGrip: 1,
    lastRoad: true,
  };

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
  };

  const route = buildRoute();
  const scenery = buildScenery();
  const particles = [];
  const skidmarks = [];
  const audio = createAudio();

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = Math.max(1, Math.floor(window.innerWidth));
    H = Math.max(1, Math.floor(window.innerHeight));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    placeControls();
  }

  function placeControls() {
    input.joystick.y = H - 108;
    const base = Math.min(W, H);
    const gasR = Math.max(48, Math.min(68, base * 0.12));
    const smallR = gasR * 0.76;
    input.buttons = {
      gas: { x: W - gasR - 28, y: H - gasR - 32, r: gasR, label: 'ГАЗ' },
      brake: { x: W - gasR * 2.75, y: H - smallR - 42, r: smallR, label: 'ТОРМОЗ' },
      handbrake: { x: W - gasR * 1.55, y: H - gasR * 2.65, r: smallR, label: 'РУЧНИК' },
    };
  }

  function buildRoute() {
    const controls = [
      { x: 0, y: 0 },
      { x: 140, y: 420 },
      { x: -380, y: 900 },
      { x: 360, y: 1390 },
      { x: 460, y: 1850 },
      { x: -520, y: 2280 },
      { x: -560, y: 2760 },
      { x: 500, y: 3240 },
      { x: -170, y: 3690 },
      { x: 650, y: 4200 },
      { x: 260, y: 4690 },
      { x: -650, y: 5200 },
      { x: -180, y: 5700 },
      { x: 580, y: 6150 },
      { x: 40, y: 6700 },
      { x: -560, y: 7190 },
      { x: 520, y: 7770 },
      { x: 120, y: 8350 },
    ];

    const points = [];
    for (let i = 0; i < controls.length - 1; i++) {
      const p0 = controls[Math.max(0, i - 1)];
      const p1 = controls[i];
      const p2 = controls[i + 1];
      const p3 = controls[Math.min(controls.length - 1, i + 2)];
      for (let s = 0; s < 28; s++) {
        const t = s / 28;
        points.push(catmull(p0, p1, p2, p3, t));
      }
    }
    points.push(controls[controls.length - 1]);

    let length = 0;
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      if (i > 0) length += dist(points[i], points[i - 1]);
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      points[i].tx = tx / len;
      points[i].ty = ty / len;
      points[i].nx = -points[i].ty;
      points[i].ny = points[i].tx;
      points[i].s = length;
    }

    return {
      controls,
      points,
      start: points[4],
      finish: points[points.length - 10],
      length,
    };
  }

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  function buildScenery() {
    const items = [];
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 8; i < route.points.length - 8; i += 3) {
      const p = route.points[i];
      const sideA = ROAD_WIDTH * 0.64 + 70 + rnd() * 260;
      const sideB = ROAD_WIDTH * 0.64 + 70 + rnd() * 260;
      if (rnd() > 0.12) items.push({ type: 'tree', x: p.x + p.nx * sideA, y: p.y + p.ny * sideA, r: 18 + rnd() * 22 });
      if (rnd() > 0.12) items.push({ type: 'tree', x: p.x - p.nx * sideB, y: p.y - p.ny * sideB, r: 16 + rnd() * 24 });
      if (rnd() > 0.72) items.push({ type: 'rock', x: p.x + p.nx * (sideA + 90), y: p.y + p.ny * (sideA + 90), r: 10 + rnd() * 18 });
      if (rnd() > 0.82) items.push({ type: 'lamp', x: p.x - p.nx * (ROAD_WIDTH * 0.68), y: p.y - p.ny * (ROAD_WIDTH * 0.68), r: 9 });
      if (i % 18 === 0) items.push({ type: 'sign', x: p.x + p.nx * (ROAD_WIDTH * 0.67), y: p.y + p.ny * (ROAD_WIDTH * 0.67), a: Math.atan2(p.ty, p.tx) });
    }
    return items;
  }

  function resetRun() {
    const start = route.start;
    car.x = start.x;
    car.y = start.y;
    car.vx = start.tx * 20;
    car.vy = start.ty * 20;
    car.angle = Math.atan2(start.ty, start.tx);
    car.yaw = 0;
    car.steer = 0;
    car.rearGrip = 1;
    state.mode = 'play';
    state.score = 0;
    state.maxCombo = 1;
    state.bestDrift = 0;
    state.runTime = 0;
    state.finishTime = 0;
    state.combo = 1;
    state.comboBank = 0;
    state.driftNow = 0;
    state.driftGrace = 0;
    state.isDrifting = false;
    state.shake = 0;
    particles.length = 0;
    skidmarks.length = 0;
    camera.x = car.x;
    camera.y = car.y - 320;
    camera.zoom = 0.82;
  }

  function update(dt) {
    input.steer += (input.steerTarget - input.steer) * Math.min(1, dt * 8.5);
    if (state.mode === 'play') {
      state.runTime += dt;
      updateCar(dt);
      updateDrift(dt);
      updateCamera(dt);
      updateParticles(dt);
      audio.update(dt);
      checkFinish();
    } else {
      audio.update(dt);
      updateParticles(dt);
    }
    state.shake = Math.max(0, state.shake - dt * 12);
  }

  function updateCar(dt) {
    const surf = surfaceAt(car.x, car.y);
    car.lastRoad = surf.road;
    const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const right = { x: -fwd.y, y: fwd.x };
    let localX = dot(car.vx, car.vy, right.x, right.y);
    let localY = dot(car.vx, car.vy, fwd.x, fwd.y);
    const speed = Math.hypot(car.vx, car.vy);
    const speedKmh = speed * 3.25;

    const steerLimit = 0.72 - Math.min(0.32, speed * 0.0016);
    car.steer = input.steer * steerLimit;

    const throttle = input.throttle ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const hand = input.handbrake ? 1 : 0;
    const surfaceGrip = surf.grip;
    const gripLoss = Math.min(0.52, Math.abs(localX) / 420 + Math.abs(car.yaw) * 0.09);
    const powerSlide = throttle * Math.max(0, (Math.abs(car.steer) - 0.16)) * Math.min(1, speed / 160) * 0.38;
    const targetRearGrip = clamp(surfaceGrip - hand * 0.72 - powerSlide - gripLoss * 0.28, 0.16, 1.05);
    car.rearGrip += (targetRearGrip - car.rearGrip) * Math.min(1, dt * (hand ? 14 : 4.5));

    const engine = throttle * (360 - Math.min(155, speed * 0.52)) * surf.accel;
    const braking = brake * (localY > 0 ? 520 : 260);
    localY += (engine - braking - localY * 0.14 - Math.sign(localY) * speed * speed * 0.0009) * dt;
    if (!throttle && !brake) localY *= Math.max(0, 1 - dt * 0.18);

    const frontGrip = clamp(surfaceGrip + brake * 0.05 - hand * 0.1, 0.28, 1.12);
    const rearGrip = car.rearGrip;
    const lateralGrip = (frontGrip * 0.48 + rearGrip * 0.52) * (0.86 + Math.min(0.16, speed / 1000));
    const lateralDamp = 3.5 * lateralGrip + (brake ? 0.45 : 0);
    localX -= localX * lateralDamp * dt;

    const steerYaw = car.steer * localY * 0.0065 * frontGrip;
    const slideYaw = localX * 0.0047 * (1.16 - rearGrip);
    car.yaw += (steerYaw + slideYaw - car.yaw * (1.75 + rearGrip * 1.15)) * dt;

    if (!input.handbrake && !input.throttle && Math.abs(input.steer) < 0.08) {
      car.yaw *= Math.max(0, 1 - dt * 2.2);
      localX *= Math.max(0, 1 - dt * 1.1);
    }

    car.angle = normAngle(car.angle + car.yaw * dt);
    const newFwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const newRight = { x: -newFwd.y, y: newFwd.x };
    car.vx = newFwd.x * localY + newRight.x * localX;
    car.vy = newFwd.y * localY + newRight.y * localX;

    const maxSpeed = 52;
    const s2 = Math.hypot(car.vx, car.vy);
    if (s2 > maxSpeed) {
      car.vx *= maxSpeed / s2;
      car.vy *= maxSpeed / s2;
    }

    car.x += car.vx * dt * 3.05;
    car.y += car.vy * dt * 3.05;

    resolveRails(dt);
    makeDrivingParticles(dt, speedKmh, localX, surf);
  }

  function resolveRails() {
    const info = nearestRoute(car.x, car.y);
    const limit = ROAD_WIDTH * 0.5 + 28;
    if (Math.abs(info.offset) <= limit) return;
    const side = Math.sign(info.offset);
    const hitX = info.point.x + info.point.nx * limit * side;
    const hitY = info.point.y + info.point.ny * limit * side;
    car.x = hitX;
    car.y = hitY;
    const n = { x: info.point.nx * side, y: info.point.ny * side };
    const into = dot(car.vx, car.vy, n.x, n.y);
    if (into > 0) {
      car.vx -= n.x * into * 1.45;
      car.vy -= n.y * into * 1.45;
    }
    car.vx *= 0.56;
    car.vy *= 0.56;
    car.yaw += -side * 1.25;
    state.shake = Math.max(state.shake, 8);
    audio.hit();
    for (let i = 0; i < 12; i++) {
      particles.push({
        x: car.x - n.x * 18,
        y: car.y - n.y * 18,
        vx: -n.x * (60 + Math.random() * 170) + (Math.random() - 0.5) * 150,
        vy: -n.y * (60 + Math.random() * 170) + (Math.random() - 0.5) * 150,
        life: 0.35 + Math.random() * 0.35,
        max: 0.7,
        r: 3 + Math.random() * 4,
        color: 'rgba(210,205,186,',
      });
    }
  }

  function makeDrivingParticles(dt, speedKmh, localX, surf) {
    const slip = Math.abs(localX);
    const drifting = slip > 42 && speedKmh > 38 && surf.road;
    const rear = wheelPositions(-24);
    if (drifting) {
      const amount = clamp((slip - 34) / 70, 0, 1.8);
      const count = Math.floor(amount * 4 + Math.random() * amount * 4);
      for (let i = 0; i < count; i++) {
        const w = rear[i % 2];
        particles.push({
          x: w.x + (Math.random() - 0.5) * 12,
          y: w.y + (Math.random() - 0.5) * 12,
          vx: -car.vx * 2 + (Math.random() - 0.5) * 55,
          vy: -car.vy * 2 + (Math.random() - 0.5) * 55,
          life: 0.58 + Math.random() * 0.45,
          max: 1.05,
          r: 10 + Math.random() * 16,
          color: 'rgba(222,222,214,',
        });
      }
      if (Math.random() < 0.75) {
        skidmarks.push({
          x1: rear[0].x,
          y1: rear[0].y,
          x2: rear[1].x,
          y2: rear[1].y,
          life: 2.8,
        });
      }
    }

    if (!surf.road && speedKmh > 22 && Math.random() < dt * 34) {
      particles.push({
        x: car.x + (Math.random() - 0.5) * 42,
        y: car.y + (Math.random() - 0.5) * 52,
        vx: -car.vx * 2.2 + (Math.random() - 0.5) * 90,
        vy: -car.vy * 2.2 + (Math.random() - 0.5) * 90,
        life: 0.45 + Math.random() * 0.25,
        max: 0.7,
        r: 5 + Math.random() * 9,
        color: 'rgba(119,93,54,',
      });
    }

    while (particles.length > 260) particles.shift();
    while (skidmarks.length > 340) skidmarks.shift();
  }

  function updateDrift(dt) {
    const speed = Math.hypot(car.vx, car.vy);
    const speedKmh = speed * 3.25;
    const moveAngle = Math.atan2(car.vy, car.vx);
    const slipAngle = Math.abs(angleDiff(car.angle, moveAngle));
    const surf = surfaceAt(car.x, car.y);
    const drift = speedKmh > 42 && slipAngle > 0.22 && slipAngle < 1.35 && surf.road;

    if (drift) {
      const angleScore = clamp((slipAngle - 0.18) / 0.82, 0, 1.5);
      const speedScore = clamp(speedKmh / 130, 0.25, 1.45);
      const gain = 34 * angleScore * speedScore * state.combo * dt;
      state.score += gain;
      state.comboBank += gain;
      state.driftNow += gain;
      state.bestDrift = Math.max(state.bestDrift, state.driftNow);
      state.driftGrace = 0.9;
      state.isDrifting = true;
      if (state.comboBank > 90 * state.combo) {
        state.combo = Math.min(5, state.combo + 0.2);
        state.comboBank = 0;
      }
      state.maxCombo = Math.max(state.maxCombo, state.combo);
    } else {
      state.driftGrace -= dt;
      if (state.driftGrace <= 0 || speedKmh < 16) {
        state.combo = Math.max(1, state.combo - dt * 0.7);
        if (state.combo < 1.05) state.combo = 1;
        state.comboBank = 0;
        state.driftNow = Math.max(0, state.driftNow - dt * 220);
        state.isDrifting = false;
      }
    }
  }

  function updateCamera(dt) {
    const speed = Math.hypot(car.vx, car.vy);
    const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const look = 230 + Math.min(260, speed * 7);
    const targetX = car.x + fwd.x * look;
    const targetY = car.y + fwd.y * look;
    const follow = 1 - Math.exp(-dt * 4.2);
    camera.x += (targetX - camera.x) * follow;
    camera.y += (targetY - camera.y) * follow;
    const z = 0.88 - Math.min(0.18, speed / 310);
    camera.zoom += (z - camera.zoom) * (1 - Math.exp(-dt * 2.3));
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.8;
      p.vy *= 1 - dt * 1.8;
      p.r += dt * 18;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = skidmarks.length - 1; i >= 0; i--) {
      skidmarks[i].life -= dt * 0.11;
      if (skidmarks[i].life <= 0) skidmarks.splice(i, 1);
    }
  }

  function checkFinish() {
    const finish = route.finish;
    if (dist(car, finish) < 170 || car.y > finish.y + 180) {
      state.mode = 'result';
      state.finishTime = state.runTime;
      state.best = Math.max(state.best, Math.floor(state.score));
      localStorage.setItem('etd_best', String(state.best));
      audio.stopDriving();
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawWorld();
    drawUI();
    if (state.mode === 'menu') drawMenu();
    if (state.mode === 'result') drawResult();
  }

  function drawWorld() {
    ctx.save();
    const shakeX = (Math.random() - 0.5) * state.shake;
    const shakeY = (Math.random() - 0.5) * state.shake;
    ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    drawBackground();
    drawScenery();
    drawRoadLayer();
    drawSkids();
    drawParticles();
    drawFinish();
    if (state.mode !== 'menu') drawCar();

    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = '#0b1510';
    ctx.fillRect(camera.x - W / camera.zoom, camera.y - H / camera.zoom, W * 2 / camera.zoom, H * 2 / camera.zoom);
    ctx.strokeStyle = 'rgba(38,70,45,0.55)';
    ctx.lineWidth = 28;
    for (let i = 0; i < route.points.length - 8; i += 12) {
      const p = route.points[i];
      ctx.beginPath();
      ctx.moveTo(p.x - p.nx * 900, p.y - p.ny * 900);
      ctx.lineTo(p.x - p.nx * 590, p.y - p.ny * 590);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x + p.nx * 620, p.y + p.ny * 620);
      ctx.lineTo(p.x + p.nx * 980, p.y + p.ny * 980);
      ctx.stroke();
    }
  }

  function drawRoadLayer() {
    drawPath(ROAD_WIDTH + SHOULDER_WIDTH * 2, '#263323', 'round');
    drawPath(ROAD_WIDTH + 42, '#738071', 'round');
    drawPath(ROAD_WIDTH, '#252927', 'round');
    drawPath(ROAD_WIDTH - 16, '#303432', 'round');

    drawOffsetLine(ROAD_WIDTH * 0.5 - 28, '#ece8d9', 7, []);
    drawOffsetLine(-ROAD_WIDTH * 0.5 + 28, '#ece8d9', 7, []);
    drawOffsetLine(0, 'rgba(238,224,145,0.75)', 5, [34, 34]);
    drawOffsetLine(ROAD_WIDTH * 0.5 + 22, '#b24a3d', 8, [32, 26]);
    drawOffsetLine(-ROAD_WIDTH * 0.5 - 22, '#b24a3d', 8, [32, 26]);
  }

  function drawPath(width, color, cap) {
    ctx.beginPath();
    for (let i = 0; i < route.points.length; i++) {
      const p = route.points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function drawOffsetLine(offset, color, width, dash) {
    ctx.beginPath();
    for (let i = 0; i < route.points.length; i++) {
      const p = route.points[i];
      const x = p.x + p.nx * offset;
      const y = p.y + p.ny * offset;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function drawScenery() {
    for (const item of scenery) {
      if (Math.abs(item.x - camera.x) > W / camera.zoom * 0.75 + 260 || Math.abs(item.y - camera.y) > H / camera.zoom * 0.75 + 260) continue;
      if (item.type === 'tree') {
        ctx.fillStyle = '#102818';
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r * 1.15, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#193f25';
        ctx.beginPath();
        ctx.arc(item.x - item.r * 0.25, item.y - item.r * 0.2, item.r * 0.75, 0, TAU);
        ctx.arc(item.x + item.r * 0.28, item.y + item.r * 0.1, item.r * 0.68, 0, TAU);
        ctx.fill();
      } else if (item.type === 'rock') {
        ctx.fillStyle = '#4b5149';
        roundedRect(item.x - item.r, item.y - item.r * 0.7, item.r * 2, item.r * 1.4, 6);
      } else if (item.type === 'lamp') {
        ctx.strokeStyle = '#343b35';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y);
        ctx.lineTo(item.x, item.y - 38);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,225,143,0.5)';
        ctx.beginPath();
        ctx.arc(item.x, item.y - 42, 10, 0, TAU);
        ctx.fill();
      } else if (item.type === 'sign') {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.a);
        ctx.fillStyle = '#d9d3bf';
        roundedRect(-20, -16, 40, 32, 4);
        ctx.fillStyle = '#b7483b';
        ctx.fillRect(-14, -4, 28, 8);
        ctx.restore();
      }
    }
  }

  function drawFinish() {
    const f = route.finish;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.atan2(f.ty, f.tx) + Math.PI / 2);
    for (let i = -5; i <= 4; i++) {
      for (let j = -1; j <= 0; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#f4f2e9' : '#1e2220';
        ctx.fillRect(i * 32, j * 28, 32, 28);
      }
    }
    ctx.restore();
  }

  function drawSkids() {
    ctx.lineCap = 'round';
    for (const m of skidmarks) {
      ctx.strokeStyle = `rgba(14,15,14,${Math.min(0.28, m.life * 0.12)})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = `${p.color}${a * 0.42})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawCar() {
    const steer = car.steer;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(-54, -25, 108, 50, 18);

    drawWheel(-36, -26, 28, 12, 0);
    drawWheel(-36, 26, 28, 12, 0);
    drawWheel(36, -26, 28, 12, steer);
    drawWheel(36, 26, 28, 12, steer);

    ctx.fillStyle = '#d5483b';
    roundedRect(-55, -23, 110, 46, 14);
    ctx.fillStyle = '#b8322c';
    roundedRect(-49, -19, 29, 38, 8);
    ctx.fillStyle = '#e96b55';
    roundedRect(19, -18, 30, 36, 9);
    ctx.fillStyle = '#263139';
    roundedRect(-16, -18, 34, 36, 7);
    ctx.fillStyle = '#192229';
    roundedRect(2, -16, 14, 32, 4);
    ctx.fillStyle = '#f1e8c9';
    ctx.fillRect(48, -12, 5, 9);
    ctx.fillRect(48, 3, 5, 9);
    ctx.fillStyle = '#451313';
    ctx.fillRect(-53, -13, 5, 9);
    ctx.fillRect(-53, 4, 5, 9);

    ctx.restore();
  }

  function drawWheel(x, y, w, h, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#111';
    roundedRect(-w / 2, -h / 2, w, h, 4);
    ctx.restore();
  }

  function drawUI() {
    if (state.mode === 'play') {
      const speed = Math.round(Math.hypot(car.vx, car.vy) * 3.25);
      uiText(`${speed} км/ч`, 24, 28, 22, 'left');
      uiText(`${Math.floor(state.score)} DP`, W * 0.36, 28, 22, 'left');
      uiText(`x${state.combo.toFixed(1)}`, W * 0.62, 28, 22, 'left');
      uiText(formatTime(state.runTime), W - 28, 28, 22, 'right');
      if (state.isDrifting || state.driftGrace > 0) {
        uiText('DRIFT', W / 2, 78, 26, 'center', '#f4d35e');
        uiText(`${Math.floor(state.driftNow)}`, W / 2, 108, 22, 'center');
      }
    }
    if (state.mode !== 'menu' && state.mode !== 'result') {
      drawControls();
    }
  }

  function drawControls() {
    const j = input.joystick;
    ctx.save();
    ctx.globalAlpha = 0.76;
    ctx.strokeStyle = '#f4f2e9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(j.x, j.y, j.r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,242,233,0.14)';
    ctx.beginPath();
    ctx.arc(j.x, j.y, j.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(244,242,233,0.45)';
    ctx.beginPath();
    ctx.arc(j.x + input.steerTarget * j.r * 0.78, j.y, 26, 0, TAU);
    ctx.fill();

    drawButton(input.buttons.brake, input.brake);
    drawButton(input.buttons.handbrake, input.handbrake);
    drawButton(input.buttons.gas, input.throttle);
    ctx.restore();
  }

  function drawButton(b, active) {
    ctx.fillStyle = active ? 'rgba(244,211,94,0.52)' : 'rgba(244,242,233,0.14)';
    ctx.strokeStyle = active ? '#f4d35e' : '#f4f2e9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4f2e9';
    ctx.font = `800 ${Math.max(12, b.r * 0.26)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x, b.y);
  }

  function drawMenu() {
    overlay();
    titleText('ENDLESS TOUGE DRIFT', W / 2, H * 0.32, Math.min(42, W * 0.06));
    uiText(`BEST: ${state.best} DP`, W / 2, H * 0.43, 21, 'center', '#d8d1bc');
    menuButton(W / 2, H * 0.58, 210, 62, 'START');
    uiText('Одна машина. Одна гора. Едем боком.', W / 2, H * 0.75, 18, 'center', '#d8d1bc');
  }

  function drawResult() {
    overlay();
    titleText('FINISH', W / 2, H * 0.2, 42);
    const rows = [
      ['TIME', formatTime(state.finishTime)],
      ['DRIFT POINTS', String(Math.floor(state.score))],
      ['MAX COMBO', `x${state.maxCombo.toFixed(1)}`],
      ['BEST DRIFT', String(Math.floor(state.bestDrift))],
      ['BEST SESSION', String(state.best)],
    ];
    let y = H * 0.32;
    for (const [a, b] of rows) {
      uiText(a, W / 2 - 115, y, 18, 'right', '#d8d1bc');
      uiText(b, W / 2 + 40, y, 20, 'left');
      y += 34;
    }
    menuButton(W / 2 - 120, H * 0.78, 190, 56, 'ЕЩЁ РАЗ');
    menuButton(W / 2 + 120, H * 0.78, 160, 56, 'МЕНЮ');
  }

  function overlay() {
    ctx.fillStyle = 'rgba(7,14,10,0.78)';
    ctx.fillRect(0, 0, W, H);
  }

  function titleText(text, x, y, size) {
    ctx.fillStyle = '#f4f2e9';
    ctx.font = `900 ${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function menuButton(x, y, w, h, label) {
    ctx.fillStyle = 'rgba(244,211,94,0.14)';
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 3;
    roundedRect(x - w / 2, y - h / 2, w, h, 12, true);
    ctx.fillStyle = '#f4f2e9';
    ctx.font = '900 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }

  function uiText(text, x, y, size, align, color = '#f4f2e9') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.font = `900 ${size}px Arial`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function roundedRect(x, y, w, h, r, strokeOnly = false) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    if (strokeOnly) ctx.stroke();
    else ctx.fill();
  }

  function surfaceAt(x, y) {
    const info = nearestRoute(x, y);
    const d = Math.abs(info.offset);
    if (d < ROAD_WIDTH * 0.5) return { road: true, shoulder: false, grip: 1, accel: 1, info };
    if (d < ROAD_WIDTH * 0.5 + SHOULDER_WIDTH) return { road: false, shoulder: true, grip: 0.62, accel: 0.72, info };
    return { road: false, shoulder: false, grip: 0.36, accel: 0.45, info };
  }

  function nearestRoute(x, y) {
    let best = route.points[0];
    let bestD = Infinity;
    let bestOffset = 0;
    const approx = route.points.reduce((acc, p, i) => {
      const d = Math.abs(p.y - y) + Math.abs(p.x - x) * 0.5;
      return d < acc.d ? { i, d } : acc;
    }, { i: 0, d: Infinity }).i;
    const from = Math.max(0, approx - 24);
    const to = Math.min(route.points.length - 1, approx + 24);
    for (let i = from; i <= to; i++) {
      const p = route.points[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
        bestOffset = dx * p.nx + dy * p.ny;
      }
    }
    return { point: best, dist: Math.sqrt(bestD), offset: bestOffset };
  }

  function wheelPositions(backX) {
    const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const right = { x: -fwd.y, y: fwd.x };
    return [
      { x: car.x + fwd.x * backX - right.x * 26, y: car.y + fwd.y * backX - right.y * 26 },
      { x: car.x + fwd.x * backX + right.x * 26, y: car.y + fwd.y * backX + right.y * 26 },
    ];
  }

  function handlePointerDown(e) {
    e.preventDefault();
    const p = pointerPos(e);
    const role = pickRole(p.x, p.y);
    input.pointers.set(e.pointerId, role);
    if (role.type === 'menu') {
      audio.start();
      if (state.mode === 'menu') resetRun();
      else if (state.mode === 'result' && role.action === 'restart') resetRun();
      else if (state.mode === 'result' && role.action === 'menu') state.mode = 'menu';
      audio.click();
    } else if (role.type === 'joy') {
      input.joyPointer = e.pointerId;
      input.joystick.active = true;
      updateJoy(p.x);
    } else if (role.type === 'button') {
      setButton(role.name, true);
    }
  }

  function handlePointerMove(e) {
    const role = input.pointers.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    const p = pointerPos(e);
    if (role.type === 'joy') updateJoy(p.x);
  }

  function handlePointerUp(e) {
    const role = input.pointers.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    if (role.type === 'joy') {
      input.joyPointer = null;
      input.joystick.active = false;
      input.steerTarget = 0;
    } else if (role.type === 'button') {
      setButton(role.name, false);
    }
    input.pointers.delete(e.pointerId);
  }

  function pickRole(x, y) {
    if (state.mode === 'menu') {
      if (rectHit(x, y, W / 2, H * 0.58, 210, 62)) return { type: 'menu', action: 'start' };
      return { type: 'none' };
    }
    if (state.mode === 'result') {
      if (rectHit(x, y, W / 2 - 120, H * 0.78, 190, 56)) return { type: 'menu', action: 'restart' };
      if (rectHit(x, y, W / 2 + 120, H * 0.78, 160, 56)) return { type: 'menu', action: 'menu' };
      return { type: 'none' };
    }
    for (const name of ['gas', 'brake', 'handbrake']) {
      const b = input.buttons[name];
      if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.2) return { type: 'button', name };
    }
    if (x < W * 0.5 && y > H * 0.38 && input.joyPointer === null) return { type: 'joy' };
    return { type: 'none' };
  }

  function updateJoy(x) {
    const j = input.joystick;
    input.steerTarget = clamp((x - j.x) / j.r, -1, 1);
  }

  function setButton(name, value) {
    if (name === 'gas') input.throttle = value;
    if (name === 'brake') input.brake = value;
    if (name === 'handbrake') input.handbrake = value;
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function rectHit(x, y, cx, cy, w, h) {
    return x >= cx - w / 2 && x <= cx + w / 2 && y >= cy - h / 2 && y <= cy + h / 2;
  }

  function createAudio() {
    let ac = null;
    let engine = null;
    let engineGain = null;
    let skid = null;
    let skidGain = null;
    return {
      start() {
        if (ac) return;
        ac = new (window.AudioContext || window.webkitAudioContext)();
        engine = ac.createOscillator();
        engine.type = 'sawtooth';
        engineGain = ac.createGain();
        engineGain.gain.value = 0.035;
        engine.connect(engineGain).connect(ac.destination);
        engine.start();

        skid = ac.createOscillator();
        skid.type = 'triangle';
        skidGain = ac.createGain();
        skidGain.gain.value = 0;
        skid.connect(skidGain).connect(ac.destination);
        skid.start();
      },
      update() {
        if (!ac || !engine) return;
        const speed = Math.hypot(car.vx, car.vy);
        const rev = 70 + speed * 7 + (input.throttle ? 55 : 0);
        engine.frequency.setTargetAtTime(rev, ac.currentTime, 0.06);
        engineGain.gain.setTargetAtTime(state.mode === 'play' ? 0.035 + (input.throttle ? 0.02 : 0) : 0.006, ac.currentTime, 0.08);
        const slip = state.isDrifting ? 0.035 + Math.min(0.055, state.driftNow / 9000) : 0;
        skid.frequency.setTargetAtTime(620 + speed * 5, ac.currentTime, 0.05);
        skidGain.gain.setTargetAtTime(slip, ac.currentTime, 0.05);
      },
      click() {
        blip(420, 0.035, 0.08);
      },
      hit() {
        blip(96, 0.1, 0.12);
      },
      stopDriving() {
        if (!ac || !engineGain) return;
        engineGain.gain.setTargetAtTime(0.01, ac.currentTime, 0.18);
        skidGain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      },
    };

    function blip(freq, gain, time) {
      if (!ac) return;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = freq;
      o.type = 'square';
      g.gain.value = gain;
      o.connect(g).connect(ac.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + time);
      o.stop(ac.currentTime + time + 0.02);
    }
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(MAX_DT, (t - lastTime) / 1000 || 0);
    lastTime = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  function angleDiff(a, b) {
    return normAngle(a - b);
  }

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${ms}`;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', handlePointerUp, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.throttle = false;
      input.brake = false;
      input.handbrake = false;
      input.steerTarget = 0;
      input.pointers.clear();
    }
  });

  resize();
  resetRun();
  state.mode = 'menu';
  requestAnimationFrame(loop);
})();
