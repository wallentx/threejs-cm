import * as THREE from 'three';
import { isPositionInsideDeploymentZone } from '../scenario/DeploymentRules.js';

const INFANTRY_ONLY_MOVE_ORDERS = new Set([
  'SNEAK',
  'CRAWL',
  'ASSAULT'
]);
const TARGET_COMMAND_MODES = new Set([
  'TARGET',
  'TARGET_LIGHT',
  'TARGET_AP',
  'TARGET_HE',
  'TARGET_MG'
]);

export function isTargetCommandMode(mode) {
  return TARGET_COMMAND_MODES.has(mode);
}

export class CommandSystem {
  constructor(scene, {
    deploymentZones = {},
    terrain = null,
    buildingInteraction = null,
    isSetupPhase = () => false,
    onInvalidDeployment = null,
    onBuildingOrder = null,
    onTargetOrder = null
  } = {}) {
    this.scene = scene;
    this.deploymentZones = deploymentZones;
    this.terrain = terrain;
    this.buildingInteraction = buildingInteraction;
    this.isSetupPhase = isSetupPhase;
    this.onInvalidDeployment = onInvalidDeployment;
    this.onBuildingOrder = onBuildingOrder;
    this.onTargetOrder = onTargetOrder;
    this.activeUnit = null;
    this.activeMode = null;

    // Visual overlay objects
    this.pathLinesGroup = new THREE.Group();
    this.scene.add(this.pathLinesGroup);

    this.targetLinesGroup = new THREE.Group();
    this.scene.add(this.targetLinesGroup);

    // Color definitions matching CMBN
    this.colors = {
      FAST: 0xe6c229,     // Yellow
      QUICK: 0x38b000,    // Green
      HUNT: 0xff9f1c,     // Orange
      MOVE: 0x3a86ff,     // Blue
      SNEAK: 0x8ac926,    // Yellow-green
      CRAWL: 0x6a994e,    // Dark green
      ASSAULT: 0xf94144,  // Assault red
      REVERSE: 0xd90429,  // Red
      PAUSE: 0xffffff,    // White
      TARGET: 0xd90429,   // Red
      TARGET_LIGHT: 0xff9f1c, // Light orange
      TARGET_AP: 0xff3b30,
      TARGET_HE: 0xff7b00,
      TARGET_MG: 0xf4d35e,
      FACE: 0xd4af37      // Gold
    };
  }

  setActiveUnit(unit) {
    this.activeUnit = unit;
    this.activeMode = null;
    this.renderOverlays();
  }

  setCommandMode(mode) {
    this.activeMode = this.activeMode === mode ? null : mode;
    return this.activeMode;
  }

  cancelActiveMode() {
    const cancelled = this.activeMode;
    this.activeMode = null;
    return cancelled;
  }

  clearActiveUnit() {
    this.activeUnit = null;
    this.activeMode = null;
    this.renderOverlays();
  }

  handleMapClick(pointVec3, targetUnit = null, context = {}) {
    if (!this.activeUnit) return;

    if (this.activeMode === 'ENTER_GROUND' || this.activeMode === 'ENTER_UPPER') {
      const result = this.onBuildingOrder?.(
        this.activeUnit,
        this.activeMode,
        pointVec3,
        context.buildingId ?? null
      );
      if (result?.accepted) {
        this.activeMode = null;
        this.renderOverlays();
        return true;
      }
      return false;
    } else if (this.activeMode && this.activeMode.startsWith('MOVE_')) {
      const orderType = this.activeMode.replace('MOVE_', '');
      if (INFANTRY_ONLY_MOVE_ORDERS.has(orderType)
          && this.activeUnit.type !== 'infantry_squad') {
        return false;
      }
      const buildingId = context.buildingId ?? this.buildingInteraction?.findBuildingAt?.(pointVec3) ?? null;
      if (!this.isSetupPhase() && this.activeUnit.type === 'infantry_squad') {
        if (buildingId && this.onBuildingMoveClick) {
          const handled = this.onBuildingMoveClick(this.activeUnit, pointVec3, buildingId, orderType);
          if (handled) {
            this.renderOverlays();
            return true;
          }
        }
      }
      if (this.isSetupPhase()) {
        const destination = pointVec3.clone();
        destination.y = this.terrain?.getHeightAt(destination.x, destination.z) ?? destination.y;
        if (!isPositionInsideDeploymentZone(this.activeUnit, destination, this.deploymentZones)) {
          this.onInvalidDeployment?.(this.activeUnit, destination);
          return false;
        }
        const displacement = destination.clone().sub(this.activeUnit.position);
        this.activeUnit.clearWaypoints();
        this.activeUnit.position.copy(destination);
        this.activeUnit.mesh?.position.copy(destination);
        if (this.activeUnit.mesh) {
          this.activeUnit.mesh.rotation.y = this.activeUnit.rotation;
          this.activeUnit.mesh.updateMatrixWorld(true);
        }
        // Infantry agents own their world positions. Move them with the squad
        // anchor so the setup teleport cannot leave rendered soldiers behind.
        for (const agent of this.activeUnit.soldierAI?.agents ?? []) {
          agent.position.add(displacement);
          agent.position.y = this.terrain?.getHeightAt(agent.position.x, agent.position.z)
            ?? agent.position.y;
          agent.velocity.set(0, 0, 0);
          agent.commandWaypoint = -1;
          agent.syncRecord();
        }
        this.activeUnit.soldierAI?.syncMeshes();
      } else {
        if (this.activeUnit.type === 'infantry_squad' || this.activeUnit.vehicleSpec) {
          const pendingWaypoint = this.activeUnit.currentWaypointIndex < this.activeUnit.waypoints.length
            ? this.activeUnit.waypoints[this.activeUnit.waypoints.length - 1]
            : null;
          const routeStart = pendingWaypoint?.position ?? this.activeUnit.position;
          // Unit advances to the next waypoint once its anchor is within 0.8 m.
          // Keep corner arrival tolerance separate from the formation envelope
          // that must remain clear along every route segment.
          const waypointArrivalTolerance = 0.8;
          const vehicleLongitudinalOffset = this.activeUnit.vehicleSpec
            ? Math.max(
                0,
                ...(this.activeUnit.collisionOffsets ?? [])
                  .map(offset => Math.abs(offset.z))
              )
            : 0;
          const routeClearance = this.activeUnit.vehicleSpec
            ? vehicleLongitudinalOffset
            : Math.max(
                0,
                ...(this.activeUnit.soldierAI?.getLivingAgents?.().map(agent => {
                  const offset = this.activeUnit.soldierAI.getFormationOffset?.(agent.index, orderType);
                  return typeof offset?.length === 'function' ? offset.length() : 0;
                }) ?? [])
              );
          const routeOptions = {
            clearance: routeClearance,
            waypointClearance: waypointArrivalTolerance
          };
          if (this.activeUnit.vehicleSpec) {
            routeOptions.longitudinalClearance =
              this.activeUnit.collisionRadius + vehicleLongitudinalOffset;
          }
          const plannedRoute = this.activeUnit.collisionWorld?.getNavigationPath?.(
            { x: routeStart.x, z: routeStart.z },
            { x: pointVec3.x, z: pointVec3.z },
            this.activeUnit.collisionRadius,
            this.activeUnit.vehicleSpec ? 'vehicle' : 'infantry',
            routeOptions
          );
          const routePoints = Array.isArray(plannedRoute) && plannedRoute.length > 0
            ? plannedRoute
            : [{ x: pointVec3.x, z: pointVec3.z }];
          for (let index = 0; index < routePoints.length; index++) {
            const routePoint = routePoints[index];
            const isDestination = index === routePoints.length - 1
              && routePoint.x === pointVec3.x
              && routePoint.z === pointVec3.z;
            if (!isDestination && routePoint.x === routeStart.x && routePoint.z === routeStart.z) {
              continue;
            }
            const y = isDestination
              ? pointVec3.y
              : this.terrain?.getMovementHeightAt?.(routePoint.x, routePoint.z)
                ?? this.terrain?.getHeightAt?.(routePoint.x, routePoint.z)
                ?? pointVec3.y;
            this.activeUnit.addWaypoint(
              new THREE.Vector3(routePoint.x, y, routePoint.z),
              orderType
            );
          }
        } else {
          this.activeUnit.addWaypoint(pointVec3, orderType);
        }
      }
      this.renderOverlays();
      return true;
    } else if (isTargetCommandMode(this.activeMode)) {
      const result = this.onTargetOrder?.(
        this.activeUnit,
        pointVec3,
        targetUnit,
        this.activeMode
      );
      if (result?.handled) {
        if (result.accepted) {
          this.activeMode = null;
          this.renderOverlays();
        }
        return result.accepted;
      }
      this.activeUnit.targetUnit = targetUnit;
      this.activeUnit.targetPos = pointVec3.clone();
      this.activeUnit.targetMode = this.activeMode;
      this.activeMode = null;
      this.renderOverlays();
      return true;
    } else if (this.activeMode === 'FACE') {
      const dir = new THREE.Vector3().subVectors(pointVec3, this.activeUnit.position);
      this.activeUnit.rotation = Math.atan2(dir.x, dir.z);
      this.activeUnit.mesh.rotation.y = this.activeUnit.rotation;
      this.activeMode = null;
      this.renderOverlays();
    }
  }

  renderOverlays() {
    // Clear old overlays and release their GPU resources.
    const clearGroup = (group) => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
        else child.material?.dispose();
      }
    };
    clearGroup(this.pathLinesGroup);
    clearGroup(this.targetLinesGroup);

    if (!this.activeUnit) return;

    // 1. Render Waypoint Paths
    if (this.activeUnit.waypoints.length > 0) {
      const points = [this.activeUnit.position.clone()];
      this.activeUnit.waypoints.forEach(wp => points.push(wp.position.clone()));

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: this.colors[this.activeUnit.waypoints[0].orderType] || 0xffff00,
        linewidth: 3
      });
      const line = new THREE.Line(geo, mat);
      this.pathLinesGroup.add(line);

      // Render Waypoint Nodes (Spheres)
      this.activeUnit.waypoints.forEach(wp => {
        const nodeGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const nodeMat = new THREE.MeshBasicMaterial({
          color: this.colors[wp.orderType] || 0xffff00
        });
        const node = new THREE.Mesh(nodeGeo, nodeMat);
        node.position.copy(wp.position);
        node.position.y += 0.5;
        this.pathLinesGroup.add(node);
      });
    }

    // 2. Render Target Vector (Red Line)
    if (this.activeUnit.targetPos) {
      const points = [
        this.activeUnit.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
        this.activeUnit.targetPos.clone().add(new THREE.Vector3(0, 1.0, 0))
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: this.colors[this.activeUnit.targetMode] || this.colors.TARGET,
        linewidth: 2
      });
      const line = new THREE.Line(geo, mat);
      this.targetLinesGroup.add(line);
    }
  }
}
