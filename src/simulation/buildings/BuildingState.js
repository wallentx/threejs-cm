import { normalizeBuildingTransform } from './BuildingTransforms.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stageFor(section, health) {
  const ratio = health / section.maxHealth;
  return [...section.visualStages]
    .sort((a, b) => b.minHealthFraction - a.minHealthFraction || a.id.localeCompare(b.id))
    .find(stage => ratio >= stage.minHealthFraction)?.id
    ?? section.visualStages[section.visualStages.length - 1].id;
}

export function createBuildingState({
  id,
  descriptor,
  transform,
  destructionThresholds = null
}) {
  const sections = {};
  for (const section of descriptor.sections) {
    sections[section.id] = {
      health: section.maxHealth,
      maxHealth: section.maxHealth,
      stage: stageFor(section, section.maxHealth),
      collapsed: false
    };
  }

  const openings = {};
  const addOpening = (kind, ownerId, sectionId, aperture, defaultOpen) => {
    if (!aperture) return;
    openings[aperture.id] = {
      id: aperture.id,
      kind,
      ownerId,
      sectionId,
      open: aperture.initiallyOpen ?? defaultOpen,
      breached: false,
      enabled: true
    };
  };
  for (const portal of descriptor.portals) {
    addOpening(portal.kind, portal.id, portal.sectionId ?? null, portal.aperture, false);
  }
  for (const firePort of descriptor.firePorts) {
    addOpening('fire_port', firePort.id, firePort.sectionId, firePort.aperture, false);
  }

  return {
    id: String(id),
    descriptorId: descriptor.id,
    transform: normalizeBuildingTransform(transform),
    destructionThresholds: clone(destructionThresholds),
    openings,
    sections,
    occupancy: {},
    reservations: {},
    collapseQueue: [],
    invalidSlots: [],
    invalidPortals: [],
    invalidFirePorts: [],
    breachedColliderPartIds: [],
    rubbleActive: false,
    collisionVersion: 0,
    collisionChanges: [],
    eventVersion: 0,
    events: []
  };
}

export function captureBuildingState(state) {
  return clone(state);
}

export function restoreBuildingState(saved) {
  const restored = clone(saved);
  if (restored && !Object.hasOwn(restored, 'destructionThresholds')) {
    restored.destructionThresholds = null;
  }
  return restored;
}

export function sectionStage(section, health) {
  return stageFor(section, health);
}
