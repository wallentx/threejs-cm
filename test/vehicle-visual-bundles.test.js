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
