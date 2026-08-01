import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getVehicle } from '../src/content/france1940/vehicles.js';
import { DebugOverlaySystem } from '../src/world/debug/DebugOverlaySystem.js';

test('debug overlays project real vehicle volumes and infantry hit profiles', () => {
  const scene = new THREE.Scene();
  const overlay = new DebugOverlaySystem(scene);
  for (const key of [
    'fieldOfView',
    'hitboxes',
    'vehicleComponents',
    'vehicleCrew'
  ]) {
    overlay.setEnabled(key, true);
  }
  const vehicle = {
    id: 'tank-1',
    faction: 'french',
    position: new THREE.Vector3(4, 1, 7),
    rotation: 0.25,
    vehicleSpec: getVehicle('RENAULT_R35'),
    vehicleWeapon: { turretYaw: 0.1 },
    vehiclePhysics: { turret: { status: 'ATTACHED' } }
  };
  const observerRecord = {
    id: 'tank-1:commander:optic',
    observerUnitId: 'tank-1',
    factionId: 'french',
    capabilityId: 'optic',
    position: [4, 3, 7],
    facingYaw: 0.35,
    horizontalFovDegrees: 45,
    nominalRangeMeters: 180
  };

  const vehicleStats = overlay.update({
    units: [vehicle],
    focusedUnits: [vehicle],
    observerRecords: [observerRecord],
    playerFactionId: 'french'
  });
  assert.equal(vehicleStats.fieldOfView, 1);
  assert.ok(vehicleStats.hitboxes > 0);
  assert.ok(vehicleStats.vehicleComponents > 0);
  assert.ok(vehicleStats.vehicleCrew > 0);
  const component = overlay.objects.vehicleComponents.values().next().value;
  assert.equal(component.matrixAutoUpdate, false);
  assert.equal(component.userData.internalKind, 'component');

  const infantry = {
    id: 'squad-1',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(),
    soldierAI: {
      getLivingAgents: () => [{
        id: 'rifleman-1',
        position: new THREE.Vector3(2, 0, 3),
        stance: 'PRONE',
        facing: Math.PI / 2
      }]
    }
  };
  const infantryStats = overlay.update({
    units: [vehicle, infantry],
    focusedUnits: [infantry],
    observerRecords: [],
    playerFactionId: 'french'
  });
  assert.equal(infantryStats.hitboxes, 4);
  assert.equal(infantryStats.vehicleComponents, 0);
  assert.equal(infantryStats.vehicleCrew, 0);

  overlay.dispose();
  assert.equal(scene.children.includes(overlay.root), false);
});
