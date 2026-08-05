const COMBAT_EFFECT_ROLES = Object.freeze([
  'impact',
  'explosion',
  'muzzleFlash',
  'buildingDebris'
]);
const VEHICLE_GEOMETRY_ROLES = Object.freeze([
  'smoke',
  'flame',
  'spark',
  'scorch',
  'heScorch',
  'blast'
]);
const VEHICLE_MATERIAL_ROLES = Object.freeze([
  'smoke',
  'flame',
  'spark',
  'scorch',
  'heScorch'
]);
const RUNTIME_METHODS = Object.freeze([
  'emitImpact',
  'emitExplosion',
  'emitMuzzleFlash',
  'emitBuildingDebris',
  'emitVehicleDamageState',
  'update',
  'clear',
  'dispose'
]);

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validCombatStyle(style) {
  return Boolean(
    style
    && Number.isFinite(style.color)
    && Number.isFinite(style.initialOpacity)
    && style.initialOpacity >= 0
    && Number.isFinite(style.maxLife)
    && style.maxLife > 0
    && Number.isFinite(style.growthPerSecond)
    && style.growthPerSecond >= 0
    && Number.isFinite(style.initialScale)
    && style.initialScale > 0
  );
}

export function validateCombatVfxResourceSet(resourceSet) {
  if (!resourceSet || resourceSet.kind !== 'combat-vfx-resources') {
    throw new TypeError('battlefield VFX provider must create combat VFX resources');
  }
  for (const role of COMBAT_EFFECT_ROLES) {
    if (!resourceSet.effectGeometries?.[role]?.isBufferGeometry) {
      throw new TypeError(`combat VFX resources require ${role} geometry`);
    }
    if (!positiveInteger(resourceSet.effectCaps?.[role])) {
      throw new TypeError(`combat VFX resources require positive ${role} cap`);
    }
    if (!validCombatStyle(resourceSet.styles?.[role])) {
      throw new TypeError(`combat VFX resources require ${role} style`);
    }
  }
  if (typeof resourceSet.resolveBuildingDebrisStyle !== 'function') {
    throw new TypeError(
      'combat VFX resources require building debris material-style resolver'
    );
  }
  if (typeof resourceSet.createEffectMaterial !== 'function') {
    throw new TypeError('combat VFX resources require createEffectMaterial');
  }
  if (typeof resourceSet.createProjectileMesh !== 'function') {
    throw new TypeError('combat VFX resources require createProjectileMesh');
  }
  if (typeof resourceSet.resetProjectileResources !== 'function') {
    throw new TypeError('combat VFX resources require resetProjectileResources');
  }
  if (typeof resourceSet.dispose !== 'function') {
    throw new TypeError('combat VFX resources require dispose');
  }
  return resourceSet;
}

export function validateVehicleDamageVfxResourceSet(resourceSet) {
  if (!resourceSet || resourceSet.kind !== 'vehicle-damage-vfx-resources') {
    throw new TypeError(
      'battlefield VFX provider must create vehicle-damage VFX resources'
    );
  }
  for (const role of VEHICLE_GEOMETRY_ROLES) {
    if (!resourceSet.geometries?.[role]?.isBufferGeometry) {
      throw new TypeError(`vehicle-damage VFX resources require ${role} geometry`);
    }
  }
  for (const role of VEHICLE_MATERIAL_ROLES) {
    if (!resourceSet.materials?.[role]?.isMaterial) {
      throw new TypeError(`vehicle-damage VFX resources require ${role} material`);
    }
    if (!positiveInteger(resourceSet.capacities?.[role])) {
      throw new TypeError(`vehicle-damage VFX resources require positive ${role} capacity`);
    }
  }
  if (typeof resourceSet.createBlastMaterial !== 'function') {
    throw new TypeError('vehicle-damage VFX resources require createBlastMaterial');
  }
  if (typeof resourceSet.dispose !== 'function') {
    throw new TypeError('vehicle-damage VFX resources require dispose');
  }
  return resourceSet;
}

export function validateBattlefieldVfxProvider(provider) {
  if (
    !provider
    || provider.kind !== 'battlefield-vfx-provider'
    || typeof provider.createCombatResources !== 'function'
    || typeof provider.createVehicleDamageResources !== 'function'
  ) {
    throw new TypeError(
      'battlefield VFX provider requires combat and vehicle-damage resource factories'
    );
  }
  return provider;
}

export function validateBattlefieldVfxRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') {
    throw new TypeError('battlefield VFX runtime must be an object');
  }
  for (const method of RUNTIME_METHODS) {
    if (typeof runtime[method] !== 'function') {
      throw new TypeError(`battlefield VFX runtime requires ${method}`);
    }
  }
  return runtime;
}
