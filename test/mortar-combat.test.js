import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from '../src/content/france1940/catalogPorts.js';
import {
  FRANCE_1940_FORMATIONS
} from '../src/content/france1940/formations.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { TEST_VFX_PROVIDER } from './helpers/TestVfxProvider.js';

const flatTerrain = {
  getHeightAt() {
    return 0;
  },
  getMovementHeightAt() {
    return 0;
  }
};

function createMortarUnit(id = 'mortar_team') {
  const formation =
    FRANCE_1940_FORMATIONS.FRENCH_BRANDT_MLE1935_60MM_TEAM;
  const roster = formation.members.map(member => {
    const weapon = FRANCE_1940_CATALOG_PORTS.weapons.get(member.weaponId);
    return {
      ...member,
      weapon: weapon.name,
      status: 'OK',
      health: 100
    };
  });
  return new Unit({
    id,
    faction: 'french',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 0),
    roster,
    crewServedWeapon: formation.crewServedWeapon
  });
}

function advanceUnit(unit, seconds, step = 1 / 60) {
  let elapsed = 0;
  while (elapsed < seconds - 1e-12) {
    const delta = Math.min(step, seconds - elapsed);
    unit.update(delta, flatTerrain);
    elapsed += delta;
  }
}

function advanceCombat(combat, limitSeconds = 20) {
  const step = 1 / 120;
  for (
    let elapsed = 0;
    elapsed < limitSeconds && combat.projectiles.length > 0;
    elapsed += step
  ) {
    combat.update(step);
  }
  assert.equal(
    combat.projectiles.length,
    0,
    'mortar projectile must resolve within its captured lifetime'
  );
}

function mortarMissionContext(mortar, target) {
  const observerId = mortar.mortarTeamConfig.gunnerSoldierId;
  const gunner = mortar.roster.find(
    soldier => String(soldier.id) === String(observerId)
  );
  const horizontalRangeMeters = Math.hypot(
    target.position.x - mortar.position.x,
    target.position.z - mortar.position.z
  );
  return {
    observer: {
      id: observerId,
      health: gunner.health,
      status: gunner.status,
      available: gunner.health > 0 && gunner.status !== 'KIA'
    },
    team: {
      id: mortar.id,
      available: mortar.mortarTeamState.deploymentState === 'READY'
    },
    target: {
      id: target.id,
      valid: target.isCombatEffective(),
      observable: true
    },
    communications: {
      observerId,
      teamId: mortar.id,
      authorized: true,
      operational: true
    },
    trajectory: {
      solutionAvailable: true,
      horizontalRangeMeters,
      minimumRangeMeters: mortar.mortarTeamConfig.minimumRangeMeters,
      maximumRangeMeters: mortar.mortarTeamConfig.maximumRangeMeters
    }
  };
}

test('production mortar team renders a true muzzle and deploys through timed authoritative state', () => {
  const mortar = createMortarUnit();
  const gunnerMesh = mortar.mesh.userData.soldiers.find(
    soldier => soldier.userData.soldierId === 'mortar-gunner'
  );

  assert.ok(mortar.mesh.userData.mortarEquipment);
  assert.equal(
    mortar.mesh.userData.mortarMuzzle.name,
    'BrandtMle1935_60mm_Muzzle'
  );
  assert.equal(mortar.mortarTeamState.deploymentState, 'PACKED');
  assert.equal(mortar.hasDeployableCrewServedWeapon(), true);
  assert.equal(gunnerMesh.userData.parts.weaponRig.visible, true);

  assert.equal(mortar.toggleCrewServedDeployment(), 'SETTING_UP');
  assert.equal(mortar.isDeployed, true, 'setup locks ordinary movement');
  advanceUnit(mortar, 5, 1 / 30);
  assert.equal(mortar.mortarTeamState.deploymentState, 'READY');
  assert.equal(gunnerMesh.userData.parts.weaponRig.visible, false);

  mortar.mesh.updateWorldMatrix(true, true);
  const muzzle = mortar.getMortarMuzzleWorldPosition();
  assert.ok(muzzle.y > 0.5);
  assert.equal(mortar.mesh.userData.mortarEquipment.userData.bipod.visible, true);

  const snapshot = mortar.captureState();
  mortar.toggleCrewServedDeployment();
  advanceUnit(mortar, 3, 1 / 120);
  assert.equal(mortar.mortarTeamState.deploymentState, 'PACKED');
  mortar.restoreState(snapshot, new Map([[mortar.id, mortar]]));
  assert.deepEqual(mortar.captureState(), snapshot);
  assert.equal(gunnerMesh.userData.parts.weaponRig.visible, false);
});

test('deployed mortar launches a captured high arc, consumes one owned round, and replays its blast', () => {
  const mortar = createMortarUnit('mortar_replay');
  const target = new Unit({
    id: 'mortar_target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 100)
  });
  const scene = new THREE.Scene();
  scene.add(mortar.mesh, target.mesh);
  const combat = new CombatSystem(scene, {}, () => 0, {
    terrain: flatTerrain,
    getUnits: () => [mortar, target],
    vfxProvider: TEST_VFX_PROVIDER
  });
  const unitMap = new Map([
    [mortar.id, mortar],
    [target.id, target]
  ]);

  mortar.toggleCrewServedDeployment();
  advanceUnit(mortar, 5);
  mortar.targetPos = new THREE.Vector3(0, 0, 100);
  mortar.targetMode = 'TARGET';
  assert.equal(mortar.updateMortarCombat({
    terrain: flatTerrain,
    combat,
    random: () => 0
  }), true);

  assert.equal(combat.projectiles.length, 1);
  const projectile = combat.projectiles[0];
  assert.equal(projectile.weapon.id, 'BRANDT_MLE1935_60MM_HE');
  assert.equal(projectile.shooterId, 'mortar-gunner');
  assert.equal(projectile.mountId, 'brandtmle1935-60mm-team');
  assert.ok(projectile.velocity.y > 0);
  assert.ok(projectile.maxLifetime > 5);
  assert.equal(
    Object.values(mortar.mortarTeamState.roundsBySoldierId)
      .reduce((sum, rounds) => sum + rounds, 0),
    23
  );
  assert.equal(mortar.mortarTeamState.roundsBySoldierId['mortar-gunner'], 5);

  for (let step = 0; step < 60; step++) combat.update(1 / 120);
  const unitSnapshots = [mortar.captureState(), target.captureState()];
  const combatSnapshot = combat.captureState();
  assert.equal(combatSnapshot.projectiles.length, 1);
  assert.ok(combatSnapshot.projectiles[0].velocity[1] > 0);
  assert.doesNotThrow(() => JSON.stringify(combatSnapshot));

  advanceCombat(combat);
  const firstOutcome = {
    target: target.captureState(),
    combat: combat.captureState()
  };
  assert.equal(firstOutcome.combat.telemetry.impacts.length, 1);
  const impact = firstOutcome.combat.telemetry.impacts[0];
  assert.equal(impact.weaponId, 'BRANDT_MLE1935_60MM_HE');
  assert.equal(impact.fireControlModelVersion, 'mortar-high-angle-v1');
  assert.ok(impact.flightTime > 4);
  assert.ok(
    target.roster.some(soldier => soldier.health < 100)
      || target.suppression > 0,
    'the existing blast path must affect nearby infantry'
  );

  for (const snapshot of unitSnapshots) {
    unitMap.get(snapshot.id).restoreState(snapshot, unitMap);
  }
  combat.restoreState(combatSnapshot, unitMap);
  assert.deepEqual(combat.captureState(), combatSnapshot);
  advanceCombat(combat);
  assert.deepEqual(target.captureState(), firstOutcome.target);
  assert.deepEqual(combat.captureState(), firstOutcome.combat);

  combat.dispose();
});

test('a Unit mission ranging shot becomes one accepted projectile with rollback-owned stable IDs', () => {
  const mortar = createMortarUnit('mortar_mission');
  const target = new Unit({
    id: 'mortar_mission_target',
    faction: 'german',
    type: 'infantry_squad',
    position: new THREE.Vector3(0, 0, 100)
  });
  const scene = new THREE.Scene();
  scene.add(mortar.mesh, target.mesh);
  const combat = new CombatSystem(scene, {}, () => 0, {
    terrain: flatTerrain,
    getUnits: () => [mortar, target],
    vfxProvider: TEST_VFX_PROVIDER
  });

  mortar.toggleCrewServedDeployment();
  advanceUnit(mortar, 5);
  const context = mortarMissionContext(mortar, target);
  assert.deepEqual(
    mortar.requestMortarFireMission(
      {
        missionId: 'mortar_mission:mission:1',
        observerId: mortar.mortarTeamConfig.gunnerSoldierId,
        teamId: mortar.id,
        targetId: target.id,
        targetPoint: target.position.toArray(),
        fireForEffectRounds: 2
      },
      context
    ),
    {
      accepted: true,
      reason: 'ACCEPTED',
      missionId: 'mortar_mission:mission:1'
    }
  );

  mortar.advanceMortarFireMission(2, context);
  assert.equal(
    mortar.getPendingMortarFireMissionShot().shotId,
    'mortar_mission:mission:1:ranging:1'
  );
  assert.equal(
    mortar.updateMortarCombat({
      terrain: flatTerrain,
      combat,
      random: () => 0,
      mortarMissionContext: context
    }),
    true
  );

  assert.equal(combat.projectiles.length, 1);
  assert.equal(
    combat.projectiles[0].indirectMissionId,
    'mortar_mission:mission:1'
  );
  assert.equal(
    combat.projectiles[0].indirectMissionShotId,
    'mortar_mission:mission:1:ranging:1'
  );
  assert.equal(combat.projectiles[0].indirectMissionShotKind, 'RANGING');
  assert.equal(
    mortar.mortarFireMissionState.mission.phase,
    'AWAITING_RANGING_OBSERVATION'
  );

  const snapshot = mortar.captureState();
  mortar.cancelMortarFireMission('TEST_MUTATION');
  mortar.restoreState(snapshot, new Map([[mortar.id, mortar]]));
  assert.deepEqual(mortar.captureState(), snapshot);

  combat.dispose();
});
