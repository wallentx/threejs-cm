import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VehicleAI } from '../src/game/VehicleAI.js';

function makeMockVehicle(options = {}) {
  return {
    id: options.id ?? 'test_tank',
    position: options.position ?? new THREE.Vector3(0, 0, 0),
    rotation: options.rotation ?? 0,
    turretRotation: options.turretRotation ?? 0,
    isMoving: options.isMoving ?? false,
    waypoints: options.waypoints ?? [],
    velocity: options.velocity ?? new THREE.Vector3(0, 0, 0),
    maxSpeed: options.maxSpeed ?? 3.5,
    turretTraverseRate: options.turretTraverseRate ?? 0.35,
    hullTurnRate: options.hullTurnRate ?? 0.20,
    vehicleComponents: options.vehicleComponents ?? {
      engine: { health: 100, operational: true },
      transmission: { health: 100, operational: true },
      tracks: { health: 100, operational: true },
      optics: { health: 100, operational: true }
    },
    tacticalDecision: null
  };
}

test('VehicleAI aligns turret and hull toward threat position, prioritizing front armor', () => {
  const vehicle = makeMockVehicle({ rotation: 0, turretRotation: 0 });
  const ai = new VehicleAI(vehicle);

  const threatPos = new THREE.Vector3(10, 0, 0); // Threat is to the right (x=10, z=0 => angle = Math.PI/2)

  // Step AI
  ai.update(1.0, null, { threatPosition: threatPos });

  assert.equal(ai.threatFacingActive, true);
  assert.ok(vehicle.turretRotation > 0, 'Turret must traverse toward threat');
  assert.ok(vehicle.rotation > 0, 'Idle vehicle hull must turn toward threat');
  assert.equal(vehicle.tacticalDecision.reason, 'threat-hull-align');

  // Advance multiple steps until front armor is aligned
  for (let i = 0; i < 15; i++) {
    ai.update(1.0, null, { threatPosition: threatPos });
  }

  assert.equal(vehicle.tacticalDecision.frontArmorAligned, true, 'Front armor must be aligned toward threat');
  assert.ok(Math.abs(vehicle.rotation - Math.PI / 2) < 0.1, 'Hull rotation must align near threat angle');
});

test('VehicleAI traverses turret first during movement while hull follows path', () => {
  const vehicle = makeMockVehicle({ rotation: 0, turretRotation: 0, isMoving: true });
  const ai = new VehicleAI(vehicle);

  const threatPos = new THREE.Vector3(0, 0, 10); // Threat is straight ahead (z=10 => angle = 0)

  // Threat placed to the side relative to current rotation Math.PI / 2
  vehicle.rotation = Math.PI / 2;
  ai.update(0.5, null, { threatPosition: threatPos });

  assert.equal(vehicle.tacticalDecision.reason, 'threat-turret-traverse');
  assert.ok(vehicle.turretRotation !== 0, 'Turret must traverse independently of moving hull');
});

test('VehicleAI executes tactical reverse movement under REVERSE order or heavy threat, keeping front armor locked', () => {
  const vehicle = makeMockVehicle({ rotation: 0, turretRotation: 0 });
  const ai = new VehicleAI(vehicle);

  const threatPos = new THREE.Vector3(0, 0, 20); // Threat is straight ahead (angle = 0)

  ai.update(1.0, null, { orderType: 'REVERSE', threatPosition: threatPos });

  const decision = vehicle.tacticalDecision;
  assert.equal(decision.reason, 'tactical-reverse');
  assert.equal(decision.isReversing, true);
  assert.ok(Array.isArray(decision.reverseVector), 'Reverse vector must be exposed');

  // Heavy threat retreat
  const retreatingVehicle = makeMockVehicle({ rotation: 0, turretRotation: 0 });
  const freshAi = new VehicleAI(retreatingVehicle);
  freshAi.update(1.0, null, { heavyThreat: true, threatPosition: threatPos });

  assert.equal(retreatingVehicle.tacticalDecision.isReversing, true);
  assert.equal(retreatingVehicle.tacticalDecision.reason, 'tactical-reverse');
});

test('VehicleAI adapts to component and crew damage, entering pillbox mode when immobilized', () => {
  const damagedVehicle = makeMockVehicle({
    rotation: 0,
    turretRotation: 0,
    vehicleComponents: {
      engine: { health: 100, operational: true },
      transmission: { health: 100, operational: true },
      tracks: { health: 0, operational: false }, // Immobilized
      optics: { health: 40, operational: true } // Damaged optics
    }
  });

  const ai = new VehicleAI(damagedVehicle);
  const threatPos = new THREE.Vector3(10, 0, 0);

  ai.update(1.0, null, { threatPosition: threatPos, gunnerAvailable: true });

  const decision = damagedVehicle.tacticalDecision;
  assert.equal(decision.reason, 'pillbox-mode');
  assert.equal(decision.isPillbox, true);
  assert.equal(decision.mobilityDisabled, true);
  assert.equal(decision.opticsDamaged, true);
  assert.equal(decision.spottingModifier, 0.6);
  assert.equal(damagedVehicle.isMoving, false, 'Immobilized pillbox mode must halt vehicle movement');
  assert.ok(damagedVehicle.turretRotation > 0, 'Turret must continue to traverse towards threat in pillbox mode');
});

test('VehicleAI engages hull-down positioning behind terrain crests, reducing exposure modifier', () => {
  const vehicle = makeMockVehicle({ position: new THREE.Vector3(0, 0, 0) });
  const ai = new VehicleAI(vehicle);
  const threatPos = new THREE.Vector3(20, 0, 0);

  const mockTerrain = {
    getHeightAt(x, z) {
      // Crest elevated at x=4
      if (x > 2 && x < 8) return 1.5;
      return 0.0;
    }
  };

  ai.update(1.0, mockTerrain, { threatPosition: threatPos });

  const decision = vehicle.tacticalDecision;
  assert.equal(decision.hullDownActive, true);
  assert.equal(decision.reason, 'hull-down-defense');
  assert.equal(decision.exposureModifier, 0.45, 'Hull-down positioning must grant reduced exposure modifier (0.45)');
  assert.equal(vehicle.exposureModifier, 0.45);
});

test('VehicleAI captureState and restoreState preserve threat facing, reverse state, pillbox mode, hull-down status, and decision byte-for-byte', () => {
  const vehicle = makeMockVehicle({ rotation: 0.5, turretRotation: 0.2 });
  const ai = new VehicleAI(vehicle);

  const threatPos = new THREE.Vector3(15, 0, 15);
  ai.update(0.5, null, { orderType: 'HULL_DOWN', threatPosition: threatPos });

  const captured = ai.captureState();

  const freshVehicle = makeMockVehicle({ rotation: 0.5, turretRotation: 0.2 });
  const freshAi = new VehicleAI(freshVehicle, captured);

  assert.deepEqual(freshAi.captureState(), captured);
  assert.deepEqual(freshVehicle.tacticalDecision, vehicle.tacticalDecision);
});

test('VehicleAI handles gun-disabled withdrawal and burning vehicle abandonment', () => {
  const unarmedVehicle = makeMockVehicle({
    rotation: 0,
    vehicleComponents: {
      main_gun: { health: 0, operational: false }
    }
  });

  const ai = new VehicleAI(unarmedVehicle);
  const threatPos = new THREE.Vector3(10, 0, 0);

  ai.update(1.0, null, { threatPosition: threatPos });
  assert.equal(unarmedVehicle.tacticalDecision.reason, 'gun-disabled-withdrawal');
  assert.equal(unarmedVehicle.tacticalDecision.isWithdrawing, true);

  const burningVehicle = makeMockVehicle({ rotation: 0 });
  const burningAi = new VehicleAI(burningVehicle);
  burningAi.update(1.0, null, { burning: true, threatPosition: threatPos });

  assert.equal(burningVehicle.tacticalDecision.reason, 'vehicle-burning-abandoned');
  assert.equal(burningVehicle.tacticalDecision.burningAbandoned, true);
});

