import * as THREE from 'three';
import { UnitFactory } from '../world/UnitFactory.js';
import { SoldierAI } from './SoldierAI.js';
import { getStructure } from './StructureCatalog.js';
import {
  applyStructureDamage,
  createStructureState,
  structureDamageReport
} from './StructureSystems.js';
import {
  applyExplosiveComponentDamage,
  applyPathComponentDamage,
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
import {
  advanceFireControlState,
  captureFireControlState,
  createFireControlState,
  createFireControlTargetKey,
  recordFireControlShot,
  resetFireControlState
} from '../simulation/combat/FireControl.js';
import {
  advanceVehicleCrewTaskStep,
  captureVehicleCrewTaskState,
  createVehicleCrewTaskState,
  effectiveVehicleCrewRole,
  hasEffectiveVehicleCrewRole,
  restoreVehicleCrewTaskState
} from '../simulation/vehicles/VehicleCrewTasks.js';

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const MAX_VEHICLE_MOUNT_ROUNDS_PER_STEP = 64;
const VEHICLE_MOUNT_CADENCE_EPSILON = 1e-9;
const VEHICLE_MAIN_GUN_CATCHUP_HZ = 60;
const MAX_VEHICLE_MAIN_GUN_CATCHUP_STEPS = 4096;

function cloneRoster(roster) {
  return roster.map(soldier => ({
    ...soldier,
    worldPosition: soldier.worldPosition ? [...soldier.worldPosition] : undefined,
    velocity: soldier.velocity ? [...soldier.velocity] : undefined,
    slotOffset: soldier.slotOffset ? [...soldier.slotOffset] : undefined,
    buildingLocation: soldier.buildingLocation
      ? JSON.parse(JSON.stringify(soldier.buildingLocation))
      : soldier.buildingLocation
  }));
}

export class Unit {
  constructor(config) {
    if (!config || typeof config !== 'object') {
      throw new TypeError('Unit requires a configuration record');
    }
    this.catalogPorts = config.catalogPorts;
    if (
      typeof this.catalogPorts?.weapons?.get !== 'function'
      || typeof this.catalogPorts?.weapons?.idFromName !== 'function'
      || typeof this.catalogPorts?.vehicles?.get !== 'function'
      || typeof this.catalogPorts?.vehicles?.defaultIdForFaction !== 'function'
    ) {
      throw new Error('Unit requires weapon and vehicle catalog ports');
    }
    this.weaponLookup = this.catalogPorts.weapons.get;
    this.visualFactories = config.visualFactories;
    if (!this.visualFactories || typeof this.visualFactories !== 'object') {
      throw new Error('Unit requires visual factories');
    }
    if (typeof config.id !== 'string' || config.id.length === 0) {
      throw new Error('Unit requires a stable id');
    }
    this.id = config.id;
    this.name = config.name || this.id;
    if (typeof config.faction !== 'string' || config.faction.length === 0) {
      throw new Error('Unit requires a faction');
    }
    if (typeof config.type !== 'string' || config.type.length === 0) {
      throw new Error('Unit requires a type');
    }
    this.faction = config.faction;
    this.type = config.type;
    this.visualPresentation = this.visualFactories.factionPresentation?.[this.faction];
    if (!this.visualPresentation) {
      throw new Error(`Unit requires visual presentation for faction ${this.faction}`);
    }
    this.vehicleId = config.vehicleId
      ?? (
        ['tank', 'vehicle'].includes(this.type)
          ? this.catalogPorts.vehicles.defaultIdForFaction(this.faction)
          : null
      );
    this.vehicleSpec = this.catalogPorts.vehicles.get(this.vehicleId);
    this.structureSpec = getStructure(config.structureId);
    if (config.structureId && !this.structureSpec) {
      throw new Error(`Unit ${this.id} references unknown structure ${config.structureId}`);
    }
    if (this.type === 'bunker' && !this.structureSpec) {
      throw new Error(`Unit ${this.id} bunker requires structureId`);
    }
    this.collisionWorld = null;
    const vehicleDimensions = this.vehicleSpec?.dimensionsMeters;
    this.collisionRadius = vehicleDimensions
      ? vehicleDimensions.width * 0.5 + 0.08
      : this.type === 'infantry_squad' ? 0.32 : 0;
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
    const resolvedRoster = Array.isArray(config.roster)
      ? cloneRoster(config.roster)
      : null;
    if (this.type === 'infantry_squad' && (!resolvedRoster || resolvedRoster.length === 0)) {
      throw new Error(`Infantry unit ${this.id} requires a resolved roster`);
    }
    this.squadSize = config.squadSize
      ?? resolvedRoster?.length
      ?? this.vehicleSpec?.crew.length
      ?? 0;
    this.roster = resolvedRoster ?? this.initRoster();
    this.vehicleCrewTasks = createVehicleCrewTaskState(
      this.vehicleSpec?.crewTaskPolicy,
      config.vehicleCrewTasks
    );
    this.vehicleMainGunnerCombatSeconds = null;

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
    return [];
  }

  initVehicleWeapon(state = null) {
    if (state) {
      const loadedWeapon = state.loadedType
        ? this.weaponLookup(this.vehicleSpec?.mainGun?.[state.loadedType])
        : null;
      return {
        ...state,
        ammunition: { ap: 0, he: 0, ...state.ammunition },
        feedAmmo: state.feedAmmo ?? (loadedWeapon ? 1 : 0),
        targetUnitId: state.targetUnitId ?? null,
        targetPos: state.targetPos ? [...state.targetPos] : null,
        targetMode: state.targetMode ?? null,
        isFiring: Boolean(state.isFiring),
        fireState: state.fireState ?? 'IDLE',
        fireControl: createFireControlState(state.fireControl)
      };
    }
    const initialType = this.vehicleSpec.mainGun.ap ? 'ap' : 'he';
    const weapon = this.weaponLookup(this.vehicleSpec.mainGun[initialType]);
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
      fireState: feedAmmo > 0 ? 'READY' : 'EMPTY',
      fireControl: createFireControlState()
    };
  }

  initVehicleMounts(saved = null) {
    if (!this.vehicleSpec) return {};
    return Object.fromEntries((this.vehicleSpec.weaponMounts ?? []).map(mount => [
      mount.id,
      createVehicleMountState(mount, saved?.[mount.id], this.weaponLookup)
    ]));
  }

  initMesh() {
    if (this.vehicleSpec) {
      this.mesh = UnitFactory.createTankMesh(
        this.vehicleSpec.modelId,
        this.visualFactories.vehicleMeshes,
        this.visualPresentation.selectionColor
      );
    } else if (this.structureSpec) {
      this.mesh = UnitFactory.createStructureMesh(
        this.structureSpec.id,
        this.visualFactories.structureMeshes
      );
    } else {
      this.mesh = UnitFactory.createInfantrySquadMesh(
        this.visualPresentation.infantryModelId,
        this.roster,
        this.visualFactories.infantryMeshes
      );
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.mesh.userData.unitId = this.id;
    this.mesh.userData.unitRoot = true;
  }

  replaceRoster(roster) {
    const previousMesh = this.mesh;
    this.roster = cloneRoster(roster);
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
        const weapon = this.weaponLookup(agent.weaponId);
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

  isOriginalCrewRoleAlive(roles) {
    return this.getLivingCrew().some(crewman => roles.includes(crewman.role));
  }

  getEffectiveCrewRole(crewman) {
    return effectiveVehicleCrewRole(crewman, this.vehicleCrewTasks);
  }

  isCrewRoleAlive(roles) {
    return this.vehicleCrewTasks
      ? hasEffectiveVehicleCrewRole(this.vehicleCrewTasks, this.roster, roles)
      : this.isOriginalCrewRoleAlive(roles);
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
      && this.isOriginalCrewRoleAlive(mount.crewRoles)
      && !this.vehicleDamageState.destroyed
      && !this.vehicleDamageState.burning
    );
  }

  beginVehicleMountReload(mountId) {
    const mount = this.getVehicleMountSpec(mountId);
    const state = this.vehicleMounts?.[mountId];
    const weapon = this.weaponLookup(mount?.weaponId);
    if (!mount || !state || !weapon || state.feedAmmo > 0 || state.reloadTimer > 0
        || state.reserveAmmo <= 0 || !this.isVehicleMountOperational(mountId)
        || !this.isOriginalCrewRoleAlive(mount.loaderRoles)
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
    const weapon = this.weaponLookup(weaponId);
    if (!weapon || !this.hasOperationalLoader()
        || this.getVehicleAmmunitionHandlingFactor() <= 0
        || (this.vehicleWeapon.ammunition[ammoType] ?? 0) <= 0) return false;
    this.vehicleWeapon.pendingType = ammoType;
    this.vehicleWeapon.reloadTimer = weapon.reloadSeconds;
    return true;
  }

  advanceVehicleMainWeaponSystem(delta) {
    if (!this.vehicleWeapon) return;
    this.vehicleWeapon.fireState = this.vehicleWeapon.reloadTimer > 0 ? 'RELOADING' : 'READY';
    this.vehicleWeapon.cooldown = Math.max(-delta, this.vehicleWeapon.cooldown - delta);
    this.vehicleWeapon.recoilTimer = Math.max(
      0,
      (this.vehicleWeapon.recoilTimer ?? 0) - delta
    );
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
          const weapon = this.weaponLookup(this.vehicleSpec.mainGun[type]);
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

  updateVehicleSystems(delta) {
    if (!this.vehicleSpec) return;
    const crewTaskStep = advanceVehicleCrewTaskStep(
      this.vehicleCrewTasks,
      this.vehicleSpec.crewTaskPolicy,
      this.roster,
      delta
    );
    this.vehicleCrewTasks = crewTaskStep.state;
    this.vehicleMainGunnerCombatSeconds = crewTaskStep.mainGunnerAvailableSeconds;
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
      this.advanceVehicleMainWeaponSystem(delta);
    }

    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      const state = this.vehicleMounts[mount.id];
      const weapon = this.weaponLookup(mount.weaponId);
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
            && this.isOriginalCrewRoleAlive(mount.loaderRoles)) {
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
    const mainGunnerDelta = Math.min(
      delta,
      Math.max(0, this.vehicleMainGunnerCombatSeconds ?? delta)
    );
    this.vehicleMainGunnerCombatSeconds = null;
    const targetPosition = context.target?.position ?? this.targetPos;
    const crossesCrewTaskCompletion = Boolean(
      targetPosition
      && mainGunnerDelta > VEHICLE_MOUNT_CADENCE_EPSILON
      && mainGunnerDelta < delta - VEHICLE_MOUNT_CADENCE_EPSILON
    );
    if (!crossesCrewTaskCompletion) {
      return this.updateVehicleCombatStep(delta, mainGunnerDelta, context);
    }

    const fixedStepSeconds = 1 / VEHICLE_MAIN_GUN_CATCHUP_HZ;
    let fullStepCount = Math.floor(mainGunnerDelta / fixedStepSeconds);
    let remainderSeconds =
      mainGunnerDelta - fullStepCount * fixedStepSeconds;
    if (fixedStepSeconds - remainderSeconds <= VEHICLE_MOUNT_CADENCE_EPSILON) {
      fullStepCount++;
      remainderSeconds = 0;
    } else if (remainderSeconds <= VEHICLE_MOUNT_CADENCE_EPSILON) {
      remainderSeconds = 0;
    }
    if (
      fullStepCount + (remainderSeconds > 0 ? 1 : 0)
      > MAX_VEHICLE_MAIN_GUN_CATCHUP_STEPS
    ) {
      fullStepCount = MAX_VEHICLE_MAIN_GUN_CATCHUP_STEPS - 1;
      remainderSeconds =
        mainGunnerDelta - fullStepCount * fixedStepSeconds;
    }
    const stepCount = fullStepCount + (remainderSeconds > 0 ? 1 : 0);
    let firedMain = false;
    for (let index = 0; index < stepCount; index++) {
      const stepSeconds = index < fullStepCount
        ? fixedStepSeconds
        : remainderSeconds;
      if (index > 0) {
        this.vehicleWeapon.isFiring = false;
        this.advanceVehicleMainWeaponSystem(stepSeconds);
      }
      firedMain = this.updateVehicleCombatStep(
        stepSeconds,
        stepSeconds,
        context,
        { includeMounts: false }
      ) || firedMain;
    }
    const firedMount = this.updateVehicleCombatStep(
      delta,
      0,
      context,
      { includeMain: false }
    );
    return firedMain || firedMount;
  }

  updateVehicleCombatStep(
    delta,
    mainGunnerDelta,
    context,
    { includeMain = true, includeMounts = true } = {}
  ) {
    if (!this.vehicleSpec || !this.isCombatEffective()) return false;
    const target = context.target;
    const targetPosition = target?.position ?? this.targetPos;
    if (!targetPosition) {
      if (this.vehicleWeapon) {
        this.vehicleWeapon.targetUnitId = null;
        this.vehicleWeapon.targetPos = null;
        resetFireControlState(this.vehicleWeapon.fireControl);
      }
      for (const mount of this.vehicleSpec.weaponMounts ?? []) {
        const state = this.vehicleMounts[mount.id];
        if (!state) continue;
        state.targetUnitId = null;
        state.targetPos = null;
        resetFireControlState(state.fireControl);
      }
      return false;
    }

    const desiredWorldYaw = Math.atan2(
      targetPosition.x - this.position.x,
      targetPosition.z - this.position.z
    );
    const desiredTurretYaw = wrapAngle(desiredWorldYaw - this.rotation);
    const currentTurretYaw = this.vehicleWeapon?.turretYaw ?? 0;
    const yawError = wrapAngle(desiredTurretYaw - currentTurretYaw);
    if (
      this.vehicleWeapon
      && this.vehicleComponents.turret_traverse?.operational
      && this.hasOperationalGunner()
      && mainGunnerDelta > 0
    ) {
      const traverseDamageFactor = this.vehicleComponents.turret_traverse.status === 'DAMAGED'
        ? 0.42
        : 1;
      const traverse = this.vehicleSpec.turretTraverseRadPerSecond
        * traverseDamageFactor
        * mainGunnerDelta;
      this.vehicleWeapon.turretYaw = wrapAngle(
        currentTurretYaw + THREE.MathUtils.clamp(yawError, -traverse, traverse)
      );
      if (this.mesh?.userData.turret) {
        this.mesh.userData.turret.rotation.y = this.vehicleWeapon.turretYaw;
      }
    }
    const remainingTurretYawError = wrapAngle(
      desiredTurretYaw - (this.vehicleWeapon?.turretYaw ?? currentTurretYaw)
    );
    const targetKey = createFireControlTargetKey({
      targetUnitId: target?.id ?? null,
      targetPosition
    });
    const trueRangeMeters = this.position.distanceTo(targetPosition);
    const targetMoving = Boolean(context.targetMoving);
    const shooterMoving = Boolean(context.shooterMoving);

    let firedMain = false;
    if (includeMain && this.vehicleSpec.mainGun && this.vehicleWeapon) {
      this.vehicleWeapon.targetUnitId = target?.id ?? null;
      this.vehicleWeapon.targetPos = targetPosition.toArray();
      this.vehicleWeapon.targetMode = this.targetMode;
      const preferredAmmoType = target?.vehicleSpec ? 'ap' : 'he';
      const desiredAmmoType = this.vehicleSpec.mainGun[preferredAmmoType]
        ? preferredAmmoType
        : (this.vehicleSpec.mainGun.ap ? 'ap' : 'he');
      const aimWeapon = this.weaponLookup(
        this.vehicleSpec.mainGun[this.vehicleWeapon.loadedType ?? desiredAmmoType]
      );
      const mainCanAim = Math.abs(remainingTurretYawError) <= 0.06
        && this.hasOperationalGunner()
        && mainGunnerDelta > 0
        && !this.vehicleDamageState.burning
        && !shooterMoving;
      const mainAim = advanceFireControlState(this.vehicleWeapon.fireControl, {
        deltaSeconds: mainGunnerDelta,
        shooterKey: `${this.id}:main`,
        targetKey,
        weapon: aimWeapon,
        trueRangeMeters,
        platform: 'vehicle-main',
        experience: this.experience,
        targetMoving,
        opticsStatus: this.vehicleComponents.optics?.status ?? 'OK',
        canAim: mainCanAim,
        blockedPhase: Math.abs(remainingTurretYawError) > 0.06
          ? 'SLEWING'
          : (shooterMoving ? 'MOVING' : 'DISABLED')
      });
      if (mainAim.becameReady) {
        this.vehicleWeapon.cooldown = Math.max(
          this.vehicleWeapon.cooldown,
          -mainAim.overshootSeconds
        );
      }
      if (!mainAim.ready && this.vehicleWeapon.loadedType
          && this.vehicleWeapon.reloadTimer <= 0) {
        this.vehicleWeapon.fireState = this.vehicleWeapon.fireControl.phase;
      }
      if (!this.vehicleWeapon.loadedType) {
        this.beginVehicleReload(desiredAmmoType);
      } else if (mainGunnerDelta > 0 && this.canVehicleFire() && mainAim.ready) {
        const weapon = this.weaponLookup(
          this.vehicleSpec.mainGun[this.vehicleWeapon.loadedType]
        );
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
            * mainAim.dispersionScale,
          estimatedRangeMeters: this.vehicleWeapon.fireControl.estimatedRangeMeters,
          fireControlModelVersion: this.vehicleWeapon.fireControl.modelVersion,
          aimRequiredSeconds: this.vehicleWeapon.fireControl.aimRequiredSeconds,
          rangeErrorMeters: this.vehicleWeapon.fireControl.rangeErrorMeters
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
          recordFireControlShot(this.vehicleWeapon.fireControl, weapon, {
            platform: 'vehicle-main',
            burstComplete: weapon.magazineSize <= 1
              || this.vehicleWeapon.feedAmmo <= 0
          });
          if (this.vehicleWeapon.feedAmmo <= 0) {
            this.vehicleWeapon.loadedType = null;
            this.beginVehicleReload(desiredAmmoType);
          }
        }
      }
    }

    const firedMachineGun = includeMounts
      ? this.updateVehicleMachineGunCombat(context, {
          target,
          targetPosition,
          desiredWorldYaw,
          turretYawError: remainingTurretYawError,
          targetKey,
          trueRangeMeters,
          targetMoving,
          shooterMoving,
          deltaSeconds: delta,
          occupiedCrewRoles: firedMain ? this.vehicleSpec.gunnerRoles : []
        })
      : false;
    return firedMain || firedMachineGun;
  }

  updateVehicleMachineGunCombat(context, aiming) {
    if (aiming.target?.vehicleSpec) return false;
    let firedAny = false;
    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      const state = this.vehicleMounts[mount.id];
      const weapon = this.weaponLookup(mount.weaponId);
      if (!state || !weapon) continue;
      state.targetUnitId = aiming.target?.id ?? null;
      state.targetPos = aiming.targetPosition.toArray();
      state.targetMode = this.targetMode;
      const crewBusy = aiming.occupiedCrewRoles?.some(role => mount.crewRoles.includes(role));
      if (state.feedAmmo <= 0) {
        this.beginVehicleMountReload(mount.id);
        continue;
      }
      const alignmentError = mount.traverse === 'turret'
        ? aiming.turretYawError
        : wrapAngle(aiming.desiredWorldYaw - this.rotation);
      const muzzlePosition = this.getVehicleMountMuzzleWorldPosition(mount.id);
      if (!muzzlePosition) {
        state.fireState = 'NO_MUZZLE';
        resetFireControlState(state.fireControl, 'NO_MUZZLE');
        continue;
      }
      const operational = this.isVehicleMountOperational(mount.id);
      const aligned = Math.abs(alignmentError) <= (mount.traverse === 'turret' ? 0.08 : 0.12);
      const mountAim = advanceFireControlState(state.fireControl, {
        deltaSeconds: aiming.deltaSeconds,
        shooterKey: `${this.id}:${mount.id}`,
        targetKey: aiming.targetKey,
        weapon,
        trueRangeMeters: aiming.trueRangeMeters,
        platform: 'vehicle-mount',
        experience: this.experience,
        targetMoving: aiming.targetMoving,
        opticsStatus: this.vehicleComponents.optics?.status ?? 'OK',
        canAim: operational && aligned && !crewBusy && !aiming.shooterMoving,
        blockedPhase: crewBusy
          ? 'CREW_BUSY'
          : (!operational ? 'DISABLED' : (aiming.shooterMoving ? 'MOVING' : 'SLEWING'))
      });
      if (mountAim.becameReady) {
        state.cooldown = Math.max(state.cooldown, -mountAim.overshootSeconds);
      }
      if (crewBusy) {
        state.fireState = 'CREW_BUSY';
        continue;
      }
      if (!mountAim.ready && state.reloadTimer <= 0) {
        state.fireState = state.fireControl.phase;
      }
      if (!operational
          || state.cooldown > VEHICLE_MOUNT_CADENCE_EPSILON
          || !aligned
          || !mountAim.ready) continue;

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
          dispersionScale: opticsFactor * mountDamageFactor * mountAim.dispersionScale,
          estimatedRangeMeters: state.fireControl.estimatedRangeMeters,
          fireControlModelVersion: state.fireControl.modelVersion,
          aimRequiredSeconds: state.fireControl.aimRequiredSeconds,
          rangeErrorMeters: state.fireControl.rangeErrorMeters
        });
        if (!fired) {
          state.cooldown = Math.max(0, state.cooldown);
          break;
        }
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
      if (emitted > 0) {
        recordFireControlShot(state.fireControl, weapon, {
          platform: 'vehicle-mount',
          burstComplete: false
        });
      }
      if (state.feedAmmo <= 0) this.beginVehicleMountReload(mount.id);
    }
    return firedAny;
  }

  applyVehicleExplosiveHit({
    explosiveEffect,
    penetrated,
    random
  }) {
    if (!explosiveEffect) {
      return { penetrated: Boolean(penetrated), casualty: null };
    }

    recordVehicleEvent(this.vehicleDamageState, 'explosive_detonation', {
      cause: explosiveEffect.cause,
      modelVersion: explosiveEffect.modelVersion,
      protectionResult: explosiveEffect.protectionResult,
      interiorExposed: explosiveEffect.interiorExposed,
      armorPart: explosiveEffect.externalIntent?.armorPart ?? null,
      detonationPoint: [...explosiveEffect.detonationPoint],
      dataQuality: explosiveEffect.dataQuality
    });

    const casualties = [];
    const affectedCrewIds = new Set();
    for (const intent of explosiveEffect.crewIntents ?? []) {
      const crewman = this.getLivingCrew().find(candidate =>
        intent.crewRoles.includes(candidate.role)
          && !affectedCrewIds.has(candidate.id));
      if (!crewman || !(intent.damageAmount > 0)) continue;
      affectedCrewIds.add(crewman.id);
      crewman.health = Math.max(0, crewman.health - intent.damageAmount);
      crewman.status = crewman.health <= 0 ? 'KIA' : 'WOUNDED';
      casualties.push(crewman);
      recordVehicleEvent(this.vehicleDamageState, 'crew_hit', {
        crewmanId: crewman.id,
        role: crewman.role,
        status: crewman.status,
        health: crewman.health,
        cause: explosiveEffect.cause,
        explosiveModelVersion: explosiveEffect.modelVersion,
        internalVolumeId: intent.volumeIds[0] ?? null,
        internalVolumeIds: intent.volumeIds.join(','),
        distanceMeters: intent.distanceMeters,
        falloff: intent.falloff,
        layoutVersion: intent.layoutVersion,
        dataQuality: intent.dataQuality,
        referenceUrl: intent.referenceUrl ?? null
      });
    }

    const hadSecondaryExplosion = this.vehicleDamageState.secondaryExplosion;
    const componentResults = applyExplosiveComponentDamage({
      components: this.vehicleComponents,
      damageState: this.vehicleDamageState,
      explosiveEffect,
      random
    });
    if (!hadSecondaryExplosion && this.vehicleDamageState.secondaryExplosion) {
      this.destroyVehicleAmmunitionStores();
    }
    if (this.getLivingCrew().length === 0) {
      this.vehicleDamageState.destroyed = true;
      setVehicleComponentHealth(this.vehicleComponents, 'hull', 0);
      recordVehicleEvent(this.vehicleDamageState, 'vehicle_destroyed', {
        cause: 'crew_loss'
      });
    }
    this.syncLegacyVehicleDamage();
    return {
      penetrated: Boolean(penetrated),
      casualty: casualties[0] ?? null,
      casualties,
      internalPathHits: [],
      explosiveEffect,
      damage: this.vehicleDamage,
      components: componentResults,
      burning: this.vehicleDamageState.burning,
      destroyed: this.vehicleDamageState.destroyed,
      secondaryExplosion: this.vehicleDamageState.secondaryExplosion,
      eventVersion: this.vehicleDamageState.eventVersion
    };
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

    const damageZone = result.damageZone ?? result.zone;
    const componentZone = result.componentZone ?? damageZone;
    const usesInternalPath = Array.isArray(result.internalPathHits);
    const casualties = [];
    if (usesInternalPath) {
      const affectedCrew = new Set();
      for (const hit of result.internalPathHits) {
        if (hit.kind !== 'crew') continue;
        const crewman = this.getLivingCrew().find(candidate =>
          hit.crewRoles.includes(candidate.role) && !affectedCrew.has(candidate));
        if (!crewman) continue;
        affectedCrew.add(crewman);
        const damage = Number.isFinite(hit.damageSeverity)
          ? hit.damageSeverity * 100
          : (65 + result.random() * 75)
            * Math.min(1.5, result.residualRatio);
        crewman.health = Math.max(0, crewman.health - damage);
        crewman.status = crewman.health <= 0 ? 'KIA' : 'WOUNDED';
        casualties.push(crewman);
        recordVehicleEvent(this.vehicleDamageState, 'crew_hit', {
          crewmanId: crewman.id,
          role: crewman.role,
          status: crewman.status,
          health: crewman.health,
          cause: 'model_local_penetration_path',
          internalVolumeId: hit.id,
          pathDistanceMeters: hit.entryDistanceMeters,
          entryEnergyJ: hit.entryEnergyJ ?? null,
          energyDepositedJ: hit.energyDepositedJ ?? null,
          exitEnergyJ: hit.exitEnergyJ ?? null,
          layoutVersion: hit.layoutVersion,
          dataQuality: hit.dataQuality
        });
      }
    } else {
      const roles = this.vehicleSpec.zoneCrew[result.zone]
        ?? this.vehicleSpec.zoneCrew[damageZone]
        ?? [];
      const candidates = this.getLivingCrew().filter(crewman => roles.includes(crewman.role));
      const crewman = candidates.length > 0
        ? candidates[Math.floor(result.random() * candidates.length)]
        : null;
      if (crewman) {
        const damage = (65 + result.random() * 75) * Math.min(1.5, result.residualRatio);
        crewman.health = Math.max(0, crewman.health - damage);
        crewman.status = crewman.health <= 0 ? 'KIA' : 'WOUNDED';
        casualties.push(crewman);
      }
    }

    const hadSecondaryExplosion = this.vehicleDamageState.secondaryExplosion;
    const componentResults = usesInternalPath
      ? applyPathComponentDamage({
          components: this.vehicleComponents,
          damageState: this.vehicleDamageState,
          pathHits: result.internalPathHits,
          residualRatio: result.residualRatio,
          random: result.random
        })
      : applyPenetrationComponentDamage({
          components: this.vehicleComponents,
          damageState: this.vehicleDamageState,
          zone: componentZone,
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
      casualty: casualties[0] ?? null,
      casualties,
      internalPathHits: usesInternalPath
        ? result.internalPathHits.map(hit => ({
            ...hit,
            crewRoles: [...hit.crewRoles],
            entryPoint: [...hit.entryPoint],
            exitPoint: [...hit.exitPoint]
          }))
        : null,
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
      vehicleDamageState: createVehicleDamageState(this.vehicleDamageState),
      vehicleCrewTasks: captureVehicleCrewTaskState(this.vehicleCrewTasks),
      vehicleMainGunnerCombatSeconds: this.vehicleMainGunnerCombatSeconds,
      structureState: this.structureState
        ? { ...this.structureState, events: this.structureState.events.map(event => ({ ...event })) }
        : null,
      vehicleWeapon: this.vehicleWeapon
        ? {
            ...this.vehicleWeapon,
            ammunition: { ...this.vehicleWeapon.ammunition },
            targetPos: this.vehicleWeapon.targetPos ? [...this.vehicleWeapon.targetPos] : null,
            fireControl: captureFireControlState(this.vehicleWeapon.fireControl)
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
    this.vehicleCrewTasks = restoreVehicleCrewTaskState(
      this.vehicleSpec?.crewTaskPolicy,
      state.vehicleCrewTasks
    );
    this.vehicleMainGunnerCombatSeconds = Number.isFinite(
      state.vehicleMainGunnerCombatSeconds
    )
      ? Math.max(0, state.vehicleMainGunnerCombatSeconds)
      : null;
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

  areLivingInfantryAtFormation(orderType, tolerance = 0.75) {
    if (!this.soldierAI) return true;
    const cosine = Math.cos(this.rotation);
    const sine = Math.sin(this.rotation);
    const toleranceSquared = tolerance * tolerance;
    for (const agent of this.soldierAI.getLivingAgents()) {
      if (agent.buildingLocation
          && !['outside', 'approaching'].includes(agent.buildingLocation.phase)) continue;
      const offset = this.soldierAI.getFormationOffset(agent.index, orderType);
      const goalX = this.position.x + cosine * offset.x + sine * offset.z;
      const goalZ = this.position.z - sine * offset.x + cosine * offset.z;
      const dx = agent.position.x - goalX;
      const dz = agent.position.z - goalZ;
      if (dx * dx + dz * dz > toleranceSquared) return false;
    }
    return true;
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
    let infantryAwaitingArrival = null;
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
          this.vehicleSpec ? 'vehicle' : 'infantry',
          this.vehicleSpec
            ? this.collisionRadius + Math.max(
                0,
                ...this.collisionOffsets.map(offset => Math.abs(offset.z))
              )
            : this.collisionRadius
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
          if (this.soldierAI) {
            // Keep the command active while individual soldiers finish their
            // own collision-safe routes into the formation.
            anchorMoving = true;
            infantryAwaitingArrival = targetWp;
          } else if (targetWp.remainingPause > 0) {
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
          const resolved = this.collisionWorld
            ? this.vehicleSpec
              ? this.collisionWorld.resolveFootprintMotion(this.position, displacement, {
                moverType: 'vehicle',
                radius: this.collisionRadius,
                offsets: this.collisionOffsets,
                rotation: desiredRotation
              })
              : this.collisionWorld.resolveCircleMotion(
                this.position,
                displacement,
                this.collisionRadius,
                { moverType: 'infantry' }
              )
            : {
                x: this.position.x + displacement.x,
                z: this.position.z + displacement.z,
                movedX: displacement.x,
                movedZ: displacement.z
              };
          this.position.x = resolved.x;
          this.position.z = resolved.z;
          const anchorDisplaced = Math.hypot(resolved.movedX, resolved.movedZ) > 1e-5;
          // A blocked infantry anchor still represents an active order.
          // Soldiers must continue resolving their individual routes instead
          // of freezing because the invisible squad center touched a wall.
          anchorMoving = this.soldierAI ? true : anchorDisplaced;
          if (anchorDisplaced) this.rotation = desiredRotation;

          this.position.y = terrain.getMovementHeightAt
            ? terrain.getMovementHeightAt(this.position.x, this.position.z)
            : terrain.getHeightAt(this.position.x, this.position.z);

          this.mesh.position.copy(this.position);
          this.mesh.rotation.y = this.rotation;
        }
      }
    }

    this.soldierAI?.update(delta, terrain, { anchorMoving, orderType: activeOrderType });
    if (infantryAwaitingArrival
        && this.areLivingInfantryAtFormation(activeOrderType)) {
      if (infantryAwaitingArrival.remainingPause > 0) {
        infantryAwaitingArrival.remainingPause = Math.max(
          0,
          infantryAwaitingArrival.remainingPause - delta
        );
      } else {
        infantryAwaitingArrival.reached = true;
        this.currentWaypointIndex++;
      }
    }
    if (!this.soldierAI) this.updateStanceVisuals();
  }
}
