import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAMC35Mesh,
  createCharB1BisMesh,
  createHotchkissH39Mesh,
  createLafflyS20TLMesh,
  createOpelBlitzMesh,
  createPanhard178Mesh,
  createRenaultR35Mesh
} from '../src/world/vehicles/index.js';

function proxyMeshes(root) {
  const meshes = [];
  root.traverse(object => {
    if (object.isMesh && object.userData.lodBand === 'proxy') meshes.push(object);
  });
  return meshes;
}

test('enhancer preserves calibrated tracked hull proxies and derives exact track proxies', () => {
  for (const [label, create] of [
    ['R35', createRenaultR35Mesh],
    ['H39', createHotchkissH39Mesh]
  ]) {
    const vehicle = create();
    const proxies = proxyMeshes(vehicle);
    assert.equal(
      proxies.some(mesh => /SourceProxyHull|ProxyCastHull/.test(mesh.name)),
      true,
      `${label} calibrated source hull proxy must survive enhancement`
    );
    assert.equal(
      proxies.some(mesh => mesh.name === 'FidelityProxyHull'),
      false,
      `${label} must not receive a generic hull proxy`
    );
    const detailedRunningGear = vehicle.userData.runningGear;
    const usesSupportedPath = label === 'R35';
    const proxyRunningGear = vehicle.getObjectByName(
      usesSupportedPath ? 'R35SupportedTrackProxy' : 'FidelityTrackedProxy'
    );
    assert.ok(proxyRunningGear, `${label} needs proxy running gear`);
    assert.equal(
      proxies.filter(mesh => (
        usesSupportedPath
          ? /Proxy(?:Right|Left)TrackLinks/.test(mesh.name)
          : /Proxy(?:Right|Left)TrackBelt/.test(mesh.name)
      )).length,
      2,
      `${label} needs two open far track runs`
    );
    assert.deepEqual(proxyRunningGear.position.toArray(), detailedRunningGear.position.toArray());
    if (usesSupportedPath) {
      assert.equal(
        proxyRunningGear.userData.trackPath.model,
        'wheel-supported-quasi-static-v1'
      );
      assert.deepEqual(
        proxyRunningGear.userData.trackPath,
        detailedRunningGear.userData.trackPath
      );
      assert.equal(vehicle.getObjectByName('FidelityTrackedProxy'), undefined);
    }
    assert.ok(vehicle.userData.proxyTurret?.parent === vehicle.userData.turret);
    assert.ok(vehicle.userData.proxyBarrel?.parent === vehicle.userData.barrel);
    assert.equal(vehicle.getObjectByName('FlexibleAntenna'), undefined);
    assert.equal(vehicle.getObjectByName('AuthoredRivets'), undefined);
  }
});

test('enhancer leaves calibrated AMC, Laffly, and Char details authoritative', () => {
  for (const [label, create] of [
    ['AMC 35', createAMC35Mesh],
    ['Laffly S20TL', createLafflyS20TLMesh],
    ['Char B1 bis', createCharB1BisMesh]
  ]) {
    const vehicle = create();
    assert.equal(vehicle.getObjectByName('FlexibleAntenna'), undefined, `${label} generic antenna`);
    assert.equal(vehicle.getObjectByName('AuthoredRivets'), undefined, `${label} generic rivets`);
  }

  const amc = createAMC35Mesh();
  const coax = amc.getObjectByName('coax_barrel');
  const muzzle = amc.getObjectByName('coax_muzzle');
  assert.ok(coax);
  assert.ok(muzzle);
  assert.equal(coax.position.z, 0.96);
  assert.equal(muzzle.position.z, 1.31);
});

test('Panhard far tier retains calibrated hull, exact wheel placement, and one antenna', () => {
  const vehicle = createPanhard178Mesh();
  const proxies = proxyMeshes(vehicle);
  const hull = proxies.find(mesh => mesh.name === 'Panhard178_ProxyHull');
  assert.ok(hull);
  assert.equal(hull.geometry.type, 'BufferGeometry');
  assert.equal(hull.userData.proxySource, 'calibrated-primary-hull-clone');
  assert.equal(
    proxies.filter(mesh => /^AuthoredProxyWheel_/.test(mesh.name)).length,
    4
  );
  assert.match(vehicle.userData.proxyTurret.name, /^AuthoredProxy_/);
  assert.equal(vehicle.userData.proxyTurret.parent, vehicle.userData.turret);
  assert.equal(vehicle.userData.proxyBarrel.name, 'AuthoredProxyBarrel');
  assert.equal(vehicle.userData.proxyBarrel.parent, vehicle.userData.barrel);

  const antennas = [];
  vehicle.traverse(object => {
    if (object.isMesh && object.userData.envelopeRole === 'flexibleAttachment') {
      antennas.push(object);
    }
  });
  assert.deepEqual(antennas.map(object => object.name), ['Panhard178_RadioAntenna']);
});

test('Opel Blitz keeps one authored truck proxy without generic duplication', () => {
  const vehicle = createOpelBlitzMesh();
  const proxies = proxyMeshes(vehicle);
  assert.equal(proxies.length, 17);
  assert.equal(
    proxies.every(mesh => mesh.name.startsWith('OpelBlitz_Proxy')),
    true
  );
  assert.ok(vehicle.getObjectByName('OpelBlitz_ProxyChassis'));
  assert.ok(vehicle.getObjectByName('OpelBlitz_ProxyCanvas'));
  assert.equal(vehicle.getObjectByName('FidelityProxyHull'), undefined);
});
