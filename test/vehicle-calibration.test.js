import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {
  createFrance1940CalibrationReferenceRegistry,
  FRANCE_1940_ASSET_RESOLVER,
  FRANCE_1940_CALIBRATION_REFERENCES,
  FRANCE_1940_RUNTIME_ASSET_PACK,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import {
  FRANCE_1940_ASSET_IDS,
  FRANCE_1940_ASSET_MANIFEST
} from '../src/content/france1940/assets/index.js';
import {
  createAssetResolver,
  createRuntimeAssetPack,
  defineAssetManifest
} from '../src/assets/AssetManifest.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import {
  BLUEPRINT_CALIBRATION_RECORDS
} from '../src/calibration/BlueprintCalibrationRecords.js';
import {
  canvasToSourceNormalized,
  createImageTransform,
  createOrthographicFrame,
  fitImageTransformToLandmarks,
  getViewDimensions,
  lodBandsForTier,
  sourceNormalizedToCanvas,
  worldToViewMeters
} from '../src/calibration/CalibrationMath.js';
import {
  detachNestedProxyMeshes,
  isEffectivelyVisible,
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import {
  renderVehicleSilhouetteSvg
} from '../src/calibration/SoftwareSilhouette.js';
import {
  normalizeImportedCalibration
} from '../src/calibration/CalibrationRecordIO.js';
import {
  createVehicleOwnedRegistrations
} from '../src/calibration/VehicleOwnedRegistration.js';
import {
  resolveCalibrationModelOpacity,
  VehicleCalibrationApp
} from '../src/calibration/VehicleCalibrationApp.js';
import { UnitFactory } from '../src/world/UnitFactory.js';

const createVehicleMesh = modelId => UnitFactory.createTankMesh(
  modelId,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
);

test('model opacity control changes the rendered model layer independently', () => {
  assert.equal(resolveCalibrationModelOpacity(null, 'overlay'), 0.72);
  assert.equal(resolveCalibrationModelOpacity('', 'shaded'), 1);
  assert.equal(resolveCalibrationModelOpacity('invalid', 'wireframe'), 0.94);
  assert.equal(resolveCalibrationModelOpacity('0', 'overlay'), 0);
  assert.equal(resolveCalibrationModelOpacity('0.35', 'shaded'), 0.35);

  const app = Object.create(VehicleCalibrationApp.prototype);
  app.modelOpacityInput = { value: '0.35' };
  app.rendererHost = { style: {} };
  let renderRequests = 0;
  app.requestRender = () => {
    renderRequests += 1;
  };

  app.applyModelOpacity();
  assert.equal(app.modelOpacity, 0.35);
  assert.equal(app.rendererHost.style.opacity, '0.35');
  assert.equal(renderRequests, 1);

  app.modelOpacityInput.value = '2';
  app.applyModelOpacity();
  assert.equal(app.modelOpacity, 1);
  assert.equal(app.rendererHost.style.opacity, '1');
  assert.equal(renderRequests, 2);
});

test('every catalog vehicle has a reusable side, front, and top calibration record', () => {
  const modelIds = Object.values(VEHICLES).map(vehicle => vehicle.modelId).sort();
  assert.deepEqual(Object.keys(BLUEPRINT_CALIBRATION_RECORDS).sort(), modelIds);

  for (const modelId of modelIds) {
    const record = BLUEPRINT_CALIBRATION_RECORDS[modelId];
    assert.ok(record.sourceUrls.length > 0, `${modelId} needs blueprint provenance`);
    assert.equal(record.dimensionPolicy.includes('weapon projection'), true);
    assert.deepEqual(Object.keys(record.views).sort(), ['front', 'side', 'top']);
    assert.ok(record.landmarks.length >= 6);
    for (const view of Object.values(record.views)) {
      assert.deepEqual(view.crop, { left: 0, top: 0, right: 0, bottom: 0 });
      assert.equal(view.scale, 1);
      assert.equal(view.imageUrl, null);
    }
  }
});

test('SOMUA calibration exposes mechanical datums beyond its rigid envelope', () => {
  const record = BLUEPRINT_CALIBRATION_RECORDS.fr_somua;
  const landmarks = new Map(record.landmarks.map(landmark => [landmark.id, landmark]));
  for (const id of [
    'road-wheel-rear-center',
    'road-wheel-front-center',
    'rear-sprocket-center',
    'front-idler-center',
    'turret-ring-center',
    'gun-axis-root',
    'engine-deck-rear'
  ]) {
    assert.ok(landmarks.has(id), `missing ${id}`);
  }
  assert.deepEqual(landmarks.get('turret-ring-center').world, [0, 1.55, 0.55]);
  assert.deepEqual(landmarks.get('turret-ring-center').views, ['side', 'top']);
});

test('jig defaults consume vehicle-owned SOMUA crop, mirror, and rigid landmarks', () => {
  const model = createVehicleMesh('fr_somua');
  const views = createVehicleOwnedRegistrations(
    model,
    BLUEPRINT_CALIBRATION_RECORDS.fr_somua,
    { referenceRegistry: FRANCE_1940_CALIBRATION_REFERENCES }
  );
  assert.equal(views.side.imageUrl, '/s35-compare.jpg');
  assert.equal(views.side.mirrorX, false);
  assert.equal(views.side.autoFit, true);
  assert.ok(Math.abs(views.side.crop.left - 220 / 1335) < 1e-12);
  assert.ok(Math.abs(views.side.crop.top - 55 / 1377) < 1e-12);
  assert.ok(Math.abs(views.side.crop.right - 50 / 1335) < 1e-12);
  assert.ok(Math.abs(views.side.crop.bottom - 722 / 1377) < 1e-12);
  assert.deepEqual(views.side.landmarks['rigid-front'], {
    x: 238 / 1335,
    y: 634 / 1377
  });
  assert.equal(views.front.imageUrl, null, 'qualitative front view must remain unavailable');
  assert.equal(views.top.imageUrl, null, 'qualitative top view must remain unavailable');
});

test('replacement asset pack reaches SOMUA jig defaults through logical reference identity', () => {
  const replacementManifest = defineAssetManifest({
    id: 'france1940-test-calibration-assets',
    familyId: 'france-1940',
    replaces: [FRANCE_1940_ASSET_MANIFEST.id],
    assets: {
      [FRANCE_1940_ASSET_IDS.somuaSideCalibrationReference]: {
        id: FRANCE_1940_ASSET_IDS.somuaSideCalibrationReference,
        kind: 'calibration-reference-image',
        source: {
          type: 'url',
          url: '/replacement-somua-side.png'
        },
        provenance: 'test replacement reference'
      }
    }
  });
  const resolver = createAssetResolver([
    FRANCE_1940_RUNTIME_ASSET_PACK,
    createRuntimeAssetPack(replacementManifest)
  ]);
  const references = createFrance1940CalibrationReferenceRegistry(resolver);
  const reference = references.get('fr_somua', 'side');
  const views = createVehicleOwnedRegistrations(
    createVehicleMesh('fr_somua'),
    BLUEPRINT_CALIBRATION_RECORDS.fr_somua,
    { referenceRegistry: references }
  );

  assert.equal(FRANCE_1940_ASSET_RESOLVER.familyId, 'france-1940');
  assert.deepEqual(reference, {
    logicalId: FRANCE_1940_ASSET_IDS.somuaSideCalibrationReference,
    sourcePackId: replacementManifest.id,
    modelId: 'fr_somua',
    views: ['side'],
    imageUrl: '/replacement-somua-side.png',
    provenance: 'test replacement reference'
  });
  assert.equal(references.get('fr_somua', 'front'), null);
  assert.equal(views.side.imageUrl, '/replacement-somua-side.png');
  assert.equal(views.front.imageUrl, null);
  assert.equal(views.top.imageUrl, null);
});

test('generic calibration code contains no family-owned model or raster fallback', async () => {
  const [registrationSource, appSource] = await Promise.all([
    readFile(
      new URL('../src/calibration/VehicleOwnedRegistration.js', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../src/calibration/VehicleCalibrationApp.js', import.meta.url),
      'utf8'
    )
  ]);

  assert.doesNotMatch(registrationSource, /\bfr_somua\b|s35-compare\.jpg/);
  assert.doesNotMatch(appSource, /content\/france1940|s35-compare\.jpg/);
  assert.match(appSource, /VehicleCalibrationApp requires calibrationReferences/);
  assert.match(appSource, /referenceRegistry: this\.calibrationReferences/);
  assert.match(appSource, /ExternalImageAssetService/);
  assert.match(appSource, /this\.imageAssets\.load\(url/);
  assert.match(appSource, /fallbackPolicy: \{ action: 'return-null' \}/);
  assert.match(appSource, /this\.imageAssets\.dispose\(\)/);

  assert.throws(
    () => createVehicleOwnedRegistrations(
      createVehicleMesh('fr_somua'),
      BLUEPRINT_CALIBRATION_RECORDS.fr_somua,
      {
        referenceRegistry: {
          get: () => ({ imageUrl: 'https://example.invalid/reference-page' })
        }
      }
    ),
    /requires a raster imageUrl/
  );
  assert.throws(
    () => createFrance1940CalibrationReferenceRegistry({
      familyId: 'wrong-family',
      require() {}
    }),
    /require a France 1940 asset resolver/
  );
});

test('jig defaults normalize multiview crops, rotation, and source URLs', () => {
  const panzer3 = createVehicleOwnedRegistrations(
    createVehicleMesh('ger_panzer3'),
    BLUEPRINT_CALIBRATION_RECORDS.ger_panzer3
  );
  assert.equal(panzer3.side.mirrorX, true);
  assert.equal(panzer3.top.rotationDegrees, 90);
  assert.ok(panzer3.side.imageUrl.endsWith('sdkfz141-pzkpfwiii-ausfd-4.png'));
  assert.ok(Math.abs(panzer3.top.crop.top - 450 / 1345) < 1e-12);

  const sdkfz = createVehicleOwnedRegistrations(
    createVehicleMesh('ger_sdkfz231'),
    BLUEPRINT_CALIBRATION_RECORDS.ger_sdkfz231
  );
  assert.match(sdkfz.side.imageUrl, /Sdkfz231%286-Rad%29-plan\.gif$/);
  assert.ok(Math.abs(sdkfz.side.crop.left - 17 / 600) < 1e-12);
  assert.ok(Math.abs(sdkfz.side.crop.bottom - 544 / 800) < 1e-12);
  assert.equal(sdkfz.top.rotationDegrees, 90);
});

test('R35 jig defaults load the registered multiview raster without source-page guessing', () => {
  const views = createVehicleOwnedRegistrations(
    createVehicleMesh('fr_renault_r35'),
    BLUEPRINT_CALIBRATION_RECORDS.fr_renault_r35,
    { referenceRegistry: FRANCE_1940_CALIBRATION_REFERENCES }
  );
  for (const viewName of ['side', 'front', 'top']) {
    const view = views[viewName];
    assert.equal(
      view.imageUrl,
      '/assets/blueprints/france1940/renault-r-35-2.png'
    );
    assert.equal(view.autoFit, true);
    assert.ok(Object.keys(view.landmarks).length >= 5);
  }
  assert.equal(views.side.rotationDegrees, 0);
  assert.equal(views.front.rotationDegrees, 0);
  assert.equal(views.top.rotationDegrees, -90);
});

test('R35 record exposes source-backed side, front, and top fit mechanics', () => {
  const record = BLUEPRINT_CALIBRATION_RECORDS.fr_renault_r35;
  assert.match(record.dataQuality, /side, front, and top registered/);
  assert.doesNotMatch(record.dataQuality, /front\/top unregistered/);
  const ids = new Set(record.landmarks.map(landmark => landmark.id));
  for (const id of [
    'road-wheel-rear-center',
    'road-wheel-front-center',
    'turret-ring-center',
    'gun-axis-root',
    'upper-track-run'
  ]) {
    assert.ok(ids.has(id), `missing ${id}`);
  }
});

test('H39 and Panhard records expose sourced suspension, axle, turret, and gun datums', () => {
  const expected = {
    fr_hotchkiss_h39: [
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'turret-ring-center',
      'gun-axis-root',
      'upper-track-run'
    ],
    fr_panhard178: [
      'rear-axle-center',
      'front-axle-center',
      'left-wheel-center',
      'right-wheel-center',
      'turret-ring-center',
      'gun-axis-root'
    ]
  };
  for (const [modelId, landmarkIds] of Object.entries(expected)) {
    const record = BLUEPRINT_CALIBRATION_RECORDS[modelId];
    const ids = new Set(record.landmarks.map(landmark => landmark.id));
    for (const id of landmarkIds) assert.ok(ids.has(id), `${modelId} missing ${id}`);
    assert.equal(/multi-view blueprint silhouette/.test(record.dataQuality), false);
  }
});

test('AMC 35, Laffly S20TL, and Char B1 records expose their registered mechanics', () => {
  const expected = {
    fr_amc35: [
      'rear-idler-center',
      'front-sprocket-center',
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'turret-ring-center',
      'gun-axis-root'
    ],
    fr_laffly_s20tl: [
      'front-axle-center',
      'middle-axle-center',
      'rear-axle-center',
      'front-roller-center',
      'belly-roller-center',
      'bonnet-rear-break',
      'windshield-top'
    ],
    fr_char_b1bis: [
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'upper-track-run',
      'turret-ring-center',
      'turret-gun-axis',
      'hull-gun-axis',
      'driver-hood-center'
    ]
  };
  for (const [modelId, landmarkIds] of Object.entries(expected)) {
    const record = BLUEPRINT_CALIBRATION_RECORDS[modelId];
    const ids = new Set(record.landmarks.map(landmark => landmark.id));
    for (const id of landmarkIds) assert.ok(ids.has(id), `${modelId} missing ${id}`);
  }
  assert.deepEqual(
    BLUEPRINT_CALIBRATION_RECORDS.fr_laffly_s20tl
      .landmarks.find(landmark => landmark.id === 'middle-axle-center').world,
    [0, 0.46, -0.82]
  );
});

test('German light and medium tank records expose their registered mechanics', () => {
  const expected = {
    ger_panzer2: [
      'rear-idler-center',
      'front-sprocket-center',
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'turret-ring-center',
      'gun-axis-root'
    ],
    ger_panzer3: [
      'rear-idler-center',
      'front-sprocket-center',
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'turret-ring-center',
      'gun-axis-root'
    ],
    ger_panzer35t: [
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'turret-ring-center',
      'gun-axis-root'
    ],
    ger_panzer38t: [
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'left-track-center',
      'turret-ring-center',
      'gun-axis-root'
    ],
    ger_panzer4: [
      'rear-idler-center',
      'front-sprocket-center',
      'road-wheel-rear-center',
      'road-wheel-front-center',
      'turret-ring-center',
      'gun-axis-root'
    ]
  };
  for (const [modelId, landmarkIds] of Object.entries(expected)) {
    const record = BLUEPRINT_CALIBRATION_RECORDS[modelId];
    const ids = new Set(record.landmarks.map(landmark => landmark.id));
    for (const id of landmarkIds) assert.ok(ids.has(id), `${modelId} missing ${id}`);
    assert.equal(/multi-view blueprint silhouette/.test(record.dataQuality), false);
  }
});

test('Sd.Kfz. 231 6-Rad record exposes its registered three-axle mechanics', () => {
  const record = BLUEPRINT_CALIBRATION_RECORDS.ger_sdkfz231;
  const ids = new Set(record.landmarks.map(landmark => landmark.id));
  for (const id of [
    'front-axle-center',
    'middle-axle-center',
    'rear-axle-center',
    'turret-ring-center',
    'gun-axis-root'
  ]) {
    assert.ok(ids.has(id), `ger_sdkfz231 missing ${id}`);
  }
  assert.deepEqual(
    record.landmarks.find(landmark => landmark.id === 'front-axle-center').world,
    [0, 0.43, 1.86]
  );
});

test('Opel Blitz record exposes historical wheelbase, track, and canvas datums', () => {
  const record = BLUEPRINT_CALIBRATION_RECORDS.ger_opel_blitz;
  const ids = new Set(record.landmarks.map(landmark => landmark.id));
  for (const id of [
    'front-axle-center',
    'rear-axle-center',
    'left-front-track-center',
    'left-rear-track-center',
    'canvas-crown'
  ]) {
    assert.ok(ids.has(id), `ger_opel_blitz missing ${id}`);
  }
  assert.deepEqual(record.dimensionsMeters, { length: 6.02, width: 2.27, height: 2.59 });
});

test('orthographic frames contain exact rigid dimensions at portrait and landscape aspects', () => {
  const dimensions = { length: 5.38, width: 2.12, height: 2.62 };
  for (const aspect of [0.6, 1, 16 / 9]) {
    for (const view of ['side', 'front', 'top']) {
      const frame = createOrthographicFrame(dimensions, view, aspect);
      const visible = getViewDimensions(dimensions, view);
      assert.ok(frame.width >= visible.horizontal);
      assert.ok(frame.height >= visible.vertical);
      assert.ok(frame.left <= -visible.horizontal * 0.5);
      assert.ok(frame.right >= visible.horizontal * 0.5);
      if (view === 'top') {
        assert.ok(frame.bottom <= -visible.vertical * 0.5);
        assert.ok(frame.top >= visible.vertical * 0.5);
      } else {
        assert.ok(frame.bottom <= 0);
        assert.ok(frame.top >= dimensions.height);
      }
    }
  }
});

test('view mappings follow the +Y-up +Z-forward vehicle contract', () => {
  const point = [1, 2, 3];
  assert.deepEqual(worldToViewMeters(point, 'side'), { u: -3, v: 2 });
  assert.deepEqual(worldToViewMeters(point, 'front'), { u: 1, v: 2 });
  assert.deepEqual(worldToViewMeters(point, 'top'), { u: -1, v: 3 });
});

test('cropped mirrored blueprint transforms preserve source coordinates', () => {
  const transform = createImageTransform({
    imageWidth: 1600,
    imageHeight: 900,
    canvasWidth: 1000,
    canvasHeight: 700,
    crop: { left: 0.1, top: 0.12, right: 0.2, bottom: 0.08 },
    scale: 1.35,
    offsetX: 42,
    offsetY: -18,
    rotationDegrees: 90,
    mirrorX: true
  });
  const source = { x: 0.44, y: 0.61 };
  const canvas = sourceNormalizedToCanvas(source, transform, 1600, 900);
  const restored = canvasToSourceNormalized(canvas, transform, 1600, 900);
  assert.ok(Math.abs(restored.x - source.x) < 1e-9);
  assert.ok(Math.abs(restored.y - source.y) < 1e-9);
});

test('crop normalization always retains an in-bounds source rectangle', () => {
  const transform = createImageTransform({
    imageWidth: 1000,
    imageHeight: 500,
    canvasWidth: 800,
    canvasHeight: 600,
    crop: { left: 0.9, top: 0.8, right: 0.9, bottom: 0.8 }
  });
  assert.ok(transform.sourceX >= 0);
  assert.ok(transform.sourceY >= 0);
  assert.ok(transform.sourceWidth > 0);
  assert.ok(transform.sourceHeight > 0);
  assert.ok(transform.sourceX + transform.sourceWidth <= 1000);
  assert.ok(transform.sourceY + transform.sourceHeight <= 500);
});

test('multi-landmark fit recovers a uniform blueprint scale and offset', () => {
  const reference = [
    { x: 100, y: 220 },
    { x: 400, y: 210 },
    { x: 260, y: 80 }
  ];
  const center = { x: 300, y: 200 };
  const expected = { scale: 1.4, offsetX: 37, offsetY: -24 };
  const model = reference.map(point => ({
    x: center.x + (point.x - center.x) * expected.scale + expected.offsetX,
    y: center.y + (point.y - center.y) * expected.scale + expected.offsetY
  }));
  const fit = fitImageTransformToLandmarks(reference, model, center);
  assert.ok(Math.abs(fit.scale - expected.scale) < 1e-12);
  assert.ok(Math.abs(fit.offsetX - expected.offsetX) < 1e-12);
  assert.ok(Math.abs(fit.offsetY - expected.offsetY) < 1e-12);
  assert.ok(fit.rmsPixels < 1e-12);
});

test('landmark fit rejects coincident or incomplete registrations', () => {
  assert.throws(
    () => fitImageTransformToLandmarks([{ x: 0, y: 0 }], [{ x: 1, y: 1 }], { x: 0, y: 0 }),
    /At least two/
  );
  assert.throws(
    () => fitImageTransformToLandmarks(
      [{ x: 2, y: 2 }, { x: 2, y: 2 }],
      [{ x: 1, y: 1 }, { x: 4, y: 4 }],
      { x: 0, y: 0 }
    ),
    /must not occupy/
  );
});

test('calibration LOD tiers are explicit and cumulative only toward close detail', () => {
  assert.deepEqual([...lodBandsForTier('high')].sort(), ['core', 'high', 'medium']);
  assert.deepEqual([...lodBandsForTier('medium')].sort(), ['core', 'medium']);
  assert.deepEqual([...lodBandsForTier('core')], ['core']);
  assert.deepEqual([...lodBandsForTier('proxy')], ['proxy']);
});

test('nested proxy meshes detach without moving and remain isolatable', () => {
  const root = new THREE.Group();
  const detailed = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
  detailed.userData.lodBand = 'core';
  detailed.position.set(0.2, 0.5, -0.4);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 3.5));
  proxy.userData.lodBand = 'proxy';
  proxy.position.set(0.1, 0.2, 0.3);
  detailed.add(proxy);
  root.add(detailed);
  root.updateMatrixWorld(true);
  const before = proxy.getWorldPosition(new THREE.Vector3());

  assert.equal(detachNestedProxyMeshes(root), 1);
  root.updateMatrixWorld(true);
  assert.ok(proxy.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9);

  setCalibrationLodVisibility(root, 'proxy');
  assert.equal(isEffectivelyVisible(detailed, root.parent), false);
  assert.equal(isEffectivelyVisible(proxy, root.parent), true);
});

test('software silhouette emits visible projected triangles for the selected LOD only', () => {
  const root = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
  core.userData.lodBand = 'core';
  core.position.y = 0.5;
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 2));
  proxy.userData.lodBand = 'proxy';
  proxy.position.y = 0.25;
  root.add(core, proxy);

  setCalibrationLodVisibility(root, 'core');
  const coreResult = renderVehicleSilhouetteSvg(
    root,
    { length: 4, width: 2, height: 1 },
    'side',
    { width: 640, height: 360 }
  );
  assert.equal(coreResult.manifest.triangleCount, 12);
  assert.deepEqual(coreResult.manifest.projectedBoundsMeters, {
    minU: -2,
    maxU: 2,
    minV: 0,
    maxV: 1,
    width: 4,
    height: 1
  });
  assert.match(coreResult.svg, /<g fill="#101820"/);
  assert.equal((coreResult.svg.match(/<path d=/g) ?? []).length, 12);
  assert.match(coreResult.svg, /stroke="#dc2626"/);

  setCalibrationLodVisibility(root, 'proxy');
  const proxyResult = renderVehicleSilhouetteSvg(
    root,
    { length: 4, width: 2, height: 1 },
    'front',
    { showEnvelope: false }
  );
  assert.equal(proxyResult.manifest.triangleCount, 12);
  assert.doesNotMatch(proxyResult.svg, /stroke="#dc2626"/);

  const wireframe = renderVehicleSilhouetteSvg(
    root,
    { length: 4, width: 2, height: 1 },
    'top',
    { wireframe: true, silhouette: '#0891b2' }
  );
  assert.match(wireframe.svg, /fill="none" stroke="#0891b2"/);
});

test('registration imports reject the wrong vehicle and normalize unsafe values', () => {
  const record = BLUEPRINT_CALIBRATION_RECORDS.fr_somua;
  assert.throws(
    () => normalizeImportedCalibration({ modelId: 'ger_panzer4', views: {} }, record),
    /not fr_somua/
  );
  const views = normalizeImportedCalibration({
    modelId: 'fr_somua',
    views: {
      side: {
        imageUrl: '/s35.png',
        crop: { left: 0.9, top: -1, right: 0.9, bottom: 4 },
        scale: 100,
        offsetX: '12.5',
        offsetY: 'bad',
        mirrorX: 1,
        landmarks: {
          'rigid-front': { x: 1.4, y: -0.2 },
          unknown: { x: 0.5, y: 0.5 }
        }
      }
    }
  }, record);
  assert.equal(views.side.crop.left, 0.9);
  assert.equal(views.side.crop.top, 0);
  assert.ok(Math.abs(views.side.crop.right - 0.09) < 1e-12);
  assert.equal(views.side.crop.bottom, 0.99);
  assert.equal(views.side.scale, 10);
  assert.equal(views.side.offsetX, 12.5);
  assert.equal(views.side.offsetY, 0);
  assert.equal(views.side.mirrorX, true);
  assert.deepEqual(views.side.landmarks, {
    'rigid-front': { x: 1, y: 0 }
  });
  assert.equal(views.front.scale, 1);
});
