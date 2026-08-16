import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BuildingSystem,
  createPortalGraph,
  findPortalPath,
  localToWorldPoint,
  validateBuildingDescriptor,
  worldToLocalPoint
} from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';

function createSystem(id = 'house-1', transform = {}) {
  const system = new BuildingSystem();
  system.registerDescriptor(FR_HOUSE_12X9_2F);
  system.addBuilding({ id, descriptorId: FR_HOUSE_12X9_2F.id, transform });
  return system;
}

function request(nodeId, orderSequence, unitId, soldierId) {
  return {
    nodeId,
    orderSequence,
    unitId,
    soldierId,
    soldierKey: `${unitId}:${soldierId}`
  };
}

test('French house descriptor validates its topology and authored tactical features', () => {
  assert.equal(validateBuildingDescriptor(FR_HOUSE_12X9_2F), FR_HOUSE_12X9_2F);
  assert.equal(FR_HOUSE_12X9_2F.floors.length, 2);
  assert.deepEqual(FR_HOUSE_12X9_2F.rooms.map(room => room.slots.length), [6, 6]);
  assert.equal(FR_HOUSE_12X9_2F.portals.filter(portal => portal.kind === 'door').length, 2);
  assert.equal(FR_HOUSE_12X9_2F.portals.filter(portal => portal.kind === 'stair').length, 1);
  assert.deepEqual(
    FR_HOUSE_12X9_2F.firePorts.map(port => port.roomId),
    [
      'ground-room', 'ground-room', 'ground-room', 'ground-room',
      'ground-room', 'ground-room',
      'upper-room', 'upper-room', 'upper-room', 'upper-room',
      'upper-room', 'upper-room'
    ]
  );
  for (const floor of ['ground', 'upper']) {
    for (const side of ['left', 'right']) {
      const rear = FR_HOUSE_12X9_2F.firePorts.find(
        port => port.id === `${floor}-rear-window-${side}`
      );
      assert.ok(rear, `${floor} rear ${side} window is authored`);
      assert.deepEqual(rear.localNormal, [0, 0, -1]);
      assert.equal(rear.approachSlotId, `${floor}-rear-${side}`);
      assert.equal(rear.aperture.center[2], -4.5);
    }
  }
  for (const floor of ['ground', 'upper']) {
    for (const side of ['left', 'right']) {
      const sideWindow = FR_HOUSE_12X9_2F.firePorts.find(
        port => port.id === `${floor}-side-window-${side}`
      );
      assert.ok(sideWindow, `${floor} ${side} side window is authored`);
      assert.deepEqual(sideWindow.localNormal, [side === 'left' ? -1 : 1, 0, 0]);
      assert.equal(sideWindow.approachSlotId, `${floor}-side-${side}`);
    }
  }
  const rearDoor = FR_HOUSE_12X9_2F.portals.find(portal => portal.id === 'rear-door');
  assert.deepEqual(rearDoor.localNormal, [0, 0, -1]);
  assert.equal(rearDoor.aperture.center[2], -4.5);
  assert.equal(rearDoor.aperture.initiallyOpen, false);
  assert.ok(FR_HOUSE_12X9_2F.sections.every(section => section.colliderParts.length > 0));

  const invalid = structuredClone(FR_HOUSE_12X9_2F);
  invalid.sections[5].supports = ['foundation'];
  assert.throws(() => validateBuildingDescriptor(invalid), /support graph cycle/);
});

test('plain transforms and portal paths preserve the metre-authored coordinate contract', () => {
  const transform = { position: [10, 2, -4], rotationY: Math.PI / 2 };
  const local = [3, 1, 2];
  const world = localToWorldPoint(local, transform);
  assert.deepEqual(world.map(value => Math.round(value * 1e9) / 1e9), [12, 3, -7]);
  assert.deepEqual(
    worldToLocalPoint(world, transform).map(value => Math.round(value * 1e9) / 1e9),
    local
  );

  const graph = createPortalGraph(FR_HOUSE_12X9_2F);
  assert.deepEqual(findPortalPath(graph, 'outside', 'upper-room'), ['front-door', 'main-stair']);
  assert.equal(findPortalPath(createPortalGraph(FR_HOUSE_12X9_2F, ['main-stair']), 'outside', 'upper-room'), null);
});

test('movement shell blocks doors and windows while ballistic shell preserves open apertures', () => {
  const system = createSystem();
  system.setOpening('house-1', 'front-door-aperture', true);
  system.setOpening('house-1', 'rear-door-aperture', true);
  const ballistic = system.getCollisionSnapshot('house-1').records;
  const movement = system.getMovementCollisionSnapshot('house-1').records;

  assert.ok(!ballistic.some(record => record.partId === 'ground-door'));
  assert.ok(!ballistic.some(record => record.partId === 'ground-left-window'));
  assert.ok(!ballistic.some(record => record.partId === 'ground-rear-left-window'));
  assert.ok(!ballistic.some(record => record.partId === 'ground-side-left-window'));
  const door = movement.find(record => record.partId === 'ground-door');
  const window = movement.find(record => record.partId === 'ground-left-window');
  const rearWindow = movement.find(
    record => record.partId === 'ground-rear-left-window'
  );
  const rearDoor = movement.find(record => record.partId === 'ground-rear-door');
  const sideWindow = movement.find(record => record.partId === 'ground-side-left-window');
  assert.deepEqual(door.blocks, ['infantry', 'vehicle']);
  assert.equal(door.movementPolicy, 'portal_transit_required');
  assert.deepEqual(window.blocks, ['infantry', 'vehicle']);
  assert.equal(window.movementPolicy, 'fire_port_blocks_movement');
  assert.deepEqual(rearWindow.blocks, ['infantry', 'vehicle']);
  assert.equal(rearWindow.movementPolicy, 'fire_port_blocks_movement');
  assert.deepEqual(rearDoor.blocks, ['infantry', 'vehicle']);
  assert.equal(rearDoor.movementPolicy, 'portal_transit_required');
  assert.deepEqual(sideWindow.blocks, ['infantry', 'vehicle']);
  assert.equal(sideWindow.movementPolicy, 'fire_port_blocks_movement');
});

test('reservation conflicts resolve by sequence, unit, and soldier independent of request order', () => {
  const contenders = [
    request('ground-front-left', 8, 'unit-b', 'soldier-1'),
    request('ground-front-left', 8, 'unit-a', 'soldier-2'),
    request('ground-front-left', 4, 'unit-z', 'soldier-9')
  ];
  const winners = [];
  const snapshots = [];
  for (const permutation of [
    contenders,
    [...contenders].reverse(),
    [contenders[1], contenders[2], contenders[0]]
  ]) {
    const system = createSystem();
    const result = system.resolveReservations('house-1', permutation);
    winners.push(result.find(record => record.accepted).soldierKey);
    snapshots.push(system.captureState());
  }
  assert.deepEqual(winners, ['unit-z:soldier-9', 'unit-z:soldier-9', 'unit-z:soldier-9']);
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test('entry, floor transit, exit, and casualty release keep soldier location external', () => {
  const system = createSystem();
  const identity = {
    unitId: 'squad-1',
    soldierId: 'rifleman-1',
    soldierKey: 'squad-1:rifleman-1'
  };
  system.resolveReservations('house-1', [
    { ...identity, nodeId: 'ground-front-left', orderSequence: 1 }
  ]);
  const entry = system.startTransit('house-1', {
    ...identity,
    portalId: 'front-door',
    fromNodeId: 'outside',
    toNodeId: 'ground-front-left'
  });
  assert.equal(entry.accepted, true);
  const entered = system.advanceTransit('house-1', entry.location, 1.2);
  assert.equal(entered.location.phase, 'occupied');
  assert.equal(system.getBuildingSnapshot('house-1').occupancy['ground-front-left'].soldierKey, identity.soldierKey);

  system.resolveReservations('house-1', [
    { ...identity, nodeId: 'upper-front-left', orderSequence: 2 }
  ]);
  const stairs = system.startTransit('house-1', {
    ...identity,
    portalId: 'main-stair',
    fromNodeId: 'ground-front-left',
    toNodeId: 'upper-front-left'
  });
  assert.equal(stairs.accepted, true);
  const partial = system.advanceTransit('house-1', stairs.location, 1.3);
  const partialAgain = system.advanceTransit('house-1', partial.location, 0.7);
  const upstairs = system.advanceTransit('house-1', partialAgain.location, 1.8);
  assert.equal(upstairs.complete, true);
  assert.equal(upstairs.location.nodeId, 'upper-front-left');

  const exitStart = system.startTransit('house-1', {
    ...identity,
    portalId: 'main-stair',
    fromNodeId: 'upper-front-left',
    toNodeId: 'ground-front-left'
  });
  assert.equal(exitStart.accepted, false, 'downstairs slot must be reserved before transit');

  system.handleCasualty('house-1', identity.soldierKey);
  assert.deepEqual(system.getBuildingSnapshot('house-1').occupancy, {});
  assert.deepEqual(system.getBuildingSnapshot('house-1').reservations, {});
});

test('occupied soldiers can atomically exchange valid slots', () => {
  const system = createSystem();
  system.occupySlot(
    'house-1',
    request('upper-front-left', 1, 'hq', 'assistant')
  );
  system.occupySlot(
    'house-1',
    request('upper-rear-left', 1, 'hq', 'leader')
  );

  const result = system.reassignOccupiedSlots('house-1', [
    {
      soldierKey: 'hq:leader',
      fromSlotId: 'upper-rear-left',
      toSlotId: 'upper-front-left'
    },
    {
      soldierKey: 'hq:assistant',
      fromSlotId: 'upper-front-left',
      toSlotId: 'upper-rear-left'
    }
  ]);

  assert.equal(result.accepted, true);
  const occupancy = system.getBuildingSnapshot('house-1').occupancy;
  assert.equal(occupancy['upper-front-left'].soldierKey, 'hq:leader');
  assert.equal(occupancy['upper-rear-left'].soldierKey, 'hq:assistant');
  const captured = system.captureState();
  system.restoreState(captured);
  assert.deepEqual(system.captureState(), captured);
});

test('occupied-slot reassignment rejects stealing without partial mutation', () => {
  const system = createSystem();
  system.occupySlot(
    'house-1',
    request('upper-front-left', 1, 'hq', 'leader')
  );
  system.occupySlot(
    'house-1',
    request('upper-rear-left', 1, 'other-unit', 'rifleman')
  );
  const before = system.captureState();

  const result = system.reassignOccupiedSlots('house-1', [{
    soldierKey: 'hq:leader',
    fromSlotId: 'upper-front-left',
    toSlotId: 'upper-rear-left'
  }]);

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'occupied');
  assert.deepEqual(system.captureState(), before);
});

test('transit timing is frame-partition independent', () => {
  const identity = {
    unitId: 'squad-1',
    soldierId: 'rifleman-2',
    soldierKey: 'squad-1:rifleman-2'
  };
  const run = partitions => {
    const system = createSystem();
    system.resolveReservations('house-1', [
      { ...identity, nodeId: 'ground-front-right', orderSequence: 1 }
    ]);
    let result = system.startTransit('house-1', {
      ...identity,
      portalId: 'front-door',
      fromNodeId: 'outside',
      toNodeId: 'ground-front-right'
    });
    for (const delta of partitions) result = system.advanceTransit('house-1', result.location, delta);
    return { result, state: system.captureState() };
  };
  assert.deepEqual(run([1.2]), run([0.1, 0.2, 0.3, 0.6]));
});

test('capture and restore are deep, plain, and preserve authoritative state', () => {
  const system = createSystem('house-a', { position: [40, 2, -15], rotationY: 0.25 });
  system.setOpening('house-a', 'front-door-aperture', false);
  system.resolveReservations('house-a', [
    request('ground-rear-left', 5, 'unit-1', 'soldier-3')
  ]);
  const captured = system.captureState();
  const serialized = JSON.parse(JSON.stringify(captured));
  assert.deepEqual(captured, serialized);

  captured.buildings[0].transform.position[0] = 999;
  assert.equal(system.getBuildingSnapshot('house-a').transform.position[0], 40);

  const restoreSource = serialized;
  system.setOpening('house-a', 'front-door-aperture', true);
  system.restoreState(restoreSource);
  assert.deepEqual(system.captureState(), restoreSource);
  restoreSource.buildings[0].sections.foundation.health = -100;
  assert.notEqual(system.getBuildingSnapshot('house-a').sections.foundation.health, -100);
});

test('projectile breach removes only its stable collider part and records a delta', () => {
  const system = createSystem();
  const before = system.getCollisionSnapshot('house-1');
  const targetId = 'house-1:ground-shell:ground-rear-left-inner';
  assert.ok(before.records.some(record => record.id === targetId));

  const damage = system.applyProjectileDamage('house-1', {
    sectionId: 'ground-shell',
    colliderPartId: 'ground-rear-left-inner',
    amount: 500,
    penetrationMm: 400
  });
  assert.equal(damage.result.penetrated, true);
  assert.equal(damage.result.breached, true);
  const after = system.getCollisionSnapshot('house-1', before.version);
  assert.ok(!after.records.some(record => record.id === targetId));
  assert.deepEqual(after.changes.at(-1).removed, [targetId]);
  assert.ok(
    system.getBuildingSnapshot('house-1')
      .openings['breach:ground-shell:ground-rear-left-inner'].breached
  );
});

test('opening snapshots add and remove aperture blockers without rebuilding unrelated records', () => {
  const system = createSystem('house-1', { position: [10, 0, 20], rotationY: Math.PI / 2 });
  const initiallyClosed = system.getCollisionSnapshot('house-1');
  const doorId = 'house-1:ground-shell:ground-door';
  assert.ok(initiallyClosed.records.some(record => record.id === doorId));

  system.setOpening('house-1', 'front-door-aperture', true);
  const opened = system.getCollisionSnapshot('house-1', initiallyClosed.version);
  assert.ok(!opened.records.some(record => record.id === doorId));
  assert.deepEqual(opened.changes.at(-1).removed, [doorId]);

  system.setOpening('house-1', 'front-door-aperture', false);
  const reclosed = system.getCollisionSnapshot('house-1', opened.version);
  const door = reclosed.records.find(record => record.id === doorId);
  assert.ok(door);
  assert.deepEqual([door.centerX, door.centerZ].map(value => Math.round(value)), [15, 20]);
  assert.deepEqual(reclosed.changes.at(-1).added, [doorId]);
});

test('roof collapse invalidates upper ports before moving occupants to nearest lower slots', () => {
  const system = createSystem();
  system.occupySlot('house-1', request('upper-front-left', 1, 'unit-a', 'soldier-a'));
  const result = system.applyBlastDamage('house-1', {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  });
  assert.equal(result.results[0].collapsed, true);
  assert.equal(result.occupantConsequences.length, 1);
  assert.deepEqual(result.occupantConsequences[0], {
    soldierKey: 'unit-a:soldier-a',
    unitId: 'unit-a',
    soldierId: 'soldier-a',
    fromSlotId: 'upper-front-left',
    toNodeId: 'ground-front-left',
    phase: 'occupied',
    damage: 35,
    ejected: false
  });
  const snapshot = system.getBuildingSnapshot('house-1');
  assert.ok(snapshot.invalidSlots.includes('upper-front-left'));
  assert.equal(snapshot.occupancy['ground-front-left'].soldierKey, 'unit-a:soldier-a');
  assert.ok(system.getFirePorts('house-1')
    .filter(port => port.roomId === 'upper-room')
    .every(port => port.enabled === false));
});

test('support loss cascades in stable section order and ejects occupants to rubble', () => {
  const build = occupantOrder => {
    const system = createSystem();
    for (const [slotId, unitId, soldierId] of occupantOrder) {
      system.occupySlot('house-1', request(slotId, 1, unitId, soldierId));
    }
    const result = system.applyProjectileDamage('house-1', {
      sectionId: 'foundation',
      colliderPartId: 'foundation-slab',
      amount: 2000,
      penetrationMm: 1000
    });
    return { system, result };
  };
  const orderA = [
    ['upper-front-right', 'unit-b', 'soldier-2'],
    ['ground-rear-left', 'unit-a', 'soldier-1']
  ];
  const orderB = [...orderA].reverse();
  const first = build(orderA);
  const second = build(orderB);
  assert.deepEqual(first.result.collapsedSections, [
    'ground-floor-structure',
    'ground-shell',
    'upper-floor-structure',
    'upper-shell',
    'roof'
  ]);
  assert.deepEqual(first.result.occupantConsequences, second.result.occupantConsequences);
  assert.deepEqual(
    first.result.occupantConsequences.map(record => record.soldierKey),
    ['unit-a:soldier-1', 'unit-b:soldier-2']
  );
  assert.ok(first.result.occupantConsequences.every(record => record.ejected && record.damage === 70));
  const collision = first.system.getCollisionSnapshot('house-1');
  assert.ok(collision.records.length > 0);
  assert.ok(collision.records.every(record => record.sectionId === 'rubble'));
  assert.deepEqual(first.system.captureState(), second.system.captureState());
});
