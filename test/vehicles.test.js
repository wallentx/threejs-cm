import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import { Unit } from './helpers/France1940TestUnit.js';
import { UnitFactory } from '../src/world/UnitFactory.js';
import { getVehicle, VEHICLES } from '../src/game/VehicleCatalog.js';
import { getWeapon } from '../src/game/WeaponCatalog.js';
import {
  createRenaultR35Mesh,
  createRenaultD2Mesh,
  createSomuaS35Mesh,
  createHotchkissH39Mesh,
  createAMC35Mesh,
  createPanhard178Mesh,
  createLafflyS20TLMesh,
  createCharB1BisMesh,
  createPanzerIIMesh,
  createPanzerIIIMesh,
  createPanzer35tMesh,
  createPanzer38tMesh,
  createSdKfz231Mesh,
  createOpelBlitzMesh,
  createPanzerIVMesh
} from '../src/world/vehicles/index.js';
import {
  createSectionedHullGeometry,
  enhanceVehicleModel
} from '../src/world/vehicles/VehicleModelEnhancer.js';

const createVehicleMesh = modelId => UnitFactory.createTankMesh(
  modelId,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
);
import {
  applyVehicleMaterialPack,
  VEHICLE_TEXTURE_PACK_ID,
  getVehicleTextureCacheStats,
  setVehicleMaterialSlot
} from '../src/world/vehicles/VehicleMaterialLibrary.js';
import { VEHICLE_VISUAL_PROFILES } from '../src/world/vehicles/VehicleVisualProfiles.js';

const vehicleCreators = [
  { name: 'SOMUA S35', fn: createSomuaS35Mesh, type: 'fr_somua', vehicleId: 'SOMUA_S35', armed: true },
  { name: 'Renault R35', fn: createRenaultR35Mesh, type: 'fr_renault_r35', vehicleId: 'RENAULT_R35', armed: true },
  { name: 'Renault D2', fn: createRenaultD2Mesh, type: 'fr_renault_d2', vehicleId: 'RENAULT_D2', armed: true },
  { name: 'Hotchkiss H39', fn: createHotchkissH39Mesh, type: 'fr_hotchkiss_h39', vehicleId: 'HOTCHKISS_H39', armed: true },
  { name: 'AMC 35', fn: createAMC35Mesh, type: 'fr_amc35', vehicleId: 'AMC_35', armed: true },
  { name: 'Panhard 178', fn: createPanhard178Mesh, type: 'fr_panhard178', vehicleId: 'PANHARD_178', armed: true },
  { name: 'Laffly S20TL', fn: createLafflyS20TLMesh, type: 'fr_laffly_s20tl', vehicleId: 'LAFFLY_S20TL', armed: false },
  { name: 'Char B1 bis', fn: createCharB1BisMesh, type: 'fr_char_b1bis', vehicleId: 'CHAR_B1_BIS', armed: true },
  { name: 'Panzer II', fn: createPanzerIIMesh, type: 'ger_panzer2', vehicleId: 'PANZER_II_C', armed: true },
  { name: 'Panzer III', fn: createPanzerIIIMesh, type: 'ger_panzer3', vehicleId: 'PANZER_III_D', armed: true },
  { name: 'Panzer 35(t)', fn: createPanzer35tMesh, type: 'ger_panzer35t', vehicleId: 'PANZER_35T', armed: true },
  { name: 'Panzer 38(t)', fn: createPanzer38tMesh, type: 'ger_panzer38t', vehicleId: 'PANZER_38T', armed: true },
  { name: 'Sd.Kfz. 231', fn: createSdKfz231Mesh, type: 'ger_sdkfz231', vehicleId: 'SDKFZ_231', armed: true },
  { name: 'Opel Blitz', fn: createOpelBlitzMesh, type: 'ger_opel_blitz', vehicleId: 'OPEL_BLITZ', armed: false },
  { name: 'Panzer IV', fn: createPanzerIVMesh, type: 'ger_panzer4', vehicleId: 'PANZER_IV_D', armed: true }
];

test('every catalog vehicle has one blueprint-backed visual contract with matching dimensions', () => {
  assert.equal(Object.keys(VEHICLE_VISUAL_PROFILES).length, Object.keys(VEHICLES).length);
  for (const vehicle of Object.values(VEHICLES)) {
    const profile = VEHICLE_VISUAL_PROFILES[vehicle.modelId];
    assert.ok(profile, `${vehicle.id} needs a visual profile`);
    assert.deepEqual(profile.dimensionsMeters, vehicle.dimensionsMeters, `${vehicle.id} dimensions`);
    assert.ok(profile.references.length > 0, `${vehicle.id} needs reference provenance`);
    assert.ok(profile.silhouetteFeatures.length >= 4, `${vehicle.id} needs defining silhouette landmarks`);
    assert.match(profile.dataQuality, /historical/);
    assert.match(profile.dimensionPolicy, /excludes weapon projection and flexible aerials/);
  }
});

test('every catalog auxiliary mount has a correctly parented rendered muzzle marker', () => {
  for (const spec of Object.values(VEHICLES)) {
    const unit = new Unit({
      id: `auxiliary_marker_${spec.id}`,
      faction: spec.id.startsWith('PANZER') || spec.id === 'SDKFZ_231' || spec.id === 'OPEL_BLITZ'
        ? 'german'
        : 'french',
      type: 'vehicle',
      vehicleId: spec.id
    });
    const markers = unit.mesh.userData.weaponMuzzles;
    assert.deepEqual(Object.keys(markers).sort(), spec.weaponMounts.map(mount => mount.id).sort());
    for (const mount of spec.weaponMounts) {
      const marker = markers[mount.id];
      assert.ok(marker?.isObject3D, `${spec.id} ${mount.id} needs an Object3D marker`);
      const expectedParent = mount.traverse === 'turret' ? unit.mesh.userData.turret : unit.mesh;
      assert.equal(marker.parent, expectedParent, `${spec.id} ${mount.id} must follow its ${mount.traverse}`);
      unit.mesh.updateMatrixWorld(true);
      const world = marker.getWorldPosition(new THREE.Vector3());
      assert.ok(Number.isFinite(world.x) && Number.isFinite(world.y) && Number.isFinite(world.z));
      assert.equal(marker.userData.forwardAxis, '+Z');
    }
  }
});

test('Char B1 bis fixed hull machine gun stays externally invisible', () => {
  const unit = new Unit({
    id: 'char_hidden_hull_mg',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS'
  });
  const marker = unit.mesh.userData.weaponMuzzles.hull_mg;
  const visibleMountMeshes = [];
  unit.mesh.traverse(object => {
    if (object.isMesh && object.userData.weaponMountId === 'hull_mg') {
      visibleMountMeshes.push(object);
    }
  });
  assert.equal(marker.userData.presentationHidden, true);
  assert.equal(marker.userData.mountSide, 'right');
  assert.deepEqual(visibleMountMeshes, []);
});

test('all 15 vehicle 3D model modules build cleanly and satisfy model contract and 4 LOD bands', () => {
  vehicleCreators.forEach(({ name, fn, type }) => {
    const mesh = fn();
    assert.ok(mesh instanceof THREE.Group, `${name} must return a THREE.Group`);
    assert.equal(mesh.name, type);
    assert.ok(mesh.userData.modelMetadata, `${name} must define modelMetadata`);
    assert.ok(mesh.userData.modelMetadata.dimensionsMeters.length > 0);
    assert.ok(mesh.userData.modelMetadata.dimensionsMeters.width > 0);
    assert.ok(mesh.userData.modelMetadata.dimensionsMeters.height > 0);
    assert.equal(mesh.userData.modelMetadata.fidelityPass, 'authored-v2');
    assert.equal(mesh.userData.modelMetadata.lodModelCount, 4);
    assert.deepEqual(
      mesh.userData.modelMetadata.lodLevels,
      ['high', 'medium', 'core', 'proxy']
    );

    // Muzzle reference check
    const muzzle = mesh.userData.muzzle || mesh.getObjectByName(`${name}_Muzzle`) || mesh.getObjectByName('Muzzle');
    assert.ok(mesh.userData.muzzle || muzzle, `${name} must expose or include a muzzle marker`);

    // Verify all 4 LOD bands are present (high, medium, core, proxy)
    const lodBandsFound = new Set();
    mesh.traverse(obj => {
      if (obj.userData?.lodBand) {
        lodBandsFound.add(obj.userData.lodBand);
      }
    });

    assert.ok(lodBandsFound.has('core'), `${name} must contain core LOD geometry`);
    assert.ok(lodBandsFound.has('medium'), `${name} must contain medium LOD geometry`);
    assert.ok(lodBandsFound.has('high'), `${name} must contain high LOD geometry`);
    assert.ok(lodBandsFound.has('proxy'), `${name} must contain proxy LOD geometry`);

    let proxyMeshes = 0;
    mesh.traverse(obj => {
      if (obj.isMesh && obj.userData.lodBand === 'proxy') proxyMeshes++;
    });
    assert.ok(proxyMeshes >= 4, `${name} proxy must preserve vehicle silhouette`);
  });
});

test('blueprint-calibrated vehicles preserve measured envelopes and running-gear identity', () => {
  const corrected = [
    {
      name: 'Laffly S20TL',
      mesh: createLafflyS20TLMesh(),
      dimensions: { length: 5.35, width: 2.00, height: 2.00 },
      wheelPrefix: 'S20TL_Wheel_'
    },
    {
      name: 'Sd.Kfz. 231 (6-Rad)',
      mesh: createSdKfz231Mesh(),
      dimensions: { length: 5.57, width: 1.82, height: 2.25 },
      wheelPrefix: 'SdKfz231_6Rad_Wheel_'
    },
    {
      name: 'Panzer IV Ausf. D',
      mesh: createPanzerIVMesh(),
      dimensions: { length: 5.92, width: 2.84, height: 2.68 },
      wheelPrefix: null,
      checkGround: false
    },
    {
      name: 'Panzer 38(t)',
      mesh: createPanzer38tMesh(),
      dimensions: { length: 4.61, width: 2.14, height: 2.25 },
      wheelPrefix: null,
      checkGround: false
    },
    {
      name: 'Panzer 35(t)',
      mesh: createPanzer35tMesh(),
      dimensions: { length: 4.90, width: 2.06, height: 2.37 },
      wheelPrefix: null,
      checkGround: false
    },
    {
      name: 'AMC 35',
      mesh: createAMC35Mesh(),
      dimensions: { length: 4.55, width: 2.24, height: 2.30 },
      wheelPrefix: null,
      checkGround: false
    },
    {
      name: 'Panzer II Ausf. C',
      mesh: createPanzerIIMesh(),
      dimensions: { length: 4.81, width: 2.22, height: 1.99 },
      wheelPrefix: null,
      checkGround: false
    },
    {
      name: 'Char B1 bis',
      mesh: createCharB1BisMesh(),
      dimensions: { length: 6.37, width: 2.46, height: 2.79 },
      wheelPrefix: null,
      checkGround: false
    },
    {
      name: 'Renault R35',
      mesh: createRenaultR35Mesh(),
      dimensions: { length: 4.02, width: 1.87, height: 2.13 },
      wheelPrefix: null
    },
    {
      name: 'Hotchkiss H39',
      mesh: createHotchkissH39Mesh(),
      dimensions: { length: 4.22, width: 1.85, height: 2.15 },
      wheelPrefix: null
    },
    {
      name: 'Panhard 178',
      mesh: createPanhard178Mesh(),
      dimensions: { length: 4.79, width: 2.01, height: 2.31 },
      wheelPrefix: null
    },
    {
      name: 'SOMUA S35',
      mesh: createVehicleMesh('fr_somua'),
      dimensions: { length: 5.38, width: 2.12, height: 2.62 },
      wheelPrefix: null
    },
    {
      name: 'Opel Blitz 3.6-36S',
      mesh: createOpelBlitzMesh(),
      dimensions: { length: 6.02, width: 2.27, height: 2.59 },
      wheelPrefix: null
    },
    {
      name: 'Panzer III Ausf. D',
      mesh: createVehicleMesh('ger_panzer3'),
      dimensions: { length: 5.38, width: 2.91, height: 2.50 },
      wheelPrefix: null
    }
  ];

  for (const spec of corrected) {
    spec.mesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    let wheelCount = 0;
    spec.mesh.traverse(object => {
      if (spec.wheelPrefix && object.name.startsWith(spec.wheelPrefix)) wheelCount++;
      if (!object.isMesh
        || object.userData.lodBand === 'proxy'
        || object.userData.lodBand === 'ui'
        || ['flexibleAttachment', 'weaponProjection'].includes(object.userData.envelopeRole)) return;
      bounds.union(new THREE.Box3().setFromObject(object));
    });
    const measured = bounds.getSize(new THREE.Vector3());
    if (spec.wheelPrefix) {
      assert.equal(wheelCount, 6, `${spec.name} must expose three modeled axles`);
    }
    assert.ok(Math.abs(measured.z - spec.dimensions.length) < 0.01, `${spec.name} length`);
    assert.ok(Math.abs(measured.x - spec.dimensions.width) < 0.01, `${spec.name} width`);
    if (spec.checkGround !== false) {
      assert.ok(bounds.min.y < 0.02, `${spec.name} running gear must reach ground level`);
    }
    assert.ok(Math.abs(bounds.max.y - spec.dimensions.height) < 0.01, `${spec.name} height`);
    assert.deepEqual(spec.mesh.userData.modelMetadata.dimensionsMeters, spec.dimensions);
  }
});

test('Renault R35 matches the registered tail-less production configuration', () => {
  const mesh = createRenaultR35Mesh();
  const namedParts = [];
  mesh.traverse(object => {
    if (object.name) namedParts.push(object.name);
  });

  assert.equal(
    namedParts.some(name => name.includes('TrenchTail')),
    false,
    'Registered tail-less R35 must not contain optional trench-tail geometry'
  );
  assert.ok(
    mesh.userData.modelMetadata.features.includes('tail-less rear hull'),
    'R35 metadata must identify the modeled tail-less configuration'
  );
});

test('authored vehicle hulls are closed, outward-wound, and non-degenerate', () => {
  for (const style of ['cast', 'riveted', 'boxy', 'armoredCar']) {
    const geometry = createSectionedHullGeometry(5, 2.2, 1.2, style);
    const positions = geometry.attributes.position;
    assert.equal(geometry.attributes.uv.count, positions.count, `${style} hull needs paint UVs`);
    const index = geometry.index;
    let signedVolume = 0;
    let degenerateTriangles = 0;
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(offset));
      const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(offset + 1));
      const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(offset + 2));
      signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
      if (new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      ).lengthSq() < 1e-12) degenerateTriangles++;
    }
    assert.ok(signedVolume > 0, `${style} hull winding must face outward`);
    assert.equal(degenerateTriangles, 0, `${style} hull must not contain collapsed faces`);
  }
});

test('all 15 vehicles use deterministic mapped PBR materials at detailed LODs', () => {
  const generatedTextures = new Set();
  for (const { name, fn } of vehicleCreators) {
    const vehicle = fn();
    const metadata = vehicle.userData.modelMetadata;
    assert.equal(metadata.materialPack.id, VEHICLE_TEXTURE_PACK_ID);
    assert.match(metadata.materialPack.provenance, /not archival/);
    assert.equal(metadata.materialPack.inferenceFallbackCount, 0);
    assert.equal(metadata.materialPack.uvProjection, 'dominant-axis-triangle-local-metres-v2');
    assert.ok(metadata.materialSlots.includes('paint'), `${name} needs a paint slot`);

    let detailedMeshes = 0;
    let proxyMeshes = 0;
    vehicle.traverse(object => {
      if (!object.isMesh || object.userData.lodBand === 'ui') return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (['core', 'medium', 'high'].includes(object.userData.lodBand)) {
        detailedMeshes++;
        for (const material of materials) {
          assert.ok(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial);
          assert.equal(material.userData.vehicleTexturePack, VEHICLE_TEXTURE_PACK_ID);
          assert.equal(material.userData.materialQuality, 'detailed');
          assert.equal(material.userData.materialSlotOwnership, 'authored');
          assert.equal(object.userData.materialSlotOwnership, 'authored');
          assert.ok(material.map?.isDataTexture, `${name} ${object.userData.lodBand} needs albedo`);
          assert.ok(material.roughnessMap?.isDataTexture, `${name} ${object.userData.lodBand} needs roughness`);
          assert.ok(material.bumpMap?.isDataTexture, `${name} ${object.userData.lodBand} needs bump`);
          for (const texture of [material.map, material.roughnessMap, material.bumpMap]) {
            generatedTextures.add(texture);
            assert.equal(texture.wrapS, THREE.RepeatWrapping);
            assert.equal(texture.wrapT, THREE.RepeatWrapping);
            assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
            assert.equal(texture.magFilter, THREE.LinearFilter);
            assert.equal(texture.generateMipmaps, true);
            assert.equal(texture.repeat.x, 1, 'shared texture transform must remain neutral');
            assert.equal(texture.repeat.y, 1, 'shared texture transform must remain neutral');
            assert.ok(texture.userData.metersPerRepeat > 0);
          }
          const projection = object.geometry.userData.vehicleUvProjection;
          assert.equal(projection.method, 'dominant-axis-triangle-local-metres-v2');
          assert.equal(projection.metersPerTile, material.userData.metersPerRepeat);
          assert.equal(object.geometry.attributes.uv.count, object.geometry.attributes.position.count);
          assert.equal(object.geometry.index, null, 'face projection needs triangle-local vertices');

          const positions = object.geometry.attributes.position;
          const uv = object.geometry.attributes.uv;
          for (let triangle = 0; triangle < positions.count; triangle += 3) {
            for (const [from, to] of [[0, 1], [1, 2], [2, 0]]) {
              const a = triangle + from;
              const b = triangle + to;
              const dx = positions.getX(a) - positions.getX(b);
              const dy = positions.getY(a) - positions.getY(b);
              const dz = positions.getZ(a) - positions.getZ(b);
              const du = uv.getX(a) - uv.getX(b);
              const dv = uv.getY(a) - uv.getY(b);
              const physicalEdge = Math.hypot(dx, dy, dz);
              const projectedEdge = Math.hypot(du, dv) * projection.metersPerTile;
              assert.ok(
                projectedEdge <= physicalEdge + 1e-5,
                `${name} triangle UV edge must use one face basis`
              );
            }
          }
        }
      } else if (object.userData.lodBand === 'proxy') {
        proxyMeshes++;
        for (const material of materials) {
          assert.equal(material.userData.vehicleTexturePack, VEHICLE_TEXTURE_PACK_ID);
          assert.equal(material.userData.materialQuality, 'proxy');
          assert.ok(material.map?.isDataTexture, `${name} proxy needs readable albedo`);
          assert.equal(material.roughnessMap, null, `${name} proxy must skip roughness sampling`);
          assert.equal(material.bumpMap, null, `${name} proxy must skip bump sampling`);
        }
      }
    });

    assert.ok(detailedMeshes > 0, `${name} needs textured detailed geometry`);
    assert.ok(proxyMeshes >= 4, `${name} needs readable composite proxy geometry`);
  }

  const cache = getVehicleTextureCacheStats();
  assert.equal(generatedTextures.size, cache.textureCount);
  for (const texture of generatedTextures) {
    const { data, width, height } = texture.image;
    for (let y = 0; y < height; y++) {
      for (let channel = 0; channel < 3; channel++) {
        const left = data[(y * width) * 4 + channel];
        const right = data[(y * width + width - 1) * 4 + channel];
        assert.equal(left, right, `${texture.name} must wrap continuously on X`);
      }
    }
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        const top = data[x * 4 + channel];
        const bottom = data[((height - 1) * width + x) * 4 + channel];
        assert.equal(top, bottom, `${texture.name} must wrap continuously on Y`);
      }
    }
  }
  assert.ok(cache.textureBundleCount <= 12, 'family/slot texture bundles must be shared');
  assert.equal(cache.textureCount, cache.textureBundleCount * 3);
  assert.equal(cache.materialProfileCount, cache.textureBundleCount);
});

test('vehicle enhancement is idempotent and isolates cheap proxy materials', () => {
  for (const { name, fn } of vehicleCreators) {
    const vehicle = fn();
    const childCount = vehicle.children.length;
    const objectCount = [];
    const detailedMaterials = new Set();
    const proxyMaterials = new Set();
    vehicle.traverse(object => {
      objectCount.push(object);
      if (!object.isMesh) return;
      const target = object.userData.lodBand === 'proxy' ? proxyMaterials : detailedMaterials;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => target.add(material));
    });
    const cacheBefore = getVehicleTextureCacheStats();
    const diagnosticsBefore = vehicle.userData.vehicleMaterialDiagnostics;

    assert.equal(enhanceVehicleModel(vehicle), vehicle);
    assert.equal(applyVehicleMaterialPack(vehicle), diagnosticsBefore);

    const afterObjects = [];
    vehicle.traverse(object => afterObjects.push(object));
    assert.equal(vehicle.children.length, childCount, `${name} must not duplicate root details`);
    assert.equal(afterObjects.length, objectCount.length, `${name} must not duplicate proxy/detail meshes`);
    assert.deepEqual(getVehicleTextureCacheStats(), cacheBefore, `${name} must not grow caches`);
    for (const material of proxyMaterials) {
      assert.equal(detailedMaterials.has(material), false, `${name} proxy material must be isolated`);
      assert.equal(material.roughnessMap, null);
      assert.equal(material.bumpMap, null);
    }
  }
});

test('metre projection isolates shared non-indexed geometry without disposing another owner', () => {
  const root = new THREE.Group();
  root.name = 'fr_shared_geometry_fixture';
  const sharedGeometry = new THREE.BoxGeometry(2, 1, 3).toNonIndexed();
  let disposeCount = 0;
  sharedGeometry.addEventListener('dispose', () => disposeCount++);

  const paint = setVehicleMaterialSlot(
    new THREE.MeshStandardMaterial({ color: '#48573a' }),
    'paint'
  );
  const metal = setVehicleMaterialSlot(
    new THREE.MeshStandardMaterial({ color: '#202321', metalness: 0.8 }),
    'metal'
  );
  const paintedMesh = new THREE.Mesh(sharedGeometry, paint);
  paintedMesh.userData.lodBand = 'core';
  const metalMesh = new THREE.Mesh(sharedGeometry, metal);
  metalMesh.userData.lodBand = 'high';
  root.add(paintedMesh, metalMesh);

  const diagnostics = applyVehicleMaterialPack(root);
  assert.equal(disposeCount, 0, 'shared source geometry must remain valid for every owner');
  assert.equal(paintedMesh.geometry, sharedGeometry);
  assert.notEqual(metalMesh.geometry, sharedGeometry);
  assert.equal(
    paintedMesh.geometry.userData.vehicleUvProjection.metersPerTile,
    paint.userData.metersPerRepeat
  );
  assert.equal(
    metalMesh.geometry.userData.vehicleUvProjection.metersPerTile,
    metal.userData.metersPerRepeat
  );
  assert.equal(applyVehicleMaterialPack(root), diagnostics);
  assert.equal(disposeCount, 0);
});

test('all 15 vehicles route through Unit, crew, armament, selection, and LOD contracts', () => {
  vehicleCreators.forEach(({ name, type, vehicleId, armed }) => {
    const spec = getVehicle(vehicleId);
    assert.ok(spec, `${name} must exist in VehicleCatalog`);
    assert.equal(spec.modelId, type);
    assert.ok(spec.crew.length >= 2, `${name} must model its crew`);
    assert.ok(spec.driverRoles.length > 0, `${name} must identify its driver`);
    for (const driverRole of spec.driverRoles) {
      assert.ok(spec.crew.some(crew => crew.role === driverRole), `${name} driver role must belong to its crew`);
    }
    assert.ok(spec.movementMps.FAST > spec.movementMps.HUNT);
    assert.equal(Object.keys(spec.armorMm).length, 6);

    if (armed) {
      assert.ok(spec.mainGun, `${name} must define a main gun`);
      for (const [ammoType, weaponId] of Object.entries(spec.mainGun)) {
        const weapon = getWeapon(weaponId);
        assert.ok(weapon, `${name} ${ammoType} must resolve to a weapon`);
        assert.ok(weapon.caliberMm > 0);
        assert.ok(weapon.muzzleVelocity > 0);
        assert.ok(weapon.reloadSeconds > 0);
      }
    } else {
      assert.equal(spec.mainGun, null, `${name} must remain unarmed`);
    }

    const unit = new Unit({
      id: `integration_${vehicleId}`,
      name,
      faction: type.startsWith('fr_') ? 'french' : 'german',
      type: 'vehicle',
      vehicleId
    });
    assert.equal(unit.mesh.name, type);
    assert.equal(unit.roster.length, spec.crew.length);
    assert.ok(unit.mesh.userData.selectionDisc, `${name} needs selectable UI geometry`);
    assert.equal(Boolean(unit.vehicleWeapon), armed);
    if (armed) {
      assert.ok(unit.mesh.userData.turret);
      assert.ok(unit.mesh.userData.barrel);
      assert.ok(unit.mesh.userData.muzzle);
    }

    assert.equal(unit.updateLOD(new THREE.Vector3(0, 0, 5), 'high'), 'high');
    assert.equal(unit.updateLOD(new THREE.Vector3(0, 0, 50), 'high'), 'medium');
    assert.equal(unit.updateLOD(new THREE.Vector3(0, 0, 100), 'high'), 'core');
    const coreVisible = [];
    unit.mesh.traverse(object => {
      if (object.isMesh && object.visible && object.userData.lodBand !== 'ui') {
        coreVisible.push(object.userData.lodBand);
      }
    });
    assert.ok(coreVisible.length > 0, `${name} needs visible core geometry`);
    assert.ok(coreVisible.every(band => band === 'core'), `${name} core tier must hide detail bands`);

    assert.equal(unit.updateLOD(new THREE.Vector3(0, 0, 500), 'high'), 'low');
    let visibleProxy = 0;
    let visibleCombatGeometry = 0;
    unit.mesh.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      if (object.userData.lodBand === 'proxy') visibleProxy++;
      else if (object.userData.lodBand !== 'ui') visibleCombatGeometry++;
    });
    assert.ok(visibleProxy > 0, `${name} needs a visible far proxy`);
    assert.equal(visibleCombatGeometry, 0, `${name} far LOD must hide combat geometry`);
  });
});

test('Panzer III alone owns the frozen commander-to-main-gunner approximation', () => {
  const policy = VEHICLES.PANZER_III_D.crewTaskPolicy;
  assert.ok(Object.isFrozen(policy));
  assert.ok(Object.isFrozen(policy.mainGunnerReplacement));
  assert.ok(Object.isFrozen(policy.mainGunnerReplacement.candidateRoles));
  assert.equal(policy.schemaVersion, 1);
  assert.equal(
    policy.mainGunnerReplacement.id,
    'panzer-iii-d-commander-main-gunner-v1'
  );
  assert.equal(policy.mainGunnerReplacement.targetRole, 'GUNNER');
  assert.deepEqual(policy.mainGunnerReplacement.candidateRoles, ['COMMANDER']);
  assert.equal(policy.mainGunnerReplacement.delaySeconds, 12);
  assert.match(policy.mainGunnerReplacement.dataQuality, /gameplay approximation/i);
  assert.match(policy.mainGunnerReplacement.dataQuality, /not historical timing claims/i);
  assert.equal(policy.mainGunnerReplacement.referenceUrl, null);

  for (const [vehicleId, vehicle] of Object.entries(VEHICLES)) {
    if (vehicleId === 'PANZER_III_D') continue;
    assert.equal(vehicle.crewTaskPolicy, null, `${vehicleId} must not gain fallback reassignment`);
  }
});

test('2cm autocannon consumes a 10-round feed before crewed reload', () => {
  const panzerII = new Unit({
    id: 'panzer2_feed',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'PANZER_II_C'
  });
  const target = {
    position: new THREE.Vector3(0, 0, 50),
    vehicleSpec: getVehicle('RENAULT_R35')
  };
  const combat = {
    fireWeapon: () => true
  };

  assert.equal(panzerII.vehicleWeapon.feedAmmo, 10);
  assert.equal(panzerII.updateVehicleCombat(2, {
    target,
    combat: { fireWeapon: () => false }
  }), false);
  assert.equal(panzerII.vehicleWeapon.feedAmmo, 10);
  for (let shot = 0; shot < 9; shot++) {
    panzerII.vehicleWeapon.cooldown = 0;
    assert.equal(panzerII.updateVehicleCombat(0.1, { target, combat }), true);
  }
  assert.equal(panzerII.vehicleWeapon.feedAmmo, 1);
  assert.equal(panzerII.vehicleWeapon.loadedType, 'ap');
  assert.equal(panzerII.vehicleWeapon.reloadTimer, 0);

  panzerII.vehicleWeapon.cooldown = 0;
  assert.equal(panzerII.updateVehicleCombat(0.1, { target, combat }), true);
  assert.equal(panzerII.vehicleWeapon.feedAmmo, 0);
  assert.equal(panzerII.vehicleWeapon.loadedType, null);
  assert.equal(panzerII.vehicleWeapon.reloadTimer, getWeapon('KWK30_AP').reloadSeconds);
});

test('unarmed vehicles move under driver control but never create weapon fire', () => {
  const truck = new Unit({
    id: 'opel_unarmed',
    faction: 'german',
    type: 'vehicle',
    vehicleId: 'OPEL_BLITZ'
  });
  let fireCalls = 0;
  truck.addWaypoint(new THREE.Vector3(20, 0, 0), 'FAST');
  truck.update(1, { getHeightAt: () => 0 });

  assert.ok(truck.position.x > 0);
  assert.equal(truck.vehicleWeapon, null);
  assert.equal(truck.updateVehicleCombat(1, {
    target: { position: new THREE.Vector3(0, 0, 10) },
    combat: { fireWeapon: () => { fireCalls++; return true; } }
  }), false);
  assert.equal(fireCalls, 0);

  truck.roster.find(crew => crew.role === 'DRIVER').health = 0;
  const stoppedAt = truck.position.clone();
  truck.update(1, { getHeightAt: () => 0 });
  assert.deepEqual(truck.position.toArray(), stoppedAt.toArray());
});

test('compound crew roles retain their modeled vehicle dependencies', () => {
  const charB1 = new Unit({
    id: 'char_b1_driver',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'CHAR_B1_BIS'
  });
  charB1.addWaypoint(new THREE.Vector3(10, 0, 0), 'MOVE');
  charB1.update(1, { getHeightAt: () => 0 });
  assert.ok(charB1.position.x > 0, 'driver / hull gunner must be able to drive');

  const driver = charB1.roster.find(crew => crew.role === 'DRIVER_HULL_GUNNER');
  driver.health = 0;
  const stoppedAt = charB1.position.clone();
  charB1.update(1, { getHeightAt: () => 0 });
  assert.deepEqual(charB1.position.toArray(), stoppedAt.toArray());

  const amc35 = new Unit({
    id: 'amc35_turret',
    faction: 'french',
    type: 'vehicle',
    vehicleId: 'AMC_35'
  });
  assert.equal(amc35.hasOperationalGunner(), true);
  assert.equal(amc35.hasOperationalLoader(), true);
  amc35.roster.find(crew => crew.role === 'GUNNER_LOADER').health = 0;
  assert.equal(amc35.hasOperationalGunner(), false);
  assert.equal(amc35.hasOperationalLoader(), false);
});
