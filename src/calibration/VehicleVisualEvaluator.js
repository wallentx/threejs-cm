import * as THREE from 'three';
import {
  createVehicleOwnedRegistrations
} from './VehicleOwnedRegistration.js';
import {
  isVehicleVisualBundle
} from './VehicleVisualBundle.js';

const DIMENSION_KEYS = Object.freeze(['length', 'width', 'height']);
const DEFAULT_LODS = Object.freeze(['high', 'medium', 'core', 'proxy']);
const RIGID_EXCLUDED_ROLES = new Set([
  'flexibleAttachment',
  'surfaceDetail',
  'weaponProjection'
]);

const failure = (checkId, message) => Object.freeze({ checkId, message });

function sameDimensions(left, right) {
  return DIMENSION_KEYS.every(key => left?.[key] === right?.[key]);
}

function signedVolume(geometry) {
  const positions = geometry?.attributes?.position;
  if (!positions) return NaN;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let result = 0;
  const count = index?.count ?? positions.count;
  for (let offset = 0; offset < count; offset += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(offset) : offset);
    b.fromBufferAttribute(positions, index ? index.getX(offset + 1) : offset + 1);
    c.fromBufferAttribute(positions, index ? index.getX(offset + 2) : offset + 2);
    result += a.dot(b.clone().cross(c)) / 6;
  }
  return result;
}

function collectRigidBounds(root, proxy) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let meshCount = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    const isProxy = object.userData.lodBand === 'proxy';
    if (isProxy !== proxy) return;
    if (!proxy && RIGID_EXCLUDED_ROLES.has(object.userData.envelopeRole)) return;
    if (object.userData.lodBand === 'ui') return;
    bounds.union(new THREE.Box3().setFromObject(object));
    meshCount += 1;
  });
  return { bounds, meshCount };
}

function checkIdentity(context) {
  const { bundle } = context;
  const issues = [];
  if (!isVehicleVisualBundle(bundle)) {
    issues.push(failure('identity', 'input is not a vehicle visual bundle'));
    return issues;
  }
  if (bundle.vehicle.modelId !== bundle.modelId) {
    issues.push(failure('identity', 'vehicle statistics modelId diverges'));
  }
  if (bundle.calibration.modelId !== bundle.modelId) {
    issues.push(failure('identity', 'calibration modelId diverges'));
  }
  for (const [label, dimensions] of [
    ['profile', bundle.profile.dimensionsMeters],
    ['calibration', bundle.calibration.dimensionsMeters],
    ['renderer data', bundle.visualData?.dimensionsMeters]
  ]) {
    if (dimensions && !sameDimensions(bundle.vehicle.dimensionsMeters, dimensions)) {
      issues.push(failure('identity', `${label} dimensions diverge from canonical statistics`));
    }
  }
  return issues;
}

function checkAssets(context) {
  const { bundle } = context;
  const issues = [];
  const surface = bundle.assets?.surface;
  if (
    !surface
    || typeof surface.logicalId !== 'string'
    || typeof surface.sourcePackId !== 'string'
    || surface.record?.kind !== 'vehicle-surface-pack'
  ) {
    issues.push(failure('assets', 'vehicle surface asset binding is incomplete'));
  }
  const blueprint = bundle.assets?.blueprint;
  if (!blueprint) {
    issues.push(failure('assets', 'blueprint/reference asset is missing'));
  }
  return issues;
}

function checkMeshContract(context) {
  const { bundle, model } = context;
  const issues = [];
  if (!model?.isGroup) {
    return [failure('mesh-contract', 'factory did not return a Three.js Group')];
  }
  if (model.name !== bundle.modelId) {
    issues.push(failure(
      'mesh-contract',
      `root name ${model.name || '(empty)'} does not match ${bundle.modelId}`
    ));
  }
  if (!sameDimensions(
    model.userData.modelMetadata?.dimensionsMeters,
    bundle.vehicle.dimensionsMeters
  )) {
    issues.push(failure('mesh-contract', 'mesh metadata dimensions diverge'));
  }

  const expectedLods = bundle.validation.requiredLodBands ?? DEFAULT_LODS;
  const lodBands = new Set();
  model.traverse(object => {
    if (object.isMesh && object.userData.lodBand) {
      lodBands.add(object.userData.lodBand);
    }
  });
  for (const lod of expectedLods) {
    if (!lodBands.has(lod)) {
      issues.push(failure('mesh-contract', `missing ${lod} LOD geometry`));
    }
  }

  const binding = model.userData.assetBindings?.vehicleSurface;
  if (
    binding?.logicalId !== bundle.assets.surface.logicalId
    || binding?.sourcePackId !== bundle.assets.surface.sourcePackId
  ) {
    issues.push(failure('mesh-contract', 'live surface binding diverges from bundle asset'));
  }
  return issues;
}

function checkRigidEnvelope(context) {
  const { bundle, model, metrics } = context;
  const issues = [];
  const expected = bundle.vehicle.dimensionsMeters;
  for (const [label, proxy] of [['detail', false], ['proxy', true]]) {
    const { bounds, meshCount } = collectRigidBounds(model, proxy);
    if (meshCount === 0 || bounds.isEmpty()) {
      issues.push(failure('rigid-envelope', `${label} has no rigid meshes`));
      continue;
    }
    const size = bounds.getSize(new THREE.Vector3());
    const measured = {
      length: size.z,
      width: size.x,
      height: bounds.max.y,
      ground: bounds.min.y
    };
    metrics.envelopes[label] = measured;
    for (const key of DIMENSION_KEYS) {
      if (Math.abs(measured[key] - expected[key]) > 0.01) {
        issues.push(failure(
          'rigid-envelope',
          `${label} ${key} expected ${expected[key]}m, measured ${measured[key]}m`
        ));
      }
    }
    if (Math.abs(measured.ground) > 0.01) {
      issues.push(failure(
        'rigid-envelope',
        `${label} ground expected 0m, measured ${measured.ground}m`
      ));
    }
  }
  return issues;
}

function checkBlueprintRegistration(context) {
  const { bundle, model, metrics } = context;
  const issues = [];
  const requiredViews = bundle.validation.requiredBlueprintViews ?? [];
  if (requiredViews.length === 0) return issues;
  const registrations = createVehicleOwnedRegistrations(model, bundle.calibration);
  for (const view of requiredViews) {
    const registration = registrations[view];
    if (!registration?.imageUrl) {
      issues.push(failure('blueprint-registration', `${view} raster is unavailable`));
      continue;
    }
    if (!registration.autoFit || Object.keys(registration.landmarks).length < 2) {
      issues.push(failure(
        'blueprint-registration',
        `${view} lacks two source-space landmarks for deterministic fitting`
      ));
    }
    metrics.blueprintViews[view] = {
      imageUrl: registration.imageUrl,
      crop: registration.crop,
      landmarkCount: Object.keys(registration.landmarks).length
    };
  }
  return issues;
}

function checkSemanticParts(context) {
  const { bundle, model } = context;
  const issues = [];
  for (const name of bundle.validation.requiredParts ?? []) {
    if (!model.getObjectByName(name)) {
      issues.push(failure('semantic-parts', `required part ${name} is missing`));
    }
  }
  for (const name of bundle.validation.forbiddenParts ?? []) {
    if (model.getObjectByName(name)) {
      issues.push(failure('semantic-parts', `rejected legacy part ${name} is present`));
    }
  }
  for (const name of bundle.validation.closedParts ?? []) {
    const object = model.getObjectByName(name);
    if (!object?.isMesh) continue;
    const volume = signedVolume(object.geometry);
    if (!(volume > 0)) {
      issues.push(failure(
        'semantic-parts',
        `${name} must be a closed outward-wound volume; signed volume ${volume}`
      ));
    }
  }
  return issues;
}

function checkWeaponMounts(context) {
  const { bundle, model } = context;
  const expected = bundle.validation.mountSides;
  if (!expected) return [];
  const issues = [];
  const main = model.userData.muzzle;
  const coax = model.userData.weaponMuzzles?.coax;
  if (expected.main && main?.userData.mountSide !== expected.main) {
    issues.push(failure('weapon-mounts', `main mount must be ${expected.main}`));
  }
  if (expected.coax && coax?.userData.mountSide !== expected.coax) {
    issues.push(failure('weapon-mounts', `coax mount must be ${expected.coax}`));
  }
  return issues;
}

export const DEFAULT_VEHICLE_VISUAL_CHECKS = Object.freeze([
  Object.freeze({ id: 'identity', evaluate: checkIdentity }),
  Object.freeze({ id: 'assets', evaluate: checkAssets }),
  Object.freeze({ id: 'mesh-contract', evaluate: checkMeshContract }),
  Object.freeze({ id: 'rigid-envelope', evaluate: checkRigidEnvelope }),
  Object.freeze({ id: 'blueprint-registration', evaluate: checkBlueprintRegistration }),
  Object.freeze({ id: 'semantic-parts', evaluate: checkSemanticParts }),
  Object.freeze({ id: 'weapon-mounts', evaluate: checkWeaponMounts })
]);

export function evaluateVehicleVisualBundle(
  bundle,
  { checks = DEFAULT_VEHICLE_VISUAL_CHECKS } = {}
) {
  if (!Array.isArray(checks) || checks.some(check => typeof check?.evaluate !== 'function')) {
    throw new TypeError('vehicle visual evaluator requires check plugins');
  }
  const metrics = {
    envelopes: {},
    blueprintViews: {}
  };
  let model = null;
  const context = {
    bundle,
    metrics,
    get model() {
      if (!model) model = bundle.createMesh();
      return model;
    }
  };
  const failures = [];
  const executedChecks = [];
  for (const check of checks) {
    executedChecks.push(check.id);
    const result = check.evaluate(context);
    if (!Array.isArray(result)) {
      throw new TypeError(`vehicle visual check ${check.id} must return an array`);
    }
    failures.push(...result);
  }
  return Object.freeze({
    modelId: bundle?.modelId ?? null,
    pass: failures.length === 0,
    executedChecks: Object.freeze(executedChecks),
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      envelopes: Object.freeze({ ...metrics.envelopes }),
      blueprintViews: Object.freeze({ ...metrics.blueprintViews })
    })
  });
}

export function evaluateVehicleVisualBundleRegistry(
  bundles,
  options
) {
  if (!bundles || typeof bundles !== 'object' || Array.isArray(bundles)) {
    throw new TypeError('vehicle visual bundle registry must be an object dictionary');
  }
  return Object.freeze(Object.fromEntries(
    Object.keys(bundles).sort().map(modelId => [
      modelId,
      evaluateVehicleVisualBundle(bundles[modelId], options)
    ])
  ));
}
