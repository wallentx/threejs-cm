import { createHash } from 'node:crypto';
import { UnitFactory } from '../world/UnitFactory.js';
import {
  detachNestedProxyMeshes,
  setCalibrationLodVisibility
} from './CalibrationModel.js';
import { renderVehicleSilhouetteSvg } from './SoftwareSilhouette.js';

export const SILHOUETTE_AUDIT_SCHEMA_VERSION = '1.1.0';

export const CANONICAL_AUDIT_VIEWS = Object.freeze(['front', 'side', 'top']);
export const CANONICAL_AUDIT_LODS = Object.freeze(['high', 'medium', 'core', 'proxy']);
export const ENVELOPE_EPSILON_METERS = 0.01;

export const DEFAULT_RENDER_CONFIG = Object.freeze({
  width: 700,
  height: 450,
  background: '#ffffff',
  silhouette: '#101820',
  showEnvelope: false,
  wireframe: false,
  metricPrecision: 4,
  envelopeEpsilonMeters: ENVELOPE_EPSILON_METERS,
  svgNormalization: 'crlf-to-lf-and-trailing-trim'
});

const EXPECTED_TOP_LEVEL_KEYS = Object.freeze([
  'failures',
  'lods',
  'recordCount',
  'records',
  'renderConfig',
  'schemaVersion',
  'vehicleCount',
  'views'
].sort());

export function normalizeSvgForHash(svgContent) {
  if (typeof svgContent !== 'string') {
    throw new TypeError('SVG content must be a string');
  }
  const lfOnly = svgContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalized = lfOnly.replace(/\s+$/, '') + '\n';
  if (normalized.trim().length === 0) {
    throw new Error('SVG content cannot be empty or whitespace-only');
  }
  return normalized;
}

export function hashSvgContent(svgContent) {
  const normalized = normalizeSvgForHash(svgContent);
  return createHash('sha256').update(normalized).digest('hex');
}

export function roundMetric(value, precision = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  return Number(value.toFixed(precision));
}

export function roundBoundsMeters(bounds, precision = 4) {
  if (!bounds) return null;
  return {
    minU: roundMetric(bounds.minU, precision),
    maxU: roundMetric(bounds.maxU, precision),
    minV: roundMetric(bounds.minV, precision),
    maxV: roundMetric(bounds.maxV, precision),
    width: roundMetric(bounds.width, precision),
    height: roundMetric(bounds.height, precision)
  };
}

export function getExpectedViewBounds(dimensionsMeters, view) {
  const { length, width, height } = dimensionsMeters;
  if (view === 'side') {
    return {
      minU: -length * 0.5,
      maxU: length * 0.5,
      minV: 0,
      maxV: height
    };
  }
  if (view === 'front') {
    return {
      minU: -width * 0.5,
      maxU: width * 0.5,
      minV: 0,
      maxV: height
    };
  }
  if (view === 'top') {
    return {
      minU: -width * 0.5,
      maxU: width * 0.5,
      minV: -length * 0.5,
      maxV: length * 0.5
    };
  }
  throw new Error(`Unknown view: ${view}`);
}

export function createVehicleSilhouetteManifest({
  profiles,
  meshFactories,
  width = DEFAULT_RENDER_CONFIG.width,
  height = DEFAULT_RENDER_CONFIG.height,
  views = CANONICAL_AUDIT_VIEWS,
  lods = CANONICAL_AUDIT_LODS
}) {
  const failures = [];

  // Preflight check 1: Input types (non-null, non-array object dictionaries)
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    failures.push('createVehicleSilhouetteManifest requires a non-array object dictionary of profiles');
  }
  if (!meshFactories || typeof meshFactories !== 'object' || Array.isArray(meshFactories)) {
    failures.push('createVehicleSilhouetteManifest requires a non-array object dictionary of meshFactories');
  }

  // Preflight check 2: Non-empty registries
  const profileKeys = (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) ? Object.keys(profiles).sort() : [];
  const factoryKeys = (meshFactories && typeof meshFactories === 'object' && !Array.isArray(meshFactories)) ? Object.keys(meshFactories).sort() : [];

  if (profileKeys.length === 0) {
    failures.push('Profiles registry cannot be empty');
  }
  if (factoryKeys.length === 0) {
    failures.push('Mesh factories registry cannot be empty');
  }

  // Preflight check 3: Viewport dimensions
  if (!Number.isInteger(width) || width <= 0) {
    failures.push(`Width must be a positive integer, received ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    failures.push(`Height must be a positive integer, received ${height}`);
  }

  // Preflight check 4: Views array (canonical order)
  if (!Array.isArray(views)) {
    failures.push('Views must be an array');
  } else {
    if (views.length !== CANONICAL_AUDIT_VIEWS.length || !CANONICAL_AUDIT_VIEWS.every((v, i) => views[i] === v)) {
      failures.push(`Input views [${views.join(', ')}] do not match canonical views [${CANONICAL_AUDIT_VIEWS.join(', ')}]`);
    }
  }

  // Preflight check 5: LODs array (canonical order)
  if (!Array.isArray(lods)) {
    failures.push('LODs must be an array');
  } else {
    if (lods.length !== CANONICAL_AUDIT_LODS.length || !CANONICAL_AUDIT_LODS.every((l, i) => lods[i] === l)) {
      failures.push(`Input lods [${lods.join(', ')}] do not match canonical lods [${CANONICAL_AUDIT_LODS.join(', ')}]`);
    }
  }

  // Preflight check 6: Factory callable checks & Profile/Factory parity
  if (profileKeys.length > 0 && factoryKeys.length > 0) {
    const missingFactories = profileKeys.filter(id => !factoryKeys.includes(id));
    const extraFactories = factoryKeys.filter(id => !profileKeys.includes(id));

    if (missingFactories.length > 0) {
      failures.push(`Missing mesh factories for profiles: ${missingFactories.join(', ')}`);
    }
    if (extraFactories.length > 0) {
      failures.push(`Extra unregistered mesh factories: ${extraFactories.join(', ')}`);
    }

    for (const id of factoryKeys) {
      if (typeof meshFactories[id] !== 'function') {
        failures.push(`Factory for vehicle ${id} is not a function`);
      }
    }

    for (const modelId of profileKeys) {
      const p = profiles[modelId];
      if (!p || typeof p !== 'object') {
        failures.push(`Profile for ${modelId} is null or not an object`);
        continue;
      }
      if (!p.designation || typeof p.designation !== 'string' || p.designation.trim() === '') {
        failures.push(`Profile ${modelId} has missing or empty designation`);
      }
      const dims = p.dimensionsMeters;
      if (!dims || !Number.isFinite(dims.length) || !Number.isFinite(dims.width) || !Number.isFinite(dims.height)
          || dims.length <= 0 || dims.width <= 0 || dims.height <= 0) {
        failures.push(`Vehicle ${modelId} has invalid dimensionsMeters`);
      }
    }
  }

  const renderConfig = Object.freeze({
    ...DEFAULT_RENDER_CONFIG,
    width,
    height
  });

  // ZERO FACTORY CALLS RULE: If any preflight validation fails, exit BEFORE model loop
  if (failures.length > 0) {
    return {
      schemaVersion: SILHOUETTE_AUDIT_SCHEMA_VERSION,
      vehicleCount: profileKeys.length,
      views: CANONICAL_AUDIT_VIEWS.slice(),
      lods: CANONICAL_AUDIT_LODS.slice(),
      renderConfig,
      recordCount: 0,
      failures,
      records: {}
    };
  }

  const records = {};

  for (const modelId of profileKeys) {
    const profile = profiles[modelId];
    const factory = meshFactories[modelId];

    const model = UnitFactory.createTankMesh(modelId, meshFactories);
    detachNestedProxyMeshes(model);

    const dims = profile.dimensionsMeters;

    for (const view of CANONICAL_AUDIT_VIEWS) {
      for (const lod of CANONICAL_AUDIT_LODS) {
        const key = `${modelId}:${view}:${lod}`;
        if (records[key]) {
          failures.push(`Duplicate record key: ${key}`);
          continue;
        }

        setCalibrationLodVisibility(model, lod);
        const { svg, manifest } = renderVehicleSilhouetteSvg(
          model,
          dims,
          view,
          {
            width: renderConfig.width,
            height: renderConfig.height,
            showEnvelope: renderConfig.showEnvelope,
            background: renderConfig.background,
            silhouette: renderConfig.silhouette,
            wireframe: renderConfig.wireframe
          }
        );

        const triangleCount = manifest.triangleCount;
        const bounds = manifest.projectedBoundsMeters;

        if (triangleCount <= 0) {
          failures.push(`${key} produced empty silhouette (triangleCount = ${triangleCount})`);
        }

        if (!bounds
            || !Number.isFinite(bounds.minU) || !Number.isFinite(bounds.maxU)
            || !Number.isFinite(bounds.minV) || !Number.isFinite(bounds.maxV)
            || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)
            || bounds.maxU <= bounds.minU || bounds.maxV <= bounds.minV
            || bounds.width <= 0 || bounds.height <= 0) {
          failures.push(`${key} produced non-finite or invalid projected bounds meters`);
        } else {
          const derivedWidth = bounds.maxU - bounds.minU;
          const derivedHeight = bounds.maxV - bounds.minV;
          if (Math.abs(derivedWidth - bounds.width) > 1e-4 || Math.abs(derivedHeight - bounds.height) > 1e-4) {
            failures.push(`${key} projected bounds width/height mismatch derived extents`);
          }

          const expected = getExpectedViewBounds(dims, view);
          const eps = renderConfig.envelopeEpsilonMeters;

          if (bounds.minU < expected.minU - eps) {
            const overflow = expected.minU - bounds.minU;
            failures.push(`${key} minU bound out of envelope (expected minU ${expected.minU}m +/- ${eps}m, actual minU ${bounds.minU}m, overflow ${overflow.toFixed(4)}m)`);
          }
          if (bounds.maxU > expected.maxU + eps) {
            const overflow = bounds.maxU - expected.maxU;
            failures.push(`${key} maxU bound out of envelope (expected maxU ${expected.maxU}m +/- ${eps}m, actual maxU ${bounds.maxU}m, overflow ${overflow.toFixed(4)}m)`);
          }
          if (bounds.minV < expected.minV - eps) {
            const overflow = expected.minV - bounds.minV;
            failures.push(`${key} minV bound out of envelope (expected minV ${expected.minV}m +/- ${eps}m, actual minV ${bounds.minV}m, overflow ${overflow.toFixed(4)}m)`);
          }
          if (bounds.maxV > expected.maxV + eps) {
            const overflow = bounds.maxV - expected.maxV;
            failures.push(`${key} maxV bound out of envelope (expected maxV ${expected.maxV}m +/- ${eps}m, actual maxV ${bounds.maxV}m, overflow ${overflow.toFixed(4)}m)`);
          }
        }

        const roundedBounds = roundBoundsMeters(bounds, renderConfig.metricPrecision);
        const svgHash = hashSvgContent(svg);

        records[key] = {
          key,
          modelId,
          designation: profile.designation,
          view,
          lod,
          triangleCount,
          projectedBoundsMeters: roundedBounds,
          svgHash
        };
      }
    }
  }

  const recordKeys = Object.keys(records).sort();
  const sortedRecords = {};
  for (const key of recordKeys) {
    sortedRecords[key] = records[key];
  }

  return {
    schemaVersion: SILHOUETTE_AUDIT_SCHEMA_VERSION,
    vehicleCount: profileKeys.length,
    views: CANONICAL_AUDIT_VIEWS.slice(),
    lods: CANONICAL_AUDIT_LODS.slice(),
    renderConfig,
    recordCount: Object.keys(sortedRecords).length,
    failures,
    records: sortedRecords
  };
}

export function validateBaselineReportSchema(baselineReport) {
  const errors = [];

  if (!baselineReport || typeof baselineReport !== 'object' || Array.isArray(baselineReport)) {
    return { valid: false, errors: ['Baseline report is missing, null, or not an object'] };
  }

  // Exact top-level key set check
  const topKeys = Object.keys(baselineReport).sort();
  if (topKeys.length !== EXPECTED_TOP_LEVEL_KEYS.length || !EXPECTED_TOP_LEVEL_KEYS.every(k => topKeys.includes(k))) {
    errors.push(`Baseline contains invalid or unexpected top-level keys [${topKeys.join(', ')}]`);
  }

  if (baselineReport.schemaVersion !== SILHOUETTE_AUDIT_SCHEMA_VERSION) {
    errors.push(`Baseline schema version mismatch: expected ${SILHOUETTE_AUDIT_SCHEMA_VERSION}, received ${baselineReport.schemaVersion}`);
  }

  if (!Number.isInteger(baselineReport.vehicleCount) || baselineReport.vehicleCount <= 0) {
    errors.push(`Baseline vehicleCount must be a positive integer, received ${baselineReport.vehicleCount}`);
  }

  // Canonical views validation (exact order)
  if (!Array.isArray(baselineReport.views)) {
    errors.push('Baseline views must be an array');
  } else {
    if (baselineReport.views.length !== CANONICAL_AUDIT_VIEWS.length || !CANONICAL_AUDIT_VIEWS.every((v, i) => baselineReport.views[i] === v)) {
      errors.push(`Baseline views [${baselineReport.views.join(', ')}] do not match canonical views [${CANONICAL_AUDIT_VIEWS.join(', ')}]`);
    }
  }

  // Canonical LODs validation (exact order)
  if (!Array.isArray(baselineReport.lods)) {
    errors.push('Baseline lods must be an array');
  } else {
    if (baselineReport.lods.length !== CANONICAL_AUDIT_LODS.length || !CANONICAL_AUDIT_LODS.every((l, i) => baselineReport.lods[i] === l)) {
      errors.push(`Baseline lods [${baselineReport.lods.join(', ')}] do not match canonical lods [${CANONICAL_AUDIT_LODS.join(', ')}]`);
    }
  }

  // Exact renderConfig validation (must match DEFAULT_RENDER_CONFIG exactly)
  if (!baselineReport.renderConfig || typeof baselineReport.renderConfig !== 'object' || Array.isArray(baselineReport.renderConfig)) {
    errors.push('Baseline renderConfig must be an object');
  } else {
    const expectedKeys = Object.keys(DEFAULT_RENDER_CONFIG).sort();
    const reportKeys = Object.keys(baselineReport.renderConfig).sort();

    if (reportKeys.length !== expectedKeys.length || !expectedKeys.every(k => reportKeys.includes(k))) {
      errors.push(`Baseline renderConfig keys [${reportKeys.join(', ')}] do not match expected keys [${expectedKeys.join(', ')}]`);
    } else {
      for (const key of expectedKeys) {
        if (baselineReport.renderConfig[key] !== DEFAULT_RENDER_CONFIG[key]) {
          errors.push(`Baseline renderConfig.${key} value mismatch: expected ${DEFAULT_RENDER_CONFIG[key]}, received ${baselineReport.renderConfig[key]}`);
        }
      }
    }
  }

  // Failures list validation (must be empty array)
  if (!Array.isArray(baselineReport.failures)) {
    errors.push('Baseline failures must be an array');
  } else if (baselineReport.failures.length > 0) {
    errors.push(`Baseline report contains failure entries: ${baselineReport.failures.join('; ')}`);
  }

  // Records dictionary validation
  if (!baselineReport.records || typeof baselineReport.records !== 'object' || Array.isArray(baselineReport.records)) {
    errors.push('Baseline records must be a non-null object dictionary');
  } else {
    const recordKeys = Object.keys(baselineReport.records);
    if (recordKeys.length === 0) {
      errors.push('Baseline records dictionary cannot be empty');
    }

    if (Number.isInteger(baselineReport.vehicleCount) && Array.isArray(baselineReport.views) && Array.isArray(baselineReport.lods)) {
      const expectedRecordCount = baselineReport.vehicleCount * baselineReport.views.length * baselineReport.lods.length;
      if (baselineReport.recordCount !== expectedRecordCount) {
        errors.push(`Baseline recordCount (${baselineReport.recordCount}) does not match vehicleCount * views * lods (${expectedRecordCount})`);
      }
      if (recordKeys.length !== expectedRecordCount) {
        errors.push(`Baseline records dictionary length (${recordKeys.length}) does not match expected recordCount (${expectedRecordCount})`);
      }
    }

    // Complete per-model view/LOD matrix validation
    const modelIdsSet = new Set();
    for (const rec of Object.values(baselineReport.records)) {
      if (rec && typeof rec === 'object' && rec.modelId && typeof rec.modelId === 'string') {
        modelIdsSet.add(rec.modelId);
      }
    }
    const modelIds = Array.from(modelIdsSet).sort();

    if (Number.isInteger(baselineReport.vehicleCount) && modelIds.length !== baselineReport.vehicleCount) {
      errors.push(`Baseline distinct model ID count (${modelIds.length}) does not match vehicleCount (${baselineReport.vehicleCount})`);
    }

    for (const modelId of modelIds) {
      for (const view of CANONICAL_AUDIT_VIEWS) {
        for (const lod of CANONICAL_AUDIT_LODS) {
          const expectedKey = `${modelId}:${view}:${lod}`;
          if (!baselineReport.records[expectedKey]) {
            errors.push(`Baseline records dictionary is missing expected matrix cell ${expectedKey}`);
          }
        }
      }
    }

    const hex64Regex = /^[0-9a-f]{64}$/;

    for (const [mapKey, rec] of Object.entries(baselineReport.records)) {
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
        errors.push(`Baseline record ${mapKey} is null or not an object`);
        continue;
      }
      if (rec.key !== mapKey) {
        errors.push(`Baseline record ${mapKey} embedded key "${rec.key}" does not match map key "${mapKey}"`);
      }
      if (!rec.modelId || typeof rec.modelId !== 'string' || rec.modelId.trim() === '') {
        errors.push(`Baseline record ${mapKey} has invalid or empty modelId`);
      }
      if (!rec.designation || typeof rec.designation !== 'string' || rec.designation.trim() === '') {
        errors.push(`Baseline record ${mapKey} has invalid or empty designation`);
      }
      if (!rec.view || !CANONICAL_AUDIT_VIEWS.includes(rec.view)) {
        errors.push(`Baseline record ${mapKey} view "${rec.view}" is not canonical`);
      }
      if (!rec.lod || !CANONICAL_AUDIT_LODS.includes(rec.lod)) {
        errors.push(`Baseline record ${mapKey} lod "${rec.lod}" is not canonical`);
      }

      const expectedSemanticKey = `${rec.modelId}:${rec.view}:${rec.lod}`;
      if (rec.key !== expectedSemanticKey) {
        errors.push(`Baseline record ${mapKey} embedded key "${rec.key}" does not match semantic formula "${expectedSemanticKey}"`);
      }

      if (!Number.isInteger(rec.triangleCount) || rec.triangleCount <= 0) {
        errors.push(`Baseline record ${mapKey} has non-positive integer triangleCount`);
      }
      if (typeof rec.svgHash !== 'string' || !hex64Regex.test(rec.svgHash)) {
        errors.push(`Baseline record ${mapKey} svgHash "${rec.svgHash}" is not a lowercase 64-char hex SHA-256 string`);
      }
      const b = rec.projectedBoundsMeters;
      if (!b || typeof b !== 'object' || Array.isArray(b)
          || !Number.isFinite(b.minU) || !Number.isFinite(b.maxU)
          || !Number.isFinite(b.minV) || !Number.isFinite(b.maxV)
          || !Number.isFinite(b.width) || !Number.isFinite(b.height)
          || b.maxU <= b.minU || b.maxV <= b.minV
          || b.width <= 0 || b.height <= 0) {
        errors.push(`Baseline record ${mapKey} has invalid projectedBoundsMeters`);
      } else {
        const derivedW = b.maxU - b.minU;
        const derivedH = b.maxV - b.minV;
        if (Math.abs(derivedW - b.width) > 1e-3 || Math.abs(derivedH - b.height) > 1e-3) {
          errors.push(`Baseline record ${mapKey} projected bounds width/height mismatch derived extents`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function compareSilhouetteAuditWithBaseline(generatedReport, baselineReport) {
  const differences = [];

  const baselineSchemaValidation = validateBaselineReportSchema(baselineReport);
  if (!baselineSchemaValidation.valid) {
    for (const err of baselineSchemaValidation.errors) {
      differences.push(`Baseline schema validation error: ${err}`);
    }
    return { pass: false, differences };
  }

  if (generatedReport.failures && generatedReport.failures.length > 0) {
    for (const failure of generatedReport.failures) {
      differences.push(`Generated audit failure: ${failure}`);
    }
  }

  if (generatedReport.schemaVersion !== baselineReport.schemaVersion) {
    differences.push(
      `Schema version mismatch: generated ${generatedReport.schemaVersion} vs baseline ${baselineReport.schemaVersion}`
    );
  }

  if (generatedReport.vehicleCount !== baselineReport.vehicleCount) {
    differences.push(
      `Vehicle count mismatch: generated ${generatedReport.vehicleCount} vs baseline ${baselineReport.vehicleCount}`
    );
  }

  if (generatedReport.recordCount !== baselineReport.recordCount) {
    differences.push(
      `Record count mismatch: generated ${generatedReport.recordCount} vs baseline ${baselineReport.recordCount}`
    );
  }

  if (JSON.stringify(generatedReport.views) !== JSON.stringify(baselineReport.views)) {
    differences.push(
      `Views mismatch: generated [${(generatedReport.views || []).join(', ')}] vs baseline [${(baselineReport.views || []).join(', ')}]`
    );
  }

  if (JSON.stringify(generatedReport.lods) !== JSON.stringify(baselineReport.lods)) {
    differences.push(
      `LODs mismatch: generated [${(generatedReport.lods || []).join(', ')}] vs baseline [${(baselineReport.lods || []).join(', ')}]`
    );
  }

  if (JSON.stringify(generatedReport.renderConfig) !== JSON.stringify(baselineReport.renderConfig)) {
    differences.push(
      `Render config mismatch: generated ${JSON.stringify(generatedReport.renderConfig)} vs baseline ${JSON.stringify(baselineReport.renderConfig)}`
    );
  }

  const genKeys = Object.keys(generatedReport.records || {}).sort();
  const baseKeys = Object.keys(baselineReport.records || {}).sort();

  for (const key of genKeys) {
    if (!baselineReport.records[key]) {
      differences.push(`Extra key in generated audit: ${key}`);
    }
  }

  for (const key of baseKeys) {
    const baseRec = baselineReport.records[key];
    const genRec = generatedReport.records[key];
    if (!genRec) {
      differences.push(`Missing key in generated audit: ${key}`);
      continue;
    }

    if (genRec.key !== key) {
      differences.push(`${key} generated embedded key corruption: ${genRec.key}`);
    }
    if (genRec.key !== baseRec.key) {
      differences.push(`${key} embedded key mismatch: generated ${genRec.key} vs baseline ${baseRec.key}`);
    }

    if (genRec.modelId !== baseRec.modelId) {
      differences.push(`${key} modelId mismatch: generated ${genRec.modelId} vs baseline ${baseRec.modelId}`);
    }
    if (genRec.designation !== baseRec.designation) {
      differences.push(`${key} designation mismatch: generated ${genRec.designation} vs baseline ${baseRec.designation}`);
    }
    if (genRec.view !== baseRec.view) {
      differences.push(`${key} view mismatch: generated ${genRec.view} vs baseline ${baseRec.view}`);
    }
    if (genRec.lod !== baseRec.lod) {
      differences.push(`${key} lod mismatch: generated ${genRec.lod} vs baseline ${baseRec.lod}`);
    }

    if (genRec.triangleCount !== baseRec.triangleCount) {
      differences.push(
        `${key} triangleCount mismatch: generated ${genRec.triangleCount} vs baseline ${baseRec.triangleCount}`
      );
    }

    if (genRec.svgHash !== baseRec.svgHash) {
      differences.push(
        `${key} svgHash mismatch: generated ${genRec.svgHash} vs baseline ${baseRec.svgHash}`
      );
    }

    const genB = genRec.projectedBoundsMeters || {};
    const baseB = baseRec.projectedBoundsMeters || {};
    for (const prop of ['minU', 'maxU', 'minV', 'maxV', 'width', 'height']) {
      if (genB[prop] !== baseB[prop]) {
        differences.push(
          `${key} projectedBoundsMeters.${prop} mismatch: generated ${genB[prop]} vs baseline ${baseB[prop]}`
        );
      }
    }
  }

  return {
    pass: differences.length === 0,
    differences
  };
}
