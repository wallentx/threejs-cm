import * as THREE from 'three';
import { UnitFactory } from '../world/UnitFactory.js';
import { SoldierAI } from './SoldierAI.js';
import { getVehicle, vehicleIdForFaction } from './VehicleCatalog.js';
import { getWeapon } from './WeaponCatalog.js';
import { getStructure } from './StructureCatalog.js';
import {
  applyStructureDamage,
  createStructureState,
  structureDamageReport
} from './StructureSystems.js';
import {
  applyPenetrationComponentDamage,
  captureVehicleMountState,
  createVehicleComponents,
  createVehicleDamageState,
  createVehicleMountState,
  recordVehicleEvent,
  setVehicleComponentHealth,
  vehicleDamageReport
} from './VehicleSystems.js';
import { createCapsuleOffsets } from '../simulation/collision/StaticCollisionWorld.js';

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const MAX_VEHICLE_MOUNT_ROUNDS_PER_STEP = 64;
const VEHICLE_MOUNT_CADENCE_EPSILON = 1e-9;

export class Unit {
  constructor(config) {
    this.id = config.id || `unit_${Math.floor(Math.random() * 10000)}`;
    this.name = config.name || 'French Infantry Squad';
    this.faction = config.faction || 'french'; // 'french' or 'german'
    this.type = config.type || 'infantry_squad'; // 'infantry_squad', 'tank', 'vehicle', 'bunker'
    this.vehicleId = config.vehicleId
      ?? (['tank', 'vehicle'].includes(this.type) ? vehicleIdForFaction(this.faction) : null);
    this.vehicleSpec = getVehicle(this.vehicleId);
    this.structureSpec = getStructure(config.structureId)
      ?? (this.type === 'bunker' ? getStructure('GERMAN_MG34_BUNKER') : null);
    this.collisionWorld = null;
    const vehicleDimensions = this.vehicleSpec?.dimensionsMeters;
    this.collisionRadius = vehicleDimensions
      ? vehicleDimensions.width * 0.5 + 0.08
      : 0;
    this.collisionOffsets = vehicleDimensions
      ? createCapsuleOffsets(vehicleDimensions.length, this.collisionRadius)
      : [];

    // Position & Transform
    this.position = new THREE.Vector3().copy(config.position || new THREE.Vector3());
    this.rotation = config.rotation || 0;

    // Soft Factors
    this.experience = config.experience || 'Regular';
    this.morale = 'OK'; // 'OK', 'Pinned', 'Shaken', 'Panic', 'Broken'
    this.suppression = 0;
    this.fatigue = 'Ready';
    this.leadership = config.leadership || 0;

    // C2 Status
    this.c2Voice = true;
    this.c2Radio = true;
    this.hqUnit = config.hqUnit || null;

    // Squad Roster
    this.squadSize = config.squadSize || this.vehicleSpec?.crew.length || (['tank', 'vehicle'].includes(this.type) ? 3 : 6);
    this.roster = this.initRoster();

    // Read-only compatibility summary. Soldier and vehicle weapon states own ammunition.
    this.ammo = config.ammo || {
      rifle: 0,
      bar: 0,
      ap: 0,
      he: 0
    };

    // Movement & Orders
    this.waypoints = [];
    this.currentWaypointIndex = 0;
    this.moveSpeed = 0;
    this.isHiding = false;
    this.isDeployed = false;
    this.stance = 'STANDING';

    // Combat Target
    this.targetUnit = null;
    this.targetPos = null;
    this.targetMode = null;

    // Vehicle Damage
    this.vehicleDamage = {
      hull: 'OK', turret: 'OK', gun: 'OK', engine: 'OK', tracks: 'OK'
    };
    this.vehicleComponents = createVehicleComponents(this.vehicleSpec, config.vehicleComponents);
    this.vehicleDamageState = createVehicleDamageState(config.vehicleDamageState);
    if (!config.vehicleComponents && config.vehicleDamage) {
      this.applyLegacyVehicleDamage(config.vehicleDamage);
    }
    this.vehicleWeapon = this.vehicleSpec?.mainGun ? this.initVehicleWeapon(config.vehicleWeapon) : null;
    this.vehicleMounts = this.initVehicleMounts(config.vehicleMounts);
    if (this.vehicleWeapon) this.vehicleMounts.main = this.vehicleWeapon;
    if (this.vehicleDamageState.secondaryExplosion) this.destroyVehicleAmmunitionStores();
    this.syncLegacyVehicleDamage();
    this.structureState = createStructureState(this.structureSpec, config.structureState);
    this.currentLOD = null;

    // 3D Mesh
    this.mesh = null;
    this.initMesh();
    this.soldierAI = this.type === 'infantry_squad' ? new SoldierAI(this) : null;
    this.refreshAmmoSummary();
  }

  initRoster() {
    if (this.vehicleSpec) {
      return this.vehicleSpec.crew.map((crewman, index) => ({
        id: index,
        name: `${crewman.label} ${index + 1}`,
        role: crewman.role,
        weapon: null,
        status: 'OK',
        health: 100
      }));
    }

    const roster = [];
    const weapons = this.faction === 'french'
      ? ['MAS-36 Rifle', 'MAS-36 Rifle', 'FM 24/29 LMG', 'MAS-36 Rifle', 'MAS-36 Rifle', 'MAS-38 SMG']
      : ['Kar98k', 'Kar98k', 'MG34 LMG', 'Kar98k', 'Kar98k', 'MP40'];
    const roles = ['Squad Leader', 'Rifleman', 'Automatic Rifleman', 'Rifleman', 'Assistant Gunner', 'Assistant Leader'];

    for (let i = 0; i < this.squadSize; i++) {
      roster.push({
        id: i,
        name: `${this.faction === 'french' ? 'Chasseur' : 'Grenadier'} ${i + 1}`,
        role: roles[i % roles.length],
        weapon: weapons[i % weapons.length],
        status: 'OK',
        health: 100
      });
    }
    return roster;
  }

  initVehicleWeapon(state = null) {
    if (state) {
      const loadedWeapon = state.loadedType
        ? getWeapon(this.vehicleSpec?.mainGun?.[state.loadedType])
        : null;
      return {
        ...state,
        ammunition: { ap: 0, he: 0, ...state.ammunition },
        feedAmmo: state.feedAmmo ?? (loadedWeapon ? 1 : 0),
        targetUnitId: state.targetUnitId ?? null,
        targetPos: state.targetPos ? [...state.targetPos] : null,
        targetMode: state.targetMode ?? null,
        isFiring: Boolean(state.isFiring),
        fireState: state.fireState ?? 'IDLE'
      };
    }
    const initialType = this.vehicleSpec.mainGun.ap ? 'ap' : 'he';
    const weapon = getWeapon(this.vehicleSpec.mainGun[initialType]);
    const ammunition = { ap: 0, he: 0, ...this.vehicleSpec.ammunition };
    const feedAmmo = Math.min(weapon?.magazineSize ?? 1, ammunition[initialType] ?? 0);
    ammunition[initialType] = Math.max(0, ammunition[initialType] - feedAmmo);
    return {
      loadedType: feedAmmo > 0 ? initialType : null,
      pendingType: initialType,
      ammunition,
      feedAmmo,
      reloadTimer: 0,
      cooldown: 0,
      recoilTimer: 0,
      turretYaw: 0,
      roundsFired: 0,
      targetUnitId: null,
      targetPos: null,
      targetMode: null,
      isFiring: false,
      fireState: feedAmmo > 0 ? 'READY' : 'EMPTY'
    };
  }

  initVehicleMounts(saved = null) {
    if (!this.vehicleSpec) return {};
    return Object.fromEntries((this.vehicleSpec.weaponMounts ?? []).map(mount => [
      mount.id,
      createVehicleMountState(mount, saved?.[mount.id])
    ]));
  }

  initMesh() {
    if (this.vehicleSpec) {
      this.mesh = UnitFactory.createTankMesh(this.vehicleSpec.modelId);
    } else if (this.type === 'bunker') {
      this.mesh = UnitFactory.createBunkerMesh();
    } else {
      this.mesh = UnitFactory.createInfantrySquadMesh(this.faction, this.roster);
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
  }

  replaceRoster(roster) {
    const previousMesh = this.mesh;
    this.roster = roster.map(soldier => ({
      ...soldier,
      worldPosition: soldier.worldPosition ? [...soldier.worldPosition] : undefined,
      velocity: soldier.velocity ? [...soldier.velocity] : undefined,
      slotOffset: soldier.slotOffset ? [...soldier.slotOffset] : undefined
    }));
    this.squadSize = this.roster.length;
    this.initMesh();
    this.soldierAI = new SoldierAI(this);
    this.refreshAmmoSummary();
    return previousMesh;
  }

  addWaypoint(posVec3, orderType = 'QUICK', pauseSec = 0) {
    if (this.currentWaypointIndex >= this.waypoints.length && this.waypoints.length > 0) {
      this.waypoints = [];
      this.currentWaypointIndex = 0;
    }
    this.waypoints.push({
      position: posVec3.clone(),
      orderType,
      pauseSeconds: pauseSec,
      remainingPause: pauseSec,
      reached: false
    });
  }

  addPause(seconds = 15) {
    const lastWaypoint = this.waypoints[this.waypoints.length - 1];
    if (lastWaypoint) {
      lastWaypoint.pauseSeconds += seconds;
      lastWaypoint.remainingPause += seconds;
      return;
    }
    this.addWaypoint(this.position, 'PAUSE', seconds);
  }

  clearWaypoints() {
    this.waypoints = [];
    this.currentWaypointIndex = 0;
  }

  pruneCompletedWaypoints() {
    if (this.currentWaypointIndex <= 0) return;
    this.waypoints = this.waypoints.slice(this.currentWaypointIndex);
    this.currentWaypointIndex = 0;
  }

  applySuppression(amount) {
    this.suppression = Math.min(100, this.suppression + amount);
    if (this.suppression > 75) {
      this.morale = 'Broken';
      this.stance = 'PRONE';
    } else if (this.suppression > 45) {
      this.morale = 'Pinned';
      this.stance = 'PRONE';
    } else if (this.suppression > 20) {
      this.morale = 'Shaken';
      this.stance = 'KNEELING';
    } else {
      this.morale = 'OK';
    }
  }

  getLivingSoldiers() {
    return this.soldierAI?.getLivingSoldiers() ?? [];
  }

  isCombatEffective() {
    if (this.type === 'infantry_squad') return this.getLivingSoldiers().length > 0;
    if (this.structureSpec) return !this.structureState.destroyed && !this.structureState.firingDisabled;
    if (this.vehicleSpec) {
      return this.roster.some(crewman => crewman.health > 0 && crewman.status !== 'KIA')
        && this.vehicleDamage.hull !== 'DESTROYED';
    }
    return true;
  }

  getReadyShooters() {
    return this.soldierAI?.getReadyShooters() ?? [];
  }

  chooseTargetSoldier(random) {
    return this.soldierAI?.chooseTarget(random) ?? null;
  }

  getSoldierWorldPosition(soldierId) {
    return this.soldierAI?.getWorldPosition(soldierId) ?? this.position.clone();
  }

  applySoldierHit(soldierId, lethality, random) {
    return this.soldierAI?.applyHit(soldierId, lethality, random) ?? null;
  }

  applySoldierDamage(soldierId, damage, suppression = 35) {
    return this.soldierAI?.applyDamage(soldierId, damage, suppression) ?? null;
  }

  registerIncomingFire(threatPosition, impactPosition, options = {}) {
    return this.soldierAI?.registerIncomingFire(threatPosition, impactPosition, options) ?? 0;
  }

  updateIndividualCombat(delta, context) {
    this.soldierAI?.updateCombat(delta, context);
    this.refreshAmmoSummary();
  }

  refreshAmmoSummary() {
    if (this.soldierAI) {
      this.ammo.rifle = 0;
      this.ammo.bar = 0;
      for (const agent of this.soldierAI.agents) {
        const weapon = getWeapon(agent.weaponId);
        const rounds = agent.magazineAmmo + agent.reserveAmmo;
        if (weapon?.kind === 'rifle') this.ammo.rifle += rounds;
        else this.ammo.bar += rounds;
      }
    } else if (this.vehicleWeapon) {
      this.ammo.ap = this.vehicleWeapon.ammunition.ap
        + (this.vehicleWeapon.loadedType === 'ap' ? this.vehicleWeapon.feedAmmo : 0);
      this.ammo.he = this.vehicleWeapon.ammunition.he
        + (this.vehicleWeapon.loadedType === 'he' ? this.vehicleWeapon.feedAmmo : 0);
    }
  }

  getLivingCrew() {
    if (!this.vehicleSpec) return [];
    return this.roster.filter(crewman => crewman.health > 0 && crewman.status !== 'KIA');
  }

  isCrewRoleAlive(roles) {
    return this.getLivingCrew().some(crewman => roles.includes(crewman.role));
  }

  hasOperationalGunner() {
    return Boolean(this.vehicleSpec)
      && this.isCrewRoleAlive(this.vehicleSpec.gunnerRoles)
      && this.vehicleComponents.main_gun?.operational
      && this.vehicleComponents.breech?.operational
      && !this.vehicleDamageState.destroyed;
  }

  hasOperationalDriver() {
    return !this.vehicleSpec || (
      this.isCrewRoleAlive(this.vehicleSpec.driverRoles)
      && this.vehicleComponents.engine?.operational
      && this.vehicleComponents.transmission?.operational
      && this.vehicleComponents.tracks?.operational
      && !this.vehicleDamageState.destroyed
    );
  }

  hasOperationalLoader() {
    return Boolean(this.vehicleSpec)
      && this.isCrewRoleAlive(this.vehicleSpec.loaderRoles)
      && this.vehicleComponents.breech?.operational
      && !this.vehicleDamageState.destroyed;
  }

  getMuzzleWorldPosition() {
    const muzzle = this.mesh?.userData.muzzle;
    if (muzzle) {
      this.mesh.updateWorldMatrix(true, true);
      return muzzle.getWorldPosition(new THREE.Vector3());
    }
    return this.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  }

  getStructureDamageReport() {
    return structureDamageReport(this);
  }

  applyStructureHit(result) {
    if (!this.structureState || this.structureState.destroyed) {
      return { penetrated: false, destroyed: Boolean(this.structureState?.destroyed) };
    }
    const damageScale = result.penetrated ? 1 : 0.13;
    const projectileMass = result.weapon?.projectileMassKg ?? 0.01;
    const caliber = result.weapon?.caliberMm ?? 8;
    const explosive = result.weapon?.explosiveRadius ?? 0;
    const baseDamage = explosive > 0
      ? explosive * 45 + caliber * 1.3
      : projectileMass * 70 + caliber * 0.42;
    const resultState = applyStructureDamage(this.structureState, Math.max(1, baseDamage * damageScale), {
      penetration: result.penetrated,
      weaponId: result.weapon?.id ?? null,
      zone: result.zone ?? 'front'
    });
    this.syncStructureVisuals();
    return {
      penetrated: result.penetrated,
      destroyed: resultState.destroyed,
      damage: structureDamageReport(this),
      eventVersion: this.structureState.eventVersion
    };
  }

  applyStructureBlast(position, weapon) {
    if (!this.structureState || this.structureState.destroyed) return null;
    const radius = weapon?.explosiveRadius ?? 0;
    if (radius <= 0) return null;
    const distance = this.position.distanceTo(position);
    if (distance > radius * 1.5) return null;
    const falloff = Math.max(0, 1 - distance / (radius * 1.5));
    const result = applyStructureDamage(this.structureState, weapon.woundDamage * falloff * 0.72, {
      penetration: false,
      weaponId: weapon.id,
      zone: 'blast'
    });
    this.syncStructureVisuals();
    return result;
  }

  syncStructureVisuals() {
    if (!this.structureState || !this.mesh?.userData.structureDamageParts) return;
    const { health, maxHealth, destroyed } = this.structureState;
    const parts = this.mesh.userData.structureDamageParts;
    const ratio = health / Math.max(1, maxHealth);
    if (parts.intact) parts.intact.visible = !destroyed;
    if (parts.ruin) parts.ruin.visible = destroyed;
    if (parts.gun) {
      parts.gun.visible = !destroyed;
      parts.gun.rotation.x = destroyed ? 0.45 : 0;
    }
    for (const material of parts.materials ?? []) {
      material.color.setRGB(0.16 + ratio * 0.12, 0.13 + ratio * 0.18, 0.1 + ratio * 0.23);
    }
    this.syncStructureCollision();
  }

  bindCollisionWorld(collisionWorld) {
    this.collisionWorld = collisionWorld ?? null;
    this.syncStructureCollision();
  }

  syncStructureCollision() {
    if (!this.collisionWorld || !this.structureSpec) return;
    const destroyed = Boolean(this.structureState?.destroyed);
    const dimensions = destroyed
      ? this.structureSpec.destroyedFootprintMeters
      : this.structureSpec.dimensionsMeters;
    this.collisionWorld.upsertCollider({
      id: `structure:${this.id}`,
      type: destroyed ? 'structure_rubble' : 'structure',
      centerX: this.position.x,
      centerZ: this.position.z,
      halfX: dimensions.width * 0.5,
      halfZ: dimensions.depth * 0.5,
      rotation: this.rotation,
      // Collapsed concrete remains impassable to vehicles, while infantry can
      // enter the rendered rubble and use it as fighting cover.
      blocks: destroyed ? ['vehicle'] : ['vehicle', 'infantry']
    });
  }

  getVehicleMountMuzzleWorldPosition(mountId) {
    if (mountId === 'main') return this.getMuzzleWorldPosition();
    const muzzle = this.mesh?.userData.weaponMuzzles?.[mountId]
      ?? this.mesh?.userData.mountMuzzles?.[mountId]
      ?? null;
    if (!muzzle?.getWorldPosition) return null;
    this.mesh.updateWorldMatrix(true, true);
    return muzzle.getWorldPosition(new THREE.Vector3());
  }

  getVehicleMountSpec(mountId) {
    return this.vehicleSpec?.weaponMounts?.find(mount => mount.id === mountId) ?? null;
  }

  isVehicleMountOperational(mountId) {
    const mount = this.getVehicleMountSpec(mountId);
    const state = this.vehicleMounts?.[mountId];
    const component = this.vehicleComponents?.[mount?.componentId ?? mountId];
    return Boolean(
      mount
      && state
      && component?.operational
      && this.isCrewRoleAlive(mount.crewRoles)
      && !this.vehicleDamageState.destroyed
      && !this.vehicleDamageState.burning
    );
  }

  beginVehicleMountReload(mountId) {
    const mount = this.getVehicleMountSpec(mountId);
    const state = this.vehicleMounts?.[mountId];
    const weapon = getWeapon(mount?.weaponId);
    if (!mount || !state || !weapon || state.feedAmmo > 0 || state.reloadTimer > 0
        || state.reserveAmmo <= 0 || !this.isVehicleMountOperational(mountId)
        || !this.isCrewRoleAlive(mount.loaderRoles)
        || !this.vehicleComponents.ammunition?.operational) return false;
    state.reloadTimer = weapon.reloadSeconds;
    state.fireState = 'RELOADING';
    return true;
  }

  getVehicleAmmunitionHandlingFactor() {
    const ammunition = this.vehicleComponents.ammunition;
    if (!ammunition?.installed || !ammunition.operational) return 0;
    return ammunition.status === 'DAMAGED' ? 0.55 : 1;
  }

  destroyVehicleAmmunitionStores() {
    if (this.vehicleWeapon) {
      for (const type of Object.keys(this.vehicleWeapon.ammunition)) {
        this.vehicleWeapon.ammunition[type] = 0;
      }
      this.vehicleWeapon.feedAmmo = 0;
      this.vehicleWeapon.loadedType = null;
      this.vehicleWeapon.reloadTimer = 0;
      this.vehicleWeapon.isFiring = false;
      this.vehicleWeapon.fireState = 'DESTROYED';
    }
    for (const mount of this.vehicleSpec?.weaponMounts ?? []) {
      const state = this.vehicleMounts[mount.id];
      if (!state) continue;
      state.feedAmmo = 0;
      state.reserveAmmo = 0;
      state.reloadTimer = 0;
      state.isFiring = false;
      state.fireState = 'DESTROYED';
    }
  }

  getVehicleMovementFactor() {
    if (!this.vehicleSpec || !this.hasOperationalDriver()) return this.vehicleSpec ? 0 : 1;
    let factor = 1;
    if (this.vehicleComponents.engine.status === 'DAMAGED') factor *= 0.58;
    if (this.vehicleComponents.transmission.status === 'DAMAGED') factor *= 0.68;
    if (this.vehicleComponents.tracks.status === 'DAMAGED') factor *= 0.62;
    return factor;
  }

  syncLegacyVehicleDamage() {
    if (!this.vehicleSpec) return;
    const legacyStatus = component => {
      if (!component?.installed) return 'OK';
      if (!component.operational || component.status === 'DESTROYED') return 'DESTROYED';
      return component.status === 'DAMAGED' ? 'DAMAGED' : 'OK';
    };
    const gunStatus = [this.vehicleComponents.main_gun, this.vehicleComponents.breech]
      .some(component => component?.installed && !component.operational)
      ? 'DESTROYED'
      : ([this.vehicleComponents.main_gun, this.vehicleComponents.breech]
          .some(component => component?.status === 'DAMAGED') ? 'DAMAGED' : 'OK');
    this.vehicleDamage.hull = this.vehicleDamageState.destroyed
      ? 'DESTROYED'
      : legacyStatus(this.vehicleComponents.hull);
    this.vehicleDamage.turret = legacyStatus(this.vehicleComponents.turret_traverse);
    this.vehicleDamage.gun = gunStatus;
    this.vehicleDamage.engine = legacyStatus(this.vehicleComponents.engine);
    this.vehicleDamage.tracks = legacyStatus(this.vehicleComponents.tracks);

    const hasRadioCrew = this.vehicleSpec.crew.some(crew => /RADIO/.test(crew.role));
    this.c2Radio = Boolean(this.vehicleComponents.radio?.operational)
      && (!hasRadioCrew || this.getLivingCrew().some(crew => /RADIO/.test(crew.role)));
  }

  applyLegacyVehicleDamage(legacyDamage = {}) {
    const healthFor = status => status === 'DESTROYED' ? 0 : (status === 'DAMAGED' ? 50 : null);
    const mappings = {
      hull: ['hull'],
      turret: ['turret_traverse'],
      gun: ['main_gun', 'breech'],
      engine: ['engine'],
      tracks: ['tracks']
    };
    for (const [legacyId, componentIds] of Object.entries(mappings)) {
      const health = healthFor(legacyDamage[legacyId]);
      if (health == null) continue;
      for (const componentId of componentIds) {
        setVehicleComponentHealth(this.vehicleComponents, componentId, health);
      }
    }
    if (legacyDamage.hull === 'DESTROYED') this.vehicleDamageState.destroyed = true;
  }

  getVehicleDamageReport() {
    return vehicleDamageReport(this);
  }

  beginVehicleReload(ammoType = 'ap') {
    if (!this.vehicleWeapon || this.vehicleWeapon.loadedType || this.vehicleWeapon.reloadTimer > 0) return false;
    const weaponId = this.vehicleSpec.mainGun[ammoType];
    const weapon = getWeapon(weaponId);
    if (!weapon || !this.hasOperationalLoader()
        || this.getVehicleAmmunitionHandlingFactor() <= 0
        || (this.vehicleWeapon.ammunition[ammoType] ?? 0) <= 0) return false;
    this.vehicleWeapon.pendingType = ammoType;
    this.vehicleWeapon.reloadTimer = weapon.reloadSeconds;
    return true;
  }

  updateVehicleSystems(delta) {
    if (!this.vehicleSpec) return;
    if (this.vehicleDamageState.destroyed) {
      if (this.vehicleWeapon) {
        this.vehicleWeapon.isFiring = false;
        this.vehicleWeapon.fireState = 'DESTROYED';
      }
      for (const mount of this.vehicleSpec.weaponMounts ?? []) {
        const state = this.vehicleMounts[mount.id];
        if (!state) continue;
        state.isFiring = false;
        state.fireState = 'DESTROYED';
      }
      this.syncLegacyVehicleDamage();
      this.refreshAmmoSummary();
      return;
    }
    if (this.vehicleWeapon) {
      this.vehicleWeapon.isFiring = false;
      this.vehicleWeapon.fireState = this.vehicleWeapon.reloadTimer > 0 ? 'RELOADING' : 'READY';
      this.vehicleWeapon.cooldown = Math.max(-delta, this.vehicleWeapon.cooldown - delta);
      this.vehicleWeapon.recoilTimer = Math.max(0, (this.vehicleWeapon.recoilTimer ?? 0) - delta);
      const barrel = this.mesh?.userData.barrel;
      if (barrel) {
        const restZ = barrel.userData.restZ ?? barrel.position.z;
        barrel.userData.restZ = restZ;
        const recoil = THREE.MathUtils.clamp(this.vehicleWeapon.recoilTimer / 0.18, 0, 1);
        barrel.position.z = restZ - Math.sin(recoil * Math.PI) * 0.16;
      }
      if (this.vehicleWeapon.reloadTimer > 0) {
        const ammunitionFactor = this.getVehicleAmmunitionHandlingFactor();
        if (ammunitionFactor <= 0) {
          this.vehicleWeapon.reloadTimer = 0;
          this.vehicleWeapon.fireState = 'AMMO_STOWAGE_DISABLED';
        } else if (this.hasOperationalLoader()) {
          const breechFactor = this.vehicleComponents.breech.status === 'DAMAGED' ? 0.55 : 1;
          this.vehicleWeapon.reloadTimer = Math.max(
            0,
            this.vehicleWeapon.reloadTimer - delta * breechFactor * ammunitionFactor
          );
          if (this.vehicleWeapon.reloadTimer === 0) {
            const type = this.vehicleWeapon.pendingType;
            const weapon = getWeapon(this.vehicleSpec.mainGun[type]);
            const rounds = Math.min(
              weapon?.magazineSize ?? 1,
              this.vehicleWeapon.ammunition[type] ?? 0
            );
            if (rounds > 0) {
              this.vehicleWeapon.ammunition[type] -= rounds;
              this.vehicleWeapon.loadedType = type;
              this.vehicleWeapon.feedAmmo = rounds;
              this.vehicleWeapon.fireState = 'READY';
            }
          }
        }
      }
      if (!this.vehicleWeapon.loadedType && this.vehicleWeapon.reloadTimer <= 0) {
        const reserveAmmo = Object.values(this.vehicleWeapon.ammunition)
          .reduce((total, rounds) => total + rounds, 0);
        this.vehicleWeapon.fireState = reserveAmmo > 0
          && this.getVehicleAmmunitionHandlingFactor() <= 0
          ? 'AMMO_STOWAGE_DISABLED'
          : 'EMPTY';
      }
    }

    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      const state = this.vehicleMounts[mount.id];
      const weapon = getWeapon(mount.weaponId);
      if (!state || !weapon) continue;
      state.isFiring = false;
      if (state.reloadTimer <= 0) {
        state.cooldown = Math.max(-delta, state.cooldown - delta);
      }
      if (state.reloadTimer > 0) {
        const ammunitionFactor = this.getVehicleAmmunitionHandlingFactor();
        if (ammunitionFactor <= 0) {
          state.reloadTimer = 0;
          state.fireState = 'AMMO_STOWAGE_DISABLED';
        } else if (this.isVehicleMountOperational(mount.id)
            && this.isCrewRoleAlive(mount.loaderRoles)) {
          state.reloadTimer = Math.max(0, state.reloadTimer - delta * ammunitionFactor);
        }
        if (state.reloadTimer === 0 && ammunitionFactor > 0) {
          const rounds = Math.min(mount.feedCapacity ?? weapon.magazineSize, state.reserveAmmo);
          state.reserveAmmo -= rounds;
          state.feedAmmo = rounds;
          state.cooldown = 0;
        }
      }
      state.fireState = state.reloadTimer > 0
        ? 'RELOADING'
        : (state.feedAmmo > 0
            ? 'READY'
            : (state.reserveAmmo > 0 && !this.vehicleComponents.ammunition?.operational
                ? 'AMMO_STOWAGE_DISABLED'
                : 'EMPTY'));
    }
    this.syncLegacyVehicleDamage();
    this.refreshAmmoSummary();
  }

  canVehicleFire() {
    return Boolean(
      this.vehicleWeapon?.loadedType
      && this.vehicleWeapon.cooldown <= 0
      && this.hasOperationalGunner()
      && !this.vehicleDamageState.burning
    );
  }

  updateVehicleCombat(delta, context) {
    if (!this.vehicleSpec || !this.isCombatEffective()) return false;
    const target = context.target;
    const targetPosition = target?.position ?? this.targetPos;
    if (!targetPosition) return false;

    const desiredWorldYaw = Math.atan2(
      targetPosition.x - this.position.x,
      targetPosition.z - this.position.z
    );
    const desiredTurretYaw = wrapAngle(desiredWorldYaw - this.rotation);
    const currentTurretYaw = this.vehicleWeapon?.turretYaw ?? 0;
    const yawError = wrapAngle(desiredTurretYaw - currentTurretYaw);
    if (this.vehicleWeapon && this.vehicleComponents.turret_traverse?.operational) {
      const traverseDamageFactor = this.vehicleComponents.turret_traverse.status === 'DAMAGED'
        ? 0.42
        : 1;
      const traverse = this.vehicleSpec.turretTraverseRadPerSecond * traverseDamageFactor * delta;
      this.vehicleWeapon.turretYaw = wrapAngle(
        currentTurretYaw + THREE.MathUtils.clamp(yawError, -traverse, traverse)
      );
      if (this.mesh?.userData.turret) {
        this.mesh.userData.turret.rotation.y = this.vehicleWeapon.turretYaw;
      }
    }

    let firedMain = false;
    if (this.vehicleSpec.mainGun && this.vehicleWeapon) {
      this.vehicleWeapon.targetUnitId = target?.id ?? null;
      this.vehicleWeapon.targetPos = targetPosition.toArray();
      this.vehicleWeapon.targetMode = this.targetMode;
      const preferredAmmoType = target?.vehicleSpec ? 'ap' : 'he';
      const desiredAmmoType = this.vehicleSpec.mainGun[preferredAmmoType]
        ? preferredAmmoType
        : (this.vehicleSpec.mainGun.ap ? 'ap' : 'he');
      if (!this.vehicleWeapon.loadedType) {
        this.beginVehicleReload(desiredAmmoType);
      } else if (this.canVehicleFire() && Math.abs(yawError) <= 0.06) {
        const weapon = getWeapon(this.vehicleSpec.mainGun[this.vehicleWeapon.loadedType]);
        const experienceDispersion = { Green: 1.45, Regular: 1.15, Veteran: 0.9, Crack: 0.76 };
        const opticsFactor = this.vehicleComponents.optics.status === 'DAMAGED' ? 1.7 : 1;
        const gunDamageFactor = this.vehicleComponents.main_gun.status === 'DAMAGED' ? 1.35 : 1;
        firedMain = context.combat.fireWeapon(this, target, targetPosition, {
          weapon,
          mountId: 'main',
          muzzlePosition: this.getVehicleMountMuzzleWorldPosition('main'),
          dispersionScale: (experienceDispersion[this.experience] ?? 1.15)
            * opticsFactor
            * gunDamageFactor
        });
        if (firedMain) {
          this.vehicleWeapon.feedAmmo = Math.max(0, this.vehicleWeapon.feedAmmo - 1);
          this.vehicleWeapon.cooldown += weapon.magazineSize > 1
            ? 60 / weapon.cyclicRPM
            : 60 / weapon.practicalRPM;
          if (this.vehicleComponents.breech.status === 'DAMAGED') {
            this.vehicleWeapon.cooldown *= 1.45;
          }
          this.vehicleWeapon.recoilTimer = 0.18;
          this.vehicleWeapon.roundsFired++;
          this.vehicleWeapon.isFiring = true;
          this.vehicleWeapon.fireState = 'FIRING';
          if (this.vehicleWeapon.feedAmmo <= 0) {
            this.vehicleWeapon.loadedType = null;
            this.beginVehicleReload(desiredAmmoType);
          }
        }
      }
    }

    const firedMachineGun = this.updateVehicleMachineGunCombat(context, {
      target,
      targetPosition,
      desiredWorldYaw,
      turretYawError: yawError,
      occupiedCrewRoles: firedMain ? this.vehicleSpec.gunnerRoles : []
    });
    return firedMain || firedMachineGun;
  }

  updateVehicleMachineGunCombat(context, aiming) {
    if (aiming.target?.vehicleSpec) return false;
    let firedAny = false;
    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      const state = this.vehicleMounts[mount.id];
      const weapon = getWeapon(mount.weaponId);
      if (!state || !weapon) continue;
      state.targetUnitId = aiming.target?.id ?? null;
      state.targetPos = aiming.targetPosition.toArray();
      state.targetMode = this.targetMode;
      if (aiming.occupiedCrewRoles?.some(role => mount.crewRoles.includes(role))) {
        state.fireState = 'CREW_BUSY';
        continue;
      }
      if (state.feedAmmo <= 0) {
        this.beginVehicleMountReload(mount.id);
        continue;
      }
      const alignmentError = mount.traverse === 'turret'
        ? aiming.turretYawError
        : wrapAngle(aiming.desiredWorldYaw - this.rotation);
      if (!this.isVehicleMountOperational(mount.id)
          || state.cooldown > VEHICLE_MOUNT_CADENCE_EPSILON
          || Math.abs(alignmentError) > (mount.traverse === 'turret' ? 0.08 : 0.12)) continue;

      const muzzlePosition = this.getVehicleMountMuzzleWorldPosition(mount.id);
      if (!muzzlePosition) {
        state.fireState = 'NO_MUZZLE';
        continue;
      }
      const opticsFactor = this.vehicleComponents.optics.status === 'DAMAGED' ? 1.45 : 1;
      const mountDamageFactor = this.vehicleComponents[mount.componentId].status === 'DAMAGED'
        ? 1.35
        : 1;
      const shotInterval = 60 / weapon.cyclicRPM
        * (this.vehicleComponents[mount.componentId].status === 'DAMAGED' ? 1.6 : 1);
      let emitted = 0;
      while (state.cooldown <= VEHICLE_MOUNT_CADENCE_EPSILON
          && state.feedAmmo > 0
          && emitted < MAX_VEHICLE_MOUNT_ROUNDS_PER_STEP) {
        const fired = context.combat.fireWeapon(this, aiming.target, aiming.targetPosition, {
          weapon,
          mountId: mount.id,
          muzzlePosition,
          dispersionScale: opticsFactor * mountDamageFactor
        });
        if (!fired) break;
        state.feedAmmo--;
        state.cooldown += shotInterval;
        state.roundsFired++;
        state.isFiring = true;
        state.fireState = 'FIRING';
        firedAny = true;
        emitted++;
      }
      if (emitted === MAX_VEHICLE_MOUNT_ROUNDS_PER_STEP
          && state.cooldown <= VEHICLE_MOUNT_CADENCE_EPSILON) {
        state.cooldown = shotInterval;
      }
      if (state.feedAmmo <= 0) this.beginVehicleMountReload(mount.id);
    }
    return firedAny;
  }

  applyArmorHit(result) {
    if (!result.penetrated) {
      if (result.weapon?.kind?.startsWith('cannon') && result.random() < 0.08) {
        setVehicleComponentHealth(
          this.vehicleComponents,
          'tracks',
          this.vehicleComponents.tracks.health - 38
        );
        recordVehicleEvent(this.vehicleDamageState, 'component_damage', {
          id: 'tracks',
          status: this.vehicleComponents.tracks.status,
          health: this.vehicleComponents.tracks.health,
          cause: 'non_penetrating_impact'
        });
        this.syncLegacyVehicleDamage();
      }
      return { penetrated: false, casualty: null };
    }

    const roles = this.vehicleSpec.zoneCrew[result.zone] ?? [];
    const candidates = this.getLivingCrew().filter(crewman => roles.includes(crewman.role));
    const crewman = candidates.length > 0
      ? candidates[Math.floor(result.random() * candidates.length)]
      : null;
    if (crewman) {
      const damage = (65 + result.random() * 75) * Math.min(1.5, result.residualRatio);
      crewman.health = Math.max(0, crewman.health - damage);
      crewman.status = crewman.health <= 0 ? 'KIA' : 'WOUNDED';
    }

    const hadSecondaryExplosion = this.vehicleDamageState.secondaryExplosion;
    const componentResults = applyPenetrationComponentDamage({
      components: this.vehicleComponents,
      damageState: this.vehicleDamageState,
      zone: result.zone,
      residualRatio: result.residualRatio,
      random: result.random
    });
    if (!hadSecondaryExplosion && this.vehicleDamageState.secondaryExplosion) {
      this.destroyVehicleAmmunitionStores();
    }
    if (this.getLivingCrew().length === 0) {
      this.vehicleDamageState.destroyed = true;
      setVehicleComponentHealth(this.vehicleComponents, 'hull', 0);
      recordVehicleEvent(this.vehicleDamageState, 'vehicle_destroyed', { cause: 'crew_loss' });
    }
    this.syncLegacyVehicleDamage();
    return {
      penetrated: true,
      casualty: crewman,
      damage: this.vehicleDamage,
      components: componentResults,
      burning: this.vehicleDamageState.burning,
      destroyed: this.vehicleDamageState.destroyed,
      secondaryExplosion: this.vehicleDamageState.secondaryExplosion,
      eventVersion: this.vehicleDamageState.eventVersion
    };
  }

  updateLOD(cameraPosition, qualityTier = 'high') {
    if (!this.mesh || !cameraPosition) return this.currentLOD;
    const distance = cameraPosition.distanceTo(this.position);
    const thresholds = qualityTier === 'low'
      ? { high: 18, medium: 45, core: 90 }
      : { high: 32, medium: 80, core: 150 };
    const level = distance < thresholds.high
      ? 'high'
      : (distance < thresholds.medium
          ? 'medium'
          : (distance < thresholds.core ? 'core' : 'low'));
    if (level === this.currentLOD) return level;
    this.currentLOD = level;
    this.mesh.traverse(object => {
      if (!object.isMesh) return;
      const band = object.userData.lodBand;
      if (!band || band === 'ui') return;
      if (band === 'proxy') object.visible = level === 'low';
      else if (level === 'low') object.visible = false;
      else if (level === 'core') object.visible = band === 'core';
      else if (level === 'medium') object.visible = band !== 'high';
      else object.visible = true;
    });
    return level;
  }

  setAgentDebug(enabled) {
    this.soldierAI?.setDebug(enabled);
  }

  captureState() {
    return {
      id: this.id,
      position: this.position.toArray(),
      rotation: this.rotation,
      morale: this.morale,
      suppression: this.suppression,
      fatigue: this.fatigue,
      stance: this.stance,
      isHiding: this.isHiding,
      isDeployed: this.isDeployed,
      currentWaypointIndex: this.currentWaypointIndex,
      waypoints: this.waypoints.map(waypoint => ({
        position: waypoint.position.toArray(),
        orderType: waypoint.orderType,
        pauseSeconds: waypoint.pauseSeconds,
        remainingPause: waypoint.remainingPause,
        reached: waypoint.reached
      })),
      targetUnitId: this.targetUnit?.id ?? null,
      targetPos: this.targetPos?.toArray() ?? null,
      targetMode: this.targetMode,
      ammo: { ...this.ammo },
      vehicleDamage: { ...this.vehicleDamage },
      vehicleComponents: Object.fromEntries(
        Object.entries(this.vehicleComponents).map(([id, component]) => [id, { ...component }])
      ),
      vehicleDamageState: {
        ...this.vehicleDamageState,
        events: this.vehicleDamageState.events.map(event => ({ ...event }))
      },
      structureState: this.structureState
        ? { ...this.structureState, events: this.structureState.events.map(event => ({ ...event })) }
        : null,
      vehicleWeapon: this.vehicleWeapon
        ? {
            ...this.vehicleWeapon,
            ammunition: { ...this.vehicleWeapon.ammunition },
            targetPos: this.vehicleWeapon.targetPos ? [...this.vehicleWeapon.targetPos] : null
          }
        : null,
      vehicleMounts: Object.fromEntries(
        Object.entries(this.vehicleMounts)
          .filter(([id]) => id !== 'main')
          .map(([id, mount]) => [id, captureVehicleMountState(mount)])
      ),
      currentLOD: this.currentLOD,
      roster: this.soldierAI
        ? this.soldierAI.captureRoster()
        : this.roster.map(soldier => ({ ...soldier }))
    };
  }

  restoreState(state, unitMap) {
    this.position.fromArray(state.position);
    this.rotation = state.rotation;
    this.morale = state.morale;
    this.suppression = state.suppression;
    this.fatigue = state.fatigue;
    this.stance = state.stance;
    this.isHiding = state.isHiding;
    this.isDeployed = state.isDeployed;
    this.currentWaypointIndex = state.currentWaypointIndex;
    this.waypoints = state.waypoints.map(waypoint => ({
      ...waypoint,
      position: new THREE.Vector3().fromArray(waypoint.position)
    }));
    this.targetUnit = state.targetUnitId ? unitMap.get(state.targetUnitId) ?? null : null;
    this.targetPos = state.targetPos ? new THREE.Vector3().fromArray(state.targetPos) : null;
    this.targetMode = state.targetMode;
    this.ammo = { ...state.ammo };
    this.vehicleDamage = { ...this.vehicleDamage, ...state.vehicleDamage };
    this.vehicleComponents = createVehicleComponents(this.vehicleSpec, state.vehicleComponents);
    this.vehicleDamageState = createVehicleDamageState(state.vehicleDamageState);
    this.structureState = createStructureState(this.structureSpec, state.structureState);
    if (!state.vehicleComponents) this.applyLegacyVehicleDamage(state.vehicleDamage);
    if (state.vehicleWeapon) this.vehicleWeapon = this.initVehicleWeapon(state.vehicleWeapon);
    this.vehicleMounts = this.initVehicleMounts(state.vehicleMounts);
    if (this.vehicleWeapon) this.vehicleMounts.main = this.vehicleWeapon;
    if (this.vehicleDamageState.secondaryExplosion) this.destroyVehicleAmmunitionStores();
    this.currentLOD = null;
    if (this.soldierAI) this.soldierAI.restoreRoster(state.roster);
    else this.roster = state.roster.map(soldier => ({ ...soldier }));
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.updateStanceVisuals();
    this.syncLegacyVehicleDamage();
    this.syncStructureVisuals();
    this.syncStructureCollision();
    this.refreshAmmoSummary();
  }

  updateStanceVisuals() {
    this.soldierAI?.applySquadStance();
  }

  update(delta, terrain, options = {}) {
    const { haltMovement = false } = options;
    if (this.suppression > 0) {
      this.suppression = Math.max(0, this.suppression - delta * 4.0);
      if (this.suppression < 15 && this.morale === 'Pinned') {
        this.morale = 'OK';
        this.stance = 'STANDING';
      }
    }
    this.updateVehicleSystems(delta);
    if (this.structureSpec) this.syncStructureCollision();

    let anchorMoving = false;
    let activeOrderType = 'QUICK';
    if (this.waypoints.length > 0 && this.currentWaypointIndex < this.waypoints.length) {
      const targetWp = this.waypoints[this.currentWaypointIndex];
      activeOrderType = targetWp.orderType;

      const movementFactor = this.getVehicleMovementFactor();
      if (!haltMovement && movementFactor > 0
        && this.morale !== 'Pinned' && this.morale !== 'Broken' && !this.isDeployed) {
        const vehicleSpeeds = this.vehicleSpec?.movementMps;
        let speed = vehicleSpeeds?.[targetWp.orderType] ?? 3.5;
        if (!vehicleSpeeds) {
          if (targetWp.orderType === 'FAST') speed = 5.5;
          else if (targetWp.orderType === 'HUNT') speed = 2.2;
          else if (targetWp.orderType === 'MOVE') speed = 2.5;
        }

        speed *= movementFactor;
        const routeTarget = this.collisionWorld?.getNavigationTarget(
          this.position,
          targetWp.position,
          this.collisionRadius,
          this.vehicleSpec ? 'vehicle' : 'infantry'
        ) ?? targetWp.position;
        const dir = new THREE.Vector3(
          routeTarget.x - this.position.x,
          0,
          routeTarget.z - this.position.z
        );
        dir.y = 0;
        const dist = dir.length();
        const waypointDistance = Math.hypot(
          targetWp.position.x - this.position.x,
          targetWp.position.z - this.position.z
        );

        if (waypointDistance < 0.8) {
          if (targetWp.remainingPause > 0) {
            targetWp.remainingPause = Math.max(0, targetWp.remainingPause - delta);
          } else {
            targetWp.reached = true;
            this.currentWaypointIndex++;
          }
        } else {
          dir.normalize();
          const intendedDistance = Math.min(dist, speed * Math.max(0, delta));
          const displacement = {
            x: dir.x * intendedDistance,
            z: dir.z * intendedDistance
          };
          const desiredRotation = Math.atan2(dir.x, dir.z);
          const resolved = this.vehicleSpec && this.collisionWorld
            ? this.collisionWorld.resolveFootprintMotion(this.position, displacement, {
                moverType: 'vehicle',
                radius: this.collisionRadius,
                offsets: this.collisionOffsets,
                rotation: desiredRotation
              })
            : {
                x: this.position.x + displacement.x,
                z: this.position.z + displacement.z,
                movedX: displacement.x,
                movedZ: displacement.z
              };
          this.position.x = resolved.x;
          this.position.z = resolved.z;
          anchorMoving = Math.hypot(resolved.movedX, resolved.movedZ) > 1e-5;
          if (anchorMoving) this.rotation = desiredRotation;

          const getMovementHeightAt = terrain.getMovementHeightAt?.bind(terrain)
            ?? terrain.getHeightAt.bind(terrain);
          this.position.y = getMovementHeightAt(this.position.x, this.position.z);

          this.mesh.position.copy(this.position);
          this.mesh.rotation.y = this.rotation;
        }
      }
    }

    this.soldierAI?.update(delta, terrain, { anchorMoving, orderType: activeOrderType });
    if (!this.soldierAI) this.updateStanceVisuals();
  }
}
