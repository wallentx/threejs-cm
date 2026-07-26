import * as THREE from 'three';
import {
  applyVehicleMaterialPack,
  setVehicleMaterialSlot
} from './VehicleMaterialLibrary.js';
import { createTrackedRunningGearProxy } from './TrackedRunningGear.js';

const VEHICLE_ENHANCEMENT_VERSION = 'authored-v2-material-v4-track-proxy';

const VEHICLE_PROFILES = Object.freeze({
  fr_renault_r35: { kind: 'tracked', hull: 'cast', wheels: 5 },
  fr_hotchkiss_h39: { kind: 'tracked', hull: 'cast', wheels: 6 },
  fr_amc35: { kind: 'tracked', hull: 'riveted', wheels: 5 },
  fr_panhard178: { kind: 'armoredCar', hull: 'armoredCar', wheels: 4 },
  fr_laffly_v15t: { kind: 'truck', hull: 'truck', wheels: 6 },
  fr_char_b1bis: { kind: 'tracked', hull: 'cast', wheels: 16 },
  ger_panzer2: { kind: 'tracked', hull: 'boxy', wheels: 5 },
  ger_panzer35t: { kind: 'tracked', hull: 'riveted', wheels: 8 },
  ger_panzer38t: { kind: 'tracked', hull: 'riveted', wheels: 4 },
  ger_sdkfz231: { kind: 'armoredCar', hull: 'armoredCar', wheels: 8 },
  ger_opel_blitz: { kind: 'truck', hull: 'truck', wheels: 6 },
  ger_panzer4: { kind: 'tracked', hull: 'boxy', wheels: 8 }
});

// These offsets are authored against each vehicle's named hull/turret group.
// A marker is deliberately a child of the moving assembly: turret weapons
// traverse with the turret while hull weapons stay fixed to the hull.
const AUXILIARY_MOUNT_LAYOUTS = Object.freeze({
  fr_renault_r35: {
    coax: {
      parent: 'turret', position: [-0.18, 0.30, 0.80],
      side: 'pending', placementQuality: 'pending direct visual confirmation'
    }
  },
  fr_hotchkiss_h39: {
    coax: {
      parent: 'turret', position: [0.18, 0.30, 0.88], barrel: [0.18, 0.30, 0.60, 0.56],
      side: 'right', placementQuality: 'historical visual reference'
    }
  },
  fr_amc35: {
    coax: {
      parent: 'turret', position: [-0.20, 0.33, 1.45], barrel: [-0.20, 0.33, 1.10, 0.70],
      side: 'pending', placementQuality: 'pending direct visual confirmation'
    }
  },
  fr_panhard178: {
    coax: {
      parent: 'turret', position: [-0.15, 0.30, 0.95],
      side: 'left', placementQuality: 'documented secondary reference'
    }
  },
  fr_char_b1bis: {
    coax: {
      parent: 'turret', position: [-0.18, 0.34, 1.28],
      side: 'pending', placementQuality: 'pending direct visual confirmation'
    },
    hull_mg: {
      parent: 'hull', position: [0.72, 1.14, 3.08], barrel: [0.72, 1.14, 2.80, 0.56],
      side: 'right', placementQuality: 'historical arrangement'
    }
  },
  ger_panzer2: {
    coax: {
      parent: 'turret', position: [-0.12, 0.26, 0.90],
      side: 'pending', placementQuality: 'pending direct visual confirmation'
    }
  },
  ger_panzer35t: {
    coax: {
      parent: 'turret', position: [0.22, 0.30, 1.25], barrel: [0.22, 0.30, 0.96, 0.58],
      side: 'right', placementQuality: 'historical visual reference'
    },
    hull_mg: { parent: 'hull', position: [0.42, 1.42, 1.62], barrel: [0.42, 1.42, 1.42, 0.40] }
  },
  ger_panzer38t: {
    coax: {
      parent: 'turret', position: [0.22, 0.30, 1.30], barrel: [0.22, 0.30, 1.00, 0.60],
      side: 'right', placementQuality: 'historical arrangement'
    },
    hull_mg: { parent: 'hull', position: [0.44, 1.48, 1.62], barrel: [0.44, 1.48, 1.42, 0.40] }
  },
  ger_sdkfz231: {
    coax: {
      parent: 'turret', position: [0.12, 0.27, 0.90],
      side: 'right', placementQuality: 'historical visual reference'
    }
  },
  ger_panzer4: {
    coax: {
      parent: 'turret', position: [0.25, 0.38, 1.38],
      side: 'right', placementQuality: 'historical arrangement'
    },
    hull_mg: { parent: 'hull', position: [0.50, 1.64, 2.58], barrel: [0.50, 1.64, 2.36, 0.44] }
  }
});

const HULL_SHAPES = Object.freeze({
  cast: [
    { z: -0.5, width: 0.72, deck: 0.54, top: 0.72 },
    { z: -0.36, width: 0.98, deck: 0.76, top: 0.98 },
    { z: 0.3, width: 1, deck: 0.72, top: 0.94 },
    { z: 0.5, width: 0.64, deck: 0.38, top: 0.58 }
  ],
  riveted: [
    { z: -0.5, width: 0.88, deck: 0.72, top: 0.85 },
    { z: -0.39, width: 1, deck: 0.86, top: 1 },
    { z: 0.34, width: 1, deck: 0.82, top: 0.96 },
    { z: 0.5, width: 0.76, deck: 0.54, top: 0.7 }
  ],
  boxy: [
    { z: -0.5, width: 0.92, deck: 0.8, top: 0.9 },
    { z: -0.42, width: 1, deck: 0.9, top: 1 },
    { z: 0.34, width: 1, deck: 0.88, top: 0.98 },
    { z: 0.5, width: 0.82, deck: 0.62, top: 0.74 }
  ],
  armoredCar: [
    { z: -0.5, width: 0.68, deck: 0.44, top: 0.66 },
    { z: -0.34, width: 1, deck: 0.66, top: 0.96 },
    { z: 0.3, width: 0.94, deck: 0.56, top: 0.86 },
    { z: 0.5, width: 0.48, deck: 0.22, top: 0.5 }
  ]
});

function tagMesh(mesh, band) {
  mesh.userData.lodBand = band;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addAuxiliaryWeaponMounts(root, metalMaterial) {
  const layouts = AUXILIARY_MOUNT_LAYOUTS[root.name];
  const weaponMuzzles = {};
  if (!layouts) {
    root.userData.weaponMuzzles = weaponMuzzles;
    return;
  }

  for (const [id, layout] of Object.entries(layouts)) {
    const parent = layout.parent === 'turret' ? root.userData.turret : root;
    if (!parent) continue;
    if (layout.barrel) {
      const [x, y, z, length] = layout.barrel;
      const barrel = tagMesh(new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.020, length, 7), metalMaterial
      ), 'high');
      barrel.name = `${id}_barrel`;
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(x, y, z);
      barrel.userData.weaponMountId = id;
      barrel.userData.mountSide = layout.side ?? null;
      barrel.userData.placementQuality = layout.placementQuality ?? 'inferred';
      parent.add(barrel);
    }
    const marker = new THREE.Object3D();
    marker.name = `${id}_muzzle`;
    marker.position.set(...layout.position);
    marker.userData.weaponMountId = id;
    marker.userData.forwardAxis = '+Z';
    marker.userData.mountSide = layout.side ?? null;
    marker.userData.placementQuality = layout.placementQuality ?? 'inferred';
    parent.add(marker);
    weaponMuzzles[id] = marker;

    // Existing factory-authored barrels share the same semantic mount ID.
    // Keep their side metadata aligned with the authoritative muzzle marker.
    parent.traverse(object => {
      if (!object.isMesh || object.userData.weaponMountId !== id) return;
      object.userData.mountSide = layout.side ?? null;
      object.userData.placementQuality = layout.placementQuality ?? 'inferred';
    });
  }
  root.userData.weaponMuzzles = weaponMuzzles;
}

export function createSectionedHullGeometry(length, width, height, style = 'boxy') {
  const sections = HULL_SHAPES[style] ?? HULL_SHAPES.boxy;
  const positions = [];
  const uvs = [];
  const indices = [];
  const bottomY = -height / 2;
  const shoulderY = bottomY + height * 0.42;

  for (const section of sections) {
    const z = section.z * length;
    const halfWidth = section.width * width / 2;
    const halfDeck = section.deck * width / 2;
    const topY = bottomY + section.top * height;
    positions.push(
      -halfWidth * 0.9, bottomY, z,
      -halfWidth, shoulderY, z,
      -halfDeck, topY, z,
      halfDeck, topY, z,
      halfWidth, shoulderY, z,
      halfWidth * 0.9, bottomY, z
    );
    const v = section.z + 0.5;
    uvs.push(
      0.5 - halfWidth * 0.9 / width, v,
      0.5 - halfWidth / width, v,
      0.5 - halfDeck / width, v,
      0.5 + halfDeck / width, v,
      0.5 + halfWidth / width, v,
      0.5 + halfWidth * 0.9 / width, v
    );
  }

  for (let section = 0; section < sections.length - 1; section++) {
    const current = section * 6;
    const next = current + 6;
    for (let edge = 0; edge < 6; edge++) {
      const a = current + edge;
      const b = current + ((edge + 1) % 6);
      const c = next + edge;
      const d = next + ((edge + 1) % 6);
      indices.push(a, c, b, b, c, d);
    }
  }

  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
  const front = (sections.length - 1) * 6;
  indices.push(
    front, front + 2, front + 1,
    front, front + 3, front + 2,
    front, front + 4, front + 3,
    front, front + 5, front + 4
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `SectionedHull_${style}`;
  return geometry;
}

function getGeometrySize(mesh) {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getSize(new THREE.Vector3());
}

function findPrimaryHull(root) {
  let primary = null;
  let largestVolume = -Infinity;
  root.traverse(object => {
    if (!object.isMesh || object.userData.lodBand !== 'core') return;
    if (root.userData.turret && root.userData.turret.getObjectById(object.id)) return;
    const size = getGeometrySize(object);
    const volume = size.x * size.y * size.z;
    if (volume > largestVolume) {
      largestVolume = volume;
      primary = object;
    }
  });
  return primary;
}

function removeOldProxy(root) {
  const proxyMeshes = [];
  root.traverse(object => {
    if (object.isMesh && object.userData.lodBand === 'proxy') proxyMeshes.push(object);
  });
  for (const mesh of proxyMeshes) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
  }
  root.getObjectByName('Proxy')?.removeFromParent();
}

function createLowPolyWheels({
  count, length, width, radius, y, material, band = 'proxy'
}) {
  const wheels = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(radius, radius, width * 0.09, 8),
    material,
    count
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const pairs = Math.ceil(count / 2);
  for (let index = 0; index < count; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const axle = Math.floor(index / 2);
    const z = pairs === 1 ? 0 : -length * 0.34 + axle * (length * 0.68 / (pairs - 1));
    matrix.compose(
      new THREE.Vector3(side * width * 0.48, y, z),
      quaternion,
      new THREE.Vector3(1, 1, 1)
    );
    wheels.setMatrixAt(index, matrix);
  }
  wheels.instanceMatrix.needsUpdate = true;
  wheels.name = 'ProxyWheels';
  wheels.visible = false;
  return tagMesh(wheels, band);
}

function addTrackedProxy(
  group,
  dimensions,
  bodyMaterial,
  trackMaterial,
  rubberMaterial,
  profile
) {
  const hullHeight = dimensions.height * 0.42;
  const trackHeight = dimensions.height * 0.27;
  const trackLength = dimensions.length * 0.86;
  const trackWidth = dimensions.width * 0.14;
  const hull = tagMesh(new THREE.Mesh(
    createSectionedHullGeometry(
      dimensions.length * 0.9,
      dimensions.width * 0.82,
      hullHeight,
      profile.hull
    ),
    bodyMaterial
  ), 'proxy');
  hull.position.y = trackHeight + hullHeight * 0.42;
  hull.visible = false;
  group.add(hull);

  group.add(createTrackedRunningGearProxy({
    id: 'FidelityTrackedProxy',
    trackMaterial,
    wheelMaterial: rubberMaterial,
    trackCenterX: dimensions.width * 0.43,
    trackWidth,
    beltLength: trackLength,
    beltHeight: trackHeight,
    centerY: trackHeight / 2,
    roadWheelRadius: trackHeight * 0.32,
    roadWheelCount: profile.wheels
  }));
}

function addArmoredCarProxy(group, dimensions, bodyMaterial, rubberMaterial, profile) {
  const hullHeight = dimensions.height * 0.46;
  const wheelRadius = dimensions.height * 0.18;
  const hull = tagMesh(new THREE.Mesh(
    createSectionedHullGeometry(
      dimensions.length * 0.88,
      dimensions.width * 0.88,
      hullHeight,
      profile.hull
    ),
    bodyMaterial
  ), 'proxy');
  hull.position.y = wheelRadius + hullHeight * 0.48;
  hull.visible = false;
  group.add(hull);
  group.add(createLowPolyWheels({
    count: profile.wheels,
    length: dimensions.length,
    width: dimensions.width,
    radius: wheelRadius,
    y: wheelRadius,
    material: rubberMaterial
  }));
}

function addTruckProxy(
  group,
  dimensions,
  bodyMaterial,
  metalMaterial,
  rubberMaterial,
  profile
) {
  const wheelRadius = dimensions.height * 0.14;
  const chassis = tagMesh(new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width * 0.82, dimensions.height * 0.12, dimensions.length * 0.86),
    metalMaterial
  ), 'proxy');
  chassis.position.y = wheelRadius * 1.2;
  chassis.visible = false;
  group.add(chassis);

  const cab = tagMesh(new THREE.Mesh(
    createSectionedHullGeometry(
      dimensions.length * 0.28,
      dimensions.width * 0.78,
      dimensions.height * 0.42,
      'boxy'
    ),
    bodyMaterial
  ), 'proxy');
  cab.position.set(0, wheelRadius + dimensions.height * 0.25, dimensions.length * 0.24);
  cab.visible = false;
  group.add(cab);

  const cargo = tagMesh(new THREE.Mesh(
    new THREE.BoxGeometry(
      dimensions.width * 0.8,
      dimensions.height * 0.34,
      dimensions.length * 0.48
    ),
    bodyMaterial
  ), 'proxy');
  cargo.position.set(0, wheelRadius + dimensions.height * 0.22, -dimensions.length * 0.18);
  cargo.visible = false;
  group.add(cargo);
  group.add(createLowPolyWheels({
    count: profile.wheels,
    length: dimensions.length,
    width: dimensions.width,
    radius: wheelRadius,
    y: wheelRadius,
    material: rubberMaterial
  }));
}

function addProxyTurret(root, dimensions, bodyMaterial, metalMaterial) {
  if (!root.userData.turret) return;
  const sourceTurret = root.userData.turret;
  const turret = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(
      dimensions.width * 0.18,
      dimensions.width * 0.24,
      dimensions.height * 0.2,
      8
    ),
    bodyMaterial
  ), 'proxy');
  turret.position.set(
    0,
    dimensions.height * 0.7 - sourceTurret.position.y,
    0
  );
  turret.visible = false;
  sourceTurret.add(turret);

  const barrel = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(
      dimensions.width * 0.018,
      dimensions.width * 0.025,
      dimensions.length * 0.26,
      6
    ),
    metalMaterial
  ), 'proxy');
  const sourceBarrel = root.userData.barrel;
  if (sourceBarrel) {
    // Standalone factories rotate the barrel object; legacy factories rotate
    // its geometry. Match either convention while inheriting recoil position.
    barrel.rotation.x = Math.abs(sourceBarrel.rotation.x) > Math.PI / 4
      ? 0
      : Math.PI / 2;
    barrel.position.set(0, 0, 0);
    sourceBarrel.add(barrel);
  } else {
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(
      0,
      dimensions.height * 0.72 - sourceTurret.position.y,
      dimensions.length * 0.18
    );
    sourceTurret.add(barrel);
  }
  barrel.visible = false;
  root.userData.proxyTurret = turret;
  root.userData.proxyBarrel = barrel;
}

function addAuthoredDetails(root, primaryHull, dimensions, profile, metalMaterial) {
  if (profile.kind === 'tracked') {
    for (const side of [-1, 1]) {
      const guard = tagMesh(new THREE.Mesh(
        new THREE.BoxGeometry(dimensions.width * 0.08, 0.06, dimensions.length * 0.82),
        primaryHull.material
      ), 'medium');
      guard.position.set(
        side * dimensions.width * 0.43,
        dimensions.height * 0.42,
        0
      );
      root.add(guard);
    }
  }

  const detailParent = root.userData.turret ?? root;
  const antenna = tagMesh(new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.02, dimensions.height * 0.42, 5),
    metalMaterial
  ), 'high');
  antenna.position.set(
    dimensions.width * 0.22,
    root.userData.turret ? dimensions.height * 0.32 : dimensions.height * 0.75,
    -dimensions.length * 0.06
  );
  detailParent.add(antenna);

  if (!['riveted', 'boxy'].includes(profile.hull)) return;
  const rivetCount = 12;
  const rivets = new THREE.InstancedMesh(
    new THREE.SphereGeometry(Math.max(0.025, dimensions.width * 0.012), 5, 4),
    metalMaterial,
    rivetCount
  );
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < rivetCount; index++) {
    const side = index < rivetCount / 2 ? -1 : 1;
    const along = index % (rivetCount / 2);
    matrix.makeTranslation(
      side * dimensions.width * 0.415,
      dimensions.height * 0.48,
      -dimensions.length * 0.32 + along * dimensions.length * 0.128
    );
    rivets.setMatrixAt(index, matrix);
  }
  rivets.instanceMatrix.needsUpdate = true;
  rivets.name = 'AuthoredRivets';
  tagMesh(rivets, 'high');
  root.add(rivets);
}

export function enhanceVehicleModel(root) {
  if (root.userData.vehicleEnhancementVersion === VEHICLE_ENHANCEMENT_VERSION) {
    return root;
  }
  const profile = VEHICLE_PROFILES[root.name];
  const metadata = root.userData.modelMetadata;
  if (!profile || !metadata?.dimensionsMeters) return root;

  const primaryHull = findPrimaryHull(root);
  if (!primaryHull) return root;

  if (profile.kind !== 'truck' && !primaryHull.userData.authoredHull && !root.userData.authoredHull) {
    const size = getGeometrySize(primaryHull);
    primaryHull.geometry.dispose();
    primaryHull.geometry = createSectionedHullGeometry(size.z, size.x, size.y, profile.hull);
    primaryHull.userData.authoredHull = true;
  }

  const metalMaterial = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#171a18',
    roughness: 0.88,
    metalness: 0.18
  }), 'metal');
  const trackMaterial = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#232622',
    roughness: 0.92,
    metalness: 0.32
  }), 'track');
  const rubberMaterial = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#1d201d',
    roughness: 0.95,
    metalness: 0.01
  }), 'rubber');
  addAuxiliaryWeaponMounts(root, metalMaterial);
  removeOldProxy(root);
  const proxyGroup = new THREE.Group();
  proxyGroup.name = 'FidelityProxy';
  const dimensions = metadata.dimensionsMeters;
  if (profile.kind === 'tracked') {
    addTrackedProxy(
      proxyGroup,
      dimensions,
      primaryHull.material,
      trackMaterial,
      rubberMaterial,
      profile
    );
  } else if (profile.kind === 'armoredCar') {
    addArmoredCarProxy(proxyGroup, dimensions, primaryHull.material, rubberMaterial, profile);
  } else {
    addTruckProxy(
      proxyGroup,
      dimensions,
      primaryHull.material,
      metalMaterial,
      rubberMaterial,
      profile
    );
  }
  addProxyTurret(root, dimensions, primaryHull.material, metalMaterial);
  root.add(proxyGroup);
  addAuthoredDetails(root, primaryHull, dimensions, profile, metalMaterial);
  const materialPack = applyVehicleMaterialPack(root);

  root.userData.modelMetadata = {
    ...metadata,
    fidelityPass: 'authored-v2',
    hullConstruction: profile.hull,
    wheelOrTrackLayout: profile.kind === 'tracked'
      ? `${profile.wheels} road wheels per side`
      : `${profile.wheels} wheels`,
    materialPack,
    materialSlots: materialPack.slots,
    lodLevels: ['high', 'medium', 'core', 'proxy'],
    lodModelCount: 4
  };
  root.userData.vehicleEnhancementVersion = VEHICLE_ENHANCEMENT_VERSION;
  return root;
}
