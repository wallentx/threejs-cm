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
import {
  IDENTIFICATION_QUALITY_APPROXIMATION,
  IDENTIFICATION_QUALITY_POLICY,
  IDENTIFICATION_TIER,
  beginVisualIdentification,
  decayIdentification,
  progressIdentification
} from '../src/simulation/observation/IdentificationQuality.js';

const VISIBILITY_GRACE_NANOSECONDS = 150_000_000;

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

function advancePartitioned(spotting, units, seconds, frequency) {
  let previousTime = 0;
  const steps = Math.ceil(seconds * frequency);
  for (let index = 1; index <= steps; index++) {
    const nextTime = Math.round(
      Math.min(seconds, index / frequency) * 1e9
    ) / 1e9;
    spotting.advance(
      index % 2 === 0 ? units : [...units].reverse(),
      nextTime - previousTime
    );
    previousTime = nextTime;
  }
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

test('direct render visibility grace survives one LOS miss without precision leakage and expires', () => {
  const terrain = makeTerrain();
  const observer = makeUnit({
    id: 'grace-observer',
    faction: 'blue',
    x: 0,
    z: 0
  });
  const target = makeUnit({
    id: 'grace-target',
    faction: 'red',
    x: 0,
    z: 40
  });
  const units = [observer, target];
  const spotting = makeSpotting(terrain);
  acquire(spotting, units);

  const acquired = spotting.getObservation(observer.id, 0, target.id);
  assert.equal(acquired.visibleNow, true);
  assert.equal(
    acquired.visibilityGraceRemainingNanoseconds,
    VISIBILITY_GRACE_NANOSECONDS
  );
  const occludingWall = {
    minX: -2,
    maxX: 2,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  };
  terrain.bocageObstacles.push(occludingWall);

  spotting.advance(units, 1 / 60);

  const missed = spotting.getObservation(observer.id, 0, target.id);
  assert.equal(missed.visibleNow, false);
  assert.equal(missed.directEpisodeActive, false);
  assert.equal(spotting.hasDirectObservation(observer, target), false);
  assert.equal(spotting.canPrecisionTarget(observer, target), false);
  assert.ok(missed.identificationProgress < acquired.identificationProgress);
  assert.equal(
    missed.visibilityGraceRemainingNanoseconds,
    133_333_333
  );
  assert.equal(
    spotting.captureState().directObservationEpisodes.find(
      episode => episode.senderUnitId === observer.id
        && episode.targetUnitId === target.id
    ).active,
    false
  );
  assert.ok(
    spotting
      .getVisibilityProjection(observer.faction, units)
      .visibleUnitIds
      .includes(target.id)
  );

  terrain.bocageObstacles.pop();
  spotting.advance(units, 1 / 60);
  const reacquired = spotting.getObservation(observer.id, 0, target.id);
  assert.equal(reacquired.visibleNow, true);
  assert.equal(
    reacquired.visibilityGraceRemainingNanoseconds,
    VISIBILITY_GRACE_NANOSECONDS
  );

  terrain.bocageObstacles.push(occludingWall);
  spotting.advance(units, 0.2);

  assert.equal(
    spotting.getObservation(observer.id, 0, target.id)
      .visibilityGraceRemainingNanoseconds,
    0
  );
  assert.equal(spotting.hasContact(observer, target), true);
  assert.equal(
    spotting
      .getVisibilityProjection(observer.faction, units)
      .visibleUnitIds
      .includes(target.id),
    false,
    'the independent 60-second contact memory must not keep a mesh visible'
  );
});

test('visibility grace advances safely when an acquired target is not updated', () => {
  const terrain = makeTerrain();
  const observer = makeUnit({
    id: 'not-updated-observer',
    faction: 'blue',
    x: 0,
    z: 0
  });
  const target = makeUnit({
    id: 'not-updated-target',
    faction: 'red',
    x: 0,
    z: 40
  });
  const units = [observer, target];
  const spotting = makeSpotting(terrain);
  acquire(spotting, units);

  target.roster[0].health = 0;
  target.roster[0].status = 'KIA';
  spotting.advance(units, 0.05);

  const duringGrace = spotting.getObservation(observer.id, 0, target.id);
  assert.equal(duringGrace.visibleNow, false);
  assert.equal(duringGrace.directEpisodeActive, false);
  assert.equal(
    duringGrace.visibilityGraceRemainingNanoseconds,
    100_000_000
  );
  assert.ok(
    spotting
      .getVisibilityProjection(observer.faction, units)
      .visibleUnitIds
      .includes(target.id)
  );

  spotting.advance(units, 0.1);
  assert.equal(
    spotting.getObservation(observer.id, 0, target.id)
      .visibilityGraceRemainingNanoseconds,
    0
  );
  assert.equal(
    spotting
      .getVisibilityProjection(observer.faction, units)
      .visibleUnitIds
      .includes(target.id),
    false
  );
});

test('relayed and stale contacts remain hidden after direct render grace expires', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({
    id: 'grace-sender',
    faction: 'blue',
    x: 0,
    z: 0
  });
  const receiver = makeUnit({
    id: 'grace-receiver',
    faction: 'blue',
    x: 12,
    z: 0
  });
  const target = makeUnit({
    id: 'grace-relay-target',
    faction: 'red',
    x: 0,
    z: 40
  });
  const units = [sender, receiver, target];
  const spotting = makeSpotting(terrain);
  acquire(spotting, units);
  assert.equal(
    spotting.getContactForUnit(receiver, target).channel,
    CONTACT_CHANNEL.VOICE
  );

  terrain.bocageObstacles.push({
    minX: -2,
    maxX: 2,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  });
  spotting.advance(units, 0.151);

  const projection = spotting.getVisibilityProjection('blue', units);
  assert.equal(spotting.hasContact(sender, target), true);
  assert.equal(spotting.hasContact(receiver, target), true);
  assert.ok(
    projection.contacts.some(contact => contact.targetUnitId === target.id)
  );
  assert.equal(projection.visibleUnitIds.includes(target.id), false);
});

test('visibility grace is byte-identical across 30 Hz and 60 Hz partitions', () => {
  function fixture() {
    const terrain = makeTerrain();
    const observer = makeUnit({
      id: 'partition-observer',
      faction: 'blue',
      x: 0,
      z: 0
    });
    const target = makeUnit({
      id: 'partition-target',
      faction: 'red',
      x: 0,
      z: 40
    });
    const units = [observer, target];
    const spotting = makeSpotting(terrain);
    acquire(spotting, units);
    terrain.bocageObstacles.push({
      minX: -2,
      maxX: 2,
      minZ: 10,
      maxZ: 12,
      height: 4,
      type: 'wall'
    });
    return { observer, target, units, spotting };
  }

  const hz30 = fixture();
  const hz60 = fixture();
  advancePartitioned(hz30.spotting, hz30.units, 0.1, 30);
  advancePartitioned(hz60.spotting, hz60.units, 0.1, 60);

  assert.deepEqual(hz30.spotting.captureState(), hz60.spotting.captureState());
  assert.equal(
    hz30.spotting.getObservation(
      hz30.observer.id,
      0,
      hz30.target.id
    ).visibilityGraceRemainingNanoseconds,
    50_000_000
  );
  assert.deepEqual(
    hz30.spotting.getVisibilityProjection('blue', hz30.units),
    hz60.spotting.getVisibilityProjection('blue', hz60.units)
  );
});

test('capture and restore preserve deep state during visibility grace', () => {
  const terrain = makeTerrain();
  const observer = makeUnit({
    id: 'grace-rollback-observer',
    faction: 'blue',
    x: 0,
    z: 0
  });
  const target = makeUnit({
    id: 'grace-rollback-target',
    faction: 'red',
    x: 0,
    z: 40
  });
  const units = [observer, target];
  const original = makeSpotting(terrain);
  acquire(original, units);
  terrain.bocageObstacles.push({
    minX: -2,
    maxX: 2,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  });
  original.advance(units, 0.05);

  const snapshot = original.captureState();
  const expected = structuredClone(snapshot);
  const restored = makeSpotting(terrain);
  restored.restoreState(snapshot);
  assert.deepEqual(restored.captureState(), expected);
  const savedObservation = snapshot.observations.find(
    observation => observation.observerUnitId === observer.id
      && observation.targetUnitId === target.id
  );
  assert.equal(
    savedObservation.visibilityGraceRemainingNanoseconds,
    100_000_000
  );
  savedObservation.visibilityGraceRemainingNanoseconds = 0;
  savedObservation.lastSeenPosition[0] = 999;
  const restoredObservation = restored.getObservation(
    observer.id,
    0,
    target.id
  );
  assert.equal(
    restoredObservation.visibilityGraceRemainingNanoseconds,
    100_000_000
  );
  assert.notEqual(restoredObservation.lastSeenPosition[0], 999);

  original.advance(units, 0.1);
  restored.advance([...units].reverse(), 0.1);
  assert.deepEqual(restored.captureState(), original.captureState());
  assert.equal(
    restored
      .getVisibilityProjection(observer.faction, units)
      .visibleUnitIds
      .includes(target.id),
    false
  );
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
  assert.equal(state.version, 5);
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

test('direct identification credits only post-acquisition time and relays the frozen boundary quality', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({
    id: 'sender',
    faction: 'blue',
    x: 0,
    z: 0
  });
  const receiver = makeUnit({
    id: 'receiver',
    faction: 'blue',
    x: 12,
    z: 0
  });
  const target = makeUnit({
    id: 'target',
    faction: 'red',
    x: 0,
    z: 40
  });
  const units = [sender, receiver, target];
  const relayDelay = 5;
  const spotting = makeSpotting(terrain, [], {
    voiceRelayDelaySeconds: relayDelay
  });
  const requiredSeconds = Math.round(spotting.evaluateObservation(
    sender,
    sender.roster[0],
    target,
    false
  ).acquisitionSeconds * 1e9) / 1e9;
  const postAcquisitionSeconds = 1.123456789;

  spotting.advance(
    units,
    requiredSeconds + postAcquisitionSeconds
  );

  const acquiredProgress = beginVisualIdentification(0);
  const expectedDirect = progressIdentification(
    acquiredProgress,
    postAcquisitionSeconds
  );
  const observation = spotting.getObservation(
    sender.id,
    sender.roster[0].id,
    target.id
  );
  assert.equal(observation.identificationProgress, expectedDirect);
  assert.equal(
    observation.identificationTier,
    IDENTIFICATION_TIER.DEVELOPING
  );
  assert.equal(
    observation.identificationApproximationLabel,
    IDENTIFICATION_QUALITY_APPROXIMATION
  );
  assert.equal(
    spotting.getContactForUnit(sender, target).identificationProgress,
    expectedDirect
  );

  let captured = spotting.captureState();
  assert.equal(captured.version, 5);
  assert.equal(captured.relayQueue.version, 2);
  assert.equal(captured.relayQueue.pendingReports.length, 1);
  assert.equal(
    captured.relayQueue.pendingReports[0].identificationProgress,
    acquiredProgress,
    'the first report must freeze quality at the acquisition boundary'
  );
  assert.equal(
    captured.directObservationEpisodes[0].identificationProgress,
    acquiredProgress
  );

  const frozenPosition = [
    target.position.x,
    target.position.y,
    target.position.z
  ];
  sender.position.set(2, 0, 0);
  target.position.set(0, 0, 80);
  terrain.bocageObstacles.push({
    minX: -3,
    maxX: 3,
    minZ: 10,
    maxZ: 12,
    height: 4,
    type: 'wall'
  });
  const dueAt = captured.relayQueue.pendingReports[0].dueAt;
  spotting.advance(units, dueAt - spotting.time);

  const relayed = spotting.getContactForUnit(receiver, target);
  assert.equal(relayed.channel, CONTACT_CHANNEL.VOICE);
  assert.equal(
    relayed.identificationProgress,
    decayIdentification(acquiredProgress, relayDelay)
  );
  assert.ok(relayed.identificationProgress <= acquiredProgress);
  assert.deepEqual(relayed.position, frozenPosition);
  assert.equal(spotting.canPrecisionTarget(receiver, target), false);
  assert.equal(
    spotting.getVisibilityProjection('blue', units).visibleUnitIds.includes(
      target.id
    ),
    false
  );
  for (const leaked of [
    'targetType',
    'targetModel',
    'targetRoster',
    'targetSoldier'
  ]) {
    assert.equal(Object.hasOwn(relayed, leaked), false);
  }

  captured = spotting.captureState();
  assert.equal(captured.relayQueue.pendingReports.length, 0);
  assert.equal(
    captured.contacts.find(entry =>
      entry.unitId === receiver.id
        && entry.contact.targetUnitId === target.id
    ).contact.identificationProgress,
    relayed.identificationProgress
  );

  const elevatedState = structuredClone(captured);
  const elevated = elevatedState.contacts.find(entry =>
    entry.unitId === receiver.id
      && entry.contact.targetUnitId === target.id
  ).contact;
  const originalUncertainty = elevated.uncertaintyM;
  elevated.identificationProgress = 1;
  elevated.identificationTier = IDENTIFICATION_TIER.CONFIRMED;
  const elevatedRestore = makeSpotting(terrain);
  elevatedRestore.restoreState(elevatedState);
  const elevatedContact = elevatedRestore.getContactForUnit(receiver, target);
  assert.equal(elevatedContact.identificationProgress, 1);
  assert.equal(elevatedContact.uncertaintyM, originalUncertainty);
  assert.deepEqual(elevatedContact.position, frozenPosition);
  assert.equal(elevatedRestore.canPrecisionTarget(receiver, target), false);
  assert.equal(
    elevatedRestore.getVisibilityProjection('blue', units)
      .visibleUnitIds.includes(target.id),
    false
  );
});

test('identification acquisition, decay, and reacquisition are byte-identical for whole, 30 Hz, and 60 Hz advances', () => {
  function setup() {
    const terrain = makeTerrain([blockingWall]);
    const sender = makeUnit({
      id: 'sender',
      faction: 'blue',
      x: 0,
      z: 0
    });
    const receiver = makeUnit({
      id: 'receiver',
      faction: 'blue',
      x: 12,
      z: 0
    });
    const target = makeUnit({
      id: 'target',
      faction: 'red',
      x: 0,
      z: 40
    });
    return {
      terrain,
      units: [sender, receiver, target],
      spotting: makeSpotting(terrain, [], {
        voiceRelayDelaySeconds: 20
      })
    };
  }

  const whole = setup();
  const hz30 = setup();
  const hz60 = setup();
  const requiredSeconds = Math.round(whole.spotting.evaluateObservation(
    whole.units[0],
    whole.units[0].roster[0],
    whole.units[2],
    false
  ).acquisitionSeconds * 1e9) / 1e9;

  const visibleDuration = requiredSeconds + 2.123456789;
  whole.spotting.advance(whole.units, visibleDuration);
  advancePartitioned(hz30.spotting, hz30.units, visibleDuration, 30);
  advancePartitioned(hz60.spotting, hz60.units, visibleDuration, 60);
  const midProgression = whole.spotting.captureState();
  assert.deepEqual(hz30.spotting.captureState(), midProgression);
  assert.deepEqual(hz60.spotting.captureState(), midProgression);
  const replay = setup();
  replay.spotting.restoreState(midProgression);
  assert.deepEqual(replay.spotting.captureState(), midProgression);

  for (const fixture of [whole, hz30, hz60, replay]) {
    fixture.terrain.bocageObstacles.push({
      minX: -1,
      maxX: 1,
      minZ: 10,
      maxZ: 12,
      height: 4,
      type: 'wall'
    });
  }
  const occludedDuration = 1.987654321;
  whole.spotting.advance(whole.units, occludedDuration);
  advancePartitioned(hz30.spotting, hz30.units, occludedDuration, 30);
  advancePartitioned(hz60.spotting, hz60.units, occludedDuration, 60);
  replay.spotting.advance(replay.units, occludedDuration);
  assert.deepEqual(hz30.spotting.captureState(), whole.spotting.captureState());
  assert.deepEqual(hz60.spotting.captureState(), whole.spotting.captureState());
  assert.deepEqual(replay.spotting.captureState(), whole.spotting.captureState());
  const stalePosition = whole.spotting.getContactForUnit('sender', 'target')
    .position;
  assert.deepEqual(stalePosition, [0, 0, 40]);

  for (const fixture of [whole, hz30, hz60, replay]) {
    fixture.terrain.bocageObstacles.pop();
  }
  const reacquisitionDuration = requiredSeconds + 0.765432109;
  whole.spotting.advance(whole.units, reacquisitionDuration);
  advancePartitioned(
    hz30.spotting,
    hz30.units,
    reacquisitionDuration,
    30
  );
  advancePartitioned(
    hz60.spotting,
    hz60.units,
    reacquisitionDuration,
    60
  );
  replay.spotting.advance(replay.units, reacquisitionDuration);

  const wholeState = whole.spotting.captureState();
  assert.deepEqual(hz30.spotting.captureState(), wholeState);
  assert.deepEqual(hz60.spotting.captureState(), wholeState);
  assert.deepEqual(replay.spotting.captureState(), wholeState);
  assert.deepEqual(
    hz30.spotting.getContactForUnit('sender', 'target'),
    whole.spotting.getContactForUnit('sender', 'target')
  );
  assert.deepEqual(
    hz60.spotting.getVisibilityProjection('blue', hz60.units),
    whole.spotting.getVisibilityProjection('blue', whole.units)
  );
  assert.equal(
    wholeState.directObservationEpisodes[0].episodeSequence,
    2
  );
});

test('initial and repeat acquisition change state exactly at the canonical nanosecond boundary', () => {
  const requiredSeconds = 0.656256841;
  const requiredNanoseconds = 656256841;

  function setup() {
    const terrain = makeTerrain();
    const observer = makeUnit({
      id: 'observer',
      faction: 'blue',
      x: 0,
      z: 0
    });
    const target = makeUnit({
      id: 'target',
      faction: 'red',
      x: 0,
      z: 40
    });
    const spotting = makeSpotting(terrain);
    spotting.acquisitionSeconds = () => requiredSeconds;
    return { terrain, units: [observer, target], spotting };
  }

  function targetObservation(fixture) {
    return fixture.spotting.captureState().observations.find(
      observation => observation.observerUnitId === 'observer'
        && observation.targetUnitId === 'target'
    );
  }

  function advanceVariants(duration, prepare = () => {}) {
    const whole = setup();
    const hz30 = setup();
    const hz60 = setup();
    for (const fixture of [whole, hz30, hz60]) prepare(fixture);
    whole.spotting.advance(whole.units, duration);
    advancePartitioned(hz30.spotting, hz30.units, duration, 30);
    advancePartitioned(hz60.spotting, hz60.units, duration, 60);
    const state = whole.spotting.captureState();
    assert.deepEqual(hz30.spotting.captureState(), state);
    assert.deepEqual(hz60.spotting.captureState(), state);
    return { whole, observation: targetObservation(whole) };
  }

  for (const nanosecondOffset of [-1, 0, 1]) {
    const duration =
      (requiredNanoseconds + nanosecondOffset) / 1e9;
    const initial = advanceVariants(duration);
    assert.equal(
      initial.observation.visibleNow,
      nanosecondOffset >= 0
    );
    assert.equal(
      initial.observation.directEpisodeSequence,
      nanosecondOffset >= 0 ? 1 : 0
    );
    if (nanosecondOffset === 0) {
      assert.equal(
        initial.observation.identificationProgress,
        IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
      );
    } else if (nanosecondOffset === 1) {
      assert.equal(
        initial.observation.identificationProgress,
        0.35000000025
      );
    }

    const reacquired = advanceVariants(duration, fixture => {
      fixture.spotting.advance(fixture.units, requiredSeconds);
      fixture.terrain.bocageObstacles.push({
        minX: -1,
        maxX: 1,
        minZ: 10,
        maxZ: 12,
        height: 4,
        type: 'wall'
      });
      fixture.spotting.advance(fixture.units, 2);
      fixture.terrain.bocageObstacles.length = 0;
    });
    assert.equal(
      reacquired.observation.visibleNow,
      nanosecondOffset >= 0
    );
    assert.equal(
      reacquired.observation.directEpisodeSequence,
      nanosecondOffset >= 0 ? 2 : 1
    );
    if (nanosecondOffset === 0) {
      assert.equal(
        reacquired.observation.identificationProgress,
        IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
      );
    } else if (nanosecondOffset === 1) {
      assert.equal(
        reacquired.observation.identificationProgress,
        0.35000000025
      );
    }
  }
});

test('post-acquisition identification credit is exact at small and large absolute clocks', () => {
  const requiredSeconds = 0.656256841;
  const duration = requiredSeconds + 1e-9;

  function setup(startTime) {
    const observer = makeUnit({
      id: 'observer',
      faction: 'blue',
      x: 0,
      z: 0
    });
    const target = makeUnit({
      id: 'target',
      faction: 'red',
      x: 0,
      z: 40
    });
    const spotting = makeSpotting();
    spotting.acquisitionSeconds = () => requiredSeconds;
    spotting.advance([], startTime);
    return { units: [observer, target], spotting };
  }

  for (const startTime of [0, 100000, 10000000]) {
    const whole = setup(startTime);
    const hz30 = setup(startTime);
    const hz60 = setup(startTime);
    whole.spotting.advance(whole.units, duration);
    advancePartitioned(hz30.spotting, hz30.units, duration, 30);
    advancePartitioned(hz60.spotting, hz60.units, duration, 60);
    const wholeState = whole.spotting.captureState();
    assert.deepEqual(hz30.spotting.captureState(), wholeState);
    assert.deepEqual(hz60.spotting.captureState(), wholeState);
    const observation = wholeState.observations.find(saved =>
      saved.observerUnitId === 'observer'
        && saved.targetUnitId === 'target'
    );
    assert.equal(observation.visibleNow, true);
    assert.equal(
      observation.identificationProgress,
      0.35000000025,
      `one post-boundary nanosecond must be credited at ${startTime}s`
    );
  }
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
  assert.ok(
    operational.getContactForUnit(receiver, target)
      .identificationProgress
      <= IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
  );
  assert.equal(
    operational.getContactForUnit(receiver, target)
      .identificationApproximationLabel,
    IDENTIFICATION_QUALITY_APPROXIMATION
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
          visibilityGraceRemainingNanoseconds: _visibilityGrace,
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
    assert.equal(compatibleState.version, 5);
    assert.ok(
      compatibleState.observations.every(
        observation => observation.identificationProgress === 0
          && observation.identificationTier
            === IDENTIFICATION_TIER.UNIDENTIFIED
          && observation.visibilityGraceRemainingNanoseconds
            === (
              observation.visibleNow
                ? VISIBILITY_GRACE_NANOSECONDS
                : 0
            )
      )
    );
    assert.ok(
      compatibleState.contacts.every(
        entry => entry.contact.identificationProgress === 0
          && entry.contact.identificationTier
            === IDENTIFICATION_TIER.UNIDENTIFIED
      )
    );
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
    const compatibleRoundTrip = makeSpotting(terrain);
    compatibleRoundTrip.restoreState(compatibleState);
    assert.deepEqual(
      compatibleRoundTrip.captureState(),
      compatibleState,
      `version ${version} migration must emit a strict-restorable v5 snapshot`
    );
    compatible.advance(units, 10);
    assert.equal(compatible.getContactForUnit(receiver, target), null);
  }

  const legacyThree = structuredClone(restoredCopy);
  legacyThree.version = 3;
  for (const observation of legacyThree.observations) {
    delete observation.visibilityGraceRemainingNanoseconds;
    delete observation.identificationProgress;
    delete observation.identificationTier;
    delete observation.identificationApproximationLabel;
  }
  for (const episode of legacyThree.directObservationEpisodes) {
    delete episode.identificationProgress;
    delete episode.identificationTier;
    delete episode.identificationApproximationLabel;
  }
  for (const entry of legacyThree.contacts) {
    delete entry.contact.identificationProgress;
    delete entry.contact.identificationTier;
    delete entry.contact.identificationApproximationLabel;
    delete entry.contact.identificationEvaluatedAt;
  }
  legacyThree.relayQueue.version = 1;
  for (const report of legacyThree.relayQueue.pendingReports) {
    delete report.identificationProgress;
    delete report.identificationTier;
    delete report.identificationApproximationLabel;
  }
  const compatibleThree = makeSpotting(terrain);
  compatibleThree.restoreState(legacyThree);
  const migratedThree = compatibleThree.captureState();
  assert.equal(migratedThree.version, 5);
  assert.ok(
    migratedThree.observations.every(
      observation => observation.identificationProgress === 0
    )
  );
  assert.ok(
    migratedThree.directObservationEpisodes.every(
      episode => episode.identificationProgress === 0
    )
  );
  assert.ok(
    migratedThree.contacts.every(
      entry => entry.contact.identificationProgress === 0
    )
  );
  assert.ok(
    migratedThree.relayQueue.pendingReports.every(
      report => report.identificationProgress === 0
    )
  );
  const compatibleThreeRoundTrip = makeSpotting(terrain);
  compatibleThreeRoundTrip.restoreState(migratedThree);
  assert.deepEqual(
    compatibleThreeRoundTrip.captureState(),
    migratedThree,
    'version 3 migration must emit a strict-restorable v5 snapshot'
  );

  const legacyFour = structuredClone(restoredCopy);
  legacyFour.version = 4;
  for (const observation of legacyFour.observations) {
    delete observation.visibilityGraceRemainingNanoseconds;
  }
  const compatibleFour = makeSpotting(terrain);
  compatibleFour.restoreState(legacyFour);
  const migratedFour = compatibleFour.captureState();
  assert.equal(migratedFour.version, 5);
  assert.ok(
    migratedFour.observations.every(
      observation => observation.visibilityGraceRemainingNanoseconds
        === (
          observation.visibleNow
            ? VISIBILITY_GRACE_NANOSECONDS
            : 0
        )
    )
  );
  const compatibleFourRoundTrip = makeSpotting(terrain);
  compatibleFourRoundTrip.restoreState(migratedFour);
  assert.deepEqual(
    compatibleFourRoundTrip.captureState(),
    migratedFour,
    'version 4 migration must emit a strict-restorable v5 snapshot'
  );

  const oldToleranceVisible = structuredClone(legacyThree);
  const oldVisibleObservation = oldToleranceVisible.observations.find(
    observation => observation.visibleNow
      && observation.directEpisodeActive
  );
  assert.ok(oldVisibleObservation);
  oldVisibleObservation.acquisition = 0.999999999999;
  const migratedOldVisible = makeSpotting(terrain);
  migratedOldVisible.restoreState(oldToleranceVisible);
  const visibleV5 = migratedOldVisible.captureState();
  const visibleV5Observation = visibleV5.observations.find(
    observation =>
      observation.observerUnitId
        === oldVisibleObservation.observerUnitId
      && observation.observerSoldierId
        === oldVisibleObservation.observerSoldierId
      && observation.targetUnitId
        === oldVisibleObservation.targetUnitId
  );
  assert.equal(visibleV5Observation.acquisitionWorkTicks, 1000000000000);
  assert.equal(visibleV5Observation.acquisition, 1);
  assert.equal(visibleV5Observation.visibleNow, true);
  assert.equal(visibleV5Observation.directEpisodeActive, true);
  assert.equal(visibleV5Observation.identificationProgress, 0);
  assert.equal(
    visibleV5Observation.visibilityGraceRemainingNanoseconds,
    VISIBILITY_GRACE_NANOSECONDS
  );
  const visibleV5RoundTrip = makeSpotting(terrain);
  visibleV5RoundTrip.restoreState(visibleV5);
  assert.deepEqual(visibleV5RoundTrip.captureState(), visibleV5);

  const oldToleranceHidden = structuredClone(oldToleranceVisible);
  const oldHiddenObservation = oldToleranceHidden.observations.find(
    observation =>
      observation.observerUnitId
        === oldVisibleObservation.observerUnitId
      && observation.observerSoldierId
        === oldVisibleObservation.observerSoldierId
      && observation.targetUnitId
        === oldVisibleObservation.targetUnitId
  );
  oldHiddenObservation.visibleNow = false;
  oldHiddenObservation.directEpisodeActive = false;
  const hiddenPairEpisode =
    oldToleranceHidden.directObservationEpisodes.find(
      episode =>
        episode.senderUnitId === oldHiddenObservation.observerUnitId
        && episode.targetUnitId === oldHiddenObservation.targetUnitId
    );
  assert.ok(hiddenPairEpisode);
  hiddenPairEpisode.active = false;
  const migratedOldHidden = makeSpotting(terrain);
  migratedOldHidden.restoreState(oldToleranceHidden);
  const hiddenV5 = migratedOldHidden.captureState();
  const hiddenV5Observation = hiddenV5.observations.find(
    observation =>
      observation.observerUnitId
        === oldHiddenObservation.observerUnitId
      && observation.observerSoldierId
        === oldHiddenObservation.observerSoldierId
      && observation.targetUnitId
        === oldHiddenObservation.targetUnitId
  );
  assert.equal(hiddenV5Observation.acquisitionWorkTicks, 999999999999);
  assert.equal(hiddenV5Observation.acquisition, 0.999999999999);
  assert.equal(hiddenV5Observation.visibleNow, false);
  assert.equal(hiddenV5Observation.directEpisodeActive, false);
  assert.equal(hiddenV5Observation.identificationProgress, 0);
  assert.equal(hiddenV5Observation.visibilityGraceRemainingNanoseconds, 0);
  const hiddenV5RoundTrip = makeSpotting(terrain);
  hiddenV5RoundTrip.restoreState(hiddenV5);
  assert.deepEqual(hiddenV5RoundTrip.captureState(), hiddenV5);

  assert.throws(
    () => makeSpotting().restoreState({ version: 6 }),
    /unsupported spotting state version 6/
  );
});

test('spotting v5 rejects malformed persistent state and returns mutation-safe projections', () => {
  const terrain = makeTerrain([blockingWall]);
  const sender = makeUnit({
    id: 'sender',
    faction: 'blue',
    x: 0,
    z: 0
  });
  const receiver = makeUnit({
    id: 'receiver',
    faction: 'blue',
    x: 12,
    z: 0
  });
  const target = makeUnit({
    id: 'target',
    faction: 'red',
    x: 0,
    z: 40
  });
  const units = [sender, receiver, target];
  const original = makeSpotting(terrain, [], {
    voiceRelayDelaySeconds: 8
  });
  original.advance(units, 4);
  const valid = original.captureState();
  assert.equal(valid.relayQueue.pendingReports.length, 1);

  function rejected(mutator, pattern) {
    const malformed = structuredClone(valid);
    mutator(malformed);
    assert.throws(
      () => makeSpotting(terrain).restoreState(malformed),
      pattern
    );
  }

  rejected(
    state => {
      state.observations[0].identificationProgress = Number.NaN;
    },
    /identificationProgress/
  );
  rejected(
    state => {
      state.observations[0].identificationTier =
        IDENTIFICATION_TIER.CONFIRMED;
    },
    /identificationTier/
  );
  rejected(
    state => {
      state.directObservationEpisodes[0]
        .identificationApproximationLabel = 'fabricated';
    },
    /identificationApproximationLabel/
  );
  rejected(
    state => {
      state.contacts[0].contact.identificationProgress = 1.1;
    },
    /identificationProgress/
  );
  rejected(
    state => {
      state.contacts[0].contact.identificationEvaluatedAt = Infinity;
    },
    /identificationEvaluatedAt/
  );
  rejected(
    state => {
      state.relayQueue.pendingReports[0].identificationTier =
        IDENTIFICATION_TIER.CONFIRMED;
    },
    /identificationTier/
  );
  rejected(
    state => {
      state.relayQueue.version = 1;
    },
    /requires communication relay queue version 2/
  );
  rejected(
    state => {
      state.time = Number.NaN;
    },
    /version 5 time/
  );
  rejected(
    state => {
      state.time += 1e-9;
    },
    /time projections/
  );
  rejected(
    state => {
      state.timeAccumulator += 1e-9;
    },
    /time projections/
  );
  rejected(
    state => {
      delete state.timeNanoseconds;
    },
    /canonical clock/
  );
  rejected(
    state => {
      delete state.observations[0].visibilityGraceRemainingNanoseconds;
    },
    /visibility grace/
  );
  rejected(
    state => {
      state.observations[0].visibilityGraceRemainingNanoseconds =
        VISIBILITY_GRACE_NANOSECONDS + 1;
    },
    /visibility grace/
  );
  rejected(
    state => {
      state.observations[0].visibilityGraceRemainingNanoseconds = -0;
    },
    /visibility grace/
  );
  rejected(
    state => {
      const observation = state.observations.find(saved => saved.visibleNow);
      observation.visibilityGraceRemainingNanoseconds =
        VISIBILITY_GRACE_NANOSECONDS - 1;
    },
    /full visibility grace/
  );
  rejected(
    state => {
      const observation = state.observations.find(
        saved => !saved.visibleNow && saved.directEpisodeSnapshot === null
      );
      observation.visibilityGraceRemainingNanoseconds = 1;
    },
    /requires a prior direct observation/
  );
  rejected(
    state => {
      state.observations[0].acquisitionWorkTicks--;
    },
    /acquisition/
  );
  rejected(
    state => {
      const observation = state.observations.find(
        saved => saved.visibleNow && saved.directEpisodeActive
      );
      observation.acquisitionWorkTicks = 500000000000;
      observation.acquisitionWorkRemainder = 0;
      observation.acquisition = 0.5;
    },
    /visibility must match canonical acquisition work/
  );
  rejected(
    state => {
      const observation = state.observations.find(
        saved => saved.visibleNow
      );
      observation.directEpisodeActive = false;
    },
    /direct episode activity must match visibility/
  );
  rejected(
    state => {
      const episode = state.directObservationEpisodes.find(
        saved => saved.active
      );
      episode.active = false;
    },
    /active direct observation episode/
  );

  const restored = makeSpotting(terrain);
  restored.restoreState(valid);
  const observation = restored.getObservation(
    sender.id,
    sender.roster[0].id,
    target.id
  );
  const contact = restored.getContactForUnit(sender, target);
  const queueSnapshot = restored.captureState().relayQueue;
  observation.identificationProgress = 0;
  observation.lastSeenPosition[0] = 999;
  contact.identificationProgress = 0;
  contact.position[0] = 999;
  queueSnapshot.pendingReports[0].identificationProgress = 0;
  queueSnapshot.pendingReports[0].position[0] = 999;

  const authoritative = restored.captureState();
  const authoritativeObservation = authoritative.observations.find(saved =>
    saved.observerUnitId === sender.id
      && saved.observerSoldierId === sender.roster[0].id
      && saved.targetUnitId === target.id
  );
  const authoritativeContact = authoritative.contacts.find(entry =>
    entry.unitId === sender.id
      && entry.contact.targetUnitId === target.id
  ).contact;
  assert.notEqual(
    authoritativeObservation.lastSeenPosition[0],
    999
  );
  assert.notEqual(
    authoritativeContact.position[0],
    999
  );
  assert.notEqual(
    authoritative.relayQueue.pendingReports[0].position[0],
    999
  );
  assert.ok(
    authoritative.observations.some(
      saved => saved.identificationProgress > 0
    )
  );
  assert.ok(
    authoritative.contacts.some(
      entry => entry.contact.identificationProgress > 0
    )
  );
  assert.equal(
    authoritative.relayQueue.pendingReports[0].identificationProgress,
    IDENTIFICATION_QUALITY_POLICY.acquiredVisualProgress
  );
});

test('legacy spotting clock migration is explicit for versions 1 through 3', () => {
  for (const version of [1, 2]) {
    const restored = makeSpotting();
    restored.restoreState({
      version,
      time: Number.NaN,
      observations: [],
      contacts: []
    });
    assert.equal(restored.captureState().time, 0);
  }

  const legacyThree = {
    version: 3,
    time: Number.NaN,
    timeAccumulator: 0,
    relayPolicy: {
      approximationLabel: COMMUNICATION_RELAY_DELAY_APPROXIMATION,
      voiceDelaySeconds: 1,
      radioDelaySeconds: 2
    },
    observations: [],
    directObservationEpisodes: [],
    relayQueue: {
      version: 1,
      pendingReports: [],
      deliveredEpisodeWatermarks: []
    },
    contacts: []
  };
  const migrated = makeSpotting();
  migrated.restoreState(legacyThree);
  assert.equal(migrated.captureState().time, 0);

  legacyThree.timeAccumulator = Infinity;
  assert.throws(
    () => makeSpotting().restoreState(legacyThree),
    /timeAccumulator/
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
