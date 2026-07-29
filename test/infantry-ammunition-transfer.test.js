import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';
import { GameApp } from '../src/app/GameApp.js';
import { FixedStepAccumulator } from '../src/simulation/FixedStepAccumulator.js';
import {
  FRANCE_1940_FORMATIONS
} from '../src/content/france1940/formations.js';
import { createFrance1940Family } from '../src/content/france1940/index.js';
import { createFamilyRegistry } from '../src/scenario/FamilyRegistry.js';
import {
  resolveScenarioUnitDefinitions
} from '../src/scenario/ScenarioRuntime.js';
import {
  advanceInfantryAmmunitionTransfer,
  captureInfantryAmmunitionTransferState,
  createInfantryAmmunitionTransferState,
  restoreInfantryAmmunitionTransferState
} from '../src/simulation/infantry/InfantryAmmunitionTransfer.js';

const FAMILY_REGISTRY = createFamilyRegistry([createFrance1940Family()]);
const FLAT_TERRAIN = {
  getHeightAt() {
    return 0;
  }
};

function transferFor(formationId) {
  return FRANCE_1940_FORMATIONS[formationId]
    .supportAmmunitionTransfers[0];
}

function participant(id, weaponId, overrides = {}) {
  return {
    id,
    weaponId,
    health: 100,
    status: 'OK',
    ...overrides
  };
}

function resolveRoster(faction, formationId, unitId = `${faction}-support`) {
  const [definition] = resolveScenarioUnitDefinitions({
    id: `${unitId}-scenario`,
    gameFamilyId: 'france-1940',
    units: [{
      id: unitId,
      faction,
      type: 'infantry_squad',
      formationId,
      position: [0, 0, 0]
    }]
  }, FAMILY_REGISTRY);
  return definition.roster;
}

function makeSupportUnit(
  faction = 'french',
  formationId = faction === 'french'
    ? 'FRENCH_CHASSEURS_PORTES_SQUAD'
    : 'GERMAN_GRENADIER_SQUAD_1940',
  id = `${faction}-support-unit`
) {
  return new Unit({
    id,
    faction,
    type: 'infantry_squad',
    position: new THREE.Vector3(),
    roster: resolveRoster(faction, formationId, id)
  });
}

function pairedAgents(unit) {
  const donor = unit.soldierAI.agents.find(agent =>
    agent.supportAmmunitionTransfer);
  assert.ok(donor);
  const recipient = unit.soldierAI.agents.find(agent =>
    agent.id === donor.supportAmmunitionTransfer.recipientSoldierId);
  assert.ok(recipient);
  donor.position.copy(recipient.position);
  donor.syncRecord();
  return { donor, recipient };
}

test('France 1940 support feeds conserve existing carried ammunition', () => {
  for (const [
    faction,
    formationId,
    weaponId,
    expectedFeed
  ] of [
    ['french', 'FRENCH_CHASSEURS_PORTES_SQUAD', 'FM2429', 25],
    ['german', 'GERMAN_GRENADIER_SQUAD_1940', 'MG34', 50]
  ]) {
    const first = resolveRoster(faction, formationId, `${faction}-first`);
    const second = resolveRoster(faction, formationId, `${faction}-second`);
    const donor = first.find(member => member.id === 'assistant-gunner');
    const recipient = first.find(member =>
      member.id === 'automatic-rifleman');
    const weapon = createFrance1940Family().catalogs.weapons[weaponId];

    assert.equal(donor.supportAmmunitionTransfer.weaponId, weaponId);
    assert.equal(
      donor.supportAmmunitionTransfer.remainingRounds,
      expectedFeed
    );
    assert.equal(
      recipient.magazineAmmo
        + recipient.reserveAmmo
        + donor.supportAmmunitionTransfer.remainingRounds,
      weapon.carriedAmmo
    );
    assert.notEqual(
      donor.supportAmmunitionTransfer,
      second.find(member => member.id === 'assistant-gunner')
        .supportAmmunitionTransfer
    );
    donor.supportAmmunitionTransfer.remainingRounds = 0;
    assert.equal(
      second.find(member => member.id === 'assistant-gunner')
        .supportAmmunitionTransfer.remainingRounds,
      expectedFeed
    );
  }
});

test('pure handoff waits for the full delay and is partition invariant', () => {
  const configuration = transferFor('FRENCH_CHASSEURS_PORTES_SQUAD');
  const donor = participant(
    configuration.donorSoldierId,
    'MAS36'
  );
  const recipient = participant(
    configuration.recipientSoldierId,
    configuration.weaponId
  );
  const advance = partitions => partitions.reduce(
    (result, deltaSeconds) => {
      const next = advanceInfantryAmmunitionTransfer(
        result.state,
        { donor, recipient, distanceMeters: 1 },
        deltaSeconds
      );
      return {
        state: next.state,
        transferRounds: result.transferRounds + next.transferRounds
      };
    },
    {
      state: createInfantryAmmunitionTransferState(configuration),
      transferRounds: 0
    }
  );

  const before = advance([configuration.delaySeconds - 0.001]);
  assert.equal(before.transferRounds, 0);
  assert.equal(before.state.phase, 'TRANSFERRING');
  assert.equal(before.state.remainingRounds, configuration.carriedRounds);

  const whole = advance([configuration.delaySeconds]);
  const partitioned = advance(
    Array.from({ length: 90 }, () => configuration.delaySeconds / 90)
  );
  assert.deepEqual(partitioned, whole);
  assert.equal(whole.transferRounds, configuration.handoffRounds);
  assert.equal(whole.state.remainingRounds, 0);
  assert.equal(whole.state.phase, 'COMPLETE');

  const repeated = advanceInfantryAmmunitionTransfer(
    whole.state,
    { donor, recipient, distanceMeters: 1 },
    configuration.delaySeconds
  );
  assert.equal(repeated.transferRounds, 0);
  assert.deepEqual(repeated.state, whole.state);
});

test('ineligible or interrupted participants cannot transfer ammunition', () => {
  const configuration = transferFor('GERMAN_GRENADIER_SQUAD_1940');
  const donor = participant(
    configuration.donorSoldierId,
    'KAR98K'
  );
  const recipient = participant(
    configuration.recipientSoldierId,
    configuration.weaponId
  );
  const started = advanceInfantryAmmunitionTransfer(
    createInfantryAmmunitionTransferState(configuration),
    { donor, recipient, distanceMeters: 1 },
    2
  );
  assert.equal(started.state.elapsedSeconds, 2);

  for (const participants of [
    { donor: { ...donor, health: 0, status: 'KIA' }, recipient, distanceMeters: 1 },
    { donor: { ...donor, status: 'INCAPACITATED' }, recipient, distanceMeters: 1 },
    { donor, recipient: { ...recipient, status: 'INCAPACITATED' }, distanceMeters: 1 },
    { donor, recipient: { ...recipient, weaponId: 'KAR98K' }, distanceMeters: 1 },
    { donor, recipient: null, distanceMeters: Infinity },
    { donor, recipient, distanceMeters: configuration.rangeMeters + 0.01 }
  ]) {
    const interrupted = advanceInfantryAmmunitionTransfer(
      started.state,
      participants,
      configuration.delaySeconds
    );
    assert.equal(interrupted.transferRounds, 0);
    assert.equal(interrupted.state.phase, 'READY');
    assert.equal(interrupted.state.elapsedSeconds, 0);
    assert.equal(
      interrupted.state.remainingRounds,
      configuration.carriedRounds
    );
  }
});

test('SoldierAI transfers to reserve and existing timed reload consumes it', () => {
  const unit = makeSupportUnit();
  const { donor, recipient } = pairedAgents(unit);
  const transfer = donor.supportAmmunitionTransfer;
  const reserveBefore = recipient.reserveAmmo;

  assert.equal(unit.soldierAI.advanceSupportAmmunitionTransfers(2.999), 0);
  assert.equal(recipient.reserveAmmo, reserveBefore);
  assert.equal(
    unit.soldierAI.advanceSupportAmmunitionTransfers(0.001),
    transfer.handoffRounds
  );
  assert.equal(
    recipient.reserveAmmo,
    reserveBefore + transfer.handoffRounds
  );
  assert.equal(donor.supportAmmunitionTransfer.remainingRounds, 0);
  assert.equal(
    unit.soldierAI.advanceSupportAmmunitionTransfers(10),
    0,
    'a completed carrier cannot duplicate its feed'
  );

  const reserveAfterTransfer = recipient.reserveAmmo;
  recipient.magazineAmmo = 0;
  assert.equal(recipient.startReload(), true);
  const reloadSeconds = unit.catalogPorts.weapons.get(
    recipient.weaponId
  ).reloadSeconds;
  recipient.updateMovement(reloadSeconds, FLAT_TERRAIN, {
    goal: recipient.position.clone(),
    neighbors: unit.soldierAI.agents,
    anchorMoving: false,
    orderType: 'QUICK',
    squadPinned: false,
    waypointIndex: 0
  });
  assert.ok(recipient.magazineAmmo > 0);
  assert.equal(
    recipient.reserveAmmo,
    reserveAfterTransfer - recipient.magazineAmmo
  );
});

test('post-building simulation sequencing samples final handoff positions', () => {
  const unit = makeSupportUnit(
    'german',
    'GERMAN_GRENADIER_SQUAD_1940',
    'ammo-update-hook'
  );
  const { donor, recipient } = pairedAgents(unit);
  const reserveBefore = recipient.reserveAmmo;
  const simulation = {
    movedUnitIds: new Set(),
    units: [unit],
    terrain: FLAT_TERRAIN,
    factionRoster: {
      opposingUnitsFor() {
        return [];
      },
      unitsFor() {
        return [];
      }
    },
    hasContact() {
      return false;
    },
    buildingInteraction: {
      advance() {
        donor.position.set(
          recipient.position.x + 3,
          recipient.position.y,
          recipient.position.z
        );
        donor.syncRecord();
      }
    },
    syncBuildingInteriorPresentation() {},
    spotting: { advance() {} },
    spottingStepper: new FixedStepAccumulator(1 / 30),
    factionOrder: [],
    combat: { update() {} },
    support: { update() {} }
  };

  GameApp.prototype.simulateStep.call(
    simulation,
    donor.supportAmmunitionTransfer.delaySeconds
  );

  assert.equal(recipient.reserveAmmo, reserveBefore);
  assert.equal(
    donor.supportAmmunitionTransfer.remainingRounds,
    donor.supportAmmunitionTransfer.carriedRounds
  );
  assert.equal(donor.supportAmmunitionTransfer.elapsedSeconds, 0);
});

test('Unit capture and restore preserve handoff progress without shared state', () => {
  const source = makeSupportUnit('german', 'GERMAN_GRENADIER_SQUAD_1940', 'ammo-rollback');
  const sourcePair = pairedAgents(source);
  source.soldierAI.advanceSupportAmmunitionTransfers(1.25);
  const snapshot = source.captureState();

  const restored = makeSupportUnit(
    'german',
    'GERMAN_GRENADIER_SQUAD_1940',
    'ammo-rollback'
  );
  restored.restoreState(snapshot, new Map([[restored.id, restored]]));
  const restoredPair = pairedAgents(restored);
  assert.deepEqual(
    restoredPair.donor.supportAmmunitionTransfer,
    sourcePair.donor.supportAmmunitionTransfer
  );
  assert.notEqual(
    restoredPair.donor.supportAmmunitionTransfer,
    sourcePair.donor.supportAmmunitionTransfer
  );

  snapshot.roster.find(member => member.id === 'assistant-gunner')
    .supportAmmunitionTransfer.elapsedSeconds = 0;
  assert.equal(
    restoredPair.donor.supportAmmunitionTransfer.elapsedSeconds,
    1.25
  );
  source.soldierAI.advanceSupportAmmunitionTransfers(1.75);
  restored.soldierAI.advanceSupportAmmunitionTransfers(1.75);
  assert.deepEqual(restored.captureState(), source.captureState());

  const legacy = restored.captureState();
  const legacyDonor = legacy.roster.find(member =>
    member.id === 'assistant-gunner');
  delete legacyDonor.supportAmmunitionTransfer;
  assert.doesNotThrow(() =>
    restored.restoreState(legacy, new Map([[restored.id, restored]])));
  assert.equal(
    restored.soldierAI.agents.find(agent =>
      agent.id === 'assistant-gunner').supportAmmunitionTransfer,
    null
  );
});

test('a split roster without its paired recipient retains the carrier feed', () => {
  const roster = resolveRoster(
    'french',
    'FRENCH_CHASSEURS_PORTES_SQUAD',
    'split-support'
  ).filter(member => member.id !== 'automatic-rifleman');
  const unit = new Unit({
    id: 'split-support',
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(),
    roster
  });
  const donor = unit.soldierAI.agents.find(agent =>
    agent.id === 'assistant-gunner');
  const before = captureInfantryAmmunitionTransferState(
    donor.supportAmmunitionTransfer
  );

  assert.equal(unit.soldierAI.advanceSupportAmmunitionTransfers(10), 0);
  assert.equal(
    donor.supportAmmunitionTransfer.remainingRounds,
    before.remainingRounds
  );
  assert.equal(donor.supportAmmunitionTransfer.elapsedSeconds, 0);

  const captured = captureInfantryAmmunitionTransferState(
    donor.supportAmmunitionTransfer
  );
  assert.deepEqual(
    restoreInfantryAmmunitionTransferState(captured),
    donor.supportAmmunitionTransfer
  );
});
