(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const view = { w: 0, h: 0, dpr: 1, center: 0 };
  const input = { steer: 0, throttle: false, brake: false, handbrake: false, pointers: new Map(), joyId: null };
  const game = {
    mode: 'menu', distance: 0, time: 0, score: 0, combo: 1, maxCombo: 1,
    driftTime: 0, bestDrift: 0, collisions: 0, shake: 0, best: Number(localStorage.getItem('etd_best') || 0)
  };
  const car = { offset: 0, speed: 0, slide: 0, yaw: 0, lean: 0, roadGrip: 1, offRoad: false };
  const particles = [];
  const objects = [];
  const audio = { ctx: null, osc: null, gain: null };

  const track = {
    width: 330,
    length: 26000,
    points: [],
    centerAt(d) { return sample(this.points, d); }
  };

  function buildTrack() {
    track.points.length = 0;
    let center = 0, bend = 0;
    for (let d = 0; d <= track.length; d += 20) {
      if (d % 900 === 0) bend = (Math.random() - .5) * 0.75;
      center += bend * 20;
      center = clamp(center, -330, 330);
      track.points.push({ d, x: center });
    }
    objects.length = 0;
    for (let d = 550; d < track.length - 300; d += 180 + Math.random() * 260) {
      const side = Math.random() < .5 ? -1 : 1;
      objects.push({ d, side, offset: side * (track.width * .42 + 10 + Math.random() * 50), type: Math.random() < .7 ? 'rock' : 'barrier', hit: false });
    }
  }

  function sample(points, d) {
    const pos = clamp(d, 0, track.length);
    const i = Math.floor(pos / 20);
    const a = points[i] || points[points.length - 1];
    const b = points[i + 1] || a;
    return lerp(a.x, b.x, (pos - a.d) / 20);
  }

  function resize() {
    view.w = innerWidth; view.h = innerHeight; view.dpr = Math.min(devicePixelRatio || 1, 2); view.center = view.w / 2;
    canvas.width = Math.floor(view.w * view.dpr); canvas.height = Math.floor(view.h * view.dpr);
    canvas.style.width = `${view.w}px`; canvas.style.height = `${view.h}px`;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  function reset() {
    game.mode = 'play'; game.distance = 0; game.time = 0; game.score = 0; game.combo = 1; game.maxCombo = 1; game.driftTime = 0; game.bestDrift = 0; game.collisions = 0; game.shake = 0;
    car.offset = 0; car.speed = 0; car.slide = 0; car.yaw = 0; car.lean = 0; car.roadGrip = 1; car.offRoad = false;
    objects.forEach(o => { o.hit = false; }); particles.length = 0; document.body.classList.add('playing'); startAudio();
  }

  function finish(reason) {
    if (game.mode !== 'play') return;
    game.mode = 'result'; game.reason = reason || 'FINISH'; game.best = Math.max(game.best, Math.round(game.score));
    localStorage.setItem('etd_best', game.best); document.body.classList.remove('playing');
  }

  function update(dt) {
    if (game.mode === 'play') {
      game.time += dt;
      updateCar(dt);
      updateObjects(dt);
    }
    updateParticles(dt);
    game.shake = Math.max(0, game.shake - dt * 15);
    updateAudio();
  }

  function updateCar(dt) {
    const steer = input.steer;
    const throttle = input.throttle ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const hand = input.handbrake ? 1 : 0;

    const acceleration = throttle ? 260 : -18;
    car.speed += acceleration * dt;
    if (brake) car.speed -= 230 * dt;
    car.speed = clamp(car.speed, 0, 470);

    const roadCenter = track.centerAt(game.distance + 40);
    const currentCenter = track.centerAt(game.distance);
    const roadMotion = (roadCenter - currentCenter) * .013;
    const edge = track.width * .5 - 34;
    car.offRoad = Math.abs(car.offset - roadMotion * 12) > edge;
    car.roadGrip += ((car.offRoad ? .28 : 1) - car.roadGrip) * dt * 5;

    const slideForce = hand ? 250 : (throttle ? 68 : 15);
    const stabilizer = hand ? 1.1 : 4.8 * car.roadGrip;
    car.slide += (steer * slideForce - car.slide * stabilizer) * dt;
    car.offset += (steer * (90 + car.speed * .24) + car.slide - roadMotion * 85) * dt;
    car.yaw += (steer * car.speed * .0022 + car.slide * .004 - car.yaw * (hand ? 1.1 : 3.2)) * dt;
    car.lean += ((steer * .32 + car.slide * .0015) - car.lean) * dt * 9;

    if (car.offRoad) {
      car.speed = Math.max(65, car.speed - 145 * dt);
      if (Math.random() < dt * 12) spawnParticle('dust');
    }

    const drifting = !car.offRoad && car.speed > 150 && (Math.abs(car.slide) > 19 || hand);
    if (drifting) {
      game.driftTime += dt;
      game.bestDrift = Math.max(game.bestDrift, game.driftTime);
      game.combo = clamp(game.combo + dt * .38, 1, 9.9);
      game.maxCombo = Math.max(game.maxCombo, game.combo);
      game.score += dt * (car.speed * .16 + Math.abs(car.slide) * 1.8) * game.combo;
      if (Math.random() < dt * (4 + Math.abs(car.slide) / 30)) spawnParticle('smoke');
    } else {
      game.driftTime = Math.max(0, game.driftTime - dt * 2.8);
      if (game.driftTime === 0) game.combo = Math.max(1, game.combo - dt * .6);
    }

    const hardLimit = track.width * .66;
    if (Math.abs(car.offset) > hardLimit) {
      car.offset = clamp(car.offset, -hardLimit, hardLimit);
      collide('edge');
    }
    game.distance += car.speed * dt;
    if (game.distance >= track.length) finish('FINISH');
  }

  function updateObjects(dt) {
    objects.forEach(o => {
      if (o.hit || Math.abs(o.d - game.distance) > 75) return;
      const relative = o.offset + track.centerAt(o.d) - track.centerAt(game.distance);
      if (Math.abs(o.d - game.distance) < 28 && Math.abs(car.offset - relative) < 48) { o.hit = true; collide(o.type); }
    });
  }

  function collide(type) {
    game.collisions++;
    car.speed *= type === 'edge' ? .63 : .48;
    car.slide *= -.35; car.offset -= Math.sign(car.offset || 1) * 16; game.combo = Math.max(1, game.combo - .8); game.shake = 10;
    for (let i = 0; i < 12; i++) spawnParticle('impact');
  }

  function spawnParticle(type) {
    if (particles.length > 130) particles.shift();
    particles.push({ type, x: car.offset + (Math.random() - .5) * 28, y: 0, vx: (Math.random() - .5) * 30, life: type === 'impact' ? .4 : .7 + Math.random() * .55, max: type === 'impact' ? .4 : 1, r: type === 'smoke' ? 5 + Math.random() * 8 : 3 + Math.random() * 6 });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; p.y += dt; p.x += p.vx * dt; if (p.life <= 0) particles.splice(i, 1); }
  }

  function screenPoint(relative, depth) {
    const z = clamp(depth / 950, 0, 1);
    const scale = .34 + z * .66;
    return { x: view.center + (relative * scale), y: view.h * .16 + (1 - z) * view.h * .64, scale };
  }

  function draw() {
    ctx.save(); ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
    drawBackground();
    if (game.mode === 'menu') drawMenu();
    else { drawTrack(); drawObjects(); drawParticles(); drawCar(); drawHud(); if (game.mode === 'result') drawResult(); }
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = '#122318'; ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = '#183421'; ctx.fillRect(0, 0, view.w * .18, view.h); ctx.fillRect(view.w * .82, 0, view.w * .18, view.h);
    for (let i = 0; i < 26; i++) { const side = i % 2 ? 1 : -1, x = side > 0 ? view.w * .84 + (i * 29) % (view.w * .14) : view.w * .16 - (i * 29) % (view.w * .14), y = (i * 91 + game.distance * .24) % view.h; ctx.fillStyle = i % 3 ? '#285137' : '#315f3e'; ctx.beginPath(); ctx.arc(x, y, 10 + (i % 4) * 4, 0, TAU); ctx.fill(); }
  }

  function drawTrack() {
    const slices = [];
    for (let i = 0; i <= 22; i++) {
      const d = game.distance + i * 45;
      const center = track.centerAt(d), ahead = track.centerAt(d + 35);
      const p = screenPoint(center - track.centerAt(game.distance), i * 45);
      const half = track.width * (.23 + p.scale * .77) * .5;
      slices.push({ p, half, curve: ahead - center });
    }
    ctx.beginPath(); ctx.moveTo(slices[0].p.x - slices[0].half, slices[0].p.y); slices.forEach(s => ctx.lineTo(s.p.x - s.half, s.p.y)); slices.slice().reverse().forEach(s => ctx.lineTo(s.p.x + s.half, s.p.y)); ctx.closePath(); ctx.fillStyle = '#4b4d4b'; ctx.fill();
    ctx.strokeStyle = '#d9d7c6'; ctx.lineWidth = 5; ctx.beginPath(); slices.forEach((s, i) => i ? ctx.lineTo(s.p.x - s.half, s.p.y) : ctx.moveTo(s.p.x - s.half, s.p.y)); ctx.stroke(); ctx.beginPath(); slices.forEach((s, i) => i ? ctx.lineTo(s.p.x + s.half, s.p.y) : ctx.moveTo(s.p.x + s.half, s.p.y)); ctx.stroke();
    for (let i = 2; i < 21; i += 2) { const a = slices[i], b = slices[Math.min(i + 1, 22)]; ctx.strokeStyle = 'rgba(240,238,215,.78)'; ctx.lineWidth = 4 + a.p.scale * 8; ctx.beginPath(); ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, view.h * .16, view.w * .18, view.h * .84); ctx.fillRect(view.w * .82, view.h * .16, view.w * .18, view.h * .84);
  }

  function drawObjects() {
    objects.forEach(o => { const depth = o.d - game.distance; if (depth < 20 || depth > 950) return; const relative = o.offset + track.centerAt(o.d) - track.centerAt(game.distance); const p = screenPoint(relative, depth); const s = p.scale; ctx.save(); ctx.translate(p.x, p.y); if (o.type === 'rock') { ctx.fillStyle = '#726b59'; ctx.beginPath(); ctx.moveTo(-18 * s, 10 * s); ctx.lineTo(-7 * s, -16 * s); ctx.lineTo(18 * s, -9 * s); ctx.lineTo(24 * s, 10 * s); ctx.closePath(); ctx.fill(); } else { ctx.fillStyle = '#d8b35f'; ctx.fillRect(-24 * s, -18 * s, 48 * s, 28 * s); ctx.fillStyle = '#1f3325'; ctx.fillRect(-18 * s, -12 * s, 36 * s, 5 * s); } ctx.restore(); });
  }

  function drawParticles() { particles.forEach(p => { const a = clamp(p.life / p.max, 0, 1); ctx.globalAlpha = a * .72; ctx.fillStyle = p.type === 'smoke' ? '#e3e7e2' : p.type === 'dust' ? '#a58a67' : '#f4d88b'; ctx.beginPath(); ctx.arc(view.center + p.x, view.h * .77 + p.y * 18, p.r * (1 + (1 - a)), 0, TAU); ctx.fill(); }); ctx.globalAlpha = 1; }

  function drawCar() {
    const x = view.center + car.offset, y = view.h * .75, w = clamp(view.h * .15, 55, 78), h = w * 1.55;
    ctx.save(); ctx.translate(x, y); ctx.rotate(car.lean * .16);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, h * .18, w * .54, h * .62, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#121619'; ctx.beginPath(); ctx.roundRect(-w * .45, -h * .5, w * .9, h, w * .23); ctx.fill();
    ctx.fillStyle = '#bd4936'; ctx.beginPath(); ctx.roundRect(-w * .36, -h * .44, w * .72, h * .88, w * .19); ctx.fill();
    ctx.fillStyle = '#222c31'; ctx.beginPath(); ctx.roundRect(-w * .27, -h * .18, w * .54, h * .32, w * .1); ctx.fill();
    ctx.fillStyle = '#94b3b5'; ctx.fillRect(-w * .21, -h * .12, w * .42, h * .1); ctx.fillStyle = '#e9d7ae'; ctx.fillRect(-w * .27, h * .17, w * .54, h * .08); ctx.fillStyle = '#f7e8b5'; ctx.fillRect(-w * .28, -h * .39, w * .56, h * .05);
    ctx.restore();
  }

  function drawHud() {
    ctx.fillStyle = '#f4f2e9'; ctx.font = '800 14px Arial'; ctx.fillText(`${Math.round(car.speed * .42)} KM/H`, 20, 28); ctx.fillText(`${Math.round(game.score)} PTS`, 20, 49); ctx.textAlign = 'right'; ctx.fillText(`x${game.combo.toFixed(1)}`, view.w - 20, 28); ctx.fillText(`${game.time.toFixed(1)} s`, view.w - 20, 49); ctx.textAlign = 'left';
    if (game.driftTime > .15) { ctx.textAlign = 'center'; ctx.fillStyle = '#f4d278'; ctx.font = '900 24px Arial'; ctx.fillText('DRIFT', view.center, view.h * .31); ctx.font = '800 14px Arial'; ctx.fillText(`+${Math.round(game.driftTime * game.combo * 70)}`, view.center, view.h * .31 + 22); ctx.textAlign = 'left'; }
    drawControls();
  }

  function button(x, y, r, label, active, color) { ctx.fillStyle = active ? (color || '#bd9655') : 'rgba(14,23,18,.78)'; ctx.strokeStyle = active ? '#fff1c6' : '#aead9e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f4f2e9'; ctx.font = `900 ${Math.max(11, r * .25)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  function drawControls() { const r = Math.max(42, Math.min(view.w, view.h) * .105), jx = view.w * .085, jy = view.h - r * 1.2; button(jx, jy, r * 1.2, 'СТИК', input.joyId !== null); ctx.strokeStyle = '#e0d8c3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(jx + input.steer * r * .75, jy, r * .42, 0, TAU); ctx.stroke(); const gx = view.w * .91, gy = view.h - r * 1.1; button(gx, gy, r * 1.15, 'ГАЗ', input.throttle, '#bd4937'); button(gx - r * 1.3, gy - r * .9, r * .7, 'Т', input.brake); button(gx - r * 1.35, gy + r * .55, r * .7, 'Р', input.handbrake); }

  function drawMenu() { ctx.textAlign = 'center'; ctx.fillStyle = '#f4f2e9'; ctx.font = `900 ${Math.min(38, view.w * .045)}px Arial`; ctx.fillText('ENDLESS TOUGE', view.center, view.h * .29); ctx.fillText('ACTION', view.center, view.h * .29 + 43); ctx.fillStyle = '#d1b66c'; ctx.font = '800 14px Arial'; ctx.fillText('SPEED  •  DRIFT  •  SURVIVE', view.center, view.h * .29 + 76); ctx.fillStyle = '#bd4937'; ctx.beginPath(); ctx.roundRect(view.center - 90, view.h * .55, 180, 58, 12); ctx.fill(); ctx.fillStyle = '#fff4dc'; ctx.font = '900 20px Arial'; ctx.fillText('START', view.center, view.h * .55 + 36); ctx.font = '700 13px Arial'; ctx.fillStyle = '#d7d2bf'; ctx.fillText(`BEST ${Math.round(game.best)} PTS`, view.center, view.h * .69); ctx.textAlign = 'left'; }
  function drawResult() { ctx.fillStyle = 'rgba(7,12,9,.88)'; ctx.fillRect(view.w * .25, view.h * .18, view.w * .5, view.h * .64); ctx.textAlign = 'center'; ctx.fillStyle = '#f4f2e9'; ctx.font = '900 25px Arial'; ctx.fillText(game.reason, view.center, view.h * .3); ctx.font = '700 15px Arial'; ctx.fillText(`SCORE  ${Math.round(game.score)}`, view.center, view.h * .4); ctx.fillText(`MAX COMBO  x${game.maxCombo.toFixed(1)}`, view.center, view.h * .45); ctx.fillText(`BEST DRIFT  ${game.bestDrift.toFixed(1)} s`, view.center, view.h * .5); ctx.fillText(`HITS  ${game.collisions}`, view.center, view.h * .55); ctx.fillStyle = '#bd4937'; ctx.fillRect(view.center - 82, view.h * .64, 164, 48); ctx.fillStyle = '#fff4dc'; ctx.font = '900 16px Arial'; ctx.fillText('ЕЩЁ РАЗ', view.center, view.h * .64 + 30); ctx.textAlign = 'left'; }

  function pointerDown(e) { e.preventDefault(); const x = e.clientX, y = e.clientY; input.pointers.set(e.pointerId, { x, y, control: null }); const r = Math.max(42, Math.min(view.w, view.h) * .105), jx = view.w * .085, jy = view.h - r * 1.2, gx = view.w * .91, gy = view.h - r * 1.1;
    if (game.mode === 'menu' && Math.abs(x - view.center) < 150 && y > view.h * .5 && y < view.h * .72) { reset(); return; }
    if (game.mode === 'result') { reset(); return; }
    const pointer = input.pointers.get(e.pointerId);
    if (Math.hypot(x - jx, y - jy) < r * 1.6) { input.joyId = e.pointerId; pointer.control = 'joy'; setSteer(x, jx, r); }
    if (Math.hypot(x - gx, y - gy) < r * 1.5) { input.throttle = true; pointer.control = 'throttle'; }
    if (Math.hypot(x - (gx - r * 1.3), y - (gy - r * .9)) < r * .85) { input.brake = true; pointer.control = 'brake'; }
    if (Math.hypot(x - (gx - r * 1.35), y - (gy + r * .55)) < r * .85) { input.handbrake = true; pointer.control = 'handbrake'; }
  }
  function pointerMove(e) { if (e.pointerId === input.joyId) setSteer(e.clientX, view.w * .085, Math.max(42, Math.min(view.w, view.h) * .105)); }
  function pointerUp(e) { const pointer = input.pointers.get(e.pointerId); input.pointers.delete(e.pointerId); if (e.pointerId === input.joyId) { input.joyId = null; input.steer = 0; } if (pointer) { if (pointer.control === 'throttle') input.throttle = false; if (pointer.control === 'brake') input.brake = false; if (pointer.control === 'handbrake') input.handbrake = false; } }
  function setSteer(x, center, r) { input.steer = clamp((x - center) / (r * .9), -1, 1); }
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(type => canvas.addEventListener(type, type === 'pointerdown' ? pointerDown : type === 'pointermove' ? pointerMove : pointerUp, { passive: false }));
  addEventListener('resize', resize);
  addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'a') input.steer = -1; if (e.key === 'ArrowRight' || e.key === 'd') input.steer = 1; if (e.key === 'ArrowUp' || e.key === 'w') input.throttle = true; if (e.key === 'ArrowDown' || e.key === 's') input.brake = true; if (e.key === ' ') input.handbrake = true; if (e.key === 'Enter' && game.mode !== 'play') reset(); });
  addEventListener('keyup', e => { if (/ArrowLeft|ArrowRight|a|d/.test(e.key)) input.steer = 0; if (/ArrowUp|w/.test(e.key)) input.throttle = false; if (/ArrowDown|s/.test(e.key)) input.brake = false; if (e.key === ' ') input.handbrake = false; });
  function startAudio() { if (!audio.ctx) { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); audio.osc = audio.ctx.createOscillator(); audio.gain = audio.ctx.createGain(); audio.osc.type = 'sawtooth'; audio.gain.gain.value = .016; audio.osc.connect(audio.gain).connect(audio.ctx.destination); audio.osc.start(); } audio.ctx.resume(); }
  function updateAudio() { if (audio.osc) audio.osc.frequency.value = 65 + car.speed * .65; }
  function loop(now) { const dt = Math.min(.034, (now - (loop.last || now)) / 1000); loop.last = now; update(dt); draw(); requestAnimationFrame(loop); }

  resize(); buildTrack(); requestAnimationFrame(loop);
})();
