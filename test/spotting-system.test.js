import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { createVehicleComponents } from '../src/game/VehicleSystems.js';
import { CONTACT_CHANNEL } from '../src/simulation/observation/ContactState.js';

function makeUnit({
  id,
  faction,
  x,
  z,
  role = 'RIFLEMAN',
  status = 'OK',
  health = 100,
  type = 'infantry_squad',
  experience = 'Regular',
  vehicleRadio = null
}) {
  const unit = {
    id,
    faction,
    type,
    experience,
    morale: 'OK',
    stance: 'STANDING',
    suppression: 0,
    isHiding: false,
    moveSpeed: 0,
    position: new THREE.Vector3(x, 0, z),
    roster: [{ id: 0, role, status, health, velocity: [0, 0, 0] }]
  };
  if (vehicleRadio !== null) {
    unit.vehicleSpec = {
      communications: {
        radioInstalled: vehicleRadio,
        operatorRoles: [role]
      }
    };
    unit.vehicleComponents = {
      radio: {
        installed: vehicleRadio,
        operational: vehicleRadio,
        health: vehicleRadio ? 100 : 0
      }
    };
  }
  return unit;
}

function makeTerrain(obstacles = []) {
  return {
    bocageObstacles: obstacles,
    getHeightAt: () => 0
  };
}

function makeSpotting(terrain = makeTerrain(), unitProfiles = []) {
  return new SpottingSystem(null, terrain, {
    unitProfiles,
    settings: {
      baseAcquisitionSeconds: 0.5,
      terrainSampleMeters: 2.5
    }
  });
}

function acquire(spotting, units, seconds = 4) {
  spotting.advance(units, seconds);
}

const blockingWall = Object.freeze({
  minX: 8,
  maxX: 10,
  minZ: 4,
  maxZ: 36,
  height: 4,
  type: 'wall'
});

test('line-of-sight uses obstacle height and rejects nearby non-intersecting segments', () => {
  const spotting = makeSpotting(makeTerrain());
  const obstacle = {
    minX: 4,
    maxX: 6,
    minZ: -1,
    maxZ: 1,
    height: 3,
    type: 'wall'
  };
  assert.equal(
    spotting.segmentIntersectsBox(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(10, 1, 0),
      obstacle
    ),
    true
  );
  assert.equal(
    spotting.segmentIntersectsBox(
      new THREE.Vector3(0, 1, 3),
      new THREE.Vector3(10, 1, 3),
      obstacle
    ),
    false
  );
  assert.equal(
    spotting.segmentIntersectsBox(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(10, 5, 0),
      obstacle
    ),
    false
  );
});

test('KIA observers cannot acquire, relay, or retain observation state', () => {
  const observer = makeUnit({
    id: 'observer',
    faction: 'blue',
    x: 0,
    z: 0,
    status: 'KIA',
    health: 0
  });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 30 });
  const spotting = makeSpotting();

  acquire(spotting, [observer, target], 20);

  assert.equal(spotting.getObservation('observer', 0, 'target'), null);
  assert.equal(spotting.getContactForUnit(observer, target), null);
  assert.deepEqual(spotting.getVisibilityProjection('blue', [observer, target]).visibleUnitIds, [
    'observer'
  ]);
});

test('occlusion prevents acquisition even inside nominal spotting range', () => {
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 18, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const spotting = makeSpotting(makeTerrain([blockingWall]));

  acquire(spotting, [observer, target], 20);

  const observation = spotting.getObservation('observer', 0, 'target');
  assert.equal(observation.acquisition, 0);
  assert.equal(observation.visibleNow, false);
  assert.equal(spotting.canPrecisionTarget(observer, target), false);
});

test('binoculars shorten acquisition without creating an observation by themselves', () => {
  const plain = makeUnit({ id: 'plain', faction: 'blue', x: -2, z: 0 });
  const binocular = makeUnit({ id: 'binocular', faction: 'blue', x: 2, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 130 });
  const spotting = makeSpotting(makeTerrain(), [{
    id: 'binocular',
    soldierEquipment: { 0: ['BINOCULARS'] }
  }]);

  spotting.advance([plain, binocular, target], 0.8);

  const plainObservation = spotting.getObservation('plain', 0, 'target');
  const binocularObservation = spotting.getObservation('binocular', 0, 'target');
  assert.ok(binocularObservation.acquisition > plainObservation.acquisition);
  assert.equal(binocularObservation.visibleNow, true);
  assert.equal(plainObservation.visibleNow, false);
});

test('voice relay includes the boundary, excludes units beyond it, and never grants precision fire', () => {
  const sender = makeUnit({ id: 'sender', faction: 'blue', x: 0, z: 0 });
  const boundary = makeUnit({ id: 'boundary', faction: 'blue', x: 18, z: 0 });
  const outside = makeUnit({ id: 'outside', faction: 'blue', x: 18.01, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const spotting = makeSpotting(makeTerrain([blockingWall]));

  acquire(spotting, [outside, target, boundary, sender]);

  assert.equal(
    spotting.getContactForUnit(boundary, target).channel,
    CONTACT_CHANNEL.VOICE
  );
  assert.equal(spotting.getContactForUnit(outside, target), null);
  assert.equal(spotting.canPrecisionTarget(boundary, target), false);
  assert.equal(spotting.canPrecisionTarget(sender, target), true);
});

test('radio relay requires both operational endpoints, live operators, and one command net', () => {
  const sender = makeUnit({
    id: 'sender',
    faction: 'blue',
    x: 0,
    z: 0,
    role: 'RADIO_OPERATOR',
    type: 'vehicle',
    vehicleRadio: true
  });
  const receiver = makeUnit({
    id: 'receiver',
    faction: 'blue',
    x: 100,
    z: 0,
    role: 'RADIO_OPERATOR',
    type: 'vehicle',
    vehicleRadio: true
  });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const profiles = [
    { id: 'sender', communications: { commandNetId: 'blue-net' } },
    { id: 'receiver', communications: { commandNetId: 'blue-net' } }
  ];

  const operational = makeSpotting(makeTerrain([{
    minX: 45,
    maxX: 55,
    minZ: 0,
    maxZ: 30,
    height: 4,
    type: 'wall'
  }]), profiles);
  acquire(operational, [receiver, target, sender]);
  assert.equal(
    operational.getContactForUnit(receiver, target).channel,
    CONTACT_CHANNEL.RADIO
  );
  assert.equal(operational.canPrecisionTarget(receiver, target), false);

  receiver.vehicleComponents.radio.operational = false;
  const damaged = makeSpotting(operational.terrain, profiles);
  acquire(damaged, [sender, receiver, target]);
  assert.equal(damaged.getContactForUnit(receiver, target), null);

  receiver.vehicleComponents.radio.operational = true;
  receiver.roster[0].status = 'KIA';
  receiver.roster[0].health = 0;
  const operatorLost = makeSpotting(operational.terrain, profiles);
  acquire(operatorLost, [sender, receiver, target]);
  assert.equal(operatorLost.getContactForUnit(receiver, target), null);

  receiver.roster[0].status = 'OK';
  receiver.roster[0].health = 100;
  const wrongNet = makeSpotting(operational.terrain, [
    profiles[0],
    { id: 'receiver', communications: { commandNetId: 'other-net' } }
  ]);
  acquire(wrongNet, [sender, receiver, target]);
  assert.equal(wrongNet.getContactForUnit(receiver, target), null);
});

test('vehicle radio components follow explicit catalog installation metadata', () => {
  for (const vehicle of Object.values(VEHICLES)) {
    assert.equal(typeof vehicle.communications.radioInstalled, 'boolean');
    assert.ok(Array.isArray(vehicle.communications.operatorRoles));
    const components = createVehicleComponents(vehicle);
    assert.equal(components.radio.installed, vehicle.communications.radioInstalled);
  }
  assert.equal(VEHICLES.RENAULT_R35.communications.radioInstalled, false);
  assert.equal(VEHICLES.OPEL_BLITZ.communications.radioInstalled, false);
  assert.equal(VEHICLES.PANZER_III_D.communications.radioInstalled, true);
  assert.deepEqual(
    VEHICLES.PANZER_III_D.communications.operatorRoles,
    ['RADIO_OPERATOR']
  );
});

test('observation and relay results are frame-partition and unit-order independent', () => {
  const sender = makeUnit({ id: 'sender', faction: 'blue', x: 0, z: 0 });
  const receiver = makeUnit({ id: 'receiver', faction: 'blue', x: 18, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const terrain = makeTerrain([blockingWall]);
  const whole = makeSpotting(terrain);
  const partitioned = makeSpotting(terrain);

  whole.advance([receiver, target, sender], 4);
  for (let step = 0; step < 40; step++) {
    partitioned.advance([sender, target, receiver], 0.1);
  }

  const wholeObservation = whole.getObservation('sender', 0, 'target');
  const partitionedObservation = partitioned.getObservation('sender', 0, 'target');
  assert.ok(Math.abs(wholeObservation.acquisition - partitionedObservation.acquisition) < 1e-10);
  assert.equal(wholeObservation.visibleNow, partitionedObservation.visibleNow);
  assert.deepEqual(wholeObservation.lastSeenPosition, partitionedObservation.lastSeenPosition);
  const wholeContact = whole.getContactForUnit(receiver, target);
  const partitionedContact = partitioned.getContactForUnit(receiver, target);
  assert.deepEqual(
    {
      ...wholeContact,
      observedAt: 0,
      updatedAt: 0
    },
    {
      ...partitionedContact,
      observedAt: 0,
      updatedAt: 0
    }
  );
  assert.ok(Math.abs(wholeContact.observedAt - partitionedContact.observedAt) < 1e-10);
  assert.ok(Math.abs(wholeContact.updatedAt - partitionedContact.updatedAt) < 1e-10);
});

test('last-known contact position freezes under occlusion, then confidence decays and uncertainty grows', () => {
  const terrain = makeTerrain();
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 0, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const spotting = makeSpotting(terrain);

  acquire(spotting, [observer, target]);
  const seen = spotting.getContactForUnit(observer, target);
  terrain.bocageObstacles.push({
    minX: -2,
    maxX: 2,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  });
  target.position.set(0, 0, 80);
  spotting.advance([observer, target], 10);
  const stale = spotting.getContactForUnit(observer, target);

  assert.deepEqual(stale.position, seen.position);
  assert.equal(stale.observedAt, seen.observedAt);
  assert.ok(stale.confidence < seen.confidence);
  assert.ok(stale.uncertaintyM > seen.uncertaintyM);
  spotting.advance([observer, target], 51);
  assert.equal(spotting.getContactForUnit(observer, target), null);
});

test('capture and restore deep-copy acquisition and contact state', () => {
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 0, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const original = makeSpotting();
  acquire(original, [observer, target]);
  const snapshot = original.captureState();
  const restored = makeSpotting();

  restored.restoreState(snapshot);
  assert.deepEqual(restored.captureState(), snapshot);
  snapshot.observations[0].lastSeenPosition[0] = 999;
  snapshot.contacts[0].contact.position[0] = 999;
  assert.notEqual(restored.captureState().observations[0].lastSeenPosition[0], 999);
  assert.notEqual(restored.captureState().contacts[0].contact.position[0], 999);
});
