import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_VEHICLE_VISUAL_CHECKS,
  evaluateVehicleVisualBundle
} from '../src/calibration/VehicleVisualEvaluator.js';
import {
  defineVehicleVisualBundle
} from '../src/calibration/VehicleVisualBundle.js';
import {
  FRANCE_1940_VEHICLE_VISUAL_BUNDLES
} from '../src/content/france1940/render/index.js';
import {
  FRANCE_1940_VEHICLES
} from '../src/content/france1940/vehicles.js';
import {
  HOTCHKISS_H39_VISUAL_DATA
} from '../src/content/france1940/vehicleData/HotchkissH39VisualData.js';
import {
  CHAR_B1_BIS_VISUAL_DATA
} from '../src/content/france1940/vehicleData/CharB1BisVisualData.js';
import {
  SOMUA_S35_VISUAL_DATA
} from '../src/content/france1940/vehicleData/SomuaS35VisualData.js';

const contractChecks = DEFAULT_VEHICLE_VISUAL_CHECKS.filter(check => (
  ['identity', 'assets', 'mesh-contract'].includes(check.id)
));

test('one generic bundle registry covers every France 1940 vehicle', () => {
  const expectedIds = Object.values(FRANCE_1940_VEHICLES)
    .map(vehicle => vehicle.modelId)
    .sort();
  assert.deepEqual(
    Object.keys(FRANCE_1940_VEHICLE_VISUAL_BUNDLES).sort(),
    expectedIds
  );

  for (const modelId of expectedIds) {
    const bundle = FRANCE_1940_VEHICLE_VISUAL_BUNDLES[modelId];
    assert.equal(bundle.modelId, modelId);
    assert.equal(bundle.vehicle, Object.values(FRANCE_1940_VEHICLES).find(
      vehicle => vehicle.modelId === modelId
    ));
    assert.equal(typeof bundle.createMesh, 'function');
    assert.ok(bundle.assets.surface);
    assert.ok(bundle.assets.blueprint);
  }
});

test('the same contract checks accept every registered vehicle bundle', () => {
  for (const bundle of Object.values(FRANCE_1940_VEHICLE_VISUAL_BUNDLES)) {
    const report = evaluateVehicleVisualBundle(bundle, {
      checks: contractChecks
    });
    assert.equal(
      report.pass,
      true,
      `${bundle.modelId}: ${report.failures.map(item => item.message).join('; ')}`
    );
    assert.deepEqual(report.executedChecks, contractChecks.map(check => check.id));
  }
});

test('SOMUA bundle owns the checked-in four-view source pixels', async () => {
  const bundle = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_somua;
  assert.equal(bundle.visualData, SOMUA_S35_VISUAL_DATA);
  assert.deepEqual(
    Object.keys(bundle.visualData.blueprint.views).sort(),
    ['front', 'rear', 'side', 'top']
  );
  const bytes = await readFile(
    new URL(`../public${bundle.visualData.blueprint.imageUrl}`, import.meta.url)
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    bundle.visualData.blueprint.sha256
  );
  const report = evaluateVehicleVisualBundle(bundle);
  assert.equal(
    report.pass,
    true,
    report.failures.map(item => `${item.checkId}: ${item.message}`).join('\n')
  );
  assert.deepEqual(
    Object.keys(report.metrics.blueprintViews).sort(),
    ['front', 'rear', 'side', 'top']
  );
});

test('H39 bundle injects the exact family-owned visual data without source-mechanics claims', () => {
  const bundle = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_hotchkiss_h39;
  assert.equal(bundle.visualData, HOTCHKISS_H39_VISUAL_DATA);
  assert.deepEqual(
    bundle.validation.requiredLodBands,
    HOTCHKISS_H39_VISUAL_DATA.validation.requiredLodBands
  );
  assert.equal(bundle.validation.sourceMechanics, undefined);

  const report = evaluateVehicleVisualBundle(bundle, {
    checks: contractChecks
  });
  assert.equal(
    report.pass,
    true,
    report.failures.map(item => `${item.checkId}: ${item.message}`).join('\n')
  );
  assert.deepEqual(report.executedChecks, [
    'identity',
    'assets',
    'mesh-contract'
  ]);
});

test('Char B1 bis bundle retains exact local-only registration data and supported tracks', () => {
  const bundle = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_char_b1bis;
  assert.equal(bundle.visualData, CHAR_B1_BIS_VISUAL_DATA);
  assert.deepEqual(bundle.validation, CHAR_B1_BIS_VISUAL_DATA.validation);
  assert.deepEqual(bundle.validation.requiredLodBands, ['high', 'medium', 'core', 'proxy']);
  assert.ok(bundle.validation.requiredParts.length >= 20);
  assert.ok(bundle.validation.closedParts.length >= 10);
  assert.equal(bundle.validation.sourceMechanics.track.minimumSupportCount, 22);
  assert.equal(bundle.validation.requiredBlueprintViews, undefined);
  assert.match(
    bundle.validation.inapplicableChecks.blueprintRegistration,
    /local-only/
  );
  assert.match(bundle.visualData.evidenceStatus, /local-only side\/front\/top drawing registration/);
  assert.equal(
    bundle.visualData.blueprint.sha256,
    'e4e52bad67f44066138824554c5df58952443479ed833dce67a24dd1631f7f61'
  );
  assert.equal(bundle.visualData.blueprint.localUploadRequired, true);
  assert.equal(Object.hasOwn(bundle.visualData.blueprint, 'imageUrl'), false);
  assert.deepEqual(
    Object.keys(bundle.visualData.blueprint.views).sort(),
    ['front', 'side', 'top']
  );

  const model = bundle.createMesh();
  const detail = model.userData.runningGear;
  const proxy = model.getObjectByName('CharB1BisAuthoredRunningGearProxy');
  assert.equal(detail.userData.trackPath.model, 'wheel-supported-quasi-static-v1');
  assert.equal(proxy.userData.trackPath.model, 'wheel-supported-quasi-static-v1');
  assert.deepEqual(detail.userData.trackPath.bounds, proxy.userData.trackPath.bounds);

  const report = evaluateVehicleVisualBundle(bundle);
  assert.equal(
    report.pass,
    true,
    report.failures.map(item => `${item.checkId}: ${item.message}`).join('\n')
  );
  assert.deepEqual(report.executedChecks, DEFAULT_VEHICLE_VISUAL_CHECKS.map(check => check.id));
  assert.equal(report.metrics.sourceMechanics.hullStationCount, 11);
  assert.equal(report.metrics.sourceMechanics.track.detail.supportCount, 22);
  assert.deepEqual(
    report.metrics.sourceMechanics.track.detail,
    report.metrics.sourceMechanics.track.proxy
  );
  assert.deepEqual(report.metrics.blueprintViews, {});
});

test('R35 bundle passes source registration, rigid envelope, topology, and mount checks', () => {
  const bundle = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_renault_r35;
  const report = evaluateVehicleVisualBundle(bundle);
  assert.equal(
    report.pass,
    true,
    report.failures.map(item => `${item.checkId}: ${item.message}`).join('\n')
  );
  assert.deepEqual(
    Object.keys(report.metrics.blueprintViews).sort(),
    ['front', 'side', 'top']
  );
  assert.equal(report.metrics.sourceMechanics.hullStationCount, 17);
  assert.deepEqual(
    {
      hullStationCount:
        report.metrics.sourceMechanics.sideProfile.hullStationCount,
      mudguardPointCount:
        report.metrics.sourceMechanics.sideProfile.mudguardPointCount,
      suspensionAssemblyCount:
        report.metrics.sourceMechanics.sideProfile.suspensionAssemblyCount,
      turretSectionCount:
        report.metrics.sourceMechanics.sideProfile.turretSectionCount
    },
    {
      hullStationCount: 17,
      mudguardPointCount: 13,
      suspensionAssemblyCount: 3,
      turretSectionCount: 8
    }
  );
  assert.equal(
    report.metrics.sourceMechanics.track.detail.model,
    'wheel-supported-quasi-static-v1'
  );
  assert.equal(report.metrics.sourceMechanics.track.detail.supportCount, 10);
  assert.equal(
    report.metrics.sourceMechanics.trackRegistration.registeredSupportCount,
    10
  );
  assert.equal(
    report.metrics.sourceMechanics.trackRegistration.view,
    'side'
  );
  assert.equal(
    report.metrics.sourceMechanics.sideProfile.hullTerminalPixelX,
    bundle.visualData.geometry.runningGear.trackPath.sourceRegistration
      .rigidFrontPixelX
  );
  assert.ok(
    report.metrics.sourceMechanics.frontProfile.cupolaCenterX > 0,
    'front source keeps the cupola on vehicle left'
  );
  assert.ok(
    report.metrics.sourceMechanics.frontProfile.cupolaRadius > 0.2
  );
  assert.deepEqual(
    report.metrics.sourceMechanics.track.detail,
    report.metrics.sourceMechanics.track.proxy
  );
  assert.equal(bundle.assets.blueprint.record.kind, 'calibration-reference-image');
  assert.equal(
    bundle.assets.blueprint.record.source.url,
    bundle.visualData.blueprint.imageUrl
  );
  assert.equal(
    bundle.visualData.blueprint.limitations.includes('secondary drawing'),
    true
  );
});

test('R35 blueprint bundle identifies the exact checked-in source pixels', async () => {
  const bundle = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_renault_r35;
  const bytes = await readFile(
    new URL(
      `../public${bundle.visualData.blueprint.imageUrl}`,
      import.meta.url
    )
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    bundle.visualData.blueprint.sha256
  );
  for (const view of ['side', 'front', 'top']) {
    const registration = bundle.visualData.blueprint.views[view];
    assert.ok(registration.cropPixels.width > 0);
    assert.ok(registration.cropPixels.height > 0);
    assert.ok(Object.keys(registration.landmarkPixels).length >= 5);
  }
});

test('vehicle visual evaluator accepts injected checks instead of hard-coding R35', () => {
  const source = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_renault_r35;
  const bundle = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData: source.visualData,
    validation: source.validation
  });
  let calls = 0;
  const report = evaluateVehicleVisualBundle(bundle, {
    checks: [{
      id: 'caller-owned-source-rule',
      evaluate(context) {
        calls += 1;
        return context.bundle.assets.blueprint.record.source.type === 'url'
          ? []
          : [{ checkId: 'caller-owned-source-rule', message: 'missing URL source' }];
      }
    }]
  });
  assert.equal(calls, 1);
  assert.equal(report.pass, true);
  assert.deepEqual(report.executedChecks, ['caller-owned-source-rule']);
});

test('source-mechanics plugin rejects disconnected track and unordered hull data', () => {
  const source = FRANCE_1940_VEHICLE_VISUAL_BUNDLES.fr_renault_r35;
  const check = DEFAULT_VEHICLE_VISUAL_CHECKS.find(
    candidate => candidate.id === 'source-mechanics'
  );
  const disconnectedTrack = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh() {
      const model = source.createMesh();
      model.getObjectByName('R35RunningGear').userData.trackPath = null;
      return model;
    },
    assets: source.assets,
    visualData: source.visualData,
    validation: source.validation
  });
  const trackReport = evaluateVehicleVisualBundle(disconnectedTrack, {
    checks: [check]
  });
  assert.equal(trackReport.pass, false);
  assert.ok(trackReport.failures.some(item => (
    item.message.includes('has no solved support path')
  )));

  const visualData = structuredClone(source.visualData);
  [
    visualData.geometry.hullStations[5],
    visualData.geometry.hullStations[6]
  ] = [
    visualData.geometry.hullStations[6],
    visualData.geometry.hullStations[5]
  ];
  const unorderedHull = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData,
    validation: source.validation
  });
  const hullReport = evaluateVehicleVisualBundle(unorderedHull, {
    checks: [check]
  });
  assert.equal(hullReport.pass, false);
  assert.ok(hullReport.failures.some(item => (
    item.message.includes('strictly ascending')
  )));

  const truncatedHullVisualData = structuredClone(source.visualData);
  truncatedHullVisualData.geometry.hullStations.splice(-1, 1);
  truncatedHullVisualData.geometry.sideSourceRegistration
    .hullDeckStations.splice(-1, 1);
  const truncatedHull = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData: truncatedHullVisualData,
    validation: source.validation
  });
  const truncatedHullReport = evaluateVehicleVisualBundle(
    truncatedHull,
    { checks: [check] }
  );
  assert.equal(truncatedHullReport.pass, false);
  assert.ok(truncatedHullReport.failures.some(item => (
    item.message.includes('requires at least 17 stations')
    || item.message.includes('terminal source pixel')
  )));

  const misregisteredVisualData = structuredClone(source.visualData);
  misregisteredVisualData.geometry.runningGear.trackPath.roadWheels[0]
    .sourcePixels[0] += 12;
  const misregisteredSupport = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData: misregisteredVisualData,
    validation: source.validation
  });
  const registrationReport = evaluateVehicleVisualBundle(
    misregisteredSupport,
    { checks: [check] }
  );
  assert.equal(registrationReport.pass, false);
  assert.ok(registrationReport.failures.some(item => (
    item.message.includes('diverges from source registration')
  )));

  const shiftedMudguardVisualData = structuredClone(source.visualData);
  shiftedMudguardVisualData.geometry.mudguard.outline[0][1] += 0.08;
  const shiftedMudguard = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData: shiftedMudguardVisualData,
    validation: source.validation
  });
  const mudguardReport = evaluateVehicleVisualBundle(
    shiftedMudguard,
    { checks: [check] }
  );
  assert.equal(mudguardReport.pass, false);
  assert.ok(mudguardReport.failures.some(item => (
    item.message.includes('mudguard point 0')
  )));

  const shiftedSuspensionVisualData = structuredClone(source.visualData);
  shiftedSuspensionVisualData.geometry.suspension
    .assemblies[0].springPack.centerY += 0.08;
  const shiftedSuspension = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData: shiftedSuspensionVisualData,
    validation: source.validation
  });
  const suspensionReport = evaluateVehicleVisualBundle(
    shiftedSuspension,
    { checks: [check] }
  );
  assert.equal(suspensionReport.pass, false);
  assert.ok(suspensionReport.failures.some(item => (
    item.message.includes('leading-single-wheel spring pack')
  )));

  const shiftedCupolaVisualData = structuredClone(source.visualData);
  shiftedCupolaVisualData.geometry.turret.cupola.centerX -= 0.08;
  const shiftedCupola = defineVehicleVisualBundle({
    modelId: source.modelId,
    vehicle: source.vehicle,
    profile: source.profile,
    calibration: source.calibration,
    createMesh: source.createMesh,
    assets: source.assets,
    visualData: shiftedCupolaVisualData,
    validation: source.validation
  });
  const cupolaReport = evaluateVehicleVisualBundle(
    shiftedCupola,
    { checks: [check] }
  );
  assert.equal(cupolaReport.pass, false);
  assert.ok(cupolaReport.failures.some(item => (
    item.message.includes('cupola diverges from front source registration')
  )));
});
