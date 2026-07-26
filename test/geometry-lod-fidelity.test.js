import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from '../src/game/Unit.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import {
  createSectionedHullGeometry
} from '../src/world/vehicles/VehicleModelEnhancer.js';

const triangle = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  ab: new THREE.Vector3(),
  ac: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  center: new THREE.Vector3()
};

function forEachTriangle(geometry, visit) {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  const triangleCount = indices ? indices.count / 3 : positions.count / 3;
  for (let index = 0; index < triangleCount; index++) {
    const offset = index * 3;
    const ia = indices ? indices.getX(offset) : offset;
    const ib = indices ? indices.getX(offset + 1) : offset + 1;
    const ic = indices ? indices.getX(offset + 2) : offset + 2;
    triangle.a.fromBufferAttribute(positions, ia);
    triangle.b.fromBufferAttribute(positions, ib);
    triangle.c.fromBufferAttribute(positions, ic);
    triangle.ab.subVectors(triangle.b, triangle.a);
    triangle.ac.subVectors(triangle.c, triangle.a);
    triangle.normal.crossVectors(triangle.ab, triangle.ac);
    triangle.center.copy(triangle.a).add(triangle.b).add(triangle.c).multiplyScalar(1 / 3);
    visit(triangle, index);
  }
}

function assertConvexFacesOutward(geometry, label, origin = new THREE.Vector3()) {
  let triangleCount = 0;
  forEachTriangle(geometry, ({ normal, center }, index) => {
    assert.ok(normal.lengthSq() > 1e-12, `${label} triangle ${index} must not collapse`);
    assert.ok(
      normal.dot(center.clone().sub(origin)) > 1e-8,
      `${label} triangle ${index} must face away from its interior`
    );
    triangleCount++;
  });
  assert.ok(triangleCount > 0, `${label} needs triangles`);
}

test('sectioned vehicle hull compiler winds every convex plate outward', () => {
  for (const style of ['cast', 'riveted', 'boxy', 'armoredCar']) {
    const geometry = createSectionedHullGeometry(5, 2.2, 1.2, style);
    assertConvexFacesOutward(geometry, `${style} sectioned hull`);
  }
});

test('R35 and H39 turrets seat on outward-wound cast decks', () => {
  for (const [type, hullName] of [
    ['fr_renault_r35', 'R35_CastHull'],
    ['fr_hotchkiss_h39', 'H39_CastHull']
  ]) {
    const vehicle = UnitFactory.createTankMesh(type);
    const hull = vehicle.getObjectByName(hullName);
    const turret = vehicle.userData.turret;
    assert.ok(hull, `${type} needs named primary hull`);
    assert.ok(turret?.userData.deckContact, `${type} needs explicit deck-contact contract`);
    assert.equal(hull.material.side, THREE.FrontSide);

    hull.geometry.computeBoundingBox();
    const deckTop = hull.position.y + hull.geometry.boundingBox.max.y;
    const gap = turret.position.y - deckTop;
    assert.ok(
      gap <= turret.userData.deckContact.maxGapMeters && gap >= -0.04,
      `${type} turret deck gap ${gap.toFixed(3)}m must remain seated`
    );
  }
});

test('Panzer III rear deck remains outward-facing at core distance', () => {
  const vehicle = UnitFactory.createTankMesh('ger_panzer3');
  const deck = vehicle.getObjectByName('PzIII_EngineDeck');
  assert.ok(deck);
  assert.equal(deck.userData.surfaceRole, 'rear-hull-deck');
  assert.equal(deck.userData.lodBand, 'core');
  assert.equal(deck.material.side, THREE.FrontSide);
  assertConvexFacesOutward(deck.geometry, 'Panzer III engine deck');
});

test('French helmet geometry is outward-facing and survives core and proxy LODs', () => {
  const unit = new Unit({
    id: 'french_headgear_lod',
    faction: 'french',
    type: 'infantry_squad'
  });

  unit.updateLOD(new THREE.Vector3(0, 2, 100), 'high');
  assert.equal(unit.currentLOD, 'core');
  for (const soldier of unit.mesh.userData.soldiers) {
    for (const part of soldier.userData.parts.headgear) {
      assert.equal(part.userData.lodBand, 'core');
      assert.equal(part.visible, true);
      assert.equal(part.material.side, THREE.FrontSide);
      assertConvexFacesOutward(part.geometry, part.name);
    }
  }

  unit.updateLOD(new THREE.Vector3(0, 2, 180), 'high');
  assert.equal(unit.currentLOD, 'low');
  for (const soldier of unit.mesh.userData.soldiers) {
    const visibleProxyHelmetParts = [];
    soldier.getObjectByName('LowDetailProxy').traverse(object => {
      if (object.isMesh
          && object.visible
          && object.userData.surfaceRole === 'helmet-proxy') {
        visibleProxyHelmetParts.push(object);
      }
    });
    assert.ok(visibleProxyHelmetParts.length >= 3, 'French proxy keeps dome, brim, and crest');
  }
});

test('core infantry LOD keeps firearm silhouette connected to modeled muzzle', () => {
  for (const faction of ['french', 'german']) {
    const unit = new Unit({
      id: `${faction}_weapon_core_lod`,
      faction,
      type: 'infantry_squad'
    });
    unit.updateLOD(new THREE.Vector3(0, 2, 100), 'high');
    assert.equal(unit.currentLOD, 'core');

    for (const soldier of unit.mesh.userData.soldiers) {
      const { weaponModel, muzzle } = soldier.userData.parts;
      const { barrel, coreSilhouette } = weaponModel.userData.parts;
      assert.ok(coreSilhouette.length >= 5);
      for (const part of coreSilhouette) {
        assert.equal(part.userData.lodBand, 'core', `${part.name} must survive core LOD`);
        assert.equal(part.visible, true, `${part.name} must be visible at core LOD`);
      }

      barrel.geometry.computeBoundingBox();
      const barrelEnd = barrel.position.z + barrel.geometry.boundingBox.max.z;
      assert.ok(
        Math.abs(barrelEnd - muzzle.position.z) < 1e-6,
        `${soldier.userData.weaponName} core barrel must terminate at muzzle marker`
      );
    }
  }
});

test('infantry firing rigs use right trigger hands and right-side rifle actions', () => {
  for (const faction of ['french', 'german']) {
    const unit = new Unit({
      id: `${faction}_right_handed`,
      faction,
      type: 'infantry_squad'
    });
    for (const soldier of unit.mesh.userData.soldiers) {
      const parts = soldier.userData.parts;
      assert.equal(parts.rightArm.userData.anatomicalSide, 'right');
      assert.equal(parts.leftArm.userData.anatomicalSide, 'left');
      assert.ok(parts.rightArm.position.x > 0);
      assert.ok(parts.leftArm.position.x < 0);
      assert.deepEqual(parts.weaponRig.userData.handedness, {
        firingHand: 'right',
        triggerSide: '+X',
        supportHand: 'left'
      });
      assert.equal(parts.weaponRig.userData.handBindings.trigger, 'RightHand');
      assert.equal(parts.weaponRig.userData.handBindings.support, 'LeftHand');
      assert.ok(parts.weaponRig.position.x > 0.15, 'stock must visibly seat at right shoulder');

      if (/MAS-36|Kar98k/.test(soldier.userData.weaponName)) {
        const { boltHandle, ejectionPort } = parts.weaponModel.userData.parts;
        assert.equal(boltHandle.userData.semanticSide, 'right');
        assert.equal(ejectionPort.userData.semanticSide, 'right');
        assert.ok(boltHandle.position.x > 0);
        assert.ok(ejectionPort.position.x > 0);
      }

      const expectedChargingSide = new Map([
        ['FM 24/29 LMG', 'right'],
        ['MAS-38 SMG', 'right'],
        ['MG34 LMG', 'right'],
        ['MP40', 'left']
      ]).get(soldier.userData.weaponName);
      if (expectedChargingSide) {
        const { chargingHandle } = parts.weaponModel.userData.parts;
        assert.equal(chargingHandle.userData.semanticSide, expectedChargingSide);
        assert.equal(
          Math.sign(chargingHandle.position.x),
          expectedChargingSide === 'right' ? 1 : -1
        );
      }
    }
  }
});

test('confirmed right-side coax mounts align rendered barrels and muzzle markers', () => {
  for (const type of [
    'fr_hotchkiss_h39',
    'ger_panzer3',
    'ger_panzer35t',
    'ger_panzer38t',
    'ger_sdkfz231',
    'ger_panzer4'
  ]) {
    const vehicle = UnitFactory.createTankMesh(type);
    const marker = vehicle.userData.weaponMuzzles.coax;
    const mainMuzzle = vehicle.userData.muzzle;
    assert.equal(marker.parent, mainMuzzle.parent, `${type} coax must traverse with main gun`);
    assert.equal(marker.userData.mountSide, 'right');
    assert.match(marker.userData.placementQuality, /historical/);
    assert.ok(
      marker.position.x > mainMuzzle.position.x,
      `${type} confirmed right-side coax must be +X of main gun`
    );

    const renderedBarrels = [];
    marker.parent.traverse(object => {
      if (object.isMesh && object.userData.weaponMountId === 'coax') {
        renderedBarrels.push(object);
      }
    });
    assert.ok(renderedBarrels.length > 0, `${type} needs visible coax geometry`);
    for (const barrel of renderedBarrels) {
      assert.equal(barrel.userData.mountSide, 'right');
      assert.ok(
        Math.abs(barrel.position.x - marker.position.x) < 1e-6,
        `${type} rendered coax must align laterally with its muzzle marker`
      );
    }
  }
});

test('Char B1 hull machine gun remains right of its right-side 75mm gun', () => {
  const vehicle = UnitFactory.createTankMesh('fr_char_b1bis');
  const hullGun = vehicle.getObjectByName('CharB1_75mm_HullGun');
  const marker = vehicle.userData.weaponMuzzles.hull_mg;
  assert.equal(hullGun.userData.mountSide, 'right');
  assert.equal(marker.userData.mountSide, 'right');
  assert.ok(hullGun.position.x > 0);
  assert.ok(marker.position.x > hullGun.position.x);
  const barrel = vehicle.children.find(
    object => object.isMesh && object.userData.weaponMountId === 'hull_mg'
  );
  assert.ok(barrel, 'Char B1 hull MG needs visible rendered barrel');
  assert.equal(barrel.position.x, marker.position.x);
});

test('uncertain mount sides remain explicitly provisional instead of guessed', () => {
  for (const type of [
    'fr_somua',
    'fr_renault_r35',
    'fr_amc35',
    'fr_char_b1bis',
    'ger_panzer2'
  ]) {
    const vehicle = UnitFactory.createTankMesh(type);
    const marker = vehicle.userData.weaponMuzzles.coax;
    assert.equal(marker.userData.mountSide, 'pending');
    assert.match(marker.userData.placementQuality, /pending direct visual confirmation/);
  }
});
