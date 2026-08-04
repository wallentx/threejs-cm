import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SOMUA_S35_BLUEPRINT_CALIBRATION,
  createSomuaS35Mesh
} from '../src/world/vehicles/SomuaS35.js';
import {
  SOMUA_S35_HULL_STATIONS,
  SOMUA_S35_TURRET_STATIONS,
  SOMUA_S35_WEAPON_INSTALLATION,
  createSomuaS35ArmorCollision
} from '../src/content/france1940/vehicleData/SomuaS35Shape.js';

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

function hullRoofYAt(z) {
  for (let index = 1; index < SOMUA_S35_HULL_STATIONS.length; index++) {
    const rear = SOMUA_S35_HULL_STATIONS[index - 1];
    const front = SOMUA_S35_HULL_STATIONS[index];
    if (z < rear.z || z > front.z) continue;
    const alpha = (z - rear.z) / (front.z - rear.z);
    return THREE.MathUtils.lerp(rear.roofY, front.roofY, alpha);
  }
  throw new Error(`No S35 hull roof segment contains z=${z}`);
}

test('SOMUA S35 preserves its exact rigid envelope and reproducible side registration', () => {
  const vehicle = createSomuaS35Mesh();
  const metadata = vehicle.userData.modelMetadata;
  assert.deepEqual(metadata.dimensionsMeters, { length: 5.38, width: 2.12, height: 2.62 });
  assert.equal(metadata.blueprintCalibration, SOMUA_S35_BLUEPRINT_CALIBRATION);
  assert.equal(metadata.blueprintCalibration.sources[0].artifact, 's35-compare.jpg');
  assert.deepEqual(
    metadata.blueprintCalibration.imageRegistration.side.cropPixels,
    { x: 220, y: 55, width: 1065, height: 600 }
  );
  assert.match(
    metadata.blueprintCalibration.datums.registeredInferred.quality,
    /not claimed as factory measurements/
  );

  const bounds = detailedRigidBounds(vehicle);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 5.38) < 1e-5);
  assert.ok(Math.abs(size.x - 2.12) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - 2.62) < 1e-5);
  assert.ok(bounds.min.y >= 0 && bounds.min.y < 0.01, 'closed tracks must meet the ground');
});

test('SOMUA running gear keeps nine small wheels, rear drive, and front idler', () => {
  const vehicle = createSomuaS35Mesh();
  const parts = vehicle.userData.runningGear.userData.trackParts;
  assert.equal(parts.roadWheels.length, 18);
  assert.deepEqual(
    parts.roadWheels.slice(0, 9).map(wheel => Number(wheel.position.z.toFixed(2))),
    [1.54, 1.16, 0.78, 0.40, 0.02, -0.36, -0.74, -1.12, -1.50]
  );
  assert.ok(parts.sprockets.every(wheel => wheel.position.z < 0), 'drive sprockets belong at rear');
  assert.ok(parts.idlers.every(wheel => wheel.position.z > 0), 'idlers belong at front');
  assert.equal(
    vehicle.children.filter(object => /S35SuspensionCover_/.test(object.name)).length,
    8
  );
  assert.equal(
    vehicle.children.filter(object => /S35ReturnRoller_/.test(object.name)).length,
    4
  );
});

test('SOMUA authored cast hull and APX turret remain closed and outward-wound', () => {
  const vehicle = createSomuaS35Mesh();
  for (const name of ['S35_CastPrimaryHull', 'S35_APX1CE_TurretBody']) {
    const part = vehicle.getObjectByName(name);
    assert.ok(part, `${name} must exist`);
    assert.ok(signedVolume(part.geometry) > 0, `${name} must face outward`);
    assert.ok(part.geometry.userData.signedVolumeCubicMeters > 0);
  }
});

test('SOMUA rear engine deck follows and seats on the cast hull roof', () => {
  const vehicle = createSomuaS35Mesh();
  const deck = vehicle.getObjectByName('S35_SlopingEngineDeck');
  assert.ok(deck, 'sloping rear engine deck must exist');
  vehicle.updateMatrixWorld(true);

  for (const localZ of [-1.05, 1.05]) {
    const contact = new THREE.Vector3(0, -0.0275, localZ).applyMatrix4(deck.matrixWorld);
    const gap = contact.y - hullRoofYAt(contact.z);
    assert.ok(Math.abs(gap) <= 0.015, `engine deck contact gap ${gap} m at z=${contact.z}`);
  }
  assert.equal(deck.userData.contactSurface, 'S35_CastPrimaryHull');
});

test('SOMUA armament and proxy retain articulated silhouette ownership', () => {
  const vehicle = createSomuaS35Mesh();
  const turret = vehicle.userData.turret;
  const mantlet = vehicle.getObjectByName('S35_SA35_Mantlet');
  const coax = vehicle.getObjectByName('S35_MAC31_Coax');
  vehicle.updateMatrixWorld(true);
  const mantletBounds = new THREE.Box3().setFromObject(mantlet);
  const coaxBounds = new THREE.Box3().setFromObject(coax);
  const turretTopY = turret.localToWorld(new THREE.Vector3(
    0,
    SOMUA_S35_TURRET_STATIONS.at(-1).y,
    0
  )).y;

  assert.ok(
    mantletBounds.max.y <= turretTopY + 0.001,
    `mantlet top ${mantletBounds.max.y} must remain within turret top ${turretTopY}`
  );
  assert.ok(
    coaxBounds.min.z <= mantletBounds.max.z,
    `coax rear ${coaxBounds.min.z} must overlap mantlet front ${mantletBounds.max.z}`
  );
  assert.ok(
    coaxBounds.min.z >= mantletBounds.max.z - 0.03,
    'coax must overlap the mantlet face without disappearing into it'
  );
  assert.ok(Math.abs(coax.position.y - mantlet.position.y) <= 0.02);
  assert.equal(vehicle.userData.muzzle.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.barrel.userData.envelopeRole, 'weaponProjection');
  assert.equal(vehicle.getObjectByName('S35_MAC31_Coax').userData.mountSide, 'right');
  assert.equal(vehicle.userData.weaponMuzzles.coax.parent, vehicle.userData.turret);
  assert.ok(vehicle.getObjectByName('ProxyLeftTrackBelt'));
  assert.ok(vehicle.getObjectByName('ProxyRightTrackBelt'));
  assert.equal(vehicle.getObjectByName('ProxyRoadWheels').count, 18);
  assert.ok(vehicle.getObjectByName('S35_ProxyCastHull'));
  assert.equal(vehicle.userData.proxyTurret.parent, vehicle.userData.turret);
  assert.equal(mantlet.userData.lodBand, 'core');
  assert.equal(vehicle.userData.proxyMantlet.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.proxyMantlet.userData.lodBand, 'proxy');
  assert.equal(vehicle.userData.proxyBarrel.parent, vehicle.userData.turret);
  assert.ok(vehicle.getObjectByName('S35_ClosedCupolaRoof'));
  assert.equal(vehicle.getObjectByName('S35_CupolaHatch'), undefined);
  assert.equal(vehicle.userData.commanderStation.canUnbutton, false);
  assert.deepEqual(vehicle.userData.commanderHatches, []);
  assert.equal(vehicle.userData.proxyCupola.userData.lodBand, 'proxy');
  assert.equal(vehicle.userData.proxyCupolaRoof.userData.lodBand, 'proxy');

  const armor = createSomuaS35ArmorCollision({
    hull_front: 47,
    hull_side: 40,
    hull_rear: 35,
    turret_front: 56,
    turret_side: 46,
    turret_rear: 46
  }, 'test://somua-s35');
  const mantletVolume = armor.volumes.find(volume => volume.id === 'gun-mantlet');
  assert.deepEqual(mantletVolume.offset, [
    SOMUA_S35_WEAPON_INSTALLATION.main.axisLocalX,
    SOMUA_S35_WEAPON_INSTALLATION.main.axisLocalY,
    SOMUA_S35_WEAPON_INSTALLATION.mantlet.centerLocalZ
  ]);
});
