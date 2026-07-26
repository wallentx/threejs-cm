import * as THREE from 'three';
import { BallisticsSystem } from './BallisticsSystem.js';
import { getWeapon } from './WeaponCatalog.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchAim = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();

function createTelemetry() {
  return {
    shotsFired: 0,
    infantryHits: 0,
    vehicleHits: 0,
    penetrations: 0,
    ricochets: 0,
    impacts: []
  };
}

function snapshotCrewResult(crewResult) {
  if (!crewResult) return null;
  const casualty = crewResult.casualty
    ? {
        id: crewResult.casualty.id,
        name: crewResult.casualty.name,
        role: crewResult.casualty.role,
        status: crewResult.casualty.status,
        health: crewResult.casualty.health
      }
    : null;
  return {
    penetrated: Boolean(crewResult.penetrated),
    casualty,
    damage: crewResult.damage ? { ...crewResult.damage } : null,
    components: crewResult.components?.map(component => ({ ...component })) ?? [],
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
    crewResult: snapshotCrewResult(record.crewResult)
  };
}

function snapshotTelemetry(telemetry) {
  return {
    shotsFired: telemetry.shotsFired,
    infantryHits: telemetry.infantryHits,
    vehicleHits: telemetry.vehicleHits,
    penetrations: telemetry.penetrations,
    ricochets: telemetry.ricochets,
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
    this.telemetry = createTelemetry();
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
      maxLifetime: weapon.maxRange / Math.max(1, weapon.muzzleVelocity) + 1
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
        maxLifetime: projectile.maxLifetime
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
        maxLifetime: saved.maxLifetime
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
    const record = {
      id: projectile.id,
      shooterId: projectile.shooterId,
      mountId: projectile.mountId,
      targetId: impact.unit?.id ?? null,
      targetSoldierId: impact.agent?.id ?? projectile.targetSoldierId ?? null,
      weaponId: projectile.weapon.id,
      ammoId: projectile.ammoId,
      muzzlePosition: projectile.muzzlePosition.toArray(),
      impactPosition: impact.point.toArray(),
      flightTime: projectile.lifetime,
      rangeMeters: projectile.distanceTravelled,
      impactSpeed: projectile.velocity.length(),
      kind: impact.kind,
      zone: result?.zone ?? null,
      nominalArmorMm: result?.nominalArmorMm ?? null,
      impactCosine: result?.impactCosine ?? null,
      impactAngleDegrees: result?.impactAngleDegrees ?? null,
      effectiveArmorMm: result?.effectiveArmorMm ?? null,
      penetrationMm: result?.penetrationMm ?? null,
      penetrated: result?.penetrated ?? null,
      crewResult: snapshotCrewResult(result?.crewResult)
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
          penetrations: this.telemetry.penetrations,
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

    if (impact.kind === 'structure') {
      const result = this.ballistics.resolveStructureImpact(projectile, impact);
      impact.unit.applySuppression(result.penetrated ? 38 : 8);
      this.telemetry.vehicleHits++;
      if (result.penetrated) this.telemetry.penetrations++;
      else this.telemetry.ricochets++;
      this.recordImpact(projectile, impact, result);
      if (weapon.explosiveRadius > 0) {
        this.applyBlast(impact.point, weapon, projectile.attacker);
        this.createExplosionEffect(impact.point, 0.65);
      } else {
        this.createImpactEffect(impact.point, result.penetrated ? 0xff7b46 : 0xcbd5e1);
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
        if (unit.structureSpec) unit.applyStructureBlast(position, weapon);
        unit.applySuppression(22);
      }
    }
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
        this.ballistics.integrate(projectile, step);
        orientProjectileMesh(projectile);
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
