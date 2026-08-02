import * as THREE from 'three';

const PREVIEW_COLOR = 0xfacc15;
const INFANTRY_RING_INNER_RADIUS = 0.55;
const INFANTRY_RING_OUTER_RADIUS = 0.72;
const GROUND_OFFSET_METERS = 0.035;
const GROUND_NORMAL_SAMPLE_METERS = 0.3;
const UP = new THREE.Vector3(0, 1, 0);

const groundNormal = new THREE.Vector3();
const groundTilt = new THREE.Quaternion();
const footprintYaw = new THREE.Quaternion();
const equipmentWorldPosition = new THREE.Vector3();

function disableRaycast(object) {
  object.raycast = () => {};
  object.frustumCulled = false;
  object.renderOrder = 850;
  return object;
}

function unitDimensions(unit) {
  return unit?.mesh?.userData?.modelMetadata?.dimensionsMeters
    ?? unit?.vehicleSpec?.dimensionsMeters
    ?? unit?.structureSpec?.dimensionsMeters
    ?? null;
}

export function createSelectionGroundHeightResolver(terrain) {
  if (!terrain?.getHeightAt) {
    throw new TypeError('Selection ground projection requires terrain heights');
  }
  return (x, z, { supportHeight = null } = {}) => {
    if (Number.isFinite(supportHeight)) return supportHeight;
    const terrainHeight = terrain.getHeightAt(x, z);
    const movementHeight = terrain.getMovementHeightAt
      ? terrain.getMovementHeightAt(x, z)
      : terrainHeight;
    if (Math.abs(movementHeight - terrainHeight) > 1e-6) {
      return movementHeight;
    }
    return terrain.getRenderedTerrainHeightAt
      ? terrain.getRenderedTerrainHeightAt(x, z)
      : terrainHeight;
  };
}

/**
 * Presentation-only hover preview for the complete unit a model click selects.
 * Soldier positions remain owned by SoldierAI; this class only projects them.
 */
export class UnitHoverPreview {
  constructor(scene, {
    getGroundHeightAt = (_x, _z, context = {}) =>
      Number(context.supportHeight) || 0
  } = {}) {
    if (!scene?.add || !scene?.remove) {
      throw new TypeError('UnitHoverPreview requires a Three.js scene');
    }
    if (typeof getGroundHeightAt !== 'function') {
      throw new TypeError('UnitHoverPreview requires a ground-height resolver');
    }
    this.scene = scene;
    this.getGroundHeightAt = getGroundHeightAt;
    this.group = new THREE.Group();
    this.group.name = 'unit-hover-preview';
    this.group.userData.presentationOnly = true;
    this.group.visible = false;
    this.geometry = new THREE.RingGeometry(
      INFANTRY_RING_INNER_RADIUS,
      INFANTRY_RING_OUTER_RADIUS,
      32
    );
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: PREVIEW_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false
    });
    this.rings = [];
    this.unitRingPools = new Map();
    this.hoveredUnit = null;
    scene.add(this.group);
  }

  ensureRing(unit, index) {
    let pool = this.unitRingPools.get(unit);
    if (!pool) {
      pool = [];
      this.unitRingPools.set(unit, pool);
    }
    while (pool.length <= index) {
      const ring = disableRaycast(new THREE.Mesh(this.geometry, this.material));
      ring.name = `UnitHoverRing_${this.rings.length}`;
      ring.userData.presentationOnly = true;
      ring.userData.previewOwnerUnitId = unit?.id ?? null;
      ring.visible = false;
      pool.push(ring);
      this.rings.push(ring);
      this.group.add(ring);
    }
    return pool[index];
  }

  setHoveredUnit(unit) {
    const validUnit = (unit && typeof unit.isControllable === 'function' && !unit.isControllable()) ? null : unit;
    if (this.hoveredUnit === validUnit) return;
    this.hoveredUnit = validUnit;
    this.group.visible = Boolean(this.hoveredUnit);
    for (const ring of this.rings) ring.visible = false;
    this.update();
    return this.hoveredUnit;
  }

  groundHeight(x, z, context) {
    const height = Number(this.getGroundHeightAt(x, z, context));
    return Number.isFinite(height) ? height : 0;
  }

  placeRing(ring, {
    x,
    z,
    yaw = 0,
    scaleX = 1,
    scaleZ = 1,
    supportHeight = null
  }) {
    const context = { supportHeight };
    const centerHeight = this.groundHeight(x, z, context);
    const step = GROUND_NORMAL_SAMPLE_METERS;
    const leftHeight = this.groundHeight(x - step, z, context);
    const rightHeight = this.groundHeight(x + step, z, context);
    const backHeight = this.groundHeight(x, z - step, context);
    const frontHeight = this.groundHeight(x, z + step, context);
    groundNormal.set(
      leftHeight - rightHeight,
      step * 2,
      backHeight - frontHeight
    ).normalize();
    groundTilt.setFromUnitVectors(UP, groundNormal);
    footprintYaw.setFromAxisAngle(UP, yaw);
    ring.visible = true;
    ring.position.set(x, centerHeight + GROUND_OFFSET_METERS, z);
    ring.quaternion.copy(groundTilt).multiply(footprintYaw);
    ring.scale.set(scaleX, 1, scaleZ);
  }

  update() {
    const unit = this.hoveredUnit;
    if (!unit || unit.mesh?.visible === false || (typeof unit.isControllable === 'function' && !unit.isControllable())) {
      this.group.visible = false;
      for (const ring of this.rings) ring.visible = false;
      return 0;
    }

    this.group.visible = true;
    const agents = unit.type === 'infantry_squad'
      ? unit.soldierAI?.getLivingAgents?.() ?? []
      : [];
    if (agents.length > 0) {
      let ringIndex = 0;
      for (const agent of agents) {
        const ring = this.ensureRing(unit, ringIndex++);
        this.placeRing(ring, {
          x: agent.position.x,
          z: agent.position.z,
          supportHeight: agent.buildingLocation
            ? agent.position.y
            : null
        });
        ring.userData.selectionEquipmentId = null;
      }
      unit.mesh.updateWorldMatrix?.(true, true);
      for (const equipment of unit.mesh.userData?.selectionEquipment ?? []) {
        if (!equipment?.visible || !equipment.userData?.selectionFootprint) {
          continue;
        }
        equipment.getWorldPosition(equipmentWorldPosition);
        const footprint = equipment.userData.selectionFootprint;
        const radius = Math.max(
          0.2,
          Number(footprint.radiusMeters) || INFANTRY_RING_OUTER_RADIUS
        );
        const ring = this.ensureRing(unit, ringIndex++);
        this.placeRing(ring, {
          x: equipmentWorldPosition.x,
          z: equipmentWorldPosition.z,
          yaw: unit.rotation ?? 0,
          scaleX: radius / INFANTRY_RING_OUTER_RADIUS,
          scaleZ: radius / INFANTRY_RING_OUTER_RADIUS
        });
        ring.userData.selectionEquipmentId =
          footprint.id ?? equipment.name ?? null;
      }
      const pool = this.unitRingPools.get(unit) ?? [];
      for (let index = ringIndex; index < pool.length; index++) {
        pool[index].visible = false;
        pool[index].userData.selectionEquipmentId = null;
      }
      return ringIndex;
    }

    const ring = this.ensureRing(unit, 0);
    const dimensions = unitDimensions(unit);
    const halfWidth = Math.max(0.8, Number(dimensions?.width) * 0.5 || 1.1);
    const halfLength = Math.max(0.8, Number(dimensions?.length) * 0.5 || 1.1);
    this.placeRing(ring, {
      x: unit.position.x,
      z: unit.position.z,
      yaw: unit.rotation ?? 0,
      scaleX: (halfWidth + 0.4) / INFANTRY_RING_OUTER_RADIUS,
      scaleZ: (halfLength + 0.4) / INFANTRY_RING_OUTER_RADIUS
    });
    ring.userData.selectionEquipmentId = null;
    const pool = this.unitRingPools.get(unit) ?? [];
    for (let index = 1; index < pool.length; index++) {
      pool[index].visible = false;
      pool[index].userData.selectionEquipmentId = null;
    }
    return 1;
  }

  dispose() {
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.rings.length = 0;
    this.unitRingPools.clear();
    this.hoveredUnit = null;
  }
}
