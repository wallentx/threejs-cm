import * as THREE from 'three';

export class CommandSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeUnit = null;
    this.activeMode = null; // 'MOVE_FAST', 'MOVE_QUICK', 'MOVE_HUNT', 'TARGET', 'TARGET_LIGHT', 'FACE', 'TARGET_ARC'

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
      REVERSE: 0xd90429,  // Red
      PAUSE: 0xffffff,    // White
      TARGET: 0xd90429,   // Red
      TARGET_LIGHT: 0xff9f1c, // Light orange
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

  handleMapClick(pointVec3, targetUnit = null) {
    if (!this.activeUnit) return;

    if (this.activeMode && this.activeMode.startsWith('MOVE_')) {
      const orderType = this.activeMode.replace('MOVE_', '');
      this.activeUnit.addWaypoint(pointVec3, orderType);
      this.renderOverlays();
    } else if (this.activeMode === 'TARGET' || this.activeMode === 'TARGET_LIGHT') {
      this.activeUnit.targetUnit = targetUnit;
      this.activeUnit.targetPos = pointVec3.clone();
      this.activeUnit.targetMode = this.activeMode;
      this.activeMode = null;
      this.renderOverlays();
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
