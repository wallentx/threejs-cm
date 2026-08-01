import * as THREE from 'three';
import { isPositionInsideDeploymentZone } from '../scenario/DeploymentRules.js';
import {
  createVehicleLocalAimPoint
} from '../simulation/combat/VehicleTargeting.js';

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
  'TARGET_MG',
  'TARGET_HULL_HE',
  'TARGET_HULL_APHE',
  'MORTAR_HE',
  'MORTAR_SMOKE'
]);

export function isTargetCommandMode(mode) {
  return TARGET_COMMAND_MODES.has(mode);
}

function canUnitUseCommandMode(unit, mode) {
  if (mode === 'TARGET_AP') return Boolean(unit?.vehicleSpec?.mainGun?.ap);
  if (mode === 'TARGET_HE') return Boolean(unit?.vehicleSpec?.mainGun?.he);
  if (mode === 'TARGET_MG') {
    return (unit?.vehicleSpec?.weaponMounts ?? [])
      .some(mount => mount.kind !== 'cannon');
  }
  if (mode === 'TARGET_HULL_HE' || mode === 'TARGET_HULL_APHE') {
    return (unit?.vehicleSpec?.weaponMounts ?? [])
      .some(mount => mount.targetModes?.includes(mode));
  }
  if (mode === 'MORTAR_HE') return Boolean(unit?.mortarTeamConfig);
  if (mode === 'MORTAR_SMOKE') {
    return Boolean(unit?.mortarTeamConfig?.smokeWeaponId);
  }
  return true;
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
    this.activeUnits = [];
    this.activeMode = null;
    this.areaTargetPreview = null;

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
      TARGET_HULL_HE: 0xffa62b,
      TARGET_HULL_APHE: 0xff4d00,
      MORTAR_HE: 0xff7b00,
      MORTAR_SMOKE: 0xd7ddd2,
      FACE: 0xd4af37      // Gold
    };
  }

  setActiveUnit(unit) {
    this.setActiveUnits(unit ? [unit] : [], unit);
  }

  setActiveUnits(units, primaryUnit = null) {
    this.activeUnits = [...new Set((units ?? []).filter(Boolean))];
    this.activeUnit = this.activeUnits.includes(primaryUnit)
      ? primaryUnit
      : (this.activeUnits.at(-1) ?? null);
    this.activeMode = null;
    this.renderOverlays();
  }

  setCommandMode(mode) {
    this.activeMode = this.activeMode === mode ? null : mode;
    this.areaTargetPreview = null;
    this.renderOverlays();
    return this.activeMode;
  }

  cancelActiveMode() {
    const cancelled = this.activeMode;
    this.activeMode = null;
    this.areaTargetPreview = null;
    this.renderOverlays();
    return cancelled;
  }

  setAreaTargetPreview(center, radiusMeters, mode = this.activeMode) {
    if (!['MORTAR_HE', 'MORTAR_SMOKE'].includes(mode)) return false;
    if (!center?.isVector3 || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      return false;
    }
    this.areaTargetPreview = {
      center: center.clone(),
      radiusMeters,
      mode
    };
    this.renderOverlays();
    return true;
  }

  clearActiveUnit() {
    this.activeUnits = [];
    this.activeUnit = null;
    this.activeMode = null;
    this.areaTargetPreview = null;
    this.renderOverlays();
  }

  handleMapClick(pointVec3, targetUnit = null, context = {}) {
    if (!this.activeUnit) return;
    const selectedUnits = this.activeUnits.length > 0
      ? [...this.activeUnits]
      : [this.activeUnit];
    if (selectedUnits.length === 1) {
      return this.handleActiveUnitMapClick(pointVec3, targetUnit, context);
    }

    const mode = this.activeMode;
    const primaryUnit = this.activeUnit;
    const buildingId = context.buildingId
      ?? (
        mode?.startsWith('MOVE_')
          ? this.buildingInteraction?.findBuildingAt?.(pointVec3) ?? null
          : null
      );
    // Floor choice and capacity are individual-building interactions. Keep
    // that modal owned by the primary infantry unit instead of opening one
    // competing modal per selected squad.
    if (
      buildingId
      && mode?.startsWith('MOVE_')
      && primaryUnit.type === 'infantry_squad'
    ) {
      return this.handleActiveUnitMapClick(
        pointVec3,
        targetUnit,
        { ...context, buildingId }
      );
    }

    const preserveFormation = mode?.startsWith('MOVE_');
    let acceptedAny = false;
    for (const unit of selectedUnits) {
      if (!canUnitUseCommandMode(unit, mode)) continue;
      this.activeUnit = unit;
      this.activeMode = mode;
      const issuePoint = pointVec3.clone();
      if (preserveFormation) {
        issuePoint.x += unit.position.x - primaryUnit.position.x;
        issuePoint.z += unit.position.z - primaryUnit.position.z;
        issuePoint.y = this.terrain?.getMovementHeightAt?.(
          issuePoint.x,
          issuePoint.z
        ) ?? this.terrain?.getHeightAt?.(
          issuePoint.x,
          issuePoint.z
        ) ?? issuePoint.y;
      }
      acceptedAny = Boolean(
        this.handleActiveUnitMapClick(issuePoint, targetUnit, context)
      ) || acceptedAny;
    }
    this.activeUnit = primaryUnit;
    const singleUseMode = isTargetCommandMode(mode)
      || mode === 'FACE'
      || mode === 'ENTER_GROUND'
      || mode === 'ENTER_UPPER';
    this.activeMode = acceptedAny && singleUseMode ? null : mode;
    this.renderOverlays();
    return acceptedAny;
  }

  handleActiveUnitMapClick(pointVec3, targetUnit = null, context = {}) {
    if (!this.activeUnit) return false;

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
          const formationOffsets = this.activeUnit.vehicleSpec
            ? []
            : (this.activeUnit.soldierAI?.getLivingAgents?.().map(agent =>
                this.activeUnit.soldierAI.getFormationOffset?.(
                  agent.index,
                  orderType
                )
              ).filter(Boolean) ?? []);
          const routeClearance = this.activeUnit.vehicleSpec
            ? vehicleLongitudinalOffset
            : Math.max(
                0,
                ...formationOffsets.map(offset =>
                  typeof offset.length === 'function' ? offset.length() : 0)
              );
          const routeOptions = {
            clearance: routeClearance,
            waypointClearance: waypointArrivalTolerance
          };
          if (this.activeUnit.vehicleSpec) {
            routeOptions.longitudinalClearance =
              this.activeUnit.collisionRadius + vehicleLongitudinalOffset;
          } else {
            routeOptions.lateralClearance = Math.max(
              0,
              ...formationOffsets.map(offset => Math.abs(offset.x ?? 0))
            );
            // Intermediate waypoints are accepted within the arrival radius.
            // Stage a whole formation that much farther from a bottleneck so
            // its leading slots cannot reform inside an abutment or corner.
            routeOptions.longitudinalClearance =
              routeClearance + waypointArrivalTolerance;
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
        this.activeMode,
        context
      );
      if (result?.handled) {
        if (result.accepted) {
          this.activeMode = null;
          this.areaTargetPreview = null;
          this.renderOverlays();
        }
        return result.accepted;
      }
      this.activeUnit.targetUnit = targetUnit;
      this.activeUnit.targetPos = pointVec3.clone();
      this.activeUnit.targetAimIntent = targetUnit?.vehicleSpec
        ? createVehicleLocalAimPoint(
            targetUnit,
            context.targetSurfacePoint ?? pointVec3
          )
        : null;
      this.activeUnit.targetMode = this.activeMode;
      this.activeMode = null;
      this.renderOverlays();
      return true;
    } else if (this.activeMode === 'FACE') {
      const buildingFace = this.buildingInteraction?.issueFace?.(
        this.activeUnit,
        pointVec3
      );
      if (buildingFace?.handled) {
        if (buildingFace.accepted) {
          this.activeMode = null;
          this.renderOverlays();
        }
        return Boolean(buildingFace.accepted);
      }
      const dir = new THREE.Vector3().subVectors(pointVec3, this.activeUnit.position);
      this.activeUnit.rotation = Math.atan2(dir.x, dir.z);
      if (this.activeUnit.mesh) {
        this.activeUnit.mesh.rotation.y = this.activeUnit.rotation;
      }
      this.activeMode = null;
      this.renderOverlays();
      return true;
    }
    return false;
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

    const units = this.activeUnits.length > 0
      ? this.activeUnits
      : (this.activeUnit ? [this.activeUnit] : []);
    for (const unit of units) {
      // 1. Render Waypoint Paths
      if (unit.waypoints.length > 0) {
        const points = [unit.position.clone()];
        unit.waypoints.forEach(wp => points.push(wp.position.clone()));

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: this.colors[unit.waypoints[0].orderType] || 0xffff00,
          linewidth: 3
        });
        const line = new THREE.Line(geo, mat);
        this.pathLinesGroup.add(line);

        // Render Waypoint Nodes (Spheres)
        unit.waypoints.forEach(wp => {
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

      // 2. Render Target Vector
      if (unit.targetPos) {
        const points = [
          unit.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
          unit.targetPos.clone().add(new THREE.Vector3(0, 1.0, 0))
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: this.colors[unit.targetMode] || this.colors.TARGET,
          linewidth: 2
        });
        const line = new THREE.Line(geo, mat);
        this.targetLinesGroup.add(line);
      }
      if (unit.mortarTargetOrder) {
        this.addAreaTargetCircle({
          center: new THREE.Vector3().fromArray(
            unit.mortarTargetOrder.center
          ),
          radiusMeters: unit.mortarTargetOrder.radiusMeters,
          mode: unit.targetMode
        });
      }
    }
    if (this.areaTargetPreview) {
      this.addAreaTargetCircle(this.areaTargetPreview);
    }
  }

  addAreaTargetCircle({ center, radiusMeters, mode }) {
    const points = [];
    const segments = 48;
    for (let index = 0; index <= segments; index++) {
      const angle = index / segments * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radiusMeters;
      const z = center.z + Math.sin(angle) * radiusMeters;
      const y = this.terrain?.getHeightAt?.(x, z) ?? center.y;
      points.push(new THREE.Vector3(x, y + 0.08, z));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: this.colors[mode] ?? this.colors.MORTAR_HE,
      transparent: true,
      opacity: 0.82
    });
    const circle = new THREE.Line(geometry, material);
    circle.name = 'MortarTargetArea';
    this.targetLinesGroup.add(circle);
  }
}
