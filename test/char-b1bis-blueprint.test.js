import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import {
  isEffectivelyVisible,
  setCalibrationLodVisibility
} from '../src/calibration/CalibrationModel.js';
import { CHAR_B1_BIS_VISUAL_DATA } from '../src/content/france1940/vehicleData/CharB1BisVisualData.js';
import {
  CHAR_B1_BIS_BLUEPRINT_CALIBRATION,
  createCharB1BisMesh
} from '../src/world/vehicles/CharB1Bis.js';

function rigidBounds(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const objectBounds = new THREE.Box3();
  model.traverse(object => {
    if (!object.isMesh && !object.isInstancedMesh) return;
    if (object.userData.envelopeRole === 'weaponProjection'
        || object.userData.envelopeRole === 'flexibleAttachment'
        || object.userData.lodBand === 'proxy') return;
    objectBounds.setFromObject(object);
    bounds.union(objectBounds);
  });
  return bounds;
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`
  );
}

function assertDeepFrozen(value, path = 'visualData') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is mutable`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`);
  }
}

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function geometryTopology(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  assert.ok(index, `${geometry.name} must be indexed`);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const edges = new Map();
  let degenerate = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    a.fromBufferAttribute(position, triangle[0]);
    b.fromBufferAttribute(position, triangle[1]);
    c.fromBufferAttribute(position, triangle[2]);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-12) {
      degenerate++;
    }
    for (let edge = 0; edge < 3; edge++) {
      const from = triangle[edge];
      const to = triangle[(edge + 1) % 3];
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const entry = edges.get(key) ?? { count: 0, direction: 0 };
      entry.count++;
      entry.direction += from < to ? 1 : -1;
      edges.set(key, entry);
    }
  }
  return {
    degenerate,
    nonManifoldEdges: [...edges.values()].filter(edge => edge.count !== 2).length,
    sameDirectedEdges: [...edges.values()].filter(edge => edge.direction !== 0).length
  };
}

test('Char B1 bis keeps exact official rigid envelope and ground contact', () => {
  const model = createCharB1BisMesh();
  const bounds = rigidBounds(model);
  const size = bounds.getSize(new THREE.Vector3());
  assertNear(size.x, 2.46, 0.01, 'width');
  assertNear(size.y, 2.79, 0.01, 'height');
  assertNear(size.z, 6.37, 0.005, 'length');
  assertNear(bounds.min.y, 0, 0.01, 'ground line');
  assert.deepEqual(
    model.userData.modelMetadata.dimensionsMeters,
    CHAR_B1_BIS_BLUEPRINT_CALIBRATION.rigidEnvelopeMeters
  );
});

test('Char B1 bis preserves full-height sixteen-wheel rear-drive identity', () => {
  const model = createCharB1BisMesh();
  const gear = model.userData.runningGear;
  assert.equal(gear.userData.trackParts.roadWheels.length, 32);
  assert.equal(gear.userData.driveLocation, 'rear');
  assert.match(gear.userData.wheelLayout, /three four-wheel bogies/);
  assert.ok(gear.userData.trackParts.sprockets.every(wheel => wheel.position.z < 0));
  assert.ok(gear.userData.trackParts.idlers.every(wheel => wheel.position.z > 0));
  assert.ok(gear.userData.dimensionsMeters.beltHeight >= 1.44);
});

test('Char B1 bis front asymmetry follows shared local-frame contract', () => {
  const model = createCharB1BisMesh();
  const hood = model.getObjectByName('CharB1Bis_LeftDriverHood');
  const visor = model.getObjectByName('CharB1Bis_DriverVisor');
  const hullGun = model.getObjectByName('CharB1_75mm_HullGun');
  const radiator = model.getObjectByName('CharB1Bis_LeftRadiatorPanel');
  const door = model.getObjectByName('CharB1Bis_RightCrewDoor');
  assert.ok(hood.position.x > 0);
  assert.ok(visor.position.x > 0);
  assert.ok(hullGun.position.x < 0);
  assert.equal(hullGun.userData.mountSide, 'right');
  assert.ok(radiator.position.x > 0);
  assert.equal(radiator.userData.semanticSide, 'left');
  assert.ok(door.position.x < 0);
  assert.equal(door.userData.semanticSide, 'right');
});

test('Char B1 bis hull and turret barrels terminate at exact muzzle markers', () => {
  const model = createCharB1BisMesh();
  for (const [barrel, marker] of [
    [model.userData.barrel, model.userData.muzzle],
    [model.userData.hullBarrel, model.userData.hullMuzzle]
  ]) {
    barrel.geometry.computeBoundingBox();
    assertNear(
      barrel.position.z + barrel.geometry.boundingBox.max.y,
      marker.position.z,
      1e-6,
      `${barrel.name} muzzle`
    );
  }
  assert.equal(model.userData.muzzle.parent, model.userData.turret);
  assert.equal(model.userData.hullMuzzle.parent, model);
  assert.equal(model.userData.weaponMuzzles.coax.parent, model.userData.turret);
  assert.equal(model.userData.weaponMuzzles.hull, model.userData.hullMuzzle);
  assert.equal(model.userData.muzzle.userData.mountSide, 'center');
  assert.equal(model.userData.weaponMuzzles.coax.userData.mountSide, 'right');
});

test('Char B1 bis primary lofts are audited and every LOD has geometry', () => {
  const model = createCharB1BisMesh();
  for (const name of [
    'CharB1Bis_PrimaryHull',
    'CharB1Bis_UpperHull',
    'CharB1Bis_RaisedEngineCover',
    'CharB1Bis_LeftDriverHood',
    'CharB1Bis_APX4Turret',
    'CharB1Bis_ProxyHull',
    'CharB1Bis_ProxyUpperHull',
    'CharB1Bis_ProxyEngineCover',
    'CharB1Bis_ProxyAPX4Turret'
  ]) {
    const mesh = model.getObjectByName(name);
    assert.ok(mesh, `${name} missing`);
    assert.equal(mesh.geometry.userData.outwardWindingAudited, true);
    assert.ok(mesh.geometry.userData.signedVolume > 0);
  }
  const bands = new Set();
  model.traverse(object => {
    if (object.isMesh || object.isInstancedMesh) bands.add(object.userData.lodBand);
  });
  assert.deepEqual(
    [...bands].sort(),
    ['core', 'high', 'medium', 'proxy']
  );
  assert.ok(model.getObjectByName('CharB1Bis_ProxyCupola'));
  assert.ok(model.getObjectByName('CharB1Bis_ProxyCupolaHatch'));
  assert.ok(CHAR_B1_BIS_BLUEPRINT_CALIBRATION.sources.length >= 3);
  assert.match(
    CHAR_B1_BIS_BLUEPRINT_CALIBRATION.datums.roadWheelCentersZ.quality,
    /cross-view constrained inference/
  );
});

test('Char B1 bis photo evidence and visual ownership are immutable and reproducible', () => {
  assertDeepFrozen(CHAR_B1_BIS_VISUAL_DATA);
  assert.equal(CHAR_B1_BIS_VISUAL_DATA.modelId, 'fr_char_b1bis');
  assert.match(CHAR_B1_BIS_VISUAL_DATA.evidenceStatus, /photo-backed/);
  const dimensionsSource = CHAR_B1_BIS_VISUAL_DATA.sources.find(
    source => source.id === 'official-rigid-dimensions'
  );
  assert.equal(dimensionsSource.publisher, 'Ministère des Armées / Chemins de mémoire');
  assert.match(dimensionsSource.provenanceStatus, /exact historical data/);
  const suspensionSource = CHAR_B1_BIS_VISUAL_DATA.sources.find(
    source => source.id === 'acr-maintenance-notice'
  );
  assert.equal(suspensionSource.creator, 'Ateliers de Construction de Rueil');
  assert.match(suspensionSource.provenanceStatus, /primary scan not redistributed/);
  const photoSources = CHAR_B1_BIS_VISUAL_DATA.sources.filter(source => source.cropPath);
  assert.equal(photoSources.length, 4);
  assert.equal(
    photoSources.find(source => source.id === 'aubigny-front-oblique').creator,
    'André Lecolinet'
  );
  for (const source of photoSources) {
    assert.match(source.license, /CC/);
    assert.ok(source.creator);
    assert.ok(source.originalPixels.width > 0 && source.originalPixels.height > 0);
    const bytes = readFileSync(`public${source.cropPath}`);
    assert.deepEqual(pngDimensions(bytes), {
      width: source.crop.width,
      height: source.crop.height
    });
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.cropSha256);
    assert.equal(source.observedPixels.coordinateSpace, 'original-image pixels');
  }
});

test('Char B1 bis retains the exact external local-only multiview identity and transforms', () => {
  const blueprint = CHAR_B1_BIS_VISUAL_DATA.blueprint;
  assert.equal(blueprint.author, 'Ken Musgrave');
  assert.equal(blueprint.sourcePageUrl, 'https://onwar.com/wwii/tanks/france/fr001b1bisp.html');
  assert.equal(blueprint.directImageLocator, 'https://onwar.com/wwii/tanks/france/fr001b1bis.jpg');
  assert.deepEqual(blueprint.imagePixels, { width: 1200, height: 1500 });
  assert.equal(blueprint.sha256, 'e4e52bad67f44066138824554c5df58952443479ed833dce67a24dd1631f7f61');
  assert.equal(blueprint.redistributionStatus, 'external local-only; raster not included');
  assert.equal(blueprint.localUploadRequired, true);
  assert.equal(Object.hasOwn(blueprint, 'imageUrl'), false);
  assert.equal(
    CHAR_B1_BIS_VISUAL_DATA.calibration.imageRegistration.views,
    blueprint.views
  );
  assert.equal(
    CHAR_B1_BIS_VISUAL_DATA.calibration.imageRegistration.sourceSha256,
    blueprint.sha256
  );
  assertDeepFrozen(blueprint, 'visualData.blueprint');

  for (const view of Object.values(blueprint.views)) {
    const crop = view.cropPixels;
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(crop.x + crop.width <= blueprint.imagePixels.width);
    assert.ok(crop.y + crop.height <= blueprint.imagePixels.height);
    assert.equal(view.rotationDegrees, 0);
    assert.equal(view.mirrorX, false);
    assert.ok(Object.keys(view.landmarkPixels).length >= 2);
    assert.notEqual(view.horizontalMetersPerPixel, view.verticalMetersPerPixel);
    for (const point of Object.values(view.landmarkPixels)) {
      assert.ok(point[0] >= 0 && point[0] <= blueprint.imagePixels.width);
      assert.ok(point[1] >= 0 && point[1] <= blueprint.imagePixels.height);
    }
  }
});

test('Char B1 bis drawing-derived metres recompute from independent view registrations', () => {
  const { side, top, front } = CHAR_B1_BIS_VISUAL_DATA.blueprint.views;
  assertNear(side.horizontalMetersPerPixel * (1091 - 122), 6.37, 1e-12, 'side length');
  assertNear(side.verticalMetersPerPixel * (503 - 84), 2.79, 1e-12, 'side height');
  assertNear(top.horizontalMetersPerPixel * (1115 - 121), 6.37, 1e-12, 'top length');
  assertNear(top.verticalMetersPerPixel * (926 - 548), 2.46, 1e-12, 'top width');
  assertNear(front.horizontalMetersPerPixel * (579 - 170), 2.46, 1e-12, 'front width');
  assertNear(front.verticalMetersPerPixel * (1477 - 1051), 2.79, 1e-12, 'front height');

  const sprocket = side.observations.driveSprocket;
  assertNear(
    sprocket.derivedMeters.z,
    (side.originPixels.x - sprocket.sourcePixels[0]) * side.horizontalMetersPerPixel,
    1e-12,
    'sprocket z'
  );
  assertNear(
    sprocket.derivedMeters.y,
    (side.originPixels.y - sprocket.sourcePixels[1]) * side.verticalMetersPerPixel,
    1e-12,
    'sprocket y'
  );
  const turretRing = top.observations.turretRing;
  assertNear(
    turretRing.derivedMeters.z,
    (top.originPixels.x - turretRing.sourcePixels[0]) * top.horizontalMetersPerPixel,
    1e-12,
    'top turret z'
  );
  assertNear(
    turretRing.derivedMeters.x,
    (turretRing.sourcePixels[1] - top.originPixels.y) * top.verticalMetersPerPixel,
    1e-12,
    'top turret x'
  );
  const frontTopLeft = front.observations.rigidBounds.derivedCornersMeters.topLeft;
  assertNear(frontTopLeft.x, -2.46 / 2, 1e-12, 'front right edge');
  assertNear(frontTopLeft.y, 2.79, 1e-12, 'front top edge');

  const convert = {
    side: (view, [x, y]) => ({
      y: (view.originPixels.y - y) * view.verticalMetersPerPixel,
      z: (view.originPixels.x - x) * view.horizontalMetersPerPixel
    }),
    top: (view, [x, y]) => ({
      x: (y - view.originPixels.y) * view.verticalMetersPerPixel,
      z: (view.originPixels.x - x) * view.horizontalMetersPerPixel
    }),
    front: (view, [x, y]) => ({
      x: (x - view.originPixels.x) * view.horizontalMetersPerPixel,
      y: (view.originPixels.y - y) * view.verticalMetersPerPixel
    })
  };
  let checkedDerivations = 0;
  for (const [viewName, view] of Object.entries({ side, top, front })) {
    const verifyPoint = (actual, source, label) => {
      const expected = convert[viewName](view, source);
      for (const axis of Object.keys(expected)) {
        assertNear(actual[axis], expected[axis], 1e-12, `${label} ${axis}`);
      }
      checkedDerivations += 1;
    };
    const visit = (value, path) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value.sourcePixels) && value.derivedMeters) {
        if (Array.isArray(value.sourcePixels[0])) {
          assert.equal(value.sourcePixels.length, value.derivedMeters.length, path);
          value.sourcePixels.forEach((point, index) => {
            verifyPoint(value.derivedMeters[index], point, `${path}[${index}]`);
          });
        } else if (value.sourcePixels.length === 2) {
          verifyPoint(value.derivedMeters, value.sourcePixels, path);
        }
      }
      if (Array.isArray(value.boundsPixels) && value.derivedCornersMeters) {
        const [left, topPixel, right, bottom] = value.boundsPixels;
        verifyPoint(value.derivedCornersMeters.topLeft, [left, topPixel], `${path}.topLeft`);
        verifyPoint(value.derivedCornersMeters.bottomRight, [right, bottom], `${path}.bottomRight`);
      }
      for (const [key, child] of Object.entries(value)) {
        if (!['sourcePixels', 'derivedMeters', 'boundsPixels', 'derivedCornersMeters'].includes(key)) {
          visit(child, `${path}.${key}`);
        }
      }
    };
    visit(view.observations, `${viewName}.observations`);
  }
  assert.ok(checkedDerivations >= 30);
});

test('Char B1 bis rigid-top landmarks identify the visible cupola roof rather than antenna pixels', () => {
  const { side, front } = CHAR_B1_BIS_VISUAL_DATA.blueprint.views;
  assert.equal(side.rigidBoundsPixels.topY, 84);
  assert.deepEqual(side.landmarkPixels['vehicle-top'], [490, 84]);
  assert.deepEqual(side.observations.rigidTop.sourcePixels, [490, 84]);
  assert.deepEqual(side.observations.cupola.boundsPixels, [445, 84, 536, 126]);
  assert.match(side.observations.rigidTop.evidenceStatus, /APX 4 cupola roof/);
  assert.equal(front.rigidBoundsPixels.topY, 1051);
  assert.deepEqual(front.landmarkPixels['vehicle-top'], [407, 1051]);
  assert.deepEqual(front.observations.rigidTop.sourcePixels, [407, 1051]);
  assert.deepEqual(front.observations.rigidBounds.boundsPixels, [170, 1051, 579, 1477]);
  assert.match(front.observations.rigidTop.evidenceStatus, /cupola roof/);
  assert.match(front.observations.rigidTop.evidenceStatus, /antenna.*x=440/);
});

test('Char B1 bis corrects the disputed side gun pixels to the APX 4 turret 47 mm', () => {
  const observation = CHAR_B1_BIS_VISUAL_DATA.blueprint.views.side
    .observations.disputedTurret47Gun;
  assert.deepEqual(observation.muzzle.sourcePixels, [207, 186]);
  assert.deepEqual(observation.mantlet.boundsPixels, [318, 171, 360, 211]);
  assert.match(observation.correctedFeatureIdentity, /APX 4 turret 47 mm SA 35/);
  assert.doesNotMatch(observation.correctedFeatureIdentity, /^hull 75 mm/);
  assert.match(observation.status, /never used for hull-75 geometry/);
});

test('Char B1 bis keeps hidden supports inferred while retaining visible drawing observations', () => {
  const blueprintGear = CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.localDrawingObservations;
  assert.deepEqual(blueprintGear.driveSprocket.sourcePixels, [1009, 382]);
  assert.deepEqual(blueprintGear.idler.sourcePixels, [163, 394]);
  assert.match(blueprintGear.retainedGeometryStatus, /remain model-metre cross-view inference/);
  const supports = [
    CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.driveSprocket,
    CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.idlerWheel,
    ...CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.roadWheels,
    ...CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.returnRollers
  ];
  assert.ok(supports.every(support => !Object.hasOwn(support, 'sourcePixels')));
  assert.match(
    CHAR_B1_BIS_VISUAL_DATA.blueprint.views.side.observations
      .hiddenSupportInference.status,
    /cannot be called sourcePixels/
  );
  const rearTensionWheel = CHAR_B1_BIS_VISUAL_DATA.blueprint.views.side
    .observations.rearTensionWheel;
  assert.deepEqual(rearTensionWheel.inferredCenterClaimPixels, [273, 406]);
  assert.equal(rearTensionWheel.inferredRadiusClaimPixels, 31);
  assert.equal(Object.hasOwn(rearTensionWheel, 'sourcePixels'), false);
  assert.equal(Object.hasOwn(rearTensionWheel, 'derivedMeters'), false);
  assert.match(rearTensionWheel.status, /discarded inference claim/);
});

test('Char B1 bis local-only raster and annotations are absent from repository assets', () => {
  const root = 'public/assets';
  assert.equal(existsSync(root), true);
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => `${entry.parentPath}/${entry.name}`);
  assert.ok(files.every(path => !/onwar|ken[-_ ]?musgrave/i.test(path)));
  for (const path of files.filter(path => /\.(?:jpe?g|png)$/i.test(path))) {
    assert.notEqual(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
      CHAR_B1_BIS_VISUAL_DATA.blueprint.sha256,
      `${path} redistributes the private calibration raster`
    );
  }
});

test('Char B1 bis closed authored parts are manifold, directed, and locally outward', () => {
  const model = createCharB1BisMesh();
  for (const name of [
    'CharB1Bis_PrimaryHull',
    'CharB1Bis_UpperHull',
    'CharB1Bis_RaisedEngineCover',
    'CharB1Bis_LeftDriverHood',
    'CharB1Bis_DriverVisor',
    'CharB1Bis_75mmMantlet',
    'CharB1Bis_APX4Turret',
    'CharB1Bis_ProxyHull',
    'CharB1Bis_ProxyUpperHull',
    'CharB1Bis_ProxyEngineCover',
    'CharB1Bis_ProxyDriverProjection',
    'CharB1Bis_Proxy75mmCollar',
    'CharB1Bis_ProxyAPX4Turret'
  ]) {
    const mesh = model.getObjectByName(name);
    assert.ok(mesh, `${name} missing`);
    assert.deepEqual(
      geometryTopology(mesh.geometry),
      { degenerate: 0, nonManifoldEdges: 0, sameDirectedEdges: 0 },
      `${name} topology`
    );
    assert.ok(mesh.geometry.userData.signedVolume > 0, `${name} winding`);
    assert.ok(mesh.geometry.userData.capNormals, `${name} cap contract`);
  }
});

test('Char B1 bis uses an irregular hull collar and a seated driver visor', () => {
  const model = createCharB1BisMesh();
  const collar = model.getObjectByName('CharB1Bis_75mmMantlet');
  const visor = model.getObjectByName('CharB1Bis_DriverVisor');
  const hood = model.getObjectByName('CharB1Bis_LeftDriverHood');
  const outline = collar.geometry.userData.sourceOutline;
  const radii = outline.map(([x, y]) => Math.hypot(x, y).toFixed(4));
  assert.ok(new Set(radii).size >= 4);
  assert.match(collar.userData.evidenceQuality, /photograph/);
  model.updateMatrixWorld(true);
  assert.equal(
    new THREE.Box3().setFromObject(visor).intersectsBox(new THREE.Box3().setFromObject(hood)),
    true
  );
  assert.equal(visor.userData.surfaceRole, 'seated-driver-visor');
});

test('Char B1 bis detailed and proxy running gear share compound supports and path', () => {
  const model = createCharB1BisMesh();
  const detail = model.userData.runningGear;
  const proxy = model.userData.authoredProxy.getObjectByName('CharB1BisAuthoredRunningGearProxy');
  const supports = CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.roadWheels;
  assert.equal(supports.length, 16);
  assert.deepEqual(
    supports.reduce((groups, wheel) => ({ ...groups, [wheel.group]: (groups[wheel.group] ?? 0) + 1 }), {}),
    { 'rear-tension': 1, 'bogie-1': 4, 'bogie-2': 4, 'bogie-3': 4, 'forward-independent': 3 }
  );
  const allSupports = [
    CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.driveSprocket,
    CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.idlerWheel,
    ...supports,
    ...CHAR_B1_BIS_VISUAL_DATA.geometry.runningGear.trackPath.returnRollers
  ];
  assert.ok(allSupports.every(support => (
    support.coordinateSpace === 'model metres'
    && support.evidenceSourceIds.length > 0
    && /inference; no orthographic support-pixel registration/.test(support.evidenceQuality)
    && !Object.hasOwn(support, 'sourcePixels')
    && !Object.hasOwn(support, 'sourceRadiusPixels')
  )));
  assert.equal(detail.userData.runningGearType, 'wheel-supported-quasi-static-track');
  assert.equal(proxy.userData.runningGearType, 'wheel-supported-quasi-static-proxy');
  assert.equal(detail.userData.trackPath.model, 'wheel-supported-quasi-static-v1');
  assert.equal(proxy.userData.trackPath.model, 'wheel-supported-quasi-static-v1');
  assert.deepEqual(detail.userData.supportIds, proxy.userData.supportIds);
  assert.deepEqual(detail.userData.trackPath.bounds, proxy.userData.trackPath.bounds);
  assert.ok(model.getObjectByName('CharB1Bis_ProxyLeftRearDriveSprocket'));
  assert.ok(model.getObjectByName('CharB1Bis_ProxyLeftFrontIdlerWheel'));
});

test('Char B1 bis proxy retains its defining driver, mounts, and cupola', () => {
  const model = createCharB1BisMesh();
  for (const name of [
    'CharB1Bis_ProxyDriverProjection',
    'CharB1Bis_Proxy75mmCollar',
    'CharB1Bis_Proxy75mmBarrel',
    'CharB1Bis_ProxyAPX4Turret',
    'CharB1Bis_ProxyCupola',
    'CharB1Bis_Proxy47mmBarrel',
    'ProxyLeftTrackLinks',
    'ProxyRoadWheels'
  ]) assert.ok(model.getObjectByName(name), `${name} missing`);
});

test('Char B1 bis core LOD retains a cheaper APX4 cupola identity', () => {
  const model = createCharB1BisMesh();
  setCalibrationLodVisibility(model, 'core');
  const cupola = model.getObjectByName('CharB1Bis_APX4Cupola');
  assert.equal(cupola.userData.lodBand, 'core');
  assert.equal(cupola.geometry.parameters.radialSegments, 8);
  assert.equal(isEffectivelyVisible(cupola, model), true);
  assert.equal(
    isEffectivelyVisible(model.getObjectByName('CharB1Bis_CupolaHatch'), model),
    false
  );
});
