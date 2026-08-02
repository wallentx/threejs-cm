import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPanzerIIIMesh,
  PANZER_III_D_BLUEPRINT_CALIBRATION
} from '../src/world/vehicles/PanzerIII.js';

function detailedRigidBounds(vehicle) {
  vehicle.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  vehicle.traverse(object => {
    if (!object.isMesh
      || object.userData.lodBand === 'proxy'
      || object.userData.lodBand === 'ui'
      || ['weaponProjection', 'flexibleAttachment'].includes(object.userData.envelopeRole)) {
      return;
    }
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

function signedVolume(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

test('Panzer III Ausf. D matches the authoritative rigid envelope', () => {
  const vehicle = createPanzerIIIMesh();
  assert.deepEqual(
    vehicle.userData.modelMetadata.dimensionsMeters,
    { length: 5.38, width: 2.91, height: 2.50 }
  );

  const bounds = detailedRigidBounds(vehicle);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 5.38) < 1e-5);
  assert.ok(Math.abs(size.x - 2.91) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - 2.50) < 1e-5);
  assert.ok(bounds.min.y < 0.01, 'closed track should meet the ground plane');
});

test('Panzer III calibration is reproducible and labels the dimension conflict', () => {
  const calibration = PANZER_III_D_BLUEPRINT_CALIBRATION;
  assert.match(calibration.source.imageUrl, /sdkfz141-pzkpfwiii-ausfd-4\.png$/);
  assert.deepEqual(calibration.source.imageSizePixels, [897, 1345]);
  assert.deepEqual(
    calibration.imageRegistration.side.cropPixels,
    { x: 0, y: 0, width: 897, height: 470 }
  );
  assert.equal(calibration.imageRegistration.side.mirrorX, true);
  assert.deepEqual(
    calibration.imageRegistration.front.cropPixels,
    { x: 0, y: 915, width: 450, height: 430 }
  );
  assert.match(
    calibration.datums.authoritativeGameEnvelope.quality,
    /not claimed as an Ausf\. D factory dimension/
  );
  assert.match(calibration.allowedDivergences[0], /dimensional disagreement/);
});

test('Panzer III Ausf. D has the early eight-wheel suspension', () => {
  const vehicle = createPanzerIIIMesh();
  const parts = vehicle.userData.runningGear.userData.trackParts;
  assert.equal(parts.roadWheels.length, 16);
  assert.deepEqual(
    parts.roadWheels.slice(0, 8).map(wheel => Number(wheel.position.z.toFixed(2))),
    [1.08, 0.74, 0.40, 0.06, -0.60, -0.94, -1.28, -1.62]
  );
  assert.ok(parts.sprockets.every(wheel => wheel.position.z > 0));
  assert.ok(parts.idlers.every(wheel => wheel.position.z < 0));
  assert.equal(
    vehicle.children.filter(object => /PanzerIIIReturnRoller_/.test(object.name)).length,
    6
  );
  assert.equal(
    vehicle.children.filter(object => /PanzerIIIBogie_/.test(object.name)).length,
    8
  );
});

test('Panzer III hull sections remain closed and outward-facing', () => {
  const vehicle = createPanzerIIIMesh();
  for (const name of [
    'PanzerIIID_PrimaryHull',
    'PanzerIIID_SteppedFightingHull',
    'PzIII_EngineDeck',
    'PanzerIIID_ThreeManTurret'
  ]) {
    const part = vehicle.getObjectByName(name);
    assert.ok(part, `${name} must exist`);
    assert.ok(signedVolume(part.geometry) > 0, `${name} must face outward`);
  }
  const deck = vehicle.getObjectByName('PzIII_EngineDeck');
  assert.equal(deck.material.side, THREE.FrontSide);
  assert.equal(deck.userData.surfaceRole, 'rear-hull-deck');
});

test('Panzer III weapons and proxy preserve articulation ownership', () => {
  const vehicle = createPanzerIIIMesh();
  assert.equal(vehicle.userData.muzzle.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.userData.weaponIdentity, '3.7 cm KwK 36 L/45');
  assert.equal(vehicle.getObjectByName('coax_barrel').userData.mountSide, 'right');
  assert.equal(vehicle.getObjectByName('PanzerIIID_HullMGBallMount').userData.mountSide, 'right');
  assert.equal(vehicle.userData.proxyTurret.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.proxyBustle.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.proxyMantlet.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.proxyBustle.userData.lodBand, 'proxy');
  assert.equal(vehicle.userData.proxyMantlet.userData.lodBand, 'proxy');
  assert.equal(vehicle.userData.proxyBarrel.parent, vehicle.userData.turret);
  assert.equal(vehicle.getObjectByName('ProxyRoadWheels').count, 16);
  assert.ok(vehicle.getObjectByName('PanzerIIID_ProxyEngineDeck'));
  assert.equal(vehicle.userData.commanderHatches.length, 2);
  assert.deepEqual(
    vehicle.userData.commanderHatches.map(hatch => hatch.userData.hatchSide),
    ['left', 'right']
  );
  for (const hatch of vehicle.userData.commanderHatches) {
    assert.equal(hatch.parent, vehicle.userData.turret);
    assert.equal(hatch.userData.articulatedPart, 'commander-hatch');
    assert.equal(hatch.userData.rotationAxis, 'z');
    assert.ok(Number.isFinite(hatch.userData.openAngleRadians));
    const leaf = hatch.children[0];
    assert.equal(leaf.userData.articulatedPart, 'commander-hatch-leaf');
    assert.equal(leaf.userData.lodBand, 'core');
    assert.equal(
      hatch.children.some(child => child.userData.lodBand === 'proxy'),
      true
    );
  }
  assert.equal(vehicle.userData.proxyCupola.userData.lodBand, 'proxy');
});

test('Panzer III cupola, hard plates, and hull MG remain aligned at every owned tier', () => {
  const vehicle = createPanzerIIIMesh();
  const turret = vehicle.getObjectByName('PanzerIIID_ThreeManTurret');
  const cupola = vehicle.getObjectByName('PanzerIIID_CommanderCupola');
  const cupolaHeight = cupola.geometry.parameters.height;
  assert.ok(Math.abs((cupola.position.y - cupolaHeight * 0.5) - 0.62) < 1e-9);
  assert.equal(turret.material.flatShading, true);
  assert.equal(vehicle.getObjectByName('PanzerIIID_PrimaryHull').material.flatShading, true);

  const ball = vehicle.getObjectByName('PanzerIIID_HullMGBallMount');
  const barrel = vehicle.getObjectByName('hull_mg_barrel');
  const muzzle = vehicle.getObjectByName('hull_mg_muzzle');
  assert.equal(barrel.position.x, ball.position.x);
  assert.equal(barrel.position.y, ball.position.y);
  assert.equal(muzzle.position.x, ball.position.x);
  assert.equal(muzzle.position.y, ball.position.y);
  assert.equal(vehicle.userData.proxyBarrel.parent, vehicle.userData.turret);
});
