export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.state = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    this.joyPointer = null;
    this.create();
  }

  create() {
    const s = this.scene;
    const uiDepth = 1000;

    this.joyBase = s.add.circle(145, 575, 86, 0x07121b, 0.62)
      .setStrokeStyle(5, 0x9ba4b1, 0.45).setScrollFactor(0).setDepth(uiDepth);
    this.joyKnob = s.add.circle(145, 575, 38, 0xaeb4c2, 0.58)
      .setStrokeStyle(3, 0xe9edf2, 0.35).setScrollFactor(0).setDepth(uiDepth + 1);
    this.joyLabel = s.add.text(145, 678, 'STEERING', { fontFamily: 'monospace', fontSize: '19px', color: '#cfd7dd' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(uiDepth + 2);

    this.joyZone = s.add.zone(145, 575, 210, 210).setScrollFactor(0).setDepth(uiDepth + 3).setInteractive();
    this.joyZone.on('pointerdown', pointer => {
      this.joyPointer = pointer.id;
      this.updateJoystick(pointer);
    });

    s.input.on('pointermove', pointer => {
      if (this.joyPointer === pointer.id && pointer.isDown) this.updateJoystick(pointer);
    });
    s.input.on('pointerup', pointer => {
      if (this.joyPointer === pointer.id) this.releaseJoystick();
    });

    this.brake = this.makePedal(965, 600, 'BRAKE');
    this.gas = this.makePedal(1065, 600, 'GAS');
    this.handbrake = this.makeRoundButton(1185, 588, 62, 'HB');

    this.bindHold(this.gas.zone, v => this.state.throttle = v);
    this.bindHold(this.brake.zone, v => this.state.brake = v);
    this.bindHold(this.handbrake.zone, v => this.state.handbrake = !!v);

    this.cursors = s.input.keyboard.createCursorKeys();
    this.keys = s.input.keyboard.addKeys('W,A,S,D,SPACE');
  }

  makePedal(x, y, label) {
    const d = 1000;
    const bg = this.scene.add.rectangle(x, y, 82, 112, 0x111822, 0.72)
      .setStrokeStyle(4, 0xb8c0cc, 0.55).setScrollFactor(0).setDepth(d);
    const text = this.scene.add.text(x, y + 34, label, { fontFamily: 'monospace', fontSize: '18px', color: '#f1f3f5' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(d + 1);
    const stripe = this.scene.add.rectangle(x, y - 14, 42, 42, 0x77808d, 0.45)
      .setScrollFactor(0).setDepth(d + 1);
    const zone = this.scene.add.zone(x, y, 100, 140).setScrollFactor(0).setDepth(d + 2).setInteractive();
    return { bg, text, stripe, zone };
  }

  makeRoundButton(x, y, r, label) {
    const d = 1000;
    const bg = this.scene.add.circle(x, y, r, 0x42131d, 0.78)
      .setStrokeStyle(5, 0xff4d57, 0.82).setScrollFactor(0).setDepth(d);
    const text = this.scene.add.text(x, y, label, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '26px', color: '#ffd8dc' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(d + 1);
    const zone = this.scene.add.zone(x, y, r * 2.25, r * 2.25).setScrollFactor(0).setDepth(d + 2).setInteractive();
    return { bg, text, zone };
  }

  bindHold(zone, cb) {
    zone.on('pointerdown', () => cb(1));
    zone.on('pointerup', () => cb(0));
    zone.on('pointerout', () => cb(0));
  }

  updateJoystick(pointer) {
    const cx = 145;
    const cy = 575;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    const max = 70;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, max / len);
    this.joyKnob.setPosition(cx + dx * k, cy + dy * k);
    this.state.steer = Math.max(-1, Math.min(1, dx / max));
  }

  releaseJoystick() {
    this.joyPointer = null;
    this.state.steer = 0;
    this.joyKnob.setPosition(145, 575);
  }

  read() {
    // Keyboard fallback for desktop testing.
    let steer = this.state.steer;
    let throttle = this.state.throttle;
    let brake = this.state.brake;
    let handbrake = this.state.handbrake;

    if (this.cursors.left.isDown || this.keys.A.isDown) steer = -1;
    if (this.cursors.right.isDown || this.keys.D.isDown) steer = 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) throttle = 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) brake = 1;
    if (this.keys.SPACE.isDown) handbrake = true;

    return { steer, throttle, brake, handbrake };
  }
}
