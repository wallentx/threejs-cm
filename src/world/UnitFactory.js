import * as THREE from 'three';

function requireFactory(registry, id, label) {
  if (!registry || typeof registry !== 'object') {
    throw new Error(`UnitFactory requires injected ${label} factories`);
  }
  const factory = registry[id];
  if (!factory) throw new Error(`Unknown ${label} model: ${id}`);
  if (typeof factory !== 'function') {
    throw new TypeError(`${label} model factory ${id} must be a function`);
  }
  return factory;
}

function attachVehicleSelectionDisc(vehicle, selectionColor) {
  const dimensions = vehicle.userData.modelMetadata?.dimensionsMeters;
  const halfWidth = (dimensions?.width ?? 2.2) * 0.5;
  const innerRadius = Math.max(0.8, halfWidth + 0.2);
  const outerRadius = innerRadius + 0.65;
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 20);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: selectionColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });
  const disc = new THREE.Mesh(geometry, material);
  disc.name = 'SelectionDisc';
  disc.position.y = 0.05;
  disc.userData.lodBand = 'ui';
  disc.visible = false;
  vehicle.add(disc);
  vehicle.userData.selectionDisc = disc;
  return vehicle;
}

export class UnitFactory {
  static createInfantrySquadMesh(modelId, roster, infantryMeshFactories) {
    return requireFactory(
      infantryMeshFactories,
      modelId,
      'infantry'
    )(roster);
  }

  static createTankMesh(modelId, vehicleMeshFactories, selectionColor = 0xffffff) {
    const vehicle = requireFactory(
      vehicleMeshFactories,
      modelId,
      'vehicle'
    )();
    return attachVehicleSelectionDisc(vehicle, selectionColor);
  }

  static createStructureMesh(modelId, structureMeshFactories) {
    return requireFactory(
      structureMeshFactories,
      modelId,
      'structure'
    )();
  }
}
