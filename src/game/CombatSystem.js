import * as THREE from 'three';
import { BallisticsSystem } from './BallisticsSystem.js';
import { getWeapon } from './WeaponCatalog.js';
import { worldToLocalPoint } from '../simulation/buildings/BuildingTransforms.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchAim = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchRicochetNormal = new THREE.Vector3();
const PROJECTILE_SUBSTEP_EPSILON = 1e-8;
const MAX_PROJECTILE_CONTACTS_PER_SUBSTEP = 4;
const MAX_TRAJECTORY_POINTS = 128;

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

function createProjectileMesh(weapon, resources) {
  const isCannon = weapon.kind.startsWith('cannon');
  const key = `${isCannon ? 'cannon' : 'small-arm'}:${weapon.caliberMm}`;
  let resource = resources.get(key);
  if (!resource) {
    const geometry = isCannon
      ? new THREE.SphereGeometry(Math.max(0.07, weapon.caliberMm / 450), 6, 5)
      : new THREE.CylinderGeometry(0.014, 0.014, 0.44, 5);
    if (!isCannon) geometry.rotateX(Math.PI / 2);
    resource = {
      geometry,
      material: new THREE.MeshBasicMaterial({
        color: isCannon ? 0xffd166 : 0xffb347,
        toneMapped: false
      })
    };
    resources.set(key, resource);
  }
  return new THREE.Mesh(resource.geometry, resource.material);
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
    this.projectileResources = new Map();
    this.effectPools = { impact: [], explosion: [] };
    this.effectGeometries = {
      impact: new THREE.SphereGeometry(0.16, 6, 5),
      explosion: new THREE.SphereGeometry(2.5, 12, 12)
    };
    this.effectCaps = { impact: 48, explosion: 12 };
    this.shotSequence = 0;
    this.impactSequence = 0;
    this.telemetry = createTelemetry();
    this.buildingSystem = options.buildingSystem ?? null;
    this.onBuildingChanged = options.onBuildingChanged ?? null;
    this.onOccupantConsequences = options.onOccupantConsequences ?? null;
    this.onOccupantConsequence = options.onOccupantConsequence ?? null;
    this.ballistics = new BallisticsSystem({
      terrain: options.terrain ?? null,
      getUnits: options.getUnits ?? (() => []),
      random,
      buildingSystem: this.buildingSystem,
      getBuildingColliders: options.getBuildingColliders ?? null
    });
  }

  fireWeapon(attacker, targetUnit, targetPos, options = {}) {
    const weapon = options.weapon
      ?? getWeapon(options.weaponId)
      ?? getWeapon(options.shooter?.weapon);
    if (!attacker || !weapon || (!targetUnit && !targetPos)) return false;

    const fromPos = options.muzzlePosition?.clone()
      ?? options.shooter?.getMuzzleWorldPosition?.()
      ?? (options.shooter
        ? attacker.getSoldierWorldPosition(options.shooter.id).add(new THREE.Vector3(0, 1.35, 0))
        : null)
      ?? attacker.getMuzzleWorldPosition?.()
      ?? attacker.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const targetSoldierPosition = options.targetSoldier?.position
      ?? (options.targetSoldier?.worldPosition
        ? new THREE.Vector3().fromArray(options.targetSoldier.worldPosition)
        : null);
    const toPos = scratchAim.copy(
      targetSoldierPosition
        ?? (targetUnit ? targetUnit.position : targetPos)
    ).clone();
    toPos.y += options.targetSoldier
      ? 0.92
      : (targetUnit?.vehicleSpec ? 1.15 + this.random() * 1.25 : 1.1);

    const range = fromPos.distanceTo(toPos);
    const estimatedFlightTime = range / Math.max(1, weapon.muzzleVelocity);
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
    const velocity = scratchDirection.clone().multiplyScalar(weapon.muzzleVelocity);
    const isCannon = weapon.kind.startsWith('cannon');
    const mesh = createProjectileMesh(weapon, this.projectileResources);
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
      weapon,
      ammoId: options.ammoId ?? weapon.ammunitionId ?? weapon.id,
      muzzlePosition: fromPos.clone(),
      position: fromPos.clone(),
      previousPosition: fromPos.clone(),
      velocity,
      distanceTravelled: 0,
      lifetime: 0,
      maxLifetime: weapon.maxRange / Math.max(1, weapon.muzzleVelocity) + 1,
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

    if (isCannon) this.sound?.playCannon?.();
    else this.sound?.playGunshot?.(weapon.kind === 'machine_gun' ? 'mg42' : 'garand');
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
        weaponId: projectile.weapon.id,
        ammoId: projectile.ammoId,
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
      const weapon = getWeapon(saved.weaponId);
      const attacker = unitMap.get(saved.attackerId) ?? null;
      if (!weapon || !attacker) continue;

      const projectile = {
        id: saved.id,
        mesh: createProjectileMesh(weapon, this.projectileResources),
        attacker,
        shooterId: saved.shooterId ?? attacker.id,
        mountId: saved.mountId ?? null,
        targetUnit: unitMap.get(saved.targetUnitId) ?? null,
        targetSoldierId: saved.targetSoldierId ?? null,
        weapon,
        ammoId: saved.ammoId ?? weapon.ammunitionId ?? weapon.id,
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
      weaponId: projectile.weapon.id,
      ammoId: projectile.ammoId,
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
    if (!damageResult) return;
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
  }

  acquireEffect(kind) {
    const pool = this.effectPools[kind];
    let effect = pool.find(candidate => !candidate.active);
    if (!effect && pool.length < this.effectCaps[kind]) {
      const material = new THREE.MeshBasicMaterial({
        color: kind === 'explosion' ? 0xff4500 : 0xffb347,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false
      });
      effect = {
        kind,
        mesh: new THREE.Mesh(this.effectGeometries[kind], material),
        material,
        active: false,
        lifetime: 0,
        maxLife: 0
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

  startEffect(kind, pos, { color, scale = 1, maxLife }) {
    const effect = this.acquireEffect(kind);
    if (!effect) return;
    effect.active = true;
    effect.lifetime = 0;
    effect.maxLife = maxLife;
    effect.material.color.setHex(color);
    effect.material.opacity = 0.9;
    effect.mesh.position.copy(pos);
    effect.mesh.scale.setScalar(scale);
    effect.mesh.visible = true;
    if (effect.mesh.parent !== this.scene) this.scene.add(effect.mesh);
    this.effects.push(effect);
  }

  retireEffect(effect) {
    const activeIndex = this.effects.indexOf(effect);
    if (activeIndex >= 0) this.effects.splice(activeIndex, 1);
    effect.active = false;
    effect.mesh.visible = false;
    effect.material.opacity = 0;
    if (effect.mesh.parent) effect.mesh.parent.remove(effect.mesh);
  }

  createImpactEffect(pos, color = 0xffb347) {
    this.startEffect('impact', pos, { color, scale: 1, maxLife: 0.18 });
  }

  createExplosionEffect(pos, scale = 1) {
    this.sound?.playExplosion?.();
    this.startEffect('explosion', pos, { color: 0xff4500, scale, maxLife: 0.6 });
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
      effect.mesh.scale.multiplyScalar(1 + delta * 2.4);
      effect.material.opacity = 1 - progress;
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
    this.reset();
    for (const pool of Object.values(this.effectPools)) {
      for (const effect of pool) effect.material.dispose();
    }
    Object.values(this.effectGeometries).forEach(geometry => geometry.dispose());
    this.disposeProjectileResources();
  }

  disposeProjectileResources() {
    for (const resource of this.projectileResources.values()) {
      resource.geometry.dispose();
      resource.material.dispose();
    }
    this.projectileResources.clear();
  }
}
