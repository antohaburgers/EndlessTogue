import {
  b2BodyType,
  b2DefaultBodyDef,
  b2DefaultShapeDef,
  b2CreateBody,
  b2CreatePolygonShape,
  b2MakeBox,
  b2Vec2,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2Rot_GetAngle,
  b2Body_GetLinearVelocity,
  b2Body_SetLinearVelocity,
  b2Body_GetWorldVector,
  b2Body_GetWorldCenter,
  b2Body_GetMass,
  b2Body_ApplyForceToCenter,
  b2Body_ApplyLinearImpulse,
  b2Body_ApplyTorque,
  b2Body_GetAngularVelocity,
  b2Body_SetAngularVelocity
} from 'phaser-box2d';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const length = (v) => Math.hypot(v.x, v.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;

export const AE86_SETUP = {
  name: 'Hachi',
  massScale: 1,
  engineForce: 118,
  reverseForce: 42,
  brakeForce: 165,
  maxSpeed: 46,          // ~166 km/h
  maxReverseSpeed: 10,
  steeringTorque: 42,
  steeringResponse: 7.5,
  frontGrip: 0.92,
  rearGrip: 0.72,
  handbrakeGrip: 0.16,
  lateralImpulseCap: 2.9,
  driftLateralImpulseCap: 0.85,
  aeroDrag: 0.012,
  rollingDrag: 0.16,
  angularDamping: 2.25,
  driftAngularDamping: 0.62,
  handbrakeYawBoost: 15,
  minSteerSpeed: 1.2
};

export class DriftCar {
  constructor(worldId, x = 0, y = 0, setup = AE86_SETUP) {
    this.worldId = worldId;
    this.setup = { ...setup };
    this.steerSmoothed = 0;
    this.lastTelemetry = { speed: 0, lateralSpeed: 0, slipDeg: 0, drifting: false };

    const bodyDef = b2DefaultBodyDef();
    bodyDef.type = b2BodyType.b2_dynamicBody;
    bodyDef.position = new b2Vec2(x, y);
    bodyDef.linearDamping = 0.08;
    bodyDef.angularDamping = 0.6;
    bodyDef.enableSleep = false;
    this.bodyId = b2CreateBody(worldId, bodyDef);

    const shapeDef = b2DefaultShapeDef();
    shapeDef.density = 1.0 * this.setup.massScale;
    shapeDef.friction = 0.35;
    shapeDef.restitution = 0.05;
    const chassis = b2MakeBox(0.78, 1.55);
    b2CreatePolygonShape(this.bodyId, shapeDef, chassis);
  }

  getPose() {
    const p = b2Body_GetPosition(this.bodyId);
    const r = b2Body_GetRotation(this.bodyId);
    return { x: p.x, y: p.y, angle: b2Rot_GetAngle(r) };
  }

  getTelemetry() {
    return this.lastTelemetry;
  }

  update(input, dt) {
    const s = this.setup;
    const velocity = b2Body_GetLinearVelocity(this.bodyId);
    const speed = length(velocity);
    const mass = b2Body_GetMass(this.bodyId);
    const center = b2Body_GetWorldCenter(this.bodyId);

    // Sprite/vehicle nose points toward local -Y.
    const forward = b2Body_GetWorldVector(this.bodyId, new b2Vec2(0, -1));
    const right = b2Body_GetWorldVector(this.bodyId, new b2Vec2(1, 0));

    const forwardSpeed = dot(velocity, forward);
    const lateralSpeed = dot(velocity, right);

    // Smooth steering so the car does not snap instantly on touch controls.
    const steerTarget = clamp(input.steer ?? 0, -1, 1);
    const steerAlpha = 1 - Math.exp(-s.steeringResponse * dt);
    this.steerSmoothed += (steerTarget - this.steerSmoothed) * steerAlpha;

    // Propulsion.
    const throttle = clamp(input.throttle ?? 0, 0, 1);
    if (throttle > 0) {
      const canDrive = forwardSpeed < s.maxSpeed;
      if (canDrive) {
        const forceFade = clamp(1 - Math.max(0, forwardSpeed) / s.maxSpeed, 0.12, 1);
        const force = s.engineForce * throttle * forceFade;
        b2Body_ApplyForceToCenter(this.bodyId, new b2Vec2(forward.x * force, forward.y * force), true);
      }
    }

    // Brake first slows the current motion; at low speed it also allows reverse.
    const brake = clamp(input.brake ?? 0, 0, 1);
    if (brake > 0) {
      if (forwardSpeed > 1.0) {
        const brakeForce = Math.min(s.brakeForce * brake, speed * mass * 18);
        const vNorm = speed > 0.001 ? new b2Vec2(velocity.x / speed, velocity.y / speed) : new b2Vec2(0, 0);
        b2Body_ApplyForceToCenter(this.bodyId, new b2Vec2(-vNorm.x * brakeForce, -vNorm.y * brakeForce), true);
      } else if (forwardSpeed > -s.maxReverseSpeed) {
        const force = s.reverseForce * brake;
        b2Body_ApplyForceToCenter(this.bodyId, new b2Vec2(-forward.x * force, -forward.y * force), true);
      }
    }

    // Tire model: Box2D handles the body, we control how strongly the tires cancel lateral speed.
    const handbrake = !!input.handbrake;
    const speedGripFade = clamp(1 - speed / 90, 0.55, 1);
    const grip = (handbrake ? s.handbrakeGrip : s.rearGrip) * speedGripFade;
    const wantedCancel = -lateralSpeed * mass * grip;
    const cap = handbrake ? s.driftLateralImpulseCap : s.lateralImpulseCap;
    const impulseScalar = clamp(wantedCancel, -cap * mass, cap * mass);
    b2Body_ApplyLinearImpulse(
      this.bodyId,
      new b2Vec2(right.x * impulseScalar, right.y * impulseScalar),
      center,
      true
    );

    // Steering torque grows with speed, then softens at very high speed.
    const speedForSteer = clamp(Math.abs(forwardSpeed) / 8, 0, 1);
    if (Math.abs(forwardSpeed) > s.minSteerSpeed) {
      const highSpeedFade = clamp(1.15 - Math.abs(forwardSpeed) / 70, 0.52, 1);
      const direction = forwardSpeed >= 0 ? 1 : -1;
      let torque = this.steerSmoothed * s.steeringTorque * speedForSteer * highSpeedFade * direction;
      if (handbrake && Math.abs(this.steerSmoothed) > 0.05) {
        torque += this.steerSmoothed * s.handbrakeYawBoost;
      }
      b2Body_ApplyTorque(this.bodyId, torque, true);
    }

    // Angular damping changes during handbrake drift: normal driving stabilizes, drift stays loose.
    const angularVel = b2Body_GetAngularVelocity(this.bodyId);
    const angDamping = handbrake ? s.driftAngularDamping : s.angularDamping;
    const dampedAngularVel = angularVel * Math.max(0, 1 - angDamping * dt);
    b2Body_SetAngularVelocity(this.bodyId, dampedAngularVel);

    // Rolling + aerodynamic drag.
    if (speed > 0.01) {
      const dragMag = (s.rollingDrag + s.aeroDrag * speed * speed) * mass;
      b2Body_ApplyForceToCenter(
        this.bodyId,
        new b2Vec2((-velocity.x / speed) * dragMag, (-velocity.y / speed) * dragMag),
        true
      );
    }

    // Hard safety limiter, mostly for tuning mistakes.
    const maxAbsolute = s.maxSpeed * 1.12;
    if (speed > maxAbsolute) {
      const k = maxAbsolute / speed;
      b2Body_SetLinearVelocity(this.bodyId, new b2Vec2(velocity.x * k, velocity.y * k));
    }

    let slipDeg = 0;
    if (speed > 1.5) {
      slipDeg = Math.atan2(Math.abs(lateralSpeed), Math.max(0.5, Math.abs(forwardSpeed))) * 180 / Math.PI;
    }

    this.lastTelemetry = {
      speed,
      forwardSpeed,
      lateralSpeed,
      slipDeg,
      drifting: speed > 7 && slipDeg > 8,
      handbrake
    };
  }
}
