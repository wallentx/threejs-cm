import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import {
  createSectionedHullGeometry
} from '../src/world/vehicles/VehicleModelEnhancer.js';

const createVehicleMesh = modelId => UnitFactory.createTankMesh(
  modelId,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
);

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
  for (const type of ['fr_renault_r35', 'fr_hotchkiss_h39']) {
    const vehicle = createVehicleMesh(type);
    const turret = vehicle.userData.turret;
    assert.ok(turret?.userData.deckContact, `${type} needs explicit deck-contact contract`);
    const deck = vehicle.getObjectByName(turret.userData.deckContact.hullName);
    assert.ok(deck, `${type} needs its declared turret deck`);
    assert.equal(deck.material.side, THREE.FrontSide);

    deck.geometry.computeBoundingBox();
    const deckTop = deck.position.y + deck.geometry.boundingBox.max.y;
    const gap = turret.position.y - deckTop;
    assert.ok(
      gap <= turret.userData.deckContact.maxGapMeters && gap >= -0.04,
      `${type} turret deck gap ${gap.toFixed(3)}m must remain seated`
    );

    if (type === 'fr_renault_r35') {
      assert.equal(
        vehicle.getObjectByName('R35_APXR_Cupola').userData.lodBand,
        'core',
        'R35 core silhouette must retain its source-defining cupola'
      );
      for (const side of ['Right', 'Left']) {
        const mudguard = vehicle.getObjectByName(`R35_Proxy${side}Mudguard`);
        assert.ok(mudguard, `R35 proxy needs its ${side.toLowerCase()} mudguard`);
        assert.equal(mudguard.userData.lodBand, 'proxy');
        assert.equal(mudguard.userData.sourceView, 'side');
      }
    }
  }
});

test('R35 cast nose reaches its registered front datum with a visible outward cap', () => {
  const vehicle = createVehicleMesh('fr_renault_r35');
  const hull = vehicle.getObjectByName('R35_CastHull');
  const profile = vehicle.userData.modelMetadata.dimensionsMeters;
  hull.geometry.computeBoundingBox();
  const frontZ = hull.geometry.boundingBox.max.z;

  assert.ok(
    Math.abs(frontZ - profile.length / 2) < 0.001,
    `R35 integrated nose must reach +${(profile.length / 2).toFixed(3)}m; measured +${frontZ.toFixed(3)}m`
  );

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0.56, frontZ + 0.5),
    new THREE.Vector3(0, 0, -1),
    0,
    1
  );
  const hit = raycaster.intersectObject(hull, false)[0];
  assert.ok(hit, 'R35 front-facing ray must hit the cast nose');
  assert.ok(
    hit.face.normal.z > 0.99,
    `R35 nose cap must face +Z; measured normal z=${hit.face.normal.z}`
  );
});

test('Panzer III rear deck remains outward-facing at core distance', () => {
  const vehicle = createVehicleMesh('ger_panzer3');
  const deck = vehicle.getObjectByName('PzIII_EngineDeck');
  assert.ok(deck);
  assert.equal(deck.userData.surfaceRole, 'rear-hull-deck');
  assert.equal(deck.userData.lodBand, 'core');
  assert.equal(deck.material.side, THREE.FrontSide);
  assert.ok(
    deck.geometry.userData.signedVolumeCubicMeters > 0,
    'Panzer III engine-deck loft must have outward winding'
  );
  forEachTriangle(deck.geometry, ({ normal }, index) => {
    assert.ok(normal.lengthSq() > 1e-12, `Panzer III engine deck triangle ${index} must not collapse`);
  });
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
      assert.ok(parts.rightArm.position.x < 0);
      assert.ok(parts.leftArm.position.x > 0);
      assert.deepEqual(parts.weaponRig.userData.handedness, {
        firingHand: 'right',
        triggerSide: '-X',
        supportHand: 'left'
      });
      assert.equal(parts.weaponRig.userData.handBindings.trigger, 'RightHand');
      assert.equal(parts.weaponRig.userData.handBindings.support, 'LeftHand');
      assert.ok(parts.weaponRig.position.x < -0.15, 'stock must visibly seat at right shoulder');

      if (/MAS-36|Kar98k/.test(soldier.userData.weaponName)) {
        const { boltHandle, ejectionPort } = parts.weaponModel.userData.parts;
        assert.equal(boltHandle.userData.semanticSide, 'right');
        assert.equal(ejectionPort.userData.semanticSide, 'right');
        assert.ok(boltHandle.position.x < 0);
        assert.ok(ejectionPort.position.x < 0);
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
          expectedChargingSide === 'right' ? -1 : 1
        );
      }
    }
  }
});

test('right-side coax mounts align rendered barrels and muzzle markers', () => {
  for (const type of [
    'fr_somua',
    'fr_hotchkiss_h39',
    'fr_amc35',
    'fr_char_b1bis',
    'ger_panzer3',
    'ger_panzer2',
    'ger_panzer35t',
    'ger_panzer38t',
    'ger_sdkfz231',
    'ger_panzer4'
  ]) {
    const vehicle = createVehicleMesh(type);
    const marker = vehicle.userData.weaponMuzzles.coax;
    const mainMuzzle = vehicle.userData.muzzle;
    assert.equal(marker.parent, mainMuzzle.parent, `${type} coax must traverse with main gun`);
    assert.equal(marker.userData.mountSide, 'right');
    assert.match(marker.userData.placementQuality, /historical|blueprint|museum/);
    assert.ok(
      marker.position.x < mainMuzzle.position.x,
      `${type} confirmed right-side coax must be -X of main gun`
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
  const vehicle = createVehicleMesh('fr_char_b1bis');
  const hullGun = vehicle.getObjectByName('CharB1_75mm_HullGun');
  const marker = vehicle.userData.weaponMuzzles.hull_mg;
  assert.equal(hullGun.userData.mountSide, 'right');
  assert.equal(marker.userData.mountSide, 'right');
  assert.ok(hullGun.position.x < 0);
  assert.ok(marker.position.x < hullGun.position.x);
  const barrel = vehicle.children.find(
    object => object.isMesh && object.userData.weaponMountId === 'hull_mg'
  );
  assert.ok(barrel, 'Char B1 hull MG needs visible rendered barrel');
  assert.equal(barrel.position.x, marker.position.x);
});

test('left-side R35 and Panhard coax mounts use +X in the shared +Z-forward frame', () => {
  for (const type of ['fr_renault_r35', 'fr_panhard178']) {
    const vehicle = createVehicleMesh(type);
    const marker = vehicle.userData.weaponMuzzles.coax;
    assert.equal(marker.userData.mountSide, 'left');
    assert.ok(marker.position.x > vehicle.userData.muzzle.position.x);
    const barrels = [];
    marker.parent.traverse(object => {
      if (object.isMesh && object.userData.weaponMountId === 'coax') barrels.push(object);
    });
    assert.ok(barrels.length > 0);
    for (const barrel of barrels) {
      assert.equal(barrel.userData.mountSide, 'left');
      assert.ok(barrel.position.x > 0);
      assert.equal(barrel.position.x, marker.position.x);
    }
  }
});

test('blueprint-resolved mount sides retain source provenance', () => {
  const expectedSides = new Map([
    ['fr_somua', 'right'],
    ['fr_renault_r35', 'left'],
    ['fr_amc35', 'right'],
    ['fr_char_b1bis', 'right'],
    ['ger_panzer2', 'right']
  ]);
  for (const [type, expectedSide] of expectedSides) {
    const vehicle = createVehicleMesh(type);
    const marker = vehicle.userData.weaponMuzzles.coax;
    assert.equal(marker.userData.mountSide, expectedSide);
    assert.match(marker.userData.placementQuality, /blueprint|museum/);
    assert.match(marker.userData.referenceUrl, /^https:\/\//);
  }
});
