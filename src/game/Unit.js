import * as THREE from 'three';
import { UnitFactory } from '../world/UnitFactory.js';
import { SoldierAI } from './SoldierAI.js';
import { getVehicle, vehicleIdForFaction } from './VehicleCatalog.js';
import { getWeapon } from './WeaponCatalog.js';

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export class Unit {
  constructor(config) {
    this.id = config.id || `unit_${Math.floor(Math.random() * 10000)}`;
    this.name = config.name || 'French Infantry Squad';
    this.faction = config.faction || 'french'; // 'french' or 'german'
    this.type = config.type || 'infantry_squad'; // 'infantry_squad', 'tank', 'bunker'
    this.vehicleId = config.vehicleId
      ?? (this.type === 'tank' ? vehicleIdForFaction(this.faction) : null);
    this.vehicleSpec = getVehicle(this.vehicleId);

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
    this.squadSize = config.squadSize || this.vehicleSpec?.crew.length || (this.type === 'tank' ? 3 : 6);
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
    this.vehicleWeapon = this.vehicleSpec ? this.initVehicleWeapon(config.vehicleWeapon) : null;
    this.currentLOD = 'high';

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
      return {
        ...state,
        ammunition: { ...state.ammunition }
      };
    }
    const initialType = 'ap';
    const ammunition = { ...this.vehicleSpec.ammunition };
    ammunition[initialType] = Math.max(0, ammunition[initialType] - 1);
    return {
      loadedType: initialType,
      pendingType: initialType,
      ammunition,
      reloadTimer: 0,
      cooldown: 0,
      recoilTimer: 0,
      turretYaw: 0,
      roundsFired: 0
    };
  }

  initMesh() {
    if (this.type === 'tank') {
      this.mesh = UnitFactory.createTankMesh(
        this.faction === 'french' ? 'fr_somua' : 'ger_panzer3'
      );
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
    if (this.type === 'tank') {
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
        + (this.vehicleWeapon.loadedType === 'ap' ? 1 : 0);
      this.ammo.he = this.vehicleWeapon.ammunition.he
        + (this.vehicleWeapon.loadedType === 'he' ? 1 : 0);
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
      && this.vehicleDamage.gun === 'OK'
      && this.vehicleDamage.turret !== 'DESTROYED';
  }

  hasOperationalLoader() {
    return Boolean(this.vehicleSpec)
      && this.isCrewRoleAlive(this.vehicleSpec.loaderRoles)
      && this.vehicleDamage.gun === 'OK';
  }

  getMuzzleWorldPosition() {
    const muzzle = this.mesh?.userData.muzzle;
    if (muzzle) {
      this.mesh.updateWorldMatrix(true, true);
      return muzzle.getWorldPosition(new THREE.Vector3());
    }
    return this.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  }

  beginVehicleReload(ammoType = 'ap') {
    if (!this.vehicleWeapon || this.vehicleWeapon.loadedType || this.vehicleWeapon.reloadTimer > 0) return false;
    if (!this.hasOperationalLoader() || (this.vehicleWeapon.ammunition[ammoType] ?? 0) <= 0) return false;
    this.vehicleWeapon.pendingType = ammoType;
    this.vehicleWeapon.reloadTimer = getWeapon(this.vehicleSpec.mainGun[ammoType]).reloadSeconds;
    return true;
  }

  updateVehicleSystems(delta) {
    if (!this.vehicleWeapon) return;
    this.vehicleWeapon.cooldown = Math.max(0, this.vehicleWeapon.cooldown - delta);
    this.vehicleWeapon.recoilTimer = Math.max(0, (this.vehicleWeapon.recoilTimer ?? 0) - delta);
    const barrel = this.mesh?.userData.barrel;
    if (barrel) {
      const restZ = barrel.userData.restZ ?? barrel.position.z;
      barrel.userData.restZ = restZ;
      const recoil = THREE.MathUtils.clamp(this.vehicleWeapon.recoilTimer / 0.18, 0, 1);
      barrel.position.z = restZ - Math.sin(recoil * Math.PI) * 0.16;
    }
    if (this.vehicleWeapon.reloadTimer > 0 && this.hasOperationalLoader()) {
      this.vehicleWeapon.reloadTimer = Math.max(0, this.vehicleWeapon.reloadTimer - delta);
      if (this.vehicleWeapon.reloadTimer === 0) {
        const type = this.vehicleWeapon.pendingType;
        if ((this.vehicleWeapon.ammunition[type] ?? 0) > 0) {
          this.vehicleWeapon.ammunition[type]--;
          this.vehicleWeapon.loadedType = type;
        }
      }
    }
    this.refreshAmmoSummary();
  }

  canVehicleFire() {
    return Boolean(
      this.vehicleWeapon?.loadedType
      && this.vehicleWeapon.cooldown <= 0
      && this.hasOperationalGunner()
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
    const yawError = wrapAngle(desiredTurretYaw - this.vehicleWeapon.turretYaw);
    const traverse = this.vehicleSpec.turretTraverseRadPerSecond * delta;
    this.vehicleWeapon.turretYaw = wrapAngle(
      this.vehicleWeapon.turretYaw + THREE.MathUtils.clamp(yawError, -traverse, traverse)
    );
    if (this.mesh?.userData.turret) {
      this.mesh.userData.turret.rotation.y = this.vehicleWeapon.turretYaw;
    }

    const desiredAmmoType = target?.type === 'tank' ? 'ap' : 'he';
    if (!this.vehicleWeapon.loadedType) {
      this.beginVehicleReload(desiredAmmoType);
      return false;
    }
    if (!this.canVehicleFire() || Math.abs(yawError) > 0.06) return false;

    const weapon = getWeapon(this.vehicleSpec.mainGun[this.vehicleWeapon.loadedType]);
    const experienceDispersion = { Green: 1.45, Regular: 1.15, Veteran: 0.9, Crack: 0.76 };
    const fired = context.combat.fireWeapon(this, target, targetPosition, {
      weapon,
      muzzlePosition: this.getMuzzleWorldPosition(),
      dispersionScale: experienceDispersion[this.experience] ?? 1.15
    });
    if (!fired) return false;

    this.vehicleWeapon.loadedType = null;
    this.vehicleWeapon.cooldown = 60 / weapon.practicalRPM;
    this.vehicleWeapon.recoilTimer = 0.18;
    this.vehicleWeapon.roundsFired++;
    this.beginVehicleReload(desiredAmmoType);
    return true;
  }

  applyArmorHit(result) {
    if (!result.penetrated) {
      if (result.weapon?.kind?.startsWith('cannon') && result.random() < 0.08) {
        this.vehicleDamage.tracks = 'DAMAGED';
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

    if (result.zone.startsWith('turret_') && result.random() < 0.35) {
      this.vehicleDamage.gun = 'DESTROYED';
    } else if (result.zone === 'hull_rear' && result.random() < 0.55) {
      this.vehicleDamage.engine = 'DESTROYED';
    } else if (result.zone === 'hull_side' && result.random() < 0.28) {
      this.vehicleDamage.tracks = 'DESTROYED';
    }
    if (this.getLivingCrew().length === 0) this.vehicleDamage.hull = 'DESTROYED';
    return { penetrated: true, casualty: crewman, damage: this.vehicleDamage };
  }

  updateLOD(cameraPosition, qualityTier = 'high') {
    if (!this.mesh || !cameraPosition) return this.currentLOD;
    const distance = cameraPosition.distanceTo(this.position);
    const thresholds = qualityTier === 'low'
      ? { high: 22, medium: 62 }
      : { high: 48, medium: 120 };
    const level = distance < thresholds.high
      ? 'high'
      : (distance < thresholds.medium ? 'medium' : 'low');
    if (level === this.currentLOD) return level;
    this.currentLOD = level;
    this.mesh.traverse(object => {
      if (!object.isMesh) return;
      const band = object.userData.lodBand;
      if (!band || band === 'ui') return;
      if (band === 'proxy') object.visible = level === 'low';
      else if (level === 'low') object.visible = false;
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
      vehicleWeapon: this.vehicleWeapon
        ? { ...this.vehicleWeapon, ammunition: { ...this.vehicleWeapon.ammunition } }
        : null,
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
    if (state.vehicleWeapon) this.vehicleWeapon = this.initVehicleWeapon(state.vehicleWeapon);
    this.currentLOD = null;
    if (this.soldierAI) this.soldierAI.restoreRoster(state.roster);
    else this.roster = state.roster.map(soldier => ({ ...soldier }));
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;
    this.updateStanceVisuals();
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

    let anchorMoving = false;
    let activeOrderType = 'QUICK';
    if (this.waypoints.length > 0 && this.currentWaypointIndex < this.waypoints.length) {
      const targetWp = this.waypoints[this.currentWaypointIndex];
      activeOrderType = targetWp.orderType;

      const driverOperational = !this.vehicleSpec || this.isCrewRoleAlive(['DRIVER']);
      if (!haltMovement && driverOperational && this.vehicleDamage.engine !== 'DESTROYED'
        && this.vehicleDamage.tracks !== 'DESTROYED'
        && this.morale !== 'Pinned' && this.morale !== 'Broken' && !this.isDeployed) {
        let speed = 3.5;
        if (targetWp.orderType === 'FAST') speed = 5.5;
        else if (targetWp.orderType === 'HUNT') speed = 2.2;
        else if (targetWp.orderType === 'MOVE') speed = 2.5;

        const dir = new THREE.Vector3().subVectors(targetWp.position, this.position);
        dir.y = 0;
        const dist = dir.length();

        if (dist < 0.8) {
          if (targetWp.remainingPause > 0) {
            targetWp.remainingPause = Math.max(0, targetWp.remainingPause - delta);
          } else {
            targetWp.reached = true;
            this.currentWaypointIndex++;
          }
        } else {
          anchorMoving = true;
          dir.normalize();
          this.position.addScaledVector(dir, speed * delta);
          this.rotation = Math.atan2(dir.x, dir.z);

          this.position.y = terrain.getHeightAt(this.position.x, this.position.z);

          this.mesh.position.copy(this.position);
          this.mesh.rotation.y = this.rotation;
        }
      }
    }

    this.soldierAI?.update(delta, terrain, { anchorMoving, orderType: activeOrderType });
    if (!this.soldierAI) this.updateStanceVisuals();
  }
}
