import * as THREE from 'three';
import { SoldierAgent } from './SoldierAgent.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchGoal = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchOther = new THREE.Vector3();
const scratchVelocity = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchOffset = new THREE.Vector3();
const scratchSeparation = new THREE.Vector3();

function hash01(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function copySoldier(soldier) {
  return {
    ...soldier,
    worldPosition: [...soldier.worldPosition],
    velocity: [...soldier.velocity],
    slotOffset: [...soldier.slotOffset]
  };
}

export class SoldierAI {
  constructor(unit) {
    this.unit = unit;
    this.debugLines = null;
    this.initialize();
  }

  initialize() {
    const meshes = this.unit.mesh?.userData.soldiers ?? [];
    this.unit.roster.forEach((soldier, index) => {
      const mesh = meshes[index];
      const slotOffset = mesh?.userData.slotOffset ?? this.getFormationOffset(index, 'QUICK').toArray();
      scratchPosition
        .fromArray(slotOffset)
        .applyAxisAngle(UP, this.unit.rotation)
        .add(this.unit.position);

      const variation = hash01(`${this.unit.id}:${soldier.id}`);
      Object.assign(soldier, {
        role: soldier.role ?? this.getRole(soldier.weapon),
        health: soldier.health ?? 100,
        suppression: soldier.suppression ?? 0,
        stance: soldier.stance ?? 'STANDING',
        state: soldier.state ?? 'READY',
        worldPosition: soldier.worldPosition ?? scratchPosition.toArray(),
        velocity: soldier.velocity ?? [0, 0, 0],
        facing: soldier.facing ?? this.unit.rotation,
        reactionDelay: soldier.reactionDelay ?? variation * 0.65,
        pace: soldier.pace ?? 0.9 + variation * 0.2,
        stridePhase: soldier.stridePhase ?? variation * Math.PI * 2,
        fireCooldown: soldier.fireCooldown ?? variation * 1.4,
        slotOffset: soldier.slotOffset ?? [...slotOffset],
        commandWaypoint: soldier.commandWaypoint ?? -1,
        status: soldier.status ?? 'OK'
      });
      if (mesh) mesh.userData.soldierId = soldier.id;
    });
    this.agents = this.unit.roster.map((soldier, index) =>
      new SoldierAgent(this.unit, soldier, meshes[index], index)
    );
    this.syncMeshes();
  }

  getRole(weapon) {
    if (/FM 24\/29|MG34/.test(weapon)) return 'GUNNER';
    if (/MAS-38|MP40/.test(weapon)) return 'LEADER';
    return 'RIFLEMAN';
  }

  getFormationOffset(index, orderType = 'QUICK') {
    if (orderType === 'FAST') {
      return new THREE.Vector3(index % 2 === 0 ? -0.48 : 0.48, 0, -Math.floor(index / 2) * 1.2);
    }
    if (orderType === 'HUNT') {
      const huntSlots = [
        [0, 0],
        [-1.25, -1.25],
        [1.25, -1.25],
        [-2.2, -2.5],
        [0, -2.5],
        [2.2, -2.5]
      ];
      const slot = huntSlots[index] ?? [((index % 3) - 1) * 1.35, -Math.floor(index / 3) * 1.5];
      return new THREE.Vector3(slot[0], 0, slot[1]);
    }
    return new THREE.Vector3(((index % 3) - 1) * 1.35, 0, (Math.floor(index / 3) - 0.5) * 1.7);
  }

  update(delta, terrain, context = {}) {
    const { anchorMoving = false, orderType = 'QUICK' } = context;
    for (let index = 0; index < this.agents.length; index++) {
      const agent = this.agents[index];
      const formationOffset = this.getFormationOffset(index, orderType);
      agent.slotOffset.copy(formationOffset);
      const goal = scratchGoal
        .copy(formationOffset)
        .applyAxisAngle(UP, this.unit.rotation)
        .add(this.unit.position)
        .clone();
      goal.y = terrain.getHeightAt(goal.x, goal.z);
      agent.updateMovement(delta, terrain, {
        anchorMoving,
        orderType,
        goal,
        neighbors: this.agents,
        squadPinned: this.unit.morale === 'Pinned' || this.unit.morale === 'Broken',
        waypointIndex: this.unit.currentWaypointIndex
      });
    }

    this.syncMeshes();
  }

  updateCombat(delta, context) {
    for (const agent of this.agents) agent.updateCombat(delta, context);
    this.syncMeshes();
  }

  syncMeshes() {
    const meshes = this.unit.mesh?.userData.soldiers ?? [];
    this.unit.roster.forEach((soldier, index) => {
      const mesh = meshes[index];
      if (!mesh) return;
      scratchPosition.fromArray(soldier.worldPosition).sub(this.unit.position).applyAxisAngle(UP, -this.unit.rotation);
      mesh.position.copy(scratchPosition);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = soldier.facing - this.unit.rotation;
      this.applyPose(mesh, soldier);
    });
    for (let index = this.unit.roster.length; index < meshes.length; index++) {
      meshes[index].visible = false;
    }
    this.updateDebug();
  }

  setDebug(enabled) {
    if (!enabled) {
      if (this.debugLines) this.debugLines.visible = false;
      return;
    }
    if (!this.debugLines) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(this.unit.roster.length * 6), 3)
      );
      this.debugLines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true, opacity: 0.85 })
      );
      this.debugLines.name = 'SoldierFormationDebug';
      this.debugLines.renderOrder = 20;
      this.unit.mesh.add(this.debugLines);
    }
    this.debugLines.visible = true;
    this.updateDebug();
  }

  updateDebug() {
    if (!this.debugLines?.visible) return;
    const positions = this.debugLines.geometry.attributes.position;
    const meshes = this.unit.mesh.userData.soldiers ?? [];
    this.unit.roster.forEach((soldier, index) => {
      const meshPosition = meshes[index]?.position ?? scratchPosition.set(0, 0, 0);
      positions.setXYZ(index * 2, meshPosition.x, meshPosition.y + 0.08, meshPosition.z);
      positions.setXYZ(index * 2 + 1, soldier.slotOffset[0], 0.08, soldier.slotOffset[2]);
    });
    positions.needsUpdate = true;
    this.debugLines.geometry.computeBoundingSphere();
  }

  applyPose(mesh, soldier) {
    const parts = mesh.userData.parts;
    if (!parts) return;

    mesh.visible = true;
    mesh.rotation.x = 0;
    const speed = scratchVelocity.fromArray(soldier.velocity).length();
    const stride = Math.sin(soldier.stridePhase);
    const gait = Math.min(0.72, speed * 0.18);

    parts.leftLeg.rotation.x = stride * gait;
    parts.rightLeg.rotation.x = -stride * gait;
    parts.leftArm.rotation.x = -0.82 - stride * gait * 0.45;
    parts.rightArm.rotation.x = -0.72 + stride * gait * 0.45;
    parts.weapon.rotation.x = -0.16 + Math.abs(stride) * gait * 0.08;
    parts.weapon.rotation.z = -0.08;
    parts.weapon.position.set(0.15, 1.36, 0.35);

    if (soldier.state === 'AIMING' || soldier.state === 'OBSERVING') {
      parts.leftArm.rotation.x = -1.02;
      parts.rightArm.rotation.x = -0.9;
      parts.weapon.rotation.x = -0.04;
    }

    if (soldier.state === 'RELOADING') {
      const reloadMotion = Math.sin((soldier.reloadTimer ?? 0) * 4.5);
      parts.leftArm.rotation.x = -0.55 + reloadMotion * 0.16;
      parts.rightArm.rotation.x = -0.42 - reloadMotion * 0.12;
      parts.weapon.rotation.x = 0.3;
      parts.weapon.rotation.z = 0.24;
      parts.weapon.position.y = 1.22;
    } else if ((soldier.recoilTime ?? 0) > 0) {
      const recoil = THREE.MathUtils.clamp(soldier.recoilTime / 0.12, 0, 1);
      parts.weapon.position.z -= recoil * 0.09;
      parts.rightArm.rotation.x += recoil * 0.08;
    }

    if (soldier.stance === 'PRONE') {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y += 0.2;
      parts.leftLeg.rotation.x = 0.12;
      parts.rightLeg.rotation.x = -0.12;
    } else if (soldier.stance === 'KNEELING') {
      mesh.position.y -= 0.34;
      parts.leftLeg.rotation.x = -1.15;
      parts.rightLeg.rotation.x = -0.3;
      parts.leftArm.rotation.x = -0.96;
      parts.rightArm.rotation.x = -0.84;
    }

    if (soldier.status === 'KIA') {
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = (hash01(`${this.unit.id}:${soldier.id}:casualty`) - 0.5) * 0.65;
      mesh.position.y += 0.12;
    }
  }

  applySquadStance() {
    for (const agent of this.agents) {
      if (agent.isAlive && agent.suppression < 58) {
        agent.stance = this.unit.stance;
        agent.syncRecord();
      }
    }
    this.syncMeshes();
  }

  getLivingSoldiers() {
    return this.getLivingAgents().map(agent => agent.record);
  }

  getLivingAgents() {
    return this.agents.filter(agent => agent.isAlive);
  }

  getReadyShooters() {
    return this.getLivingAgents().filter(agent =>
      agent.fireCooldown <= 0
      && agent.suppression < 58
      && agent.state !== 'MOVING'
      && agent.state !== 'REACTING'
    );
  }

  getWorldPosition(soldierId) {
    return this.agents.find(agent => agent.id === soldierId)?.position.clone() ?? this.unit.position.clone();
  }

  chooseTarget(random) {
    const living = this.getLivingAgents();
    if (living.length === 0) return null;
    return living[Math.min(living.length - 1, Math.floor(random() * living.length))].record;
  }

  applyHit(soldierId, lethality, random) {
    const living = this.getLivingAgents();
    const agent = living.find(candidate => candidate.id === soldierId) ?? living[0];
    if (!agent) return null;
    const damage = random() < lethality ? 120 : 45;
    agent.applyDamage(damage, 42);
    const casualtyRatio = 1 - this.getLivingAgents().length / Math.max(1, this.unit.roster.length);
    this.unit.applySuppression(10 + casualtyRatio * 28);
    this.syncMeshes();
    return agent.record;
  }

  applyDamage(soldierId, damage, suppression = 35) {
    const living = this.getLivingAgents();
    const agent = living.find(candidate => candidate.id === soldierId) ?? living[0];
    if (!agent) return null;
    agent.applyDamage(damage, suppression);
    const casualtyRatio = 1 - this.getLivingAgents().length / Math.max(1, this.agents.length);
    this.unit.applySuppression(8 + casualtyRatio * 24);
    this.syncMeshes();
    return agent.record;
  }

  captureRoster() {
    return this.agents.map(agent => agent.capture());
  }

  restoreRoster(roster) {
    if (roster.length !== this.agents.length) {
      this.unit.roster = roster.map(copySoldier);
      this.initialize();
      return;
    }
    roster.forEach((state, index) => this.agents[index].restore(state));
    this.unit.roster = this.agents.map(agent => agent.record);
    this.syncMeshes();
  }
}
