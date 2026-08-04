import * as THREE from 'three';
import { CombatSystem } from '../game/CombatSystem.js';
import { Unit } from '../game/Unit.js';
import { VehicleDamageEffects } from '../world/VehicleDamageEffects.js';
import { VEHICLE_TARGET_MODES } from '../simulation/combat/VehicleWeaponSelection.js';
import { FRANCE_1940_CATALOG_PORTS } from '../content/france1940/catalogPorts.js';
import { FRANCE_1940_FACTIONS } from '../content/france1940/factions.js';

export const DEBUG_VEHICLE_SEPARATION_METERS = 45.72;
export const DEBUG_FIXED_STEP_SECONDS = 1 / 30;

export const DEBUG_FLAK_88_AP_WEAPON = Object.freeze({
  id: 'DEBUG_FLAK_88_AP',
  name: '8.8 cm Flak 18/36 AP',
  kind: 'cannon_ap',
  cartridge: '8.8 cm Pzgr. Patr. m. Bd. Z.',
  caliberMm: 88,
  muzzleVelocity: 810,
  projectileMassKg: 9.4,
  dragPerSecond: 0.025,
  practicalRPM: 15,
  cyclicRPM: 15,
  magazineSize: 1,
  reloadSeconds: 4,
  carriedAmmo: 1,
  burstSize: 1,
  dispersionMOA: 1.5,
  maxRange: 4000,
  tracerEvery: 1,
  explosiveRadius: 0,
  penetrationMmAt100m: 137,
  penetrationVelocityExponent: 1.35,
  woundDamage: 500,
  dataQuality:
    'sandbox-only Flak 18/36 AP calibration record; 810 m/s muzzle velocity, approximately 9.4 kg projectile mass, and 15 rpm practical ground-target cadence follow U.S. War Department TM E9-369A; 137 mm at 100 m, drag, dispersion, reload, maximum runtime range, and terminal damage are labeled gameplay approximations fitted to the manual captured-document penetration table',
  referenceUrl:
    'https://lonesentry.com/manuals/88mm-antiaircraft-gun/ammunition-german-88-mm-aa-gun.html',
  penetrationReferenceUrl:
    'https://www.lonesentry.com/articles/ttt08/penetration-german-88mm.html'
});

export const DEBUG_FLAK_88_HE_WEAPON = Object.freeze({
  id: 'DEBUG_FLAK_88_HE',
  name: '8.8 cm Flak 18/36 HE',
  kind: 'cannon_he',
  cartridge: '8.8 cm Sprgr. Patr. L/4.5 (kz.) m. A.Z. 23/28',
  caliberMm: 88,
  muzzleVelocity: 820,
  projectileMassKg: 9.23,
  explosiveFillKg: 0.993,
  dragPerSecond: 0.027,
  practicalRPM: 15,
  cyclicRPM: 15,
  magazineSize: 1,
  reloadSeconds: 4,
  carriedAmmo: 1,
  burstSize: 1,
  dispersionMOA: 1.7,
  maxRange: 4000,
  tracerEvery: 1,
  explosiveRadius: 11.5,
  penetrationMmAt100m: 0,
  woundDamage: 520,
  dataQuality:
    'sandbox-only Flak 18/36 percussion-fuzed HE calibration record; 820 m/s muzzle velocity, approximately 9.23 kg projectile mass, and 0.993 kg TNT or amatol bursting charge follow U.S. War Department TM E9-369A; blast radius, drag, dispersion, reload, maximum runtime range, and terminal damage are labeled gameplay approximations',
  referenceUrl:
    'https://lonesentry.com/manuals/88mm-antiaircraft-gun/ammunition-german-88-mm-aa-gun.html'
});

const FLAT_TERRAIN = Object.freeze({
  getHeightAt: () => 0,
  getMovementHeightAt: () => 0,
  getRenderedTerrainHeightAt: () => 0,
  getOpenGroundHeightAt: () => 0
});

function canonicalFactionForVehicle(vehicleId) {
  return Object.values(FRANCE_1940_FACTIONS)
    .find(faction => faction.vehicleIds.includes(vehicleId))?.id ?? null;
}

export function listDebugVehicleOptions({
  catalogPorts = FRANCE_1940_CATALOG_PORTS,
  armedOnly = false
} = {}) {
  return Object.values(catalogPorts.vehicles.records)
    .filter(vehicle => !armedOnly || Boolean(vehicle.mainGun)
      || vehicle.weaponMounts?.some(mount => mount.kind === 'cannon'))
    .map(vehicle => Object.freeze({
      id: vehicle.id,
      name: vehicle.name,
      factionId: canonicalFactionForVehicle(vehicle.id),
      armed: Boolean(vehicle.mainGun)
        || vehicle.weaponMounts?.some(mount => mount.kind === 'cannon')
    }));
}

export function listDebugGunOptions({
  catalogPorts = FRANCE_1940_CATALOG_PORTS
} = {}) {
  const byWeaponId = new Map();
  const addWeaponUse = ({ vehicle, ammoType, weaponId, mountId, mountLabel }) => {
    const current = byWeaponId.get(weaponId) ?? {
      id: weaponId,
      weaponId,
      ammoType,
      weapon: catalogPorts.weapons.get(weaponId),
      compatibleUses: [],
      sandboxOnly: false
    };
    current.compatibleUses.push(Object.freeze({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      mountId,
      mountLabel
    }));
    byWeaponId.set(weaponId, current);
  };
  for (const vehicle of listDebugVehicleOptions({ catalogPorts, armedOnly: true })) {
    for (const [ammoType, weaponId] of Object.entries(
      catalogPorts.vehicles.get(vehicle.id).mainGun ?? {}
    )) {
      addWeaponUse({
        vehicle,
        ammoType,
        weaponId,
        mountId: 'main',
        mountLabel: 'Turret main gun'
      });
    }
    for (const mount of catalogPorts.vehicles.get(vehicle.id).weaponMounts ?? []) {
      if (mount.kind !== 'cannon') continue;
      for (const [ammoType, weaponId] of Object.entries(mount.weapons ?? {})) {
        addWeaponUse({
          vehicle,
          ammoType,
          weaponId,
          mountId: mount.id,
          mountLabel: mount.label
        });
      }
    }
  }
  const canonical = [...byWeaponId.values()].map(option => Object.freeze({
    ...option,
    name: option.weapon?.name ?? option.weaponId,
    compatibleUses: Object.freeze([...option.compatibleUses]),
    compatibleVehicleIds: Object.freeze([
      ...new Set(option.compatibleUses.map(use => use.vehicleId))
    ]),
    compatibleVehicleNames: Object.freeze([
      ...new Set(option.compatibleUses.map(use => use.vehicleName))
    ])
  }));
  const sandboxOption = weapon => Object.freeze({
    id: weapon.id,
    weaponId: weapon.id,
    ammoType: weapon.kind.endsWith('_he') ? 'he' : 'ap',
    weapon,
    name: `${weapon.name} - SANDBOX ONLY`,
    compatibleUses: Object.freeze([]),
    compatibleVehicleIds: Object.freeze([]),
    compatibleVehicleNames: Object.freeze([]),
    sandboxOnly: true
  });
  return Object.freeze([
    ...canonical,
    sandboxOption(DEBUG_FLAK_88_AP_WEAPON),
    sandboxOption(DEBUG_FLAK_88_HE_WEAPON)
  ]);
}

export function createDeterministicDebugRandom(seed = 0x19400510) {
  let state = seed >>> 0;
  return () => {
    let value = state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state = value >>> 0;
    return state / 0x100000000;
  };
}

export function createVehicleDebugUnit({
  id,
  vehicleId,
  side,
  position = new THREE.Vector3(),
  rotation = 0,
  visualFactories,
  catalogPorts = FRANCE_1940_CATALOG_PORTS,
  UnitType = Unit
}) {
  if (!visualFactories?.familyId) {
    throw new TypeError('Vehicle debug sandbox requires family visual factories');
  }
  const canonicalFaction = canonicalFactionForVehicle(vehicleId);
  if (!canonicalFaction) throw new Error(`Unknown France 1940 vehicle ${vehicleId}`);
  const vehicle = catalogPorts.vehicles.get(vehicleId);
  const unit = new UnitType({
    id,
    name: `${vehicle.name} (Debug ${side})`,
    faction: canonicalFaction,
    type: 'vehicle',
    vehicleId,
    position,
    rotation,
    catalogPorts,
    visualFactories,
    terrain: FLAT_TERRAIN
  });
  // The family faction selects the authored presentation. The sandbox side is
  // the adversarial team identity consumed by the real ballistics filter.
  unit.debugCanonicalFaction = canonicalFaction;
  unit.faction = `debug-${side}`;
  return unit;
}

export function createVehicleDebugVehicles({
  visualFactories,
  catalogPorts = FRANCE_1940_CATALOG_PORTS,
  UnitType = Unit,
  leftVehicleId = 'SOMUA_S35',
  rightVehicleId = 'PANZER_III_D',
  separationMeters = DEBUG_VEHICLE_SEPARATION_METERS
} = {}) {
  const halfSeparation = separationMeters * 0.5;
  return {
    left: createVehicleDebugUnit({
      id: 'debug-duel-left',
      vehicleId: leftVehicleId,
      side: 'left',
      position: new THREE.Vector3(0, 0, -halfSeparation),
      rotation: 0,
      visualFactories,
      catalogPorts,
      UnitType
    }),
    right: createVehicleDebugUnit({
      id: 'debug-duel-right',
      vehicleId: rightVehicleId,
      side: 'right',
      position: new THREE.Vector3(0, 0, halfSeparation),
      rotation: Math.PI,
      visualFactories,
      catalogPorts,
      UnitType
    })
  };
}

function disposeUnitMesh(unit) {
  if (!unit?.mesh) return;
  unit.mesh.removeFromParent();
  const geometries = new Set();
  const materials = new Set();
  unit.mesh.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (material) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

export class VehicleDebugSandboxSimulation {
  constructor({
    scene,
    visualFactories,
    catalogPorts = FRANCE_1940_CATALOG_PORTS,
    vfxProvider = visualFactories?.vfxProvider,
    vfxRuntime = null,
    random = createDeterministicDebugRandom()
  } = {}) {
    if (!scene?.isScene) throw new TypeError('Vehicle debug simulation requires a Three.js scene');
    this.scene = scene;
    this.visualFactories = visualFactories;
    this.catalogPorts = catalogPorts;
    this.vfxProvider = vfxProvider;
    this.vfxRuntime = vfxRuntime;
    this.random = random;
    this.mode = null;
    this.units = [];
    this.visibleUnits = [];
    this.combat = null;
    this.damageEffects = null;
    this.accumulator = 0;
    this.gunShot = null;
    this.gunAttacker = null;
  }

  clearScenario() {
    this.vfxRuntime?.clear();
    this.combat?.dispose();
    this.damageEffects?.dispose();
    this.combat = null;
    this.damageEffects = null;
    for (const unit of this.units) disposeUnitMesh(unit);
    this.units = [];
    this.visibleUnits = [];
    this.gunShot = null;
    this.gunAttacker = null;
    this.accumulator = 0;
  }

  createCombat() {
    this.combat = new CombatSystem(
      this.scene,
      null,
      this.random,
      {
        terrain: FLAT_TERRAIN,
        getUnits: () => this.units,
        vfxProvider: this.vfxProvider,
        vfxRuntime: this.vfxRuntime
      }
    );
    this.damageEffects = new VehicleDamageEffects({
      vfxProvider: this.vfxProvider,
      vfxRuntime: this.vfxRuntime
    });
    for (const unit of this.visibleUnits) this.damageEffects.register(unit);
  }

  setupDuel({
    leftVehicleId = 'SOMUA_S35',
    rightVehicleId = 'PANZER_III_D',
    separationMeters = DEBUG_VEHICLE_SEPARATION_METERS
  } = {}) {
    this.clearScenario();
    this.mode = 'duel';
    const vehicles = createVehicleDebugVehicles({
      visualFactories: this.visualFactories,
      catalogPorts: this.catalogPorts,
      leftVehicleId,
      rightVehicleId,
      separationMeters
    });
    this.units = [vehicles.left, vehicles.right];
    this.visibleUnits = [...this.units];
    for (const unit of this.units) this.scene.add(unit.mesh);
    vehicles.left.targetUnit = vehicles.right;
    vehicles.left.targetPos = vehicles.right.position.clone();
    vehicles.left.targetMode = VEHICLE_TARGET_MODES.AP;
    vehicles.right.targetUnit = vehicles.left;
    vehicles.right.targetPos = vehicles.left.position.clone();
    vehicles.right.targetMode = VEHICLE_TARGET_MODES.AP;
    this.createCombat();
    return vehicles;
  }

  setupGun({
    targetVehicleId = 'SOMUA_S35',
    gunOptionId = 'KWK36_AP',
    distanceMeters = 100
  } = {}) {
    this.clearScenario();
    this.mode = 'gun';
    const gun = listDebugGunOptions({ catalogPorts: this.catalogPorts })
      .find(option => option.id === gunOptionId);
    if (!gun) throw new Error(`Unknown debug gun option ${gunOptionId}`);
    const target = createVehicleDebugUnit({
      id: 'debug-gun-target',
      vehicleId: targetVehicleId,
      side: 'target',
      visualFactories: this.visualFactories,
      catalogPorts: this.catalogPorts
    });
    this.gunAttacker = {
      id: 'debug-camera-normal-gun',
      faction: 'debug-shooter',
      catalogPorts: this.catalogPorts,
      position: new THREE.Vector3(),
      recordAuthoritativeShot() {}
    };
    this.units = [target];
    this.visibleUnits = [target];
    this.scene.add(target.mesh);
    this.gun = gun;
    this.gunDistanceMeters = distanceMeters;
    this.createCombat();
    return { target, gun };
  }

  queueGunShot(worldPoint, cameraDirection = new THREE.Vector3(0, 0, -1)) {
    if (this.mode !== 'gun') return false;
    if (!worldPoint?.isVector3 || this.combat.projectiles.length > 0) return false;
    const [target] = this.units;
    const direction = cameraDirection.clone();
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, -1);
    direction.normalize();
    const muzzlePosition = worldPoint.clone()
      .addScaledVector(direction, -this.gunDistanceMeters);
    this.gunAttacker.position.copy(muzzlePosition);
    const fired = this.combat.fireWeapon(
      this.gunAttacker,
      target,
      worldPoint,
      {
        weapon: this.gun.weapon,
        mountId: 'debug-camera-normal',
        aimPoint: worldPoint,
        muzzlePosition,
        dispersionScale: 0,
        estimatedRangeMeters: this.gunDistanceMeters,
        rangeErrorMeters: 0,
        aimRequiredSeconds: 0,
        fireControlModelVersion: 'debug-camera-normal-v1'
      }
    );
    if (!fired) return false;
    this.gunShot = {
      phase: 'in-flight',
      aimPoint: worldPoint.clone(),
      cameraDirection: direction,
      muzzlePosition,
      shotCountBefore: this.combat.telemetry.shotsFired - 1
    };
    return true;
  }

  step() {
    for (const unit of this.units) {
      unit.update(DEBUG_FIXED_STEP_SECONDS, FLAT_TERRAIN, { haltMovement: true });
    }
    if (this.mode === 'duel') {
      const [left, right] = this.units;
      for (const [attacker, target] of [[left, right], [right, left]]) {
        attacker.updateVehicleCombat(DEBUG_FIXED_STEP_SECONDS, {
          target,
          combat: this.combat,
          shooterMoving: false,
          targetMoving: false,
          random: this.random
        });
      }
    }
    this.combat.update(DEBUG_FIXED_STEP_SECONDS);
    if (
      this.mode === 'gun'
      && this.gunShot?.phase === 'in-flight'
      && this.combat.projectiles.length === 0
    ) {
      this.gunShot.phase = 'complete';
    }
  }

  advance(deltaSeconds) {
    this.accumulator += Math.min(0.25, Math.max(0, deltaSeconds));
    while (this.accumulator + 1e-12 >= DEBUG_FIXED_STEP_SECONDS) {
      this.step();
      this.accumulator -= DEBUG_FIXED_STEP_SECONDS;
    }
    this.damageEffects?.update(
      Math.max(0, deltaSeconds),
      this.visibleUnits,
      this.combat?.telemetry.impacts ?? []
    );
  }

  dispose() {
    this.clearScenario();
  }
}
