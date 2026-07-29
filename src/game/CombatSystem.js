import * as THREE from 'three';
import { BallisticsSystem } from './BallisticsSystem.js';
import {
  localToWorldPoint,
  worldToLocalPoint
} from '../simulation/buildings/BuildingTransforms.js';
import {
  validateBattlefieldVfxProvider,
  validateCombatVfxResourceSet
} from '../world/vfx/BattlefieldVfxContract.js';
import {
  createWeaponReportEvent
} from '../simulation/observation/SoundContacts.js';
import {
  getInfantryAimPoint
} from '../simulation/infantry/InfantryHitVolumes.js';
import {
  getVehicleArmorAimPoint
} from '../simulation/vehicles/VehicleArmorCollision.js';
import {
  setProceduralVfxProgress
} from '../world/vfx/ProceduralVfxNodes.js';
import {
  calculateLinearObstacleBlastDamage
} from '../simulation/terrain/DestructibleLinearObstacleSystem.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchAim = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchRicochetNormal = new THREE.Vector3();
const scratchDebrisPosition = new THREE.Vector3();
const PROJECTILE_SUBSTEP_EPSILON = 1e-8;
const MAX_PROJECTILE_CONTACTS_PER_SUBSTEP = 4;
const MAX_TRAJECTORY_POINTS = 128;
const BUILDING_DEBRIS_POSITION_SOURCES = Object.freeze({
  sectionCentroid: 'section-collider-centroid',
  buildingOriginFallback: 'building-origin-fallback'
});
const BUILDING_DEBRIS_SEVERITY_RANK = Object.freeze({
  damaged: 1,
  breached: 2,
  collapsed: 3
});
const EMPTY_BUILDING_DEBRIS_EVENTS = Object.freeze([]);

function selectBuildingDamageSoundEvent(events) {
  let selected = null;
  for (const event of events) {
    const rank = BUILDING_DEBRIS_SEVERITY_RANK[event?.severity] ?? 0;
    if (
      rank > (BUILDING_DEBRIS_SEVERITY_RANK[selected?.severity] ?? 0)
      || (
        rank === (BUILDING_DEBRIS_SEVERITY_RANK[selected?.severity] ?? 0)
        && rank > 0
        && String(event.sectionId).localeCompare(String(selected.sectionId)) < 0
      )
    ) {
      selected = event;
    }
  }
  return selected;
}

function finitePointArray(value) {
  const point = value?.toArray?.() ?? value;
  if (
    !Array.isArray(point)
    || point.length < 3
    || !point.slice(0, 3).every(Number.isFinite)
  ) {
    return null;
  }
  return [point[0], point[1], point[2]];
}

function buildingDebrisSeverity(result) {
  // `collapsed` is persistent section state in BuildingSystem results. A
  // repeated hit on an already-collapsed section reports collapsed=true with
  // applied=0, so only a result that applied new damage can describe a direct
  // damage/breach/collapse presentation event. Newly cascaded collapses arrive
  // separately through `collapsedSections`.
  if (!Number.isFinite(result?.applied) || result.applied <= 0) return null;
  if (result?.collapsed) return 'collapsed';
  if (result?.breached) return 'breached';
  return 'damaged';
}

function stableSectionCentroid(section) {
  const parts = [...(section?.colliderParts ?? [])]
    .filter(part => finitePointArray(part?.center))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (parts.length === 0) {
    return {
      localPosition: [0, 0, 0],
      positionSource: BUILDING_DEBRIS_POSITION_SOURCES.buildingOriginFallback
    };
  }
  if (parts.length === 1) {
    return {
      localPosition: [...parts[0].center],
      positionSource: BUILDING_DEBRIS_POSITION_SOURCES.sectionCentroid
    };
  }
  const centroid = [0, 0, 0];
  let totalWeight = 0;
  for (const part of parts) {
    const halfExtents = finitePointArray(part.halfExtents);
    const weight = halfExtents
      ? Math.max(Number.EPSILON, halfExtents[0] * halfExtents[1] * halfExtents[2])
      : 1;
    centroid[0] += part.center[0] * weight;
    centroid[1] += part.center[1] * weight;
    centroid[2] += part.center[2] * weight;
    totalWeight += weight;
  }
  return {
    localPosition: centroid.map(component => component / totalWeight),
    positionSource: BUILDING_DEBRIS_POSITION_SOURCES.sectionCentroid
  };
}

function validBuildingDebrisStyle(style) {
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

function appendTrajectoryPoint(projectile, point, force = false) {
  projectile.trajectoryPoints ??= [
    (projectile.muzzlePosition ?? projectile.previousPosition ?? point).toArray()
  ];
  projectile.trajectoryLastSampleDistance ??= 0;
  projectile.trajectorySampleSpacing ??= Math.max(
    1,
    (projectile.weapon?.maxRange ?? 96) / 96
  );
  const sample = [point.x, point.y, point.z];
  const points = projectile.trajectoryPoints;
  const last = points[points.length - 1];
  if (last && Math.hypot(
    sample[0] - last[0],
    sample[1] - last[1],
    sample[2] - last[2]
  ) <= 1e-4) {
    if (force) points[points.length - 1] = sample;
    return;
  }
  if (!force
      && projectile.distanceTravelled - projectile.trajectoryLastSampleDistance
        < projectile.trajectorySampleSpacing) {
    return;
  }
  if (points.length >= MAX_TRAJECTORY_POINTS) {
    const compacted = [points[0]];
    for (let index = 2; index < points.length; index += 2) compacted.push(points[index]);
    projectile.trajectoryPoints = compacted;
    projectile.trajectorySampleSpacing *= 2;
  }
  projectile.trajectoryPoints.push(sample);
  projectile.trajectoryLastSampleDistance = projectile.distanceTravelled;
}

export function calculateBuildingBlastDamage(weapon) {
  const woundDamage = Math.max(0, Number(weapon?.woundDamage) || 0);
  const explosiveRadius = Math.max(0, Number(weapon?.explosiveRadius) || 0);
  const caliber = Math.max(0, Number(weapon?.caliberMm) || 0);
  if (explosiveRadius <= 0) return 0;
  return THREE.MathUtils.clamp(
    woundDamage * 1.4 + explosiveRadius * 24 + caliber * 2,
    1,
    650
  );
}

function buildingDamageChanged(result) {
  return Boolean(
    result?.results?.some(record => record.applied > 0 || record.collapsed || record.breached)
    || result?.result?.applied > 0
    || result?.result?.collapsed
    || result?.result?.breached
    || result?.collapsedSections?.length
    || result?.occupantConsequences?.length
  );
}

function createTelemetry() {
  return {
    shotsFired: 0,
    infantryHits: 0,
    vehicleHits: 0,
    buildingHits: 0,
    penetrations: 0,
    ricochets: 0,
    stops: 0,
    impacts: []
  };
}

function snapshotInternalPathHit(hit) {
  return {
    ...hit,
    crewRoles: [...(hit.crewRoles ?? [])],
    entryPoint: [...hit.entryPoint],
    exitPoint: [...hit.exitPoint],
    energyAbsorption: hit.energyAbsorption
      ? { ...hit.energyAbsorption }
      : null
  };
}

function snapshotExplosiveEffect(effect) {
  if (!effect) return null;
  return {
    ...effect,
    detonationPoint: [...(effect.detonationPoint ?? [])],
    protection: effect.protection ? { ...effect.protection } : null,
    externalIntent: effect.externalIntent ? { ...effect.externalIntent } : null,
    crewIntents: effect.crewIntents?.map(intent => ({
      ...intent,
      crewRoles: [...(intent.crewRoles ?? [])],
      volumeIds: [...(intent.volumeIds ?? [])]
    })) ?? [],
    componentIntents: effect.componentIntents?.map(intent => ({
      ...intent,
      volumeIds: [...(intent.volumeIds ?? [])]
    })) ?? []
  };
}

function snapshotCrewResult(crewResult) {
  if (!crewResult) return null;
  const snapshotCasualty = casualty => casualty
    ? {
        id: casualty.id,
        name: casualty.name,
        role: casualty.role,
        status: casualty.status,
        health: casualty.health
      }
    : null;
  const casualty = snapshotCasualty(crewResult.casualty);
  return {
    penetrated: Boolean(crewResult.penetrated),
    casualty,
    casualties: crewResult.casualties?.map(snapshotCasualty) ?? (casualty ? [casualty] : []),
    damage: crewResult.damage ? { ...crewResult.damage } : null,
    components: crewResult.components?.map(component => ({ ...component })) ?? [],
    internalPathHits: crewResult.internalPathHits?.map(snapshotInternalPathHit) ?? null,
    explosiveEffect: snapshotExplosiveEffect(crewResult.explosiveEffect),
    burning: Boolean(crewResult.burning),
    destroyed: Boolean(crewResult.destroyed),
    secondaryExplosion: Boolean(crewResult.secondaryExplosion),
    eventVersion: crewResult.eventVersion ?? null
  };
}

function snapshotImpact(record) {
  return {
    ...record,
    muzzlePosition: [...record.muzzlePosition],
    impactPosition: [...record.impactPosition],
    impactNormal: record.impactNormal ? [...record.impactNormal] : null,
    impactVelocity: record.impactVelocity ? [...record.impactVelocity] : null,
    postImpactVelocity: record.postImpactVelocity ? [...record.postImpactVelocity] : null,
    plateResidualVelocity: record.plateResidualVelocity
      ? [...record.plateResidualVelocity]
      : null,
    residualVelocity: record.residualVelocity ? [...record.residualVelocity] : null,
    separationNormal: record.separationNormal ? [...record.separationNormal] : null,
    exitPosition: record.exitPosition ? [...record.exitPosition] : null,
    penetrationReferenceUrls: record.penetrationReferenceUrls
      ? [...record.penetrationReferenceUrls]
      : [],
    exitResult: record.exitResult
      ? {
          ...record.exitResult,
          point: record.exitResult.point ? [...record.exitResult.point] : null,
          normal: record.exitResult.normal ? [...record.exitResult.normal] : null
        }
      : null,
    trajectoryPoints: record.trajectoryPoints?.map(point => [...point]) ?? [],
    localImpactPoint: record.localImpactPoint ? [...record.localImpactPoint] : null,
    internalPathHits: record.internalPathHits?.map(snapshotInternalPathHit) ?? null,
    explosiveEffect: snapshotExplosiveEffect(record.explosiveEffect),
    crewResult: snapshotCrewResult(record.crewResult),
    buildingResult: record.buildingResult
      ? JSON.parse(JSON.stringify(record.buildingResult))
      : null
  };
}

function snapshotTelemetry(telemetry) {
  return {
    shotsFired: telemetry.shotsFired,
    infantryHits: telemetry.infantryHits,
    vehicleHits: telemetry.vehicleHits,
    buildingHits: telemetry.buildingHits ?? 0,
    penetrations: telemetry.penetrations,
    ricochets: telemetry.ricochets,
    stops: telemetry.stops ?? 0,
    impacts: telemetry.impacts.map(snapshotImpact)
  };
}

function orientProjectileMesh(projectile) {
  projectile.mesh.position.copy(projectile.position);
  projectile.mesh.lookAt(
    scratchDirection.copy(projectile.position).add(projectile.velocity)
  );
}

export class CombatSystem {
  constructor(scene, soundEngine, random = Math.random, options = {}) {
    this.scene = scene;
    this.sound = soundEngine;
    this.random = random;
    this.projectiles = [];
    this.effects = [];
    this.vfxProvider = validateBattlefieldVfxProvider(
      options.vfxProvider
    );
    this.vfxResources = validateCombatVfxResourceSet(
      this.vfxProvider.createCombatResources()
    );
    this.vfxAssetBinding = this.vfxResources.assetBinding ?? null;
    this.effectPools = {
      impact: [],
      explosion: [],
      muzzleFlash: [],
      buildingDebris: []
    };
    this.effectGeometries = this.vfxResources.effectGeometries;
    this.effectCaps = this.vfxResources.effectCaps;
    this.shotSequence = 0;
    this.impactSequence = 0;
    this.telemetry = createTelemetry();
    this.buildingSystem = options.buildingSystem ?? null;
    this.onBuildingChanged = options.onBuildingChanged ?? null;
    this.onOccupantConsequences = options.onOccupantConsequences ?? null;
    this.onOccupantConsequence = options.onOccupantConsequence ?? null;
    this.onAuditoryEvent = typeof options.onAuditoryEvent === 'function'
      ? options.onAuditoryEvent
      : null;
    this.disposed = false;
    this.ballistics = new BallisticsSystem({
      terrain: options.terrain ?? null,
      getUnits: options.getUnits ?? (() => []),
      random,
      buildingSystem: this.buildingSystem,
      getBuildingColliders: options.getBuildingColliders ?? null
    });
  }

  fireWeapon(attacker, targetUnit, targetPos, options = {}) {
    const weaponLookup = attacker?.catalogPorts?.weapons?.get;
    const weapon = options.weapon
      ?? weaponLookup?.(options.weaponId)
      ?? weaponLookup?.(options.shooter?.weaponId ?? options.shooter?.weapon);
    if (!attacker || !weapon || (!targetUnit && !targetPos)) return false;
    for (const field of [
      'indirectMissionId',
      'indirectMissionShotId',
      'indirectMissionShotKind'
    ]) {
      if (
        options[field] != null
        && (typeof options[field] !== 'string' || options[field].length === 0)
      ) {
        return false;
      }
    }

    const fromPos = options.muzzlePosition?.clone()
      ?? options.shooter?.getMuzzleWorldPosition?.()
      ?? (options.shooter
        ? attacker.getSoldierWorldPosition(options.shooter.id).add(new THREE.Vector3(0, 1.35, 0))
        : null)
      ?? attacker.getMuzzleWorldPosition?.()
      ?? attacker.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const explicitAimPoint = options.aimPoint?.isVector3
      ? options.aimPoint
      : (Array.isArray(options.aimPoint)
          ? new THREE.Vector3().fromArray(options.aimPoint)
          : null);
    const infantryAim = !explicitAimPoint && options.targetSoldier
      ? getInfantryAimPoint({
          position: options.targetSoldier.position
            ?? options.targetSoldier.worldPosition,
          stance: options.targetSoldier.stance,
          facing: options.targetSoldier.facing
        })
      : null;
    const vehicleAim = !explicitAimPoint && !infantryAim && targetUnit?.vehicleSpec
      ? getVehicleArmorAimPoint(targetUnit)
      : null;
    const authoritativeAimPoint = infantryAim?.point ?? vehicleAim?.point ?? null;
    const toPos = authoritativeAimPoint
      ? new THREE.Vector3().fromArray(authoritativeAimPoint)
      : scratchAim.copy(
          explicitAimPoint
            ?? (targetUnit ? targetUnit.position : targetPos)
        ).clone();
    if (!explicitAimPoint && !authoritativeAimPoint) {
      toPos.y += 1.1;
    }

    const range = fromPos.distanceTo(toPos);
    const estimatedRangeMeters = Number.isFinite(options.estimatedRangeMeters)
      ? Math.max(0, options.estimatedRangeMeters)
      : range;
    let velocity;
    if (options.initialVelocity) {
      const initialVelocity = options.initialVelocity?.isVector3
        ? options.initialVelocity
        : (Array.isArray(options.initialVelocity)
            ? new THREE.Vector3().fromArray(options.initialVelocity)
            : null);
      if (
        !initialVelocity
        || ![initialVelocity.x, initialVelocity.y, initialVelocity.z]
          .every(Number.isFinite)
        || initialVelocity.lengthSq() <= 1e-9
      ) {
        return false;
      }
      velocity = initialVelocity.clone();
    } else {
      const estimatedFlightTime =
        estimatedRangeMeters / Math.max(1, weapon.muzzleVelocity);
      toPos.y += 0.5 * 9.81 * estimatedFlightTime * estimatedFlightTime;

      const dispersionRadians = weapon.dispersionMOA * Math.PI / (180 * 60);
      const dispersionRadius = Math.tan(dispersionRadians)
        * range
        * (options.dispersionScale ?? 1);
      const dispersionAngle = this.random() * Math.PI * 2;
      const dispersionDistance = Math.sqrt(this.random()) * dispersionRadius;
      toPos.x += Math.cos(dispersionAngle) * dispersionDistance;
      toPos.y += Math.sin(dispersionAngle) * dispersionDistance;

      scratchDirection.subVectors(toPos, fromPos).normalize();
      velocity = scratchDirection.clone().multiplyScalar(weapon.muzzleVelocity);
    }
    const mesh = this.vfxResources.createProjectileMesh(weapon);
    mesh.position.copy(fromPos);
    mesh.lookAt(toPos);
    this.scene.add(mesh);

    const projectile = {
      id: ++this.shotSequence,
      mesh,
      attacker,
      shooterId: options.shooter?.id ?? attacker?.id ?? null,
      mountId: options.mountId ?? (options.shooter ? 'individual' : null),
      targetUnit,
      targetSoldierId: options.targetSoldier?.id ?? null,
      indirectMissionId: options.indirectMissionId ?? null,
      indirectMissionShotId: options.indirectMissionShotId ?? null,
      indirectMissionShotKind: options.indirectMissionShotKind ?? null,
      weapon,
      ammoId: options.ammoId ?? weapon.ammunitionId ?? weapon.id,
      targetRangeMeters: range,
      estimatedRangeMeters,
      rangeErrorMeters: Number.isFinite(options.rangeErrorMeters)
        ? options.rangeErrorMeters
        : estimatedRangeMeters - range,
      aimRequiredSeconds: Number.isFinite(options.aimRequiredSeconds)
        ? Math.max(0, options.aimRequiredSeconds)
        : null,
      fireControlModelVersion: options.fireControlModelVersion ?? null,
      muzzlePosition: fromPos.clone(),
      position: fromPos.clone(),
      previousPosition: fromPos.clone(),
      velocity,
      distanceTravelled: 0,
      lifetime: 0,
      maxLifetime: Number.isFinite(options.maxFlightTimeSeconds)
        && options.maxFlightTimeSeconds > 0
        ? options.maxFlightTimeSeconds
        : weapon.maxRange / Math.max(1, weapon.muzzleVelocity) + 1,
      ricochetCount: 0,
      penetrationCount: 0,
      continuationDelaySeconds: 0,
      armorIgnore: null,
      trajectoryPoints: [fromPos.toArray()],
      trajectoryLastSampleDistance: 0,
      trajectorySampleSpacing: Math.max(1, weapon.maxRange / 96)
    };
    this.projectiles.push(projectile);
    this.telemetry.shotsFired++;
    this.createMuzzleFlashEffect(fromPos, weapon);

    if (this.onAuditoryEvent) {
      this.onAuditoryEvent(createWeaponReportEvent({
        shotSequence: projectile.id,
        sourceUnitId: attacker.id,
        sourceFaction: attacker.faction,
        weapon,
        origin: fromPos
      }));
    }
    try {
      this.sound?.playWeapon?.(weapon);
    } catch {
      // Presentation failure must not invalidate an already accepted shot.
    }
    return true;
  }

  captureState() {
    return {
      shotSequence: this.shotSequence,
      impactSequence: this.impactSequence,
      projectiles: this.projectiles.map(projectile => ({
        id: projectile.id,
        attackerId: projectile.attacker?.id ?? null,
        shooterId: projectile.shooterId,
        mountId: projectile.mountId,
        targetUnitId: projectile.targetUnit?.id ?? null,
        targetSoldierId: projectile.targetSoldierId,
        indirectMissionId: projectile.indirectMissionId,
        indirectMissionShotId: projectile.indirectMissionShotId,
        indirectMissionShotKind: projectile.indirectMissionShotKind,
        weaponId: projectile.weapon.id,
        ammoId: projectile.ammoId,
        targetRangeMeters: projectile.targetRangeMeters,
        estimatedRangeMeters: projectile.estimatedRangeMeters,
        rangeErrorMeters: projectile.rangeErrorMeters,
        aimRequiredSeconds: projectile.aimRequiredSeconds,
        fireControlModelVersion: projectile.fireControlModelVersion,
        muzzlePosition: projectile.muzzlePosition.toArray(),
        position: projectile.position.toArray(),
        previousPosition: projectile.previousPosition.toArray(),
        velocity: projectile.velocity.toArray(),
        distanceTravelled: projectile.distanceTravelled,
        lifetime: projectile.lifetime,
        maxLifetime: projectile.maxLifetime,
        ricochetCount: projectile.ricochetCount ?? 0,
        penetrationCount: projectile.penetrationCount ?? 0,
        continuationDelaySeconds: projectile.continuationDelaySeconds ?? 0,
        armorIgnore: projectile.armorIgnore
          ? {
              ...projectile.armorIgnore,
              plateIds: projectile.armorIgnore.plateIds
                ? [...projectile.armorIgnore.plateIds]
                : undefined
            }
          : null,
        trajectoryPoints: projectile.trajectoryPoints.map(point => [...point]),
        trajectoryLastSampleDistance: projectile.trajectoryLastSampleDistance,
        trajectorySampleSpacing: projectile.trajectorySampleSpacing
      })),
      telemetry: snapshotTelemetry(this.telemetry)
    };
  }

  restoreState(state, unitMap = new Map()) {
    this.reset();
    // Snapshot reconstruction owns a new render set. Normal projectile expiry
    // reuses resources, while rewind releases the discarded render set.
    this.disposeProjectileResources();
    this.shotSequence = state?.shotSequence ?? 0;
    this.impactSequence = state?.impactSequence
      ?? Math.max(0, ...(state?.telemetry?.impacts ?? []).map(impact => impact.impactId ?? 0));
    this.telemetry = state?.telemetry
      ? snapshotTelemetry(state.telemetry)
      : createTelemetry();

    for (const saved of state?.projectiles ?? []) {
      const attacker = unitMap.get(saved.attackerId) ?? null;
      const weapon = attacker?.catalogPorts?.weapons?.get?.(saved.weaponId);
      if (!weapon || !attacker) continue;

      const projectile = {
        id: saved.id,
        mesh: this.vfxResources.createProjectileMesh(weapon),
        attacker,
        shooterId: saved.shooterId ?? attacker.id,
        mountId: saved.mountId ?? null,
        targetUnit: unitMap.get(saved.targetUnitId) ?? null,
        targetSoldierId: saved.targetSoldierId ?? null,
        indirectMissionId: saved.indirectMissionId ?? null,
        indirectMissionShotId: saved.indirectMissionShotId ?? null,
        indirectMissionShotKind: saved.indirectMissionShotKind ?? null,
        weapon,
        ammoId: saved.ammoId ?? weapon.ammunitionId ?? weapon.id,
        targetRangeMeters: saved.targetRangeMeters ?? null,
        estimatedRangeMeters: saved.estimatedRangeMeters ?? saved.targetRangeMeters ?? null,
        rangeErrorMeters: saved.rangeErrorMeters ?? null,
        aimRequiredSeconds: saved.aimRequiredSeconds ?? null,
        fireControlModelVersion: saved.fireControlModelVersion ?? null,
        muzzlePosition: new THREE.Vector3().fromArray(saved.muzzlePosition),
        position: new THREE.Vector3().fromArray(saved.position),
        previousPosition: new THREE.Vector3().fromArray(saved.previousPosition),
        velocity: new THREE.Vector3().fromArray(saved.velocity),
        distanceTravelled: saved.distanceTravelled,
        lifetime: saved.lifetime,
        maxLifetime: saved.maxLifetime,
        ricochetCount: saved.ricochetCount ?? 0,
        penetrationCount: saved.penetrationCount ?? 0,
        continuationDelaySeconds: Math.max(0, saved.continuationDelaySeconds ?? 0),
        armorIgnore: saved.armorIgnore
          ? {
              ...saved.armorIgnore,
              plateIds: saved.armorIgnore.plateIds
                ? [...saved.armorIgnore.plateIds]
                : undefined
            }
          : null,
        trajectoryPoints: saved.trajectoryPoints?.map(point => [...point])
          ?? [saved.muzzlePosition.slice()],
        trajectoryLastSampleDistance: saved.trajectoryLastSampleDistance ?? 0,
        trajectorySampleSpacing: saved.trajectorySampleSpacing
          ?? Math.max(1, weapon.maxRange / 96)
      };
      orientProjectileMesh(projectile);
      this.scene.add(projectile.mesh);
      this.projectiles.push(projectile);
    }
  }

  removeProjectile(index) {
    const projectile = this.projectiles[index];
    this.scene.remove(projectile.mesh);
    this.projectiles.splice(index, 1);
  }

  recordImpact(projectile, impact, result = null) {
    appendTrajectoryPoint(projectile, impact.point, true);
    const record = {
      impactId: ++this.impactSequence,
      id: projectile.id,
      shooterId: projectile.shooterId,
      mountId: projectile.mountId,
      targetId: impact.unit?.id ?? impact.buildingId ?? null,
      targetSoldierId: impact.agent?.id ?? projectile.targetSoldierId ?? null,
      indirectMissionId: projectile.indirectMissionId ?? null,
      indirectMissionShotId: projectile.indirectMissionShotId ?? null,
      indirectMissionShotKind: projectile.indirectMissionShotKind ?? null,
      weaponId: projectile.weapon.id,
      ammoId: projectile.ammoId,
      targetRangeMeters: projectile.targetRangeMeters ?? null,
      estimatedRangeMeters: projectile.estimatedRangeMeters ?? null,
      rangeErrorMeters: projectile.rangeErrorMeters ?? null,
      aimRequiredSeconds: projectile.aimRequiredSeconds ?? null,
      fireControlModelVersion: projectile.fireControlModelVersion ?? null,
      muzzlePosition: projectile.muzzlePosition.toArray(),
      impactPosition: impact.point.toArray(),
      flightTime: projectile.lifetime,
      rangeMeters: projectile.distanceTravelled,
      impactSpeed: result?.impactSpeed ?? projectile.velocity.length(),
      impactVelocity: result?.impactVelocity ? [...result.impactVelocity] : null,
      impactEnergyJ: result?.impactEnergyJ ?? null,
      ricocheted: result?.ricocheted ?? false,
      ricochetReason: result?.ricochetReason ?? null,
      ricochetCount: result?.ricochetCount ?? projectile.ricochetCount ?? 0,
      ricochetModelVersion: result?.ricochetModelVersion ?? null,
      ricochetDataQuality: result?.ricochetDataQuality ?? null,
      postImpactVelocity: result?.postImpactVelocity ? [...result.postImpactVelocity] : null,
      postImpactSpeed: result?.postImpactSpeed ?? null,
      outgoingEnergyJ: result?.outgoingEnergyJ ?? null,
      retainedEnergyRatio: result?.retainedEnergyRatio ?? null,
      penetrationModelVersion: result?.penetrationModelVersion ?? null,
      penetrationDataQuality: result?.penetrationDataQuality ?? null,
      penetrationReferenceUrls: result?.penetrationReferenceUrls
        ? [...result.penetrationReferenceUrls]
        : [],
      penetrationRatio: result?.penetrationRatio ?? null,
      ballisticLimitSpeed: result?.ballisticLimitSpeed ?? null,
      armorEnergySpentJ: result?.armorEnergySpentJ ?? null,
      plateResidualEnergyJ: result?.plateResidualEnergyJ ?? null,
      plateResidualEnergyRatio: result?.plateResidualEnergyRatio ?? null,
      plateResidualSpeed: result?.plateResidualSpeed ?? null,
      plateResidualVelocity: result?.plateResidualVelocity
        ? [...result.plateResidualVelocity]
        : null,
      internalInitialEnergyJ: result?.internalInitialEnergyJ ?? null,
      internalEnergySpentJ: result?.internalEnergySpentJ ?? null,
      preExitResidualEnergyJ: result?.preExitResidualEnergyJ ?? null,
      exitArmorEnergySpentJ: result?.exitArmorEnergySpentJ ?? null,
      residualEnergyJ: result?.residualEnergyJ ?? null,
      residualVelocity: result?.residualVelocity ? [...result.residualVelocity] : null,
      continuationKind: result?.continuationKind ?? 'none',
      continuationReason: result?.continuationReason ?? null,
      terminalEffect: result?.terminalEffect ?? null,
      penetrationCount: result?.penetrationCount ?? projectile.penetrationCount ?? 0,
      exitPosition: result?.exitPosition ? [...result.exitPosition] : null,
      exitResult: result?.exitResult
        ? {
            ...result.exitResult,
            point: result.exitResult.point ? [...result.exitResult.point] : null,
            normal: result.exitResult.normal ? [...result.exitResult.normal] : null
          }
        : null,
      stoppedInsideVehicle: result?.stoppedInsideVehicle ?? false,
      internalTerminalDistanceMeters: result?.internalTerminalDistanceMeters ?? null,
      internalTransitDistanceMeters: result?.internalTransitDistanceMeters ?? null,
      internalTransitSeconds: result?.internalTransitSeconds ?? null,
      separationNormal: result?.separationNormal ? [...result.separationNormal] : null,
      clearanceMeters: result?.clearanceMeters ?? null,
      trajectoryPoints: projectile.trajectoryPoints.map(point => [...point]),
      kind: impact.kind,
      hitVolumeId: impact.hitVolumeId ?? null,
      hitVolumeModelVersion: impact.hitVolumeModelVersion ?? null,
      hitVolumeDataQuality: impact.hitVolumeDataQuality ?? null,
      zone: result?.zone ?? null,
      thicknessZone: result?.thicknessZone ?? null,
      plateId: result?.plateId ?? impact.plateId ?? null,
      armorVolumeId: result?.armorVolumeId ?? impact.armorVolumeId ?? null,
      armorPart: result?.armorPart ?? impact.armorPart ?? null,
      armorGeometryQuality: result?.armorGeometryQuality ?? impact.armorGeometryQuality ?? null,
      impactNormal: result?.impactNormal ? [...result.impactNormal] : null,
      localImpactPoint: result?.localImpactPoint ? [...result.localImpactPoint] : null,
      nominalArmorMm: result?.nominalArmorMm ?? null,
      thicknessDataQuality: result?.thicknessDataQuality ?? null,
      thicknessReferenceUrl: result?.thicknessReferenceUrl ?? null,
      impactCosine: result?.impactCosine ?? null,
      impactAngleDegrees: result?.impactAngleDegrees ?? null,
      effectiveArmorMm: result?.effectiveArmorMm ?? null,
      penetrationMm: result?.penetrationMm ?? null,
      penetrated: result?.penetrated ?? null,
      internalPathHits: result?.internalPathHits?.map(snapshotInternalPathHit) ?? null,
      explosiveEffect: snapshotExplosiveEffect(result?.explosiveEffect),
      crewResult: snapshotCrewResult(result?.crewResult),
      buildingId: impact.buildingId ?? null,
      sectionId: impact.sectionId ?? result?.sectionId ?? null,
      colliderPartId: impact.colliderPartId ?? result?.colliderPartId ?? null,
      buildingResult: result?.buildingResult
        ? JSON.parse(JSON.stringify(result.buildingResult))
        : null
    };

    this.telemetry.impacts.push(record);
    if (this.telemetry.impacts.length > 100) this.telemetry.impacts.shift();

    if (typeof document !== 'undefined') {
      const dbgEl = document.getElementById('debug-log');
      if (dbgEl) {
        dbgEl.setAttribute('data-ballistics-stats', JSON.stringify({
          shotsFired: this.telemetry.shotsFired,
          infantryHits: this.telemetry.infantryHits,
          vehicleHits: this.telemetry.vehicleHits,
          buildingHits: this.telemetry.buildingHits,
          penetrations: this.telemetry.penetrations,
          ricochets: this.telemetry.ricochets,
          stops: this.telemetry.stops,
          latestImpact: record
        }));
      }
    }
  }

  notifyNearbyInfantry(projectile, impact) {
    const weapon = projectile.weapon;
    const explosiveRadius = weapon.explosiveRadius ?? 0;
    const radius = explosiveRadius > 0
      ? Math.max(10, explosiveRadius * 2)
      : Math.max(7, Math.min(12, (weapon.caliberMm ?? 8) * 0.9));
    const intensity = explosiveRadius > 0
      ? 2
      : THREE.MathUtils.clamp((weapon.caliberMm ?? 8) / 8, 0.65, 1.5);
    const threatPosition = projectile.muzzlePosition ?? projectile.attacker?.position ?? null;
    for (const unit of this.ballistics.getUnits()) {
      if (unit === projectile.attacker || unit?.type !== 'infantry_squad') continue;
      unit.registerIncomingFire?.(threatPosition, impact.point, {
        radius,
        intensity,
        projectileId: projectile.id
      });
    }
  }

  applyProjectileContinuation(projectile, impact, result) {
    if (!result?.postImpactVelocity) return false;
    if (result.continuationKind === 'ricochet') {
      if (!result.separationNormal) return false;
      projectile.velocity.fromArray(result.postImpactVelocity);
      scratchRicochetNormal.fromArray(result.separationNormal).normalize();
      projectile.position.copy(impact.point).addScaledVector(
        scratchRicochetNormal,
        result.clearanceMeters
      );
      projectile.previousPosition.copy(projectile.position);
      projectile.ricochetCount = result.ricochetCount;
      projectile.armorIgnore = result.plateId
        ? {
            unitId: impact.unit?.id ?? null,
            plateId: result.plateId,
            untilDistance: projectile.distanceTravelled
              + Math.max(0.25, result.clearanceMeters * 8)
          }
        : null;
      return true;
    }
    if (result.continuationKind !== 'penetrator') return false;
    projectile.velocity.fromArray(result.postImpactVelocity);
    scratchDirection.copy(projectile.velocity).normalize();
    projectile.position.fromArray(result.exitPosition);
    projectile.distanceTravelled += result.internalTransitDistanceMeters ?? 0;
    appendTrajectoryPoint(projectile, projectile.position, true);
    projectile.position.addScaledVector(
      scratchDirection,
      result.continuationStartOffsetMeters
    );
    projectile.previousPosition.copy(projectile.position);
    projectile.continuationDelaySeconds = Math.max(
      0,
      (projectile.continuationDelaySeconds ?? 0)
        + (result.internalTransitSeconds ?? 0)
    );
    projectile.penetrationCount = result.penetrationCount;
    projectile.armorIgnore = {
      unitId: impact.unit?.id ?? null,
      armorVolumeId: result.armorVolumeId ?? null,
      plateIds: [
        result.plateId,
        result.exitResult?.plateId
      ].filter(Boolean),
      untilDistance: projectile.distanceTravelled
        + Math.max(0.25, result.continuationStartOffsetMeters * 4)
    };
    return true;
  }

  resolveImpact(projectile, impact) {
    const weapon = projectile.weapon;
    this.notifyNearbyInfantry(projectile, impact);
    if (impact.kind === 'infantry') {
      const damage = weapon.woundDamage * (0.78 + this.random() * 0.44);
      impact.unit.applySoldierDamage(impact.agent.id, damage, weapon.explosiveRadius ? 100 : 42);
      impact.unit.applySuppression(weapon.explosiveRadius ? 45 : 10);
      this.telemetry.infantryHits++;
      this.recordImpact(projectile, impact);
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.7);
      } else {
        this.createImpactEffect(impact.point, 0xffc266);
      }
      return false;
    }

    if (impact.kind === 'exposed_vehicle_crew') {
      const damage = weapon.woundDamage * (0.78 + this.random() * 0.44);
      const casualty = impact.unit.applyExposedVehicleCrewDamage(
        impact.agent.id,
        damage
      );
      impact.unit.applySuppression(18);
      this.telemetry.infantryHits++;
      this.recordImpact(projectile, impact, {
        crewResult: {
          penetrated: false,
          casualty,
          casualties: casualty ? [casualty] : [],
          damage: {
            amount: damage,
            cause: 'unbuttoned_commander_hit'
          }
        }
      });
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.7);
      } else {
        this.createImpactEffect(impact.point, 0xffc266);
      }
      return false;
    }

    if (impact.kind === 'vehicle') {
      const result = this.ballistics.resolveVehicleImpact(projectile, impact);
      impact.unit.applySuppression(result.penetrated ? 55 : 14);
      this.telemetry.vehicleHits++;
      if (result.penetrated) this.telemetry.penetrations++;
      else if (result.ricocheted) this.telemetry.ricochets++;
      else this.telemetry.stops++;
      this.recordImpact(projectile, impact, result);
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.55);
      } else {
        this.createImpactEffect(impact.point, result.penetrated ? 0xff5a36 : 0xe8f0ff);
      }
      return this.applyProjectileContinuation(projectile, impact, result);
    }

    if (impact.kind === 'structure') {
      const result = this.ballistics.resolveStructureImpact(projectile, impact);
      impact.unit.applySuppression(result.penetrated ? 38 : 8);
      this.telemetry.vehicleHits++;
      if (result.penetrated) this.telemetry.penetrations++;
      else this.telemetry.stops++;
      this.recordImpact(projectile, impact, result);
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.65);
      } else {
        this.createImpactEffect(impact.point, result.penetrated ? 0xff7b46 : 0xcbd5e1);
      }
      return false;
    }

    if (impact.kind === 'building') {
      const result = this.ballistics.resolveBuildingImpact(projectile, impact);
      this.telemetry.buildingHits++;
      if (result.penetrated) this.telemetry.penetrations++;
      else this.telemetry.stops++;
      this.recordImpact(projectile, impact, result);
      this.processBuildingDamageResult(
        impact.buildingId,
        result.buildingResult,
        'projectile',
        impact.point
      );
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.65);
      } else {
        this.createImpactEffect(impact.point, result.penetrated ? 0xff7b46 : 0xd6b36a);
      }
      return false;
    }

    this.recordImpact(projectile, impact);
    if (weapon.explosiveRadius > 0) {
      this.applyBlast(impact.point, weapon, projectile.attacker);
      this.createExplosionEffect(impact.point, 0.6);
    } else {
      this.createImpactEffect(impact.point, 0xd6b36a);
    }
    return false;
  }

  applyBlast(position, weapon, attacker) {
    const radius = weapon.explosiveRadius;
    if (radius <= 0) return;
    const protectedOccupants = new Set();
    for (const buildingId of this.buildingSystem?.getBuildingIds?.() ?? []) {
      const building = this.buildingSystem.getBuildingSnapshot(buildingId);
      for (const occupant of Object.values(building.occupancy ?? {})) {
        protectedOccupants.add(`${occupant.unitId}:${occupant.soldierId}`);
      }
    }
    for (const unit of this.ballistics.getUnits()) {
      if (!unit?.isCombatEffective?.() || unit === attacker) continue;
      if (unit.type === 'infantry_squad') {
        for (const agent of unit.soldierAI?.getLivingAgents() ?? []) {
          if (protectedOccupants.has(`${unit.id}:${agent.id}`)) continue;
          const distance = agent.position.distanceTo(position);
          if (distance > radius) continue;
          const falloff = 1 - distance / radius;
          agent.applyDamage(weapon.woundDamage * falloff, 80 * falloff);
        }
        unit.applySuppression(35);
      } else if (unit.position.distanceTo(position) <= radius * 1.5) {
        if (unit.structureSpec) unit.applyStructureBlast(position, weapon);
        unit.applySuppression(22);
      }
    }

    this.ballistics.terrain?.applyBlastDamageToLinearObstacles?.({
      position,
      radiusMeters: radius,
      damageAtCenter: calculateLinearObstacleBlastDamage(weapon)
    });

    if (!this.buildingSystem) return;
    const amount = calculateBuildingBlastDamage(weapon);
    const buildingIds = this.buildingSystem.getBuildingIds?.()
      ?? (this.buildingSystem.captureState?.().buildings ?? [])
        .map(building => String(building.id))
        .sort((a, b) => a.localeCompare(b));
    for (const buildingId of buildingIds) {
      const snapshot = this.buildingSystem.getBuildingSnapshot(buildingId);
      const result = this.buildingSystem.applyBlastDamage(buildingId, {
        centerLocal: worldToLocalPoint(position.toArray(), snapshot.transform),
        radius,
        amount
      });
      if (!buildingDamageChanged(result)) continue;
      this.processBuildingDamageResult(buildingId, result, 'blast', position);
    }
  }

  processBuildingDamageResult(buildingId, damageResult, reason, position) {
    if (!damageResult) return EMPTY_BUILDING_DEBRIS_EVENTS;
    const consequences = [...(damageResult.occupantConsequences ?? [])]
      .sort((a, b) => String(a.soldierKey).localeCompare(String(b.soldierKey)))
      .map(consequence => ({
        buildingId,
        ...consequence,
        reason
      }));
    if (consequences.length > 0) {
      this.onOccupantConsequences?.(consequences);
      if (!this.onOccupantConsequences) {
        for (const consequence of consequences) this.onOccupantConsequence?.(consequence);
      }
    }
    this.onBuildingChanged?.({
      buildingId,
      reason,
      position: position?.toArray?.() ?? null,
      damageResult: JSON.parse(JSON.stringify(damageResult)),
      collisionSnapshot: this.buildingSystem?.getCollisionSnapshot?.(buildingId) ?? null
    });
    let debrisEvents = EMPTY_BUILDING_DEBRIS_EVENTS;
    try {
      debrisEvents = this.projectBuildingDebrisEvents(
        buildingId,
        damageResult,
        reason,
        position
      );
    } catch {
      return debrisEvents;
    }
    for (const event of debrisEvents) {
      try {
        this.createBuildingDebrisEffect(event);
      } catch {
        // Transient presentation must not become building-damage authority.
      }
    }
    const soundEvent = selectBuildingDamageSoundEvent(debrisEvents);
    if (soundEvent) {
      try {
        this.sound?.playBuildingDamage?.(soundEvent);
      } catch {
        // Transient presentation must not become building-damage authority.
      }
    }
    return debrisEvents;
  }

  projectBuildingDebrisEvents(buildingId, damageResult, reason, position) {
    if (!damageResult || !this.buildingSystem) {
      return EMPTY_BUILDING_DEBRIS_EVENTS;
    }
    const severityBySection = new Map();
    const retainSeverity = (sectionId, severity) => {
      if (sectionId == null || !severity) return;
      const stableId = String(sectionId);
      const current = severityBySection.get(stableId);
      if (
        !current
        || BUILDING_DEBRIS_SEVERITY_RANK[severity]
          > BUILDING_DEBRIS_SEVERITY_RANK[current]
      ) {
        severityBySection.set(stableId, severity);
      }
    };
    retainSeverity(
      damageResult.result?.sectionId,
      buildingDebrisSeverity(damageResult.result)
    );
    for (const result of damageResult.results ?? []) {
      retainSeverity(result?.sectionId, buildingDebrisSeverity(result));
    }
    for (const sectionId of damageResult.collapsedSections ?? []) {
      retainSeverity(sectionId, 'collapsed');
    }
    if (severityBySection.size === 0) return EMPTY_BUILDING_DEBRIS_EVENTS;

    const stableBuildingId = String(buildingId);
    const descriptor = this.buildingSystem.getDescriptorForBuilding?.(
      stableBuildingId
    );
    const snapshot = this.buildingSystem.getBuildingSnapshot?.(
      stableBuildingId
    );
    if (!descriptor || !snapshot) return EMPTY_BUILDING_DEBRIS_EVENTS;
    const sectionById = new Map(
      descriptor.sections.map(section => [String(section.id), section])
    );
    const impactPosition = finitePointArray(position);
    const events = [];
    for (const sectionId of [...severityBySection.keys()]
      .sort((a, b) => a.localeCompare(b))) {
      const section = sectionById.get(sectionId);
      if (!section) continue;
      const { localPosition, positionSource } = stableSectionCentroid(section);
      const worldPosition = finitePointArray(
        localToWorldPoint(localPosition, snapshot.transform)
      );
      if (!worldPosition) continue;
      const severity = severityBySection.get(sectionId);
      events.push(Object.freeze({
        eventKey: `${stableBuildingId}:${sectionId}`,
        buildingId: stableBuildingId,
        sectionId,
        materialLabel: String(section.material),
        severity,
        worldPosition: Object.freeze(worldPosition),
        impactPosition: impactPosition
          ? Object.freeze([...impactPosition])
          : null,
        positionSource,
        reason: String(reason ?? 'building-damage')
      }));
    }
    return events.length > 0
      ? Object.freeze(events)
      : EMPTY_BUILDING_DEBRIS_EVENTS;
  }

  acquireEffect(kind) {
    const pool = this.effectPools[kind];
    let effect = pool.find(candidate => !candidate.active);
    if (!effect && pool.length < this.effectCaps[kind]) {
      const material = this.vfxResources.createEffectMaterial(kind);
      if (!material?.isMaterial) {
        throw new TypeError(`combat VFX ${kind} material must be a Three.js material`);
      }
      const mesh = material.isSpriteNodeMaterial
        ? new THREE.Sprite(material)
        : new THREE.Mesh(this.effectGeometries[kind], material);
      if (this.vfxAssetBinding) mesh.userData.assetBinding = this.vfxAssetBinding;
      effect = {
        kind,
        mesh,
        material,
        active: false,
        lifetime: 0,
        maxLife: 0,
        initialOpacity: 0,
        growthPerSecond: 0,
        debrisEvent: null
      };
      effect.mesh.visible = false;
      pool.push(effect);
    }
    if (!effect) {
      effect = this.effects.find(candidate => candidate.kind === kind) ?? null;
      if (!effect) return null;
      this.retireEffect(effect);
    }
    return effect;
  }

  startEffect(kind, pos, {
    color,
    scale = 1,
    maxLife,
    initialOpacity = this.vfxResources.styles[kind]?.initialOpacity ?? 0.9,
    growthPerSecond =
      this.vfxResources.styles[kind]?.growthPerSecond ?? 2.4,
    debrisEvent = null
  }) {
    const effect = this.acquireEffect(kind);
    if (!effect) return null;
    effect.active = true;
    effect.lifetime = 0;
    effect.maxLife = maxLife;
    effect.initialOpacity = initialOpacity;
    effect.growthPerSecond = growthPerSecond;
    effect.debrisEvent = debrisEvent;
    effect.material.color?.setHex?.(color);
    effect.material.opacity = initialOpacity;
    setProceduralVfxProgress(effect.material, 0);
    effect.mesh.position.copy(pos);
    effect.mesh.scale.setScalar(scale);
    effect.mesh.visible = true;
    if (debrisEvent) effect.mesh.userData.buildingDebrisEvent = debrisEvent;
    else delete effect.mesh.userData.buildingDebrisEvent;
    if (effect.mesh.parent !== this.scene) this.scene.add(effect.mesh);
    this.effects.push(effect);
    return effect;
  }

  retireEffect(effect) {
    const activeIndex = this.effects.indexOf(effect);
    if (activeIndex >= 0) this.effects.splice(activeIndex, 1);
    effect.active = false;
    effect.mesh.visible = false;
    effect.material.opacity = 0;
    setProceduralVfxProgress(effect.material, 1);
    effect.debrisEvent = null;
    delete effect.mesh.userData.buildingDebrisEvent;
    if (effect.mesh.parent) effect.mesh.parent.remove(effect.mesh);
  }

  createImpactEffect(pos, color = null) {
    const style = this.vfxResources.styles.impact;
    this.startEffect('impact', pos, {
      color: color ?? style.color,
      scale: 1,
      maxLife: style.maxLife
    });
  }

  createExplosionEffect(pos, scale = 1) {
    this.sound?.playExplosion?.({ scale });
    const style = this.vfxResources.styles.explosion;
    const visualScale = scale * style.initialScale;
    const effect = this.startEffect('explosion', pos, {
      color: style.color,
      scale: visualScale,
      maxLife: style.maxLife
    });
    if (effect) {
      // Sprite origin is centered. Lift presentation so terrain does not
      // depth-occlude the lower half of a ground impact.
      effect.mesh.position.y += visualScale * 0.38;
      effect.mesh.userData.authoritativeImpactPosition = pos.toArray();
    }
    return effect;
  }

  createMuzzleFlashEffect(pos, weapon) {
    const style = this.vfxResources.styles.muzzleFlash;
    const cannon = String(weapon?.kind ?? '').startsWith('cannon');
    const automatic = [
      'machine_gun',
      'submachine_gun',
      'light_machine_gun'
    ].includes(weapon?.kind);
    const caliberScale = cannon
      ? THREE.MathUtils.clamp((weapon?.caliberMm ?? 20) / 24, 0.8, 2.6)
      : automatic ? 0.42 : 0.34;
    return this.startEffect('muzzleFlash', pos, {
      color: style.color,
      scale: caliberScale,
      maxLife: style.maxLife,
      initialOpacity: style.initialOpacity,
      growthPerSecond: style.growthPerSecond
    });
  }

  createBuildingDebrisEffect(event) {
    const style = this.vfxResources.resolveBuildingDebrisStyle(
      event?.materialLabel,
      event?.severity
    );
    if (!validBuildingDebrisStyle(style)) {
      throw new TypeError('building debris material-style resolver returned invalid style');
    }
    const position = finitePointArray(event?.worldPosition);
    if (!position) return null;
    scratchDebrisPosition.fromArray(position);
    return this.startEffect('buildingDebris', scratchDebrisPosition, {
      color: style.color,
      scale: style.initialScale,
      maxLife: style.maxLife,
      initialOpacity: style.initialOpacity,
      growthPerSecond: style.growthPerSecond,
      debrisEvent: event
    });
  }

  update(delta) {
    const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
    const step = delta / steps;
    for (let substep = 0; substep < steps; substep++) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const projectile = this.projectiles[i];
        let remainingStep = step;
        let remove = false;
        let contactCount = 0;
        while (remainingStep > PROJECTILE_SUBSTEP_EPSILON && !remove) {
          if ((projectile.continuationDelaySeconds ?? 0) > PROJECTILE_SUBSTEP_EPSILON) {
            const delayStep = Math.min(
              remainingStep,
              projectile.continuationDelaySeconds
            );
            projectile.continuationDelaySeconds = Math.max(
              0,
              projectile.continuationDelaySeconds - delayStep
            );
            projectile.lifetime += delayStep;
            remainingStep -= delayStep;
            if (projectile.lifetime >= projectile.maxLifetime
                || projectile.distanceTravelled >= projectile.weapon.maxRange) {
              remove = true;
              break;
            }
            if (remainingStep <= PROJECTILE_SUBSTEP_EPSILON) break;
          }
          const startX = projectile.position.x;
          const startY = projectile.position.y;
          const startZ = projectile.position.z;
          const startVelocityX = projectile.velocity.x;
          const startVelocityY = projectile.velocity.y;
          const startVelocityZ = projectile.velocity.z;
          const startDistance = projectile.distanceTravelled;
          const startLifetime = projectile.lifetime;

          this.ballistics.integrate(projectile, remainingStep);
          const segmentDistance = projectile.previousPosition.distanceTo(projectile.position);
          const impact = this.ballistics.detectImpact(projectile);
          const expired = projectile.lifetime >= projectile.maxLifetime
            || projectile.distanceTravelled >= projectile.weapon.maxRange;
          if (!impact) {
            appendTrajectoryPoint(projectile, projectile.position);
            remove = expired;
            break;
          }

          const impactDistance = Number.isFinite(impact.distance)
            ? impact.distance
            : impact.point.distanceTo(projectile.previousPosition);
          const impactFraction = segmentDistance > PROJECTILE_SUBSTEP_EPSILON
            ? THREE.MathUtils.clamp(impactDistance / segmentDistance, 0, 1)
            : 1;
          if (impactFraction < 1 - PROJECTILE_SUBSTEP_EPSILON) {
            projectile.position.set(startX, startY, startZ);
            projectile.previousPosition.copy(projectile.position);
            projectile.velocity.set(startVelocityX, startVelocityY, startVelocityZ);
            projectile.distanceTravelled = startDistance;
            projectile.lifetime = startLifetime;
            this.ballistics.integrate(projectile, remainingStep * impactFraction);
          }
          projectile.position.copy(impact.point);
          projectile.distanceTravelled = startDistance + impactDistance;

          const continued = this.resolveImpact(projectile, impact);
          const expiredAtImpact = projectile.lifetime >= projectile.maxLifetime
            || projectile.distanceTravelled >= projectile.weapon.maxRange;
          if (!continued || expiredAtImpact) {
            remove = true;
            break;
          }
          remainingStep *= 1 - impactFraction;
          contactCount++;
          if (contactCount >= MAX_PROJECTILE_CONTACTS_PER_SUBSTEP) break;
        }

        if (remove) {
          this.removeProjectile(i);
        } else {
          orientProjectileMesh(projectile);
        }
      }
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.lifetime += delta;
      const progress = effect.lifetime / effect.maxLife;
      const growthPerSecond = effect.kind === 'buildingDebris'
        ? effect.growthPerSecond
        : this.vfxResources.styles[effect.kind]?.growthPerSecond ?? 2.4;
      effect.mesh.scale.multiplyScalar(1 + delta * growthPerSecond);
      if (!setProceduralVfxProgress(effect.material, progress)) {
        effect.material.opacity = effect.kind === 'buildingDebris'
          ? effect.initialOpacity * Math.max(0, 1 - progress)
          : 1 - progress;
      }
      if (effect.lifetime >= effect.maxLife) {
        this.retireEffect(effect);
      }
    }
  }

  reset() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.removeProjectile(i);
    for (const effect of [...this.effects]) this.retireEffect(effect);
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    this.reset();
    for (const pool of Object.values(this.effectPools)) {
      for (const effect of pool) effect.material.dispose();
    }
    this.vfxResources.dispose();
    return true;
  }

  disposeProjectileResources() {
    return this.vfxResources.resetProjectileResources();
  }
}
