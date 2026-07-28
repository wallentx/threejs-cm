import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingInteractionSystem } from '../src/game/BuildingInteractionSystem.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { StaticCollisionWorld } from '../src/simulation/collision/StaticCollisionWorld.js';

function createMultiDoorDescriptor({ reversePortals = false } = {}) {
  const descriptor = structuredClone(FR_HOUSE_12X9_2F);
  descriptor.id = 'fr_house_12x9_2f_multi_door_test';
  descriptor.portals.push({
    id: 'rear-door',
    kind: 'door',
    from: 'outside',
    to: 'ground-room',
    sectionId: 'rear-entry-shell',
    aperture: {
      id: 'rear-door-aperture',
      center: [0, 1.05, -4.5],
      size: [1.4, 2.1],
      initiallyOpen: true
    },
    transitSeconds: 1.2
  });
  descriptor.sections.push({
    id: 'rear-entry-shell',
    kind: 'wall',
    material: 'masonry',
    maxHealth: 240,
    resistanceMm: 320,
    supports: [],
    colliderParts: [{
      id: 'rear-door',
      center: [0, 1.05, -4.5],
      halfExtents: [0.7, 1.05, 0.18],
      openingId: 'rear-door-aperture'
    }],
    visualStages: structuredClone(descriptor.sections[0].visualStages),
    supportThreshold: 0.6,
    breachHealthFraction: 0.55
  });
  if (reversePortals) descriptor.portals.reverse();
  return descriptor;
}

function createUnit(id, position, agentIds = ['soldier-b', 'soldier-a']) {
  const start = new THREE.Vector3().fromArray(position);
  const agents = agentIds.map(agentId => {
    const record = { id: agentId, health: 100, status: 'OK' };
    return {
      id: agentId,
      record,
      position: start.clone(),
      velocity: new THREE.Vector3(),
      facing: 0,
      state: 'READY',
      stance: 'STANDING',
      health: 100,
      status: 'OK',
      buildingLocation: null,
      get isAlive() {
        return this.health > 0 && this.status !== 'KIA';
      },
      syncRecord() {
        Object.assign(this.record, {
          health: this.health,
          status: this.status,
          worldPosition: this.position.toArray(),
          buildingLocation: this.buildingLocation
            ? structuredClone(this.buildingLocation)
            : null
        });
      }
    };
  });
  return {
    id,
    type: 'infantry_squad',
    position: start,
    collisionRadius: 0.45,
    waypoints: [],
    currentWaypointIndex: 0,
    clearWaypoints() {
      this.waypoints = [];
      this.currentWaypointIndex = 0;
    },
    soldierAI: {
      agents,
      getLivingAgents: () => agents.filter(agent => agent.isAlive),
      syncMeshes() {}
    }
  };
}

function createHarness({
  descriptor = createMultiDoorDescriptor(),
  position = [0, 0, -12],
  reverseUnitOrder = false
} = {}) {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(descriptor);
  buildings.addBuilding({
    id: 'house',
    descriptorId: descriptor.id,
    transform: { position: [0, 0, 0], rotationY: 0 }
  });
  const unit = createUnit('squad', position);
  const decoy = createUnit('decoy', [30, 0, 30], ['decoy-soldier']);
  const units = reverseUnitOrder ? [decoy, unit] : [unit, decoy];
  const interactions = new BuildingInteractionSystem({
    buildingSystem: buildings,
    getUnits: () => units
  });
  return { buildings, descriptor, interactions, unit, decoy, units };
}

function assignedAgents(harness, order) {
  const assigned = new Set(order.assigned);
  return harness.unit.soldierAI.agents.filter(agent =>
    assigned.has(`${harness.unit.id}:${agent.id}`));
}

function placeAtApproach(harness, order) {
  for (const agent of assignedAgents(harness, order)) {
    agent.position.fromArray(order.approachPosition);
    agent.syncRecord();
  }
}

function captureHarness(harness) {
  return {
    buildings: harness.buildings.captureState(),
    interactions: harness.interactions.captureState(),
    units: [...harness.units]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(unit => ({
        id: unit.id,
        position: unit.position.toArray(),
        waypoints: structuredClone(unit.waypoints),
        currentWaypointIndex: unit.currentWaypointIndex,
        agents: [...unit.soldierAI.agents]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map(agent => ({
            id: agent.id,
            position: agent.position.toArray(),
            velocity: agent.velocity.toArray(),
            state: agent.state,
            stance: agent.stance,
            buildingLocation: structuredClone(agent.buildingLocation),
            record: structuredClone(agent.record)
          }))
      }))
  };
}

function restoreHarness(harness, snapshot) {
  harness.buildings.restoreState(snapshot.buildings);
  harness.interactions.restoreState(snapshot.interactions);
  for (const savedUnit of snapshot.units) {
    const unit = harness.units.find(candidate => candidate.id === savedUnit.id);
    unit.position.fromArray(savedUnit.position);
    unit.waypoints = structuredClone(savedUnit.waypoints);
    unit.currentWaypointIndex = savedUnit.currentWaypointIndex;
    for (const savedAgent of savedUnit.agents) {
      const agent = unit.soldierAI.agents.find(candidate =>
        candidate.id === savedAgent.id);
      agent.position.fromArray(savedAgent.position);
      agent.velocity.fromArray(savedAgent.velocity);
      agent.state = savedAgent.state;
      agent.stance = savedAgent.stance;
      agent.buildingLocation = structuredClone(savedAgent.buildingLocation);
      agent.record = structuredClone(savedAgent.record);
    }
  }
}

function selectionProjection(harness, order) {
  return {
    entryPortalId: order.entryPortalId,
    approachPosition: order.approachPosition,
    approachRoute: order.approachRoute,
    assigned: order.assigned,
    locations: assignedAgents(harness, order)
      .map(agent => structuredClone(agent.buildingLocation))
  };
}

function collapseSection(buildings, sectionId) {
  buildings.applyBlastDamage('house', {
    sectionDamages: [{ sectionId, amount: 10000 }]
  });
}

test('nearest exterior door selection and stable-ID ties ignore descriptor and unit order', () => {
  const rearVariants = [
    createHarness(),
    createHarness({
      descriptor: createMultiDoorDescriptor({ reversePortals: true })
    }),
    createHarness({ reverseUnitOrder: true })
  ];
  const rearSelections = rearVariants.map(harness => {
    const order = harness.interactions.issueEnter(
      harness.unit,
      'house',
      'ground-floor'
    );
    assert.equal(order.accepted, true);
    assert.equal(order.entryPortalId, 'rear-door');
    assert.ok(order.approachPosition[2] < FR_HOUSE_12X9_2F.bounds.min[2]);
    assert.ok(assignedAgents(harness, order).every(agent =>
      agent.buildingLocation.entryPortalId === 'rear-door'));
    return selectionProjection(harness, order);
  });
  assert.deepEqual(rearSelections[1], rearSelections[0]);
  assert.deepEqual(rearSelections[2], rearSelections[0]);

  const tieVariants = [
    createHarness({ position: [12, 0, 0] }),
    createHarness({
      descriptor: createMultiDoorDescriptor({ reversePortals: true }),
      position: [12, 0, 0],
      reverseUnitOrder: true
    })
  ];
  const tieSelections = tieVariants.map(harness => {
    const order = harness.interactions.issueEnter(
      harness.unit,
      'house',
      'ground-floor'
    );
    assert.equal(order.entryPortalId, 'front-door');
    return selectionProjection(harness, order);
  });
  assert.deepEqual(tieSelections[1], tieSelections[0]);
});

test('invalid nearest door selects the farther valid door and all-invalid rejection is atomic', () => {
  const fallback = createHarness();
  collapseSection(fallback.buildings, 'rear-entry-shell');
  const order = fallback.interactions.issueEnter(
    fallback.unit,
    'house',
    'ground-floor'
  );
  assert.equal(order.accepted, true);
  assert.equal(order.entryPortalId, 'front-door');
  assert.ok(order.approachPosition[2] > FR_HOUSE_12X9_2F.bounds.max[2]);

  const blocked = createHarness();
  collapseSection(blocked.buildings, 'rear-entry-shell');
  collapseSection(blocked.buildings, 'ground-shell');
  const before = captureHarness(blocked);
  assert.deepEqual(
    blocked.interactions.issueEnter(blocked.unit, 'house', 'ground-floor'),
    { accepted: false, reason: 'no_valid_entry_portal', assigned: [] }
  );
  assert.deepEqual(captureHarness(blocked), before);
});

test('entry, upper-floor stairs, and exit consume the persisted exterior portal', () => {
  const ground = createHarness();
  const groundOrder = ground.interactions.issueEnter(
    ground.unit,
    'house',
    'ground-floor'
  );
  placeAtApproach(ground, groundOrder);
  ground.interactions.advance(0);
  assert.ok(assignedAgents(ground, groundOrder).every(agent =>
    agent.buildingLocation.entryPortalId === 'rear-door'
      && agent.buildingLocation.portalId === 'rear-door'
      && agent.buildingLocation.phase === 'transit'));
  ground.interactions.advance(1.2);
  assert.ok(assignedAgents(ground, groundOrder).every(agent =>
    agent.buildingLocation.entryPortalId === 'rear-door'
      && agent.buildingLocation.phase === 'occupied'));
  assert.equal(ground.interactions.issueExit(ground.unit).accepted, true);
  assert.ok(assignedAgents(ground, groundOrder).every(agent =>
    agent.buildingLocation.entryPortalId === 'rear-door'
      && agent.buildingLocation.portalId === 'rear-door'
      && agent.buildingLocation.phase === 'exiting'));
  ground.interactions.advance(1.2);
  assert.ok(assignedAgents(ground, groundOrder).every(agent =>
    agent.buildingLocation === null && agent.position.z < -4.5));

  const upper = createHarness();
  const upperOrder = upper.interactions.issueEnter(
    upper.unit,
    'house',
    'upper-floor'
  );
  placeAtApproach(upper, upperOrder);
  upper.interactions.advance(0);
  upper.interactions.advance(1.2);
  assert.ok(assignedAgents(upper, upperOrder).every(agent =>
    agent.buildingLocation.entryPortalId === 'rear-door'
      && agent.buildingLocation.portalId === 'main-stair'
      && agent.buildingLocation.routeStage === 'stairs'));
  upper.interactions.advance(3.8);
  assert.ok(assignedAgents(upper, upperOrder).every(agent =>
    agent.buildingLocation.entryPortalId === 'rear-door'
      && agent.buildingLocation.phase === 'occupied'));
  upper.interactions.issueExit(upper.unit);
  upper.interactions.advance(0);
  upper.interactions.advance(3.8);
  assert.ok(assignedAgents(upper, upperOrder).every(agent =>
    agent.buildingLocation.entryPortalId === 'rear-door'
      && agent.buildingLocation.portalId === 'rear-door'
      && agent.buildingLocation.phase === 'exiting'));
});

test('approach and transit capture restore and replay preserve route, portal, positions, occupancy, and exit', () => {
  const original = createHarness();
  const order = original.interactions.issueEnter(
    original.unit,
    'house',
    'ground-floor'
  );
  const approachSnapshot = captureHarness(original);
  const approachRestored = createHarness();
  restoreHarness(approachRestored, approachSnapshot);
  assert.deepEqual(captureHarness(approachRestored), approachSnapshot);
  assert.deepEqual(
    approachRestored.interactions.getEntryApproachRoute(
      'house',
      approachRestored.unit.position,
      'rear-door'
    ),
    order.approachRoute
  );

  placeAtApproach(original, order);
  placeAtApproach(approachRestored, order);
  original.interactions.advance(0);
  approachRestored.interactions.advance(0);
  original.interactions.advance(0.45);
  approachRestored.interactions.advance(0.45);
  assert.deepEqual(captureHarness(approachRestored), captureHarness(original));

  const transitSnapshot = captureHarness(original);
  const transitRestored = createHarness();
  restoreHarness(transitRestored, transitSnapshot);
  original.interactions.advance(0.75);
  transitRestored.interactions.advance(0.75);
  assert.deepEqual(captureHarness(transitRestored), captureHarness(original));
  assert.equal(original.interactions.issueExit(original.unit).accepted, true);
  assert.equal(transitRestored.interactions.issueExit(transitRestored.unit).accepted, true);
  original.interactions.advance(1.2);
  transitRestored.interactions.advance(1.2);
  assert.deepEqual(captureHarness(transitRestored), captureHarness(original));
});

test('selected-door collapse releases and ejects once without rerouting', () => {
  const harness = createHarness();
  const order = harness.interactions.issueEnter(
    harness.unit,
    'house',
    'ground-floor'
  );
  placeAtApproach(harness, order);
  harness.interactions.advance(0);
  collapseSection(harness.buildings, 'rear-entry-shell');
  harness.interactions.advance(0.1);

  assert.ok(assignedAgents(harness, order).every(agent =>
    agent.buildingLocation === null && agent.position.z < -4.5));
  assert.deepEqual(
    harness.buildings.getBuildingSnapshot('house').reservations,
    {}
  );
  assert.deepEqual(harness.interactions.captureState().orders, []);
  const afterFirstEjection = captureHarness(harness);
  harness.interactions.advance(1);
  assert.deepEqual(captureHarness(harness), afterFirstEjection);
});

test('legacy one-door locations retain the front-door path and exit behavior', () => {
  const harness = createHarness({
    descriptor: structuredClone(FR_HOUSE_12X9_2F),
    position: [0, 0, 12]
  });
  const order = harness.interactions.issueEnter(
    harness.unit,
    'house',
    'ground-floor'
  );
  assert.equal(order.entryPortalId, 'front-door');
  assert.deepEqual(order.approachPosition, [0, 0.15, 6.75]);
  assert.deepEqual(order.approachRoute, [[0, 0.15, 6.75]]);
  placeAtApproach(harness, order);
  harness.interactions.advance(0);
  harness.interactions.advance(1.2);
  for (const agent of assignedAgents(harness, order)) {
    delete agent.buildingLocation.entryPortalId;
    agent.syncRecord();
  }

  const legacySnapshot = captureHarness(harness);
  const restored = createHarness({
    descriptor: structuredClone(FR_HOUSE_12X9_2F),
    position: [0, 0, 12]
  });
  restoreHarness(restored, legacySnapshot);
  assert.equal(restored.interactions.issueExit(restored.unit).accepted, true);
  assert.ok(restored.unit.soldierAI.agents.every(agent =>
    agent.buildingLocation.portalId === 'front-door'
      && !Object.hasOwn(agent.buildingLocation, 'entryPortalId')));
  restored.interactions.advance(1.2);
  assert.ok(restored.unit.soldierAI.agents.every(agent =>
    agent.buildingLocation === null && agent.position.z > 4.5));
});

test('both exterior door apertures require portal transit for movement', () => {
  const harness = createHarness();
  const movement = harness.buildings.getMovementCollisionSnapshot('house').records;
  assert.deepEqual(
    movement
      .filter(record => ['ground-door', 'rear-door'].includes(record.partId))
      .map(record => [record.partId, record.movementPolicy])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ['ground-door', 'portal_transit_required'],
      ['rear-door', 'portal_transit_required']
    ]
  );
  const collisionWorld = new StaticCollisionWorld(movement);
  assert.equal(collisionWorld.resolveCircleMotion(
    { x: 0, z: 6 },
    { x: 0, z: -3 },
    0.25,
    { moverType: 'infantry' }
  ).blocked, true);
  assert.equal(collisionWorld.resolveCircleMotion(
    { x: 0, z: -6 },
    { x: 0, z: 3 },
    0.25,
    { moverType: 'infantry' }
  ).blocked, true);
});
