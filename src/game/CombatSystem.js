import * as THREE from 'three';
import { BallisticsSystem } from './BallisticsSystem.js';
import { getWeapon } from './WeaponCatalog.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchAim = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();

export class CombatSystem {
  constructor(scene, soundEngine, random = Math.random, options = {}) {
    this.scene = scene;
    this.sound = soundEngine;
    this.random = random;
    this.projectiles = [];
    this.effects = [];
    this.shotSequence = 0;
    this.telemetry = {
      shotsFired: 0,
      infantryHits: 0,
      vehicleHits: 0,
      penetrations: 0,
      ricochets: 0,
      impacts: []
    };
    this.ballistics = new BallisticsSystem({
      terrain: options.terrain ?? null,
      getUnits: options.getUnits ?? (() => []),
      random
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
      : (targetUnit?.type === 'tank' ? 1.15 + this.random() * 1.25 : 1.1);

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
    const geometry = isCannon
      ? new THREE.SphereGeometry(Math.max(0.07, weapon.caliberMm / 450), 6, 5)
      : new THREE.CylinderGeometry(0.014, 0.014, 0.44, 5);
    if (!isCannon) geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: isCannon ? 0xffd166 : 0xffb347,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(fromPos);
    mesh.lookAt(toPos);
    this.scene.add(mesh);

    const projectile = {
      id: ++this.shotSequence,
      mesh,
      attacker,
      shooterId: options.shooter?.id ?? null,
      targetUnit,
      targetSoldierId: options.targetSoldier?.id ?? null,
      weapon,
      position: fromPos.clone(),
      previousPosition: fromPos.clone(),
      velocity,
      distanceTravelled: 0,
      lifetime: 0,
      maxLifetime: weapon.maxRange / Math.max(1, weapon.muzzleVelocity) + 1
    };
    this.projectiles.push(projectile);
    this.telemetry.shotsFired++;

    if (isCannon) this.sound?.playCannon?.();
    else this.sound?.playGunshot?.(weapon.kind === 'machine_gun' ? 'mg42' : 'garand');
    return true;
  }

  removeProjectile(index) {
    const projectile = this.projectiles[index];
    this.scene.remove(projectile.mesh);
    projectile.mesh.geometry?.dispose();
    projectile.mesh.material?.dispose();
    this.projectiles.splice(index, 1);
  }

  recordImpact(projectile, impact, result = null) {
    this.telemetry.impacts.push({
      weaponId: projectile.weapon.id,
      shooterId: projectile.shooterId,
      targetId: impact.unit?.id ?? null,
      kind: impact.kind,
      zone: result?.zone ?? null,
      penetrated: result?.penetrated ?? null,
      rangeMeters: projectile.distanceTravelled
    });
    if (this.telemetry.impacts.length > 100) this.telemetry.impacts.shift();
  }

  resolveImpact(projectile, impact) {
    const weapon = projectile.weapon;
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
      return;
    }

    if (impact.kind === 'vehicle') {
      const result = this.ballistics.resolveVehicleImpact(projectile, impact);
      impact.unit.applySuppression(result.penetrated ? 55 : 14);
      this.telemetry.vehicleHits++;
      if (result.penetrated) this.telemetry.penetrations++;
      else this.telemetry.ricochets++;
      this.recordImpact(projectile, impact, result);
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.55);
      } else {
        this.createImpactEffect(impact.point, result.penetrated ? 0xff5a36 : 0xe8f0ff);
      }
      return;
    }

    this.recordImpact(projectile, impact);
    if (weapon.explosiveRadius > 0) {
      this.applyBlast(impact.point, weapon, projectile.attacker);
      this.createExplosionEffect(impact.point, 0.6);
    } else {
      this.createImpactEffect(impact.point, 0xd6b36a);
    }
  }

  applyBlast(position, weapon, attacker) {
    const radius = weapon.explosiveRadius;
    if (radius <= 0) return;
    for (const unit of this.ballistics.getUnits()) {
      if (!unit?.isCombatEffective?.() || unit === attacker) continue;
      if (unit.type === 'infantry_squad') {
        for (const agent of unit.soldierAI?.getLivingAgents() ?? []) {
          const distance = agent.position.distanceTo(position);
          if (distance > radius) continue;
          const falloff = 1 - distance / radius;
          agent.applyDamage(weapon.woundDamage * falloff, 80 * falloff);
        }
        unit.applySuppression(35);
      } else if (unit.position.distanceTo(position) <= radius * 1.5) {
        unit.applySuppression(22);
      }
    }
  }

  createImpactEffect(pos, color = 0xffb347) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), material);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.effects.push({ mesh, lifetime: 0, maxLife: 0.18 });
  }

  createExplosionEffect(pos, scale = 1) {
    this.sound?.playExplosion?.();
    const group = new THREE.Group();
    group.position.copy(pos);
    group.scale.setScalar(scale);
    const blast = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.9,
        toneMapped: false
      })
    );
    group.add(blast);
    this.scene.add(group);
    this.effects.push({ mesh: group, lifetime: 0, maxLife: 0.6 });
  }

  update(delta) {
    const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
    const step = delta / steps;
    for (let substep = 0; substep < steps; substep++) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const projectile = this.projectiles[i];
        this.ballistics.integrate(projectile, step);
        projectile.mesh.position.copy(projectile.position);
        projectile.mesh.lookAt(
          scratchDirection.copy(projectile.position).add(projectile.velocity)
        );
        const impact = this.ballistics.detectImpact(projectile);
        const expired = projectile.lifetime >= projectile.maxLifetime
          || projectile.distanceTravelled >= projectile.weapon.maxRange;
        if (impact) {
          this.resolveImpact(projectile, impact);
          this.removeProjectile(i);
        } else if (expired) {
          this.removeProjectile(i);
        }
      }
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.lifetime += delta;
      const progress = effect.lifetime / effect.maxLife;
      effect.mesh.scale.multiplyScalar(1 + delta * 2.4);
      effect.mesh.traverse((object) => {
        if (object.material) object.material.opacity = 1 - progress;
      });
      if (effect.lifetime >= effect.maxLife) {
        this.scene.remove(effect.mesh);
        effect.mesh.traverse((object) => {
          object.geometry?.dispose();
          object.material?.dispose();
        });
        this.effects.splice(i, 1);
      }
    }
  }

  reset() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.removeProjectile(i);
    for (const effect of this.effects) {
      this.scene.remove(effect.mesh);
      effect.mesh.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
    }
    this.effects = [];
  }
}
