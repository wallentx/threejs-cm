import * as THREE from 'three';
import { effectiveArmorMm, penetrationAtVelocity } from './VehicleCatalog.js';
import { intersectSegmentOrientedBox3D } from '../simulation/geometry/OrientedBox.js';
import { intersectVehicleArmor } from '../simulation/vehicles/VehicleArmorCollision.js';
import { traceVehicleInternalPath } from '../simulation/vehicles/VehicleInternalCollision.js';
import { resolveArmorRicochet } from '../simulation/ballistics/ProjectileImpactPhysics.js';

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const UP = new THREE.Vector3(0, 1, 0);
const scratchClosest = new THREE.Vector3();
const scratchSegment = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const scratchPointOffset = new THREE.Vector3();
const scratchLocal = new THREE.Vector3();
const scratchIncoming = new THREE.Vector3();
const IMPACT_EPSILON = 1e-7;

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
      if (!unit?.isCombatEffective?.() || unit === projectile.attacker) continue;
      if (unit.faction === projectile.attacker?.faction) continue;

      if (unit.type === 'infantry_squad') {
        for (const agent of unit.soldierAI?.getLivingAgents() ?? []) {
          const center = scratchPoint.copy(agent.position).add(new THREE.Vector3(0, 0.92, 0));
          const point = segmentSphereIntersection(
            projectile.previousPosition,
            projectile.position,
            center,
            0.34
          );
          if (!point) continue;
          consider({
            kind: 'infantry',
            unit,
            agent,
            distance: point.distanceTo(projectile.previousPosition),
            point
          });
        }
        continue;
      }

      if (unit.vehicleSpec) {
        const armorHit = intersectVehicleArmor(
          projectile.previousPosition,
          projectile.position,
          unit
        );
        if (armorHit
            && projectile.armorIgnore?.unitId === unit.id
            && projectile.armorIgnore?.plateId === armorHit.plateId
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
    if (closest) return closest;

    if (this.terrain) {
      const ground = this.terrain.getHeightAt(projectile.position.x, projectile.position.z);
      if (projectile.position.y <= ground) {
        return {
          kind: 'terrain',
          point: new THREE.Vector3(projectile.position.x, ground, projectile.position.z)
        };
      }
    }
    return null;
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
    const internalPathHits = result.penetrated && unit.vehicleSpec?.internalLayout
      ? traceVehicleInternalPath({
          unit,
          impactPoint: hit.point,
          direction: scratchIncoming
        })
      : null;
    return {
      ...result,
      ...ricochet,
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
      crewResult: unit.applyArmorHit?.({
        ...result,
        zone,
        damageZone: fallbackZone,
        componentZone: zone,
        internalPathHits,
        weapon: projectile.weapon,
        impactPoint: hit.point,
        random: this.random
      }) ?? null
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
