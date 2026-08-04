import * as THREE from 'three';
import {
  validateBattlefieldVfxProvider,
  validateBattlefieldVfxRuntime,
  validateVehicleDamageVfxResourceSet
} from './vfx/BattlefieldVfxContract.js';
import {
  setProceduralVfxProgress
} from './vfx/ProceduralVfxNodes.js';

const FIRE_COMPONENTS = Object.freeze(['engine', 'fuel', 'ammunition']);
const DESTROYED_STATES = new Set(['DESTROYED', 'DISABLED', 'KNOCKED_OUT']);
const BURNING_STATES = new Set(['BURNING', 'FIRE']);
const DAMAGED_STATES = new Set(['DAMAGED', ...DESTROYED_STATES, ...BURNING_STATES]);

const IDENTITY_QUATERNION = new THREE.Quaternion();
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchTurretYaw = new THREE.Quaternion();
const scratchTurretRotation = new THREE.Quaternion();
const scratchTurretEuler = new THREE.Euler();
const scratchImpactDirection = new THREE.Vector3();
const scratchImpactNormal = new THREE.Vector3();
const scratchImpactQuaternion = new THREE.Quaternion();
const scratchWorldQuaternion = new THREE.Quaternion();
const scratchImpactScale = new THREE.Vector3();
const scratchImpactColor = new THREE.Color();
const scratchRaycaster = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const WRECK_RUST_COLOR = new THREE.Color(0x6f3b24);

const IMPACT_MARK_STYLES = Object.freeze({
  penetration: Object.freeze({ color: 0x120b08, scale: [1.08, 1.08, 1] }),
  ricochet: Object.freeze({ color: 0xa18f72, scale: [1.72, 0.48, 1] }),
  stopped: Object.freeze({ color: 0x4b4036, scale: [0.82, 0.82, 1] }),
  heBlast: Object.freeze({ color: 0x2b211a, scale: [3.1, 2.65, 1] })
});

const FIRE_PHASE_INTENSITY = Object.freeze({
  NONE: 0,
  FUEL_FIRE: 0.48,
  SPREADING_FIRE: 0.78,
  AMMUNITION_VENTING: 1,
  BURNED_OUT: 0.38,
  DETONATED: 0.72
});

// Renderer approximations until vehicle-authored fire vent markers exist.
// Positions are [lateral, up, forward] ratios of the rigid vehicle envelope.
const APPROXIMATE_FIRE_VENTS = Object.freeze([
  { origin: [0, 0.66, -0.31], direction: [0, 0.92, -0.38] },
  { origin: [-0.24, 0.62, -0.25], direction: [-0.62, 0.66, -0.2] },
  { origin: [0.24, 0.62, -0.25], direction: [0.62, 0.66, -0.2] },
  { origin: [-0.31, 0.55, 0.01], direction: [-0.88, 0.34, 0.05] },
  { origin: [0.31, 0.55, 0.01], direction: [0.88, 0.34, 0.05] },
  { origin: [0, 0.88, 0.04], direction: [0.05, 0.96, 0.28] },
  { origin: [0, 0.67, 0.24], direction: [0, 0.42, 0.9] }
]);

function normalizeState(value) {
  if (typeof value === 'string') return value.toUpperCase();
  if (!value || typeof value !== 'object') return 'OK';
  if (value.status) return String(value.status).toUpperCase();
  if (value.state) return String(value.state).toUpperCase();
  if (Number.isFinite(value.health)) {
    if (value.health <= 0) return 'DESTROYED';
    if (value.health < 55) return 'DAMAGED';
  }
  return 'OK';
}

function smoothstepValue(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function cookoffVentBuild(progress) {
  return smoothstepValue(0.67, 0.94, progress);
}

function getComponentRecord(unit, component) {
  const components = unit.vehicleComponents
    ?? unit.vehicleDamage?.components
    ?? unit.componentDamage
    ?? {};
  const canonicalIds = {
    mainGun: 'main_gun',
    gunBreech: 'breech',
    turretTraverse: 'turret_traverse',
    hullMachineGun: 'hull_mg',
    leftTrack: 'tracks',
    rightTrack: 'tracks'
  };
  const direct = components[canonicalIds[component] ?? component];
  if (direct != null) return direct;

  const legacyAliases = {
    mainGun: 'gun',
    gunBreech: 'gun',
    turretTraverse: 'turret',
    leftTrack: 'tracks',
    rightTrack: 'tracks'
  };
  return unit.vehicleDamage?.[legacyAliases[component] ?? component] ?? null;
}

function componentHealth(unit, component) {
  const record = getComponentRecord(unit, component);
  if (record && typeof record === 'object' && Number.isFinite(record.health)) {
    return THREE.MathUtils.clamp(record.health, 0, 100);
  }
  const state = normalizeState(record);
  if (DESTROYED_STATES.has(state)) return 0;
  if (BURNING_STATES.has(state)) return 12;
  if (state === 'DAMAGED') return 45;
  return 100;
}

export function getVehicleVisualDamage(unit) {
  const componentNames = [
    'hull',
    'engine',
    'transmission',
    'fuel',
    'ammunition',
    'mainGun',
    'gunBreech',
    'turretTraverse',
    'coax',
    'hullMachineGun',
    'leftTrack',
    'rightTrack',
    'optics',
    'radio'
  ];
  const components = Object.fromEntries(componentNames.map(component => {
    const state = normalizeState(getComponentRecord(unit, component));
    return [component, {
      state,
      health: componentHealth(unit, component)
    }];
  }));

  const explicitFire = Boolean(
    unit.vehicleFire?.active
    ?? unit.vehicleDamageState?.burning
    ?? unit.vehicleDamage?.burning
  );
  const burning = explicitFire || FIRE_COMPONENTS.some(component =>
    BURNING_STATES.has(components[component].state)
  );
  const destroyed = DESTROYED_STATES.has(components.hull.state)
    || unit.vehicleDamageState?.destroyed === true
    || unit.isKnockedOut === true;
  const damaged = Object.values(components).some(component =>
    DAMAGED_STATES.has(component.state)
  );
  const firePhase = unit.vehicleDamageState?.fire?.phase
    ?? (burning ? 'FUEL_FIRE' : 'NONE');
  const firePhaseElapsedSeconds = Math.max(
    0,
    unit.vehicleDamageState?.fire?.phaseElapsedSeconds ?? 0
  );
  const fireVentDurationSeconds = Math.max(
    0.001,
    unit.vehicleDamageState?.fire?.ventDurationSeconds ?? 1
  );
  const firePostBlastDurationSeconds = Math.max(
    0.001,
    unit.vehicleDamageState?.fire?.postBlastDurationSeconds ?? 1
  );

  return {
    components,
    burning,
    firePhase,
    fireIntensity: FIRE_PHASE_INTENSITY[firePhase] ?? (burning ? 0.5 : 0),
    fireElapsedSeconds: Math.max(
      0,
      unit.vehicleDamageState?.fire?.elapsedSeconds ?? 0
    ),
    firePhaseElapsedSeconds,
    fireVentProgress: firePhase === 'AMMUNITION_VENTING'
      ? THREE.MathUtils.clamp(
          firePhaseElapsedSeconds / fireVentDurationSeconds,
          0,
          1
        )
      : 0,
    firePostBlastProgress: firePhase === 'BURNED_OUT'
      ? 1
      : (firePhase === 'DETONATED'
          ? THREE.MathUtils.clamp(
              firePhaseElapsedSeconds / firePostBlastDurationSeconds,
              0,
              1
            )
          : 0),
    destroyed,
    damaged,
    secondaryExplosion: unit.vehicleDamageState?.secondaryExplosion === true,
    turretSeparated: unit.vehiclePhysics?.turret?.status != null
      && unit.vehiclePhysics.turret.status !== 'ATTACHED',
    eventVersion: unit.vehicleDamageState?.eventVersion ?? 0
  };
}

function disableRaycast(object) {
  object.raycast = () => {};
  object.frustumCulled = false;
  return object;
}

function createPersistentEffectObject(geometry, material, capacity) {
  if (material.isSpriteNodeMaterial) {
    const cluster = new THREE.Group();
    cluster.userData.effectCapacity = capacity;
    cluster.userData.layerCount = 0;
    cluster.userData.isSpriteCluster = true;
    cluster.visible = false;
    for (let index = 0; index < capacity; index++) {
      const sprite = new THREE.Sprite(material);
      sprite.name = `ProceduralVfxParticle_${index}`;
      sprite.raycast = () => {};
      sprite.frustumCulled = false;
      sprite.visible = false;
      cluster.add(sprite);
    }
    return cluster;
  }
  const instances = new THREE.InstancedMesh(geometry, material, capacity);
  instances.count = 0;
  return instances;
}

function setSpriteClusterCount(cluster, count) {
  const bounded = Math.min(cluster.children.length, Math.max(0, count));
  cluster.userData.layerCount = bounded;
  cluster.visible = bounded > 0;
  for (let index = 0; index < cluster.children.length; index++) {
    cluster.children[index].visible = index < bounded;
  }
  return bounded;
}

function ensureIndependentSpriteMaterials(cluster) {
  if (!cluster.userData.isSpriteCluster || cluster._particleMaterials) return;
  const particleMaterials = cluster.children.map(sprite => {
    const clone = sprite.material.clone();
    sprite.material = clone;
    return clone;
  });
  cluster._particleMaterials = particleMaterials;
}

function disposeIndependentSpriteMaterials(cluster) {
  for (const material of cluster._particleMaterials ?? []) {
    material.dispose();
  }
  delete cluster._particleMaterials;
}

function initializeWreckRustMaterials(record) {
  if (record.rustMaterials) return;
  const clones = new Map();
  const assignments = [];
  record.mesh.traverse(object => {
    if (
      !object.isMesh
      || isDescendantOf(object, record.root)
      || object.userData?.lodBand === 'ui'
    ) return;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    let changed = false;
    const rustMaterials = sourceMaterials.map(source => {
      const slot = source?.userData?.materialSlot
        ?? source?.userData?.vehicleMaterialSlot;
      if (
        !source?.color
        || !['paint', 'metal'].includes(slot)
        || source.transparent
      ) return source;
      changed = true;
      if (!clones.has(source)) {
        const material = source.clone();
        material.name = `${source.name || slot || 'vehicle'}_wreck-rust`;
        material.userData = {
          ...material.userData,
          damageMaterialOwner: record.unit.id,
          damageMaterialRole: 'wreck-rust'
        };
        clones.set(source, {
          material,
          baseColor: source.color.clone(),
          baseRoughness: source.roughness,
          baseMetalness: source.metalness
        });
      }
      return clones.get(source).material;
    });
    if (!changed) return;
    assignments.push({ object, originalMaterial: object.material });
    object.material = Array.isArray(object.material) ? rustMaterials : rustMaterials[0];
  });
  record.rustMaterials = [...clones.values()];
  record.rustMaterialAssignments = assignments;
}

function updateWreckRust(record, damage) {
  const progress = damage.secondaryExplosion
    ? smoothstepValue(0.12, 1, damage.firePostBlastProgress)
    : 0;
  if (progress <= 0 && !record.rustMaterials) return;
  initializeWreckRustMaterials(record);
  for (const entry of record.rustMaterials) {
    entry.material.color.copy(entry.baseColor).lerp(WRECK_RUST_COLOR, progress * 0.86);
    if (Number.isFinite(entry.baseRoughness)) {
      entry.material.roughness = THREE.MathUtils.lerp(
        entry.baseRoughness,
        0.98,
        progress
      );
    }
    if (Number.isFinite(entry.baseMetalness)) {
      entry.material.metalness = THREE.MathUtils.lerp(
        entry.baseMetalness,
        0.08,
        progress
      );
    }
  }
}

function disposeWreckRustMaterials(record) {
  for (const assignment of record.rustMaterialAssignments ?? []) {
    assignment.object.material = assignment.originalMaterial;
  }
  for (const entry of record.rustMaterials ?? []) entry.material.dispose();
  record.rustMaterials = null;
  record.rustMaterialAssignments = null;
}

function setSpriteParticle(
  cluster,
  index,
  x,
  y,
  z,
  width,
  height,
  rotation = 0,
  opacity = 1
) {
  const sprite = cluster.children[index];
  if (!sprite) return;
  sprite.position.set(x, y, z);
  sprite.scale.set(width, height, 1);
  sprite.material.rotation = rotation;
  sprite.material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
}

function setInstance(mesh, index, x, y, z, scale, quaternion = IDENTITY_QUATERNION) {
  scratchPosition.set(x, y, z);
  if (scale?.isVector3) scratchScale.copy(scale);
  else scratchScale.setScalar(scale);
  scratchMatrix.compose(scratchPosition, quaternion, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
}

function objectIsVisuallyActive(object, excludedRoot) {
  for (let current = object; current; current = current.parent) {
    if (current === excludedRoot) return false;
    if (current.visible === false) return false;
  }
  return object.userData?.lodBand !== 'ui'
    && object.userData?.presentationOnly !== true;
}

function classifyImpactMark(impact) {
  if (impact.explosiveEffect) return 'heBlast';
  if (impact.ricocheted) return 'ricochet';
  if (impact.penetrated) return 'penetration';
  return 'stopped';
}

function resolveVisibleImpact(record, impact) {
  record.mesh.updateWorldMatrix(true, true);
  const authoritativePoint = scratchPosition.fromArray(impact.impactPosition);
  const incoming = impact.impactVelocity;
  if (Array.isArray(incoming) && incoming.length >= 3) {
    scratchImpactDirection.fromArray(incoming);
  } else if (Array.isArray(impact.impactNormal) && impact.impactNormal.length >= 3) {
    scratchImpactDirection.fromArray(impact.impactNormal).negate();
  } else {
    scratchImpactDirection.set(0, 0, -1);
  }
  if (scratchImpactDirection.lengthSq() <= 1e-9) scratchImpactDirection.set(0, 0, -1);
  scratchImpactDirection.normalize();

  const projectionDistance = Math.max(
    record.dimensions.length,
    record.dimensions.width,
    record.dimensions.height,
    1
  );
  scratchRaycaster.near = 0;
  scratchRaycaster.far = projectionDistance * 2.5;
  scratchRaycaster.set(
    scratchImpactNormal.copy(authoritativePoint)
      .addScaledVector(scratchImpactDirection, -projectionDistance),
    scratchImpactDirection
  );
  const visualHit = scratchRaycaster.intersectObject(record.mesh, true).find(hit =>
    hit.object?.isMesh
    && objectIsVisuallyActive(hit.object, record.root)
  );

  let projected = false;
  if (visualHit?.face) {
    scratchPosition.copy(visualHit.point);
    scratchImpactNormal.copy(visualHit.face.normal)
      .transformDirection(visualHit.object.matrixWorld)
      .normalize();
    projected = true;
  } else {
    scratchPosition.copy(authoritativePoint);
    if (Array.isArray(impact.impactNormal) && impact.impactNormal.length >= 3) {
      scratchImpactNormal.fromArray(impact.impactNormal).normalize();
    } else {
      scratchImpactNormal.copy(scratchImpactDirection).negate();
    }
  }

  // Lift the flat indicator just off the visible armor to avoid z-fighting.
  scratchPosition.addScaledVector(scratchImpactNormal, 0.008);
  record.mesh.worldToLocal(scratchPosition);
  record.mesh.getWorldQuaternion(scratchWorldQuaternion).invert();
  scratchImpactNormal.applyQuaternion(scratchWorldQuaternion).normalize();
  scratchImpactQuaternion.setFromUnitVectors(FORWARD, scratchImpactNormal);
  return {
    position: scratchPosition,
    quaternion: scratchImpactQuaternion,
    projected
  };
}

function effectAnchor(dimensions) {
  return new THREE.Vector3(
    0,
    Math.max(0.75, dimensions.height * 0.56),
    -dimensions.length * 0.31
  );
}

function resolveTurretRingLocal(mesh, turret, dimensions) {
  if (!turret) {
    return new THREE.Vector3(0, dimensions.height * 0.72, 0);
  }
  mesh.updateWorldMatrix(true, true);
  scratchPosition.set(0, 0, 0);
  turret.localToWorld(scratchPosition);
  mesh.worldToLocal(scratchPosition);
  return scratchPosition.clone();
}

function createRuntimeFireVents(dimensions) {
  return APPROXIMATE_FIRE_VENTS.map((vent, index) => ({
    id: `generic-envelope-fire-vent-${index + 1}`,
    dataQuality: 'RENDERER_APPROXIMATION',
    localPosition: new THREE.Vector3(
      vent.origin[0] * dimensions.width,
      vent.origin[1] * dimensions.height,
      vent.origin[2] * dimensions.length
    ),
    localDirection: new THREE.Vector3(...vent.direction).normalize(),
    position: new THREE.Vector3(),
    direction: new THREE.Vector3()
  }));
}

function isDescendantOf(object, ancestor) {
  for (let current = object?.parent; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function applyObjectLodVisibility(root, level) {
  if (!root) return;
  let hasProxy = false;
  root.traverse(object => {
    if (object.isMesh && object.userData.lodBand === 'proxy') hasProxy = true;
  });
  root.traverse(object => {
    if (!object.isMesh) return;
    const band = object.userData.lodBand;
    if (!band || band === 'ui') return;
    if (band === 'proxy') object.visible = level === 'low';
    else if (level === 'low') {
      // A few authored vehicles keep their far turret beside the detailed
      // turret instead of below it. Preserve a cheap core silhouette for the
      // detached body rather than making the popped turret disappear.
      object.visible = !hasProxy && band === 'core';
    } else if (level === 'core') object.visible = band === 'core';
    else if (level === 'medium') object.visible = band !== 'high';
    else object.visible = true;
  });
}

export class VehicleDamageEffects {
  constructor({ vfxProvider, vfxRuntime = null } = {}) {
    this.records = new Map();
    this.processedImpacts = new Set();
    this.elapsedSeconds = 0;
    this.vfxProvider = validateBattlefieldVfxProvider(vfxProvider);
    this.vfxRuntime = vfxRuntime
      ? validateBattlefieldVfxRuntime(vfxRuntime)
      : null;
    this.vfxResources = validateVehicleDamageVfxResourceSet(
      this.vfxProvider.createVehicleDamageResources()
    );
    this.vfxAssetBinding = this.vfxResources.assetBinding ?? null;
    this.geometries = this.vfxResources.geometries;
    this.materials = this.vfxResources.materials;
    this.capacities = this.vfxResources.capacities;
  }

  register(unit) {
    if (!unit?.vehicleSpec || !unit.mesh) return null;
    const existing = this.records.get(unit.id);
    if (existing?.mesh === unit.mesh) return existing;
    if (existing) this.removeRecord(existing);

    const dimensions = unit.mesh.userData.modelMetadata?.dimensionsMeters
      ?? { length: 4.8, width: 2.2, height: 2.2 };
    const turret = unit.mesh.userData.turret ?? null;
    const turretRingLocal = resolveTurretRingLocal(unit.mesh, turret, dimensions);
    const root = new THREE.Group();
    root.name = `${unit.id}_VehicleDamageEffects`;
    root.userData.effectOwner = unit.id;
    root.userData.fireVentPolicy = Object.freeze({
      id: 'generic-envelope-fire-vents-v1',
      dataQuality: 'RENDERER_APPROXIMATION',
      authoredVehicleMarkers: false
    });
    if (this.vfxAssetBinding) {
      root.userData.assetBinding = this.vfxAssetBinding;
      unit.mesh.userData.assetBindings ??= {};
      unit.mesh.userData.assetBindings.vehicleDamageVfx = this.vfxAssetBinding;
    }

    const smoke = disableRaycast(createPersistentEffectObject(
      this.geometries.smoke,
      this.materials.smoke,
      this.capacities.smoke
    ));
    smoke.name = 'EngineSmoke';
    if (smoke.userData.isSpriteCluster) {
      for (const sprite of smoke.children) sprite.center.set(0.5, 0.08);
    }

    const flames = disableRaycast(createPersistentEffectObject(
      this.geometries.flame,
      this.materials.flame,
      this.capacities.flame
    ));
    flames.name = 'VehicleFire';
    if (flames.userData.isSpriteCluster) {
      for (const sprite of flames.children) sprite.center.set(0.5, 0.08);
    }

    const sparks = disableRaycast(new THREE.InstancedMesh(
      this.geometries.spark,
      this.materials.spark,
      this.capacities.spark
    ));
    sparks.name = 'DamageSparks';
    sparks.count = 0;

    const scorch = disableRaycast(new THREE.InstancedMesh(
      this.geometries.scorch,
      this.materials.scorch,
      this.capacities.scorch
    ));
    scorch.name = 'ArmorScorchMarks';
    scorch.count = 0;

    const blastMaterial = this.vfxResources.createBlastMaterial();
    if (!blastMaterial?.isMaterial) {
      throw new TypeError('vehicle-damage VFX blast material must be a Three.js material');
    }
    const blast = disableRaycast(
      blastMaterial.isSpriteNodeMaterial
        ? new THREE.Sprite(blastMaterial)
        : new THREE.Mesh(this.geometries.blast, blastMaterial)
    );
    blast.name = 'VehicleSecondaryExplosion';
    blast.position.copy(effectAnchor(dimensions));
    blast.visible = false;

    root.add(smoke, flames, sparks, scorch, blast);
    unit.mesh.add(root);
    unit.mesh.userData.damageEffects = root;

    const record = {
      unit,
      mesh: unit.mesh,
      root,
      smoke,
      flames,
      sparks,
      scorch,
      blast,
      blastMaterial,
      dimensions,
      anchor: effectAnchor(dimensions),
      turretRingLocal,
      runtimeTurretRingPosition: new THREE.Vector3(),
      runtimeBlastLocal: new THREE.Vector3(0, dimensions.height * 0.72, 0),
      runtimeBlastPosition: new THREE.Vector3(),
      runtimeFireVents: createRuntimeFireVents(dimensions),
      scorchCursor: 0,
      impactMarkTypes: Array(this.capacities.scorch).fill(null),
      impactTimer: 0,
      explosionTimer: 0,
      explosionKind: null,
      impactLocal: new THREE.Vector3(),
      lastBurning: false,
      lastDestroyed: false,
      lastSecondaryExplosion: false,
      barrelRestRotationX: unit.mesh.userData.barrel?.rotation.x ?? 0,
      turret,
      turretRestPosition: turret?.position.clone() ?? null,
      turretRestQuaternion: turret?.quaternion.clone() ?? null,
      externalProxyTurretParts: [],
      turretWasSeparated: false,
      rustMaterials: null,
      rustMaterialAssignments: null,
      runtimeOwnsTransient: false
    };
    if (record.turret) {
      unit.mesh.traverse(object => {
        if (
          object !== record.turret
          && object.userData?.lodBand === 'proxy'
          && /turret|cupola|roofboss/i.test(object.name)
          && !isDescendantOf(object, record.turret)
        ) {
          record.externalProxyTurretParts.push(object);
        }
      });
    }
    this.records.set(unit.id, record);
    return record;
  }

  removeRecord(record) {
    if (record.root.parent) record.root.parent.remove(record.root);
    disposeIndependentSpriteMaterials(record.smoke);
    disposeIndependentSpriteMaterials(record.flames);
    disposeWreckRustMaterials(record);
    record.blastMaterial?.dispose();
    if (record.mesh?.userData.damageEffects === record.root) {
      delete record.mesh.userData.damageEffects;
    }
    if (
      this.vfxAssetBinding
      && record.mesh?.userData.assetBindings?.vehicleDamageVfx === this.vfxAssetBinding
    ) {
      delete record.mesh.userData.assetBindings.vehicleDamageVfx;
    }
  }

  addImpact(record, impact) {
    const visibleImpact = resolveVisibleImpact(record, impact);
    record.impactLocal.copy(visibleImpact.position);
    const slot = record.scorchCursor % record.scorch.instanceMatrix.count;
    const markType = classifyImpactMark(impact);
    const style = IMPACT_MARK_STYLES[markType];
    scratchImpactScale.fromArray(style.scale);
    setInstance(
      record.scorch,
      slot,
      record.impactLocal.x,
      record.impactLocal.y,
      record.impactLocal.z,
      scratchImpactScale,
      visibleImpact.quaternion
    );
    record.scorch.setColorAt(slot, scratchImpactColor.setHex(style.color));
    record.impactMarkTypes[slot] = Object.freeze({
      type: markType,
      projectedToVisualSurface: visibleImpact.projected
    });
    record.scorchCursor++;
    record.scorch.count = Math.min(
      record.scorch.instanceMatrix.count,
      Math.max(record.scorch.count, slot + 1)
    );
    record.scorch.instanceMatrix.needsUpdate = true;
    record.scorch.instanceColor.needsUpdate = true;
    record.impactTimer = impact.penetrated ? 0.42 : 0.2;
  }

  processImpacts(impacts) {
    for (const impact of impacts ?? []) {
      if (impact.kind !== 'vehicle' || impact.targetId == null) continue;
      const key = impact.impactId != null
        ? `impact:${impact.impactId}`
        : `shot:${impact.id}:${impact.targetId}`;
      if (this.processedImpacts.has(key)) continue;
      this.processedImpacts.add(key);
      const record = this.records.get(impact.targetId);
      if (record) this.addImpact(record, impact);
    }
    if (this.processedImpacts.size > 512) {
      const newest = [...this.processedImpacts].slice(-256);
      this.processedImpacts = new Set(newest);
    }
  }

  updatePersistentEffects(record, damage, delta) {
    const shouldSmoke = damage.burning
      || damage.destroyed
      || DAMAGED_STATES.has(damage.components.engine.state);
    const lowDetail = record.unit.currentLOD === 'low';
    const smokeCapacity = this.capacities.smoke;
    const flameCapacity = this.capacities.flame;
    // Build like a bottle-rocket exhaust, but reserve fully extended pressure
    // jets for the final sliver before cookoff instead of a stable fire state.
    const ventBuild = damage.firePhase === 'AMMUNITION_VENTING'
      ? cookoffVentBuild(damage.fireVentProgress)
      : 0;
    const smokeCount = shouldSmoke
      ? (lowDetail
          ? Math.min(4, smokeCapacity)
          : Math.max(4, Math.ceil(smokeCapacity * (0.58 + damage.fireIntensity * 0.42))))
      : 0;
    const flameCount = !damage.burning
      ? 0
      : (damage.firePhase === 'DETONATED'
          ? Math.min(lowDetail ? 3 : 7, flameCapacity)
          : (damage.firePhase === 'AMMUNITION_VENTING'
              ? Math.min(
                  lowDetail ? 4 : (7 + Math.ceil(ventBuild * 5)),
                  flameCapacity
                )
              : (lowDetail
                  ? Math.min(3, flameCapacity)
                  : Math.max(1, Math.ceil(flameCapacity * damage.fireIntensity)))));

    const ignitionTransition = damage.burning && !record.lastBurning;
    const destructionTransition = damage.destroyed && !record.lastDestroyed;
    const detonationTransition = damage.secondaryExplosion
      && !record.lastSecondaryExplosion;
    let runtimeOwnsTransient = false;
    if (this.vfxRuntime) {
      record.mesh.updateWorldMatrix(true, false);
      scratchPosition.copy(record.anchor);
      record.mesh.localToWorld(scratchPosition);
      record.runtimeBlastPosition.copy(record.runtimeBlastLocal);
      record.mesh.localToWorld(record.runtimeBlastPosition);
      record.runtimeTurretRingPosition.copy(record.turretRingLocal);
      record.mesh.localToWorld(record.runtimeTurretRingPosition);
      record.mesh.getWorldQuaternion(scratchWorldQuaternion);
      for (const vent of record.runtimeFireVents) {
        vent.position.copy(vent.localPosition);
        record.mesh.localToWorld(vent.position);
        vent.direction.copy(vent.localDirection)
          .applyQuaternion(scratchWorldQuaternion)
          .normalize();
      }
      runtimeOwnsTransient = this.vfxRuntime.emitVehicleDamageState({
        unitId: record.unit.id,
        position: scratchPosition,
        blastPosition: record.runtimeBlastPosition,
        turretRingPosition: record.runtimeTurretRingPosition,
        vents: record.runtimeFireVents,
        dimensions: record.dimensions,
        delta,
        shouldSmoke,
        burning: damage.burning,
        fireIntensity: damage.fireIntensity,
        firePhase: damage.firePhase,
        fireVentProgress: damage.fireVentProgress,
        firePostBlastProgress: damage.firePostBlastProgress,
        lowDetail,
        ignitionTransition,
        destructionTransition,
        detonationTransition
      });
    }
    record.runtimeOwnsTransient = runtimeOwnsTransient;
    const legacySmokeCount = runtimeOwnsTransient ? 0 : smokeCount;
    const legacyFlameCount = runtimeOwnsTransient ? 0 : flameCount;

    if (record.smoke.userData.isSpriteCluster) {
      if (legacySmokeCount > 0) ensureIndependentSpriteMaterials(record.smoke);
      const count = setSpriteClusterCount(record.smoke, legacySmokeCount);
      const smokeRate = damage.firePhase === 'AMMUNITION_VENTING' ? 0.34 : 0.19;
      for (let index = 0; index < count; index++) {
        const phase = (this.elapsedSeconds * smokeRate + index / count) % 1;
        const source = index % 3;
        const sourceX = (source - 1) * record.dimensions.width * 0.08;
        const sourceZ = source === 2
          ? -record.dimensions.length * 0.06
          : -record.dimensions.length * 0.24;
        const width = record.dimensions.width
          * (0.52 + phase * 1.18)
          * (0.88 + ((index * 7) % 5) * 0.045);
        const height = record.dimensions.height
          * (0.82 + phase * 1.62)
          * (0.9 + damage.fireIntensity * 0.24);
        const fadeIn = smoothstepValue(0, 0.16, phase);
        const fadeOut = 1 - smoothstepValue(0.48, 1, phase);
        setSpriteParticle(
          record.smoke,
          index,
          sourceX + Math.sin(index * 2.47 + this.elapsedSeconds * 0.63)
            * record.dimensions.width * phase * 0.48,
          record.dimensions.height * (0.54 + phase * 1.32),
          sourceZ + Math.cos(index * 1.91 + this.elapsedSeconds * 0.41)
            * record.dimensions.width * phase * 0.16,
          width,
          height,
          Math.sin(index * 1.7) * 0.045,
          fadeIn * fadeOut * (0.72 + damage.fireIntensity * 0.2)
        );
      }
    } else {
      record.smoke.count = legacySmokeCount;
      for (let index = 0; index < legacySmokeCount; index++) {
        const phase = (this.elapsedSeconds * 0.29 + index / legacySmokeCount) % 1;
        const spread = 0.13 + phase * 0.42;
        setInstance(
          record.smoke,
          index,
          record.anchor.x + Math.sin(index * 2.47 + this.elapsedSeconds * 0.7) * spread,
          record.anchor.y + phase * record.dimensions.height * 1.25,
          record.anchor.z + Math.cos(index * 1.91 + this.elapsedSeconds * 0.5) * spread,
          0.45 + phase * 1.35
        );
      }
      if (legacySmokeCount > 0) record.smoke.instanceMatrix.needsUpdate = true;
    }

    if (record.flames.userData.isSpriteCluster) {
      if (legacyFlameCount > 0) ensureIndependentSpriteMaterials(record.flames);
      const layerRemoval = damage.firePhase === 'DETONATED'
        ? smoothstepValue(0.28, 0.86, damage.firePostBlastProgress)
        : 0;
      const presentedFlameCount = legacyFlameCount === 0
        ? 0
        : damage.firePhase === 'DETONATED'
        ? Math.max(0, 1 + Math.floor((legacyFlameCount - 1) * (1 - layerRemoval)))
        : legacyFlameCount;
      const count = setSpriteClusterCount(record.flames, presentedFlameCount);
      if (damage.firePhase === 'DETONATED') {
        const postFireEnvelope = smoothstepValue(0, 0.012, damage.firePostBlastProgress);
        const finalLayerScale = count === 1
          ? 1 - smoothstepValue(0.86, 1, damage.firePostBlastProgress)
          : 1;
        for (let index = 0; index < count; index++) {
          const phase = (this.elapsedSeconds * 1.65 + index / legacyFlameCount) % 1;
          const fadeIn = smoothstepValue(0, 0.12, phase);
          const fadeOut = 1 - smoothstepValue(0.68, 1, phase);
          const pulse = 0.82 + Math.sin(this.elapsedSeconds * 17 + index * 2.3) * 0.16;
          setSpriteParticle(
            record.flames,
            index,
            record.turretRingLocal.x
              + Math.sin(index * 2.17) * record.dimensions.width * 0.24,
            record.turretRingLocal.y + record.dimensions.height * phase * 0.72,
            record.turretRingLocal.z
              + Math.cos(index * 1.83) * record.dimensions.width * 0.12,
            record.dimensions.width * (0.58 + phase * 0.5) * pulse * finalLayerScale,
            record.dimensions.height * (1.35 + phase * 1.1) * pulse * finalLayerScale,
            Math.sin(index * 1.37) * 0.11,
            fadeIn * fadeOut * postFireEnvelope * finalLayerScale
          );
        }
      } else {
        const ventCount = damage.firePhase === 'AMMUNITION_VENTING'
          ? APPROXIMATE_FIRE_VENTS.length
          : (damage.firePhase === 'SPREADING_FIRE' ? 5 : 3);
        const speed = damage.firePhase === 'AMMUNITION_VENTING' ? 8.8 : 3.9;
        const jetLength = Math.max(record.dimensions.width, record.dimensions.height)
          * (damage.firePhase === 'AMMUNITION_VENTING'
              ? (0.18 + ventBuild * 1.34)
              : (0.32 + damage.fireIntensity * 0.54));
        for (let index = 0; index < count; index++) {
          const vent = APPROXIMATE_FIRE_VENTS[index % ventCount];
          const layer = Math.floor(index / ventCount);
          const pulse = 0.78
            + Math.sin(this.elapsedSeconds * speed * 4.1 + index * 2.1) * 0.18;
          const originX = vent.origin[0] * record.dimensions.width;
          const originY = vent.origin[1] * record.dimensions.height;
          const originZ = vent.origin[2] * record.dimensions.length;
          const streamOffset = jetLength * (0.025 + layer * 0.035);
          const width = record.dimensions.width
            * (damage.firePhase === 'AMMUNITION_VENTING'
                ? (0.065 + ventBuild * 0.13 + layer * 0.025)
                : (0.12 + layer * 0.03))
            * pulse;
          const height = jetLength
            * (0.62 + ventBuild * 0.42 + layer * 0.14)
            * pulse;
          setSpriteParticle(
            record.flames,
            index,
            originX + vent.direction[0] * streamOffset,
            originY + vent.direction[1] * streamOffset,
            originZ + vent.direction[2] * streamOffset,
            width,
            height,
            Math.atan2(vent.direction[0], Math.max(0.15, vent.direction[1])),
            0.66 + ventBuild * 0.34
          );
        }
      }
    } else {
      record.flames.count = legacyFlameCount;
      for (let index = 0; index < legacyFlameCount; index++) {
        const phase = (this.elapsedSeconds * (2.1 + index * 0.07) + index * 0.17) % 1;
        setInstance(
          record.flames,
          index,
          record.anchor.x + Math.sin(index * 3.1) * 0.28,
          record.anchor.y + 0.18 + phase * 0.52,
          record.anchor.z + Math.cos(index * 2.3) * 0.24,
          0.58 + (1 - phase) * 0.72
        );
      }
      if (legacyFlameCount > 0) record.flames.instanceMatrix.needsUpdate = true;
    }

    if (ignitionTransition) {
      record.explosionTimer = 0.55;
      record.explosionKind = 'IGNITION';
    }
    if (destructionTransition) {
      record.explosionTimer = 1.05;
      record.explosionKind = 'DESTRUCTION';
    }
    if (detonationTransition) {
      record.explosionTimer = 1.8;
      record.explosionKind = 'COOKOFF';
    }
    record.lastBurning = damage.burning;
    record.lastDestroyed = damage.destroyed;
    record.lastSecondaryExplosion = damage.secondaryExplosion;

    const barrel = record.unit.mesh.userData.barrel;
    if (barrel) {
      const gunDisabled = DESTROYED_STATES.has(damage.components.mainGun.state)
        || DESTROYED_STATES.has(damage.components.gunBreech.state);
      const target = record.barrelRestRotationX + (gunDisabled ? 0.14 : 0);
      const alpha = 1 - Math.exp(-4.5 * Math.max(0, delta));
      barrel.rotation.x = THREE.MathUtils.lerp(barrel.rotation.x, target, alpha);
    }
  }

  syncTurretPhysics(record) {
    if (!record.turret || !record.turretRestPosition || !record.turretRestQuaternion) {
      return;
    }
    const state = record.unit.vehiclePhysics?.turret;
    const separated = state?.status != null && state.status !== 'ATTACHED';
    if (!separated) {
      if (!record.turretWasSeparated) return;
      record.turret.position.copy(record.turretRestPosition);
      scratchTurretYaw.setFromAxisAngle(
        UP,
        record.unit.vehicleWeapon?.turretYaw ?? 0
      );
      record.turret.quaternion
        .copy(record.turretRestQuaternion)
        .multiply(scratchTurretYaw);
      applyObjectLodVisibility(record.turret, record.unit.currentLOD ?? 'high');
      for (const object of record.externalProxyTurretParts) {
        object.visible = record.unit.currentLOD === 'low';
      }
      record.turretWasSeparated = false;
      return;
    }

    record.turret.position.set(
      record.turretRestPosition.x + state.offset[0],
      record.turretRestPosition.y + state.offset[1],
      record.turretRestPosition.z + state.offset[2]
    );
    scratchTurretYaw.setFromAxisAngle(UP, state.baseYaw);
    scratchTurretEuler.set(
      state.rotation[0],
      state.rotation[1],
      state.rotation[2],
      'XYZ'
    );
    scratchTurretRotation.setFromEuler(scratchTurretEuler);
    record.turret.quaternion
      .copy(record.turretRestQuaternion)
      .multiply(scratchTurretYaw)
      .multiply(scratchTurretRotation);
    applyObjectLodVisibility(record.turret, record.unit.currentLOD ?? 'high');
    for (const object of record.externalProxyTurretParts) object.visible = false;
    record.turretWasSeparated = true;
  }

  updateBurst(record, damage, delta) {
    record.impactTimer = Math.max(0, record.impactTimer - delta);
    record.explosionTimer = Math.max(0, record.explosionTimer - delta);
    if (record.runtimeOwnsTransient) {
      record.sparks.count = 0;
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
      setProceduralVfxProgress(record.blastMaterial, 1);
      return;
    }
    const explosionDuration = record.explosionKind === 'COOKOFF'
      ? 1.8
      : (record.explosionKind === 'IGNITION' ? 0.55 : 1.05);
    if (record.explosionTimer > 0) {
      const progress = THREE.MathUtils.clamp(
        1 - record.explosionTimer / explosionDuration,
        0,
        1
      );
      const envelope = Math.sin(progress * Math.PI);
      const vehicleScale = Math.max(
        record.dimensions.length,
        record.dimensions.width,
        record.dimensions.height
      );
      const peakScale = record.explosionKind === 'COOKOFF'
        ? vehicleScale * 3.4
        : (record.explosionKind === 'IGNITION'
            ? vehicleScale * 0.72
            : vehicleScale * 1.35);
      record.blast.visible = true;
      record.blast.scale.setScalar(vehicleScale * 0.12 + envelope * peakScale);
      if (!setProceduralVfxProgress(record.blastMaterial, progress)) {
        record.blastMaterial.opacity = envelope * 0.92;
      }
    } else {
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
      setProceduralVfxProgress(record.blastMaterial, 1);
    }
    const activeTimer = Math.max(record.impactTimer, record.explosionTimer);
    if (activeTimer <= 0) {
      const ventBuild = damage.firePhase === 'AMMUNITION_VENTING'
        ? cookoffVentBuild(damage.fireVentProgress)
        : 0;
      const pressureShower = ventBuild > 0;
      const ventSparkCount = pressureShower
        ? Math.min(
            this.capacities.spark,
            10 + Math.ceil(ventBuild * (this.capacities.spark - 10))
          )
        : (damage.burning
            ? Math.min(record.unit.currentLOD === 'low' ? 3 : 6, this.capacities.spark)
            : 0);
      record.sparks.count = ventSparkCount;
      for (let index = 0; index < ventSparkCount; index++) {
        const phase = (
          this.elapsedSeconds * (pressureShower ? 3.8 : 0.72)
          + index / ventSparkCount
        ) % 1;
        const vent = APPROXIMATE_FIRE_VENTS[index % APPROXIMATE_FIRE_VENTS.length];
        const seamAngle = index * 2.399963;
        const travelAngle = pressureShower
          ? seamAngle + Math.sin(this.elapsedSeconds * 11.3 + index * 1.7) * 0.16
          : Math.atan2(vent.direction[0], vent.direction[2]);
        const sourceX = pressureShower
          ? Math.cos(seamAngle) * record.dimensions.width * 0.24
          : vent.origin[0] * record.dimensions.width;
        const sourceY = pressureShower
          ? record.dimensions.height * 0.56
          : vent.origin[1] * record.dimensions.height;
        const sourceZ = pressureShower
          ? Math.sin(seamAngle) * record.dimensions.width * 0.18
          : vent.origin[2] * record.dimensions.length;
        const travel = pressureShower
          ? record.dimensions.width
            * (0.08 + ventBuild * 0.58)
            * (0.35 + phase * 0.65)
          : record.dimensions.width * (0.04 + phase * 0.16);
        setInstance(
          record.sparks,
          index,
          sourceX + Math.sin(travelAngle) * travel,
          sourceY + record.dimensions.height * phase
            * (pressureShower ? (0.27 + ventBuild * 0.42) : 0.34),
          sourceZ + Math.cos(travelAngle) * travel,
          Math.max(
            0.035,
            (1 - phase) * (pressureShower ? (0.1 + ventBuild * 0.22) : 0.11)
          )
        );
      }
      if (ventSparkCount > 0) record.sparks.instanceMatrix.needsUpdate = true;
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
      setProceduralVfxProgress(record.blastMaterial, 1);
      return;
    }

    const exploding = record.explosionTimer > record.impactTimer;
    const duration = exploding ? explosionDuration : 0.42;
    const progress = THREE.MathUtils.clamp(1 - activeTimer / duration, 0, 1);
    const catastrophic = exploding && record.explosionKind === 'COOKOFF';
    const count = Math.min(
      this.capacities.spark,
      exploding ? (catastrophic ? this.capacities.spark : 14) : 8
    );
    const origin = exploding ? record.anchor : record.impactLocal;
    record.sparks.count = count;
    for (let index = 0; index < count; index++) {
      const angle = index * 2.399963;
      const lift = 0.25 + ((index * 7) % 11) / 11;
      const burstRadius = catastrophic
        ? Math.max(record.dimensions.length, record.dimensions.width) * 1.35
        : (exploding ? 2.5 : 0.85);
      const radius = (0.18 + progress * burstRadius) * (0.7 + lift * 0.4);
      setInstance(
        record.sparks,
        index,
        origin.x + Math.cos(angle) * radius,
        origin.y + lift * radius - progress * progress * 0.8,
        origin.z + Math.sin(angle) * radius,
        Math.max(
          0.1,
          (1 - progress) * (catastrophic ? 2.4 : (exploding ? 1.5 : 0.8))
        )
      );
    }
    record.sparks.instanceMatrix.needsUpdate = true;
  }

  update(delta, units, impacts = []) {
    const boundedDelta = THREE.MathUtils.clamp(delta, 0, 0.1);
    this.elapsedSeconds += boundedDelta;

    for (const unit of units ?? []) {
      if (unit?.vehicleSpec) this.register(unit);
    }
    this.processImpacts(impacts);

    for (const record of this.records.values()) {
      const damage = getVehicleVisualDamage(record.unit);
      this.updatePersistentEffects(record, damage, boundedDelta);
      updateWreckRust(record, damage);
      this.syncTurretPhysics(record);
      this.updateBurst(record, damage, boundedDelta);
      record.root.visible = damage.damaged
        || damage.burning
        || damage.destroyed
        || record.impactTimer > 0
        || record.explosionTimer > 0
        || record.scorch.count > 0;
    }
  }

  resetTransient() {
    this.processedImpacts.clear();
    this.vfxRuntime?.clear();
    for (const record of this.records.values()) {
      record.impactTimer = 0;
      record.explosionTimer = 0;
      record.explosionKind = null;
      record.sparks.count = 0;
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
      setProceduralVfxProgress(record.blastMaterial, 1);
      record.scorch.count = 0;
      record.scorchCursor = 0;
      record.impactMarkTypes.fill(null);
      // Restore establishes a new presentation baseline. Persistent smoke,
      // flame, and scars rebuild from restored state/telemetry on update, but
      // transition-only blasts must not replay for damage already in that
      // snapshot.
      const damage = getVehicleVisualDamage(record.unit);
      record.lastBurning = damage.burning;
      record.lastDestroyed = damage.destroyed;
      record.lastSecondaryExplosion = damage.secondaryExplosion;
      record.runtimeOwnsTransient = false;
      this.syncTurretPhysics(record);
    }
  }

  dispose() {
    for (const record of this.records.values()) this.removeRecord(record);
    this.records.clear();
    this.vfxResources.dispose();
  }
}
