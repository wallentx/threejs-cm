import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEBUG_VEHICLE_SEPARATION_METERS,
  VEHICLE_SANDBOX_VR_PALETTE,
  VEHICLE_SANDBOX_TAP_GESTURE,
  VehicleDebugSandboxApp,
  VehicleDebugSandboxSimulation,
  createVehicleDebugVehicles,
  isVehicleSandboxDoubleTap,
  listDebugGunOptions,
  listDebugVehicleOptions
} from '../src/debug/VehicleDebugSandboxApp.js';
import { FRANCE_1940_VISUAL_FACTORIES } from '../src/content/france1940/render/index.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

function createSimulation() {
  return new VehicleDebugSandboxSimulation({
    scene: new THREE.Scene(),
    visualFactories: FRANCE_1940_VISUAL_FACTORIES,
    vfxProvider: TEST_VFX_PROVIDER
  });
}

function advance(simulation, seconds) {
  const steps = Math.ceil(seconds * 30);
  for (let step = 0; step < steps; step++) simulation.advance(1 / 30);
}

test('vehicle debug sandbox exports its browser app constructor', () => {
  assert.equal(typeof VehicleDebugSandboxApp, 'function');
});

test('vehicle sandbox double tap requires nearby clean taps inside the time window', () => {
  const first = { clientX: 100, clientY: 80, pointerType: 'touch', timeStamp: 1000 };
  assert.equal(isVehicleSandboxDoubleTap(first, {
    ...first,
    clientX: 112,
    clientY: 91,
    timeStamp: 1000 + VEHICLE_SANDBOX_TAP_GESTURE.maxDoubleTapIntervalMs
  }), true);
  assert.equal(isVehicleSandboxDoubleTap(first, {
    ...first,
    clientX: 100 + VEHICLE_SANDBOX_TAP_GESTURE.maxDoubleTapDistancePx + 1,
    timeStamp: 1100
  }), false);
  assert.equal(isVehicleSandboxDoubleTap(first, {
    ...first,
    timeStamp: 1001 + VEHICLE_SANDBOX_TAP_GESTURE.maxDoubleTapIntervalMs
  }), false);
  assert.equal(isVehicleSandboxDoubleTap(first, {
    ...first,
    pointerType: 'mouse',
    timeStamp: 1100
  }), false);
});

test('double tapping the sandbox recenters orbit controls without firing a gun shot', () => {
  const app = Object.create(VehicleDebugSandboxApp.prototype);
  app.mode = 'gun';
  app.pointerStart = null;
  app.pendingTap = null;
  const focused = [];
  const fired = [];
  app.focusCameraAt = (x, y) => focused.push([x, y]);
  app.fireGunAt = (x, y) => fired.push([x, y]);

  const tap = (timeStamp, clientX, clientY) => {
    app.onPointerDown({
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY
    });
    app.onPointerUp({
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      timeStamp,
      clientX,
      clientY
    });
  };
  tap(1000, 120, 90);
  tap(1240, 126, 94);

  assert.deepEqual(focused, [[126, 94]]);
  assert.deepEqual(fired, []);
  assert.equal(app.pendingTap, null);
});

test('desktop double-click recenters the sandbox and cancels its pending gun shot', () => {
  const app = Object.create(VehicleDebugSandboxApp.prototype);
  const focused = [];
  let cleared = 0;
  app.focusCameraAt = (x, y) => focused.push([x, y]);
  app.clearPendingTap = () => { cleared++; };
  let prevented = 0;

  app.onDoubleClick({
    button: 0,
    clientX: 410,
    clientY: 265,
    preventDefault() { prevented++; }
  });

  assert.deepEqual(focused, [[410, 265]]);
  assert.equal(cleared, 1);
  assert.equal(prevented, 1);
});

test('camera focus raycasts visible vehicle surfaces before the ground', () => {
  const app = Object.create(VehicleDebugSandboxApp.prototype);
  const scene = new THREE.Scene();
  const vehicle = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial()
  );
  vehicle.position.y = 1;
  scene.add(vehicle);
  app.ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial()
  );
  app.ground.rotation.x = -Math.PI / 2;
  scene.add(app.ground);
  app.simulation = { visibleUnits: [{ mesh: vehicle }] };
  app.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  app.camera.position.set(0, 1, 8);
  app.camera.lookAt(0, 1, 0);
  app.raycaster = new THREE.Raycaster();
  app.pointer = new THREE.Vector2();
  app.rendererFacade = {
    domElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    }
  };
  let updates = 0;
  app.controls = {
    target: new THREE.Vector3(),
    update: () => { updates += 1; }
  };

  assert.equal(app.focusCameraAt(50, 50), true);
  assert.ok(app.controls.target.distanceTo(new THREE.Vector3(0, 1, 1)) < 1e-9);
  assert.equal(updates, 1);

  vehicle.geometry.dispose();
  vehicle.material.dispose();
  app.ground.geometry.dispose();
  app.ground.material.dispose();
});

test('vehicle debug sandbox ground uses the neon green VR training palette', () => {
  const app = Object.create(VehicleDebugSandboxApp.prototype);
  app.scene = new THREE.Scene();
  app.scene.background = new THREE.Color(VEHICLE_SANDBOX_VR_PALETTE.backdrop);
  app.setupVrMissionGround();

  assert.equal(app.scene.background.getHex(), VEHICLE_SANDBOX_VR_PALETTE.backdrop);
  assert.equal(app.ground.material.color.getHex(), VEHICLE_SANDBOX_VR_PALETTE.ground);
  assert.equal(app.grid.position.y, 0.01);
  const gridColors = app.grid.geometry.getAttribute('color');
  assert.ok(gridColors.array.some(value => value > 0.9),
    'VR grid must retain a bright neon channel over the dark ground');

  app.ground.geometry.dispose();
  app.ground.material.dispose();
  app.grid.geometry.dispose();
  app.grid.material.dispose();
});

test('sandbox selectors deduplicate shared guns and identify compatible vehicles and the sandbox Flak 88', () => {
  const vehicles = listDebugVehicleOptions();
  const armedVehicles = listDebugVehicleOptions({ armedOnly: true });
  const guns = listDebugGunOptions();

  assert.equal(vehicles.length, 15);
  assert.equal(armedVehicles.length, 13);
  assert.equal(new Set(guns.map(option => option.weaponId)).size, guns.length);
  const sa35 = guns.find(option => option.id === 'SA35_AP');
  assert.deepEqual(sa35.compatibleVehicleIds, [
    'SOMUA_S35',
    'RENAULT_D2',
    'AMC_35',
    'CHAR_B1_BIS'
  ]);
  assert.equal(sa35.sandboxOnly, false);
  const flak = guns.find(option => option.id === 'DEBUG_FLAK_88_AP');
  assert.equal(flak.sandboxOnly, true);
  assert.equal(flak.weapon.caliberMm, 88);
  assert.equal(flak.weapon.muzzleVelocity, 810);
  const flakHe = guns.find(option => option.id === 'DEBUG_FLAK_88_HE');
  assert.equal(flakHe.sandboxOnly, true);
  assert.equal(flakHe.weapon.kind, 'cannon_he');
  assert.equal(flakHe.weapon.muzzleVelocity, 820);
  assert.equal(flakHe.weapon.projectileMassKg, 9.23);
  assert.equal(flakHe.weapon.explosiveFillKg, 0.993);

  const charHullHe = guns.find(option => option.id === 'ABS_SA35_75_HE');
  const charHullAphe = guns.find(option => option.id === 'ABS_SA35_75_APHE');
  assert.deepEqual(charHullHe.compatibleUses, [{
    vehicleId: 'CHAR_B1_BIS',
    vehicleName: 'Char B1 bis',
    mountId: 'hull_main',
    mountLabel: '75 mm ABS SA 35 hull howitzer'
  }]);
  assert.equal(charHullAphe.compatibleUses[0].mountId, 'hull_main');
});

test('any selected duel pair spawns as opponents at the requested separation', () => {
  const vehicles = createVehicleDebugVehicles({
    visualFactories: FRANCE_1940_VISUAL_FACTORIES,
    leftVehicleId: 'RENAULT_R35',
    rightVehicleId: 'PANZER_38T',
    separationMeters: DEBUG_VEHICLE_SEPARATION_METERS
  });

  assert.equal(vehicles.left.vehicleId, 'RENAULT_R35');
  assert.equal(vehicles.right.vehicleId, 'PANZER_38T');
  assert.equal(
    vehicles.left.mesh.position.distanceTo(vehicles.right.mesh.position),
    DEBUG_VEHICLE_SEPARATION_METERS
  );
  assert.notEqual(vehicles.left.faction, vehicles.right.faction);
  assert.deepEqual(vehicles.left.waypoints, []);
  assert.deepEqual(vehicles.right.waypoints, []);
});

test('duel mode produces shots and impacts through normal vehicle combat', () => {
  const simulation = createSimulation();
  try {
    simulation.setupDuel({
      leftVehicleId: 'SOMUA_S35',
      rightVehicleId: 'PANZER_III_D',
      separationMeters: 35
    });
    advance(simulation, 30);

    assert.ok(simulation.combat.telemetry.shotsFired > 0);
    assert.ok(simulation.combat.telemetry.impacts.length > 0);
    assert.ok(simulation.visibleUnits.some(unit =>
      unit.vehicleDamageState.events.length > 0
    ));
  } finally {
    simulation.dispose();
  }
});

test('gun mode places the shot origin on the exact three-dimensional camera normal', () => {
  const simulation = createSimulation();
  try {
    const { target } = simulation.setupGun({
      targetVehicleId: 'PANZER_III_D',
      gunOptionId: 'SA35_AP',
      distanceMeters: 35
    });
    const aimPoint = target.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const cameraDirection = new THREE.Vector3(0.24, -0.32, -0.916515).normalize();
    assert.equal(
      simulation.queueGunShot(aimPoint, cameraDirection),
      true
    );
    const originToAim = aimPoint.clone()
      .sub(simulation.gunShot.muzzlePosition)
      .normalize();
    assert.ok(originToAim.distanceTo(cameraDirection) < 1e-9);
    assert.equal(
      simulation.gunShot.muzzlePosition.distanceTo(aimPoint),
      35
    );
    advance(simulation, 20);

    assert.equal(simulation.combat.telemetry.shotsFired, 1);
    assert.ok(simulation.combat.telemetry.impacts.length > 0);
    assert.equal(simulation.gunShot.phase, 'complete');
    assert.ok(target.vehicleDamageState.events.length > 0);
  } finally {
    simulation.dispose();
  }
});

test('sandbox-only Flak 88 uses the same projectile, armor, and crew-damage path', () => {
  const simulation = createSimulation();
  try {
    const { target, gun } = simulation.setupGun({
      targetVehicleId: 'CHAR_B1_BIS',
      gunOptionId: 'DEBUG_FLAK_88_AP',
      distanceMeters: 100
    });
    const aimPoint = target.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    assert.equal(
      simulation.queueGunShot(aimPoint, new THREE.Vector3(0, 0, -1)),
      true
    );
    advance(simulation, 20);

    const impact = simulation.combat.telemetry.impacts
      .find(record => record.kind === 'vehicle');
    assert.equal(gun.weaponId, 'DEBUG_FLAK_88_AP');
    assert.equal(impact.weaponId, 'DEBUG_FLAK_88_AP');
    assert.equal(impact.targetId, target.id);
    assert.ok(impact.crewResult);
    assert.ok(Array.isArray(impact.crewResult.casualties));
    assert.deepEqual(
      impact.crewResult.casualties.map(casualty => casualty.status),
      target.roster
        .filter(crewman => impact.crewResult.casualties.some(casualty => casualty.id === crewman.id))
        .map(crewman => crewman.status)
    );
  } finally {
    simulation.dispose();
  }
});

test('sandbox-only Flak 88 HE resolves a real explosive vehicle impact', () => {
  const simulation = createSimulation();
  try {
    const { target, gun } = simulation.setupGun({
      targetVehicleId: 'PANZER_III_D',
      gunOptionId: 'DEBUG_FLAK_88_HE',
      distanceMeters: 100
    });
    const aimPoint = target.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    assert.equal(
      simulation.queueGunShot(aimPoint, new THREE.Vector3(0, 0, -1)),
      true
    );
    advance(simulation, 20);

    const impact = simulation.combat.telemetry.impacts
      .find(record => record.kind === 'vehicle');
    assert.equal(gun.weaponId, 'DEBUG_FLAK_88_HE');
    assert.equal(impact.weaponId, 'DEBUG_FLAK_88_HE');
    assert.equal(impact.targetId, target.id);
    assert.ok(impact.explosiveEffect);
  } finally {
    simulation.dispose();
  }
});
