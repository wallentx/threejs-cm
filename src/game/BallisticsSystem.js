import * as THREE from 'three';
import {
  effectiveArmorMm,
  penetrationAtVelocity
} from '../simulation/ballistics/ArmorMath.js';
import { intersectSegmentOrientedBox3D } from '../simulation/geometry/OrientedBox.js';
import {
  intersectVehicleArmor,
  traceVehicleArmorExit
} from '../simulation/vehicles/VehicleArmorCollision.js';
import {
  intersectInfantryHitVolumes
} from '../simulation/infantry/InfantryHitVolumes.js';
import {
  queryVehicleInternalBlastCandidates,
  traceVehicleInternalPath
} from '../simulation/vehicles/VehicleInternalCollision.js';
import {
  intersectExposedVehicleCrew
} from '../simulation/vehicles/VehicleCrewExposure.js';
import { resolveArmorRicochet } from '../simulation/ballistics/ProjectileImpactPhysics.js';
import {
  resolveArmorPerforationEnergy,
  resolveInternalPenetrationEnergy
} from '../simulation/ballistics/ArmorTerminalEffects.js';
import {
  resolveVehicleExplosiveEffect,
  vehicleInternalBlastRadiusMeters
} from '../simulation/ballistics/VehicleExplosiveEffects.js';

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const UP = new THREE.Vector3(0, 1, 0);
const scratchClosest = new THREE.Vector3();
const scratchSegment = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const scratchPointOffset = new THREE.Vector3();
const scratchLocal = new THREE.Vector3();
const scratchIncoming = new THREE.Vector3();
const IMPACT_EPSILON = 1e-7;
// Renderer-independent finite height-field approximation: sample the entire
// swept segment at this metre-scale spacing, then refine the first crossing.
const TERRAIN_SWEEP_SAMPLE_SPACING_METERS = 0.25;
const TERRAIN_SWEEP_MAX_SAMPLES = 512;
const TERRAIN_SWEEP_REFINEMENT_ITERATIONS = 12;
const TERRAIN_SWEEP_MODEL = 'bounded_heightfield_segment_v1';
const TERRAIN_SWEEP_DATA_QUALITY =
  'bounded fixed-sample height-field collision approximation';

function terrainSweepMetadata(segmentDistance, sampleCount) {
  const spacingMeters = sampleCount > 0 ? segmentDistance / sampleCount : 0;
  return {
    terrainSweepSampleCount: sampleCount,
    terrainSweepSpacingMeters: spacingMeters,
    terrainSweepRefinementToleranceMeters:
      spacingMeters / (2 ** TERRAIN_SWEEP_REFINEMENT_ITERATIONS)
  };
}

export function distanceToSegment(point, start, end) {
  scratchSegment.subVectors(end, start);
  const lengthSq = scratchSegment.lengthSq();
  if (lengthSq <= 1e-9) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(
    scratchPointOffset.subVectors(point, start).dot(scratchSegment) / lengthSq,
    0,
    1
  );
  scratchClosest.copy(start).addScaledVector(scratchSegment, t);
  return scratchClosest.distanceTo(point);
}

export function segmentSphereIntersection(start, end, center, radius) {
  const direction = scratchSegment.subVectors(end, start);
  const offset = scratchPointOffset.subVectors(start, center);
  const a = direction.lengthSq();
  if (a <= 1e-9) return null;
  const b = 2 * offset.dot(direction);
  const c = offset.lengthSq() - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  const t = near >= 0 && near <= 1 ? near : (far >= 0 && far <= 1 ? far : null);
  return t == null ? null : start.clone().addScaledVector(direction, t);
}

export function segmentOrientedBoxIntersection(start, end, collider) {
  const intersection = intersectSegmentOrientedBox3D(start, end, collider);
  if (!intersection) return null;
  return {
    t: intersection.t,
    point: new THREE.Vector3(...intersection.point),
    normal: new THREE.Vector3(...intersection.normal)
  };
}

function findTerrainSweepImpact(start, end, getHeightAt) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const segmentDistance = Math.hypot(dx, dy, dz);
  if (segmentDistance <= IMPACT_EPSILON) {
    const ground = getHeightAt(start.x, start.z);
    if (!Number.isFinite(ground) || start.y > ground) return null;
    return {
      point: new THREE.Vector3(start.x, ground, start.z),
      distance: 0,
      ...terrainSweepMetadata(0, 0)
    };
  }

  const sampleCount = Math.min(
    TERRAIN_SWEEP_MAX_SAMPLES,
    Math.max(1, Math.ceil(segmentDistance / TERRAIN_SWEEP_SAMPLE_SPACING_METERS))
  );
  const heightAt = t => getHeightAt(start.x + dx * t, start.z + dz * t);
  let lowerT = 0;
  const lowerHeight = heightAt(lowerT);
  if (!Number.isFinite(lowerHeight)) return null;
  if (start.y <= lowerHeight) {
    return {
      point: new THREE.Vector3(start.x, lowerHeight, start.z),
      distance: 0,
      ...terrainSweepMetadata(segmentDistance, sampleCount)
    };
  }

  for (let index = 1; index <= sampleCount; index++) {
    const upperT = index / sampleCount;
    const upperHeight = heightAt(upperT);
    if (!Number.isFinite(upperHeight)) {
      lowerT = upperT;
      continue;
    }
    const upperY = start.y + dy * upperT;
    if (upperY > upperHeight) {
      lowerT = upperT;
      continue;
    }

    let refinedLower = lowerT;
    let refinedUpper = upperT;
    for (let refinement = 0; refinement < TERRAIN_SWEEP_REFINEMENT_ITERATIONS; refinement++) {
      const middle = (refinedLower + refinedUpper) * 0.5;
      const middleHeight = heightAt(middle);
      if (!Number.isFinite(middleHeight) || start.y + dy * middle > middleHeight) {
        refinedLower = middle;
      } else {
        refinedUpper = middle;
      }
    }
    const impactX = start.x + dx * refinedUpper;
    const impactZ = start.z + dz * refinedUpper;
    const impactHeight = getHeightAt(impactX, impactZ);
    if (!Number.isFinite(impactHeight)) return null;
    return {
      point: new THREE.Vector3(impactX, impactHeight, impactZ),
      distance: segmentDistance * refinedUpper,
      ...terrainSweepMetadata(segmentDistance, sampleCount)
    };
  }
  return null;
}

export function collectBuildingColliderRecords(buildingSystem) {
  if (!buildingSystem) return [];
  const ids = buildingSystem.getBuildingIds?.()
    ?? (buildingSystem.captureState?.().buildings ?? [])
      .map(building => String(building.id))
      .sort((a, b) => a.localeCompare(b));
  const records = [];
  for (const buildingId of ids) {
    const snapshot = buildingSystem.getCollisionSnapshot?.(buildingId);
    for (const record of snapshot?.records ?? []) {
      if (record.blocks?.includes('projectile') === false) continue;
      records.push(record);
    }
  }
  return records.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function calculateBuildingProjectileDamage(weapon, velocity) {
  const speed = Math.max(0, Number(velocity) || 0);
  const mass = Math.max(0, Number(weapon?.projectileMassKg) || 0);
  const caliber = Math.max(0, Number(weapon?.caliberMm) || 0);
  const explosiveRadius = Math.max(0, Number(weapon?.explosiveRadius) || 0);
  const kineticEnergyJ = 0.5 * mass * speed * speed;
  const kineticDamage = Math.sqrt(kineticEnergyJ) * 0.45;
  const explosiveDamage = explosiveRadius > 0
    ? Math.max(0, Number(weapon?.woundDamage) || 0) * 0.65 + explosiveRadius * 12
    : 0;
  return THREE.MathUtils.clamp(
    kineticDamage + caliber * 1.5 + explosiveDamage,
    1,
    480
  );
}

export function resolveArmorPenetration(weapon, velocity, nominalArmorMm, impactCosine) {
  const penetrationMm = penetrationAtVelocity(weapon, velocity);
  const effectiveMm = effectiveArmorMm(nominalArmorMm, impactCosine);
  return {
    penetrated: penetrationMm >= effectiveMm,
    penetrationMm,
    effectiveArmorMm: effectiveMm,
    residualRatio: effectiveMm > 0 ? penetrationMm / effectiveMm : 0
  };
}

export class BallisticsSystem {
  constructor({
    terrain = null,
    getUnits = () => [],
    random = Math.random,
    buildingSystem = null,
    getBuildingColliders = null
  } = {}) {
    this.terrain = terrain;
    this.getUnits = getUnits;
    this.random = random;
    this.buildingSystem = buildingSystem;
    this.getBuildingColliders = getBuildingColliders
      ?? (() => collectBuildingColliderRecords(this.buildingSystem));
  }

  integrate(projectile, delta) {
    projectile.previousPosition.copy(projectile.position);
    const drag = Math.exp(-projectile.weapon.dragPerSecond * delta);
    projectile.velocity.multiplyScalar(drag).addScaledVector(GRAVITY, delta);
    projectile.position.addScaledVector(projectile.velocity, delta);
    projectile.distanceTravelled += projectile.previousPosition.distanceTo(projectile.position);
    projectile.lifetime += delta;
  }

  detectImpact(projectile) {
    let closest = null;
    const segmentDistance = projectile.previousPosition.distanceTo(projectile.position);
    const segmentStartDistance = Math.max(0, projectile.distanceTravelled - segmentDistance);
    const consider = candidate => {
      if (!candidate) return;
      if (!closest
          || candidate.distance < closest.distance - IMPACT_EPSILON
          || (Math.abs(candidate.distance - closest.distance) <= IMPACT_EPSILON
            && candidate.kind === 'building'
            && closest.kind !== 'building')) {
        closest = candidate;
      }
    };
    const units = [...this.getUnits()];
    if (projectile.targetUnit && !units.includes(projectile.targetUnit)) {
      units.push(projectile.targetUnit);
    }
    for (const unit of units) {
      if (!unit || unit === projectile.attacker) continue;
      if (unit.faction === projectile.attacker?.faction) continue;
      // Combat effectiveness controls decisions and weapon operation, not
      // physical existence. Disabled and knocked-out vehicle hulls remain
      // valid swept armor collision targets.
      if (!unit.vehicleSpec && !unit.isCombatEffective?.()) continue;

      if (unit.type === 'infantry_squad') {
        for (const agent of unit.soldierAI?.getLivingAgents() ?? []) {
          const hit = intersectInfantryHitVolumes(
            projectile.previousPosition,
            projectile.position,
            {
              position: agent.position,
              stance: agent.stance,
              facing: agent.facing
            }
          );
          if (!hit) continue;
          const point = new THREE.Vector3(...hit.point);
          consider({
            kind: 'infantry',
            unit,
            agent,
            distance: point.distanceTo(projectile.previousPosition),
            point,
            hitVolumeId: hit.hitVolumeId,
            hitVolumeModelVersion: hit.modelVersion,
            hitVolumeDataQuality: hit.dataQuality
          });
        }
        continue;
      }

      if (unit.vehicleSpec) {
        const exposedCrewHit = intersectExposedVehicleCrew(
          projectile.previousPosition,
          projectile.position,
          unit
        );
        if (exposedCrewHit) {
          const point = new THREE.Vector3(...exposedCrewHit.point);
          consider({
            kind: 'exposed_vehicle_crew',
            unit,
            agent: exposedCrewHit.crewman,
            distance: point.distanceTo(projectile.previousPosition),
            point,
            hitVolumeId: exposedCrewHit.hitVolumeId,
            hitVolumeModelVersion: exposedCrewHit.modelVersion,
            hitVolumeDataQuality: exposedCrewHit.dataQuality
          });
        }
        const armorHit = intersectVehicleArmor(
          projectile.previousPosition,
          projectile.position,
          unit
        );
        const ignoresArmorHit = armorHit
          && projectile.armorIgnore?.unitId === unit.id
          && (
            projectile.armorIgnore?.plateId === armorHit.plateId
            || projectile.armorIgnore?.plateIds?.includes(armorHit.plateId)
            || projectile.armorIgnore?.armorVolumeId === armorHit.armorVolumeId
          );
        if (ignoresArmorHit
            && segmentStartDistance
              + Math.hypot(
                armorHit.point[0] - projectile.previousPosition.x,
                armorHit.point[1] - projectile.previousPosition.y,
                armorHit.point[2] - projectile.previousPosition.z
              )
                <= projectile.armorIgnore.untilDistance) {
          continue;
        }
        if (armorHit) {
          const point = new THREE.Vector3(...armorHit.point);
          consider({
            kind: 'vehicle',
            unit,
            distance: point.distanceTo(projectile.previousPosition),
            point,
            normal: new THREE.Vector3(...armorHit.normal),
            zone: armorHit.zone,
            fallbackZone: armorHit.fallbackZone,
            plateId: armorHit.plateId,
            armorVolumeId: armorHit.armorVolumeId,
            armorPart: armorHit.armorPart,
            armorGeometryQuality: armorHit.geometryQuality,
            nominalArmorMm: armorHit.nominalArmorMm,
            thicknessSourceZone: armorHit.thicknessSourceZone,
            thicknessDataQuality: armorHit.thicknessDataQuality,
            thicknessReferenceUrl: armorHit.thicknessReferenceUrl,
            localImpactPoint: [
              armorHit.localPoint.x,
              armorHit.localPoint.y,
              armorHit.localPoint.z
            ]
          });
        }
        continue;
      }

      if (unit.structureSpec) {
        const center = scratchPoint.copy(unit.position).add(new THREE.Vector3(0, unit.structureSpec.height * 0.5, 0));
        const point = segmentSphereIntersection(
          projectile.previousPosition,
          projectile.position,
          center,
          unit.structureSpec.hitRadius
        );
        const distance = point?.distanceTo(projectile.previousPosition) ?? Infinity;
        if (point) consider({ kind: 'structure', unit, distance, point });
      }
    }

    for (const collider of this.getBuildingColliders?.() ?? []) {
      if (collider.blocks?.includes('projectile') === false) continue;
      const intersection = segmentOrientedBoxIntersection(
        projectile.previousPosition,
        projectile.position,
        collider
      );
      if (!intersection) continue;
      consider({
        kind: 'building',
        buildingId: collider.buildingId,
        sectionId: collider.sectionId,
        colliderPartId: collider.partId,
        collider,
        normal: intersection.normal,
        distance: intersection.point.distanceTo(projectile.previousPosition),
        point: intersection.point
      });
    }
    if (projectile.armorIgnore
        && projectile.distanceTravelled >= projectile.armorIgnore.untilDistance) {
      projectile.armorIgnore = null;
    }
    if (this.terrain?.getHeightAt) {
      const terrainImpact = findTerrainSweepImpact(
        projectile.previousPosition,
        projectile.position,
        this.terrain.getHeightAt.bind(this.terrain)
      );
      if (terrainImpact) {
        consider({
          kind: 'terrain',
          ...terrainImpact,
          terrainSweepModel: TERRAIN_SWEEP_MODEL,
          terrainSweepRefinementIterations: TERRAIN_SWEEP_REFINEMENT_ITERATIONS,
          terrainSweepDataQuality: TERRAIN_SWEEP_DATA_QUALITY
        });
      }
    }
    return closest;
  }

  resolveVehicleImpact(projectile, hit) {
    const unit = hit.unit;
    scratchIncoming.copy(projectile.velocity).normalize();
    let zone = hit.zone;
    let fallbackZone = hit.fallbackZone ?? hit.zone;
    let impactNormal = hit.normal?.clone?.() ?? null;
    if (!zone) {
      scratchLocal.copy(hit.point).sub(unit.position).applyAxisAngle(UP, -unit.rotation);
      const turret = scratchLocal.y > 1.75;
      const longitudinal = Math.abs(scratchLocal.z) >= Math.abs(scratchLocal.x);
      const facing = longitudinal ? (scratchLocal.z >= 0 ? 'front' : 'rear') : 'side';
      zone = `${turret ? 'turret' : 'hull'}_${facing}`;
      fallbackZone = zone;
      const localNormal = longitudinal
        ? new THREE.Vector3(0, 0, scratchLocal.z >= 0 ? 1 : -1)
        : new THREE.Vector3(scratchLocal.x >= 0 ? 1 : -1, 0, 0);
      impactNormal = localNormal.applyAxisAngle(UP, unit.rotation);
    }
    impactNormal ??= scratchIncoming.clone().negate();
    const impactCosine = Math.abs(scratchIncoming.dot(impactNormal));
    const armorMm = unit.vehicleSpec?.armorMm ?? {};
    const thicknessZone = hit.thicknessSourceZone
      ?? (Object.hasOwn(armorMm, zone) ? zone : fallbackZone);
    const nominalArmorMm = Number.isFinite(hit.nominalArmorMm)
      ? hit.nominalArmorMm
      : armorMm[thicknessZone] ?? 20;
    const result = resolveArmorPenetration(
      projectile.weapon,
      projectile.velocity.length(),
      nominalArmorMm,
      impactCosine
    );
    const explosiveProjectile = projectile.weapon?.kind === 'cannon_he'
      || (projectile.weapon?.explosiveRadius ?? 0) > 0;
    const supportsIntactPenetration = !explosiveProjectile;
    const explosiveRadiusMeters = explosiveProjectile
      ? vehicleInternalBlastRadiusMeters(projectile.weapon)
      : 0;
    const explosiveCandidates = explosiveProjectile
      ? queryVehicleInternalBlastCandidates({
          unit,
          impactPoint: hit.point,
          radiusMeters: explosiveRadiusMeters
        })
      : [];
    const explosiveEffect = resolveVehicleExplosiveEffect({
      weapon: projectile.weapon,
      protection: unit.vehicleSpec?.explosiveProtection,
      penetrated: result.penetrated,
      nominalArmorMm,
      effectiveArmorMm: result.effectiveArmorMm,
      armorPart: hit.armorPart ?? zone.split('_')[0],
      detonationPoint: hit.point,
      internalCandidates: explosiveCandidates
    });
    const impactAngleDegrees = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(impactCosine, 0, 1))
    );
    const ricochet = resolveArmorRicochet({
      weapon: projectile.weapon,
      velocity: projectile.velocity,
      impactNormal,
      impactAngleDegrees,
      penetrated: result.penetrated,
      ricochetCount: projectile.ricochetCount ?? 0
    });
    const penetrationEnergy = resolveArmorPerforationEnergy({
      weapon: projectile.weapon,
      velocity: projectile.velocity,
      penetrationMm: result.penetrationMm,
      effectiveArmorMm: result.effectiveArmorMm,
      penetrated: result.penetrated && supportsIntactPenetration
    });
    const exitHit = result.penetrated && supportsIntactPenetration
      ? traceVehicleArmorExit({
          unit,
          armorVolumeId: hit.armorVolumeId,
          entryPoint: hit.point,
          direction: scratchIncoming
        })
      : null;
    const tracedInternalPath = result.penetrated
        && supportsIntactPenetration
        && exitHit
        && unit.vehicleSpec?.internalLayout
      ? traceVehicleInternalPath({
          unit,
          impactPoint: hit.point,
          direction: scratchIncoming,
          maxDistanceMeters: exitHit.distanceMeters
        })
      : [];
    const internalEnergy = resolveInternalPenetrationEnergy({
      weapon: projectile.weapon,
      pathHits: tracedInternalPath,
      initialEnergyJ: penetrationEnergy.plateResidualEnergyJ,
      impactEnergyJ: penetrationEnergy.impactEnergyJ
    });
    const exitReached = Boolean(exitHit) && !internalEnergy.stoppedInside;
    const exitArmorMm = unit.vehicleSpec?.armorMm ?? {};
    const exitThicknessZone = exitHit?.exitArmorPolicy === 'none'
      ? null
      : (exitHit?.thicknessSourceZone
        ?? (exitHit && Object.hasOwn(exitArmorMm, exitHit.zone)
          ? exitHit.zone
          : exitHit?.fallbackZone));
    const exitNominalArmorMm = exitReached
      ? (Number.isFinite(exitHit.nominalArmorMm)
          ? exitHit.nominalArmorMm
          : exitArmorMm[exitThicknessZone] ?? nominalArmorMm)
      : null;
    const exitImpactCosine = exitReached
      ? Math.abs(scratchIncoming.dot(new THREE.Vector3(...exitHit.normal)))
      : null;
    const exitPenetration = exitReached
      ? resolveArmorPenetration(
          projectile.weapon,
          internalEnergy.residualSpeed,
          exitNominalArmorMm,
          exitImpactCosine
        )
      : null;
    const exitEnergy = exitPenetration
      ? resolveArmorPerforationEnergy({
          weapon: projectile.weapon,
          velocity: scratchIncoming.clone().multiplyScalar(internalEnergy.residualSpeed),
          penetrationMm: exitPenetration.penetrationMm,
          effectiveArmorMm: exitPenetration.effectiveArmorMm,
          penetrated: exitPenetration.penetrated
        })
      : null;
    const penetratorContinues = penetrationEnergy.continuationKind === 'penetrator'
      && !internalEnergy.stoppedInside
      && Boolean(exitHit)
      && Boolean(exitPenetration?.penetrated)
      && exitEnergy?.continuationKind === 'penetrator';
    const finalResidualEnergyJ = exitEnergy?.plateResidualEnergyJ ?? 0;
    const finalResidualSpeed = exitEnergy?.plateResidualSpeed ?? 0;
    const residualVelocity = penetratorContinues
      ? scratchIncoming.clone().multiplyScalar(finalResidualSpeed).toArray()
      : null;
    const internalPathHits = result.penetrated && supportsIntactPenetration
      ? internalEnergy.hits
      : (explosiveProjectile ? [] : null);
    const continuationStartOffsetMeters = Math.max(
      0.015,
      (projectile.weapon?.caliberMm ?? 0) / 1000 * 0.6
    );
    const unitClearanceDistanceMeters = exitReached
      ? exitHit.distanceMeters + continuationStartOffsetMeters
      : 0;
    const internalTransitDistanceMeters = internalEnergy.stoppedInside
      ? internalEnergy.terminalDistanceMeters
      : (exitHit?.distanceMeters ?? internalEnergy.terminalDistanceMeters);
    const internalTransitSpeedSum = penetrationEnergy.plateResidualSpeed
      + internalEnergy.residualSpeed;
    const internalTransitSeconds = internalTransitDistanceMeters > 0
        && internalTransitSpeedSum > IMPACT_EPSILON
      ? (2 * internalTransitDistanceMeters) / internalTransitSpeedSum
      : 0;
    const exitPosition = exitReached ? [...exitHit.point] : null;
    const continuationKind = explosiveProjectile
      ? 'none'
      : (ricochet.ricocheted
      ? 'ricochet'
      : (penetratorContinues ? 'penetrator' : 'none'));
    const postImpactVelocity = explosiveProjectile
      ? null
      : (ricochet.ricocheted
      ? ricochet.postImpactVelocity
      : residualVelocity);
    const postImpactSpeed = explosiveProjectile
      ? 0
      : (ricochet.ricocheted
      ? ricochet.postImpactSpeed
      : (penetratorContinues ? finalResidualSpeed : 0));
    const outgoingEnergyJ = explosiveProjectile
      ? 0
      : (ricochet.ricocheted
      ? ricochet.outgoingEnergyJ
      : finalResidualEnergyJ);
    const retainedEnergyRatio = penetrationEnergy.impactEnergyJ > IMPACT_EPSILON
      ? outgoingEnergyJ / penetrationEnergy.impactEnergyJ
      : 0;
    const terminalEffect = explosiveProjectile
      ? 'detonated'
      : (ricochet.ricocheted
      ? 'ricochet'
      : (result.penetrated
          ? (penetratorContinues ? 'perforated_intact' : 'perforated_stopped')
          : 'stopped'));
    let continuationReason = explosiveProjectile
      ? 'explosive_detonation'
      : penetrationEnergy.continuationReason;
    if (!explosiveProjectile && ricochet.ricocheted) {
      continuationReason = ricochet.ricochetReason;
    } else if (!explosiveProjectile
        && result.penetrated
        && penetrationEnergy.continuationKind === 'penetrator') {
      if (internalEnergy.stoppedInside) {
        continuationReason = 'internal_energy_exhausted';
      } else if (!exitHit) {
        continuationReason = 'missing_exit_geometry';
      } else if (!exitPenetration?.penetrated) {
        continuationReason = 'exit_plate_stopped';
      } else if (penetratorContinues) {
        continuationReason = 'residual_energy';
      } else {
        continuationReason = exitEnergy?.continuationReason ?? 'exit_energy_exhausted';
      }
    }
    const crewResult = explosiveProjectile
      ? unit.applyVehicleExplosiveHit?.({
          explosiveEffect,
          penetrated: result.penetrated,
          random: this.random
        }) ?? null
      : unit.applyArmorHit?.({
          ...result,
          zone,
          damageZone: fallbackZone,
          componentZone: zone,
          internalPathHits,
          impactEnergyJ: penetrationEnergy.impactEnergyJ,
          residualEnergyJ: internalEnergy.residualEnergyJ,
          weapon: projectile.weapon,
          impactPoint: hit.point,
          random: this.random
        }) ?? null;
    return {
      ...result,
      ...ricochet,
      ...penetrationEnergy,
      ricocheted: explosiveProjectile ? false : ricochet.ricocheted,
      ricochetReason: explosiveProjectile
        ? 'explosive_detonation'
        : ricochet.ricochetReason,
      separationNormal: explosiveProjectile ? null : ricochet.separationNormal,
      clearanceMeters: explosiveProjectile ? null : ricochet.clearanceMeters,
      penetrationRatio: result.residualRatio,
      residualRatio: result.residualRatio,
      internalInitialEnergyJ: internalEnergy.internalInitialEnergyJ,
      internalEnergySpentJ: internalEnergy.internalEnergySpentJ,
      preExitResidualEnergyJ: internalEnergy.residualEnergyJ,
      exitArmorEnergySpentJ: exitEnergy?.armorEnergySpentJ ?? 0,
      residualEnergyJ: finalResidualEnergyJ,
      residualVelocity,
      postImpactVelocity,
      postImpactSpeed,
      outgoingEnergyJ,
      retainedEnergyRatio,
      continuationKind,
      penetrationCount: (projectile.penetrationCount ?? 0)
        + (penetratorContinues ? 1 : 0),
      continuationReason,
      terminalEffect,
      explosiveEffect,
      continuationStartOffsetMeters,
      unitClearanceDistanceMeters,
      exitPosition,
      exitResult: exitReached
        ? {
            plateId: exitHit.plateId,
            armorVolumeId: exitHit.armorVolumeId,
            armorPart: exitHit.armorPart,
            exitArmorPolicy: exitHit.exitArmorPolicy,
            zone: exitHit.zone,
            thicknessZone: exitThicknessZone,
            nominalArmorMm: exitNominalArmorMm,
            effectiveArmorMm: exitPenetration?.effectiveArmorMm ?? null,
            penetrationMm: exitPenetration?.penetrationMm ?? null,
            penetrated: Boolean(exitPenetration?.penetrated),
            impactCosine: exitImpactCosine,
            impactAngleDegrees: exitImpactCosine == null
              ? null
              : THREE.MathUtils.radToDeg(Math.acos(
                  THREE.MathUtils.clamp(exitImpactCosine, 0, 1)
                )),
            distanceMeters: exitHit.distanceMeters,
            point: [...exitHit.point],
            normal: [...exitHit.normal],
            thicknessDataQuality: exitHit.thicknessDataQuality ?? null,
            thicknessReferenceUrl: exitHit.thicknessReferenceUrl ?? null,
            geometryQuality: exitHit.geometryQuality ?? null,
            armorEnergySpentJ: exitEnergy?.armorEnergySpentJ ?? null,
            residualEnergyJ: exitEnergy?.plateResidualEnergyJ ?? null,
            residualSpeed: exitEnergy?.plateResidualSpeed ?? null
          }
        : null,
      internalTerminalDistanceMeters: internalEnergy.terminalDistanceMeters,
      internalTransitDistanceMeters,
      internalTransitSeconds,
      stoppedInsideVehicle: supportsIntactPenetration
        && result.penetrated
        && internalEnergy.stoppedInside,
      zone,
      thicknessZone,
      nominalArmorMm,
      impactCosine,
      impactNormal: impactNormal.toArray(),
      localImpactPoint: hit.localImpactPoint ? [...hit.localImpactPoint] : null,
      plateId: hit.plateId ?? null,
      armorVolumeId: hit.armorVolumeId ?? null,
      armorPart: hit.armorPart ?? zone.split('_')[0],
      armorGeometryQuality: hit.armorGeometryQuality ?? 'legacy inferred zone',
      thicknessDataQuality: hit.thicknessDataQuality ?? null,
      thicknessReferenceUrl: hit.thicknessReferenceUrl ?? null,
      impactAngleDegrees,
      internalPathHits,
      crewResult
    };
  }

  resolveStructureImpact(projectile, hit) {
    const unit = hit.unit;
    scratchIncoming.copy(projectile.velocity).normalize();
    const localIncoming = scratchIncoming.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -unit.rotation
    );
    const impactCosine = Math.max(0.12, Math.abs(localIncoming.z));
    const nominalArmorMm = unit.structureState?.armorMm ?? unit.structureSpec?.armorMm ?? 0;
    const result = resolveArmorPenetration(
      projectile.weapon,
      projectile.velocity.length(),
      nominalArmorMm,
      impactCosine
    );
    return {
      ...result,
      zone: 'front',
      nominalArmorMm,
      impactCosine,
      impactAngleDegrees: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(impactCosine, 0, 1))),
      crewResult: unit.applyStructureHit({ ...result, weapon: projectile.weapon, zone: 'front' })
    };
  }

  resolveBuildingImpact(projectile, hit) {
    if (!this.buildingSystem || hit.sectionId === 'rubble') {
      return {
        penetrated: false,
        zone: hit.sectionId ?? 'rubble',
        sectionId: hit.sectionId ?? 'rubble',
        colliderPartId: hit.colliderPartId ?? null,
        nominalArmorMm: null,
        impactCosine: null,
        impactAngleDegrees: null,
        effectiveArmorMm: null,
        penetrationMm: null,
        buildingResult: null
      };
    }
    const descriptor = this.buildingSystem.getDescriptorForBuilding(hit.buildingId);
    const section = descriptor.sections.find(candidate => candidate.id === hit.sectionId);
    if (!section) throw new Error(`Unknown building section ${hit.sectionId}`);

    scratchIncoming.copy(projectile.velocity).normalize();
    const impactCosine = Math.max(
      0.05,
      Math.abs(scratchIncoming.dot(hit.normal ?? scratchIncoming))
    );
    const penetrationMm = penetrationAtVelocity(
      projectile.weapon,
      projectile.velocity.length()
    );
    const effectiveResistanceMm = effectiveArmorMm(section.resistanceMm, impactCosine);
    const penetrated = penetrationMm >= effectiveResistanceMm;
    const buildingResult = this.buildingSystem.applyProjectileDamage(hit.buildingId, {
      sectionId: hit.sectionId,
      colliderPartId: hit.colliderPartId,
      amount: calculateBuildingProjectileDamage(
        projectile.weapon,
        projectile.velocity.length()
      ),
      penetrationMm: penetrationMm * impactCosine,
      createBreach: penetrated
    });
    return {
      penetrated: buildingResult.result.penetrated,
      residualRatio: effectiveResistanceMm > 0
        ? penetrationMm / effectiveResistanceMm
        : 0,
      zone: hit.sectionId,
      sectionId: hit.sectionId,
      colliderPartId: hit.colliderPartId,
      nominalArmorMm: section.resistanceMm,
      impactCosine,
      impactAngleDegrees: THREE.MathUtils.radToDeg(
        Math.acos(THREE.MathUtils.clamp(impactCosine, 0, 1))
      ),
      effectiveArmorMm: effectiveResistanceMm,
      penetrationMm,
      buildingResult
    };
  }
}
