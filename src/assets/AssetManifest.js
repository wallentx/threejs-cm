const SOURCE_TYPES = new Set(['procedural', 'url']);

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function copyPlain(value, path = 'value') {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain finite numbers`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => copyPlain(entry, `${path}[${index}]`));
  }
  if (!isPlainRecord(value)) {
    throw new TypeError(`${path} must contain only plain data`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => (
    [key, copyPlain(entry, `${path}.${key}`)]
  )));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertUniqueStrings(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const seen = new Set();
  for (const value of values) {
    requireString(value, `${label} entry`);
    if (seen.has(value)) throw new Error(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

/**
 * Validate renderer-neutral logical asset data without changing its identity.
 */
export function validateAssetManifest(manifest) {
  if (!isPlainRecord(manifest)) throw new TypeError('asset manifest must be a plain record');
  copyPlain(manifest, 'asset manifest');
  requireString(manifest.id, 'asset manifest id');
  requireString(manifest.familyId, `asset manifest ${manifest.id} familyId`);
  const replaces = manifest.replaces ?? [];
  assertUniqueStrings(replaces, `asset manifest ${manifest.id} replaces`);
  if (replaces.includes(manifest.id)) {
    throw new Error(`asset manifest ${manifest.id} cannot replace itself`);
  }
  if (!isPlainRecord(manifest.assets)) {
    throw new TypeError(`asset manifest ${manifest.id} assets must be a record`);
  }

  for (const [logicalId, asset] of Object.entries(manifest.assets)) {
    if (!isPlainRecord(asset)) {
      throw new TypeError(`asset ${logicalId} must be a plain record`);
    }
    requireString(logicalId, 'logical asset id');
    if (asset.id !== logicalId) {
      throw new Error(`asset key/id mismatch: ${logicalId} !== ${asset.id ?? 'missing'}`);
    }
    requireString(asset.kind, `asset ${logicalId} kind`);
    if (!isPlainRecord(asset.source)) {
      throw new TypeError(`asset ${logicalId} source must be a plain record`);
    }
    if (!SOURCE_TYPES.has(asset.source.type)) {
      throw new Error(`asset ${logicalId} has unsupported source type ${asset.source.type ?? 'missing'}`);
    }
    if (asset.source.type === 'procedural') {
      requireString(asset.source.generatorId, `asset ${logicalId} generatorId`);
    } else {
      requireString(asset.source.url, `asset ${logicalId} url`);
    }
    assertUniqueStrings(asset.dependencies ?? [], `asset ${logicalId} dependencies`);
  }

  return manifest;
}

/**
 * Clone, validate, and deeply freeze one portable logical asset manifest.
 */
export function defineAssetManifest(definition) {
  const manifest = copyPlain(definition, 'asset manifest');
  if (!Object.hasOwn(manifest, 'replaces')) manifest.replaces = [];
  validateAssetManifest(manifest);
  return deepFreeze(manifest);
}

/**
 * Bind runtime providers to a plain manifest without putting renderer objects
 * or functions inside portable content data.
 */
function validateRuntimeProviders(manifest, providers) {
  if (!isPlainRecord(providers)) {
    throw new TypeError(`runtime asset pack ${manifest.id} providers must be a record`);
  }
  for (const providerId of Object.keys(providers)) {
    if (!Object.hasOwn(manifest.assets, providerId)) {
      throw new Error(`runtime asset pack ${manifest.id} has undeclared provider ${providerId}`);
    }
  }
  for (const asset of Object.values(manifest.assets)) {
    if (asset.source.type !== 'procedural') continue;
    const provider = providers[asset.id];
    if (
      provider == null
      || (typeof provider !== 'object' && typeof provider !== 'function')
    ) {
      throw new Error(`runtime asset pack ${manifest.id} requires provider ${asset.id}`);
    }
  }
}

export function createRuntimeAssetPack(manifest, providers = {}) {
  validateAssetManifest(manifest);
  validateRuntimeProviders(manifest, providers);
  return Object.freeze({
    id: manifest.id,
    familyId: manifest.familyId,
    manifest,
    providers: Object.freeze({ ...providers })
  });
}

/**
 * Compose immutable base and replacement packs. Later packs may replace a
 * logical ID only after explicitly naming the currently owning pack.
 */
export function createAssetResolver(packs) {
  if (!Array.isArray(packs) || packs.length === 0) {
    throw new TypeError('asset resolver requires at least one runtime pack');
  }
  const packIds = new Set();
  const resolved = new Map();
  let familyId = null;

  for (const pack of packs) {
    if (!pack || typeof pack !== 'object' || !pack.manifest || !pack.providers) {
      throw new TypeError('asset resolver packs must come from createRuntimeAssetPack');
    }
    validateAssetManifest(pack.manifest);
    validateRuntimeProviders(pack.manifest, pack.providers);
    if (pack.id !== pack.manifest.id || pack.familyId !== pack.manifest.familyId) {
      throw new Error(`runtime asset pack identity mismatch for ${pack.id ?? 'missing'}`);
    }
    if (packIds.has(pack.id)) throw new Error(`duplicate runtime asset pack ${pack.id}`);
    if (familyId == null) familyId = pack.familyId;
    if (pack.familyId !== familyId) {
      throw new Error(`asset resolver cannot mix ${familyId} with ${pack.familyId}`);
    }
    for (const replacedPackId of pack.manifest.replaces) {
      if (!packIds.has(replacedPackId)) {
        throw new Error(`asset pack ${pack.id} replaces unavailable pack ${replacedPackId}`);
      }
    }
    for (const [logicalId, record] of Object.entries(pack.manifest.assets)) {
      const previous = resolved.get(logicalId);
      if (previous && !pack.manifest.replaces.includes(previous.packId)) {
        throw new Error(
          `asset pack ${pack.id} must explicitly replace ${previous.packId} for ${logicalId}`
        );
      }
      if (previous && previous.record.kind !== record.kind) {
        throw new Error(
          `asset pack ${pack.id} cannot change ${logicalId} kind from `
          + `${previous.record.kind} to ${record.kind}`
        );
      }
      resolved.set(logicalId, Object.freeze({
        logicalId,
        packId: pack.id,
        record,
        provider: pack.providers[logicalId] ?? null
      }));
    }
    packIds.add(pack.id);
  }
  for (const binding of resolved.values()) {
    for (const dependencyId of binding.record.dependencies ?? []) {
      if (!resolved.has(dependencyId)) {
        throw new Error(
          `asset ${binding.logicalId} references unknown dependency ${dependencyId}`
        );
      }
    }
  }

  const orderedPackIds = Object.freeze([...packIds]);
  const requireBinding = (logicalId, expectedKind = null) => {
    const binding = resolved.get(logicalId);
    if (!binding) throw new Error(`unknown logical asset ${logicalId}`);
    if (expectedKind && binding.record.kind !== expectedKind) {
      throw new Error(
        `logical asset ${logicalId} is ${binding.record.kind}, expected ${expectedKind}`
      );
    }
    return binding;
  };
  return Object.freeze({
    familyId,
    packIds: orderedPackIds,
    has(logicalId) {
      return resolved.has(logicalId);
    },
    get(logicalId) {
      return resolved.get(logicalId) ?? null;
    },
    require: requireBinding,
    requireProvider(logicalId, expectedKind = null) {
      const binding = requireBinding(logicalId, expectedKind);
      if (binding.provider == null) {
        throw new Error(`logical asset ${logicalId} has no runtime provider`);
      }
      return binding.provider;
    }
  });
}
