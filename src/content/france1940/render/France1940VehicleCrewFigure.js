import * as THREE from 'three';

function markCore(object, surfaceRole) {
  object.userData.lodBand = 'core';
  object.userData.surfaceRole = surfaceRole;
  object.castShadow = true;
  return object;
}

function createBinoculars() {
  const group = new THREE.Group();
  group.name = 'CommanderBinoculars';
  const material = new THREE.MeshStandardMaterial({
    color: '#20251f',
    metalness: 0.35,
    roughness: 0.58
  });
  const tubeGeometry = new THREE.CylinderGeometry(0.035, 0.045, 0.18, 8);
  tubeGeometry.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const tube = markCore(
      new THREE.Mesh(tubeGeometry, material),
      'binocular-tube'
    );
    tube.position.set(side * 0.052, 0.08, 0.13);
    group.add(tube);
  }
  const bridge = markCore(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.035, 0.045),
      material
    ),
    'binocular-bridge'
  );
  bridge.position.set(0, 0.08, 0.12);
  group.add(bridge);
  return group;
}

function createFrenchTankerHeadgear() {
  const group = new THREE.Group();
  group.name = 'FrenchM1935TankerHelmetApproximation';
  const material = new THREE.MeshStandardMaterial({
    color: '#4d4934',
    roughness: 0.88
  });
  const cap = markCore(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
      material
    ),
    'french-tanker-helmet'
  );
  cap.scale.z = 1.08;
  group.add(cap);
  const brow = markCore(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.07, 0.09),
      material
    ),
    'french-tanker-helmet-brow'
  );
  brow.position.set(0, -0.02, 0.13);
  group.add(brow);
  return group;
}

function createGermanPanzerProtectiveBeret() {
  const group = new THREE.Group();
  group.name = 'GermanPanzerProtectiveBeret1940';
  const material = new THREE.MeshStandardMaterial({
    color: '#111310',
    roughness: 0.92
  });
  const paddedRing = markCore(
    new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.048, 7, 16),
      material
    ),
    'german-panzer-protective-beret-padded-ring'
  );
  paddedRing.rotation.x = Math.PI / 2;
  paddedRing.scale.z = 1.08;
  group.add(paddedRing);
  const crown = markCore(
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.17,
        12,
        7,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.55
      ),
      material
    ),
    'german-panzer-protective-beret-crown'
  );
  crown.position.y = 0.015;
  crown.scale.set(1.12, 0.48, 1.06);
  group.add(crown);
  return group;
}

export function createFrance1940VehicleCrewFigure(faction, {
  vehicleId = null,
  commanderRole = null,
  headgearId = null,
  fullBody = false
} = {}) {
  if (!['french', 'german'].includes(faction)) {
    throw new Error(`Unsupported France 1940 vehicle crew faction ${faction}`);
  }
  const isFrench = faction === 'french';
  const group = new THREE.Group();
  group.name = `${isFrench ? 'French' : 'German'}UnbuttonedCommander`;
  group.userData.presentationModel =
    'first-order-unbuttoned-commander-v1';
  group.userData.vehicleId = vehicleId;
  group.userData.commanderRole = commanderRole;
  group.userData.headgearId = headgearId ?? (
    isFrench
      ? 'FRENCH_M1935_TANKER_HELMET'
      : 'GERMAN_PANZER_PROTECTIVE_BERET_1940'
  );
  group.userData.dataQuality = [
    'commander exposure and binocular pose are gameplay/render approximations',
    isFrench
      ? 'French M1935-style tanker headgear identity is a renderer approximation pending source-calibrated crew assets'
      : 'German black padded Panzer protective-beret identity is historical for 1940; procedural dimensions remain approximate'
  ].join('; ');

  const uniform = new THREE.MeshStandardMaterial({
    color: isFrench ? '#53604d' : '#171a18',
    roughness: 0.92
  });
  const skin = new THREE.MeshStandardMaterial({
    color: '#b98768',
    roughness: 0.86
  });
  const torso = markCore(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.25, 0.38, 10),
      uniform
    ),
    'exposed-commander-torso'
  );
  torso.position.y = -0.13;
  group.add(torso);
  if (fullBody) {
    const pelvis = markCore(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.2, 0.22),
        uniform
      ),
      'dismounted-crew-pelvis'
    );
    pelvis.position.y = -0.39;
    group.add(pelvis);
    for (const side of [-1, 1]) {
      const leg = markCore(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.09, 0.62, 8),
          uniform
        ),
        'dismounted-crew-leg'
      );
      leg.position.set(side * 0.105, -0.77, 0);
      group.add(leg);
    }
    group.userData.presentationModel =
      'first-order-dismounted-vehicle-crew-v1';
  }
  const head = markCore(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 10),
      skin
    ),
    'exposed-commander-head'
  );
  head.scale.set(0.92, 1.08, 0.94);
  head.position.y = 0.16;
  group.add(head);
  const headgear = isFrench
    ? createFrenchTankerHeadgear()
    : createGermanPanzerProtectiveBeret();
  headgear.position.y = 0.26;
  group.add(headgear);
  if (!fullBody) {
    const binoculars = createBinoculars();
    binoculars.position.y = 0.17;
    group.add(binoculars);
  }
  return group;
}

export const FRANCE_1940_VEHICLE_CREW_FIGURES = Object.freeze({
  french: options => createFrance1940VehicleCrewFigure('french', options),
  german: options => createFrance1940VehicleCrewFigure('german', options)
});
