import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import {
  VEHICLE_VISUAL_PROFILES
} from '../src/world/vehicles/VehicleVisualProfiles.js';
import {
  createVehicleSilhouetteManifest,
  validateBaselineReportSchema,
  compareSilhouetteAuditWithBaseline,
  SILHOUETTE_AUDIT_SCHEMA_VERSION,
  CANONICAL_AUDIT_VIEWS,
  CANONICAL_AUDIT_LODS,
  DEFAULT_RENDER_CONFIG,
  normalizeSvgForHash,
  hashSvgContent,
  getExpectedViewBounds
} from '../src/calibration/VehicleSilhouetteAudit.js';

const execFileAsync = promisify(execFile);
const baselinePath = resolve('./test/fixtures/vehicle-silhouette-baseline.json');

test('vehicle silhouette audit generates valid manifest structure and same-process determinism', () => {
  const manifest1 = createVehicleSilhouetteManifest({
    profiles: VEHICLE_VISUAL_PROFILES,
    meshFactories: FRANCE_1940_VEHICLE_MESH_FACTORIES
  });

  const manifest2 = createVehicleSilhouetteManifest({
    profiles: VEHICLE_VISUAL_PROFILES,
    meshFactories: FRANCE_1940_VEHICLE_MESH_FACTORIES
  });

  // Same-process full-manifest determinism
  assert.deepEqual(manifest1, manifest2, 'Two sequential manifest generations in the same process must be byte/object identical');

  assert.equal(manifest1.schemaVersion, SILHOUETTE_AUDIT_SCHEMA_VERSION);
  assert.equal(manifest1.vehicleCount, 15);
  assert.equal(manifest1.recordCount, 180);
  assert.deepEqual(manifest1.views, CANONICAL_AUDIT_VIEWS.slice());
  assert.deepEqual(manifest1.lods, CANONICAL_AUDIT_LODS.slice());
  assert.deepEqual(manifest1.renderConfig, DEFAULT_RENDER_CONFIG);

  // Exact registered vehicle-ID coverage
  const expectedProfileIds = Object.keys(VEHICLE_VISUAL_PROFILES).sort();
  const recordModelIds = Array.from(new Set(Object.values(manifest1.records).map(r => r.modelId))).sort();
  assert.deepEqual(recordModelIds, expectedProfileIds, 'Record model IDs must exactly match registered profile IDs');
  assert.equal(recordModelIds.length, 15);

  const keys = Object.keys(manifest1.records);
  assert.equal(keys.length, 180);

  for (const key of keys) {
    const rec = manifest1.records[key];
    assert.equal(rec.key, key);
    assert.ok(expectedProfileIds.includes(rec.modelId), `Record modelId ${rec.modelId} must belong to registered profile IDs`);
    assert.ok(rec.triangleCount > 0);
    assert.ok(rec.svgHash && rec.svgHash.length === 64);

    const b = rec.projectedBoundsMeters;
    assert.ok(b);
    assert.ok(Number.isFinite(b.minU));
    assert.ok(Number.isFinite(b.maxU));
    assert.ok(Number.isFinite(b.minV));
    assert.ok(Number.isFinite(b.maxV));
    assert.ok(Number.isFinite(b.width) && b.width > 0);
    assert.ok(Number.isFinite(b.height) && b.height > 0);
    assert.ok(b.maxU > b.minU);
    assert.ok(b.maxV > b.minV);
    assert.ok(Math.abs((b.maxU - b.minU) - b.width) < 1e-3);
    assert.ok(Math.abs((b.maxV - b.minV) - b.height) < 1e-3);
  }
});

test('preflight validation rejects empty, array, or nonfunction registries with ZERO factory calls', () => {
  let callCount = 0;
  const instrumentedFactories = {};
  for (const [id, fn] of Object.entries(FRANCE_1940_VEHICLE_MESH_FACTORIES)) {
    instrumentedFactories[id] = (...args) => {
      callCount++;
      return fn(...args);
    };
  }

  // Case 1: Empty objects
  callCount = 0;
  const resEmptyObj = createVehicleSilhouetteManifest({ profiles: {}, meshFactories: {} });
  assert.equal(callCount, 0);
  assert.equal(resEmptyObj.recordCount, 0);
  assert.ok(resEmptyObj.failures.some(f => f.includes('empty')));

  // Case 2: Arrays
  callCount = 0;
  const resArray = createVehicleSilhouetteManifest({ profiles: [], meshFactories: [] });
  assert.equal(callCount, 0);
  assert.equal(resArray.recordCount, 0);
  assert.ok(resArray.failures.some(f => f.includes('non-array object dictionary')));

  // Case 3: Nonfunction factory
  callCount = 0;
  const nonfuncFactories = { ...instrumentedFactories, fr_somua: null };
  const resNonfunc = createVehicleSilhouetteManifest({
    profiles: VEHICLE_VISUAL_PROFILES,
    meshFactories: nonfuncFactories
  });
  assert.equal(callCount, 0);
  assert.equal(resNonfunc.recordCount, 0);
  assert.ok(resNonfunc.failures.some(f => f.includes('Factory for vehicle fr_somua is not a function')));

  // Case 4: Object nonfunction factory
  callCount = 0;
  const objFactories = { ...instrumentedFactories, fr_somua: {} };
  const resObjFn = createVehicleSilhouetteManifest({
    profiles: VEHICLE_VISUAL_PROFILES,
    meshFactories: objFactories
  });
  assert.equal(callCount, 0);
  assert.equal(resObjFn.recordCount, 0);
  assert.ok(resObjFn.failures.some(f => f.includes('Factory for vehicle fr_somua is not a function')));
});

test('every registered vehicle LOD stays inside its exact orthographic envelope', () => {
  const manifest = createVehicleSilhouetteManifest({
    profiles: VEHICLE_VISUAL_PROFILES,
    meshFactories: FRANCE_1940_VEHICLE_MESH_FACTORIES
  });

  assert.deepEqual(manifest.failures, []);
});

test('getExpectedViewBounds returns exact view-specific rigid envelope coordinates', () => {
  const dims = { length: 4.0, width: 2.0, height: 1.5 };

  assert.deepEqual(getExpectedViewBounds(dims, 'side'), {
    minU: -2.0, maxU: 2.0, minV: 0, maxV: 1.5
  });

  assert.deepEqual(getExpectedViewBounds(dims, 'front'), {
    minU: -1.0, maxU: 1.0, minV: 0, maxV: 1.5
  });

  assert.deepEqual(getExpectedViewBounds(dims, 'top'), {
    minU: -1.0, maxU: 1.0, minV: -2.0, maxV: 2.0
  });

  assert.throws(() => getExpectedViewBounds(dims, 'invalid_view'), /Unknown view/);
});

test('SVG normalization throws for non-string or empty input and preserves leading content', () => {
  assert.throws(() => normalizeSvgForHash(null), TypeError);
  assert.throws(() => normalizeSvgForHash(123), TypeError);
  assert.throws(() => normalizeSvgForHash({}), TypeError);
  assert.throws(() => normalizeSvgForHash('   \n\r\t  '), Error);

  const raw = '  <svg>\r\n  <g></g>\r\n</svg>  \r\n\r\n';
  const norm = normalizeSvgForHash(raw);

  assert.ok(norm.startsWith('  <svg>\n'));
  assert.ok(norm.endsWith('</svg>\n'));

  const rawDiffLeading = '    <svg>\r\n  <g></g>\r\n</svg>  \r\n';
  assert.notEqual(hashSvgContent(raw), hashSvgContent(rawDiffLeading));
});

test('validateBaselineReportSchema enforces exact top keys, canonical view order, dimension drift, and matrix completeness', async () => {
  const validBase = {
    schemaVersion: SILHOUETTE_AUDIT_SCHEMA_VERSION,
    vehicleCount: 1,
    recordCount: 12,
    views: CANONICAL_AUDIT_VIEWS.slice(),
    lods: CANONICAL_AUDIT_LODS.slice(),
    renderConfig: DEFAULT_RENDER_CONFIG,
    failures: [],
    records: {}
  };

  for (const view of CANONICAL_AUDIT_VIEWS) {
    for (const lod of CANONICAL_AUDIT_LODS) {
      const key = `fr_somua:${view}:${lod}`;
      validBase.records[key] = {
        key,
        modelId: 'fr_somua',
        designation: 'SOMUA S35',
        view,
        lod,
        triangleCount: 1000,
        projectedBoundsMeters: { minU: -2.69, maxU: 2.69, minV: 0, maxV: 2.62, width: 5.38, height: 2.62 },
        svgHash: '1111111111111111111111111111111111111111111111111111111111111111'
      };
    }
  }

  assert.equal(validateBaselineReportSchema(validBase).valid, true);

  // The checked-in fixture is a reviewed schema 1.1.0 baseline.
  const baselineBytes = await readFile(baselinePath, 'utf8');
  const baselineFixture = JSON.parse(baselineBytes);
  assert.deepEqual(validateBaselineReportSchema(baselineFixture), {
    valid: true,
    errors: []
  });

  // 1. Non-canonical view order (must fail exact view order)
  const badViewOrder = JSON.parse(JSON.stringify(validBase));
  badViewOrder.views = ['top', 'side', 'front'];
  assert.equal(validateBaselineReportSchema(badViewOrder).valid, false);

  // 2. Render dimensions drift
  const badWidth = JSON.parse(JSON.stringify(validBase));
  badWidth.renderConfig.width = 701;
  assert.equal(validateBaselineReportSchema(badWidth).valid, false);

  const badHeight = JSON.parse(JSON.stringify(validBase));
  badHeight.renderConfig.height = 451;
  assert.equal(validateBaselineReportSchema(badHeight).valid, false);

  // 3. Unknown top-level key
  const badTopKey = JSON.parse(JSON.stringify(validBase));
  badTopKey.unexpected = true;
  assert.equal(validateBaselineReportSchema(badTopKey).valid, false);

  // 4. Split IDs matrix mismatch (12 records across 12 different model IDs but vehicleCount is 1)
  const splitIds = JSON.parse(JSON.stringify(validBase));
  splitIds.records = {};
  for (let i = 0; i < 12; i++) {
    const id = `model_${i}`;
    const key = `${id}:side:high`;
    splitIds.records[key] = {
      key,
      modelId: id,
      designation: `Model ${i}`,
      view: 'side',
      lod: 'high',
      triangleCount: 100,
      projectedBoundsMeters: { minU: -1, maxU: 1, minV: 0, maxV: 1, width: 2, height: 1 },
      svgHash: '1111111111111111111111111111111111111111111111111111111111111111'
    };
  }
  assert.equal(validateBaselineReportSchema(splitIds).valid, false);

  // 5. Incomplete matrix (missing cell fr_somua:side:high, replaced with duplicate key)
  const incompleteMatrix = JSON.parse(JSON.stringify(validBase));
  delete incompleteMatrix.records['fr_somua:side:high'];
  incompleteMatrix.records['fr_somua:top:high_dup'] = {
    key: 'fr_somua:top:high_dup',
    modelId: 'fr_somua',
    designation: 'SOMUA S35',
    view: 'top',
    lod: 'high',
    triangleCount: 1000,
    projectedBoundsMeters: { minU: -1, maxU: 1, minV: 0, maxV: 1, width: 2, height: 1 },
    svgHash: '1111111111111111111111111111111111111111111111111111111111111111'
  };
  assert.equal(validateBaselineReportSchema(incompleteMatrix).valid, false);
});

test('baseline comparator tests missing key, extra key, triangle count, svgHash, metric regressions, and malformed baseline rejection', () => {
  const mockBase = {
    schemaVersion: SILHOUETTE_AUDIT_SCHEMA_VERSION,
    vehicleCount: 1,
    recordCount: 12,
    views: CANONICAL_AUDIT_VIEWS.slice(),
    lods: CANONICAL_AUDIT_LODS.slice(),
    renderConfig: DEFAULT_RENDER_CONFIG,
    failures: [],
    records: {}
  };

  for (const view of CANONICAL_AUDIT_VIEWS) {
    for (const lod of CANONICAL_AUDIT_LODS) {
      const key = `fr_somua:${view}:${lod}`;
      mockBase.records[key] = {
        key,
        modelId: 'fr_somua',
        designation: 'SOMUA S35',
        view,
        lod,
        triangleCount: 1000,
        projectedBoundsMeters: { minU: -2.69, maxU: 2.69, minV: 0, maxV: 2.62, width: 5.38, height: 2.62 },
        svgHash: '1111111111111111111111111111111111111111111111111111111111111111'
      };
    }
  }

  // 1. Malformed baseline schema passed into comparator
  const malformedBase = JSON.parse(JSON.stringify(mockBase));
  malformedBase.views = ['top', 'side', 'front']; // non-canonical order
  const resMalformed = compareSilhouetteAuditWithBaseline(mockBase, malformedBase);
  assert.equal(resMalformed.pass, false);
  assert.ok(resMalformed.differences.some(d => d.startsWith('Baseline schema validation error:')));

  // 2. Keyed SVG-hash regression
  const alteredHash = JSON.parse(JSON.stringify(mockBase));
  alteredHash.records['fr_somua:side:high'].svgHash = '2222222222222222222222222222222222222222222222222222222222222222';
  const resHash = compareSilhouetteAuditWithBaseline(alteredHash, mockBase);
  assert.equal(resHash.pass, false);
  assert.ok(resHash.differences.some(d => d.includes('fr_somua:side:high') && d.includes('svgHash mismatch') && d.includes('2222')));

  // 3. Altered triangle count
  const alteredTri = JSON.parse(JSON.stringify(mockBase));
  alteredTri.records['fr_somua:side:high'].triangleCount = 9999;
  const resTri = compareSilhouetteAuditWithBaseline(alteredTri, mockBase);
  assert.equal(resTri.pass, false);
  assert.ok(resTri.differences.some(d => d.includes('fr_somua:side:high') && d.includes('triangleCount mismatch') && d.includes('9999')));

  // 4. Altered projected metric
  const alteredMetric = JSON.parse(JSON.stringify(mockBase));
  alteredMetric.records['fr_somua:side:high'].projectedBoundsMeters.minU = -3.50;
  const resMetric = compareSilhouetteAuditWithBaseline(alteredMetric, mockBase);
  assert.equal(resMetric.pass, false);
  assert.ok(resMetric.differences.some(d => d.includes('fr_somua:side:high') && d.includes('projectedBoundsMeters.minU mismatch') && d.includes('-3.5')));

  // 5. Extra key
  const extraKeyGen = JSON.parse(JSON.stringify(mockBase));
  extraKeyGen.records['extra_tank:side:high'] = {
    key: 'extra_tank:side:high',
    modelId: 'extra_tank',
    designation: 'Extra Tank',
    view: 'side',
    lod: 'high',
    triangleCount: 100,
    projectedBoundsMeters: { minU: -1, maxU: 1, minV: 0, maxV: 1, width: 2, height: 1 },
    svgHash: '2222222222222222222222222222222222222222222222222222222222222222'
  };
  const resExtraKey = compareSilhouetteAuditWithBaseline(extraKeyGen, mockBase);
  assert.equal(resExtraKey.pass, false);
  assert.ok(resExtraKey.differences.some(d => d.includes('Extra key in generated audit: extra_tank:side:high')));

  // 6. Missing key
  const missingKeyGen = JSON.parse(JSON.stringify(mockBase));
  delete missingKeyGen.records['fr_somua:side:high'];
  const resMissingKey = compareSilhouetteAuditWithBaseline(missingKeyGen, mockBase);
  assert.equal(resMissingKey.pass, false);
  assert.ok(resMissingKey.differences.some(d => d.includes('Missing key in generated audit: fr_somua:side:high')));
});

test('CLI script enforces error handling, missing TMPDIR validation, and baseline preservation', async () => {
  const baseTmp = tmpdir();
  const testDir = await mkdtemp(join(baseTmp, 'vehicle-silhouette-test-'));

  try {
    const outA = join(testDir, 'audit-a.json');
    const outB = join(testDir, 'audit-b.json');
    const scriptPath = resolve('./scripts/audit-vehicle-silhouettes.mjs');

    const initialBaselineBytes = await readFile(baselinePath, 'utf8');

    // Fast CLI argument preflight rejections (<50ms each)
    await assert.rejects(
      execFileAsync('node', [scriptPath, '--bogus-flag']),
      (err) => (err.code === 1 || err.exitCode === 1) && err.stderr.includes('Unknown CLI flag')
    );

    await assert.rejects(
      execFileAsync('node', [scriptPath, outA, outB]),
      (err) => (err.code === 1 || err.exitCode === 1) && err.stderr.includes('Multiple positional destination')
    );

    await assert.rejects(
      execFileAsync('node', [scriptPath, '--update-baseline', outA]),
      (err) => (err.code === 1 || err.exitCode === 1) && err.stderr.includes('combined with --update-baseline')
    );

    await assert.rejects(
      execFileAsync('node', [scriptPath], { env: { ...process.env, TMPDIR: '' } }),
      (err) => (err.code === 1 || err.exitCode === 1) && err.stderr.includes('Environment variable TMPDIR must be set')
    );

    // Unwritable destination propagates write error, exits nonzero, logs specific stderr error, produces NO target file and NO success line
    const readOnlyDir = join(testDir, 'read-only-dir');
    await mkdir(readOnlyDir, { mode: 0o444 });
    const targetInReadOnly = join(readOnlyDir, 'nested', 'audit.json');

    await assert.rejects(
      execFileAsync('node', [scriptPath, targetInReadOnly]),
      (err) => {
        const isCodeOne = (err.code === 1 || err.exitCode === 1);
        const hasStderrError = err.stderr && (err.stderr.includes('EACCES') || err.stderr.includes('EPERM') || err.stderr.includes('mkdir') || err.stderr.includes('atomic') || err.stderr.includes('write'));
        const hasNoSuccessLine = !err.stdout || !err.stdout.includes('records) ->');
        return isCodeOne && hasStderrError && hasNoSuccessLine;
      }
    );

    await assert.rejects(access(targetInReadOnly), 'Target file in unwritable directory must not exist');

    // Full process execution: both outputs must match the reviewed baseline.
    const runA = await execFileAsync('node', [scriptPath, outA]);
    const runB = await execFileAsync('node', [scriptPath, outB]);

    // Normal audit runs never modify the baseline fixture.
    const postAuditBaselineBytes = await readFile(baselinePath, 'utf8');
    assert.equal(initialBaselineBytes, postAuditBaselineBytes, 'Baseline fixture bytes must remain unchanged during normal audits');

    // Assert that written candidate files compare byte-for-byte identically
    const contentA = await readFile(outA, 'utf8');
    const contentB = await readFile(outB, 'utf8');
    assert.equal(contentA, contentB, 'Fresh-process audit outputs must be byte-for-byte identical');
    const recordCount = JSON.parse(contentA).recordCount;
    assert.match(runA.stdout, new RegExp(`\\(${recordCount}/${recordCount} records match\\)`));
    assert.match(runB.stdout, new RegExp(`\\(${recordCount}/${recordCount} records match\\)`));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});
