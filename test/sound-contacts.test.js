import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_CHANNEL,
  createContact,
  preferContact
} from '../src/simulation/observation/ContactState.js';
import {
  SOUND_CONTACT_APPROXIMATION,
  SOUND_REPORT_KIND,
  createWeaponReportEvent,
  weaponReportSignature
} from '../src/simulation/observation/SoundContacts.js';
import { SpottingSystem } from '../src/game/SpottingSystem.js';
import {
  IDENTIFICATION_QUALITY_APPROXIMATION,
  IDENTIFICATION_TIER
} from '../src/simulation/observation/IdentificationQuality.js';

function makePerson(id, overrides = {}) {
  return {
    id,
    role: 'RIFLEMAN',
    status: 'OK',
    health: 100,
    ...overrides
  };
}

function makeUnit({
  id,
  faction,
  x,
  z = 0,
  roster = [makePerson(0)]
}) {
  return {
    id,
    faction,
    type: 'infantry_squad',
    morale: 'OK',
    experience: 'Regular',
    stance: 'STANDING',
    suppression: 0,
    moveSpeed: 0,
    position: { x, y: 0, z },
    roster
  };
}

function makeEvent(overrides = {}) {
  return createWeaponReportEvent({
    shotSequence: 7,
    sourceUnitId: 'shooter',
    sourceFaction: 'red',
    weapon: {
      id: 'test-rifle',
      kind: 'rifle',
      caliberMm: 7.92
    },
    origin: [0, 1.4, 0],
    ...overrides
  });
}

function makeSpotting(terrain = null) {
  return new SpottingSystem(null, terrain, {
    settings: {
      baseAcquisitionSeconds: 0.25
    }
  });
}

function horizontalDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

test('weapon report creates a displaced SOUND contact without direct observation', () => {
  const listener = makeUnit({ id: 'listener', faction: 'blue', x: 90 });
  const shooter = makeUnit({ id: 'shooter', faction: 'red', x: 0 });
  const terrain = {
    bocageObstacles: [{
      minX: 40,
      maxX: 50,
      minZ: -5,
      maxZ: 5,
      height: 5,
      type: 'wall'
    }],
    getHeightAt: () => 0
  };
  const spotting = makeSpotting(terrain);
  const event = makeEvent();

  assert.equal(spotting.checkLOS(listener.position, shooter.position).clear, false);
  const reports = spotting.recordAuditoryEvent(event, [shooter, listener]);

  assert.equal(reports.length, 1);
  const contact = spotting.getContactForUnit(listener, shooter);
  assert.equal(contact.channel, CONTACT_CHANNEL.SOUND);
  assert.equal(contact.reportKind, SOUND_REPORT_KIND.WEAPON);
  assert.equal(contact.approximationLabel, SOUND_CONTACT_APPROXIMATION);
  assert.equal(contact.targetUnitId, shooter.id);
  assert.equal(contact.targetSoldierId, null);
  assert.equal(contact.sourceUnitId, listener.id);
  assert.equal(contact.sourceSoldierId, 0);
  assert.equal(contact.sourceEventId, event.id);
  assert.equal(contact.identificationProgress, 0);
  assert.equal(
    contact.identificationTier,
    IDENTIFICATION_TIER.UNIDENTIFIED
  );
  assert.equal(
    contact.identificationApproximationLabel,
    IDENTIFICATION_QUALITY_APPROXIMATION
  );
  assert.notDeepEqual(contact.position, event.origin);
  assert.ok(horizontalDistance(contact.position, event.origin) > 0);
  assert.ok(
    horizontalDistance(contact.position, event.origin) <= contact.uncertaintyM,
    'the uncertainty circle must contain the true muzzle X/Z'
  );
  assert.equal(Object.hasOwn(contact, 'origin'), false);
  assert.equal(Object.hasOwn(contact, 'muzzlePosition'), false);
  assert.equal(spotting.canPrecisionTarget(listener, shooter), false);
  assert.equal(spotting.hasContact(listener, shooter), true);
  assert.deepEqual(
    spotting.getVisibilityProjection('blue', [listener, shooter]).visibleUnitIds,
    ['listener']
  );

  const captured = spotting.captureState();
  assert.equal(captured.version, 5);
  assert.equal(Object.hasOwn(captured.contacts[0].contact, 'origin'), false);
  assert.equal(captured.contacts[0].contact.targetSoldierId, null);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.origin), true);
});

test('listener eligibility, free-field range, and same-step non-relay use stable people', () => {
  const event = makeEvent();
  const range = event.signatureRangeM;
  const near = makeUnit({
    id: 'near',
    faction: 'blue',
    x: range - 10,
    roster: [makePerson('z'), makePerson('a')]
  });
  const justOutside = makeUnit({
    id: 'outside',
    faction: 'blue',
    x: range + 0.01
  });
  const friendly = makeUnit({ id: 'friendly', faction: 'red', x: 5 });
  const dead = makeUnit({
    id: 'dead',
    faction: 'blue',
    x: 5,
    roster: [makePerson('dead', { health: 0, status: 'KIA' })]
  });
  const incapacitated = makeUnit({
    id: 'incapacitated',
    faction: 'blue',
    x: 5,
    roster: [makePerson('incapacitated', { status: 'INCAPACITATED' })]
  });
  const shooter = makeUnit({ id: 'shooter', faction: 'red', x: 0 });
  const spotting = makeSpotting();

  spotting.recordAuditoryEvent(event, [
    justOutside,
    incapacitated,
    friendly,
    near,
    dead,
    shooter
  ]);

  assert.equal(spotting.getContactForUnit(near, shooter).sourceSoldierId, 'a');
  assert.equal(spotting.getContactForUnit(justOutside, shooter), null);
  assert.equal(spotting.getContactForUnit(friendly, shooter), null);
  assert.equal(spotting.getContactForUnit(dead, shooter), null);
  assert.equal(spotting.getContactForUnit(incapacitated, shooter), null);

  // The outside unit is within voice range of the near unit but SOUND is not a
  // relay source in this first slice.
  assert.ok(Math.abs(justOutside.position.x - near.position.x) < 18);
  spotting.advance([near, justOutside], 0);
  assert.equal(spotting.getContactForUnit(justOutside, shooter), null);
});

test('reordered units and rosters produce byte-identical SOUND state', () => {
  const event = makeEvent();
  const leftUnits = [
    makeUnit({
      id: 'listener-b',
      faction: 'blue',
      x: 80,
      roster: [makePerson('2'), makePerson('1')]
    }),
    makeUnit({ id: 'shooter', faction: 'red', x: 0 }),
    makeUnit({
      id: 'listener-a',
      faction: 'blue',
      x: 60,
      roster: [makePerson('b'), makePerson('a')]
    })
  ];
  const rightUnits = [
    makeUnit({
      id: 'listener-a',
      faction: 'blue',
      x: 60,
      roster: [makePerson('a'), makePerson('b')]
    }),
    makeUnit({ id: 'shooter', faction: 'red', x: 0 }),
    makeUnit({
      id: 'listener-b',
      faction: 'blue',
      x: 80,
      roster: [makePerson('1'), makePerson('2')]
    })
  ];
  const left = makeSpotting();
  const right = makeSpotting();

  left.recordAuditoryEvent(event, leftUnits);
  right.recordAuditoryEvent(event, rightUnits);

  assert.equal(
    JSON.stringify(left.captureState()),
    JSON.stringify(right.captureState())
  );
});

test('newer contacts win, while equal-time channel and event ties are stable', () => {
  const common = {
    targetUnitId: 'target',
    targetSoldierId: null,
    position: [1, 0, 2],
    updatedAt: 5,
    sourceUnitId: 'listener',
    sourceSoldierId: 'observer',
    uncertaintyM: 4
  };
  const sound = createContact({
    ...common,
    observedAt: 5,
    channel: CONTACT_CHANNEL.SOUND,
    confidence: 0.95,
    sourceEventId: 'weapon-report:000000000007',
    reportKind: SOUND_REPORT_KIND.WEAPON,
    approximationLabel: SOUND_CONTACT_APPROXIMATION
  });
  const direct = createContact({
    ...common,
    observedAt: 5,
    channel: CONTACT_CHANNEL.DIRECT,
    confidence: 0.2
  });
  const newerSound = createContact({
    ...sound,
    observedAt: 6,
    updatedAt: 6
  });
  const laterEvent = createContact({
    ...sound,
    sourceEventId: 'weapon-report:000000000008'
  });

  assert.equal(preferContact(sound, direct).channel, CONTACT_CHANNEL.DIRECT);
  assert.equal(preferContact(direct, sound).channel, CONTACT_CHANNEL.DIRECT);
  assert.equal(preferContact(direct, newerSound).channel, CONTACT_CHANNEL.SOUND);
  assert.deepEqual(
    preferContact(sound, laterEvent),
    preferContact(laterEvent, sound)
  );
  assert.equal(
    preferContact(sound, laterEvent).sourceEventId,
    laterEvent.sourceEventId
  );
});

test('SOUND decay, expiry, capture, and replay are deterministic', () => {
  const event = makeEvent();
  const listenerA = makeUnit({ id: 'listener', faction: 'blue', x: 80 });
  const listenerB = makeUnit({ id: 'listener', faction: 'blue', x: 80 });
  const whole = makeSpotting();
  const partitioned = makeSpotting();
  whole.recordAuditoryEvent(event, [listenerA]);
  partitioned.recordAuditoryEvent(event, [listenerB]);

  const beforeShot = makeSpotting().captureState();
  const replay = makeSpotting();
  replay.restoreState(beforeShot);
  replay.recordAuditoryEvent(event, [listenerA]);
  const afterShot = replay.captureState();
  replay.restoreState(beforeShot);
  replay.recordAuditoryEvent(event, [listenerA]);
  assert.deepEqual(replay.captureState(), afterShot);
  replay.restoreState(afterShot);
  assert.deepEqual(replay.captureState(), afterShot);

  const snapshot = whole.captureState();
  const restored = makeSpotting();
  restored.restoreState(snapshot);
  snapshot.contacts[0].contact.position[0] = 999;
  assert.notEqual(restored.captureState().contacts[0].contact.position[0], 999);

  whole.advance([listenerA], 6);
  for (let step = 0; step < 60; step++) partitioned.advance([listenerB], 0.1);
  const wholeContact = whole.getContactForUnit(listenerA, 'shooter');
  const partitionedContact = partitioned.getContactForUnit(listenerB, 'shooter');
  assert.deepEqual(
    {
      ...wholeContact,
      confidence: 0,
      uncertaintyM: 0
    },
    {
      ...partitionedContact,
      confidence: 0,
      uncertaintyM: 0
    }
  );
  assert.ok(Math.abs(wholeContact.confidence - partitionedContact.confidence) < 1e-12);
  assert.ok(Math.abs(wholeContact.uncertaintyM - partitionedContact.uncertaintyM) < 1e-12);

  restored.advance([listenerA], 6);
  assert.deepEqual(restored.getContactForUnit(listenerA, 'shooter'), wholeContact);

  whole.advance([listenerA], 6);
  for (let step = 0; step < 60; step++) partitioned.advance([listenerB], 0.1);
  assert.equal(whole.getContactForUnit(listenerA, 'shooter'), null);
  assert.equal(partitioned.getContactForUnit(listenerB, 'shooter'), null);

  const versionOne = JSON.parse(JSON.stringify(afterShot));
  versionOne.version = 1;
  const compatible = makeSpotting();
  assert.doesNotThrow(() => compatible.restoreState(versionOne));
  assert.equal(compatible.captureState().version, 5);
  assert.equal(
    compatible.getContactForUnit('listener', 'shooter').sourceEventId,
    event.id
  );
});

test('weapon report signatures and event validation stay generic and explicit', () => {
  const rifle = weaponReportSignature({ kind: 'rifle', caliberMm: 7.92 });
  const cannon = weaponReportSignature({ kind: 'cannon_he', caliberMm: 75 });
  assert.ok(cannon.rangeM > rifle.rangeM);
  assert.equal(rifle.approximationLabel, SOUND_CONTACT_APPROXIMATION);
  assert.equal(cannon.approximationLabel, SOUND_CONTACT_APPROXIMATION);

  assert.throws(
    () => makeEvent({ origin: [0, Number.NaN, 0] }),
    /origin/
  );
  assert.throws(
    () => makeEvent({ sourceFaction: '' }),
    /sourceFaction/
  );
});
