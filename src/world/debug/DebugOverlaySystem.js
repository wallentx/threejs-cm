import * as THREE from 'three';
import {
  getInfantryHitVolumeRecords
} from '../../simulation/infantry/InfantryHitVolumes.js';
import {
  isVehicleTurretSeparated,
  vehicleVolumeTransform
} from '../../simulation/vehicles/VehicleTransforms.js';

const OVERLAY_KEYS = Object.freeze([
  'fieldOfView',
  'hitboxes',
  'vehicleComponents',
  'vehicleCrew'
]);

const STYLE = Object.freeze({
  fieldOfView: Object.freeze({ color: 0x22d3ee, opacity: 0.72 }),
  hostileFieldOfView: Object.freeze({ color: 0xfb923c, opacity: 0.72 }),
  hitboxes: Object.freeze({ color: 0xfacc15, opacity: 0.82 }),
  vehicleComponents: Object.freeze({ color: 0x4ade80, opacity: 0.78 }),
  vehicleCrew: Object.freeze({ color: 0xfb7185, opacity: 0.9 })
});

function disableRaycast(object) {
  object.raycast = () => {};
  object.frustumCulled = false;
  object.renderOrder = 900;
  return object;
}

function createWireMaterial({ color, opacity }) {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
}

function createLineMaterial({ color, opacity }) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
}

function yawOrientation(yaw) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    cosine, 0, sine,
    0, 1, 0,
    -sine, 0, cosine
  ];
}

function setOrientedMatrix(object, transform, halfExtents = null) {
  const orientation = transform.orientation;
  const scaleX = halfExtents ? halfExtents[0] * 2 : 1;
  const scaleY = halfExtents ? halfExtents[1] * 2 : 1;
  const scaleZ = halfExtents ? halfExtents[2] * 2 : 1;
  object.matrix.set(
    orientation[0] * scaleX,
    orientation[1] * scaleY,
    orientation[2] * scaleZ,
    transform.centerX,
    orientation[3] * scaleX,
    orientation[4] * scaleY,
    orientation[5] * scaleZ,
    transform.centerY,
    orientation[6] * scaleX,
    orientation[7] * scaleY,
    orientation[8] * scaleZ,
    transform.centerZ,
    0, 0, 0, 1
  );
  object.matrixWorldNeedsUpdate = true;
}

function focusUnits(units, focusedUnits) {
  const available = new Map(
    (units ?? []).filter(Boolean).map(unit => [String(unit.id), unit])
  );
  const focused = (focusedUnits ?? [])
    .map(unit => available.get(String(unit?.id)))
    .filter(Boolean);
  return focused.length > 0 ? focused : [...available.values()];
}

function stableRecords(records) {
  return [...records].sort((left, right) =>
    String(left.key).localeCompare(String(right.key)));
}

export class DebugOverlaySystem {
  constructor(scene) {
    if (!scene?.add || !scene?.remove) {
      throw new TypeError('DebugOverlaySystem requires a Three.js scene');
    }
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'debug-overlay-root';
    this.root.userData.presentationOnly = true;
    this.groups = Object.fromEntries(OVERLAY_KEYS.map(key => {
      const group = new THREE.Group();
      group.name = `debug-overlay-${key}`;
      group.userData.presentationOnly = true;
      group.visible = false;
      this.root.add(group);
      return [key, group];
    }));
    this.enabled = Object.fromEntries(OVERLAY_KEYS.map(key => [key, false]));
    this.objects = Object.fromEntries(OVERLAY_KEYS.map(key => [key, new Map()]));
    this.stats = Object.freeze(Object.fromEntries(
      OVERLAY_KEYS.map(key => [key, 0])
    ));
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.geometryResources = new Set([this.boxGeometry]);
    this.fovGeometryCache = new Map();
    this.triangleGeometryCache = new WeakMap();
    this.materials = {
      fieldOfView: createLineMaterial(STYLE.fieldOfView),
      hostileFieldOfView: createLineMaterial(STYLE.hostileFieldOfView),
      hitboxes: createWireMaterial(STYLE.hitboxes),
      vehicleComponents: createWireMaterial(STYLE.vehicleComponents),
      vehicleCrew: createWireMaterial(STYLE.vehicleCrew)
    };
    scene.add(this.root);
  }

  getState() {
    return Object.freeze({ ...this.enabled });
  }

  getStats() {
    return this.stats;
  }

  isEnabled(key) {
    return this.enabled[key] === true;
  }

  hasEnabledOverlays() {
    return OVERLAY_KEYS.some(key => this.enabled[key]);
  }

  setEnabled(key, enabled) {
    if (!OVERLAY_KEYS.includes(key)) {
      throw new Error(`Unknown debug overlay ${key}`);
    }
    const active = Boolean(enabled);
    this.enabled[key] = active;
    this.groups[key].visible = active;
    if (!active) this.clearObjects(key);
    return active;
  }

  clearObjects(key) {
    const group = this.groups[key];
    for (const object of this.objects[key].values()) group.remove(object);
    this.objects[key].clear();
    this.stats = Object.freeze({ ...this.stats, [key]: 0 });
  }

  reconcile(key, records, createObject, updateObject) {
    const group = this.groups[key];
    const objects = this.objects[key];
    const retained = new Set();
    for (const record of stableRecords(records)) {
      retained.add(record.key);
      let object = objects.get(record.key);
      if (!object) {
        object = createObject(record);
        object.name = `Debug_${key}_${record.key}`;
        object.userData.debugOverlay = key;
        object.userData.debugRecordId = record.key;
        objects.set(record.key, object);
        group.add(object);
      }
      updateObject(object, record);
    }
    for (const [recordKey, object] of objects) {
      if (retained.has(recordKey)) continue;
      group.remove(object);
      objects.delete(recordKey);
    }
    this.stats = Object.freeze({ ...this.stats, [key]: objects.size });
  }

  getFovGeometry(record) {
    const degrees = Math.max(1, Math.min(360, record.horizontalFovDegrees));
    const range = Math.max(1, record.nominalRangeMeters);
    const cacheKey = `${degrees.toFixed(4)}:${range.toFixed(4)}`;
    const cached = this.fovGeometryCache.get(cacheKey);
    if (cached) return cached;
    const segments = degrees >= 359.999 ? 48 : 24;
    const halfRadians = degrees * Math.PI / 360;
    const points = [];
    if (degrees < 359.999) points.push(new THREE.Vector3(0, 0, 0));
    for (let index = 0; index <= segments; index++) {
      const fraction = index / segments;
      const angle = degrees >= 359.999
        ? fraction * Math.PI * 2
        : -halfRadians + fraction * halfRadians * 2;
      points.push(new THREE.Vector3(
        Math.sin(angle) * range,
        0,
        Math.cos(angle) * range
      ));
    }
    if (degrees < 359.999) points.push(new THREE.Vector3(0, 0, 0));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.fovGeometryCache.set(cacheKey, geometry);
    this.geometryResources.add(geometry);
    return geometry;
  }

  updateFieldOfView(records, focusedIds, playerFactionId) {
    const filtered = (records ?? [])
      .filter(record => focusedIds.has(String(record.observerUnitId)))
      .map(record => ({
        ...record,
        key: String(record.id),
        hostile: record.factionId !== playerFactionId
      }));
    this.reconcile(
      'fieldOfView',
      filtered,
      record => disableRaycast(new THREE.Line(
        this.getFovGeometry(record),
        record.hostile
          ? this.materials.hostileFieldOfView
          : this.materials.fieldOfView
      )),
      (line, record) => {
        line.geometry = this.getFovGeometry(record);
        line.material = record.hostile
          ? this.materials.hostileFieldOfView
          : this.materials.fieldOfView;
        line.position.fromArray(record.position);
        line.rotation.set(0, record.facingYaw, 0);
        line.userData.capabilityId = record.capabilityId;
        line.userData.nominalRangeMeters = record.nominalRangeMeters;
        line.userData.horizontalFovDegrees = record.horizontalFovDegrees;
      }
    );
  }

  getTriangleGeometry(volume) {
    const cached = this.triangleGeometryCache.get(volume);
    if (cached) return cached;
    const geometry = new THREE.BufferGeometry();
    const positions = volume.vertexStride === 3
      ? volume.vertices
      : volume.vertices.flat();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const triangles = [];
    for (const plate of volume.plates ?? []) {
      if (plate.triangleStride === 3) triangles.push(...plate.triangles);
      else for (const triangle of plate.triangles ?? []) triangles.push(...triangle);
    }
    geometry.setIndex(triangles);
    this.triangleGeometryCache.set(volume, geometry);
    this.geometryResources.add(geometry);
    return geometry;
  }

  armorRecords(units) {
    const records = [];
    for (const unit of units) {
      if (unit.vehicleSpec) {
        const separated = isVehicleTurretSeparated(unit);
        for (const volume of unit.vehicleSpec.armorCollision?.volumes ?? []) {
          if (separated && volume.followsTurret) continue;
          records.push({
            key: `${unit.id}:vehicle:${volume.id}`,
            volume,
            transform: vehicleVolumeTransform(unit, volume),
            halfExtents: volume.halfExtents ?? null
          });
        }
        continue;
      }
      if (unit.type !== 'infantry_squad') continue;
      for (const agent of unit.soldierAI?.getLivingAgents?.() ?? []) {
        for (const volume of getInfantryHitVolumeRecords({
          position: agent.position,
          stance: agent.stance ?? unit.stance,
          facing: agent.facing ?? unit.rotation
        })) {
          records.push({
            key: `${unit.id}:infantry:${agent.id}:${volume.id}`,
            volume,
            transform: {
              centerX: volume.center[0],
              centerY: volume.center[1],
              centerZ: volume.center[2],
              orientation: yawOrientation(volume.rotation)
            },
            halfExtents: volume.halfExtents
          });
        }
      }
    }
    return records;
  }

  updateHitboxes(units) {
    const records = this.armorRecords(units);
    this.reconcile(
      'hitboxes',
      records,
      record => disableRaycast(new THREE.Mesh(
        record.volume.shape === 'triangle-mesh'
          ? this.getTriangleGeometry(record.volume)
          : this.boxGeometry,
        this.materials.hitboxes
      )),
      (mesh, record) => {
        const geometry = record.volume.shape === 'triangle-mesh'
          ? this.getTriangleGeometry(record.volume)
          : this.boxGeometry;
        if (mesh.geometry !== geometry) mesh.geometry = geometry;
        setOrientedMatrix(mesh, record.transform, record.halfExtents);
        mesh.matrixAutoUpdate = false;
      }
    );
  }

  internalRecords(units, kind) {
    const records = [];
    for (const unit of units) {
      if (!unit.vehicleSpec?.internalLayout) continue;
      const separated = isVehicleTurretSeparated(unit);
      for (const volume of unit.vehicleSpec.internalLayout.volumes ?? []) {
        if (volume.kind !== kind) continue;
        if (separated && volume.followsTurret) continue;
        records.push({
          key: `${unit.id}:internal:${volume.id}`,
          volume,
          transform: vehicleVolumeTransform(unit, volume),
          halfExtents: volume.halfExtents
        });
      }
    }
    return records;
  }

  updateInternal(key, units, kind) {
    this.reconcile(
      key,
      this.internalRecords(units, kind),
      () => disableRaycast(new THREE.Mesh(
        this.boxGeometry,
        this.materials[key]
      )),
      (mesh, record) => {
        setOrientedMatrix(mesh, record.transform, record.halfExtents);
        mesh.matrixAutoUpdate = false;
        mesh.userData.internalKind = kind;
        mesh.userData.componentId = record.volume.componentId ?? null;
        mesh.userData.crewRoles = [...(record.volume.crewRoles ?? [])];
      }
    );
  }

  update({
    units = [],
    focusedUnits = [],
    observerRecords = [],
    playerFactionId = null
  } = {}) {
    const focused = focusUnits(units, focusedUnits);
    const focusedIds = new Set(focused.map(unit => String(unit.id)));
    if (this.enabled.fieldOfView) {
      this.updateFieldOfView(observerRecords, focusedIds, playerFactionId);
    }
    if (this.enabled.hitboxes) this.updateHitboxes(focused);
    if (this.enabled.vehicleComponents) {
      this.updateInternal('vehicleComponents', focused, 'component');
    }
    if (this.enabled.vehicleCrew) {
      this.updateInternal('vehicleCrew', focused, 'crew');
    }
    return this.getStats();
  }

  dispose() {
    for (const key of OVERLAY_KEYS) this.clearObjects(key);
    this.scene.remove(this.root);
    for (const geometry of this.geometryResources) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.geometryResources.clear();
    this.fovGeometryCache.clear();
  }
}
