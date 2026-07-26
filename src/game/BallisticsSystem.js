import * as THREE from 'three';
import { effectiveArmorMm, penetrationAtVelocity } from './VehicleCatalog.js';

const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const scratchClosest = new THREE.Vector3();
const scratchSegment = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const scratchPointOffset = new THREE.Vector3();
const scratchLocal = new THREE.Vector3();
const scratchIncoming = new THREE.Vector3();

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
  constructor({ terrain = null, getUnits = () => [], random = Math.random } = {}) {
    this.terrain = terrain;
    this.getUnits = getUnits;
    this.random = random;
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
          const distance = distanceToSegment(
            center,
            projectile.previousPosition,
            projectile.position
          );
          if (distance <= 0.34 && (!closest || distance < closest.distance)) {
            closest = { kind: 'infantry', unit, agent, distance, point: center.clone() };
          }
        }
        continue;
      }

      if (unit.type === 'tank') {
        const center = scratchPoint.copy(unit.position).add(new THREE.Vector3(0, 1.35, 0));
        const radius = unit.vehicleSpec?.hitRadius ?? 2.4;
        const point = segmentSphereIntersection(
          projectile.previousPosition,
          projectile.position,
          center,
          radius
        );
        const distance = point?.distanceTo(projectile.previousPosition) ?? Infinity;
        if (point && (!closest || distance < closest.distance)) {
          closest = {
            kind: 'vehicle',
            unit,
            distance,
            point
          };
        }
      }
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
    scratchLocal.copy(hit.point).sub(unit.position).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -unit.rotation
    );
    const turret = scratchLocal.y > 1.75;
    const longitudinal = Math.abs(scratchLocal.z) >= Math.abs(scratchLocal.x);
    const facing = longitudinal ? (scratchLocal.z >= 0 ? 'front' : 'rear') : 'side';
    const zone = `${turret ? 'turret' : 'hull'}_${facing}`;

    scratchIncoming.copy(projectile.velocity).normalize();
    const localIncoming = scratchIncoming.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -unit.rotation
    );
    const impactCosine = longitudinal
      ? Math.abs(localIncoming.z)
      : Math.abs(localIncoming.x);
    const nominalArmorMm = unit.vehicleSpec?.armorMm?.[zone] ?? 20;
    const result = resolveArmorPenetration(
      projectile.weapon,
      projectile.velocity.length(),
      nominalArmorMm,
      impactCosine
    );
    return {
      ...result,
      zone,
      nominalArmorMm,
      crewResult: unit.applyArmorHit?.({
        ...result,
        zone,
        weapon: projectile.weapon,
        impactPoint: hit.point,
        random: this.random
      }) ?? null
    };
  }
}
