import * as THREE from 'three';

const MARKER_COLOR = 0x80868b;
const GROUND_OFFSET_METERS = 0.04;
const GLYPH_HEIGHT_METERS = 0.55;
const ELIGIBLE_CHANNELS = new Set(['DIRECT', 'VOICE', 'RADIO']);

function disableRaycast(object) {
  object.raycast = () => {};
  object.castShadow = false;
  object.receiveShadow = false;
  object.userData.presentationOnly = true;
  return object;
}

function finiteContactPosition(position) {
  return Array.isArray(position)
    && position.length >= 3
    && position.slice(0, 3).every(Number.isFinite);
}

function boundedConfidence(value) {
  return THREE.MathUtils.clamp(Number(value), 0, 1);
}

function boundedUncertainty(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function markerMaterial({ side = THREE.FrontSide } = {}) {
  return new THREE.MeshBasicMaterial({
    color: MARKER_COLOR,
    side,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
}

/**
 * Presentation-only projection of frozen public contact snapshots.
 *
 * The system intentionally accepts no unit collection or simulation service.
 * Hidden live transforms and combat state therefore cannot feed the marker.
 */
export class LastKnownContactMarkerSystem {
  constructor(scene, { getGroundHeightAt } = {}) {
    if (!scene?.add || !scene?.remove) {
      throw new TypeError(
        'LastKnownContactMarkerSystem requires a Three.js scene'
      );
    }
    if (typeof getGroundHeightAt !== 'function') {
      throw new TypeError(
        'LastKnownContactMarkerSystem requires a ground-height resolver'
      );
    }

    this.scene = scene;
    this.getGroundHeightAt = getGroundHeightAt;
    this.root = new THREE.Group();
    this.root.name = 'last-known-contact-markers';
    this.root.userData.presentationOnly = true;
    this.glyphGeometry = new THREE.OctahedronGeometry(0.42, 0);
    this.ringGeometry = new THREE.RingGeometry(0.82, 1, 40);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.records = new Map();
    this.disposed = false;
    this.scene.add(this.root);
  }

  createRecord(targetUnitId) {
    const group = new THREE.Group();
    group.name = `last-known-contact-marker-${this.records.size}`;
    group.userData.presentationOnly = true;
    group.visible = false;

    const glyphMaterial = markerMaterial();
    const ringMaterial = markerMaterial({ side: THREE.DoubleSide });
    const glyph = disableRaycast(
      new THREE.Mesh(this.glyphGeometry, glyphMaterial)
    );
    glyph.name = 'last-known-contact-glyph';
    glyph.position.y = GLYPH_HEIGHT_METERS;
    const ring = disableRaycast(
      new THREE.Mesh(this.ringGeometry, ringMaterial)
    );
    ring.name = 'last-known-contact-uncertainty';
    group.add(glyph, ring);
    this.root.add(group);

    const record = {
      targetUnitId,
      group,
      glyph,
      ring,
      glyphMaterial,
      ringMaterial,
      contactSnapshot: null
    };
    this.records.set(targetUnitId, record);
    return record;
  }

  sync({ visibleUnitIds, contacts } = {}) {
    if (this.disposed) return 0;
    if (!Array.isArray(visibleUnitIds) || !Array.isArray(contacts)) {
      throw new TypeError(
        'LastKnownContactMarkerSystem sync requires projection arrays'
      );
    }

    for (const record of this.records.values()) record.group.visible = false;

    const visibleIds = new Set(visibleUnitIds);
    const sortedContacts = [...contacts].sort((left, right) =>
      String(left?.targetUnitId ?? '')
        .localeCompare(String(right?.targetUnitId ?? ''))
    );
    const processedTargetIds = new Set();
    let visibleCount = 0;
    for (const contact of sortedContacts) {
      const targetUnitId = contact?.targetUnitId;
      const confidence = boundedConfidence(contact?.confidence);
      if (
        typeof targetUnitId !== 'string'
        || targetUnitId.length === 0
        || processedTargetIds.has(targetUnitId)
        || visibleIds.has(targetUnitId)
        || !ELIGIBLE_CHANNELS.has(contact?.channel)
        || !Number.isFinite(confidence)
        || confidence <= 0
        || !finiteContactPosition(contact?.position)
      ) {
        continue;
      }
      processedTargetIds.add(targetUnitId);

      const [x, _reportedY, z] = contact.position;
      const groundHeight = Number(this.getGroundHeightAt(x, z));
      if (!Number.isFinite(groundHeight)) continue;

      const uncertaintyM = boundedUncertainty(contact.uncertaintyM);
      const record = this.records.get(targetUnitId)
        ?? this.createRecord(targetUnitId);
      record.group.visible = true;
      record.group.position.set(x, groundHeight + GROUND_OFFSET_METERS, z);
      record.glyphMaterial.opacity = confidence;
      record.ringMaterial.opacity = confidence;
      record.ring.scale.setScalar(uncertaintyM);
      record.contactSnapshot = {
        targetUnitId,
        position: [x, contact.position[1], z],
        channel: contact.channel,
        confidence,
        uncertaintyM
      };
      visibleCount++;
    }
    return visibleCount;
  }

  getDiagnostics() {
    const markers = [...this.records.values()]
      .sort((left, right) =>
        left.targetUnitId.localeCompare(right.targetUnitId)
      )
      .map(record => ({
        visible: record.group.visible,
        contact: record.contactSnapshot
          ? {
              ...record.contactSnapshot,
              position: [...record.contactSnapshot.position]
            }
          : null
      }));
    return {
      disposed: this.disposed,
      markerCount: this.records.size,
      visibleCount: markers.filter(marker => marker.visible).length,
      geometryCount: this.disposed ? 0 : 2,
      materialCount: this.disposed ? 0 : this.records.size * 2,
      markers
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.root);
    this.glyphGeometry.dispose();
    this.ringGeometry.dispose();
    for (const record of this.records.values()) {
      record.glyphMaterial.dispose();
      record.ringMaterial.dispose();
    }
    this.records.clear();
  }
}
