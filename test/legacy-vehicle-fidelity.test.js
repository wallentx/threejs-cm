import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRANCE_1940_INFANTRY_MESH_FACTORIES,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import { WORLD_SCALE, getAuthoredMeshBounds } from '../src/world/WorldScale.js';
import { VEHICLE_TEXTURE_PACK_ID } from '../src/world/vehicles/VehicleMaterialLibrary.js';
import { getVehicleVisualProfile } from '../src/world/vehicles/VehicleVisualProfiles.js';

const createVehicleMesh = modelId => UnitFactory.createTankMesh(
  modelId,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
);

function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

test('SOMUA standalone model exposes its registered blueprint datums', () => {
  const profile = getVehicleVisualProfile('fr_somua');
  const vehicle = createVehicleMesh('fr_somua');
  const hull = vehicle.getObjectByName('S35_CastPrimaryHull');
  const turret = vehicle.userData.turret;
  const barrel = vehicle.userData.barrel;
  const muzzle = vehicle.userData.muzzle;
  const calibration = vehicle.userData.modelMetadata.blueprintCalibration;

  assert.ok(hull);
  assert.equal(hull.userData.authoredHull, true);
  assert.deepEqual(calibration.rigidEnvelopeMeters, profile.dimensionsMeters);
  assert.equal(calibration.datums.exact.roadWheelsPerSide, 9);
  assert.deepEqual(
    calibration.datums.registeredInferred.roadWheelCentersZ,
    [1.54, 1.16, 0.78, 0.40, 0.02, -0.36, -0.74, -1.12, -1.50]
  );
  assert.deepEqual(
    turret.position.toArray(),
    calibration.datums.registeredInferred.turretRing
  );
  assert.equal(barrel.userData.weaponIdentity, '47 mm SA 35');
  assert.equal(muzzle.position.z, 1.98);
  assert.ok(
    turret.position.z + muzzle.position.z - profile.dimensionsMeters.length * 0.5 < 0.25,
    'SA35 should only project slightly beyond the rigid bow in side elevation'
  );
});

test('authored infantry uses metre standing-height scale without moving formation slots', () => {
  const squad = UnitFactory.createInfantrySquadMesh(
    'french_1940_chasseur',
    6,
    FRANCE_1940_INFANTRY_MESH_FACTORIES
  );
  const expectedSlots = [
    [-1.35, 0, -0.85], [0, 0, -0.85], [1.35, 0, -0.85],
    [-1.35, 0, 0.85], [0, 0, 0.85], [1.35, 0, 0.85]
  ];
  assert.equal(squad.userData.soldiers.length, expectedSlots.length);

  squad.userData.soldiers.forEach((soldier, index) => {
    assert.deepEqual(soldier.position.toArray(), expectedSlots[index]);
    assert.deepEqual(soldier.userData.slotOffset, expectedSlots[index]);
    const bounds = getAuthoredMeshBounds(soldier);
    const height = bounds.max.y - bounds.min.y;
    assert.ok(Math.abs(height - WORLD_SCALE.standingInfantryHeight) < 1e-6);
    assert.equal(soldier.userData.physicalScale.units, 'metres');
    assert.ok(soldier.userData.physicalScale.appliedUniformScale > 0);
  });
});

for (const [type, requiredSlots] of [
  ['fr_somua', ['paint', 'track', 'metal']],
  ['ger_panzer3', ['paint', 'track', 'metal']]
]) {
  test(`${type} standalone model has explicit mapped PBR detail and cheap textured proxy`, () => {
    const vehicle = createVehicleMesh(type);
    const metadata = vehicle.userData.modelMetadata;
    assert.equal(metadata.materialPack.id, VEHICLE_TEXTURE_PACK_ID);
    assert.equal(metadata.materialPack.inferenceFallbackCount, 0);
    assert.equal(metadata.materialPack.uvProjection, 'dominant-axis-triangle-local-metres-v2');
    requiredSlots.forEach(slot => assert.ok(metadata.materialSlots.includes(slot)));
    assert.ok(vehicle.userData.turret);
    assert.ok(vehicle.userData.barrel);
    assert.ok(vehicle.userData.muzzle);
    assert.ok(vehicle.userData.selectionDisc);
    assert.ok(vehicle.userData.runningGear, `${type} must use the shared running gear`);
    assert.equal(vehicle.userData.runningGear.userData.runningGearType, 'closed-track-belt');
    assert.equal(vehicle.getObjectByName(type === 'fr_somua' ? 'S35_LeftTrack' : 'PzIII_LeftTrack'), undefined);
    assert.equal(vehicle.getObjectByName('ProxyLeftTrackBelt')?.geometry.name, 'ProxyTrackBeltGeometry');
    assert.equal(vehicle.getObjectByName('ProxyRightTrackBelt')?.geometry.name, 'ProxyTrackBeltGeometry');
    assert.equal(vehicle.getObjectByName('ProxyRoadWheels')?.isInstancedMesh, true);

    let detailed = 0;
    let proxy = 0;
    vehicle.traverse(object => {
      if (!object.isMesh || object.userData.lodBand === 'ui') return;
      for (const material of materialsOf(object)) {
        assert.equal(material.userData.vehicleTexturePack, VEHICLE_TEXTURE_PACK_ID);
        assert.equal(material.userData.materialSlotOwnership, 'authored');
        assert.ok(material.map?.isDataTexture);
        if (object.userData.lodBand === 'proxy') {
          proxy++;
          assert.equal(material.userData.materialQuality, 'proxy');
          assert.equal(material.roughnessMap, null);
          assert.equal(material.bumpMap, null);
        } else {
          detailed++;
          assert.equal(material.userData.materialQuality, 'detailed');
          assert.ok(material.roughnessMap?.isDataTexture);
          assert.ok(material.bumpMap?.isDataTexture);
          assert.equal(object.geometry.userData.vehicleUvProjection.method, 'dominant-axis-triangle-local-metres-v2');
          assert.equal(
            object.geometry.userData.vehicleUvProjection.metersPerTile,
            material.userData.metersPerRepeat
          );
        }
      }
    });
    assert.ok(detailed > 0);
    assert.ok(proxy > 0);
  });
}
