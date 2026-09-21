const Phaser = window.Phaser;
if (!Phaser) {
  throw new Error('Phaser CDN failed to load');
}

import {
  b2DefaultWorldDef,
  b2Vec2,
  CreateWorld,
  WorldStep
} from 'https://cdn.jsdelivr.net/npm/phaser-box2d@1.1.0/+esm';
import { DriftCar } from './DriftCar.js';
import { RoadGenerator } from './RoadGenerator.js';
import { TouchControls } from './TouchControls.js';

const W = 1280;
const H = 720;
const PX_PER_M = 28;

class TougeScene extends Phaser.Scene {
  constructor() {
    super('TougeScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#102319');

    const worldDef = b2DefaultWorldDef();
    worldDef.gravity = new b2Vec2(0, 0);
    this.physicsWorld = CreateWorld({ worldDef });

    this.road = new RoadGenerator({ width: 8.4, segments: 105 });
    this.road.draw(this, PX_PER_M);

    this.car = new DriftCar(this.physicsWorld.worldId, 0, 14);
    this.carView = this.createCarView();
    this.controls = new TouchControls(this);
    this.createHud();

    this.smoke = [];
    this.petals = [];
    this.smokeTimer = 0;
    this.petalTimer = 0;

    this.cameras.main.startFollow(this.carView, true, 0.075, 0.075);
    this.cameras.main.setZoom(1.05);
    this.cameras.main.setFollowOffset(0, 60);

    // Make mobile landscape the obvious intended orientation.
    if (this.scale.isPortrait) {
      this.orientationText = this.add.text(W / 2, H / 2, 'ПОВЕРНИ ТЕЛЕФОН ГОРИЗОНТАЛЬНО', {
        fontFamily: 'monospace', fontSize: '28px', color: '#ffffff', backgroundColor: '#000000cc', padding: { x: 22, y: 16 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(3000);
    }
    this.scale.on('resize', () => {
      if (this.orientationText) this.orientationText.setVisible(this.scale.isPortrait);
    });
  }

  createCarView() {
    const c = this.add.container(0, 0).setDepth(20);
    const shadow = this.add.rectangle(2, 3, 34, 60, 0x000000, 0.28);
    const body = this.add.rectangle(0, 0, 34, 60, 0xe7e9e5, 1).setStrokeStyle(2, 0x20242a, 1);
    const hood = this.add.rectangle(0, -19, 27, 15, 0xd5d8d7, 1);
    const glass = this.add.rectangle(0, -3, 27, 20, 0x172633, 1);
    const rearGlass = this.add.rectangle(0, 16, 26, 11, 0x23313a, 1);
    const tailL = this.add.rectangle(-11, 27, 8, 4, 0xdb2f35, 1);
    const tailR = this.add.rectangle(11, 27, 8, 4, 0xdb2f35, 1);
    c.add([shadow, body, hood, glass, rearGlass, tailL, tailR]);
    return c;
  }

  createHud() {
    const panel = this.add.rectangle(175, 56, 310, 82, 0x081018, 0.72)
      .setStrokeStyle(2, 0x8d98a8, 0.38).setScrollFactor(0).setDepth(1000);
    this.speedText = this.add.text(36, 22, '0', {
      fontFamily: 'monospace', fontStyle: 'bold', fontSize: '54px', color: '#f4f1e8'
    }).setScrollFactor(0).setDepth(1001);
    this.speedUnit = this.add.text(155, 46, 'km/h', {
      fontFamily: 'monospace', fontSize: '20px', color: '#d2d9de'
    }).setScrollFactor(0).setDepth(1001);
    this.driftText = this.add.text(W / 2, 34, '', {
      fontFamily: 'monospace', fontStyle: 'bold', fontSize: '22px', color: '#ffd0dd', stroke: '#3a1520', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    this.slipText = this.add.text(30, 106, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#aab5bb'
    }).setScrollFactor(0).setDepth(1001);
    void panel;
  }

  update(_, deltaMs) {
    const dt = Math.min(0.033, deltaMs / 1000);
    const input = this.controls.read();

    this.car.update(input, dt);
    WorldStep({ worldId: this.physicsWorld.worldId, deltaTime: dt, fixedTimeStep: 1 / 60, subStepCount: 4 });

    const pose = this.car.getPose();
    this.carView.setPosition(pose.x * PX_PER_M, pose.y * PX_PER_M);
    this.carView.setRotation(pose.angle);

    const t = this.car.getTelemetry();
    const kmh = Math.round(t.speed * 3.6);
    this.speedText.setText(String(kmh).padStart(3, '0'));
    this.slipText.setText(`SLIP ${t.slipDeg.toFixed(0)}°`);
    this.driftText.setText(t.drifting ? (t.handbrake ? 'HANDBRAKE DRIFT' : 'DRIFT') : '');

    this.updateEffects(dt, pose, t);
  }

  updateEffects(dt, pose, telemetry) {
    this.smokeTimer -= dt;
    this.petalTimer -= dt;

    if (telemetry.drifting && this.smokeTimer <= 0) {
      this.smokeTimer = telemetry.handbrake ? 0.026 : 0.05;
      this.spawnSmoke(pose, telemetry);
    }
    if (telemetry.speed > 10 && this.petalTimer <= 0 && Math.random() < 0.45) {
      this.petalTimer = 0.09;
      this.spawnPetal(pose);
    }

    const stepList = (list, kind) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.view.setPosition(p.x, p.y);
        if (kind === 'smoke') {
          p.view.setScale(p.view.scaleX + dt * 0.5);
          p.view.setAlpha(Math.max(0, p.life / p.maxLife) * 0.42);
        } else {
          p.view.rotation += p.spin * dt;
          p.view.setAlpha(Math.max(0, p.life / p.maxLife));
        }
        if (p.life <= 0) {
          p.view.destroy();
          list.splice(i, 1);
        }
      }
    };

    stepList(this.smoke, 'smoke');
    stepList(this.petals, 'petal');
  }

  spawnSmoke(pose, telemetry) {
    const a = pose.angle;
    const backX = Math.sin(a) * 0.95 * PX_PER_M;
    const backY = -Math.cos(a) * 0.95 * PX_PER_M;
    const rightX = Math.cos(a) * 0.48 * PX_PER_M;
    const rightY = Math.sin(a) * 0.48 * PX_PER_M;

    for (const side of [-1, 1]) {
      const x = pose.x * PX_PER_M + backX + rightX * side;
      const y = pose.y * PX_PER_M + backY + rightY * side;
      const r = Phaser.Math.Between(6, telemetry.handbrake ? 13 : 10);
      const view = this.add.circle(x, y, r, 0xd6d9dc, 0.35).setDepth(12);
      const life = Phaser.Math.FloatBetween(0.5, 0.85);
      this.smoke.push({
        x, y,
        vx: Phaser.Math.FloatBetween(-8, 8),
        vy: Phaser.Math.FloatBetween(-8, 8),
        life, maxLife: life, view
      });
    }
  }

  spawnPetal(pose) {
    const x = pose.x * PX_PER_M + Phaser.Math.Between(-180, 180);
    const y = pose.y * PX_PER_M + Phaser.Math.Between(-140, 140);
    const view = this.add.rectangle(x, y, 5, 2, 0xf1a0bc, 0.85).setDepth(30);
    const life = Phaser.Math.FloatBetween(0.7, 1.4);
    this.petals.push({
      x, y,
      vx: Phaser.Math.FloatBetween(-20, 30),
      vy: Phaser.Math.FloatBetween(20, 50),
      spin: Phaser.Math.FloatBetween(-7, 7),
      life, maxLife: life, view
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#102319',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  input: {
    activePointers: 5
  },
  scene: [TougeScene]
});
