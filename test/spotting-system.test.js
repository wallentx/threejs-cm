import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { createVehicleComponents } from '../src/game/VehicleSystems.js';
import { CONTACT_CHANNEL } from '../src/simulation/observation/ContactState.js';
import {
  OBSERVATION_EQUIPMENT,
  observerHasEquipment
} from '../src/simulation/observation/ObservationEquipment.js';
import {
  COMMUNICATION_RELAY_DELAY_APPROXIMATION
} from '../src/simulation/observation/CommunicationRelayQueue.js';

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

function makeSpotting(
  terrain = makeTerrain(),
  unitProfiles = [],
  settings = {}
) {
  return new SpottingSystem(null, terrain, {
    unitProfiles,
    settings: {
      baseAcquisitionSeconds: 0.5,
      terrainSampleMeters: 2.5,
      ...settings
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

test('a replacement gunner loses commander-owned binocular observation', () => {
  const panzer = new Unit({
    id: 'replacement_observer',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_III_D',
    position: new THREE.Vector3()
  });
  const target = makeUnit({
    id: 'replacement_observer_target',
    faction: 'french',
    x: 0,
    z: 130
  });
  const commander = panzer.roster.find(crewman => crewman.role === 'COMMANDER');
  const gunner = panzer.roster.find(crewman => crewman.role === 'GUNNER');
  assert.ok(commander);
  assert.ok(gunner);
  assert.equal(
    observerHasEquipment(
      panzer,
      commander,
      OBSERVATION_EQUIPMENT.BINOCULARS
    ),
    true
  );

  const before = makeSpotting();
  before.advance([panzer, target], 0.8);
  const commanderObservation = before.getObservation(panzer.id, commander.id, target.id);

  gunner.health = 0;
  gunner.status = 'KIA';
  panzer.updateVehicleSystems(5);
  assert.equal(panzer.getEffectiveCrewRole(commander), null);
  assert.equal(
    observerHasEquipment(
      panzer,
      commander,
      OBSERVATION_EQUIPMENT.BINOCULARS
    ),
    false,
    'a transferring commander must not retain role-owned binoculars'
  );
  panzer.updateVehicleSystems(7);
  assert.equal(panzer.getEffectiveCrewRole(commander), 'GUNNER');
  assert.equal(
    observerHasEquipment(
      panzer,
      commander,
      OBSERVATION_EQUIPMENT.BINOCULARS
    ),
    false
  );

  const after = makeSpotting();
  after.advance([panzer, target], 0.8);
  const replacementObservation = after.getObservation(panzer.id, commander.id, target.id);
  assert.ok(replacementObservation.acquisition < commanderObservation.acquisition);
  assert.equal(commanderObservation.visibleNow, true);
  assert.equal(replacementObservation.visibleNow, false);
});

test('relay delay defaults are positive, rollback-visible gameplay approximations', () => {
  const state = makeSpotting().captureState();
  assert.equal(state.relayPolicy.voiceDelaySeconds, 1.5);
  assert.equal(state.relayPolicy.radioDelaySeconds, 3);
  assert.ok(state.relayPolicy.voiceDelaySeconds > 0);
  assert.ok(state.relayPolicy.radioDelaySeconds > 0);
  assert.equal(
    state.relayPolicy.approximationLabel,
    COMMUNICATION_RELAY_DELAY_APPROXIMATION
  );
  assert.throws(
    () => makeSpotting(makeTerrain(), [], { voiceRelayDelaySeconds: 0 }),
    /voiceRelayDelaySeconds must be positive/
  );
  assert.throws(
    () => makeSpotting(makeTerrain(), [], { radioRelayDelaySeconds: 0 }),
    /radioRelayDelaySeconds must be positive/
  );
});

test('first report waits from exact acquisition time and prefers voice over radio', () => {
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
    x: 18,
    z: 0,
    role: 'RADIO_OPERATOR',
    type: 'vehicle',
    vehicleRadio: true
  });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const profiles = [
    { id: sender.id, communications: { commandNetId: 'blue-net' } },
    { id: receiver.id, communications: { commandNetId: 'blue-net' } }
  ];
  const voiceDelaySeconds = 2;
  const spotting = makeSpotting(
    makeTerrain([blockingWall]),
    profiles,
    {
      voiceRelayDelaySeconds: voiceDelaySeconds,
      radioRelayDelaySeconds: 4
    }
  );
  const requiredSeconds = spotting.evaluateObservation(
    sender,
    sender.roster[0],
    target,
    false
  ).acquisitionSeconds;
  const acquiredAt = Math.round(requiredSeconds * 1e9) / 1e9;

  spotting.advance(
    [receiver, target, sender],
    acquiredAt + voiceDelaySeconds / 2
  );
  assert.equal(spotting.getContactForUnit(sender, target).channel, CONTACT_CHANNEL.DIRECT);
  assert.equal(spotting.getContactForUnit(receiver, target), null);
  assert.equal(spotting.canPrecisionTarget(receiver, target), false);

  let state = spotting.captureState();
  assert.equal(state.version, 3);
  assert.deepEqual(state.relayPolicy, {
    approximationLabel: COMMUNICATION_RELAY_DELAY_APPROXIMATION,
    voiceDelaySeconds,
    radioDelaySeconds: 4
  });
  assert.equal(state.relayQueue.pendingReports.length, 1);
  assert.equal(state.relayQueue.deliveredEpisodeWatermarks.length, 0);
  assert.equal(state.relayQueue.pendingReports[0].channel, CONTACT_CHANNEL.VOICE);
  assert.equal(state.relayQueue.pendingReports[0].acquiredAt, acquiredAt);
  const dueAt = Math.round(
    (acquiredAt + voiceDelaySeconds) * 1e9
  ) / 1e9;
  assert.equal(
    state.relayQueue.pendingReports[0].dueAt,
    dueAt
  );
  assert.equal(
    state.relayQueue.pendingReports[0].approximationLabel,
    COMMUNICATION_RELAY_DELAY_APPROXIMATION
  );

  spotting.advance([sender, target, receiver], voiceDelaySeconds / 2 - 0.000001);
  assert.equal(spotting.getContactForUnit(receiver, target), null);
  spotting.advance([target, receiver, sender], 0.000001);

  const relayed = spotting.getContactForUnit(receiver, target);
  assert.equal(relayed.channel, CONTACT_CHANNEL.VOICE);
  assert.equal(relayed.observedAt, acquiredAt);
  assert.equal(relayed.updatedAt, dueAt);
  assert.equal(relayed.confidence, 0.92);
  assert.equal(relayed.uncertaintyM, 1);
  assert.equal(
    relayed.approximationLabel,
    COMMUNICATION_RELAY_DELAY_APPROXIMATION
  );
  assert.equal(spotting.canPrecisionTarget(receiver, target), false);

  state = spotting.captureState();
  assert.equal(state.relayQueue.pendingReports.length, 0);
  assert.equal(state.relayQueue.deliveredEpisodeWatermarks.length, 1);
  const deliveredAt = relayed.updatedAt;
  spotting.advance([receiver, sender, target], 1);
  assert.equal(
    spotting.getContactForUnit(receiver, target).updatedAt,
    deliveredAt,
    'one direct-visibility episode must not refresh the report'
  );
  assert.equal(
    spotting.captureState().relayQueue.deliveredEpisodeWatermarks.length,
    1
  );
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

  const interrupted = makeSpotting(operational.terrain, profiles);
  interrupted.advance([target, sender, receiver], 1.5);
  assert.equal(interrupted.getContactForUnit(receiver, target), null);
  assert.equal(
    interrupted.captureState().relayQueue.pendingReports[0].channel,
    CONTACT_CHANNEL.RADIO
  );
  receiver.vehicleComponents.radio.operational = false;
  interrupted.advance([receiver, sender, target], 3);
  assert.equal(interrupted.getContactForUnit(receiver, target), null);
  assert.equal(interrupted.captureState().relayQueue.pendingReports.length, 0);

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

test('endpoint loss cancels a pending route until a later acquisition episode', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({ id: 'sender', faction: 'blue', x: 0, z: 0 });
  const receiver = makeUnit({ id: 'receiver', faction: 'blue', x: 12, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const units = [sender, receiver, target];
  const spotting = makeSpotting(terrain, [], {
    voiceRelayDelaySeconds: 2
  });
  const acquiredAt = Math.round(spotting.evaluateObservation(
    sender,
    sender.roster[0],
    target,
    false
  ).acquisitionSeconds * 1e9) / 1e9;

  spotting.advance(units, acquiredAt + 0.5);
  assert.equal(spotting.captureState().relayQueue.pendingReports.length, 1);
  receiver.roster[0].health = 0;
  receiver.roster[0].status = 'KIA';
  spotting.advance(units, 0.1);
  assert.equal(spotting.captureState().relayQueue.pendingReports.length, 0);

  receiver.roster[0].health = 100;
  receiver.roster[0].status = 'OK';
  spotting.advance(units, 5);
  assert.equal(spotting.getContactForUnit(receiver, target), null);
  assert.equal(
    spotting.captureState().relayQueue.deliveredEpisodeWatermarks.length,
    0
  );

  const senderBlockingWall = {
    minX: -1,
    maxX: 1,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  };
  terrain.bocageObstacles.push(senderBlockingWall);
  spotting.advance(units, 0);
  assert.equal(spotting.canPrecisionTarget(sender, target), false);
  terrain.bocageObstacles.pop();
  spotting.advance(units, 0);

  let state = spotting.captureState();
  const episode = state.directObservationEpisodes.find(saved =>
    saved.senderUnitId === sender.id && saved.targetUnitId === target.id
  );
  assert.equal(episode.episodeSequence, 2);
  assert.equal(state.relayQueue.pendingReports.length, 1);
  spotting.advance(units, 2);
  assert.equal(
    spotting.getContactForUnit(receiver, target).channel,
    CONTACT_CHANNEL.VOICE
  );
  state = spotting.captureState();
  assert.equal(state.relayQueue.pendingReports.length, 0);
  assert.equal(
    state.relayQueue.deliveredEpisodeWatermarks[0].episodeSequence,
    2
  );
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
  for (let step = 0; step < 240; step++) {
    partitioned.advance([sender, target, receiver], 1 / 60);
  }

  assert.deepEqual(
    whole.captureState(),
    partitioned.captureState(),
    'whole, partitioned, and reversed-unit-order spotting state must be byte equal'
  );
  const wholeContact = whole.getContactForUnit(receiver, target);
  const partitionedContact = partitioned.getContactForUnit(receiver, target);
  assert.deepEqual(wholeContact, partitionedContact);
  assert.ok(wholeContact.confidence < 0.92);
  assert.ok(wholeContact.uncertaintyM > 1);
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

test('direct and relayed contacts retain the actually observed infantryman position', () => {
  const observer = makeUnit({ id: 'observer', faction: 'blue', x: 0, z: 0 });
  const receiver = makeUnit({ id: 'receiver', faction: 'blue', x: 12, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 80 });
  target.roster = [
    { id: 'far', role: 'RIFLEMAN', status: 'OK', health: 100, worldPosition: [0, 0, 105] },
    { id: 'seen', role: 'RIFLEMAN', status: 'OK', health: 100, worldPosition: [0, 0, 35] }
  ];
  const spotting = makeSpotting(makeTerrain([{
    minX: 6, maxX: 18, minZ: 1, maxZ: 60, height: 4, type: 'wall'
  }]));
  acquire(spotting, [target, receiver, observer], 4);

  const direct = spotting.getContactForUnit(observer, target);
  const relayed = spotting.getContactForUnit(receiver, target);
  assert.deepEqual(direct.position, [0, 0, 35]);
  assert.equal(direct.targetSoldierId, 'seen');
  assert.deepEqual(relayed.position, direct.position);
  assert.equal(relayed.targetSoldierId, 'seen');
  assert.equal(relayed.channel, CONTACT_CHANNEL.VOICE);

  const observation = spotting.getObservation('observer', 0, 'target');
  assert.deepEqual(observation.lastSeenPosition, [0, 0, 35]);
  assert.equal(observation.lastSeenTargetSoldierId, 'seen');
});

test('queued reports retain acquisition position without delivery-time visibility polling', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({ id: 'sender', faction: 'blue', x: 0, z: 0 });
  const receiver = makeUnit({ id: 'receiver', faction: 'blue', x: 12, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const units = [sender, receiver, target];
  const spotting = makeSpotting(terrain, [], {
    voiceRelayDelaySeconds: 2
  });
  const acquiredAt = Math.round(spotting.evaluateObservation(
    sender,
    sender.roster[0],
    target,
    false
  ).acquisitionSeconds * 1e9) / 1e9;

  spotting.advance(units, acquiredAt + 0.5);
  const pending = spotting.captureState().relayQueue.pendingReports[0];
  assert.deepEqual(pending.position, [0, 0, 40]);

  target.position.set(0, 0, 80);
  terrain.bocageObstacles.push({
    minX: -1,
    maxX: 1,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  });
  spotting.advance(units, 1.5);

  assert.equal(spotting.canPrecisionTarget(sender, target), false);
  const relayed = spotting.getContactForUnit(receiver, target);
  assert.deepEqual(relayed.position, [0, 0, 40]);
  assert.notDeepEqual(relayed.position, [target.position.x, target.position.y, target.position.z]);
  assert.equal(relayed.targetSoldierId, 0);
  assert.equal(relayed.observedAt, acquiredAt);
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
  snapshot.directObservationEpisodes[0].position[0] = 999;
  assert.notEqual(restored.captureState().observations[0].lastSeenPosition[0], 999);
  assert.notEqual(restored.captureState().contacts[0].contact.position[0], 999);
  assert.notEqual(
    restored.captureState().directObservationEpisodes[0].position[0],
    999
  );
});

test('mid-delay rollback replays exactly and legacy spotting states restore safely', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({ id: 'sender', faction: 'blue', x: 0, z: 0 });
  const receiver = makeUnit({ id: 'receiver', faction: 'blue', x: 12, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const units = [sender, receiver, target];
  const original = makeSpotting(terrain, [], {
    voiceRelayDelaySeconds: 4,
    radioRelayDelaySeconds: 6
  });
  const acquiredAt = Math.round(original.evaluateObservation(
    sender,
    sender.roster[0],
    target,
    false
  ).acquisitionSeconds * 1e9) / 1e9;
  original.advance(units, acquiredAt + 1);

  const midDelay = original.captureState();
  assert.equal(midDelay.relayQueue.pendingReports.length, 1);
  const restored = makeSpotting(terrain);
  restored.restoreState(midDelay);
  assert.deepEqual(restored.captureState(), midDelay);

  midDelay.relayQueue.pendingReports[0].position[0] = 999;
  const snapshottedObservation = midDelay.observations.find(
    saved => saved.directEpisodeSnapshot
  );
  snapshottedObservation.directEpisodeSnapshot.position[0] = 999;
  midDelay.directObservationEpisodes[0].position[0] = 999;
  const restoredCopy = restored.captureState();
  assert.notEqual(restoredCopy.relayQueue.pendingReports[0].position[0], 999);
  assert.notEqual(
    restoredCopy.observations.find(
      saved => saved.observerUnitId === snapshottedObservation.observerUnitId
        && saved.observerSoldierId === snapshottedObservation.observerSoldierId
        && saved.targetUnitId === snapshottedObservation.targetUnitId
    ).directEpisodeSnapshot.position[0],
    999
  );
  assert.notEqual(restoredCopy.directObservationEpisodes[0].position[0], 999);

  original.advance([receiver, target, sender], 4);
  restored.advance([target, sender, receiver], 4);
  assert.deepEqual(restored.captureState(), original.captureState());
  assert.equal(
    restored.getContactForUnit(receiver, target).channel,
    CONTACT_CHANNEL.VOICE
  );

  const legacySource = restoredCopy;
  for (const version of [1, 2]) {
    const legacy = {
      version,
      time: legacySource.time,
      observations: legacySource.observations.map(saved => {
        const {
          directEpisodeSequence: _sequence,
          directEpisodeActive: _active,
          directEpisodeAcquiredAt: _acquiredAt,
          directEpisodeSnapshot: _snapshot,
          ...oldObservation
        } = saved;
        return oldObservation;
      }),
      contacts: legacySource.contacts
    };
    const compatible = makeSpotting(terrain, [], {
      voiceRelayDelaySeconds: 7,
      radioRelayDelaySeconds: 8
    });
    compatible.restoreState(legacy);
    const compatibleState = compatible.captureState();
    assert.equal(compatibleState.version, 3);
    assert.equal(compatibleState.relayQueue.pendingReports.length, 0);
    assert.equal(
      compatibleState.relayQueue.deliveredEpisodeWatermarks.length,
      0
    );
    assert.ok(
      compatibleState.directObservationEpisodes.every(
        episode => episode.episodeSequence === 0
      )
    );
    compatible.advance(units, 10);
    assert.equal(compatible.getContactForUnit(receiver, target), null);
  }

  assert.throws(
    () => makeSpotting().restoreState({ version: 4 }),
    /unsupported spotting state version 4/
  );
});

test('30 Hz mid-delay rollback preserves the authoritative fractional clock', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({ id: 'sender', faction: 'blue', x: 0, z: 0 });
  const receiver = makeUnit({ id: 'receiver', faction: 'blue', x: 12, z: 0 });
  const target = makeUnit({ id: 'target', faction: 'red', x: 0, z: 40 });
  const units = [sender, receiver, target];
  const original = makeSpotting(terrain, [], {
    voiceRelayDelaySeconds: 2
  });
  const acquiredAt = Math.round(original.evaluateObservation(
    sender,
    sender.roster[0],
    target,
    false
  ).acquisitionSeconds * 1e9) / 1e9;

  original.advance(units, acquiredAt);
  original.advance(units, 1 / 30);
  const midDelay = original.captureState();
  assert.equal(midDelay.relayQueue.pendingReports.length, 1);
  assert.notEqual(
    midDelay.timeAccumulator,
    midDelay.time,
    'the snapshot must retain the sub-nanosecond fraction hidden by public time'
  );

  const restored = makeSpotting(terrain);
  restored.restoreState(midDelay);
  assert.deepEqual(restored.captureState(), midDelay);

  original.advance([receiver, target, sender], 1 / 30);
  restored.advance([target, sender, receiver], 1 / 30);
  assert.deepEqual(
    restored.captureState(),
    original.captureState(),
    'the first post-restore fixed step must not lose the captured clock fraction'
  );

  for (let step = 0; step < 58; step++) {
    original.advance([sender, receiver, target], 1 / 30);
    restored.advance([target, receiver, sender], 1 / 30);
  }
  assert.deepEqual(restored.captureState(), original.captureState());
  assert.equal(
    restored.getContactForUnit(receiver, target).channel,
    CONTACT_CHANNEL.VOICE
  );
  assert.equal(
    restored.getContactForUnit(receiver, target).updatedAt,
    Math.round((acquiredAt + 2) * 1e9) / 1e9
  );
});
