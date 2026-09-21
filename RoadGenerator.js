const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const SEGMENTS = [
  { name: 'straight', length: [35, 62], curvature: [0, 0] },
  { name: 'soft-left', length: [35, 58], curvature: [-0.012, -0.006] },
  { name: 'soft-right', length: [35, 58], curvature: [0.006, 0.012] },
  { name: 'medium-left', length: [24, 42], curvature: [-0.023, -0.014] },
  { name: 'medium-right', length: [24, 42], curvature: [0.014, 0.023] },
  { name: 'hairpin-left', length: [19, 28], curvature: [-0.046, -0.031] },
  { name: 'hairpin-right', length: [19, 28], curvature: [0.031, 0.046] }
];

export class RoadGenerator {
  constructor({ step = 1.8, width = 8.4, segments = 95 } = {}) {
    this.step = step;
    this.width = width;
    this.segmentCount = segments;
    this.points = [];
    this.generate();
  }

  generate() {
    const pts = [{ x: 0, y: 18, heading: -Math.PI / 2 }];
    let x = 0;
    let y = 18;
    let heading = -Math.PI / 2;
    let prev = 'straight';
    let sameDirection = 0;

    for (let s = 0; s < this.segmentCount; s++) {
      let options = SEGMENTS;
      if (prev.includes('left')) options = SEGMENTS.filter(v => !v.name.includes('left') || sameDirection < 1);
      if (prev.includes('right')) options = SEGMENTS.filter(v => !v.name.includes('right') || sameDirection < 1);
      if (prev.includes('hairpin')) options = SEGMENTS.filter(v => v.name === 'straight' || v.name.includes('soft'));
      if (s < 2) options = SEGMENTS.filter(v => v.name === 'straight' || v.name.includes('soft'));

      const seg = pick(options);
      const segLength = rand(seg.length[0], seg.length[1]);
      const curve = rand(seg.curvature[0], seg.curvature[1]);
      const count = Math.max(2, Math.floor(segLength / this.step));

      for (let i = 0; i < count; i++) {
        heading += curve * this.step;
        x += Math.cos(heading) * this.step;
        y += Math.sin(heading) * this.step;
        pts.push({ x, y, heading });
      }

      const dir = seg.name.includes('left') ? 'left' : seg.name.includes('right') ? 'right' : 'straight';
      const prevDir = prev.includes('left') ? 'left' : prev.includes('right') ? 'right' : 'straight';
      sameDirection = dir === prevDir && dir !== 'straight' ? sameDirection + 1 : 0;
      prev = seg.name;
    }

    this.points = pts;
  }

  draw(scene, scale) {
    const road = scene.add.graphics();
    road.setDepth(-20);
    const points = this.points.map(p => new Phaser.Math.Vector2(p.x * scale, p.y * scale));

    // Forest/ground base.
    road.fillStyle(0x102319, 1);
    road.fillRect(-30000, -30000, 60000, 60000);

    // Road shoulders, asphalt, edge lines and center marks.
    road.lineStyle((this.width + 1.25) * scale, 0x1c271e, 1);
    road.strokePoints(points, false, false);
    road.lineStyle(this.width * scale, 0x343a3d, 1);
    road.strokePoints(points, false, false);
    road.lineStyle(0.10 * scale, 0xe6e5d8, 0.9);
    road.strokePoints(this.offsetPolyline(-this.width * 0.43, scale), false, false);
    road.strokePoints(this.offsetPolyline(this.width * 0.43, scale), false, false);

    // Center dashed line.
    road.lineStyle(0.08 * scale, 0xd9d3b5, 0.48);
    for (let i = 4; i < points.length - 4; i += 7) {
      const a = points[i];
      const b = points[Math.min(points.length - 1, i + 3)];
      road.beginPath();
      road.moveTo(a.x, a.y);
      road.lineTo(b.x, b.y);
      road.strokePath();
    }

    this.drawScenery(scene, scale);
    return road;
  }

  offsetPolyline(offsetMeters, scale) {
    return this.points.map(p => {
      const nx = -Math.sin(p.heading);
      const ny = Math.cos(p.heading);
      return new Phaser.Math.Vector2(
        (p.x + nx * offsetMeters) * scale,
        (p.y + ny * offsetMeters) * scale
      );
    });
  }

  drawScenery(scene, scale) {
    const deco = scene.add.graphics();
    deco.setDepth(-15);
    const every = 5;
    for (let i = 3; i < this.points.length - 3; i += every) {
      const p = this.points[i];
      const nx = -Math.sin(p.heading);
      const ny = Math.cos(p.heading);
      for (const side of [-1, 1]) {
        if (Math.random() > 0.76) continue;
        const dist = this.width * 0.72 + rand(1.5, 5.5);
        const x = (p.x + nx * dist * side + rand(-1.2, 1.2)) * scale;
        const y = (p.y + ny * dist * side + rand(-1.2, 1.2)) * scale;
        const sakura = Math.random() < 0.12;
        const radius = rand(0.55, 1.3) * scale;
        deco.fillStyle(sakura ? 0xc86e92 : pick([0x173d26, 0x1d4c2e, 0x245739]), 1);
        deco.fillCircle(x, y, radius);
        if (sakura) {
          deco.fillStyle(0xf0a1bd, 0.8);
          deco.fillCircle(x - radius * 0.28, y - radius * 0.1, radius * 0.52);
          deco.fillCircle(x + radius * 0.3, y + radius * 0.05, radius * 0.45);
        }
      }
    }
  }
}
