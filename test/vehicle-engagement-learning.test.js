import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';
import {
  captureVehicleEngagementLearningState,
  createVehicleEngagementLearningState,
  isOperationalArmoredCannonThreat,
  recordAdaptiveVehicleRetarget,
  recordVehicleEngagementImpact,
  selectAdaptiveVehicleAmmoType,
  selectAdaptiveVehicleTarget,
  selectVehicleEngagementAim,
  setVehicleEngagementTarget
} from '../src/simulation/combat/VehicleEngagementLearning.js';

const CANNON = Object.freeze({
  id: 'test-cannon',
  kind: 'cannon',
  muzzleVelocity: 700,
  penetrationMmAt100m: 80,
  penetrationVelocityExponent: 1
});

function learningFor(targetUnitId = 'target-a') {
  return setVehicleEngagementTarget(
    createVehicleEngagementLearningState(),
    targetUnitId
  );
}

function impact(state, result, targetUnitId = 'target-a') {
  return recordVehicleEngagementImpact(state, {
    targetUnitId,
    weapon: CANNON,
    result
  });
}

function threat(id, {
  x = 0,
  z = 20,
  armor = 40,
  combatEffective = true,
  burning = false,
  secondaryExplosion = false,
  mainAmmo = 1,
  gunner = true,
  mobility = 100,
  hullCannonAmmo = 0
} = {}) {
  return {
    id,
    position: new THREE.Vector3(x, 0, z),
    rotation: Math.PI,
    vehicleSpec: {
      armorMm: {
        hull_front: armor,
        turret_front: armor,
        hull_side: armor * 0.75,
        turret_side: armor * 0.75,
        hull_rear: armor * 0.5,
        turret_rear: armor * 0.5
      },
      mainGun: { ap: 'main-ap' },
      weaponMounts: hullCannonAmmo > 0
        ? [{ id: 'hull_main', kind: 'cannon' }]
        : []
    },
    vehicleComponents: {
      mobility: { health: mobility, operational: mobility > 0 }
    },
    vehicleWeapon: {
      feedAmmo: mainAmmo,
      ammunition: { ap: 0 }
    },
    vehicleMounts: hullCannonAmmo > 0
      ? { hull_main: { feedAmmo: hullCannonAmmo, ammunition: {} } }
      : {},
    vehicleDamageState: { burning, secondaryExplosion },
    isCombatEffective: () => combatEffective,
    hasOperationalGunner: () => gunner,
    isVehicleMountOperational: mountId => mountId === 'hull_main'
  };
}

test('stops, ricochets, and penetrations advance bounded authored aim points at exact thresholds', () => {
  const state = learningFor();
  const aimPoints = ['center', 'mantlet', 'lower-hull'];

  impact(state, { penetrated: false, ricocheted: false });
  assert.equal(state.lastOutcome, 'STOPPED');
  assert.equal(state.aimStep, 0);
  impact(state, { penetrated: false, ricocheted: true });
  assert.equal(state.lastOutcome, 'RICOCHET');
  assert.equal(state.aimStep, 1);
  assert.equal(selectVehicleEngagementAim(aimPoints, state), 'mantlet');
  impact(state, { penetrated: true });
  assert.equal(state.lastOutcome, 'PENETRATED_NO_OBSERVABLE_EFFECT');
  assert.equal(state.ammoTrialRequested, false);
  impact(state, { penetrated: true });
  assert.equal(state.aimStep, 2);
  assert.equal(state.ammoTrialRequested, true);
  assert.equal(state.retargetRequested, true);
  assert.equal(selectVehicleEngagementAim(aimPoints, state), 'lower-hull');
});

test('partial hidden damage continues escalation while observable destruction resets it', () => {
  const state = learningFor();
  impact(state, {
    penetrated: true,
    crewResult: { components: [{ id: 'engine', damage: 20 }] }
  });
  assert.equal(state.lastOutcome, 'DAMAGE_TARGET_STILL_EFFECTIVE');
  assert.equal(state.ineffectiveHits, 1);
  assert.equal(state.effectiveHits, 1);

  impact(state, { penetrated: true, crewResult: { casualty: true } });
  assert.equal(state.ineffectiveHits, 2);
  assert.equal(state.aimStep, 1);

  impact(state, { penetrated: true, crewResult: { burning: true } });
  assert.equal(state.lastOutcome, 'EFFECTIVE');
  assert.equal(state.ineffectiveHits, 0);
  assert.equal(state.aimStep, 0);
  assert.equal(state.ammoTrialRequested, false);
  assert.equal(state.retargetRequested, false);
});

test('automatic ammunition trial requires an available useful alternate and preserves explicit modes', () => {
  const state = learningFor();
  state.ammoTrialRequested = true;
  const vehicleSpec = { mainGun: { ap: 'ap-gun', he: 'he-gun' } };
  const ammunitionState = {
    loadedType: 'ap',
    feedAmmo: 1,
    ammunition: { ap: 2, he: 3 }
  };
  const weaponLookup = id => id === 'he-gun'
    ? { id, explosiveRadius: 5 }
    : { id, explosiveRadius: 0 };

  assert.equal(selectAdaptiveVehicleAmmoType({
    state,
    mode: 'TARGET',
    defaultAmmoType: 'ap',
    vehicleSpec,
    weaponLookup,
    ammunitionState
  }), 'he');
  for (const mode of ['AP', 'HE']) {
    assert.equal(selectAdaptiveVehicleAmmoType({
      state,
      mode,
      defaultAmmoType: 'ap',
      vehicleSpec,
      weaponLookup,
      ammunitionState
    }), 'ap');
  }
  ammunitionState.ammunition.he = 0;
  assert.equal(selectAdaptiveVehicleAmmoType({
    state,
    mode: 'TARGET',
    defaultAmmoType: 'ap',
    vehicleSpec,
    weaponLookup,
    ammunitionState
  }), 'ap');
});

test('operational threat policy rejects neutralized guns but retains immobilized and secondary cannon threats', () => {
  assert.equal(isOperationalArmoredCannonThreat(threat('mobile')), true);
  assert.equal(isOperationalArmoredCannonThreat(threat('immobile', { mobility: 0 })), true);
  assert.equal(isOperationalArmoredCannonThreat(threat('burning', { burning: true })), false);
  assert.equal(isOperationalArmoredCannonThreat(threat('destroyed', { combatEffective: false })), false);
  assert.equal(isOperationalArmoredCannonThreat(threat('no-ammo', { mainAmmo: 0 })), false);
  assert.equal(isOperationalArmoredCannonThreat(threat('no-gunner', { gunner: false })), false);
  assert.equal(isOperationalArmoredCannonThreat(threat('hull-cannon', {
    mainAmmo: 0,
    gunner: false,
    hullCannonAmmo: 2
  })), true);
});

test('adaptive target selection is input-order stable and retarget history restores exactly', () => {
  const attacker = { id: 'attacker', position: new THREE.Vector3() };
  const current = threat('current', { z: 90, armor: 90 });
  const alpha = threat('alpha', { x: -2, z: 20, armor: 30 });
  const bravo = threat('bravo', { x: 2, z: 20, armor: 30 });
  const neutralized = threat('neutralized', { z: 5, combatEffective: false });

  const selectedForward = selectAdaptiveVehicleTarget({
    attacker,
    candidates: [bravo, neutralized, alpha],
    currentTarget: current,
    weapon: CANNON
  });
  const selectedReverse = selectAdaptiveVehicleTarget({
    attacker,
    candidates: [alpha, neutralized, bravo],
    currentTarget: current,
    weapon: CANNON
  });
  assert.equal(selectedForward.id, 'alpha');
  assert.equal(selectedReverse.id, 'alpha');

  const state = learningFor(current.id);
  for (let index = 0; index < 4; index++) impact(state, { ricocheted: true }, current.id);
  recordAdaptiveVehicleRetarget(state, {
    fromTargetUnitId: current.id,
    toTargetUnitId: selectedForward.id
  });
  setVehicleEngagementTarget(state, selectedForward.id);
  const snapshot = captureVehicleEngagementLearningState(state);
  const restored = createVehicleEngagementLearningState(snapshot);
  assert.deepEqual(captureVehicleEngagementLearningState(restored), snapshot);
  assert.equal(restored.adaptiveRetargetCount, 1);
  assert.equal(restored.lastRetargetFromUnitId, 'current');
  assert.equal(restored.lastRetargetToUnitId, 'alpha');
});

test('neutralized current armor is never retained as a score baseline or fallback', () => {
  const attacker = { id: 'attacker', position: new THREE.Vector3() };
  const neutralized = threat('neutralized', { combatEffective: false });
  assert.equal(selectAdaptiveVehicleTarget({
    attacker,
    candidates: [neutralized],
    currentTarget: neutralized,
    weapon: CANNON
  }), null);
  assert.equal(selectAdaptiveVehicleTarget({
    attacker,
    candidates: [],
    currentTarget: threat('burning', { burning: true }),
    weapon: CANNON
  }), null);
});

test('explicit fire retains neutralized armor while automatic targeting replaces it', () => {
  const neutralized = threat('neutralized', {
    combatEffective: false,
    mainAmmo: 0,
    z: 10
  });
  const alpha = threat('alpha', { x: -2, z: 20, armor: 30 });
  const bravo = threat('bravo', { x: 2, z: 20, armor: 30 });
  const clearReasons = [];
  const attacker = {
    id: 'attacker',
    faction: 'french',
    position: new THREE.Vector3(),
    vehicleSpec: { mainGun: { ap: CANNON.id } },
    vehicleWeapon: { targetUnitId: neutralized.id },
    targetUnit: neutralized,
    targetPos: neutralized.position.clone(),
    weaponLookup: () => CANNON,
    clearTargetOrder(reason) {
      clearReasons.push(reason);
      this.targetUnit = null;
      this.targetPos = null;
    }
  };
  const game = Object.assign(Object.create(GameApp.prototype), {
    random: () => 0.999,
    spotting: {
      canPrecisionTarget: () => true,
      checkLOS: () => ({ clear: true, dist: 20 })
    }
  });
  const selected = game.chooseTarget(attacker, [bravo, neutralized, alpha]);
  assert.equal(selected, neutralized);
  assert.deepEqual(clearReasons, []);
  assert.equal(attacker.targetUnit, neutralized);
  assert.deepEqual(attacker.targetPos.toArray(), neutralized.position.toArray());

  attacker.targetUnit = null;
  attacker.targetPos = null;
  const automatic = game.chooseTarget(attacker, [bravo, neutralized, alpha]);
  assert.equal(automatic?.id, 'alpha');
});

test('late impacts from a previous stable target cannot mutate current learning evidence', () => {
  const state = learningFor('target-a');
  impact(state, { ricocheted: true });
  setVehicleEngagementTarget(state, 'target-b');
  const before = captureVehicleEngagementLearningState(state);
  impact(state, { crewResult: { destroyed: true } }, 'target-a');
  assert.deepEqual(captureVehicleEngagementLearningState(state), before);
});
