import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from './helpers/France1940TestUnit.js';

const ARMED_VEHICLES = [
  'SOMUA_S35',
  'RENAULT_R35',
  'HOTCHKISS_H39',
  'AMC_35',
  'PANHARD_178',
  'CHAR_B1_BIS',
  'PANZER_III_D',
  'PANZER_II_C',
  'PANZER_35T',
  'PANZER_38T',
  'SDKFZ_231',
  'PANZER_IV_D'
];

test('every armed vehicle far proxy inherits authoritative turret yaw and barrel recoil', () => {
  for (const vehicleId of ARMED_VEHICLES) {
    const unit = new Unit({
      id: `proxy_${vehicleId.toLowerCase()}`,
      faction: vehicleId.startsWith('PANZER') || vehicleId === 'SDKFZ_231'
        ? 'german'
        : 'french',
      type: 'vehicle',
      vehicleId,
      position: new THREE.Vector3()
    });
    const {
      turret,
      barrel,
      proxyTurret,
      proxyBarrel
    } = unit.mesh.userData;

    assert.ok(turret, `${vehicleId} requires an authoritative turret pivot`);
    assert.ok(barrel, `${vehicleId} requires an authoritative barrel`);
    assert.equal(proxyTurret?.parent, turret, `${vehicleId} proxy turret must inherit yaw`);
    assert.equal(proxyBarrel?.parent, barrel, `${vehicleId} proxy barrel must inherit recoil`);

    unit.mesh.updateWorldMatrix(true, true);
    const initialProxyYaw = proxyTurret.getWorldQuaternion(new THREE.Quaternion());
    const initialProxyBarrelPosition = proxyBarrel.getWorldPosition(new THREE.Vector3());
    turret.rotation.y = 0.41;
    barrel.position.z = (barrel.userData.restZ ?? barrel.position.z) - 0.12;
    unit.mesh.updateWorldMatrix(true, true);

    const movedProxyYaw = proxyTurret.getWorldQuaternion(new THREE.Quaternion());
    const movedProxyBarrelPosition = proxyBarrel.getWorldPosition(new THREE.Vector3());
    assert.ok(
      initialProxyYaw.angleTo(movedProxyYaw) > 0.4,
      `${vehicleId} proxy turret must rotate with detailed turret`
    );
    assert.ok(
      initialProxyBarrelPosition.distanceTo(movedProxyBarrelPosition) > 0.1,
      `${vehicleId} proxy barrel must move with recoil/yaw`
    );

    unit.updateLOD(new THREE.Vector3(0, 0, 1000), 'high');
    assert.equal(proxyTurret.visible, true);
    assert.equal(proxyBarrel.visible, true);
    assert.equal(barrel.visible, false);
    unit.updateLOD(new THREE.Vector3(0, 0, 2), 'high');
    assert.equal(proxyTurret.visible, false);
    assert.equal(proxyBarrel.visible, false);
    assert.equal(barrel.visible, true);
  }
});
