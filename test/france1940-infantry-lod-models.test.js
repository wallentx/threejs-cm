import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFrance1940InfantrySquadMesh
} from '../src/content/france1940/render/France1940UnitMeshFactory.js';

const CAMERA_BY_TIER = Object.freeze({
  high: new THREE.Vector3(0, 2, 10),
  medium: new THREE.Vector3(0, 2, 75),
  core: new THREE.Vector3(0, 2, 110),
  proxy: new THREE.Vector3(0, 2, 180)
});

function triangleCount(geometry) {
  return geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position').count / 3;
}

function isEffectivelyVisible(object, root) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) return true;
  }
  return false;
}

function visibleStats(root) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  let objects = 0;
  let triangles = 0;

  root.traverse(object => {
    if (
      !object.isMesh
      || object.userData.lodBand === 'ui'
      || !isEffectivelyVisible(object, root)
    ) {
      return;
    }
    object.geometry.computeBoundingBox();
    bounds.union(
      object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
    );
    objects++;
    triangles += triangleCount(object.geometry);
  });

  return {
    objects,
    triangles,
    bounds,
    size: bounds.getSize(new THREE.Vector3()),
    center: bounds.getCenter(new THREE.Vector3())
  };
}

function setTier(squad, tier) {
  assert.equal(
    squad.userData.updateLOD(CAMERA_BY_TIER[tier], tier),
    tier
  );
}

function visibleNamedMeshes(root, names) {
  const matches = [];
  root.traverse(object => {
    if (
      object.isMesh
      && names.includes(object.name)
      && isEffectivelyVisible(object, root)
    ) {
      matches.push(object);
    }
  });
  return matches;
}

function assertEnvelopeContinuity(reference, candidate, {
  minimumRatio,
  maximumRatio,
  maximumCenterShift
}) {
  for (const axis of ['x', 'y', 'z']) {
    const ratio = candidate.size[axis] / reference.size[axis];
    assert.ok(
      ratio >= minimumRatio && ratio <= maximumRatio,
      `${axis} envelope ratio ${ratio} outside ${minimumRatio}-${maximumRatio}`
    );
  }
  assert.ok(
    reference.center.distanceTo(candidate.center) <= maximumCenterShift,
    `silhouette center shifted ${reference.center.distanceTo(candidate.center)} m`
  );
}

test('French and German infantry use distinct measured high, medium, core, and proxy models', () => {
  const cases = [
    {
      faction: 'french',
      weapon: 'MAS-36 Rifle',
      authoredHelmet: [
        'FrenchM1926_HelmetDome',
        'FrenchM1926_HelmetBrim',
        'FrenchM1926_HelmetCrest'
      ],
      proxyHelmet: [
        'FrenchProxyHelmetDome',
        'FrenchProxyHelmetBrim',
        'FrenchProxyHelmetCrest'
      ]
    },
    {
      faction: 'german',
      weapon: 'Kar98k',
      authoredHelmet: [
        'GermanM35_HelmetDome',
        'GermanM35_HelmetSkirt'
      ],
      proxyHelmet: [
        'GermanProxyHelmetDome',
        'GermanProxyHelmetSkirt'
      ]
    }
  ];

  for (const specification of cases) {
    const squad = createFrance1940InfantrySquadMesh(
      specification.faction,
      [{ id: `${specification.faction}_rifleman`, weapon: specification.weapon }]
    );
    const soldier = squad.userData.soldiers[0];
    const replacement = soldier.userData.lodRepresentations;
    const mediumGeometry = new Set(replacement.medium.map(mesh => mesh.geometry));
    const coreGeometry = new Set(replacement.core.map(mesh => mesh.geometry));

    assert.ok(replacement.medium.length >= 20);
    assert.ok(replacement.core.length >= 18);
    assert.ok(
      [...mediumGeometry].every(geometry => !coreGeometry.has(geometry)),
      'medium and core must own distinct simplified geometry'
    );
    assert.equal(
      replacement.medium.every(mesh =>
        mesh.userData.infantryLodTier === 'medium'
        && mesh.userData.lodBand === 'medium'
      ),
      true
    );
    assert.equal(
      replacement.core.every(mesh =>
        mesh.userData.infantryLodTier === 'core'
        && mesh.userData.lodBand === 'core'
      ),
      true
    );

    const markerReferences = {
      weaponModel: soldier.userData.parts.weaponModel,
      muzzle: soldier.userData.parts.muzzle,
      supportGrip: soldier.userData.parts.supportGrip,
      triggerGrip: soldier.userData.parts.triggerGrip,
      reloadGrip: soldier.userData.parts.reloadGrip
    };
    soldier.updateWorldMatrix(true, true);
    const authoredMuzzle = markerReferences.muzzle.getWorldPosition(
      new THREE.Vector3()
    );

    const stats = {};
    for (const tier of ['high', 'medium', 'core', 'proxy']) {
      setTier(squad, tier);
      stats[tier] = visibleStats(soldier);
      const visibleReplacementTiers = new Set();
      soldier.traverse(object => {
        if (
          object.isMesh
          && object.userData.infantryLodTier
          && isEffectivelyVisible(object, soldier)
        ) {
          visibleReplacementTiers.add(object.userData.infantryLodTier);
        }
      });
      assert.deepEqual(
        [...visibleReplacementTiers],
        tier === 'medium' || tier === 'core' ? [tier] : []
      );

      for (const [key, reference] of Object.entries(markerReferences)) {
        assert.equal(
          soldier.userData.parts[key],
          reference,
          `${tier} must preserve ${key} identity`
        );
      }
      soldier.updateWorldMatrix(true, true);
      assert.ok(
        markerReferences.muzzle.getWorldPosition(new THREE.Vector3())
          .distanceTo(authoredMuzzle) < 1e-9,
        `${tier} must preserve the true modeled muzzle transform`
      );

      if (tier === 'proxy') {
        assert.equal(
          visibleNamedMeshes(soldier, specification.proxyHelmet).length,
          specification.proxyHelmet.length
        );
      } else {
        assert.equal(
          visibleNamedMeshes(soldier, specification.authoredHelmet).length,
          specification.authoredHelmet.length
        );
        const visibleWeaponMeshes = [];
        markerReferences.weaponModel.traverse(object => {
          if (object.isMesh && isEffectivelyVisible(object, soldier)) {
            visibleWeaponMeshes.push(object);
          }
        });
        assert.ok(visibleWeaponMeshes.length > 0);
      }
    }

    assert.ok(stats.medium.objects < stats.high.objects);
    assert.ok(stats.core.objects < stats.medium.objects);
    assert.ok(stats.proxy.objects < stats.core.objects);
    assert.ok(stats.medium.triangles <= stats.high.triangles * 0.5);
    assert.ok(stats.core.triangles <= stats.high.triangles * 0.32);
    assert.ok(stats.core.triangles <= stats.medium.triangles * 0.75);
    assert.ok(stats.proxy.triangles <= stats.high.triangles * 0.03);

    assertEnvelopeContinuity(stats.high, stats.medium, {
      minimumRatio: 0.88,
      maximumRatio: 1.05,
      maximumCenterShift: 0.1
    });
    assertEnvelopeContinuity(stats.high, stats.core, {
      minimumRatio: 0.88,
      maximumRatio: 1.05,
      maximumCenterShift: 0.1
    });
    assertEnvelopeContinuity(stats.high, stats.proxy, {
      minimumRatio: 0.45,
      maximumRatio: 0.85,
      maximumCenterShift: 0.25
    });
  }
});

test('derived infantry tiers share pose pivots, cast shadows, and retain bounded resource ownership', () => {
  for (const faction of ['french', 'german']) {
    const weapon = faction === 'french' ? 'MAS-36 Rifle' : 'Kar98k';
    const squad = createFrance1940InfantrySquadMesh(faction, [
      { id: `${faction}_first`, weapon },
      { id: `${faction}_second`, weapon }
    ]);
    const [first, second] = squad.userData.soldiers;

    for (const tier of ['medium', 'core']) {
      const firstMeshes = first.userData.lodRepresentations[tier];
      const secondMeshes = second.userData.lodRepresentations[tier];
      assert.equal(firstMeshes.every(mesh => mesh.castShadow), true);
      assert.equal(secondMeshes.every(mesh => mesh.castShadow), true);

      const firstTorso = firstMeshes.find(
        mesh => mesh.userData.lodComponent === 'torso'
      );
      const secondTorso = secondMeshes.find(
        mesh => mesh.userData.lodComponent === 'torso'
      );
      assert.ok(firstTorso && secondTorso);
      assert.equal(
        firstTorso.geometry,
        secondTorso.geometry,
        `${tier} geometry should be shared within one squad`
      );
      assert.notEqual(
        firstTorso.material,
        secondTorso.material,
        `${tier} material ownership must remain per mesh`
      );
    }

    setTier(squad, 'medium');
    const parts = first.userData.parts;
    const mediumForearm = first.userData.lodRepresentations.medium.find(
      mesh =>
        mesh.userData.lodComponent === 'forearm'
        && parts.leftArm.getObjectById(mesh.id)
    );
    const mediumTorso = first.userData.lodRepresentations.medium.find(
      mesh => mesh.userData.lodComponent === 'torso'
    );
    assert.ok(mediumForearm);
    assert.ok(mediumTorso);

    first.updateWorldMatrix(true, true);
    const forearmBefore = mediumForearm.getWorldPosition(new THREE.Vector3());
    parts.leftArm.rotation.x += 0.45;
    parts.torso.rotation.z = 0.2;
    first.updateWorldMatrix(true, true);
    const forearmAfter = mediumForearm.getWorldPosition(new THREE.Vector3());
    assert.ok(
      forearmBefore.distanceTo(forearmAfter) > 0.05,
      'medium forearm must follow the authored arm pivot'
    );
    assert.ok(
      mediumTorso.getWorldQuaternion(new THREE.Quaternion())
        .angleTo(new THREE.Quaternion()) > 0.19,
      'medium torso must follow the authored torso pose pivot'
    );

    setTier(squad, 'core');
    const coreForearm = first.userData.lodRepresentations.core.find(
      mesh =>
        mesh.userData.lodComponent === 'forearm'
        && parts.leftArm.getObjectById(mesh.id)
    );
    assert.ok(coreForearm);
    assert.equal(coreForearm.visible, true);
    assert.equal(mediumForearm.visible, false);
    assert.equal(parts.leftHand.visible, true);
    assert.equal(parts.rightHand.visible, true);

    squad.traverse(object => {
      assert.ok(object.scale.x > 0);
      assert.ok(object.scale.y > 0);
      assert.ok(object.scale.z > 0);
    });
  }
});
