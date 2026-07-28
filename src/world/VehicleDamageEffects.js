import * as THREE from 'three';
import {
  validateBattlefieldVfxProvider,
  validateVehicleDamageVfxResourceSet
} from './vfx/BattlefieldVfxContract.js';

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
const UP = new THREE.Vector3(0, 1, 0);

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

  return {
    components,
    burning,
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

function setInstance(mesh, index, x, y, z, scale, quaternion = IDENTITY_QUATERNION) {
  scratchPosition.set(x, y, z);
  scratchScale.setScalar(scale);
  scratchMatrix.compose(scratchPosition, quaternion, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
}

function effectAnchor(dimensions) {
  return new THREE.Vector3(
    0,
    Math.max(0.75, dimensions.height * 0.56),
    -dimensions.length * 0.31
  );
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
  constructor({ vfxProvider } = {}) {
    this.records = new Map();
    this.processedImpacts = new Set();
    this.elapsedSeconds = 0;
    this.vfxProvider = validateBattlefieldVfxProvider(vfxProvider);
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
    const root = new THREE.Group();
    root.name = `${unit.id}_VehicleDamageEffects`;
    root.userData.effectOwner = unit.id;
    if (this.vfxAssetBinding) {
      root.userData.assetBinding = this.vfxAssetBinding;
      unit.mesh.userData.assetBindings ??= {};
      unit.mesh.userData.assetBindings.vehicleDamageVfx = this.vfxAssetBinding;
    }

    const smoke = disableRaycast(new THREE.InstancedMesh(
      this.geometries.smoke,
      this.materials.smoke,
      this.capacities.smoke
    ));
    smoke.name = 'EngineSmoke';
    smoke.count = 0;

    const flames = disableRaycast(new THREE.InstancedMesh(
      this.geometries.flame,
      this.materials.flame,
      this.capacities.flame
    ));
    flames.name = 'VehicleFire';
    flames.count = 0;

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
    const blast = disableRaycast(new THREE.Mesh(this.geometries.blast, blastMaterial));
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
      scorchCursor: 0,
      impactTimer: 0,
      explosionTimer: 0,
      impactLocal: new THREE.Vector3(),
      lastBurning: false,
      lastDestroyed: false,
      lastSecondaryExplosion: false,
      barrelRestRotationX: unit.mesh.userData.barrel?.rotation.x ?? 0,
      turret: unit.mesh.userData.turret ?? null,
      turretRestPosition: unit.mesh.userData.turret?.position.clone() ?? null,
      turretRestQuaternion: unit.mesh.userData.turret?.quaternion.clone() ?? null,
      externalProxyTurretParts: [],
      turretWasSeparated: false
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
    record.mesh.updateWorldMatrix(true, true);
    record.impactLocal.fromArray(impact.impactPosition);
    record.mesh.worldToLocal(record.impactLocal);
    const slot = record.scorchCursor % record.scorch.instanceMatrix.count;
    const scale = impact.penetrated ? 1.35 : 0.85;
    setInstance(
      record.scorch,
      slot,
      record.impactLocal.x,
      record.impactLocal.y,
      record.impactLocal.z,
      scale
    );
    record.scorchCursor++;
    record.scorch.count = Math.min(
      record.scorch.instanceMatrix.count,
      Math.max(record.scorch.count, slot + 1)
    );
    record.scorch.instanceMatrix.needsUpdate = true;
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
    const smokeCount = shouldSmoke
      ? (record.unit.currentLOD === 'low'
          ? Math.min(4, this.capacities.smoke)
          : this.capacities.smoke)
      : 0;
    const flameCount = damage.burning
      ? (record.unit.currentLOD === 'low'
          ? Math.min(3, this.capacities.flame)
          : this.capacities.flame)
      : 0;

    record.smoke.count = smokeCount;
    record.flames.count = flameCount;

    for (let index = 0; index < smokeCount; index++) {
      const phase = (this.elapsedSeconds * 0.29 + index / smokeCount) % 1;
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
    if (smokeCount > 0) record.smoke.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < flameCount; index++) {
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
    if (flameCount > 0) record.flames.instanceMatrix.needsUpdate = true;

    if (damage.burning && !record.lastBurning) record.explosionTimer = 0.75;
    if (damage.destroyed && !record.lastDestroyed) record.explosionTimer = 1.05;
    if (damage.secondaryExplosion && !record.lastSecondaryExplosion) {
      record.explosionTimer = 1.05;
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

  updateBurst(record, delta) {
    record.impactTimer = Math.max(0, record.impactTimer - delta);
    record.explosionTimer = Math.max(0, record.explosionTimer - delta);
    if (record.explosionTimer > 0) {
      const progress = THREE.MathUtils.clamp(1 - record.explosionTimer / 1.05, 0, 1);
      record.blast.visible = true;
      record.blast.scale.setScalar(0.35 + Math.sin(progress * Math.PI) * 2.4);
      record.blastMaterial.opacity = Math.sin(progress * Math.PI) * 0.82;
    } else {
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
    }
    const activeTimer = Math.max(record.impactTimer, record.explosionTimer);
    if (activeTimer <= 0) {
      record.sparks.count = 0;
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
      return;
    }

    const exploding = record.explosionTimer > record.impactTimer;
    const duration = exploding ? 1.05 : 0.42;
    const progress = THREE.MathUtils.clamp(1 - activeTimer / duration, 0, 1);
    const count = Math.min(this.capacities.spark, exploding ? 14 : 8);
    const origin = exploding ? record.anchor : record.impactLocal;
    record.sparks.count = count;
    for (let index = 0; index < count; index++) {
      const angle = index * 2.399963;
      const lift = 0.25 + ((index * 7) % 11) / 11;
      const radius = (0.18 + progress * (exploding ? 2.5 : 0.85)) * (0.7 + lift * 0.4);
      setInstance(
        record.sparks,
        index,
        origin.x + Math.cos(angle) * radius,
        origin.y + lift * radius - progress * progress * 0.8,
        origin.z + Math.sin(angle) * radius,
        Math.max(0.1, (1 - progress) * (exploding ? 1.5 : 0.8))
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
      this.syncTurretPhysics(record);
      this.updateBurst(record, boundedDelta);
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
    for (const record of this.records.values()) {
      record.impactTimer = 0;
      record.explosionTimer = 0;
      record.sparks.count = 0;
      record.blast.visible = false;
      record.blastMaterial.opacity = 0;
      record.scorch.count = 0;
      record.scorchCursor = 0;
      // Restore establishes a new presentation baseline. Persistent smoke,
      // flame, and scars rebuild from restored state/telemetry on update, but
      // transition-only blasts must not replay for damage already in that
      // snapshot.
      const damage = getVehicleVisualDamage(record.unit);
      record.lastBurning = damage.burning;
      record.lastDestroyed = damage.destroyed;
      record.lastSecondaryExplosion = damage.secondaryExplosion;
      this.syncTurretPhysics(record);
    }
  }

  dispose() {
    for (const record of this.records.values()) this.removeRecord(record);
    this.records.clear();
    this.vfxResources.dispose();
  }
}
