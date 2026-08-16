import * as THREE from 'three';
import { UnitFactory } from '../world/UnitFactory.js';
import { SoldierAI } from './SoldierAI.js';
import {
  applyStructureDamage,
  createStructureState,
  structureDamageReport
} from './StructureSystems.js';
import {
  advanceVehicleFireState,
  applyExplosiveComponentDamage,
  applyPathComponentDamage,
  applyPenetrationComponentDamage,
  captureVehicleMountState,
  createVehicleComponents,
  createVehicleDamageState,
  createVehicleMountState,
  destroyVehicleComponentsFromCookoff,
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
import { VehicleAI } from './VehicleAI.js';
import {
  advanceVehicleCrewTaskStep,
  captureVehicleCrewTaskState,
  createVehicleCrewTaskState,
  effectiveVehicleCrewRole,
  hasEffectiveVehicleCrewRole,
  restoreVehicleCrewTaskState
} from '../simulation/vehicles/VehicleCrewTasks.js';
import {
  INFANTRY_COLLISION_RADIUS
} from '../simulation/infantry/InfantrySeparationSystem.js';
import {
  InfantryBuddyBounds
} from '../simulation/infantry/InfantryBuddyBounds.js';
import {
  advanceInfantryUnitSuppression,
  classifyInfantryUnitMorale
} from '../simulation/infantry/InfantrySuppression.js';
import {
  canInfantryVaultFence,
  getInfantryMovementOrderProfile
} from '../simulation/infantry/InfantryMovementOrders.js';
import {
  estimateVehicleCrushMassTonnes
} from '../simulation/terrain/DestructibleLinearObstacleSystem.js';
import {
  getVehicleMountCadenceRPM,
  selectVehicleTargetWeapons
} from '../simulation/combat/VehicleWeaponSelection.js';
import {
  captureVehicleEngagementLearningState,
  createVehicleEngagementLearningState,
  recordAdaptiveVehicleRetarget as recordResolvedAdaptiveVehicleRetarget,
  recordVehicleEngagementImpact as recordResolvedVehicleEngagementImpact,
  selectAdaptiveVehicleAmmoType,
  selectVehicleEngagementAim,
  setVehicleEngagementTarget
} from '../simulation/combat/VehicleEngagementLearning.js';
import {
  captureVehicleAimIntent,
  resolveVehicleLocalAimPoint,
  selectVehicleTargetSoldier
} from '../simulation/combat/VehicleTargeting.js';
import { getVehicleArmorAimPoints } from '../simulation/vehicles/VehicleArmorCollision.js';
import {
  advanceVehiclePhysicsState,
  captureVehiclePhysicsState,
  createVehiclePhysicsState,
  VEHICLE_PHYSICS_DATA_QUALITY,
  VEHICLE_PHYSICS_MODEL
} from '../simulation/vehicles/VehiclePhysics.js';
import {
  captureVehicleKinematicsState,
  createVehicleKinematicsState,
  planVehicleKinematicStep,
  recordResolvedVehicleTravel
} from '../simulation/vehicles/VehicleKinematics.js';
import { planVehicleReverseStep } from '../simulation/vehicles/VehicleReverseManeuver.js';
import {
  getUnbuttonedCommander,
  getUnbuttonedCommanderWorldPosition
} from '../simulation/vehicles/VehicleCrewExposure.js';
import {
  captureInfantryTransportAssignment,
  captureVehicleTransportState,
  createVehicleTransportState,
  destroyTransportCargo,
  restoreInfantryTransportAssignment
} from '../simulation/vehicles/VehicleTransport.js';
import {
  advanceMortarTeamState,
  canFireMortar,
  captureMortarTeamState,
  consumeMortarRound,
  createMortarTeamState,
  requestMortarDeployment,
  restoreMortarTeamState,
  solveHighAngleTrajectory
} from '../simulation/indirect/MortarTeam.js';
import {
  advanceMortarFireMission as advanceMortarFireMissionState,
  cancelMortarFireMission as cancelMortarFireMissionState,
  captureMortarFireMissionState,
  createMortarFireMissionState,
  DEFAULT_MORTAR_FIRE_MISSION_CONFIG,
  getPendingMortarFireMissionShot,
  recordMortarFireMissionShot,
  recordMortarObservedImpact,
  requestMortarFireMission as requestMortarFireMissionState,
  restoreMortarFireMissionState
} from '../simulation/indirect/MortarFireMission.js';
import {
  advanceMortarTargetOrder,
  captureMortarTargetOrder,
  createMortarTargetOrder,
  recordMortarTargetOrderShot,
  restoreMortarTargetOrder,
  sampleMortarTargetPoint
} from '../simulation/indirect/MortarTargetOrder.js';

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const MAX_VEHICLE_MOUNT_ROUNDS_PER_STEP = 64;
const VEHICLE_MOUNT_CADENCE_EPSILON = 1e-9;
const VEHICLE_MAIN_GUN_CATCHUP_HZ = 60;
const MAX_VEHICLE_MAIN_GUN_CATCHUP_STEPS = 4096;
// First-order gameplay approximation: retain authoritative shot activity long
// enough to bridge a shot emitted after spotting to the next 10 Hz sample.
// Simulation time owns the decay.
const RECENT_FIRE_ACTIVITY_SECONDS = 0.2;
const COMMANDER_PRESENTATION_LOCAL = new THREE.Vector3();
const COMMANDER_PRESENTATION_OFFSET = new THREE.Vector3();
const COMMANDER_PRESENTATION_UP = new THREE.Vector3(0, 1, 0);
const UNAVAILABLE_INFANTRY_STATUSES = new Set([
  'KIA',
  'INCAPACITATED',
  'DEAD'
]);

function cloneRoster(roster) {
  return roster.map(soldier => ({
    ...soldier,
    worldPosition: soldier.worldPosition ? [...soldier.worldPosition] : undefined,
    velocity: soldier.velocity ? [...soldier.velocity] : undefined,
    slotOffset: soldier.slotOffset ? [...soldier.slotOffset] : undefined,
    equipment: soldier.equipment ? [...soldier.equipment] : undefined,
    buildingLocation: soldier.buildingLocation
      ? JSON.parse(JSON.stringify(soldier.buildingLocation))
      : soldier.buildingLocation,
    vehicleLocation: soldier.vehicleLocation
      ? { ...soldier.vehicleLocation }
      : soldier.vehicleLocation
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
      || typeof this.catalogPorts?.structures?.get !== 'function'
    ) {
      throw new Error('Unit requires weapon, vehicle, and structure catalog ports');
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
    const structureRecords = this.catalogPorts.structures.records;
    const structureId = config.structureId;
    const resolvedStructure = structureId
      ? this.catalogPorts.structures.get(structureId)
      : null;
    if (
      structureId
      && (
        !structureRecords
        || !Object.hasOwn(structureRecords, structureId)
        || resolvedStructure !== structureRecords[structureId]
      )
    ) {
      throw new Error(`Unit ${this.id} requires canonical structure ${structureId}`);
    }
    this.structureSpec = resolvedStructure;
    if (structureId && !this.structureSpec) {
      throw new Error(`Unit ${this.id} references unknown structure ${config.structureId}`);
    }
    if (this.type === 'bunker' && !this.structureSpec) {
      throw new Error(`Unit ${this.id} bunker requires structureId`);
    }
    this.collisionWorld = null;
    const vehicleDimensions = this.vehicleSpec?.dimensionsMeters;
    this.collisionRadius = vehicleDimensions
      ? vehicleDimensions.width * 0.5 + 0.08
      : this.type === 'infantry_squad' ? INFANTRY_COLLISION_RADIUS : 0;
    this.collisionOffsets = vehicleDimensions
      ? createCapsuleOffsets(vehicleDimensions.length, this.collisionRadius)
      : [];

    // Position & Transform
    this.position = new THREE.Vector3().copy(config.position || new THREE.Vector3());
    this.rotation = config.rotation || 0;

    // Soft Factors
    this.experience = config.experience || 'Regular';
    this.morale = 'OK'; // 'OK', 'Pinned', 'Shaken', 'Panic', 'Broken'
    this.recentFireActivitySeconds = 0;
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
    this.mortarTeamConfig = config.crewServedWeapon?.type === 'mortar'
      ? {
          ...config.crewServedWeapon,
          ammunitionBySoldierId: {
            ...config.crewServedWeapon.ammunitionBySoldierId
          }
        }
      : null;
    if (config.crewServedWeapon && !this.mortarTeamConfig) {
      throw new Error(
        `Unit ${this.id} references unsupported crew-served weapon `
        + `${config.crewServedWeapon.type ?? 'missing'}`
      );
    }
    if (
      this.mortarTeamConfig
      && !this.weaponLookup(this.mortarTeamConfig.weaponId)
    ) {
      throw new Error(
        `Unit ${this.id} references unknown mortar weapon `
        + this.mortarTeamConfig.weaponId
      );
    }
    this.mortarTeamState = this.mortarTeamConfig
      ? createMortarTeamState(this.mortarTeamConfig)
      : null;
    this.mortarFireMissionConfig = this.mortarTeamConfig
      ? DEFAULT_MORTAR_FIRE_MISSION_CONFIG
      : null;
    this.mortarFireMissionState = this.mortarTeamConfig
      ? createMortarFireMissionState(this.mortarFireMissionConfig)
      : null;
    this.mortarTargetOrder = null;
    this.mortarOperatorIds = new Set(
      this.mortarTeamConfig
        ? [
            String(this.mortarTeamConfig.gunnerSoldierId),
            String(this.mortarTeamConfig.assistantSoldierId)
          ]
        : []
    );
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
    this.holdFire = Boolean(config.holdFire);
    this.isDeployed = false;
    this.stance = 'STANDING';
    this.vehicleCrewPosture = this.vehicleSpec
      ? (config.vehicleCrewPosture === 'UNBUTTONED'
          ? 'UNBUTTONED'
          : 'BUTTONED')
      : null;

    // Combat Target
    this.targetUnit = null;
    this.targetPos = null;
    this.targetAimIntent = null;
    this.targetMode = null;
    this.vehicleEngagementLearning = this.vehicleSpec
      ? createVehicleEngagementLearningState(config.vehicleEngagementLearning)
      : null;

    // Vehicle Damage
    this.vehicleDamage = {
      hull: 'OK', turret: 'OK', gun: 'OK', engine: 'OK', tracks: 'OK'
    };
    this.vehicleComponents = createVehicleComponents(this.vehicleSpec, config.vehicleComponents);
    this.vehicleDamageState = createVehicleDamageState(config.vehicleDamageState);
    this.vehiclePhysics = this.vehicleSpec
      ? createVehiclePhysicsState(config.vehiclePhysics)
      : null;
    this.vehicleKinematics = this.vehicleSpec
      ? createVehicleKinematicsState(config.vehicleKinematics)
      : null;
    if (!config.vehicleComponents && config.vehicleDamage) {
      this.applyLegacyVehicleDamage(config.vehicleDamage);
    }
    this.vehicleWeapon = this.vehicleSpec?.mainGun ? this.initVehicleWeapon(config.vehicleWeapon) : null;
    this.vehicleMounts = this.initVehicleMounts(config.vehicleMounts);
    if (this.vehicleWeapon) this.vehicleMounts.main = this.vehicleWeapon;
    this.vehicleTransportState = createVehicleTransportState(
      this.vehicleSpec?.transport,
      config.vehicleTransportState
    );
    this.transportAssignment = restoreInfantryTransportAssignment(
      config.transportAssignment
    );
    if (this.vehicleDamageState.secondaryExplosion) this.applyVehicleCookoffConsequences();
    this.syncLegacyVehicleDamage();
    this.structureState = createStructureState(this.structureSpec, config.structureState);
    this.currentLOD = null;

    // 3D Mesh
    this.mesh = null;
    this.initMesh();
    this.infantryBuddyBounds = this.type === 'infantry_squad'
      ? new InfantryBuddyBounds()
      : null;
    this.soldierAI = this.type === 'infantry_squad' ? new SoldierAI(this) : null;
    this.vehicleAI = (this.vehicleSpec || this.type === 'tank' || this.type === 'vehicle')
      ? new VehicleAI(this, config.vehicleAI)
      : null;
    this.initializeMortarPosePresentation();
    this.refreshAmmoSummary();
    this.syncMortarVisuals();
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
        targetSoldierId: state.targetSoldierId ?? null,
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
      targetSoldierId: null,
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

    this.syncTransformPresentation();
    if (this.vehicleSpec) {
      const commanderPresentation =
        this.vehicleSpec.observationEquipment?.unbuttonedCommander;
      const commanderFactory =
        this.visualFactories.vehicleCrewFigures?.[this.faction];
      if (commanderPresentation && typeof commanderFactory === 'function') {
        const figure = commanderFactory({
          vehicleId: this.vehicleId,
          commanderRole: commanderPresentation.role,
          headgearId: commanderPresentation.headgearId ?? null
        });
        if (figure?.isObject3D) {
          figure.visible = false;
          this.mesh.add(figure);
          this.mesh.userData.commanderFigure = figure;
        }
      }
      if (this.vehicleSpec.transport && typeof commanderFactory === 'function') {
        const figures = {};
        for (const [index, crewman] of this.roster.entries()) {
          const figure = commanderFactory({
            vehicleId: this.vehicleId,
            commanderRole: crewman.role,
            fullBody: true
          });
          if (!figure?.isObject3D) continue;
          figure.name = `DismountedCrew_${crewman.id}`;
          figure.visible = false;
          figure.position.set(index % 2 === 0 ? 0.55 : -0.55, 1.08, -3.1);
          this.mesh.add(figure);
          figures[String(crewman.id)] = figure;
        }
        this.mesh.userData.transportCrewFigures = figures;
      }
      this.syncVehicleCommanderPresentation();
      this.syncTransportCrewPresentation();
    }
    this.mesh.userData.unitId = this.id;
    this.mesh.userData.unitRoot = true;
  }

  syncTransformPresentation() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    if (this.vehiclePhysics) {
      this.mesh.rotation.order = 'YXZ';
      this.mesh.rotation.set(
        this.vehiclePhysics.hull.pitch,
        this.rotation,
        this.vehiclePhysics.hull.roll
      );
      return;
    }
    this.mesh.rotation.set(0, this.rotation, 0);
  }

  syncVehicleTrackPresentation() {
    if (!this.vehicleKinematics) return;
    this.mesh?.userData?.setTrackMotion?.(this.vehicleKinematics);
  }

  syncVehicleWeaponPresentation() {
    const turret = this.mesh?.userData?.turret;
    if (turret && this.vehicleWeapon) {
      turret.rotation.y = this.vehicleWeapon.turretYaw ?? 0;
    }
  }

  updateVehiclePhysics(delta, terrain) {
    if (!this.vehicleSpec || !this.vehiclePhysics) return null;
    const result = advanceVehiclePhysicsState({
      state: this.vehiclePhysics,
      deltaSeconds: delta,
      position: this.position,
      yaw: this.rotation,
      dimensions: this.vehicleSpec.dimensionsMeters,
      terrain,
      damageState: this.vehicleDamageState,
      hasDetachableTurret: Boolean(
        this.vehicleSpec.mainGun
        && this.vehicleSpec.turretTraverseRadPerSecond > 0
      ),
      turretYaw: this.vehicleWeapon?.turretYaw ?? 0
    });
    if (this.vehiclePhysics.hull.initialized) {
      this.position.y = this.vehiclePhysics.hull.rideHeight;
    }
    if (result.separatedNow) {
      recordVehicleEvent(this.vehicleDamageState, 'turret_separated', {
        cause: 'secondary_explosion',
        physicsModelVersion: VEHICLE_PHYSICS_MODEL,
        dataQuality: VEHICLE_PHYSICS_DATA_QUALITY
      });
    }
    this.syncTransformPresentation();
    return result;
  }

  replaceRoster(roster) {
    const previousMesh = this.mesh;
    this.roster = cloneRoster(roster);
    this.squadSize = this.roster.length;
    this.initMesh();
    this.infantryBuddyBounds?.reset();
    this.soldierAI = new SoldierAI(this);
    this.initializeMortarPosePresentation();
    this.refreshAmmoSummary();
    this.syncMortarVisuals(0, true);
    return previousMesh;
  }

  addWaypoint(posVec3, orderType = 'QUICK', pauseSec = 0) {
    if (this.currentWaypointIndex >= this.waypoints.length && this.waypoints.length > 0) {
      this.infantryBuddyBounds?.reset();
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
    this.infantryBuddyBounds?.reset();
    this.waypoints = [];
    this.currentWaypointIndex = 0;
  }

  pruneCompletedWaypoints() {
    if (this.currentWaypointIndex <= 0) return;
    this.infantryBuddyBounds?.reset();
    this.waypoints = this.waypoints.slice(this.currentWaypointIndex);
    this.currentWaypointIndex = 0;
  }

  applySuppression(amount) {
    // Gameplay approximation: an enclosed armored fighting compartment
    // attenuates shock and near-miss suppression before it reaches the crew.
    // This changes crew morale pressure only; penetrations and component
    // damage remain owned by armor and terminal-effects resolution.
    const suppressionAmount = this.vehicleSpec?.explosiveProtection?.class
      === 'armored_enclosed'
      ? amount * 0.65
      : amount;
    this.suppression = Math.min(100, this.suppression + suppressionAmount);
    if (this.type === 'infantry_squad') {
      this.morale = classifyInfantryUnitMorale(
        this.suppression,
        this.morale
      );
      if (this.morale === 'Pinned' || this.morale === 'Broken') {
        this.stance = 'PRONE';
      } else if (this.morale === 'Shaken') {
        this.stance = 'KNEELING';
      }
      return;
    }
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
    if (this.type === 'infantry_squad') {
      return !this.isTransported()
        && this.getLivingSoldiers().length > 0;
    }
    if (this.structureSpec) return !this.structureState.destroyed && !this.structureState.firingDisabled;
    if (this.vehicleSpec) {
      return this.roster.some(crewman => crewman.health > 0 && crewman.status !== 'KIA')
        && !this.vehicleDamageState.destroyed;
    }
    return true;
  }

  isDestroyed() {
    if (this.type === 'infantry_squad') {
      return (this.soldierAI?.getLivingAgents?.().length ?? 0) === 0;
    }
    if (this.structureSpec) return Boolean(this.structureState?.destroyed);
    if (this.vehicleSpec) return Boolean(this.vehicleDamageState?.destroyed);
    return false;
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

  recordAuthoritativeShot() {
    this.recentFireActivitySeconds = Math.max(
      this.recentFireActivitySeconds,
      RECENT_FIRE_ACTIVITY_SECONDS
    );
  }

  updateIndividualCombat(delta, context) {
    this.soldierAI?.updateCombat(delta, {
      ...context,
      holdFireSoldierIds:
        this.mortarTeamState?.deploymentState !== 'PACKED'
          ? this.mortarOperatorIds
          : null
    });
    this.refreshAmmoSummary();
  }

  toggleHoldFire() {
    this.holdFire = !this.holdFire;
    return this.holdFire;
  }

  isTransportVehicle() {
    return Boolean(this.vehicleSpec?.transport && this.vehicleTransportState);
  }

  isTransported() {
    return ['EMBARKED', 'DISEMBARKING'].includes(
      this.transportAssignment?.phase
    );
  }

  getTransportPassengerCount(unitMap = null) {
    if (!this.vehicleTransportState) return 0;
    if (!unitMap) {
      return Object.values(
        this.vehicleTransportState.passengerCountsByUnitId ?? {}
      ).reduce((sum, count) => sum + count, 0);
    }
    return this.vehicleTransportState.passengerUnitIds.reduce(
      (sum, unitId) => sum + (
        unitMap.get(unitId)?.soldierAI?.getLivingAgents().length ?? 0
      ),
      0
    );
  }

  setTransportPresentation(hidden) {
    if (!this.soldierAI || !this.mesh) return;
    this.mesh.userData.transportHidden = Boolean(hidden);
    for (const soldierMesh of this.mesh.userData.soldiers ?? []) {
      soldierMesh.visible = !hidden;
    }
    for (const batch of this.mesh.userData.infantryProxyInstances?.batches ?? []) {
      batch.visible = false;
    }
    this.currentLOD = null;
  }

  hasDeployableCrewServedWeapon() {
    return Boolean(this.mortarTeamConfig && this.mortarTeamState);
  }

  requestMortarFireMission(request, operationalContext) {
    if (!this.mortarFireMissionState) {
      return {
        accepted: false,
        reason: 'NO_MORTAR',
        missionId: request?.missionId ?? null
      };
    }
    return requestMortarFireMissionState(
      this.mortarFireMissionState,
      this.mortarFireMissionConfig,
      request,
      operationalContext
    );
  }

  advanceMortarFireMission(deltaSeconds, operationalContext) {
    if (!this.mortarFireMissionState) return null;
    return advanceMortarFireMissionState(
      this.mortarFireMissionState,
      this.mortarFireMissionConfig,
      deltaSeconds,
      operationalContext
    );
  }

  getPendingMortarFireMissionShot() {
    return getPendingMortarFireMissionShot(
      this.mortarFireMissionState
    );
  }

  recordMortarObservedImpact(report, operationalContext) {
    if (!this.mortarFireMissionState) {
      return { accepted: false, reason: 'NO_MORTAR' };
    }
    return recordMortarObservedImpact(
      this.mortarFireMissionState,
      this.mortarFireMissionConfig,
      report,
      operationalContext
    );
  }

  cancelMortarFireMission(reason = 'USER_CANCELLED') {
    if (!this.mortarFireMissionState) {
      return {
        cancelled: false,
        reason: 'NO_MORTAR',
        phase: 'IDLE'
      };
    }
    return cancelMortarFireMissionState(
      this.mortarFireMissionState,
      this.mortarFireMissionConfig,
      reason
    );
  }

  toggleCrewServedDeployment() {
    if (!this.hasDeployableCrewServedWeapon()) return null;
    const deploymentState = requestMortarDeployment(
      this.mortarTeamState,
      this.mortarTeamConfig
    );
    this.syncMortarDeploymentCompatibility();
    this.syncMortarVisuals();
    this.updateStanceVisuals();
    return deploymentState;
  }

  syncMortarDeploymentCompatibility() {
    if (!this.mortarTeamState) return;
    const movementLocked =
      this.mortarTeamState.deploymentState !== 'PACKED';
    this.isDeployed = movementLocked;
    if (
      !this.isHiding
      && !['Pinned', 'Broken'].includes(this.morale)
    ) {
      this.stance = movementLocked ? 'KNEELING' : 'STANDING';
    }
  }

  initializeMortarPosePresentation() {
    if (!this.mortarTeamConfig || !this.mesh) return;
    const soldierMeshes = this.mesh.userData.soldiers;
    if (!Array.isArray(soldierMeshes)) return;
    for (let rosterIndex = 0; rosterIndex < soldierMeshes.length; rosterIndex++) {
      const soldierMesh = soldierMeshes[rosterIndex];
      const soldierId = String(soldierMesh.userData.soldierId);
      let role = null;
      if (soldierId === String(this.mortarTeamConfig.gunnerSoldierId)) {
        role = 'gunner';
      } else if (
        soldierId === String(this.mortarTeamConfig.assistantSoldierId)
      ) {
        role = 'assistant';
      }
      if (!role) continue;
      soldierMesh.userData.mortarOperatorPose = {
        role,
        rosterIndex,
        deploymentState: 'PACKED',
        deployedProgress: 0,
        reloadRemainingSeconds: 0,
        firePulseRemainingSeconds: 0,
        observedRoundsFired: this.mortarTeamState?.roundsFired ?? 0,
        available: true,
        aiming: false,
        operating: false,
        action: 'packed'
      };
    }
  }

  syncMortarVisuals(deltaSeconds = 0, resetFirePulse = false) {
    if (!this.mortarTeamState || !this.mesh) return;
    const equipment = this.mesh.userData.mortarEquipment;
    if (!equipment) return;
    const { deploymentState, transitionRemainingSeconds } =
      this.mortarTeamState;
    let deployedProgress = deploymentState === 'READY' ? 1 : 0;
    if (deploymentState === 'SETTING_UP') {
      deployedProgress = 1 - transitionRemainingSeconds
        / this.mortarTeamConfig.setupSeconds;
    } else if (deploymentState === 'PACKING') {
      deployedProgress = transitionRemainingSeconds
        / this.mortarTeamConfig.packSeconds;
    }
    const packedTubeAngle = Math.PI / 2;
    const deployedTubeAngle = 25 * Math.PI / 180;
    equipment.userData.tubePivot.rotation.x =
      packedTubeAngle
      + (deployedTubeAngle - packedTubeAngle)
        * THREE.MathUtils.clamp(deployedProgress, 0, 1);
    equipment.userData.bipod.visible = deployedProgress > 0.05;
    equipment.userData.deploymentState = deploymentState;

    const operating = deploymentState !== 'PACKED';
    const soldierMeshes = this.mesh.userData.soldiers;
    if (!Array.isArray(soldierMeshes)) return;
    for (const soldierMesh of soldierMeshes) {
      if (!this.mortarOperatorIds.has(String(soldierMesh.userData.soldierId))) {
        continue;
      }
      const weaponRig = soldierMesh.userData.parts?.weaponRig;
      if (weaponRig) weaponRig.visible = !operating;
      const pose = soldierMesh.userData.mortarOperatorPose;
      if (!pose) continue;
      const soldier = this.roster[pose.rosterIndex];
      const unavailable = !soldier
        || (soldier.health ?? 100) <= 0
        || UNAVAILABLE_INFANTRY_STATUSES.has(soldier.status)
        || soldier.status === 'SURRENDERED'
        || soldier.state === 'SURRENDERED';
      const roundsFired = this.mortarTeamState.roundsFired;
      if (resetFirePulse) {
        pose.firePulseRemainingSeconds = 0;
      } else if (roundsFired > pose.observedRoundsFired) {
        pose.firePulseRemainingSeconds = 0.12;
      } else {
        pose.firePulseRemainingSeconds = Math.max(
          0,
          pose.firePulseRemainingSeconds - Math.max(0, deltaSeconds)
        );
      }
      pose.observedRoundsFired = roundsFired;
      pose.deploymentState = deploymentState;
      pose.deployedProgress = THREE.MathUtils.clamp(deployedProgress, 0, 1);
      pose.reloadRemainingSeconds =
        this.mortarTeamState.reloadRemainingSeconds;
      pose.available = !unavailable;
      pose.aiming = Boolean(
        this.mortarTargetOrder || this.mortarFireMissionState?.mission
      );
      pose.operating = operating && pose.available;
      pose.action = !pose.available
        ? 'unavailable'
        : deploymentState === 'PACKED'
          ? 'packed'
          : deploymentState === 'SETTING_UP'
            ? 'setup'
            : deploymentState === 'PACKING'
              ? 'pack'
              : pose.firePulseRemainingSeconds > 0
                ? 'fire'
                : pose.reloadRemainingSeconds > 0
                  ? 'reload'
                  : pose.aiming
                    ? 'aim'
                    : 'ready';
    }
  }

  getMortarMuzzleWorldPosition() {
    const muzzle = this.mesh?.userData.mortarMuzzle;
    if (!muzzle?.getWorldPosition) return null;
    this.mesh.updateWorldMatrix(true, true);
    return muzzle.getWorldPosition(new THREE.Vector3());
  }

  getMortarDefaultDispersionRadius(targetPoint) {
    if (!this.mortarTeamConfig) return null;
    const weapon = this.weaponLookup(this.mortarTeamConfig.weaponId);
    if (!weapon) return null;
    const point = targetPoint?.isVector3
      ? targetPoint
      : new THREE.Vector3().fromArray(targetPoint);
    const horizontalRangeMeters = Math.hypot(
      point.x - this.position.x,
      point.z - this.position.z
    );
    const dispersionRadians = weapon.dispersionMOA * Math.PI / (180 * 60);
    return Math.max(0.1, Math.tan(dispersionRadians) * horizontalRangeMeters);
  }

  setMortarTargetOrder(targetPoint, mode, radiusMeters = null) {
    if (!this.mortarTeamConfig || mode !== 'MORTAR_HE') return false;
    const center = targetPoint?.isVector3
      ? targetPoint.toArray()
      : targetPoint;
    if (
      !Array.isArray(center)
      || center.length < 3
      || !center.slice(0, 3).every(Number.isFinite)
    ) {
      return false;
    }
    const horizontalRangeMeters = Math.hypot(
      center[0] - this.position.x,
      center[2] - this.position.z
    );
    if (
      horizontalRangeMeters < this.mortarTeamConfig.minimumRangeMeters
      || horizontalRangeMeters > this.mortarTeamConfig.maximumRangeMeters
    ) {
      return false;
    }
    const defaultDispersionRadiusMeters =
      this.getMortarDefaultDispersionRadius(center);
    const rangeEnvelopeRadiusMeters = Math.max(
      defaultDispersionRadiusMeters,
      Math.min(
        horizontalRangeMeters - this.mortarTeamConfig.minimumRangeMeters,
        this.mortarTeamConfig.maximumRangeMeters - horizontalRangeMeters
      )
    );
    this.mortarTargetOrder = createMortarTargetOrder({
      ammunitionType: 'HE',
      center,
      radiusMeters: THREE.MathUtils.clamp(
        Number.isFinite(radiusMeters)
          ? radiusMeters
          : defaultDispersionRadiusMeters,
        defaultDispersionRadiusMeters,
        rangeEnvelopeRadiusMeters
      ),
      defaultDispersionRadiusMeters,
      firstRoundDelaySeconds: 1
    });
    this.targetUnit = null;
    this.targetPos = new THREE.Vector3().fromArray(
      this.mortarTargetOrder.center
    );
    this.targetMode = mode;
    return true;
  }

  clearMortarTargetOrder() {
    this.mortarTargetOrder = null;
  }

  updateMortarCombat(context = {}) {
    const pendingMissionShot = this.getPendingMortarFireMissionShot();
    const hasMission = Boolean(this.mortarFireMissionState?.mission);
    const targetSource = pendingMissionShot
      ? new THREE.Vector3().fromArray(pendingMissionShot.aimPoint)
      : (
          hasMission
            ? null
            : (
                this.targetMode === 'MORTAR_HE' && this.mortarTargetOrder
                  ? new THREE.Vector3().fromArray(
                      this.mortarTargetOrder.center
                    )
                  : null
              )
        );
    if (!this.mortarTeamState || !this.mortarTeamConfig || !targetSource) {
      return false;
    }
    if (this.isHiding) return false;
    if (
      !pendingMissionShot
      && this.mortarTargetOrder.firstRoundDelayRemainingSeconds > 0
    ) {
      return false;
    }
    if (
      ['Pinned', 'Broken'].includes(this.morale)
      || this.suppression >= 58
    ) {
      return false;
    }
    const target = targetSource.clone();
    target.y = context.terrain?.getHeightAt?.(target.x, target.z)
      ?? target.y;
    const horizontalRangeMeters = Math.hypot(
      target.x - this.position.x,
      target.z - this.position.z
    );
    const readiness = canFireMortar(
      this.mortarTeamState,
      this.mortarTeamConfig,
      this.roster,
      horizontalRangeMeters
    );
    if (!readiness.ready) return false;

    const random = context.random;
    if (typeof random !== 'function') {
      throw new TypeError('Mortar combat requires injected deterministic random');
    }
    const weapon = this.weaponLookup(this.mortarTeamConfig.weaponId);
    if (!weapon) return false;
    if (!pendingMissionShot) {
      target.fromArray(
        sampleMortarTargetPoint(this.mortarTargetOrder, random)
      );
    } else {
      const dispersionRadians =
        weapon.dispersionMOA * Math.PI / (180 * 60);
      const dispersionRadius =
        Math.tan(dispersionRadians) * horizontalRangeMeters;
      const dispersionAngle = random() * Math.PI * 2;
      const dispersionDistance = Math.sqrt(random()) * dispersionRadius;
      target.x += Math.cos(dispersionAngle) * dispersionDistance;
      target.z += Math.sin(dispersionAngle) * dispersionDistance;
    }
    target.y = context.terrain?.getHeightAt?.(target.x, target.z)
      ?? target.y;

    const equipment = this.mesh?.userData.mortarEquipment;
    if (equipment) {
      const worldYaw = Math.atan2(
        target.x - this.position.x,
        target.z - this.position.z
      );
      equipment.rotation.y = wrapAngle(worldYaw - this.rotation);
    }
    const muzzlePosition = this.getMortarMuzzleWorldPosition();
    if (!muzzlePosition) return false;
    const solution = solveHighAngleTrajectory({
      origin: muzzlePosition,
      target,
      elevationDegrees: this.mortarTeamConfig.elevationDegrees,
      minimumMuzzleVelocity:
        this.mortarTeamConfig.minimumMuzzleVelocity,
      maximumMuzzleVelocity:
        this.mortarTeamConfig.maximumMuzzleVelocity
    });
    if (!solution) return false;

    const gunner = this.soldierAI?.agents.find(
      agent => String(agent.id)
        === String(this.mortarTeamConfig.gunnerSoldierId)
    ) ?? { id: this.mortarTeamConfig.gunnerSoldierId };
    const fired = context.combat?.fireWeapon?.(
      this,
      null,
      target,
      {
        shooter: gunner,
        weapon,
        mountId: this.mortarTeamConfig.id,
        ammoId: weapon.id,
        muzzlePosition,
        aimPoint: target,
        initialVelocity: new THREE.Vector3().fromArray(solution.velocity),
        maxFlightTimeSeconds: solution.flightTimeSeconds + 2,
        fireControlModelVersion: solution.modelVersion,
        estimatedRangeMeters: horizontalRangeMeters,
        indirectMissionId: pendingMissionShot?.missionId ?? null,
        indirectMissionShotId: pendingMissionShot?.shotId ?? null,
        indirectMissionShotKind: pendingMissionShot?.kind ?? null
      }
    ) ?? false;
    if (!fired) return false;
    const consumed = consumeMortarRound(
      this.mortarTeamState,
      this.mortarTeamConfig,
      this.roster
    );
    if (!consumed.accepted) {
      throw new Error(
        `Mortar ${this.id} fired without consumable ammunition: `
        + consumed.reason
      );
    }
    this.syncMortarVisuals();
    if (pendingMissionShot) {
      const acknowledgement = recordMortarFireMissionShot(
        this.mortarFireMissionState,
        this.mortarFireMissionConfig,
        pendingMissionShot.shotId,
        context.mortarMissionContext
      );
      if (!acknowledgement.accepted) {
        throw new Error(
          `Mortar ${this.id} fired mission shot ${pendingMissionShot.shotId} `
          + `without a valid mission acknowledgement: ${acknowledgement.reason}`
        );
      }
    } else {
      recordMortarTargetOrderShot(this.mortarTargetOrder);
    }
    return true;
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

  getMountedCrew() {
    return this.getLivingCrew().filter(crewman =>
      crewman.vehicleLocation?.phase !== 'DISMOUNTED'
    );
  }

  hasDismountedTransportCrew() {
    return Boolean(
      this.isTransportVehicle()
      && this.getLivingCrew().some(crewman =>
        crewman.vehicleLocation?.phase === 'DISMOUNTED'
      )
    );
  }

  dismountTransportCrew() {
    if (!this.isTransportVehicle() || this.vehicleDamageState?.destroyed) {
      return { accepted: false, reason: 'NOT_A_WORKING_TRUCK' };
    }
    if (this.hasDismountedTransportCrew()) {
      return { accepted: false, reason: 'CREW_ALREADY_DISMOUNTED' };
    }
    this.clearWaypoints();
    const crewIds = [];
    for (const crewman of this.getLivingCrew()) {
      crewman.vehicleLocation = {
        vehicleId: String(this.id),
        phase: 'DISMOUNTED'
      };
      crewIds.push(String(crewman.id));
    }
    this.syncTransportCrewPresentation();
    return { accepted: crewIds.length > 0, reason: crewIds.length ? null : 'NO_CREW', crewIds };
  }

  remountTransportCrew() {
    if (!this.isTransportVehicle() || this.vehicleDamageState?.destroyed) {
      return { accepted: false, reason: 'NOT_A_WORKING_TRUCK' };
    }
    const crewIds = [];
    for (const crewman of this.getLivingCrew()) {
      if (crewman.vehicleLocation?.phase !== 'DISMOUNTED') continue;
      crewman.vehicleLocation = null;
      crewIds.push(String(crewman.id));
    }
    this.syncTransportCrewPresentation();
    return { accepted: crewIds.length > 0, reason: crewIds.length ? null : 'CREW_ALREADY_MOUNTED', crewIds };
  }

  syncTransportCrewPresentation() {
    const figures = this.mesh?.userData.transportCrewFigures ?? {};
    for (const crewman of this.roster ?? []) {
      const figure = figures[String(crewman.id)];
      if (!figure) continue;
      figure.visible = crewman.health > 0
        && crewman.status !== 'KIA'
        && crewman.vehicleLocation?.phase === 'DISMOUNTED';
    }
  }

  getUnbuttonedCommander() {
    return getUnbuttonedCommander(this);
  }

  canUnbuttonCommander() {
    return Boolean(
      this.vehicleSpec?.observationEquipment?.unbuttonedCommander
      && this.getLivingCrew().some(crewman =>
        this.getEffectiveCrewRole(crewman)
          === this.vehicleSpec.observationEquipment.unbuttonedCommander.role)
      && !this.vehicleDamageState.destroyed
      && !this.vehicleDamageState.burning
    );
  }

  toggleVehicleCommanderPosture() {
    if (!this.vehicleSpec) return null;
    if (this.vehicleCrewPosture === 'UNBUTTONED') {
      this.vehicleCrewPosture = 'BUTTONED';
    } else {
      if (!this.canUnbuttonCommander()) return null;
      this.vehicleCrewPosture = 'UNBUTTONED';
    }
    this.syncVehicleCommanderPresentation();
    return this.vehicleCrewPosture;
  }

  getObserverWorldPosition(person) {
    if (!this.vehicleSpec) return null;
    const exposed = this.getUnbuttonedCommander();
    if (exposed && String(exposed.id) === String(person?.id)) {
      const position = getUnbuttonedCommanderWorldPosition(this);
      return position
        ? new THREE.Vector3(position.x, position.y, position.z)
        : null;
    }
    return this.position.clone().add(new THREE.Vector3(
      0,
      this.vehicleSpec.dimensionsMeters.height * 0.76,
      0
    ));
  }

  getExposedCommanderTargetPosition() {
    const position = getUnbuttonedCommanderWorldPosition(this);
    return position
      ? new THREE.Vector3(position.x, position.y, position.z)
      : null;
  }

  applyExposedVehicleCrewDamage(crewmanId, damage) {
    const commander = this.getUnbuttonedCommander();
    if (!commander || String(commander.id) !== String(crewmanId)) return null;
    commander.health = Math.max(0, commander.health - Math.max(0, damage));
    commander.status = commander.health <= 0 ? 'KIA' : 'WOUNDED';
    recordVehicleEvent(this.vehicleDamageState, 'crew_hit', {
      crewmanId: commander.id,
      role: commander.role,
      status: commander.status,
      health: commander.health,
      cause: 'unbuttoned_commander_hit',
      dataQuality:
        this.vehicleSpec.observationEquipment.unbuttonedCommander.dataQuality
    });
    this.vehicleCrewPosture = 'BUTTONED';
    if (this.getLivingCrew().length === 0) {
      this.vehicleDamageState.destroyed = true;
      setVehicleComponentHealth(this.vehicleComponents, 'hull', 0);
      recordVehicleEvent(this.vehicleDamageState, 'vehicle_destroyed', {
        cause: 'crew_loss'
      });
    }
    this.syncVehicleCommanderPresentation();
    this.syncLegacyVehicleDamage();
    return commander;
  }

  syncVehicleCommanderPresentation() {
    if (!this.mesh || !this.vehicleSpec) return;
    const commander = this.getUnbuttonedCommander();
    const worldPosition = getUnbuttonedCommanderWorldPosition(this);
    for (const hatch of this.mesh.userData.commanderHatches ?? []) {
      const axis = hatch.userData.rotationAxis;
      if (!['x', 'y', 'z'].includes(axis)) continue;
      hatch.rotation[axis] = commander
        ? hatch.userData.openAngleRadians
        : hatch.userData.closedAngleRadians;
    }
    const figure = this.mesh.userData.commanderFigure;
    if (!figure) return;
    figure.visible = Boolean(commander && worldPosition);
    if (!figure.visible) return;
    this.mesh.updateWorldMatrix(true, false);
    const local = this.mesh.worldToLocal(COMMANDER_PRESENTATION_LOCAL.set(
      worldPosition.x,
      worldPosition.y,
      worldPosition.z
    ));
    const commanderPresentation =
      this.vehicleSpec.observationEquipment.unbuttonedCommander;
    const presentationOffset = COMMANDER_PRESENTATION_OFFSET.fromArray(
      commanderPresentation.presentationOffset ?? [0, 0, 0]
    );
    if (commanderPresentation.followsTurret) {
      presentationOffset.applyAxisAngle(
        COMMANDER_PRESENTATION_UP,
        this.vehicleWeapon?.turretYaw ?? 0
      );
    }
    local.add(presentationOffset);
    figure.position.copy(local);
    figure.rotation.y =
      commanderPresentation.followsTurret
        ? (this.vehicleWeapon?.turretYaw ?? 0)
        : 0;
  }

  isOriginalCrewRoleAlive(roles) {
    return this.getMountedCrew().some(crewman => roles.includes(crewman.role));
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

  getVehicleMainGunBlockedPhase({
    remainingTurretYawError,
    shooterMoving,
    mainGunnerDelta
  }) {
    if (!this.vehicleComponents.main_gun?.operational
        || !this.vehicleComponents.breech?.operational) {
      return 'GUN DISABLED';
    }
    if (this.vehicleComponents.turret_traverse?.operational === false) {
      return 'TRAVERSE DISABLED';
    }
    if (!this.isCrewRoleAlive(this.vehicleSpec.gunnerRoles)) {
      return this.vehicleCrewTasks?.mainGunnerReplacement?.phase === 'TRANSFERRING'
        ? 'CREW TRANSFER'
        : 'NO GUNNER';
    }
    if (!(mainGunnerDelta > 0)) return 'CREW BUSY';
    if (shooterMoving) return 'MOVING';
    if (Math.abs(remainingTurretYawError) > 0.06) return 'TRAVERSING';
    return 'DISABLED';
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

  beginVehicleMountReload(mountId, ammoType = null) {
    const mount = this.getVehicleMountSpec(mountId);
    const state = this.vehicleMounts?.[mountId];
    const requestedType = mount?.weapons
      ? (ammoType ?? state?.pendingType ?? state?.loadedType ?? 'he')
      : null;
    const weaponId = mount?.weapons?.[requestedType] ?? mount?.weaponId;
    const weapon = this.weaponLookup(weaponId);
    if (!mount || !state || !weapon || state.feedAmmo > 0 || state.reloadTimer > 0
        || (mount.weapons
          ? (state.ammunition?.[requestedType] ?? 0) <= 0
          : state.reserveAmmo <= 0)
        || !this.isVehicleMountOperational(mountId)
        || !this.isOriginalCrewRoleAlive(mount.loaderRoles)
        || !this.vehicleComponents.ammunition?.operational) return false;
    if (mount.weapons) {
      state.pendingType = requestedType;
      state.weaponId = weaponId;
    }
    state.reloadTimer = weapon.reloadSeconds;
    state.fireState = 'RELOADING';
    return true;
  }

  prepareVehicleMountAmmunition(mount, state, desiredType) {
    if (!mount.weapons || !desiredType) return true;
    if (!mount.weapons[desiredType]) return false;
    state.pendingType = desiredType;
    if (state.loadedType && state.loadedType !== desiredType && state.feedAmmo > 0) {
      // First-order handling model: the loader returns the chambered round to
      // stowage before completing the normal full reload delay for the new type.
      state.ammunition[state.loadedType] =
        (state.ammunition[state.loadedType] ?? 0) + state.feedAmmo;
      state.reserveAmmo += state.feedAmmo;
      state.feedAmmo = 0;
      state.loadedType = null;
      state.reloadTimer = 0;
    }
    if (state.feedAmmo <= 0) {
      this.beginVehicleMountReload(mount.id, desiredType);
      return false;
    }
    state.weaponId = mount.weapons[state.loadedType];
    return state.loadedType === desiredType;
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
      if (state.ammunition) {
        for (const type of Object.keys(state.ammunition)) {
          state.ammunition[type] = 0;
        }
      }
      state.feedAmmo = 0;
      state.reserveAmmo = 0;
      state.reloadTimer = 0;
      state.isFiring = false;
      state.fireState = 'DESTROYED';
    }
    destroyTransportCargo(this.vehicleTransportState);
  }

  hasVehicleCookoffAmmunition() {
    const roundsInState = state => {
      if (!state) return 0;
      const stored = state.ammunition
        ? Object.values(state.ammunition).reduce((sum, rounds) => sum + rounds, 0)
        : (state.reserveAmmo ?? 0);
      return stored + (state.feedAmmo ?? 0);
    };
    if (roundsInState(this.vehicleWeapon) > 0) return true;
    if (Object.values(this.vehicleTransportState?.cargo ?? {})
      .some(rounds => rounds > 0)) return true;
    return (this.vehicleSpec?.weaponMounts ?? []).some(mount =>
      mount.kind === 'cannon'
      && roundsInState(this.vehicleMounts[mount.id]) > 0);
  }

  incapacitateVehicleCrewFromCookoff() {
    for (const crewman of this.getMountedCrew()) {
      crewman.health = 0;
      crewman.status = 'KIA';
      recordVehicleEvent(this.vehicleDamageState, 'crew_hit', {
        crewmanId: crewman.id,
        role: crewman.role,
        status: crewman.status,
        health: crewman.health,
        cause: 'ammunition_cookoff',
        dataQuality: 'GAMEPLAY_APPROXIMATION'
      });
    }
  }

  applyVehicleCookoffConsequences() {
    if (!this.vehicleSpec || !this.vehicleDamageState?.secondaryExplosion) return false;
    destroyVehicleComponentsFromCookoff(
      this.vehicleComponents,
      this.vehicleDamageState
    );
    if (this.getLivingCrew().length > 0) {
      this.incapacitateVehicleCrewFromCookoff();
    }
    this.destroyVehicleAmmunitionStores();
    this.vehicleCrewPosture = 'BUTTONED';
    return true;
  }

  getVehicleMovementFactor() {
    if (!this.vehicleSpec || !this.hasOperationalDriver()) return this.vehicleSpec ? 0 : 1;
    if (this.vehicleDamageState?.burning || this.vehicleDamageState?.secondaryExplosion) return 0;
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
      const proxyBarrel = this.mesh?.userData.proxyBarrel;
      if (proxyBarrel && proxyBarrel.parent !== barrel) {
        const proxyRestZ = proxyBarrel.userData.restZ ?? proxyBarrel.position.z;
        proxyBarrel.userData.restZ = proxyRestZ;
        proxyBarrel.position.z = proxyRestZ - Math.sin(recoil * Math.PI) * 0.16;
      }
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
    if (
      this.vehicleCrewPosture === 'UNBUTTONED'
      && !this.canUnbuttonCommander()
    ) {
      this.vehicleCrewPosture = 'BUTTONED';
    }
    advanceVehicleFireState({
      components: this.vehicleComponents,
      damageState: this.vehicleDamageState,
      hasAmmunition: this.hasVehicleCookoffAmmunition()
    }, Math.max(0, delta));
    if (this.vehicleDamageState.burning) {
      this.abandonVehicleCombatIntent('VEHICLE_BURNING');
    }
    if (this.vehicleDamageState.secondaryExplosion) {
      this.applyVehicleCookoffConsequences();
    }
    const crewTaskStep = advanceVehicleCrewTaskStep(
      this.vehicleCrewTasks,
      this.vehicleSpec.crewTaskPolicy,
      this.roster,
      delta
    );
    this.vehicleCrewTasks = crewTaskStep.state;
    this.vehicleMainGunnerCombatSeconds = crewTaskStep.mainGunnerAvailableSeconds;
    if (
      this.vehicleCrewPosture === 'UNBUTTONED'
      && !this.canUnbuttonCommander()
    ) {
      this.vehicleCrewPosture = 'BUTTONED';
    }
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
      this.syncVehicleCommanderPresentation();
      return;
    }
    if (this.vehicleWeapon) {
      this.vehicleWeapon.isFiring = false;
      this.advanceVehicleMainWeaponSystem(delta);
    }

    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      const state = this.vehicleMounts[mount.id];
      const weapon = this.weaponLookup(state?.weaponId ?? mount.weaponId);
      if (!state || !weapon) continue;
      state.isFiring = false;
      state.cooldown = Math.max(-delta, state.cooldown - delta);
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
          if (mount.weapons) {
            const type = state.pendingType ?? 'he';
            const typedWeapon = this.weaponLookup(mount.weapons[type]);
            const rounds = Math.min(
              mount.feedCapacity ?? typedWeapon?.magazineSize ?? 1,
              state.ammunition?.[type] ?? 0
            );
            state.ammunition[type] -= rounds;
            state.reserveAmmo = Object.values(state.ammunition)
              .reduce((sum, count) => sum + count, 0);
            state.loadedType = rounds > 0 ? type : null;
            state.weaponId = mount.weapons[type];
            state.feedAmmo = rounds;
          } else {
            const rounds = Math.min(mount.feedCapacity ?? weapon.magazineSize, state.reserveAmmo);
            state.reserveAmmo -= rounds;
            state.feedAmmo = rounds;
          }
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
    this.syncVehicleCommanderPresentation();
  }

  canVehicleFire() {
    return Boolean(
      this.vehicleWeapon?.loadedType
      && this.vehicleWeapon.cooldown <= 0
      && this.hasOperationalGunner()
      && !this.vehicleDamageState.burning
    );
  }

  resolveVehicleChannelTarget(
    target,
    state,
    channelId,
    { allowPointTarget = true } = {}
  ) {
    if (target?.type === 'infantry_squad') {
      const soldier = selectVehicleTargetSoldier({
        livingSoldiers: target.soldierAI?.getLivingAgents?.() ?? [],
        preferredSoldierId: state?.targetSoldierId ?? null,
        channelId,
        roundsFired: state?.roundsFired ?? 0
      });
      if (!soldier) return null;
      if (state) state.targetSoldierId = soldier.id;
      return {
        soldier,
        position: soldier.position,
        explicitAimPoint: null
      };
    }
    if (state) state.targetSoldierId = null;
    if (target?.vehicleSpec && target === this.targetUnit && this.targetAimIntent) {
      const point = resolveVehicleLocalAimPoint(target, this.targetAimIntent);
      if (target === this.targetUnit) this.targetPos.fromArray(point);
      return {
        soldier: null,
        position: new THREE.Vector3().fromArray(point),
        explicitAimPoint: point
      };
    }
    if (target?.vehicleSpec && this.vehicleEngagementLearning) {
      setVehicleEngagementTarget(this.vehicleEngagementLearning, target.id);
      const aim = selectVehicleEngagementAim(
        getVehicleArmorAimPoints(target),
        this.vehicleEngagementLearning
      );
      if (aim) {
        return {
          soldier: null,
          position: new THREE.Vector3().fromArray(aim.point),
          explicitAimPoint: aim.point
        };
      }
    }
    const position = target?.position ?? (allowPointTarget ? this.targetPos : null);
    return position
      ? { soldier: null, position, explicitAimPoint: null }
      : null;
  }

  abandonVehicleCombatIntent(reason = 'ABANDONED') {
    this.clearTargetOrder(reason);
  }

  clearVehicleTargetChannels(reason = 'TARGET_CLEARED') {
    const clearState = state => {
      if (!state) return;
      state.isFiring = false;
      state.targetUnitId = null;
      state.targetSoldierId = null;
      state.targetPos = null;
      state.targetMode = null;
      state.fireState = reason;
      resetFireControlState(state.fireControl, reason);
    };
    clearState(this.vehicleWeapon);
    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      clearState(this.vehicleMounts[mount.id]);
    }
    setVehicleEngagementTarget(this.vehicleEngagementLearning, null);
  }

  clearTargetOrder(reason = 'TARGET_CLEARED') {
    if (this.vehicleSpec) this.clearVehicleTargetChannels(reason);
    this.targetUnit = null;
    this.targetPos = null;
    this.targetAimIntent = null;
    this.targetMode = null;
    this.clearMortarTargetOrder?.();
    return true;
  }

  setTargetOrder({ targetUnit, targetPos, targetAimIntent, targetMode } = {}) {
    if (!targetPos) return false;
    if (this.vehicleSpec) this.clearVehicleTargetChannels('TARGET_CHANGED');
    this.clearMortarTargetOrder?.();
    this.targetUnit = targetUnit ?? null;
    this.targetPos = targetPos.isVector3
      ? targetPos.clone()
      : new THREE.Vector3().fromArray(targetPos);
    this.targetAimIntent = captureVehicleAimIntent(targetAimIntent);
    this.targetMode = targetMode ?? null;
    if (this.vehicleEngagementLearning) {
      setVehicleEngagementTarget(
        this.vehicleEngagementLearning,
        this.targetUnit?.id ?? null
      );
    }
    return true;
  }

  updateVehicleCombat(delta, context) {
    if (this.vehicleDamageState?.burning || this.vehicleDamageState?.secondaryExplosion) {
      this.abandonVehicleCombatIntent('VEHICLE_BURNING');
      return false;
    }
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
    if (this.vehicleDamageState?.burning || this.vehicleDamageState?.secondaryExplosion) {
      this.abandonVehicleCombatIntent('VEHICLE_BURNING');
      return false;
    }
    if (this.holdFire) {
      if (this.vehicleWeapon) {
        this.vehicleWeapon.isFiring = false;
        this.vehicleWeapon.targetUnitId = null;
        this.vehicleWeapon.targetSoldierId = null;
        this.vehicleWeapon.targetPos = null;
        this.vehicleWeapon.fireState = 'HOLD_FIRE';
        resetFireControlState(this.vehicleWeapon.fireControl, 'HOLD_FIRE');
      }
      for (const mount of this.vehicleSpec.weaponMounts ?? []) {
        const state = this.vehicleMounts[mount.id];
        if (!state) continue;
        state.isFiring = false;
        state.targetUnitId = null;
        state.targetSoldierId = null;
        state.targetPos = null;
        state.fireState = 'HOLD_FIRE';
        resetFireControlState(state.fireControl, 'HOLD_FIRE');
      }
      return false;
    }
    const target = context.target;
    const targetReference = target ?? this.targetUnit;
    const targetReferenceId = targetReference?.id ?? null;
    const targetStillPlausible = !this.targetUnit
      || this.targetUnit.isCombatEffective?.() !== false;
    // A manually ordered vehicle target retains the last precise world point
    // when its direct-contact projection briefly drops. The projectile is
    // still fired spatially with no preselected target, so a moved enemy is
    // missed and ordinary swept collision remains authoritative.
    const allowPointTarget = Boolean(this.targetPos && targetStillPlausible);
    const mainTarget = this.resolveVehicleChannelTarget(
      target,
      this.vehicleWeapon,
      'main',
      { allowPointTarget }
    );
    if (!mainTarget) {
      if (this.vehicleWeapon) {
        this.vehicleWeapon.targetUnitId = null;
        this.vehicleWeapon.targetSoldierId = null;
        this.vehicleWeapon.targetPos = null;
        resetFireControlState(this.vehicleWeapon.fireControl);
      }
      for (const mount of this.vehicleSpec.weaponMounts ?? []) {
        const state = this.vehicleMounts[mount.id];
        if (!state) continue;
        state.targetUnitId = null;
        state.targetSoldierId = null;
        state.targetPos = null;
        resetFireControlState(state.fireControl);
      }
      return false;
    }
    const targetSoldier = mainTarget.soldier;
    const targetPosition = mainTarget.position;
    const weaponSelection = selectVehicleTargetWeapons({
      mode: this.targetMode,
      target: targetReference,
      vehicleSpec: this.vehicleSpec
    });
    const selectedMountIds = weaponSelection.mountIds ?? [];
    const needsTurretAim = weaponSelection.fireMainGun
      || (this.vehicleSpec.weaponMounts ?? []).some(mount =>
        selectedMountIds.includes(mount.id) && mount.traverse === 'turret'
      );

    const desiredWorldYaw = Math.atan2(
      targetPosition.x - this.position.x,
      targetPosition.z - this.position.z
    );
    const desiredTurretYaw = wrapAngle(desiredWorldYaw - this.rotation);
    const currentTurretYaw = this.vehicleWeapon?.turretYaw ?? 0;
    const yawError = wrapAngle(desiredTurretYaw - currentTurretYaw);
    if (
      this.vehicleWeapon
      && needsTurretAim
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
      this.syncVehicleWeaponPresentation();
    }
    const remainingTurretYawError = wrapAngle(
      desiredTurretYaw - (this.vehicleWeapon?.turretYaw ?? currentTurretYaw)
    );
    const targetKey = createFireControlTargetKey({
      targetUnitId: targetReferenceId,
      targetSoldierId: targetSoldier?.id ?? null,
      targetPosition
    });
    const trueRangeMeters = this.position.distanceTo(targetPosition);
    const targetMoving = Boolean(context.targetMoving);
    const shooterMoving = Boolean(context.shooterMoving);

    let firedMain = false;
    if (
      includeMain
      && weaponSelection.fireMainGun
      && this.vehicleSpec.mainGun
      && this.vehicleWeapon
    ) {
      this.vehicleWeapon.targetUnitId = targetReferenceId;
      this.vehicleWeapon.targetPos = targetPosition.toArray();
      this.vehicleWeapon.targetMode = this.targetMode;
      const desiredAmmoType = selectAdaptiveVehicleAmmoType({
        state: this.vehicleEngagementLearning,
        mode: this.targetMode,
        defaultAmmoType: weaponSelection.mainAmmoType,
        vehicleSpec: this.vehicleSpec,
        weaponLookup: this.weaponLookup,
        ammunitionState: this.vehicleWeapon
      });
      const aimWeapon = this.weaponLookup(
        this.vehicleSpec.mainGun[this.vehicleWeapon.loadedType ?? desiredAmmoType]
      );
      const mainCanAim = Math.abs(remainingTurretYawError) <= 0.06
        && this.hasOperationalGunner()
        && mainGunnerDelta > 0
        && !this.vehicleDamageState.burning
        && !shooterMoving;
      const mainBlockedPhase = this.getVehicleMainGunBlockedPhase({
        remainingTurretYawError,
        shooterMoving,
        mainGunnerDelta
      });
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
        blockedPhase: mainBlockedPhase
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
          targetSoldier,
          aimPoint: mainTarget.explicitAimPoint,
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
    } else if (includeMain && this.vehicleWeapon) {
      this.vehicleWeapon.targetUnitId = targetReferenceId;
      this.vehicleWeapon.targetPos = targetPosition.toArray();
      this.vehicleWeapon.targetMode = this.targetMode;
      this.vehicleWeapon.fireState = 'HOLD_FIRE';
      resetFireControlState(this.vehicleWeapon.fireControl, 'HOLD_FIRE');
    }

    const firedMountedWeapon = includeMounts && selectedMountIds.length > 0
      ? this.updateVehicleMountedWeaponCombat(context, {
          target,
          mountIds: selectedMountIds,
          mountAmmoTypes: weaponSelection.mountAmmoTypes ?? {},
          targetMoving,
          shooterMoving,
          allowPointTarget,
          deltaSeconds: delta,
          occupiedCrewRoles: firedMain ? this.vehicleSpec.gunnerRoles : []
        })
      : false;
    if (includeMounts) {
      for (const mount of this.vehicleSpec.weaponMounts ?? []) {
        if (selectedMountIds.includes(mount.id)) continue;
        const state = this.vehicleMounts[mount.id];
        if (!state) continue;
        state.targetUnitId = targetReferenceId;
        state.targetPos = targetPosition.toArray();
        state.targetMode = this.targetMode;
        state.fireState = 'HOLD_FIRE';
        resetFireControlState(state.fireControl, 'HOLD_FIRE');
      }
    }
    return firedMain || firedMountedWeapon;
  }

  recordVehicleEngagementImpact({ targetUnitId, weapon, result } = {}) {
    if (!this.vehicleEngagementLearning) return;
    recordResolvedVehicleEngagementImpact(this.vehicleEngagementLearning, {
      targetUnitId,
      weapon,
      result
    });
  }

  shouldReconsiderVehicleTarget(targetUnitId) {
    return Boolean(
      this.vehicleEngagementLearning?.retargetRequested
      && this.vehicleEngagementLearning.targetUnitId === targetUnitId
    );
  }

  recordAdaptiveVehicleRetarget(fromTargetUnitId, toTargetUnitId) {
    if (!this.vehicleEngagementLearning) return;
    recordResolvedAdaptiveVehicleRetarget(this.vehicleEngagementLearning, {
      fromTargetUnitId,
      toTargetUnitId
    });
  }

  updateVehicleMountedWeaponCombat(context, aiming) {
    let firedAny = false;
    for (const mount of this.vehicleSpec.weaponMounts ?? []) {
      if (!aiming.mountIds?.includes(mount.id)) continue;
      const state = this.vehicleMounts[mount.id];
      if (!state) continue;
      const desiredAmmoType = aiming.mountAmmoTypes?.[mount.id] ?? null;
      if (!this.prepareVehicleMountAmmunition(mount, state, desiredAmmoType)) {
        continue;
      }
      const weapon = this.weaponLookup(state.weaponId ?? mount.weaponId);
      if (!weapon) continue;
      const mountTarget = this.resolveVehicleChannelTarget(
        aiming.target,
        state,
        mount.id,
        { allowPointTarget: aiming.allowPointTarget }
      );
      if (!mountTarget) {
        state.targetUnitId = null;
        state.targetSoldierId = null;
        state.targetPos = null;
        state.fireState = 'NO_TARGET';
        resetFireControlState(state.fireControl, 'NO_TARGET');
        continue;
      }
      const targetPosition = mountTarget.position;
      const desiredWorldYaw = Math.atan2(
        targetPosition.x - this.position.x,
        targetPosition.z - this.position.z
      );
      const desiredTurretYaw = wrapAngle(desiredWorldYaw - this.rotation);
      let alignmentError = mount.traverse === 'turret'
        ? wrapAngle(desiredTurretYaw - (this.vehicleWeapon?.turretYaw ?? 0))
        : wrapAngle(desiredWorldYaw - this.rotation);
      if (
        mount.kind === 'cannon'
        && mount.traverse === 'hull'
        && !aiming.shooterMoving
        && this.getVehicleMovementFactor() > 0
      ) {
        const traverseRate = Math.max(
          0,
          this.vehicleSpec.hullAimTraverseRadPerSecond ?? 0
        );
        const traverse = traverseRate * Math.max(0, aiming.deltaSeconds);
        this.rotation = wrapAngle(
          this.rotation
          + THREE.MathUtils.clamp(alignmentError, -traverse, traverse)
        );
        this.syncTransformPresentation();
        alignmentError = wrapAngle(desiredWorldYaw - this.rotation);
      }
      const targetKey = createFireControlTargetKey({
        targetUnitId: aiming.target?.id ?? this.targetUnit?.id ?? null,
        targetSoldierId: mountTarget.soldier?.id ?? null,
        targetPosition
      });
      const trueRangeMeters = this.position.distanceTo(targetPosition);
      state.targetUnitId = aiming.target?.id ?? this.targetUnit?.id ?? null;
      state.targetPos = targetPosition.toArray();
      state.targetMode = this.targetMode;
      const crewBusy = aiming.occupiedCrewRoles?.some(role => mount.crewRoles.includes(role));
      if (state.feedAmmo <= 0) {
        this.beginVehicleMountReload(mount.id, desiredAmmoType);
        continue;
      }
      const muzzlePosition = this.getVehicleMountMuzzleWorldPosition(mount.id);
      if (!muzzlePosition) {
        state.fireState = 'NO_MUZZLE';
        resetFireControlState(state.fireControl, 'NO_MUZZLE');
        continue;
      }
      const operational = this.isVehicleMountOperational(mount.id);
      const aligned = Math.abs(alignmentError) <= (mount.traverse === 'turret' ? 0.08 : 0.12);
      const alignmentPhase = mount.traverse === 'turret'
        ? 'TRAVERSING'
        : (mount.kind === 'cannon'
            && (this.vehicleSpec.hullAimTraverseRadPerSecond ?? 0) > 0
          ? 'SLEWING'
          : 'OUT OF ARC');
      const mountAim = advanceFireControlState(state.fireControl, {
        deltaSeconds: aiming.deltaSeconds,
        shooterKey: `${this.id}:${mount.id}`,
        targetKey,
        weapon,
        trueRangeMeters,
        platform: 'vehicle-mount',
        experience: this.experience,
        targetMoving: aiming.targetMoving,
        opticsStatus: this.vehicleComponents.optics?.status ?? 'OK',
        canAim: operational && aligned && !crewBusy && !aiming.shooterMoving,
        blockedPhase: crewBusy
          ? 'CREW_BUSY'
          : (!operational
              ? 'DISABLED'
              : (aiming.shooterMoving ? 'MOVING' : alignmentPhase))
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
      const cadenceRPM = getVehicleMountCadenceRPM({
        mount,
        state,
        weapon
      });
      const shotInterval = 60 / cadenceRPM
        * (this.vehicleComponents[mount.componentId].status === 'DAMAGED' ? 1.6 : 1);
      let emitted = 0;
      while (state.cooldown <= VEHICLE_MOUNT_CADENCE_EPSILON
          && state.feedAmmo > 0
          && emitted < MAX_VEHICLE_MOUNT_ROUNDS_PER_STEP) {
        const fired = context.combat.fireWeapon(this, aiming.target, targetPosition, {
          weapon,
          mountId: mount.id,
          targetSoldier: mountTarget.soldier,
          aimPoint: mountTarget.explicitAimPoint,
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
        if (state.loadedType && state.roundsFiredByType) {
          state.roundsFiredByType[state.loadedType] =
            (state.roundsFiredByType[state.loadedType] ?? 0) + 1;
        }
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
          burstComplete: weapon.magazineSize <= 1
        });
      }
      if (state.feedAmmo <= 0) {
        state.loadedType = mount.weapons ? null : state.loadedType;
        this.beginVehicleMountReload(mount.id, desiredAmmoType);
      }
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
      const crewman = this.getMountedCrew().find(candidate =>
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
        const crewman = this.getMountedCrew().find(candidate =>
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
      const candidates = this.getMountedCrew().filter(crewman => roles.includes(crewman.role));
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
    if (this.mesh.userData.transportHidden === true) {
      this.currentLOD = level;
      this.mesh.traverse(object => {
        if (object.isMesh && object.userData.lodBand !== 'ui') {
          object.visible = false;
        }
      });
      return level;
    }
    if (
      level === this.currentLOD
      && this.mesh.userData.requiresContinuousLODUpdate !== true
    ) {
      return level;
    }
    this.currentLOD = level;
    if (typeof this.mesh.userData.updateLOD === 'function') {
      this.mesh.userData.updateLOD(cameraPosition, level);
      this.syncVehicleTrackPresentation();
      return level;
    }
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
    this.syncVehicleTrackPresentation();
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
      recentFireActivitySeconds: this.recentFireActivitySeconds,
      suppression: this.suppression,
      fatigue: this.fatigue,
      stance: this.stance,
      isHiding: this.isHiding,
      holdFire: this.holdFire,
      isDeployed: this.isDeployed,
      vehicleCrewPosture: this.vehicleCrewPosture,
      mortarTeam: captureMortarTeamState(this.mortarTeamState),
      mortarFireMission: captureMortarFireMissionState(
        this.mortarFireMissionState
      ),
      mortarTargetOrder: captureMortarTargetOrder(this.mortarTargetOrder),
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
      targetAimIntent: captureVehicleAimIntent(this.targetAimIntent),
      targetMode: this.targetMode,
      vehicleEngagementLearning: captureVehicleEngagementLearningState(
        this.vehicleEngagementLearning
      ),
      ammo: { ...this.ammo },
      vehicleDamage: { ...this.vehicleDamage },
      vehicleComponents: Object.fromEntries(
        Object.entries(this.vehicleComponents).map(([id, component]) => [id, { ...component }])
      ),
      vehicleDamageState: createVehicleDamageState(this.vehicleDamageState),
      vehiclePhysics: this.vehiclePhysics
        ? captureVehiclePhysicsState(this.vehiclePhysics)
        : null,
      vehicleKinematics: this.vehicleKinematics
        ? captureVehicleKinematicsState(this.vehicleKinematics)
        : null,
      vehicleAI: this.vehicleAI ? this.vehicleAI.captureState() : null,
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
      vehicleTransportState: captureVehicleTransportState(
        this.vehicleTransportState
      ),
      transportAssignment: captureInfantryTransportAssignment(
        this.transportAssignment
      ),
      currentLOD: this.currentLOD,
      infantryBuddyBounds:
        this.infantryBuddyBounds?.captureState() ?? null,
      dangerMap:
        this.soldierAI?.dangerMap.captureState() ?? null,
      roster: this.soldierAI
        ? this.soldierAI.captureRoster()
        : this.roster.map(soldier => ({
            ...soldier,
            ...(soldier.vehicleLocation
              ? { vehicleLocation: { ...soldier.vehicleLocation } }
              : {})
          }))
    };
  }

  restoreState(state, unitMap) {
    this.infantryBuddyBounds?.restoreState(
      state.infantryBuddyBounds,
      Array.isArray(state.roster)
        ? state.roster.map(soldier => soldier.id)
        : []
    );
    this.position.fromArray(state.position);
    this.rotation = state.rotation;
    this.morale = state.morale;
    this.recentFireActivitySeconds = Number.isFinite(
      state.recentFireActivitySeconds
    )
      ? Math.max(0, state.recentFireActivitySeconds)
      : 0;
    this.suppression = state.suppression;
    this.fatigue = state.fatigue;
    this.stance = state.stance;
    this.isHiding = state.isHiding;
    this.holdFire = Boolean(state.holdFire);
    this.isDeployed = state.isDeployed;
    this.vehicleCrewPosture = this.vehicleSpec
      ? (state.vehicleCrewPosture === 'UNBUTTONED'
          ? 'UNBUTTONED'
          : 'BUTTONED')
      : null;
    if (this.mortarTeamConfig) {
      this.mortarTeamState = state.mortarTeam
        ? restoreMortarTeamState(this.mortarTeamConfig, state.mortarTeam)
        : createMortarTeamState(this.mortarTeamConfig);
      this.mortarFireMissionState = state.mortarFireMission
        ? restoreMortarFireMissionState(
            this.mortarFireMissionConfig,
            state.mortarFireMission
          )
        : createMortarFireMissionState(this.mortarFireMissionConfig);
      this.mortarTargetOrder = restoreMortarTargetOrder(
        state.mortarTargetOrder
      );
      this.syncMortarDeploymentCompatibility();
    }
    this.currentWaypointIndex = state.currentWaypointIndex;
    this.waypoints = state.waypoints.map(waypoint => ({
      ...waypoint,
      position: new THREE.Vector3().fromArray(waypoint.position)
    }));
    this.targetUnit = state.targetUnitId ? unitMap.get(state.targetUnitId) ?? null : null;
    this.targetPos = state.targetPos ? new THREE.Vector3().fromArray(state.targetPos) : null;
    this.targetAimIntent = captureVehicleAimIntent(
      state.targetAimIntent ?? null
    );
    this.targetMode = state.targetMode;
    this.vehicleEngagementLearning = this.vehicleSpec
      ? createVehicleEngagementLearningState(state.vehicleEngagementLearning)
      : null;
    this.ammo = { ...state.ammo };
    this.vehicleDamage = { ...this.vehicleDamage, ...state.vehicleDamage };
    this.vehicleComponents = createVehicleComponents(this.vehicleSpec, state.vehicleComponents);
    this.vehicleDamageState = createVehicleDamageState(state.vehicleDamageState);
    this.vehiclePhysics = this.vehicleSpec
      ? createVehiclePhysicsState(state.vehiclePhysics)
      : null;
    this.vehicleKinematics = this.vehicleSpec
      ? createVehicleKinematicsState(state.vehicleKinematics)
      : null;
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
    this.vehicleTransportState = createVehicleTransportState(
      this.vehicleSpec?.transport,
      state.vehicleTransportState
    );
    this.transportAssignment = restoreInfantryTransportAssignment(
      state.transportAssignment
    );
    if (this.vehicleDamageState.secondaryExplosion) this.applyVehicleCookoffConsequences();
    this.currentLOD = null;
    if (this.soldierAI) {
      // Read-only migration compatibility for legacy snapshots storing dangerMapState on roster[0]
      const dangerState = state.dangerMap ?? state.roster?.[0]?.dangerMapState ?? null;
      this.soldierAI.restoreState({
        dangerMap: dangerState,
        roster: state.roster
      });
    } else {
      this.roster = state.roster.map(soldier => ({
        ...soldier,
        ...(soldier.vehicleLocation
          ? { vehicleLocation: { ...soldier.vehicleLocation } }
          : {})
      }));
    }
    this.syncTransformPresentation();
    this.syncVehicleWeaponPresentation();
    this.syncVehicleTrackPresentation();
    this.syncMortarVisuals(0, true);
    this.updateStanceVisuals();
    this.syncLegacyVehicleDamage();
    this.syncStructureVisuals();
    this.syncStructureCollision();
    if (this.vehicleAI && state.vehicleAI) this.vehicleAI.restoreState(state.vehicleAI);
    this.refreshAmmoSummary();
    this.syncVehicleCommanderPresentation();
    this.syncTransportCrewPresentation();
    this.setTransportPresentation(this.isTransported());
  }

  updateStanceVisuals() {
    this.soldierAI?.applySquadStance();
  }

  reconcileBuddyBoundObservation(hasDirectPrecisionObservation) {
    const activeOrderType =
      this.waypoints[this.currentWaypointIndex]?.orderType ?? null;
    if (hasDirectPrecisionObservation
        || activeOrderType === 'ASSAULT'
        || !this.infantryBuddyBounds) {
      return false;
    }
    this.infantryBuddyBounds.reset();
    this.soldierAI?.clearBuddyBoundDiagnostics();
    return true;
  }

  isControllable() {
    if (this.soldierAI) {
      const living = this.soldierAI.getLivingAgents().filter(agent =>
        !UNAVAILABLE_INFANTRY_STATUSES.has(agent.status)
        && agent.status !== 'SURRENDERED'
        && agent.state !== 'SURRENDERED'
      );
      if (living.length === 0) return false;
    } else if (this.vehicleSpec) {
      const living = this.roster.filter(crewman =>
        (crewman.health ?? 100) > 0
        && !UNAVAILABLE_INFANTRY_STATUSES.has(crewman.status)
        && crewman.status !== 'SURRENDERED'
        && crewman.state !== 'SURRENDERED'
      );
      if (living.length === 0) return false;
    }
    if (this.vehicleDamageState?.destroyed) return false;
    if (this.structureState?.destroyed) return false;
    return true;
  }

  areLivingInfantryAtFormation(orderType, tolerance = 0.75) {
    if (!this.soldierAI) return true;
    const cosine = Math.cos(this.rotation);
    const sine = Math.sin(this.rotation);
    const toleranceSquared = tolerance * tolerance;
    for (const agent of this.soldierAI.getLivingAgents()) {
      if (UNAVAILABLE_INFANTRY_STATUSES.has(agent.status)) continue;
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
    const {
      haltMovement = false,
      hasDirectPrecisionObservation = false,
      dynamicVehicleColliders = []
    } = options;
    this.recentFireActivitySeconds = Math.max(
      0,
      this.recentFireActivitySeconds
        - Math.max(0, Number.isFinite(delta) ? delta : 0)
    );
    if (this.transportAssignment?.phase === 'BOARDING') {
      for (const agent of this.soldierAI?.agents ?? []) {
        agent.velocity.set(0, 0, 0);
        agent.reloadTimer = 0;
        agent.burstRemaining = 0;
        agent.targetUnitId = null;
        agent.targetSoldierId = null;
        agent.syncRecord();
      }
      this.setTransportPresentation(false);
      return;
    }
    if (this.isTransported()) {
      for (const agent of this.soldierAI?.agents ?? []) {
        agent.velocity.set(0, 0, 0);
        agent.reloadTimer = 0;
        agent.burstRemaining = 0;
        agent.targetUnitId = null;
        agent.targetSoldierId = null;
        agent.syncRecord();
      }
      this.setTransportPresentation(true);
      return;
    }
    if (this.mortarTeamState) {
      advanceMortarTeamState(this.mortarTeamState, Math.max(0, delta));
      if (
        this.mortarTargetOrder
        && this.mortarTeamState.deploymentState === 'READY'
      ) {
        advanceMortarTargetOrder(
          this.mortarTargetOrder,
          Math.max(0, delta)
        );
      }
      this.syncMortarDeploymentCompatibility();
      this.syncMortarVisuals(Math.max(0, delta));
    }
    if (
      this.type === 'infantry_squad'
      && (this.suppression > 0 || this.morale !== 'OK')
    ) {
      let recentIncomingFireSeconds = 0;
      for (const agent of this.soldierAI?.agents ?? []) {
        if (!agent.isAlive) continue;
        recentIncomingFireSeconds = Math.max(
          recentIncomingFireSeconds,
          agent.record.incomingFireTimer ?? 0
        );
      }
      const previousMorale = this.morale;
      const advancedSuppression = advanceInfantryUnitSuppression(
        {
          suppression: this.suppression,
          morale: this.morale
        },
        Math.max(0, delta),
        recentIncomingFireSeconds
      );
      this.suppression = advancedSuppression.suppression;
      this.morale = advancedSuppression.morale;
      if (this.morale === 'Pinned' || this.morale === 'Broken') {
        this.stance = 'PRONE';
      } else if (this.morale === 'Shaken') {
        this.stance = 'KNEELING';
      } else if (
        previousMorale !== 'OK'
        && !this.isHiding
        && !this.isDeployed
      ) {
        this.stance = 'STANDING';
      }
    } else if (this.suppression > 0) {
      this.suppression = Math.max(0, this.suppression - delta * 4.0);
      if (this.vehicleSpec) {
        if (this.suppression > 75) this.morale = 'Broken';
        else if (this.suppression > 45) this.morale = 'Pinned';
        else if (this.suppression > 20) this.morale = 'Shaken';
        else this.morale = 'OK';
      } else if (this.suppression < 15 && this.morale === 'Pinned') {
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
      const moraleStopsMovement = this.type === 'infantry_squad'
        && (this.morale === 'Pinned' || this.morale === 'Broken');
      const hullGunLayingStopsMovement = Boolean(
        this.vehicleSpec
        && (this.targetUnit || this.targetPos)
        && (this.vehicleSpec.weaponMounts ?? []).some(mount =>
          mount.kind === 'cannon'
          && mount.traverse === 'hull'
          && mount.targetModes?.includes(this.targetMode)
        )
      );
      if (!haltMovement && movementFactor > 0
        && !moraleStopsMovement
        && !hullGunLayingStopsMovement
        && !this.isDeployed) {
        const vehicleSpeeds = this.vehicleSpec?.movementMps;
        let speed = vehicleSpeeds?.[targetWp.orderType] ?? 3.5;
        if (!vehicleSpeeds) {
          const infantryMovementProfile = getInfantryMovementOrderProfile(
            targetWp.orderType
          );
          if (infantryMovementProfile) {
            speed = infantryMovementProfile.anchorSpeedMetersPerSecond;
          } else if (targetWp.orderType === 'FAST') speed = 5.5;
          else if (targetWp.orderType === 'HUNT') speed = 2.2;
          else if (targetWp.orderType === 'MOVE') speed = 2.5;
        }

        speed *= movementFactor;
        if (this.soldierAI) {
          speed = Math.min(
            speed,
            this.soldierAI.getAnchorSpeedLimit(
              activeOrderType,
              { hasDirectPrecisionObservation }
            )
          );
          speed *= this.soldierAI.getAnchorCohesionScale(
            activeOrderType,
            { hasDirectPrecisionObservation }
          );
        }
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
            const nextWaypoint = this.waypoints[this.currentWaypointIndex + 1];
            if (nextWaypoint) {
              const nextX = nextWaypoint.position.x - this.position.x;
              const nextZ = nextWaypoint.position.z - this.position.z;
              if (Math.hypot(nextX, nextZ) > 1e-5) {
                // Reform for the outbound leg before accepting an intermediate
                // route point. Keeping the inbound facing can strand outer
                // soldiers against an abutment or other narrow corner while
                // the squad anchor waits for an impossible formation.
                this.rotation = Math.atan2(nextX, nextZ);
                this.mesh.rotation.y = this.rotation;
              }
            }
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
          const desiredRotation = Math.atan2(dir.x, dir.z);
          const previousRotation = this.rotation;
          const isReverseOrder = activeOrderType === 'REVERSE'
            || activeOrderType === 'MOVE_REVERSE'
            || Boolean(this.vehicleAI?.isReversing);
          const vehicleMotion = this.vehicleSpec
            ? (isReverseOrder
                ? planVehicleReverseStep({
                    vehicleSpec: this.vehicleSpec,
                    currentYaw: this.rotation,
                    currentPosition: this.position,
                    targetPosition: routeTarget,
                    speedMetersPerSecond: speed,
                    deltaSeconds: delta
                  })
                : planVehicleKinematicStep({
                    vehicleSpec: this.vehicleSpec,
                    currentYaw: this.rotation,
                    desiredYaw: desiredRotation,
                    speedMetersPerSecond: speed,
                    targetDistanceMeters: dist,
                    deltaSeconds: delta
                  }))
            : null;
          const movementRotation = vehicleMotion?.yaw ?? desiredRotation;
          const intendedDistance = vehicleMotion?.intendedDistanceMeters
            ?? Math.min(dist, speed * Math.max(0, delta));
          const displacement = vehicleMotion?.displacement ?? {
            x: dir.x * intendedDistance,
            z: dir.z * intendedDistance
          };
          let resolved;
          if (this.collisionWorld && this.vehicleSpec) {
            const collisionOptions = {
              moverType: 'vehicle',
              radius: this.collisionRadius,
              offsets: this.collisionOffsets,
              rotation: movementRotation,
              transientColliders: dynamicVehicleColliders
            };
            // Reverse plans retain a signed travel distance for track and
            // replay accounting. Collision damage consumes speed magnitude.
            const impactSpeed = Math.abs(intendedDistance) / Math.max(delta, 1e-9);
            const impactMass = estimateVehicleCrushMassTonnes(this.vehicleSpec);
            // Long footprints can cross several independently owned panels in
            // one fixed step. Destroy qualifying panels in stable collider
            // order, then resolve the original displacement again.
            for (let pass = 0; pass < 8; pass++) {
              resolved = this.collisionWorld.resolveFootprintMotion(
                this.position,
                displacement,
                collisionOptions
              );
              const colliderIds = [...new Set(
                resolved.contacts.map(contact => contact.colliderId)
              )].sort((left, right) => left.localeCompare(right));
              let removedPanel = false;
              for (const colliderId of colliderIds) {
                const result = terrain.applyVehicleImpactToLinearObstacle?.({
                  colliderId,
                  massTonnes: impactMass,
                  speedMetersPerSecond: impactSpeed,
                  vehicleId: this.id
                });
                if (result?.destroyed) removedPanel = true;
              }
              if (!removedPanel) break;
            }
          } else if (this.collisionWorld) {
            resolved = this.collisionWorld.resolveCircleMotion(
              this.position,
              displacement,
              this.collisionRadius,
              {
                moverType: 'infantry',
                traverseColliderTypes: canInfantryVaultFence(activeOrderType)
                  ? ['fence']
                  : []
              }
            );
          } else {
            resolved = {
              x: this.position.x + displacement.x,
              z: this.position.z + displacement.z,
              movedX: displacement.x,
              movedZ: displacement.z
            };
          }
          this.position.x = resolved.x;
          this.position.z = resolved.z;
          const anchorDisplaced = Math.hypot(resolved.movedX, resolved.movedZ) > 1e-5;
          // A blocked infantry anchor still represents an active order.
          // Soldiers must continue resolving their individual routes instead
          // of freezing because the invisible squad center touched a wall.
          anchorMoving = this.soldierAI ? true : anchorDisplaced;
          if (this.vehicleSpec) {
            this.rotation = movementRotation;
            recordResolvedVehicleTravel(this.vehicleKinematics, {
              vehicleSpec: this.vehicleSpec,
              previousYaw: previousRotation,
              nextYaw: this.rotation,
              movedX: resolved.movedX,
              movedZ: resolved.movedZ,
              components: this.vehicleComponents
            });
          } else if (anchorDisplaced) {
            this.rotation = desiredRotation;
          }

          this.position.y = terrain.getMovementHeightAt
            ? terrain.getMovementHeightAt(this.position.x, this.position.z)
            : terrain.getHeightAt(this.position.x, this.position.z);

          this.mesh.position.copy(this.position);
          this.mesh.rotation.y = this.rotation;
          this.syncVehicleTrackPresentation();
        }
      }
    }

    const activeVehicleWaypoint = this.waypoints[this.currentWaypointIndex] ?? null;
    this.vehicleAI?.update(delta, terrain, {
      ...options,
      orderType: activeVehicleWaypoint?.orderType ?? null,
      targetPosition: activeVehicleWaypoint?.position ?? null
    });
    this.syncVehicleWeaponPresentation();
    this.updateVehiclePhysics(delta, terrain);
    this.syncVehicleCommanderPresentation();

    this.soldierAI?.update(delta, terrain, {
      anchorMoving,
      orderType: activeOrderType,
      hasDirectPrecisionObservation,
      haltAnchorMovement: haltMovement,
      syncPresentation: options.syncPresentation
    });
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
