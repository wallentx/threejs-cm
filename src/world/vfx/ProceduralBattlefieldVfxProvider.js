import * as THREE from 'three';

export const PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID =
  'procedural-battlefield-vfx-v1';

const COMBAT_EFFECT_ROLES = Object.freeze(['impact', 'explosion']);
const VEHICLE_GEOMETRY_ROLES = Object.freeze([
  'smoke',
  'flame',
  'spark',
  'scorch',
  'blast'
]);
const VEHICLE_MATERIAL_ROLES = Object.freeze([
  'smoke',
  'flame',
  'spark',
  'scorch'
]);

function markResource(resource, role) {
  resource.userData.vfxRole = role;
  resource.userData.vfxImplementationId =
    PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID;
  return resource;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
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
    const style = resourceSet.styles?.[role];
    if (
      !style
      || !Number.isFinite(style.color)
      || !Number.isFinite(style.maxLife)
      || style.maxLife <= 0
    ) {
      throw new TypeError(`combat VFX resources require ${role} style`);
    }
  }
  if (typeof resourceSet.createEffectMaterial !== 'function') {
    throw new TypeError('combat VFX resources require createEffectMaterial');
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

function createCombatResources() {
  const effectGeometries = Object.freeze({
    impact: markResource(new THREE.SphereGeometry(0.16, 6, 5), 'combat-impact'),
    explosion: markResource(
      new THREE.SphereGeometry(2.5, 12, 12),
      'combat-explosion'
    )
  });
  const styles = Object.freeze({
    impact: Object.freeze({
      color: 0xffb347,
      initialOpacity: 0.9,
      maxLife: 0.18,
      growthPerSecond: 2.4
    }),
    explosion: Object.freeze({
      color: 0xff4500,
      initialOpacity: 0.9,
      maxLife: 0.6,
      growthPerSecond: 2.4
    })
  });
  const effectCaps = Object.freeze({ impact: 48, explosion: 12 });
  let disposed = false;
  return Object.freeze({
    kind: 'combat-vfx-resources',
    effectGeometries,
    effectCaps,
    styles,
    createEffectMaterial(kind) {
      const style = styles[kind];
      if (!style) throw new Error(`unknown combat VFX role ${kind}`);
      return markResource(new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false
      }), `combat-${kind}`);
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const geometry of Object.values(effectGeometries)) geometry.dispose();
      return true;
    }
  });
}

function createVehicleDamageResources() {
  const geometries = Object.freeze({
    smoke: markResource(
      new THREE.SphereGeometry(0.34, 7, 6),
      'vehicle-damage-smoke'
    ),
    flame: markResource(
      new THREE.ConeGeometry(0.19, 0.72, 6, 1),
      'vehicle-damage-flame'
    ),
    spark: markResource(
      new THREE.TetrahedronGeometry(0.055, 0),
      'vehicle-damage-spark'
    ),
    scorch: markResource(
      new THREE.SphereGeometry(0.13, 7, 5),
      'vehicle-damage-scorch'
    ),
    blast: markResource(
      new THREE.IcosahedronGeometry(1, 2),
      'vehicle-damage-blast'
    )
  });
  const materials = Object.freeze({
    smoke: markResource(new THREE.MeshBasicMaterial({
      color: 0x262522,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    }), 'vehicle-damage-smoke'),
    flame: markResource(new THREE.MeshBasicMaterial({
      color: 0xff641c,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }), 'vehicle-damage-flame'),
    spark: markResource(new THREE.MeshBasicMaterial({
      color: 0xffc35a,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }), 'vehicle-damage-spark'),
    scorch: markResource(new THREE.MeshStandardMaterial({
      color: 0x15130f,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.88
    }), 'vehicle-damage-scorch')
  });
  const capacities = Object.freeze({
    smoke: 9,
    flame: 7,
    spark: 14,
    scorch: 8
  });
  let disposed = false;
  return Object.freeze({
    kind: 'vehicle-damage-vfx-resources',
    geometries,
    materials,
    capacities,
    createBlastMaterial() {
      return markResource(new THREE.MeshBasicMaterial({
        color: 0xff8a24,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }), 'vehicle-damage-blast');
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      return true;
    }
  });
}

export const PROCEDURAL_BATTLEFIELD_VFX_PROVIDER = Object.freeze({
  id: PROCEDURAL_BATTLEFIELD_VFX_IMPLEMENTATION_ID,
  kind: 'battlefield-vfx-provider',
  createCombatResources,
  createVehicleDamageResources
});
