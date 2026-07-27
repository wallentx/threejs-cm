import * as THREE from 'three';

const MAX_POINTS = 128;
const NORMAL_LENGTH_METERS = 3;
const OUTGOING_LENGTH_METERS = 5;

function createLine(maxPoints, color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(maxPoints * 3);
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 500;
  return line;
}

function writePoints(line, points) {
  const attribute = line.geometry.getAttribute('position');
  const count = Math.min(points.length, attribute.count);
  for (let index = 0; index < count; index++) {
    attribute.setXYZ(index, points[index][0], points[index][1], points[index][2]);
  }
  attribute.needsUpdate = true;
  line.geometry.setDrawRange(0, count);
  line.visible = count >= 2;
}

function vectorLine(origin, direction, length) {
  if (!Array.isArray(origin) || !Array.isArray(direction)) return [];
  const magnitude = Math.hypot(direction[0], direction[1], direction[2]);
  if (magnitude <= 1e-9) return [];
  return [
    origin,
    origin.map((component, axis) => component + direction[axis] / magnitude * length)
  ];
}

export class ShotTrajectoryOverlay {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'shot-trajectory-overlay';
    this.root.userData.presentationOnly = true;
    this.trajectory = createLine(MAX_POINTS, 0x38bdf8);
    this.normal = createLine(2, 0xfb7185);
    this.outgoing = createLine(2, 0xfacc15);
    this.root.add(this.trajectory, this.normal, this.outgoing);
    this.root.visible = false;
    this.selectedImpactId = null;
    scene.add(this.root);
  }

  show(record) {
    if (!record) {
      this.clear();
      return false;
    }
    const points = record.trajectoryPoints?.length >= 2
      ? record.trajectoryPoints
      : [record.muzzlePosition, record.impactPosition].filter(Array.isArray);
    writePoints(this.trajectory, points);
    writePoints(
      this.normal,
      vectorLine(record.impactPosition, record.impactNormal, NORMAL_LENGTH_METERS)
    );
    writePoints(
      this.outgoing,
      vectorLine(record.impactPosition, record.postImpactVelocity, OUTGOING_LENGTH_METERS)
    );
    this.trajectory.material.color.setHex(record.ricocheted ? 0xfacc15 : 0x38bdf8);
    this.root.visible = this.trajectory.visible;
    this.selectedImpactId = record.impactId ?? record.id ?? null;
    this.root.userData.selectedImpactId = this.selectedImpactId;
    return this.root.visible;
  }

  toggle(record) {
    const impactId = record?.impactId ?? record?.id ?? null;
    if (impactId != null && this.root.visible && impactId === this.selectedImpactId) {
      this.clear();
      return false;
    }
    return this.show(record);
  }

  clear() {
    this.root.visible = false;
    this.selectedImpactId = null;
    this.root.userData.selectedImpactId = null;
    this.trajectory.geometry.setDrawRange(0, 0);
    this.normal.geometry.setDrawRange(0, 0);
    this.outgoing.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.scene.remove(this.root);
    for (const line of [this.trajectory, this.normal, this.outgoing]) {
      line.geometry.dispose();
      line.material.dispose();
    }
  }
}
