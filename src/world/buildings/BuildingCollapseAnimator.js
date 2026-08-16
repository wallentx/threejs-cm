const DEFAULT_COLLAPSE_DURATION = 0.8;

function cacheBaseTransform(object) {
  if (object.userData.baseTransform) return object.userData.baseTransform;
  const base = {
    position: object.position.toArray(),
    rotation: object.rotation.toArray(),
    scale: object.scale.toArray(),
    color: object.material?.color?.getHex?.() ?? null,
    roughness: object.material?.roughness ?? null,
    opacity: object.material?.opacity ?? 1,
    transparent: object.material?.transparent ?? false,
    depthWrite: object.material?.depthWrite ?? true,
    renderOrder: object.renderOrder ?? 0
  };
  object.userData.baseTransform = base;
  return base;
}

function hashDirection(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? 1 : -1;
}

function collectMeshTargets(root, targets) {
  root.traverse(object => {
    if (!object.isMesh) return;
    targets.push({ object, base: cacheBaseTransform(object) });
  });
}

/**
 * Renderer-owned, state-driven building collapse presentation.
 *
 * Authoritative snapshots only decide whether a section is collapsed. Event
 * projection may animate that change; restore projection always chooses an
 * exact terminal pose. Target discovery and transform capture happen once in
 * the constructor, never in the frame update.
 */
export class BuildingCollapseAnimator {
  constructor(root, options = {}) {
    this.root = root;
    this.duration = Number.isFinite(options.duration) && options.duration > 0
      ? options.duration
      : DEFAULT_COLLAPSE_DURATION;
    this.sectionRecords = new Map();
    this.sectionRecordList = [];
    this.activeTransitionCount = 0;
    this.disposed = false;

    const descriptor = root?.userData?.descriptor;
    const lodTiers = root?.userData?.lodTiers ?? [];
    for (const section of descriptor?.sections ?? []) {
      const record = {
        sectionId: section.id,
        groups: [],
        targets: [],
        roofTargets: [],
        tiltDirection: hashDirection(section.id),
        collapsed: false,
        active: false,
        completed: false,
        progress: 0
      };
      for (const tier of lodTiers) {
        const group = tier.sections?.get?.(section.id);
        if (group) {
          record.groups.push(group);
          collectMeshTargets(group, record.targets);
        }
        if (tier.roof?.userData?.sectionId === section.id) {
          const roofTarget = {
            object: tier.roof,
            base: cacheBaseTransform(tier.roof)
          };
          record.targets.push(roofTarget);
          record.roofTargets.push(roofTarget);
        }
      }
      this.sectionRecords.set(section.id, record);
      this.sectionRecordList.push(record);
    }
  }

  hasActiveTransitions() {
    return !this.disposed && this.activeTransitionCount > 0;
  }

  /**
   * Project a new authoritative snapshot. Restore never retains an arbitrary
   * presentation phase; preserve only reapplies an already established phase.
   */
  project(runtime, mode = 'transition') {
    if (this.disposed || !runtime) return;
    for (const record of this.sectionRecordList) {
      const isCollapsed = Boolean(runtime.sections?.[record.sectionId]?.collapsed);
      if (mode === 'restore') {
        const needsIntactRestore = record.collapsed
          || record.progress > 0
          || record.completed;
        record.collapsed = isCollapsed;
        record.active = false;
        record.completed = isCollapsed;
        record.progress = isCollapsed ? 1 : 0;
        if (isCollapsed || needsIntactRestore) this.applyRecord(record);
        continue;
      }
      if (!isCollapsed) {
        const needsIntactRestore = record.collapsed
          || record.progress > 0
          || record.completed;
        record.collapsed = false;
        record.active = false;
        record.completed = false;
        record.progress = 0;
        if (needsIntactRestore) this.applyRecord(record);
        continue;
      }
      if (mode === 'transition' && !record.collapsed) {
        record.collapsed = true;
        record.active = true;
        record.completed = false;
        record.progress = 0;
      } else if (!record.collapsed) {
        // Preserve without prior event evidence behaves like a load, not a
        // fabricated mid-collapse phase.
        record.collapsed = true;
        record.active = false;
        record.completed = true;
        record.progress = 1;
      }
      this.applyRecord(record);
    }
    this.recountActiveTransitions();
  }

  /** Advance active renderer-owned transitions without scene traversal. */
  advance(runtime, deltaTime) {
    if (this.disposed || !runtime || this.activeTransitionCount === 0) return;
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt === 0) return;
    let activeCount = 0;
    for (let index = 0; index < this.sectionRecordList.length; index++) {
      const record = this.sectionRecordList[index];
      if (!record.active) continue;
      if (!runtime.sections?.[record.sectionId]?.collapsed) {
        record.collapsed = false;
        record.active = false;
        record.completed = false;
        record.progress = 0;
        this.applyRecord(record);
        continue;
      }
      record.progress = Math.min(1, record.progress + dt / this.duration);
      if (record.progress >= 1) {
        record.progress = 1;
        record.active = false;
        record.completed = true;
      } else {
        activeCount++;
      }
      this.applyRecord(record);
    }
    this.activeTransitionCount = activeCount;
  }

  recountActiveTransitions() {
    let count = 0;
    for (const record of this.sectionRecords.values()) {
      if (record.active) count++;
    }
    this.activeTransitionCount = count;
  }

  applyRecord(record) {
    const t = Math.max(0, Math.min(1, record.progress));
    const curve = t * t * (3 - 2 * t);
    const dropY = -0.95 * curve;
    const tiltZ = 0.12 * curve * record.tiltDirection;
    const tiltX = 0.08 * curve * (record.tiltDirection > 0 ? -1 : 1);
    const scaleY = Math.max(0.1, 1 - 0.75 * curve);
    const visible = !record.collapsed || record.progress < 1;

    for (let index = 0; index < record.groups.length; index++) {
      record.groups[index].visible = visible;
    }
    for (let index = 0; index < record.roofTargets.length; index++) {
      record.roofTargets[index].object.visible = visible;
    }
    for (let index = 0; index < record.targets.length; index++) {
      const target = record.targets[index];
      const object = target.object;
      const base = target.base;
      object.position.x = base.position[0];
      object.position.y = base.position[1] + dropY;
      object.position.z = base.position[2];
      object.rotation.x = base.rotation[0] + tiltX;
      object.rotation.y = base.rotation[1];
      object.rotation.z = base.rotation[2] + tiltZ;
      object.scale.x = base.scale[0];
      object.scale.y = base.scale[1] * scaleY;
      object.scale.z = base.scale[2];
      object.updateMatrix();
    }
  }

  reset() {
    if (this.disposed) return;
    for (const record of this.sectionRecordList) {
      record.collapsed = false;
      record.active = false;
      record.completed = false;
      record.progress = 0;
      this.applyRecord(record);
    }
    this.activeTransitionCount = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.sectionRecords.clear();
    this.sectionRecordList.length = 0;
    this.activeTransitionCount = 0;
    this.root = null;
    this.disposed = true;
  }
}
