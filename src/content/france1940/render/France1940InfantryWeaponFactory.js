import * as THREE from 'three';
import { lateralX } from '../../../world/LocalFrame.js';
import { BERTHIER_M1892_M16_VISUAL_DATA } from './BerthierM1892M16VisualData.js';
import { FM2429_VISUAL_DATA } from './Fm2429VisualData.js';
import {
  LEBEL_M1886_M93_APX1916_VISUAL_DATA,
  LEBEL_M1886_M93_VISUAL_DATA
} from './LebelM1886M93VisualData.js';
import { LEBEL_M1886_M93_REFERENCE_MESH_DATA } from './LebelM1886M93ReferenceMeshData.js';
import { KAR98K_VISUAL_DATA } from './Kar98kVisualData.js';
import { MAS38_VISUAL_DATA } from './Mas38VisualData.js';
import { MAS38_REFERENCE_MESH_DATA } from './Mas38ReferenceMeshData.js';
import { MG34_VISUAL_DATA } from './Mg34VisualData.js';
import { MAS36_VISUAL_DATA } from './Mas36VisualData.js';

// Visual dimensions are metres. Overall lengths are historical nominal values;
// sectional dimensions are inferred proportions unless a source-backed visual
// record, such as the MAS-36 bundle, classifies them more precisely.
export const FRANCE_1940_INFANTRY_WEAPON_VISUALS = Object.freeze({
  'Lebel Mle 1886/93': Object.freeze({
    ...LEBEL_M1886_M93_VISUAL_DATA.visualSpec
  }),
  'Lebel Mle 1886/93 with APX 1916': Object.freeze({
    ...LEBEL_M1886_M93_APX1916_VISUAL_DATA.visualSpec
  }),
  'Berthier Mousqueton Mle 1892 M16': Object.freeze({
    ...BERTHIER_M1892_M16_VISUAL_DATA.visualSpec
  }),
  'MAS-36 Rifle': Object.freeze({
    ...MAS36_VISUAL_DATA.visualSpec
  }),
  'FM 24/29 LMG': Object.freeze({
    ...FM2429_VISUAL_DATA.visualSpec
  }),
  'MAS-38 SMG': Object.freeze({
    ...MAS38_VISUAL_DATA.visualSpec
  }),
  Kar98k: Object.freeze({
    ...KAR98K_VISUAL_DATA.visualSpec
  }),
  'MG34 LMG': Object.freeze({
    ...MG34_VISUAL_DATA.visualSpec
  }),
  MP40: Object.freeze({
    id: 'mp40',
    designation: 'MP40',
    kind: 'smg',
    overallLength: 0.83,
    stockEnd: 0.28,
    receiverEnd: 0.58,
    handguardEnd: 0.61,
    barrelRadius: 0.012,
    magazine: 'bottom-box',
    definingFeatures: ['folding metal stock', 'bottom box magazine', 'pistol grip']
  })
});

function meshPart(group, geometry, material, name, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.userData.lodBand = 'medium';
  group.add(mesh);
  return mesh;
}

function boxPart(group, material, name, width, height, startZ, endZ, y = 0) {
  return meshPart(
    group,
    new THREE.BoxGeometry(width, height, endZ - startZ),
    material,
    name,
    [0, y, (startZ + endZ) * 0.5]
  );
}

function profilePart(group, material, name, shape, width, zOffset, yOffset = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 8
  });
  // Shape X is the authored forward coordinate. Center the extrusion depth,
  // then rotate it into the weapon's narrow X width without reflecting faces.
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(0, 0, -zOffset);
  const mesh = meshPart(group, geometry, material, name, [0, yOffset, zOffset]);
  return mesh;
}

function cylinderPart(group, material, name, radius, startZ, endZ, x = 0, y = 0, sides = 8) {
  const geometry = new THREE.CylinderGeometry(radius, radius, endZ - startZ, sides);
  geometry.rotateX(Math.PI / 2);
  return meshPart(group, geometry, material, name, [x, y, (startZ + endZ) * 0.5]);
}

function cylinderBetweenPart(group, material, name, radius, start, end, sides = 8) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  if (!(length > 0)) throw new Error(`${name} requires distinct endpoints`);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides);
  const part = meshPart(
    group,
    geometry,
    material,
    name,
    startPoint.add(endPoint).multiplyScalar(0.5).toArray()
  );
  part.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  part.userData.connectionStart = Object.freeze([...start]);
  part.userData.connectionEnd = Object.freeze([...end]);
  return part;
}

function revolvedProfilePart(group, material, name, sections, sides = 12) {
  const points = sections.map(section => new THREE.Vector2(section.radius, section.z));
  const geometry = new THREE.LatheGeometry(points, sides);
  geometry.rotateX(Math.PI / 2);
  return meshPart(group, geometry, material, name, [0, 0, 0]);
}

function perforatedCylinderPart(group, material, name, radius, startZ, endZ, holes, holeRadius, radialSegments = 32) {
  const zStops = new Set([startZ, endZ]);
  for (const centerZ of holes) {
    for (const offset of [-1, -0.5, 0, 0.5, 1]) {
      zStops.add(THREE.MathUtils.clamp(centerZ + offset * holeRadius, startZ, endZ));
    }
  }
  const rows = [...zStops].sort((left, right) => left - right);
  const positions = [];
  const normals = [];
  const uvs = [];
  const addVertex = (theta, z) => {
    positions.push(Math.cos(theta) * radius, Math.sin(theta) * radius, z);
    normals.push(Math.cos(theta), Math.sin(theta), 0);
    uvs.push(theta / (Math.PI * 2), (z - startZ) / (endZ - startZ));
  };

  for (let row = 0; row < rows.length - 1; row += 1) {
    const z0 = rows[row];
    const z1 = rows[row + 1];
    const zMid = (z0 + z1) * 0.5;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const theta0 = segment / radialSegments * Math.PI * 2;
      const theta1 = (segment + 1) / radialSegments * Math.PI * 2;
      const thetaMid = (theta0 + theta1) * 0.5;
      const omitted = holes.some(centerZ => {
        const dz = Math.abs(zMid - centerZ);
        if (dz >= holeRadius) return false;
        const halfChord = Math.sqrt(holeRadius * holeRadius - dz * dz);
        const halfAngle = Math.asin(Math.min(1, halfChord / radius));
        const sideAngle = Math.min(
          Math.abs(Math.atan2(Math.sin(thetaMid), Math.cos(thetaMid))),
          Math.abs(Math.atan2(Math.sin(thetaMid - Math.PI), Math.cos(thetaMid - Math.PI)))
        );
        return sideAngle < halfAngle;
      });
      if (omitted) continue;
      addVertex(theta0, z0);
      addVertex(theta1, z0);
      addVertex(theta1, z1);
      addVertex(theta0, z0);
      addVertex(theta1, z1);
      addVertex(theta0, z1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const part = meshPart(group, geometry, material, name, [0, 0, 0]);
  part.userData.holeStations = Object.freeze([...holes]);
  part.userData.holeRadius = holeRadius;
  return part;
}

function decodeBase64TypedArray(encoded, count, bytesPerValue, readValue) {
  const binary = atob(encoded);
  if (binary.length !== count * bytesPerValue) {
    throw new Error(`Reference mesh payload length ${binary.length} does not match ${count}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  return Array.from({ length: count }, (_, index) => (
    readValue(view, index * bytesPerValue)
  ));
}

function referenceMeshPart(group, material, name, meshData, correctPosition = null) {
  if (meshData.positionEncoding !== 'float32-le-base64') {
    throw new Error(`${name} has unsupported position encoding`);
  }
  if (meshData.indexEncoding !== 'uint16-le-base64') {
    throw new Error(`${name} has unsupported index encoding`);
  }
  const positions = new Float32Array(decodeBase64TypedArray(
    meshData.positionBase64,
    meshData.vertexCount * 3,
    Float32Array.BYTES_PER_ELEMENT,
    (view, offset) => view.getFloat32(offset, true)
  ));
  const indices = new Uint16Array(decodeBase64TypedArray(
    meshData.indexBase64,
    meshData.indexCount,
    Uint16Array.BYTES_PER_ELEMENT,
    (view, offset) => view.getUint16(offset, true)
  ));
  let correctedVertexCount = 0;
  if (correctPosition) {
    for (let offset = 0; offset < positions.length; offset += 3) {
      correctedVertexCount += correctPosition(positions, offset) ? 1 : 0;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  for (const group of meshData.groups ?? []) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const part = meshPart(group, geometry, material, name, [0, 0, 0]);
  part.userData.sourceNodeName = meshData.sourceNodeName;
  part.userData.sourceTriangleCount = meshData.triangleCount;
  part.userData.correctedVertexCount = correctedVertexCount;
  part.userData.geometryProvenance = 'normalized user-supplied GLB topology';
  return part;
}

function profileShape(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].z, points[0].y);
  for (const point of points.slice(1)) shape.lineTo(point.z, point.y);
  shape.closePath();
  return shape;
}

function profileShapeWithHole(outerPoints, innerPoints) {
  const outer = outerPoints.map(point => new THREE.Vector2(point.z, point.y));
  const inner = innerPoints.map(point => new THREE.Vector2(point.z, point.y));
  if (!THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  if (THREE.ShapeUtils.isClockWise(inner)) inner.reverse();

  const shape = new THREE.Shape(outer);
  shape.holes.push(new THREE.Path(inner));
  return shape;
}

function pointSegmentDistanceSquared(point, start, end) {
  const dz = end.z - start.z;
  const dy = end.y - start.y;
  const lengthSquared = dz * dz + dy * dy;
  if (lengthSquared <= 1e-12) {
    const pointZ = point.z - start.z;
    const pointY = point.y - start.y;
    return pointZ * pointZ + pointY * pointY;
  }
  const projection = THREE.MathUtils.clamp(
    ((point.z - start.z) * dz + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );
  const projectedZ = start.z + dz * projection;
  const projectedY = start.y + dy * projection;
  const pointZ = point.z - projectedZ;
  const pointY = point.y - projectedY;
  return pointZ * pointZ + pointY * pointY;
}

function simplifyProfile(points, tolerance) {
  if (points.length <= 4 || !(tolerance > 0)) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const toleranceSquared = tolerance * tolerance;
  const ranges = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop();
    let farthestIndex = -1;
    let farthestDistance = toleranceSquared;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointSegmentDistanceSquared(
        points[index],
        points[startIndex],
        points[endIndex]
      );
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex < 0) continue;
    keep[farthestIndex] = 1;
    ranges.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
  }
  return points.filter((_point, index) => keep[index] === 1);
}

function markWeaponLodRepresentation(roots, tier, visible) {
  const meshes = [];
  const seen = new Set();
  for (const root of Array.isArray(roots) ? roots : [roots]) {
    root.traverse(object => {
      if (!object.isMesh || seen.has(object)) return;
      seen.add(object);
      object.userData.weaponLodTier = tier;
      object.userData.lodBand = tier;
      object.visible = visible;
      meshes.push(object);
    });
  }
  return meshes;
}

function meshTriangleCount(meshes) {
  return meshes.reduce((count, mesh) => (
    count + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3
  ), 0);
}

function installWeaponLodContract(model, visualData, highMeshes, mediumGroup, coreGroup) {
  const mediumMeshes = markWeaponLodRepresentation(mediumGroup, 'medium', false);
  const coreMeshes = markWeaponLodRepresentation(coreGroup, 'core', false);
  const representations = Object.freeze({
    high: Object.freeze([...highMeshes]),
    medium: Object.freeze(mediumMeshes),
    core: Object.freeze(coreMeshes)
  });
  model.userData.weaponLodRepresentations = representations;
  model.userData.weaponLodContract = Object.freeze({
    distancesMetres: Object.freeze({
      highMax: visualData.lodDistances.highMax,
      mediumMax: visualData.lodDistances.mediumMax
    }),
    classification: visualData.lodDistances.classification,
    triangleCounts: Object.freeze(Object.fromEntries(
      Object.entries(representations).map(([tier, meshes]) => [
        tier,
        meshTriangleCount(meshes)
      ])
    ))
  });
  return representations;
}

function firingHandHeight(parts) {
  if (parts.pistolGrip) return parts.pistolGrip.position.y;
  const triggerGuard = parts.triggerGuard;
  triggerGuard.geometry.computeBoundingBox();
  return triggerGuard.position.y + triggerGuard.geometry.boundingBox.min.y;
}

function storeBipodRestTransform(leg) {
  leg.userData.bipodRestPosition = Object.freeze(leg.position.toArray());
  leg.userData.bipodRestRotation = Object.freeze([
    leg.rotation.x,
    leg.rotation.y,
    leg.rotation.z
  ]);
  return leg;
}

function addBipod(model, spec, metalMaterial) {
  const geometry = new THREE.CylinderGeometry(0.008, 0.009, 0.34, 5);
  const left = meshPart(
    model,
    geometry,
    metalMaterial,
    `${spec.designation}_Bipod_Left`,
    [-0.02, -0.015, spec.handguardEnd - 0.09]
  );
  left.rotation.x = Math.PI / 2;
  storeBipodRestTransform(left);

  const right = meshPart(
    model,
    geometry,
    metalMaterial,
    `${spec.designation}_Bipod_Right`,
    [0.02, -0.015, spec.handguardEnd - 0.09]
  );
  right.rotation.x = Math.PI / 2;
  storeBipodRestTransform(right);

  return { left, right };
}

function addMp40FoldingStock(model, spec, metalMaterial) {
  const rodGeometry = new THREE.CylinderGeometry(0.006, 0.006, spec.stockEnd, 5);
  rodGeometry.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    meshPart(
      model,
      rodGeometry,
      metalMaterial,
      `MP40_FoldingStock_${side < 0 ? 'Left' : 'Right'}`,
      [side * 0.045, -0.025, spec.stockEnd * 0.5]
    );
  }
  boxPart(model, metalMaterial, 'MP40_ButtPlate', 0.13, 0.018, 0, 0.035, -0.025);
}

function addMagazine(model, spec, metalMaterial) {
  if (spec.magazine === 'internal') {
    const magazine = boxPart(
      model,
      metalMaterial,
      `${spec.designation}_InternalMagazineFloorplate`,
      0.085,
      0.018,
      spec.stockEnd + 0.025,
      spec.receiverEnd - 0.025,
      -0.055
    );
    magazine.userData.feedType = 'internal';
    return magazine;
  }
  if (spec.magazine === 'top-box') {
    const magazine = boxPart(
      model,
      metalMaterial,
      'FM2429_TopMagazine',
      0.085,
      0.18,
      spec.stockEnd + 0.07,
      spec.stockEnd + 0.18,
      0.12
    );
    magazine.rotation.x = -0.08;
    magazine.userData.feedType = 'top';
    return magazine;
  }
  if (spec.magazine === 'side-drum') {
    const geometry = new THREE.CylinderGeometry(0.085, 0.085, 0.055, 14);
    geometry.rotateZ(Math.PI / 2);
    const magazine = meshPart(
      model,
      geometry,
      metalMaterial,
      'MG34_Patronentrommel34',
      [0.075, -0.015, spec.stockEnd + 0.18]
    );
    magazine.userData.feedType = 'side-drum';
    return magazine;
  }
  if (spec.id === 'mas38') {
    const magWell = boxPart(
      model,
      metalMaterial,
      'MAS38_MagWell',
      0.034,
      0.038,
      spec.stockEnd + 0.075,
      spec.stockEnd + 0.135,
      -0.032
    );
    magWell.userData.lodBand = 'high';
  }

  const magWidth = spec.id === 'mas38' ? 0.024 : (spec.id === 'mp40' ? 0.028 : 0.045);
  const magHeight = spec.id === 'mas38' ? 0.16 : (spec.id === 'mp40' ? 0.20 : 0.18);
  const magEndZ = spec.stockEnd + (spec.id === 'mas38' ? 0.125 : 0.15);

  const magazine = boxPart(
    model,
    metalMaterial,
    `${spec.designation}_BoxMagazine`,
    magWidth,
    magHeight,
    spec.stockEnd + 0.08,
    magEndZ,
    spec.id === 'mas38' ? -0.11 : -0.13
  );
  magazine.rotation.x = spec.id === 'mas38' ? 0.22 : -0.03;
  magazine.userData.feedType = 'bottom';
  return magazine;
}

function addFireControls(model, spec, materials) {
  const triggerGuardGeometry = new THREE.TorusGeometry(0.032, 0.006, 5, 10);
  triggerGuardGeometry.rotateY(Math.PI / 2);
  const triggerGuard = meshPart(
    model,
    triggerGuardGeometry,
    materials.metal,
    `${spec.designation}_TriggerGuard`,
    [0, -0.055, Math.max(0.14, spec.stockEnd - 0.018)]
  );

  let pistolGrip = null;
  if (['fm2429', 'mas38', 'mg34', 'mp40'].includes(spec.id)) {
    pistolGrip = meshPart(
      model,
      new THREE.BoxGeometry(0.065, spec.id === 'mp40' ? 0.17 : 0.145, 0.075),
      spec.id === 'mas38' ? materials.wood : materials.metal,
      `${spec.designation}_PistolGrip`,
      [0, -0.105, spec.stockEnd + 0.018]
    );
    pistolGrip.rotation.x = spec.id === 'mas38' ? -0.22 : -0.16;
  }

  let boltHandle = null;
  let chargingHandle = null;
  let ejectionPort = null;
  const handleZ = spec.stockEnd + (spec.receiverEnd - spec.stockEnd) * 0.52;
  const stemGeometry = new THREE.CylinderGeometry(0.007, 0.007, 0.105, 5);
  stemGeometry.rotateZ(Math.PI / 2);
  if (['mas36', 'kar98k'].includes(spec.id)) {
    boltHandle = meshPart(
      model,
      stemGeometry,
      materials.metal,
      `${spec.designation}_BoltHandle`,
      [lateralX('right', 0.07), 0.005, handleZ]
    );
    boltHandle.userData.semanticSide = 'right';
    const boltKnob = meshPart(
      model,
      new THREE.SphereGeometry(0.018, 6, 4),
      materials.metal,
      `${spec.designation}_BoltKnob`,
      [lateralX('right', 0.125), spec.id === 'mas36' ? -0.008 : 0.005, handleZ]
    );
    boltKnob.userData.semanticSide = 'right';
    boltHandle.userData.knob = boltKnob;
    ejectionPort = meshPart(
      model,
      new THREE.BoxGeometry(0.009, 0.026, 0.075),
      materials.metal,
      `${spec.designation}_EjectionPort`,
      [lateralX('right', 0.046), 0.014, handleZ + 0.025]
    );
    ejectionPort.userData.semanticSide = 'right';
  } else {
    const handleSide = ['fm2429', 'mas38', 'mg34'].includes(spec.id) ? 'right' : 'left';
    chargingHandle = meshPart(
      model,
      stemGeometry,
      materials.metal,
      `${spec.designation}_ChargingHandle`,
      [lateralX(handleSide, 0.075), 0.012, handleZ]
    );
    chargingHandle.userData.semanticSide = handleSide;
  }
  return { triggerGuard, pistolGrip, boltHandle, chargingHandle, ejectionPort };
}

function buildMas36(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;

  const { profiles, stations, widths } = MAS36_VISUAL_DATA;
  const stockEnd = stations.stockNose;
  const receiverEnd = stations.receiverEnd;
  const realHandguardEnd = stations.handguardEnd;
  const frontRingStart = stations.frontBandStart;
  const frontRingEnd = stations.frontBandEnd;

  // 1. Source-registered butt, comb notch, wrist, and lower stock sweep.
  const stock = profilePart(
    model,
    materials.wood,
    `${spec.designation}_Stock`,
    profileShape(profiles.stock),
    widths.stock,
    stockEnd * 0.5,
    0
  );

  // 2. The receiver overlaps the stock wrist; the old single station lost this step.
  const receiver = profilePart(
    model,
    materials.metal,
    `${spec.designation}_Receiver`,
    profileShape(profiles.receiver),
    widths.receiver,
    (stations.receiverStart + receiverEnd) * 0.5,
    0
  );
  const boltBodySpec = MAS36_VISUAL_DATA.controls.boltBody;
  const boltBody = cylinderPart(
    model,
    materials.metal,
    `${spec.designation}_BoltBody`,
    boltBodySpec.radius,
    boltBodySpec.startZ,
    boltBodySpec.endZ,
    0,
    boltBodySpec.y,
    16
  );
  const receiverTang = boxPart(
    model,
    materials.metal,
    `${spec.designation}_ReceiverTang`,
    widths.receiver,
    0.045,
    stockEnd,
    stations.receiverTangEnd,
    -0.0325
  );
  const receiverTopDetails = MAS36_VISUAL_DATA.controls.receiverTopDetails.map(detail => {
    const part = boxPart(
      model,
      materials.metal,
      `${spec.designation}_${detail.name}`,
      widths.receiver,
      detail.topY - detail.bottomY,
      detail.startZ,
      detail.endZ,
      (detail.topY + detail.bottomY) * 0.5
    );
    part.userData.lodBand = 'core';
    return part;
  });

  // Internal magazine floorplate under receiver
  const magazine = boxPart(model, materials.metal, `${spec.designation}_InternalMagazineFloorplate`, 0.036, 0.015, stockEnd + 0.02, receiverEnd - 0.02, -0.045);
  magazine.userData.feedType = 'internal';

  // Trigger guard
  const triggerGuardSpec = MAS36_VISUAL_DATA.controls.triggerGuard;
  const triggerGuard = profilePart(
    model,
    materials.metal,
    `${spec.designation}_TriggerGuard`,
    profileShapeWithHole(triggerGuardSpec.outer, triggerGuardSpec.inner),
    0.012,
    triggerGuardSpec.z,
    0
  );
  const trigger = profilePart(
    model,
    materials.metal,
    `${spec.designation}_Trigger`,
    profileShape(triggerGuardSpec.trigger),
    0.010,
    triggerGuardSpec.z,
    0
  );

  // Dog-leg bolt handle (characteristic forward-angled bolt handle on right side)
  const boltKnobPosition = [lateralX('right', 0.047), -0.012, stockEnd + 0.045];
  const boltHandle = cylinderBetweenPart(
    model,
    materials.metal,
    `${spec.designation}_BoltHandle`,
    0.005,
    [lateralX('right', widths.receiver * 0.5), 0.005, stockEnd + 0.06],
    boltKnobPosition,
    8
  );
  boltHandle.userData.semanticSide = 'right';
  const boltKnob = meshPart(
    model,
    new THREE.SphereGeometry(0.011, 8, 6),
    materials.metal,
    `${spec.designation}_BoltKnob`,
    boltKnobPosition
  );
  boltKnob.userData.semanticSide = 'right';
  boltHandle.userData.knob = boltKnob;

  // 3. Separate fore-end and upper handguard retain the source's horizontal seam.
  const handguard = profilePart(
    model,
    materials.wood,
    `${spec.designation}_Handguard`,
    profileShape(profiles.lowerHandguard),
    widths.lowerHandguard,
    (receiverEnd + realHandguardEnd) * 0.5,
    0
  );
  const upperHandguard = profilePart(
    model,
    materials.wood,
    `${spec.designation}_UpperHandguard`,
    profileShape(profiles.upperHandguard),
    widths.upperHandguard,
    (receiverEnd + realHandguardEnd) * 0.5,
    0
  );

  // Ejection port on right side
  const ejectionPort = meshPart(
    model,
    new THREE.BoxGeometry(0.009, 0.018, 0.075),
    materials.metal,
    `${spec.designation}_EjectionPort`,
    [lateralX('right', 0.016), 0.005, stockEnd + 0.095]
  );
  ejectionPort.userData.semanticSide = 'right';
  ejectionPort.userData.envelopeRole = 'surfaceDetail';

  // 4. Barrel from the receiver to the historical overall length.
  const barrel = cylinderPart(model, materials.metal, `${spec.designation}_Barrel`, spec.barrelRadius, receiverEnd, spec.overallLength);

  // 5. Metal Barrel Bands (Mid Ring and Front Cap) - made wider/thicker than wood furniture (width 0.048 / 0.046 vs wood 0.038)
  const midBandSpec = MAS36_VISUAL_DATA.controls.midBand;
  const midRingBottom = midBandSpec.woodBottomY - midBandSpec.protrusion;
  const midRingTop = midBandSpec.woodTopY + midBandSpec.protrusion;
  const midRing = boxPart(
    model,
    materials.metal,
    `${spec.designation}_MidRing`,
    widths.midBand,
    midRingTop - midRingBottom,
    stations.midBandStart,
    stations.midBandEnd,
    (midRingTop + midRingBottom) * 0.5
  );

  // Front cap metal band meeting the end of the wooden furniture.
  const frontRing = boxPart(model, materials.metal, `${spec.designation}_FrontRing`, widths.frontBand, 0.044, frontRingStart, frontRingEnd, -0.005);

  // The assembled side elevation shows a compact rectangular hood, not the
  // generic 30 mm circular tunnel used by the previous approximation.
  const frontSightSpec = MAS36_VISUAL_DATA.controls.frontSight;
  const frontSight = boxPart(
    model,
    materials.metal,
    `${spec.designation}_FrontSight`,
    0.024,
    frontSightSpec.topY - frontSightSpec.bottomY,
    frontSightSpec.startZ,
    frontSightSpec.endZ,
    (frontSightSpec.topY + frontSightSpec.bottomY) * 0.5
  );
  frontSight.userData.semanticPart = 'frontSight';

  // Reversed-bayonet storage tube emerging forward from the front band.
  const bayonetTube = cylinderPart(model, materials.metal, `${spec.designation}_BayonetTube`, 0.006, frontRingStart, stations.bayonetTubeEnd, 0, -0.022);

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const coreSilhouette = [
    stock,
    receiver,
    boltBody,
    receiverTang,
    ...receiverTopDetails,
    handguard,
    upperHandguard,
    barrel,
    frontSight,
    triggerGuard,
    bayonetTube
  ];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  model.userData.visualContract = {
    units: 'metres',
    overallLength: spec.overallLength,
    source: MAS36_VISUAL_DATA.source,
    ...spec
  };
  model.userData.parts = { stock, receiver, boltBody, receiverTang, receiverTopDetails, handguard, upperHandguard, barrel, magazine, muzzle, frontSight, triggerGuard, trigger, boltHandle, ejectionPort, chargingHandle: null, coreSilhouette };
  return model;
}

function buildBerthierLodRepresentation(spec, materials, tier) {
  const group = new THREE.Group();
  group.name = `${spec.designation}_${tier}_LOD`;
  const { profiles, stations, widths, controls } = BERTHIER_M1892_M16_VISUAL_DATA;
  const medium = tier === 'medium';
  const tolerance = medium ? 0.0015 : 0.004;
  const receiverTop = Math.max(...profiles.receiver.map(point => point.y));
  const receiverBottom = Math.min(...profiles.receiver.map(point => point.y));
  const receiverRadius = (receiverTop - receiverBottom) * 0.5;

  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_Stock`,
    profileShape(simplifyProfile(profiles.stock, tolerance)),
    widths.stock,
    stations.stockNose * 0.5
  );
  cylinderPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Receiver`,
    receiverRadius,
    stations.receiverStart,
    stations.receiverEnd,
    0,
    (receiverTop + receiverBottom) * 0.5,
    medium ? 10 : 6
  );
  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_Handguard`,
    profileShape(simplifyProfile(profiles.handguard, tolerance)),
    widths.handguard,
    (stations.handguardStart + stations.handguardEnd) * 0.5
  );
  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_UpperHandguard`,
    profileShape(profiles.upperHandguard),
    widths.upperHandguard,
    (stations.handguardStart + stations.handguardEnd) * 0.5
  );
  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_ForwardUpperHandguard`,
    profileShape(profiles.forwardUpperHandguard),
    widths.forwardUpperHandguard,
    (stations.midBandEnd + stations.frontBandStart) * 0.5
  );
  const magazine = profilePart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_M16Magazine`,
    profileShape(simplifyProfile(profiles.magazine, tolerance)),
    widths.magazine,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  magazine.userData.feedType = 'en-bloc';
  const barrel = cylinderPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Barrel`,
    spec.barrelRadius,
    stations.receiverEnd,
    spec.overallLength,
    0,
    0,
    medium ? 8 : 6
  );
  barrel.userData.semanticPart = 'barrel';

  for (const [control, width, name] of [
    [controls.midBand, widths.midBand, 'MidBand'],
    [controls.frontBand, widths.frontBand, 'FrontBand']
  ]) {
    boxPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_${name}`,
      width,
      control.topY - control.bottomY,
      control.startZ,
      control.endZ,
      (control.topY + control.bottomY) * 0.5
    );
  }

  if (medium) {
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_TriggerGuard`,
      profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner),
      0.012,
      stations.receiverStart
    );
    boxPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_RearSight`,
      widths.receiver,
      controls.rearSight.topY - controls.rearSight.bottomY,
      controls.rearSight.startZ,
      controls.rearSight.endZ,
      (controls.rearSight.topY + controls.rearSight.bottomY) * 0.5
    );
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_FrontSight`,
      profileShape(profiles.frontSight),
      widths.frontSight,
      (controls.frontSight.startZ + controls.frontSight.endZ) * 0.5
    );
    const stackingRodY = (
      controls.stackingRod.topY + controls.stackingRod.bottomY
    ) * 0.5;
    cylinderPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_RightStackingRod`,
      controls.stackingRod.radius,
      controls.stackingRod.startZ,
      controls.stackingRod.endZ,
      controls.stackingRod.x,
      stackingRodY,
      6
    );
    const boltStart = [
      lateralX('right', widths.receiver * 0.5),
      controls.boltHandle.start.y,
      controls.boltHandle.start.z
    ];
    const boltEnd = [
      lateralX('right', 0.035),
      controls.boltHandle.end.y,
      controls.boltHandle.end.z
    ];
    cylinderBetweenPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_BoltHandle`,
      controls.boltHandle.stemRadius,
      boltStart,
      boltEnd,
      6
    ).userData.semanticSide = 'right';
    const knob = meshPart(
      group,
      new THREE.SphereGeometry(controls.boltHandle.knobRadius, 6, 4),
      materials.metal,
      `${spec.designation}_${tier}_BoltKnob`,
      [
        lateralX('right', 0.035),
        controls.boltHandle.knobCenter.y,
        controls.boltHandle.knobCenter.z
      ]
    );
    knob.userData.semanticSide = 'right';
  }
  return group;
}

function buildBerthierM1892M16(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;
  const { profiles, stations, widths, controls } = BERTHIER_M1892_M16_VISUAL_DATA;

  const stock = profilePart(
    model, materials.wood, `${spec.designation}_Stock`,
    profileShape(profiles.stock), widths.stock, stations.stockNose * 0.5
  );
  const receiverTop = Math.max(...profiles.receiver.map(point => point.y));
  const receiverBottom = Math.min(...profiles.receiver.map(point => point.y));
  const receiverRadius = (receiverTop - receiverBottom) * 0.5;
  const receiver = cylinderPart(
    model, materials.metal, `${spec.designation}_ReceiverTube`,
    receiverRadius, stations.receiverStart, stations.receiverEnd,
    0, (receiverTop + receiverBottom) * 0.5, 20
  );
  const handguard = profilePart(
    model, materials.wood, `${spec.designation}_Handguard`,
    profileShape(profiles.handguard), widths.handguard,
    (stations.handguardStart + stations.handguardEnd) * 0.5
  );
  const upperHandguard = profilePart(
    model, materials.wood, `${spec.designation}_UpperHandguard`,
    profileShape(profiles.upperHandguard), widths.upperHandguard,
    (stations.handguardStart + stations.handguardEnd) * 0.5
  );
  const forwardUpperHandguard = profilePart(
    model, materials.wood, `${spec.designation}_ForwardUpperHandguard`,
    profileShape(profiles.forwardUpperHandguard), widths.forwardUpperHandguard,
    (stations.midBandEnd + stations.frontBandStart) * 0.5
  );
  const magazine = profilePart(
    model, materials.metal, `${spec.designation}_M16Magazine`,
    profileShape(profiles.magazine), widths.magazine,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  magazine.userData.feedType = 'en-bloc';

  const triggerGuard = profilePart(
    model, materials.metal, `${spec.designation}_TriggerGuard`,
    profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner),
    0.012, stations.receiverStart
  );
  const trigger = profilePart(
    model, materials.metal, `${spec.designation}_Trigger`,
    profileShape(profiles.trigger), 0.010, stations.receiverStart
  );

  const barrel = cylinderPart(
    model, materials.metal, `${spec.designation}_Barrel`,
    spec.barrelRadius, stations.receiverEnd, spec.overallLength, 0, 0, 16
  );

  const addSourceBox = (source, width, suffix) => boxPart(
    model,
    materials.metal,
    `${spec.designation}_${suffix}`,
    width,
    source.topY - source.bottomY,
    source.startZ,
    source.endZ,
    (source.topY + source.bottomY) * 0.5
  );
  const rearSight = addSourceBox(controls.rearSight, widths.receiver, 'RearSight');
  const frontSight = profilePart(
    model,
    materials.metal,
    `${spec.designation}_FrontSight`,
    profileShape(profiles.frontSight),
    widths.frontSight,
    (controls.frontSight.startZ + controls.frontSight.endZ) * 0.5
  );
  frontSight.userData.semanticPart = 'frontSight';
  const midBand = addSourceBox(controls.midBand, widths.midBand, 'MidBand');
  const frontBand = addSourceBox(controls.frontBand, widths.frontBand, 'FrontBand');
  const stackingRodY = (controls.stackingRod.topY + controls.stackingRod.bottomY) * 0.5;
  const stackingRod = cylinderPart(
    model,
    materials.metal,
    `${spec.designation}_RightStackingRod`,
    controls.stackingRod.radius,
    controls.stackingRod.startZ,
    controls.stackingRod.endZ,
    controls.stackingRod.x,
    stackingRodY,
    10
  );
  stackingRod.userData.semanticSide = controls.stackingRod.semanticSide;
  stackingRod.userData.connectionStart = Object.freeze([
    controls.stackingRod.x,
    stackingRodY,
    controls.stackingRod.startZ
  ]);

  const boltStart = [
    lateralX('right', widths.receiver * 0.5),
    controls.boltHandle.start.y,
    controls.boltHandle.start.z
  ];
  const boltEnd = [
    lateralX('right', 0.035),
    controls.boltHandle.end.y,
    controls.boltHandle.end.z
  ];
  const boltHandle = cylinderBetweenPart(
    model, materials.metal, `${spec.designation}_BoltHandle`,
    controls.boltHandle.stemRadius, boltStart, boltEnd, 10
  );
  boltHandle.userData.semanticSide = 'right';
  const boltKnobPosition = [
    lateralX('right', 0.035),
    controls.boltHandle.knobCenter.y,
    controls.boltHandle.knobCenter.z
  ];
  const boltKnob = meshPart(
    model,
    new THREE.SphereGeometry(controls.boltHandle.knobRadius, 10, 8),
    materials.metal,
    `${spec.designation}_BoltKnob`,
    boltKnobPosition
  );
  boltKnob.userData.semanticSide = 'right';
  boltHandle.userData.knob = boltKnob;

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const detailedMeshes = [
    stock, receiver, handguard, upperHandguard, forwardUpperHandguard,
    magazine, triggerGuard, trigger,
    barrel, rearSight, frontSight, midBand, frontBand, stackingRod,
    boltHandle, boltKnob
  ];
  const highMeshes = markWeaponLodRepresentation(detailedMeshes, 'high', true);
  const mediumLod = buildBerthierLodRepresentation(spec, materials, 'medium');
  const coreLod = buildBerthierLodRepresentation(spec, materials, 'core');
  model.add(mediumLod, coreLod);
  const lodRepresentations = installWeaponLodContract(
    model,
    BERTHIER_M1892_M16_VISUAL_DATA,
    highMeshes,
    mediumLod,
    coreLod
  );

  model.userData.visualContract = {
    units: 'metres',
    overallLength: spec.overallLength,
    source: BERTHIER_M1892_M16_VISUAL_DATA.source,
    classification: BERTHIER_M1892_M16_VISUAL_DATA.classification,
    ...spec
  };
  model.userData.parts = {
    stock, receiver, handguard, upperHandguard, forwardUpperHandguard,
    magazine, triggerGuard, trigger,
    barrel, rearSight, frontSight, midBand, frontBand, stackingRod,
    boltHandle, boltKnob, muzzle, chargingHandle: null, pistolGrip: null,
    detailedMeshes: lodRepresentations.high,
    mediumSilhouette: lodRepresentations.medium,
    coreSilhouette: lodRepresentations.core
  };
  return model;
}

function buildLebelLodRepresentation(spec, materials, visualData, tier) {
  const group = new THREE.Group();
  group.name = `${spec.designation}_${tier}_LOD`;
  const { profiles, stations, widths, controls } = visualData;
  const medium = tier === 'medium';
  const tolerance = medium ? 0.0015 : 0.004;

  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_Stock`,
    profileShape(simplifyProfile(profiles.stock, tolerance)),
    widths.stock,
    stations.receiverEnd * 0.5
  );
  profilePart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Receiver`,
    profileShape(simplifyProfile(profiles.receiver, tolerance)),
    widths.receiver,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_RearForearm`,
    profileShape(profiles.rearForearm),
    widths.rearForearm,
    (stations.rearForearmStart + stations.rearForearmEnd) * 0.5
  );
  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_FrontForearm`,
    profileShape(profiles.frontForearm),
    widths.frontForearm,
    (stations.frontForearmStart + stations.frontForearmEnd) * 0.5
  );
  const barrel = cylinderPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Barrel`,
    controls.barrel.rendererRadiusMetres,
    stations.receiverEnd,
    spec.overallLength,
    0,
    0,
    medium ? 8 : 6
  );
  barrel.userData.semanticPart = 'barrel';
  const magazineTube = cylinderPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_TubeMagazine`,
    controls.tube.radius,
    controls.tube.startZ,
    1.2581,
    0,
    controls.tube.y,
    medium ? 8 : 6
  );
  magazineTube.userData.feedType = 'tubular';

  for (const [control, width, name] of [
    [controls.midBand, widths.midBand, 'MidBand'],
    [controls.frontBand, widths.frontBand, 'FrontBand']
  ]) {
    boxPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_${name}`,
      width,
      control.topY - control.bottomY,
      control.startZ,
      control.endZ,
      (control.topY + control.bottomY) * 0.5
    );
  }

  if (medium) {
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_TriggerGuard`,
      profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner),
      widths.triggerGuard,
      stations.receiverStart
    );
    boxPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_RearSight`,
      widths.rearSight,
      controls.rearSight.topY - controls.rearSight.bottomY,
      controls.rearSight.startZ,
      controls.rearSight.endZ,
      (controls.rearSight.topY + controls.rearSight.bottomY) * 0.5
    );
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_FrontSight`,
      profileShape(profiles.frontSight),
      widths.frontSight,
      (profiles.frontSight[0].z + profiles.frontSight.at(-1).z) * 0.5
    );
    const boltAction = controls.boltAction;
    cylinderPart(
      group,
      materials.boltMetal ?? materials.metal,
      `${spec.designation}_${tier}_BoltBody`,
      boltAction.bodyRadius,
      boltAction.bodyStartZ,
      boltAction.bodyEndZ,
      0,
      boltAction.axisY,
      8
    );
    const boltHandle = cylinderBetweenPart(
      group,
      materials.boltMetal ?? materials.metal,
      `${spec.designation}_${tier}_BoltHandle`,
      controls.boltHandle.stemRadius,
      [
        lateralX('right', controls.boltHandle.stemStartOffset),
        controls.boltHandle.centerY,
        controls.boltHandle.centerZ
      ],
      [
        lateralX('right', controls.boltHandle.stemEndOffset),
        controls.boltHandle.centerY,
        controls.boltHandle.centerZ
      ],
      6
    );
    boltHandle.userData.semanticSide = 'right';
    const knob = meshPart(
      group,
      new THREE.SphereGeometry(controls.boltHandle.knobRadius, 6, 4),
      materials.boltMetal ?? materials.metal,
      `${spec.designation}_${tier}_BoltKnob`,
      [
        lateralX(
          'right',
          controls.boltHandle.knobEndOffset - controls.boltHandle.knobRadius
        ),
        controls.boltHandle.centerY,
        controls.boltHandle.centerZ
      ]
    );
    knob.userData.semanticSide = 'right';
    cylinderPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_StackingTube`,
      controls.stackingTube.radius,
      controls.stackingTube.startZ,
      controls.stackingTube.endZ,
      0,
      controls.stackingTube.centerY,
      6
    );
  }

  if (spec.optic === 'apx1916') {
    const optic = controls.optic;
    const scopeBounds = visualData.crossViewReference.normalizedMeasurements.scopeBounds;
    const scopeCenterY = (scopeBounds.minY + scopeBounds.maxY) * 0.5;
    if (medium) {
      const opticParts = [
        cylinderPart(
          group,
          materials.metal,
          `${spec.designation}_${tier}_APXTube`,
          optic.tubeRadius,
          scopeBounds.startZ,
          scopeBounds.endZ,
          scopeBounds.lateralCenterOffset,
          scopeCenterY,
          8
        ),
        cylinderPart(
          group,
          materials.metal,
          `${spec.designation}_${tier}_APXObjective`,
          optic.objectiveRadius,
          scopeBounds.startZ,
          scopeBounds.startZ + 0.02,
          scopeBounds.lateralCenterOffset,
          scopeCenterY,
          8
        ),
        cylinderPart(
          group,
          materials.metal,
          `${spec.designation}_${tier}_APXOcular`,
          optic.ocularRadius,
          scopeBounds.endZ - 0.02,
          scopeBounds.endZ,
          scopeBounds.lateralCenterOffset,
          scopeCenterY,
          8
        )
      ];
      for (const part of opticParts) part.userData.semanticSide = 'left';
      const tubeBottom = scopeCenterY - optic.tubeRadius;
      for (const [index, station] of optic.mountStations.entries()) {
        const mount = boxPart(
          group,
          materials.metal,
          `${spec.designation}_${tier}_APXMount_${index + 1}`,
          optic.mountWidth,
          tubeBottom - scopeBounds.minY,
          station - 0.008,
          station + 0.008,
          (tubeBottom + scopeBounds.minY) * 0.5
        );
        mount.position.x = scopeBounds.lateralCenterOffset;
        mount.userData.semanticSide = 'left';
      }
    } else {
      const opticProxy = boxPart(
        group,
        materials.metal,
        `${spec.designation}_${tier}_APX1916`,
        scopeBounds.width,
        scopeBounds.height,
        scopeBounds.startZ,
        scopeBounds.endZ,
        scopeCenterY
      );
      opticProxy.position.x = scopeBounds.lateralCenterOffset;
      opticProxy.userData.semanticSide = 'left';
    }
  }
  return group;
}

function buildLebelM1886M93(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;
  const visualData = spec.optic === 'apx1916'
    ? LEBEL_M1886_M93_APX1916_VISUAL_DATA
    : LEBEL_M1886_M93_VISUAL_DATA;
  const { controls } = visualData;
  const referenceMeshes = {
    ...LEBEL_M1886_M93_REFERENCE_MESH_DATA.shared,
    ...(spec.optic === 'apx1916'
      ? LEBEL_M1886_M93_REFERENCE_MESH_DATA.scoped
      : LEBEL_M1886_M93_REFERENCE_MESH_DATA.plain)
  };
  const correctBodyBarrel = (positions, offset) => {
    const z = positions[offset + 2];
    if (z < 0.575) return false;
    const x = positions[offset];
    const y = positions[offset + 1];
    const radius = Math.hypot(x, y);
    const targetRadius = controls.barrel.rendererRadiusMetres;
    if (radius <= 1e-7 || radius >= targetRadius) return false;
    const scale = targetRadius / radius;
    positions[offset] = x * scale;
    positions[offset + 1] = y * scale;
    return true;
  };
  const stock = referenceMeshPart(
    model, materials.wood, `${spec.designation}_Stock`, referenceMeshes.stock
  );
  const bodyBarrelAssembly = referenceMeshPart(
    model,
    materials.metal,
    `${spec.designation}_ReceiverBarrelAssembly`,
    referenceMeshes.bodyBarrelAssembly,
    correctBodyBarrel
  );
  bodyBarrelAssembly.userData.feedType = 'tubular';
  bodyBarrelAssembly.userData.semanticRegions = Object.freeze({
    receiver: Object.freeze({ startZ: 0.2697, endZ: 0.5884 }),
    barrel: Object.freeze({ startZ: 0.5779, endZ: spec.overallLength }),
    tubeMagazine: Object.freeze({ startZ: 0.3568, endZ: 1.2581 })
  });
  bodyBarrelAssembly.userData.rendererCorrection = Object.freeze({
    type: 'minimum radial barrel radius',
    startZ: 0.575,
    sourceRadius: LEBEL_M1886_M93_REFERENCE_MESH_DATA.source.sourceBarrelRadius,
    rendererRadius: controls.barrel.rendererRadiusMetres
  });
  const handguard = referenceMeshPart(
    model,
    referenceMeshes.handguard.materialSlots.map(slot => materials[slot] ?? materials.metal),
    `${spec.designation}_Handguard`,
    referenceMeshes.handguard
  );
  const triggerGuard = referenceMeshPart(
    model, materials.metal, `${spec.designation}_TriggerGuard`, referenceMeshes.triggerGuard
  );
  const trigger = referenceMeshPart(
    model, materials.metal, `${spec.designation}_Trigger`, referenceMeshes.trigger
  );
  const boltBack = referenceMeshPart(
    model,
    materials.boltMetal ?? materials.metal,
    `${spec.designation}_BoltBack`,
    referenceMeshes.boltBack
  );
  const bolt = referenceMeshPart(
    model,
    materials.boltMetal ?? materials.metal,
    `${spec.designation}_Bolt`,
    referenceMeshes.bolt
  );
  bolt.userData.semanticSide = 'right';
  const stackingTube = referenceMeshPart(
    model, materials.metal, `${spec.designation}_StackingTube`, referenceMeshes.stackingTube
  );
  stackingTube.userData.semanticPart = controls.stackingTube.semanticPart;
  const stackingTubeBounds = stackingTube.geometry.boundingBox;
  stackingTube.userData.connectionStart = Object.freeze([
    (stackingTubeBounds.min.x + stackingTubeBounds.max.x) * 0.5,
    (stackingTubeBounds.min.y + stackingTubeBounds.max.y) * 0.5,
    stackingTubeBounds.min.z
  ]);
  const frontSight = referenceMeshPart(
    model, materials.metal, `${spec.designation}_FrontSight`, referenceMeshes.frontSight
  );
  frontSight.userData.semanticPart = 'frontSight';

  const rearSight = new THREE.Group();
  rearSight.name = `${spec.designation}_RearSightAssembly`;
  rearSight.userData.geometryProvenance = 'three contacted normalized GLB meshes';
  model.add(rearSight);
  const rearSightMount = referenceMeshPart(
    rearSight,
    materials.metal,
    `${spec.designation}_RearSightMount`,
    referenceMeshes.rearSightMount
  );
  const rearSightPost = referenceMeshPart(
    rearSight,
    materials.metal,
    `${spec.designation}_RearSightPost`,
    referenceMeshes.rearSightPost
  );
  const rearSightLeaf = referenceMeshPart(
    rearSight,
    materials.metal,
    `${spec.designation}_RearSightLeaf`,
    referenceMeshes.rearSightLeaf
  );
  rearSight.userData.parts = Object.freeze({
    mount: rearSightMount,
    post: rearSightPost,
    leaf: rearSightLeaf
  });

  let optic = null;
  if (referenceMeshes.optic) {
    optic = referenceMeshPart(
      model, materials.metal, `${spec.designation}_APX1916`, referenceMeshes.optic
    );
    optic.userData.opticId = 'APX_1916';
    optic.userData.semanticSide = 'left';
    optic.userData.connectedSourceAssembly = true;
  }

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const detailedMeshes = [
    stock,
    bodyBarrelAssembly,
    handguard,
    triggerGuard,
    trigger,
    boltBack,
    bolt,
    rearSightMount,
    rearSightPost,
    rearSightLeaf,
    stackingTube,
    frontSight
  ];
  if (optic) detailedMeshes.push(optic);
  const highMeshes = markWeaponLodRepresentation(detailedMeshes, 'high', true);
  const mediumLod = buildLebelLodRepresentation(
    spec,
    materials,
    visualData,
    'medium'
  );
  const coreLod = buildLebelLodRepresentation(
    spec,
    materials,
    visualData,
    'core'
  );
  model.add(mediumLod, coreLod);
  const lodRepresentations = installWeaponLodContract(
    model,
    visualData,
    highMeshes,
    mediumLod,
    coreLod
  );

  model.userData.visualContract = {
    units: 'metres',
    overallLength: spec.overallLength,
    source: visualData.source,
    crossViewReference: visualData.crossViewReference,
    referenceMeshSource: LEBEL_M1886_M93_REFERENCE_MESH_DATA.source,
    classification: visualData.classification,
    ...spec
  };
  model.userData.parts = {
    stock,
    receiver: bodyBarrelAssembly,
    bodyBarrelAssembly,
    handguard,
    forwardHandguard: handguard,
    barrel: bodyBarrelAssembly,
    magazine: bodyBarrelAssembly,
    stackingTube,
    triggerGuard,
    trigger,
    rearSight,
    rearSightMount,
    rearSightPost,
    rearSightLeaf,
    midBand: bodyBarrelAssembly,
    frontBand: bodyBarrelAssembly,
    frontSight,
    boltBack,
    boltBody: bolt,
    boltRib: bolt,
    boltHandle: bolt,
    boltKnob: bolt,
    optic,
    muzzle,
    chargingHandle: null,
    pistolGrip: null,
    detailedMeshes: lodRepresentations.high,
    mediumSilhouette: lodRepresentations.medium,
    coreSilhouette: lodRepresentations.core
  };
  return model;
}

function buildMas38Magazine(group, material, name, width) {
  const control = MAS38_VISUAL_DATA.controls.magazineBody;
  const visibleTop = new THREE.Vector3(0, control.visibleTopCenter.y, control.visibleTopCenter.z);
  const bottom = new THREE.Vector3(0, control.visibleBottomCenter.y, control.visibleBottomCenter.z);
  const visibleAxis = visibleTop.clone().sub(bottom);
  const visibleLength = visibleAxis.length();
  const axis = visibleAxis.normalize();
  const seatedTop = visibleTop.clone().addScaledVector(axis, control.insertionDepth);
  const center = bottom.clone().add(seatedTop).multiplyScalar(0.5);
  const magazine = meshPart(
    group,
    new THREE.BoxGeometry(
      width,
      visibleLength + control.insertionDepth,
      control.crossViewDepth
    ),
    material,
    name,
    center.toArray()
  );
  magazine.rotation.set(
    Math.atan2(axis.z, axis.y),
    0,
    control.rollRadians
  );
  magazine.userData.feedType = 'bottom';
  magazine.userData.visibleTopCenter = Object.freeze(visibleTop.toArray());
  magazine.userData.connectionEnd = Object.freeze(seatedTop.toArray());
  magazine.userData.connectionStart = Object.freeze(bottom.toArray());
  magazine.userData.semanticRollRadians = control.rollRadians;
  return magazine;
}

function buildMas38LodRepresentation(spec, materials, tier) {
  const group = new THREE.Group();
  group.name = `${spec.designation}_${tier}_LOD`;
  const { profiles, stations, widths, controls } = MAS38_VISUAL_DATA;
  const medium = tier === 'medium';
  const tolerance = medium ? 0.0015 : 0.010;

  for (const [name, profile, width, material] of [
    ['Stock', profiles.stock, widths.stock, materials.wood],
    ['Receiver', profiles.receiver, widths.receiver, materials.metal],
    ['PistolGrip', profiles.pistolGrip, widths.pistolGrip, materials.wood],
    ['BarrelCollar', profiles.barrelCollar, widths.barrelCollar, materials.metal],
    ['FrontSight', profiles.frontSight, widths.frontSight, materials.metal]
  ]) {
    profilePart(
      group,
      material,
      `${spec.designation}_${tier}_${name}`,
      profileShape(simplifyProfile(profile, tolerance)),
      width,
      (profile[0].z + profile.at(-1).z) * 0.5
    );
  }
  buildMas38Magazine(
    group,
    materials.metal,
    `${spec.designation}_${tier}_BoxMagazine`,
    widths.magazine
  );
  cylinderBetweenPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Barrel`,
    spec.barrelRadius,
    [0, spec.barrelStartY, stations.barrelStart],
    [0, spec.barrelEndY, spec.overallLength],
    medium ? 8 : 6
  );

  if (medium) {
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_TriggerGuard`,
      profileShapeWithHole(
        simplifyProfile(profiles.triggerGuardOuter, tolerance),
        simplifyProfile(profiles.triggerGuardInner, tolerance)
      ),
      widths.triggerGuard,
      (profiles.triggerGuardOuter[0].z + profiles.triggerGuardOuter.at(-1).z) * 0.5
    );
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_RearSight`,
      profileShape(profiles.rearSight),
      widths.rearSight,
      (stations.rearSightStart + stations.rearSightEnd) * 0.5
    );
    const cockingHandle = cylinderBetweenPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_CockingHandle`,
      controls.cockingHandle.stemRadius,
      controls.cockingHandle.start,
      controls.cockingHandle.end,
      6
    );
    cockingHandle.userData.semanticSide = 'right';
  }
  return group;
}

function buildMas38(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;
  const { profiles, stations, widths, controls } = MAS38_VISUAL_DATA;
  const sourceAssembly = referenceMeshPart(
    model,
    [materials.metal, materials.wood],
    `${spec.designation}_ReferenceAssembly`,
    MAS38_REFERENCE_MESH_DATA.assembly
  );
  sourceAssembly.userData.sourceParts = MAS38_REFERENCE_MESH_DATA.assembly.sourceParts;
  sourceAssembly.userData.sourceLicense = MAS38_REFERENCE_MESH_DATA.source.license;
  sourceAssembly.userData.semanticRegions = Object.freeze({
    receiver: Object.freeze({
      startZ: MAS38_VISUAL_DATA.stations.receiverStart,
      endZ: MAS38_VISUAL_DATA.stations.receiverEnd
    }),
    barrel: Object.freeze({
      startZ: MAS38_VISUAL_DATA.stations.barrelStart,
      endZ: spec.overallLength
    })
  });
  sourceAssembly.userData.feedType = 'bottom';
  sourceAssembly.userData.semanticRollRadians = 0;
  const visibleTop = new THREE.Vector3(
    0,
    controls.magazineBody.visibleTopCenter.y,
    controls.magazineBody.visibleTopCenter.z
  );
  const bottom = new THREE.Vector3(
    0,
    controls.magazineBody.visibleBottomCenter.y,
    controls.magazineBody.visibleBottomCenter.z
  );
  const magazineAxis = visibleTop.clone().sub(bottom).normalize();
  const seatedTop = visibleTop.clone().addScaledVector(
    magazineAxis,
    controls.magazineBody.insertionDepth
  );
  sourceAssembly.userData.visibleTopCenter = Object.freeze(visibleTop.toArray());
  sourceAssembly.userData.connectionStart = Object.freeze(bottom.toArray());
  sourceAssembly.userData.connectionEnd = Object.freeze([0, 0, spec.overallLength]);
  sourceAssembly.userData.magazineConnectionEnd = Object.freeze(seatedTop.toArray());

  // Keep the registered sheet geometry as invisible semantic/contact datums.
  // Runtime rendering uses the source assembly above; animation and regression
  // checks retain narrowly owned part bounds instead of treating one whole-gun
  // mesh as every mechanical component.
  const semanticRoot = new THREE.Group();
  semanticRoot.name = `${spec.designation}_SemanticDatums`;
  const stock = profilePart(semanticRoot, materials.wood, `${spec.designation}_StockDatum`, profileShape(profiles.stock), widths.stock, stations.stockNose * 0.5);
  const receiver = profilePart(semanticRoot, materials.metal, `${spec.designation}_ReceiverDatum`, profileShape(profiles.receiver), widths.receiver, (stations.receiverStart + stations.receiverEnd) * 0.5);
  const pistolGrip = profilePart(semanticRoot, materials.wood, `${spec.designation}_PistolGripDatum`, profileShape(profiles.pistolGrip), widths.pistolGrip, (profiles.pistolGrip[0].z + profiles.pistolGrip.at(-1).z) * 0.5);
  const magazine = buildMas38Magazine(
    semanticRoot,
    materials.metal,
    `${spec.designation}_BoxMagazineDatum`,
    widths.magazine
  );
  const triggerGuardPath = new THREE.CatmullRomCurve3(
    profiles.triggerGuardOuter.map(profilePoint => new THREE.Vector3(0, profilePoint.y, profilePoint.z)),
    true,
    'centripetal'
  );
  const triggerGuard = meshPart(
    semanticRoot,
    new THREE.TubeGeometry(triggerGuardPath, profiles.triggerGuardOuter.length * 2, 0.0012, 6, true),
    materials.metal,
    `${spec.designation}_TriggerGuardDatum`,
    [0, 0, 0]
  );
  const handguard = profilePart(semanticRoot, materials.metal, `${spec.designation}_HandguardDatum`, profileShape(profiles.barrelCollar), widths.barrelCollar, (stations.collarStart + stations.collarEnd) * 0.5);
  const barrel = cylinderBetweenPart(
    semanticRoot,
    materials.metal,
    `${spec.designation}_BarrelDatum`,
    spec.barrelRadius,
    [0, spec.barrelStartY, stations.barrelStart],
    [0, spec.barrelEndY, spec.overallLength],
    10
  );
  const foldingMagazineHousingExtension = cylinderPart(
    semanticRoot,
    materials.metal,
    `${spec.designation}_FoldingMagazineHousingExtensionDatum`,
    controls.foldingMagazineHousingExtension.radius,
    controls.foldingMagazineHousingExtension.startZ,
    controls.foldingMagazineHousingExtension.endZ,
    0,
    controls.foldingMagazineHousingExtension.centerY,
    6
  );
  const rearSight = profilePart(semanticRoot, materials.metal, `${spec.designation}_RearSightDatum`, profileShape(profiles.rearSight), widths.rearSight, (stations.rearSightStart + stations.rearSightEnd) * 0.5);
  const frontSight = profilePart(semanticRoot, materials.metal, `${spec.designation}_FrontSightDatum`, profileShape(profiles.frontSight), widths.frontSight, (stations.frontSightStart + spec.overallLength) * 0.5);
  frontSight.userData.semanticPart = 'frontSight';
  const cockingHandle = cylinderBetweenPart(semanticRoot, materials.metal, 'MAS38_CockingHandleDatum', controls.cockingHandle.stemRadius, controls.cockingHandle.start, controls.cockingHandle.end, 7);
  cockingHandle.userData.semanticSide = 'right';
  const cockingKnob = meshPart(semanticRoot, new THREE.SphereGeometry(controls.cockingHandle.knobRadius, 8, 6), materials.metal, 'MAS38_CockingKnobDatum', controls.cockingHandle.end);
  cockingKnob.userData.semanticSide = 'right';
  cockingHandle.userData.knob = cockingKnob;
  const dustCover = boxPart(semanticRoot, materials.metal, 'MAS38_DustCoverDatum', controls.dustCover.width, controls.dustCover.height, controls.dustCover.startZ, controls.dustCover.endZ, controls.dustCover.centerY);
  dustCover.position.x = lateralX('right', widths.receiver * 0.5 + controls.dustCover.width * 0.5);
  dustCover.userData.semanticSide = 'right';
  semanticRoot.traverse(object => {
    if (!object.isMesh) return;
    object.visible = false;
    object.userData.semanticOnly = true;
  });
  model.add(semanticRoot);
  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const highMeshes = markWeaponLodRepresentation([sourceAssembly], 'high', true);
  const mediumLod = buildMas38LodRepresentation(spec, materials, 'medium');
  const coreLod = buildMas38LodRepresentation(spec, materials, 'core');
  model.add(mediumLod, coreLod);
  const lodRepresentations = installWeaponLodContract(model, MAS38_VISUAL_DATA, highMeshes, mediumLod, coreLod);

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, source: MAS38_VISUAL_DATA.source, classification: MAS38_VISUAL_DATA.classification, ...spec };
  model.userData.parts = {
    stock,
    receiver,
    handguard,
    barrel,
    foldingMagazineHousingExtension,
    magazine,
    muzzle,
    frontSight,
    rearSight,
    triggerGuard,
    pistolGrip,
    chargingHandle: cockingHandle,
    cockingKnob,
    dustCover,
    boltHandle: null,
    coreSilhouette: [sourceAssembly],
    referenceAssembly: sourceAssembly,
    detailedMeshes: lodRepresentations.high,
    mediumSilhouette: lodRepresentations.medium,
    coreLodSilhouette: lodRepresentations.core
  };
  return model;
}

function buildFm2429LodRepresentation(spec, materials, tier) {
  const group = new THREE.Group();
  group.name = `${spec.designation}_${tier}_LOD`;
  const { profiles, stations, widths, controls } = FM2429_VISUAL_DATA;
  const medium = tier === 'medium';
  const tolerance = medium ? 0.0015 : 0.012;

  for (const [name, profile, width, material] of [
    ['Stock', profiles.stock, widths.stock, materials.wood],
    ['Receiver', profiles.receiver, widths.receiver, materials.metal],
    ['TopMagazine', profiles.magazine, widths.magazine, materials.metal],
    ['Handguard', profiles.handguard, widths.handguard, materials.wood],
    ['BarrelJacket', profiles.barrelJacket, widths.barrelJacket, materials.metal],
    ['FlashHider', profiles.flashHider, widths.flashHider, materials.metal],
    ['PistolGrip', profiles.pistolGrip, widths.pistolGrip, materials.wood]
  ]) {
    profilePart(
      group,
      material,
      `${spec.designation}_${tier}_${name}`,
      profileShape(simplifyProfile(profile, tolerance)),
      width,
      (profile[0].z + profile.at(-1).z) * 0.5
    );
  }

  const barrel = cylinderPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Barrel`,
    spec.barrelRadius,
    stations.barrelJacketStart,
    spec.overallLength,
    0,
    0,
    medium ? 8 : 6
  );
  barrel.userData.semanticPart = 'barrel';

  if (medium) {
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_TriggerGuard`,
      profileShapeWithHole(
        simplifyProfile(profiles.triggerGuardOuter, tolerance),
        simplifyProfile(profiles.triggerGuardInner, tolerance)
      ),
      widths.triggerGuard,
      (stations.receiverStart + stations.magazineStart) * 0.5
    );
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_FrontSight`,
      profileShape(profiles.frontSight),
      widths.frontSight,
      stations.barrelJacketEnd
    );
  }

  const bipodLeft = cylinderBetweenPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Bipod_Left`,
    controls.bipod.radius,
    [-0.022, controls.bipod.pivotY, stations.bipodPivot],
    [-0.030, controls.bipod.restY, stations.bipodRestEnd],
    medium ? 6 : 4
  );
  const bipodRight = cylinderBetweenPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Bipod_Right`,
    controls.bipod.radius,
    [0.022, controls.bipod.pivotY, stations.bipodPivot],
    [0.030, controls.bipod.restY, stations.bipodRestEnd],
    medium ? 6 : 4
  );
  bipodLeft.userData.semanticSide = 'left';
  bipodRight.userData.semanticSide = 'right';
  return group;
}

function buildFm2429(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;
  const { profiles, stations, widths, controls } = FM2429_VISUAL_DATA;
  const stock = profilePart(model, materials.wood, `${spec.designation}_Stock`, profileShape(profiles.stock), widths.stock, stations.stockNose * 0.5);
  const receiver = profilePart(model, materials.metal, `${spec.designation}_Receiver`, profileShape(profiles.receiver), widths.receiver, (stations.receiverStart + stations.receiverEnd) * 0.5);
  const magazine = profilePart(model, materials.metal, 'FM2429_TopMagazine', profileShape(profiles.magazine), widths.magazine, (stations.magazineStart + stations.magazineEnd) * 0.5);
  magazine.userData.feedType = 'top';
  const handguard = profilePart(model, materials.wood, `${spec.designation}_Handguard`, profileShape(profiles.handguard), widths.handguard, (stations.handguardStart + stations.handguardEnd) * 0.5);
  const barrelJacket = profilePart(model, materials.metal, 'FM2429_BarrelJacket', profileShape(profiles.barrelJacket), widths.barrelJacket, (stations.barrelJacketStart + stations.barrelJacketEnd) * 0.5);
  const flashHider = profilePart(model, materials.metal, 'FM2429_FlashHider', profileShape(profiles.flashHider), widths.flashHider, (stations.flashHiderStart + spec.overallLength) * 0.5);
  const pistolGrip = profilePart(model, materials.wood, `${spec.designation}_PistolGrip`, profileShape(profiles.pistolGrip), widths.pistolGrip, (profiles.pistolGrip[0].z + profiles.pistolGrip.at(-1).z) * 0.5);
  const triggerGuard = profilePart(model, materials.metal, `${spec.designation}_TriggerGuard`, profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner), widths.triggerGuard, (stations.receiverStart + stations.magazineStart) * 0.5);
  const rearSight = profilePart(model, materials.metal, `${spec.designation}_RearSight`, profileShape(profiles.rearSight), widths.rearSight, (profiles.rearSight[0].z + profiles.rearSight.at(-1).z) * 0.5);
  const frontSight = profilePart(model, materials.metal, `${spec.designation}_FrontSight`, profileShape(profiles.frontSight), widths.frontSight, stations.barrelJacketEnd);
  frontSight.userData.semanticPart = 'frontSight';
  const carryHandle = profilePart(model, materials.metal, 'FM2429_CarryHandle', profileShape(profiles.carryHandle), 0.018, (profiles.carryHandle[0].z + profiles.carryHandle.at(-1).z) * 0.5);
  const barrel = cylinderPart(model, materials.metal, `${spec.designation}_Barrel`, spec.barrelRadius, stations.barrelJacketStart, spec.overallLength, 0, 0, 10);
  const gasTube = cylinderPart(model, materials.metal, 'FM2429_GasTube', 0.008, stations.barrelJacketStart, stations.barrelJacketEnd, 0, -0.025, 8);
  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);
  const chargingHandle = cylinderBetweenPart(model, materials.metal, `${spec.designation}_ChargingHandle`, controls.chargingHandle.radius, controls.chargingHandle.start, controls.chargingHandle.end, 7);
  chargingHandle.userData.semanticSide = 'right';
  const bipodLeft = cylinderBetweenPart(model, materials.metal, `${spec.designation}_Bipod_Left`, controls.bipod.radius, [-0.022, controls.bipod.pivotY, stations.bipodPivot], [-0.030, controls.bipod.restY, stations.bipodRestEnd], 7);
  storeBipodRestTransform(bipodLeft);
  const bipodRight = cylinderBetweenPart(model, materials.metal, `${spec.designation}_Bipod_Right`, controls.bipod.radius, [0.022, controls.bipod.pivotY, stations.bipodPivot], [0.030, controls.bipod.restY, stations.bipodRestEnd], 7);
  storeBipodRestTransform(bipodRight);
  const bipod = { left: bipodLeft, right: bipodRight };
  bipodLeft.userData.lodBand = 'core';
  bipodRight.userData.lodBand = 'core';

  const coreSilhouette = [stock, receiver, handguard, barrelJacket, barrel, gasTube, flashHider, magazine, pistolGrip, bipodLeft, bipodRight];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';

  const detailedMeshes = [stock, receiver, magazine, handguard, barrelJacket, flashHider, pistolGrip, triggerGuard, rearSight, frontSight, carryHandle, barrel, gasTube, chargingHandle, bipodLeft, bipodRight];
  const highMeshes = markWeaponLodRepresentation(detailedMeshes, 'high', true);
  // The articulated pair remains part of the gameplay core silhouette even
  // though this source-detailed representation is shown only in the high tier.
  bipodLeft.userData.lodBand = 'core';
  bipodRight.userData.lodBand = 'core';
  const mediumLod = buildFm2429LodRepresentation(spec, materials, 'medium');
  const coreLod = buildFm2429LodRepresentation(spec, materials, 'core');
  model.add(mediumLod, coreLod);
  const lodRepresentations = installWeaponLodContract(model, FM2429_VISUAL_DATA, highMeshes, mediumLod, coreLod);

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, source: FM2429_VISUAL_DATA.source, classification: FM2429_VISUAL_DATA.classification, ...spec };
  model.userData.parts = {
    stock, receiver, handguard, barrelJacket, barrel, gasTube, flashHider,
    magazine, muzzle, frontSight, rearSight, carryHandle, triggerGuard, pistolGrip,
    chargingHandle, boltHandle: null, bipod, coreSilhouette,
    detailedMeshes: lodRepresentations.high,
    mediumSilhouette: lodRepresentations.medium,
    coreLodSilhouette: lodRepresentations.core
  };
  return model;
}

function buildMg34Gurttrommel(group, material, name, sides = 14, detailed = false) {
  const { gurttrommel } = MG34_VISUAL_DATA.controls;
  const geometry = new THREE.CylinderGeometry(
    gurttrommel.radius,
    gurttrommel.radius,
    gurttrommel.height,
    sides
  );
  const drum = meshPart(group, geometry, material, name, gurttrommel.center);
  drum.rotation.x = gurttrommel.operatorFacingRotationX;
  drum.userData.feedType = 'belt-drum';
  drum.userData.capacity = gurttrommel.capacity;
  drum.userData.semanticSide = gurttrommel.side;
  drum.userData.containerAxis = '-Z';
  drum.userData.operatorFacing = 'rear';
  drum.userData.operatorFacingRotationX = gurttrommel.operatorFacingRotationX;
  drum.userData.sourceClassification = gurttrommel.sourceClassification;

  if (detailed) {
    const lid = meshPart(
      drum,
      new THREE.CylinderGeometry(
        gurttrommel.radius + 0.003,
        gurttrommel.radius + 0.003,
        gurttrommel.lidHeight,
        sides
      ),
      material,
      `${name}_Lid`,
      [0, gurttrommel.height * 0.5 + gurttrommel.lidHeight * 0.5, 0]
    );
    lid.userData.semanticPart = 'ammunitionContainerLid';
    drum.userData.lid = lid;
    const handleY = gurttrommel.height * 0.5 + gurttrommel.lidHeight + gurttrommel.handleHeight;
    const handleHalfSpan = gurttrommel.radius * 0.62;
    const handleBaseY = gurttrommel.height * 0.5 + gurttrommel.lidHeight;
    const handleProfile = [
      [-handleHalfSpan, handleBaseY],
      [-handleHalfSpan, handleY - 0.014],
      [-handleHalfSpan + 0.003, handleY - 0.007],
      [-handleHalfSpan + 0.009, handleY - 0.002],
      [-handleHalfSpan * 0.5, handleY + 0.002],
      [-handleHalfSpan * 0.25, handleY + 0.0028],
      [0, handleY + 0.003],
      [handleHalfSpan * 0.5, handleY + 0.002],
      [handleHalfSpan - 0.009, handleY - 0.002],
      [handleHalfSpan - 0.003, handleY - 0.007],
      [handleHalfSpan, handleY - 0.014],
      [handleHalfSpan, handleBaseY],
      [handleHalfSpan - 0.008, handleBaseY],
      [handleHalfSpan - 0.008, handleY - 0.014],
      [handleHalfSpan - 0.012, handleY - 0.009],
      [handleHalfSpan * 0.5, handleY - 0.006],
      [0, handleY - 0.005],
      [-handleHalfSpan * 0.5, handleY - 0.006],
      [-handleHalfSpan + 0.012, handleY - 0.009],
      [-handleHalfSpan + 0.008, handleY - 0.014],
      [-handleHalfSpan + 0.008, handleBaseY]
    ].map(([z, y]) => ({ z, y }));
    const carryHandle = profilePart(
      drum,
      material,
      `${name}_CarryHandle`,
      profileShape(handleProfile),
      gurttrommel.handleRadius * 2,
      0
    );
    carryHandle.userData.semanticPart = 'ammunitionContainerCarryHandle';
    drum.userData.carryHandle = carryHandle;
  }

  const connector = boxPart(
    group,
    material,
    `${name}_FeedChute`,
    0.064,
    0.038,
    MG34_VISUAL_DATA.stations.drum - 0.045,
    MG34_VISUAL_DATA.stations.drum + 0.035,
    -0.012
  );
  connector.position.x = 0.059;
  connector.userData.semanticSide = gurttrommel.side;
  drum.userData.feedConnector = connector;
  return drum;
}

function addMg34FoldedBipod(group, material, tier) {
  const { stations, controls, designation } = MG34_VISUAL_DATA;
  const sides = tier === 'high' ? 7 : (tier === 'medium' ? 6 : 4);
  const legs = {};
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const rest = side === 'left' ? controls.bipod.leftRest : controls.bipod.rightRest;
    const leg = cylinderBetweenPart(
      group,
      material,
      `${designation}_${tier}_Bipod_${side === 'left' ? 'Left' : 'Right'}`,
      controls.bipod.radius,
      [sign * 0.022, controls.bipod.pivotY, stations.bipodHinge],
      rest,
      sides
    );
    leg.userData.semanticSide = side;
    if (tier === 'high') storeBipodRestTransform(leg);
    legs[side] = leg;
  }
  return legs;
}

function buildMg34LodRepresentation(spec, materials, tier) {
  const group = new THREE.Group();
  group.name = `${spec.designation}_${tier}_LOD`;
  const { profiles, stations, widths, controls } = MG34_VISUAL_DATA;
  const medium = tier === 'medium';
  const tolerance = medium ? 0.002 : 0.012;

  const stock = profilePart(group, materials.wood, `${spec.designation}_${tier}_Stock`, profileShape(simplifyProfile(profiles.stock, tolerance)), widths.stock, stations.stockNose * 0.5);
  const receiver = profilePart(group, materials.metal, `${spec.designation}_${tier}_Receiver`, profileShape(simplifyProfile(profiles.receiver, tolerance)), widths.receiver, (stations.receiverStart + stations.receiverEnd) * 0.5);
  const pistolGrip = profilePart(group, materials.wood, `${spec.designation}_${tier}_PistolGrip`, profileShape(simplifyProfile(profiles.pistolGrip, tolerance)), widths.pistolGrip, (profiles.pistolGrip[0].z + profiles.pistolGrip.at(-1).z) * 0.5);
  const jacket = cylinderPart(group, materials.metal, `${spec.designation}_${tier}_BarrelJacket`, controls.jacketRadius, stations.jacketStart, stations.jacketEnd, 0, 0, medium ? 12 : 7);
  const muzzleBooster = revolvedProfilePart(group, materials.metal, `${spec.designation}_${tier}_MuzzleBooster`, controls.muzzleSectionsLod, medium ? 12 : 7);
  const magazine = buildMg34Gurttrommel(group, materials.metal, `${spec.designation}_${tier}_Gurttrommel34`, medium ? 12 : 8);
  const bipod = addMg34FoldedBipod(group, materials.metal, tier);

  if (medium) {
    profilePart(group, materials.metal, `${spec.designation}_${tier}_FeedCover`, profileShape(simplifyProfile(profiles.feedCover, tolerance)), widths.feedCover, (stations.receiverStart + stations.receiverEnd) * 0.5);
    profilePart(group, materials.metal, `${spec.designation}_${tier}_TriggerGuard`, profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner), widths.triggerGuard, stations.drum);
    boxPart(group, materials.metal, `${spec.designation}_${tier}_RearSight`, controls.rearSight.width, controls.rearSight.height, controls.rearSight.startZ, controls.rearSight.endZ, controls.rearSight.centerY);
    boxPart(group, materials.metal, `${spec.designation}_${tier}_FrontSight`, controls.frontSight.width, controls.frontSight.height, controls.frontSight.startZ, controls.frontSight.endZ, controls.frontSight.centerY);
  }

  group.userData.parts = { stock, receiver, pistolGrip, jacket, muzzleBooster, magazine, bipod };
  return group;
}

function buildMg34(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;
  const { profiles, stations, widths, controls } = MG34_VISUAL_DATA;

  const stock = profilePart(model, materials.wood, `${spec.designation}_Stock`, profileShape(profiles.stock), widths.stock, stations.stockNose * 0.5);
  const receiver = profilePart(model, materials.metal, `${spec.designation}_Receiver`, profileShape(profiles.receiver), widths.receiver, (stations.receiverStart + stations.receiverEnd) * 0.5);
  const pistolGrip = profilePart(model, materials.wood, `${spec.designation}_PistolGrip`, profileShape(profiles.pistolGrip), widths.pistolGrip, (profiles.pistolGrip[0].z + profiles.pistolGrip.at(-1).z) * 0.5);
  const triggerGuard = profilePart(model, materials.metal, `${spec.designation}_TriggerGuard`, profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner), widths.triggerGuard, stations.drum);
  const feedCover = profilePart(model, materials.metal, `${spec.designation}_FeedCover`, profileShape(profiles.feedCover), widths.feedCover, (stations.receiverStart + stations.receiverEnd) * 0.5);
  const barrel = cylinderPart(model, materials.metal, `${spec.designation}_Barrel`, spec.barrelRadius, stations.jacketStart, spec.overallLength, 0, 0, 10);
  const barrelJacket = perforatedCylinderPart(
    model,
    materials.metal,
    'MG34_PerforatedBarrelJacket',
    controls.jacketRadius,
    stations.jacketStart,
    stations.jacketEnd,
    controls.jacketHoleStations,
    controls.jacketHoleRadius,
    28
  );
  barrelJacket.userData.perforatedJacket = true;
  const muzzleBooster = revolvedProfilePart(model, materials.metal, 'MG34_MuzzleBooster', controls.muzzleSections, 20);
  const magazine = buildMg34Gurttrommel(model, materials.metal, 'MG34_Gurttrommel34', 20, true);
  const chargingHandle = cylinderBetweenPart(model, materials.metal, `${spec.designation}_ChargingHandle`, controls.chargingHandle.radius, controls.chargingHandle.start, controls.chargingHandle.end, 8);
  chargingHandle.userData.semanticSide = 'right';
  const rearSight = boxPart(model, materials.metal, `${spec.designation}_RearSight`, controls.rearSight.width, controls.rearSight.height, controls.rearSight.startZ, controls.rearSight.endZ, controls.rearSight.centerY);
  const frontSight = boxPart(model, materials.metal, `${spec.designation}_FrontSight`, controls.frontSight.width, controls.frontSight.height, controls.frontSight.startZ, controls.frontSight.endZ, controls.frontSight.centerY);
  frontSight.userData.semanticPart = 'frontSight';
  const bipod = addMg34FoldedBipod(model, materials.metal, 'high');

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const coreSilhouette = [stock, receiver, pistolGrip, barrel, barrelJacket, muzzleBooster, magazine, bipod.left, bipod.right];
  for (const part of coreSilhouette) part.userData.lodBand = 'core';
  const detailedMeshes = [
    ...coreSilhouette, triggerGuard, feedCover, chargingHandle,
    rearSight, frontSight, magazine.userData.feedConnector
  ];
  const highMeshes = markWeaponLodRepresentation(detailedMeshes, 'high', true);
  bipod.left.userData.lodBand = 'core';
  bipod.right.userData.lodBand = 'core';
  const mediumLod = buildMg34LodRepresentation(spec, materials, 'medium');
  const coreLod = buildMg34LodRepresentation(spec, materials, 'core');
  model.add(mediumLod, coreLod);
  const lodRepresentations = installWeaponLodContract(model, MG34_VISUAL_DATA, highMeshes, mediumLod, coreLod);

  model.userData.visualContract = { units: 'metres', overallLength: spec.overallLength, source: MG34_VISUAL_DATA.source, classification: MG34_VISUAL_DATA.classification, references: MG34_VISUAL_DATA.references, ...spec };
  model.userData.parts = {
    stock, receiver, handguard: barrelJacket, barrelJacket, barrel, muzzleBooster,
    magazine, muzzle, frontSight, rearSight, feedCover, triggerGuard, pistolGrip,
    chargingHandle, boltHandle: null, bipod, coreSilhouette,
    detailedMeshes: lodRepresentations.high,
    mediumSilhouette: lodRepresentations.medium,
    coreLodSilhouette: lodRepresentations.core
  };
  return model;
}

function buildKar98kLodRepresentation(spec, materials, tier) {
  const group = new THREE.Group();
  group.name = `${spec.designation}_${tier}_LOD`;
  const { profiles, stations, widths, controls } = KAR98K_VISUAL_DATA;
  const medium = tier === 'medium';
  const tolerance = medium ? 0.0015 : 0.004;

  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_Stock`,
    profileShape(simplifyProfile(profiles.stock, tolerance)),
    widths.stock,
    stations.stockNose * 0.5
  );
  profilePart(
    group,
    materials.wood,
    `${spec.designation}_${tier}_Handguard`,
    profileShape(simplifyProfile(profiles.handguard, tolerance)),
    widths.handguard,
    (stations.handguardStart + stations.handguardEnd) * 0.5
  );
  profilePart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Receiver`,
    profileShape(simplifyProfile(profiles.receiver, tolerance)),
    widths.receiver,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  const magazine = profilePart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_InternalMagazine`,
    profileShape(simplifyProfile(profiles.magazine, tolerance)),
    widths.magazine,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  magazine.userData.feedType = 'internal';
  const barrel = cylinderPart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_Barrel`,
    spec.barrelRadius,
    stations.barrelStart,
    spec.overallLength,
    0,
    0,
    medium ? 8 : 6
  );
  barrel.userData.semanticPart = 'barrel';

  for (const [control, width, name] of [
    [controls.rearBand, widths.rearBand, 'RearBand'],
    [controls.frontBand, widths.frontBand, 'FrontBand']
  ]) {
    boxPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_${name}`,
      width,
      control.topY - control.bottomY,
      control.startZ,
      control.endZ,
      (control.topY + control.bottomY) * 0.5
    );
  }

  profilePart(
    group,
    materials.metal,
    `${spec.designation}_${tier}_FrontSight`,
    profileShape(profiles.frontSight),
    widths.frontSight,
    (profiles.frontSight[0].z + profiles.frontSight.at(-1).z) * 0.5
  );

  if (medium) {
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_TriggerGuard`,
      profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner),
      widths.triggerGuard,
      stations.receiverStart
    );
    profilePart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_RearSight`,
      profileShape(profiles.rearSight),
      widths.receiver,
      (controls.rearSight.startZ + controls.rearSight.endZ) * 0.5
    );
    cylinderPart(
      group,
      materials.boltMetal ?? materials.metal,
      `${spec.designation}_${tier}_BoltBody`,
      controls.boltBody.radius,
      controls.boltBody.startZ,
      controls.boltBody.endZ,
      0,
      controls.boltBody.axisY,
      8
    );
    const boltHandle = cylinderBetweenPart(
      group,
      materials.boltMetal ?? materials.metal,
      `${spec.designation}_${tier}_BoltHandle`,
      controls.boltHandle.stemRadius,
      [controls.boltHandle.start.x, controls.boltHandle.start.y, controls.boltHandle.start.z],
      [controls.boltHandle.end.x, controls.boltHandle.end.y, controls.boltHandle.end.z],
      6
    );
    boltHandle.userData.semanticSide = 'right';
    const boltKnob = meshPart(
      group,
      new THREE.SphereGeometry(controls.boltHandle.knobRadius, 6, 4),
      materials.boltMetal ?? materials.metal,
      `${spec.designation}_${tier}_BoltKnob`,
      [
        controls.boltHandle.end.x - controls.boltHandle.knobRadius * 0.7,
        controls.boltHandle.end.y,
        controls.boltHandle.end.z
      ]
    );
    boltKnob.userData.semanticSide = 'right';
    cylinderPart(
      group,
      materials.metal,
      `${spec.designation}_${tier}_CleaningRod`,
      controls.cleaningRod.radius,
      controls.cleaningRod.startZ,
      controls.cleaningRod.endZ,
      0,
      controls.cleaningRod.y,
      6
    );
  }
  return group;
}

function buildKar98k(spec, materials) {
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;
  const { profiles, stations, widths, controls } = KAR98K_VISUAL_DATA;
  const boltMaterial = materials.boltMetal ?? materials.metal;

  const stock = profilePart(
    model,
    materials.wood,
    `${spec.designation}_Stock`,
    profileShape(profiles.stock),
    widths.stock,
    stations.stockNose * 0.5
  );
  const handguard = profilePart(
    model,
    materials.wood,
    `${spec.designation}_Handguard`,
    profileShape(profiles.handguard),
    widths.handguard,
    (stations.handguardStart + stations.handguardEnd) * 0.5
  );
  const receiver = profilePart(
    model,
    materials.metal,
    `${spec.designation}_Receiver`,
    profileShape(profiles.receiver),
    widths.receiver,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  const boltBody = cylinderPart(
    model,
    boltMaterial,
    `${spec.designation}_BoltBody`,
    controls.boltBody.radius,
    controls.boltBody.startZ,
    controls.boltBody.endZ,
    0,
    controls.boltBody.axisY,
    12
  );
  const magazine = profilePart(
    model,
    materials.metal,
    `${spec.designation}_InternalMagazineFloorplate`,
    profileShape(profiles.magazine),
    widths.magazine,
    (stations.receiverStart + stations.receiverEnd) * 0.5
  );
  magazine.userData.feedType = 'internal';
  const triggerGuard = profilePart(
    model,
    materials.metal,
    `${spec.designation}_TriggerGuard`,
    profileShapeWithHole(profiles.triggerGuardOuter, profiles.triggerGuardInner),
    widths.triggerGuard,
    stations.receiverStart
  );
  const trigger = profilePart(
    model,
    materials.metal,
    `${spec.designation}_Trigger`,
    profileShape(profiles.trigger),
    0.010,
    stations.receiverStart
  );
  const barrel = cylinderPart(
    model,
    materials.metal,
    `${spec.designation}_Barrel`,
    spec.barrelRadius,
    stations.barrelStart,
    spec.overallLength,
    0,
    0,
    12
  );
  barrel.userData.semanticPart = 'barrel';

  const rearBand = boxPart(
    model,
    materials.metal,
    `${spec.designation}_RearBand`,
    widths.rearBand,
    controls.rearBand.topY - controls.rearBand.bottomY,
    controls.rearBand.startZ,
    controls.rearBand.endZ,
    (controls.rearBand.topY + controls.rearBand.bottomY) * 0.5
  );
  const frontBand = boxPart(
    model,
    materials.metal,
    `${spec.designation}_FrontBand`,
    widths.frontBand,
    controls.frontBand.topY - controls.frontBand.bottomY,
    controls.frontBand.startZ,
    controls.frontBand.endZ,
    (controls.frontBand.topY + controls.frontBand.bottomY) * 0.5
  );
  const rearSight = profilePart(
    model,
    materials.metal,
    `${spec.designation}_RearSight`,
    profileShape(profiles.rearSight),
    widths.receiver,
    (controls.rearSight.startZ + controls.rearSight.endZ) * 0.5
  );
  const frontSight = profilePart(
    model,
    materials.metal,
    `${spec.designation}_FrontSight`,
    profileShape(profiles.frontSight),
    widths.frontSight,
    (profiles.frontSight[0].z + profiles.frontSight.at(-1).z) * 0.5
  );
  frontSight.userData.semanticPart = 'frontSight';
  const cleaningRod = cylinderPart(
    model,
    materials.metal,
    `${spec.designation}_CleaningRod`,
    controls.cleaningRod.radius,
    controls.cleaningRod.startZ,
    controls.cleaningRod.endZ,
    0,
    controls.cleaningRod.y,
    8
  );

  const boltHandle = cylinderBetweenPart(
    model,
    boltMaterial,
    `${spec.designation}_BoltHandle`,
    controls.boltHandle.stemRadius,
    [controls.boltHandle.start.x, controls.boltHandle.start.y, controls.boltHandle.start.z],
    [controls.boltHandle.end.x, controls.boltHandle.end.y, controls.boltHandle.end.z],
    8
  );
  boltHandle.userData.semanticSide = 'right';
  const boltKnob = meshPart(
    model,
    new THREE.SphereGeometry(controls.boltHandle.knobRadius, 8, 6),
    boltMaterial,
    `${spec.designation}_BoltKnob`,
    [
      controls.boltHandle.end.x - controls.boltHandle.knobRadius * 0.7,
      controls.boltHandle.end.y,
      controls.boltHandle.end.z
    ]
  );
  boltKnob.userData.semanticSide = 'right';
  boltHandle.userData.knob = boltKnob;
  const ejectionPort = meshPart(
    model,
    new THREE.BoxGeometry(0.008, 0.018, 0.085),
    materials.metal,
    `${spec.designation}_EjectionPort`,
    [lateralX('right', widths.receiver * 0.5 + 0.003), 0.006, stations.receiverStart + 0.20]
  );
  ejectionPort.userData.semanticSide = 'right';

  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const detailedMeshes = [
    stock, handguard, receiver, boltBody, magazine, triggerGuard, trigger, barrel,
    rearBand, frontBand, rearSight, frontSight, cleaningRod, boltHandle, boltKnob,
    ejectionPort
  ];
  const highMeshes = markWeaponLodRepresentation(detailedMeshes, 'high', true);
  const mediumLod = buildKar98kLodRepresentation(spec, materials, 'medium');
  const coreLod = buildKar98kLodRepresentation(spec, materials, 'core');
  model.add(mediumLod, coreLod);
  const lodRepresentations = installWeaponLodContract(
    model,
    KAR98K_VISUAL_DATA,
    highMeshes,
    mediumLod,
    coreLod
  );

  model.userData.visualContract = {
    units: 'metres',
    overallLength: spec.overallLength,
    source: KAR98K_VISUAL_DATA.source,
    classification: KAR98K_VISUAL_DATA.classification,
    ...spec
  };
  model.userData.parts = {
    stock,
    receiver,
    boltBody,
    handguard,
    barrel,
    magazine,
    triggerGuard,
    trigger,
    rearBand,
    frontBand,
    rearSight,
    frontSight,
    cleaningRod,
    boltHandle,
    boltKnob,
    ejectionPort,
    chargingHandle: null,
    pistolGrip: null,
    muzzle,
    detailedMeshes: lodRepresentations.high,
    mediumSilhouette: lodRepresentations.medium,
    coreSilhouette: lodRepresentations.core
  };
  return model;
}

function buildWeaponModel(spec, materials) {
  if (spec.id === 'lebel1886m93' || spec.id === 'lebel1886m93apx1916') {
    return buildLebelM1886M93(spec, materials);
  }
  if (spec.id === 'berthier1892m16') return buildBerthierM1892M16(spec, materials);
  if (spec.id === 'mas36') return buildMas36(spec, materials);
  if (spec.id === 'mas38') return buildMas38(spec, materials);
  if (spec.id === 'fm2429') return buildFm2429(spec, materials);
  if (spec.id === 'mg34') return buildMg34(spec, materials);
  if (spec.id === 'kar98k') return buildKar98k(spec, materials);
  const model = new THREE.Group();
  model.name = `${spec.designation}_WeaponModel`;

  let stock;
  if (spec.id === 'mp40') {
    addMp40FoldingStock(model, spec, materials.metal);
    stock = model.getObjectByName('MP40_ButtPlate');
  } else {
    stock = boxPart(
      model,
      materials.wood,
      `${spec.designation}_Stock`,
      spec.kind === 'lmg' ? 0.105 : 0.09,
      spec.kind === 'smg' ? 0.105 : 0.115,
      0,
      spec.stockEnd,
      spec.id === 'mas38' ? -0.018 : 0
    );
    const butt = boxPart(
      model,
      materials.wood,
      `${spec.designation}_Butt`,
      spec.kind === 'lmg' ? 0.15 : 0.13,
      spec.kind === 'smg' ? 0.14 : 0.17,
      0,
      Math.min(0.12, spec.stockEnd),
      spec.id === 'mas38' ? -0.025 : -0.015
    );
    butt.rotation.x = spec.id === 'mas38' ? -0.05 : 0.03;
  }

  const receiverWidth = spec.kind === 'lmg' ? 0.105 : (spec.id === 'mas38' ? 0.048 : (spec.id === 'mp40' ? 0.052 : 0.08));
  const receiver = boxPart(
    model,
    materials.metal,
    `${spec.designation}_Receiver`,
    receiverWidth,
    spec.kind === 'lmg' ? 0.1 : 0.075,
    spec.stockEnd,
    spec.receiverEnd,
    spec.id === 'mas38' ? 0.018 : 0
  );
  const handguard = boxPart(
    model,
    spec.id === 'mg34' || spec.id === 'mp40' ? materials.metal : materials.wood,
    `${spec.designation}_Handguard`,
    spec.kind === 'lmg' ? 0.085 : 0.065,
    spec.kind === 'lmg' ? 0.075 : 0.065,
    spec.receiverEnd,
    spec.handguardEnd,
    0
  );
  let profileDetail = null;
  if (spec.id === 'mas38') {
    profileDetail = boxPart(
      model,
      materials.metal,
      'MAS38_CantedReceiverRib',
      0.088,
      0.028,
      spec.stockEnd - 0.015,
      spec.receiverEnd + 0.045,
      0.052
    );
    profileDetail.rotation.x = -0.11;
    profileDetail.userData.definingFeature = 'canted receiver profile';

    // MAS-38 Top Rear Sight Ramp
    const sightRamp = boxPart(
      model,
      materials.metal,
      'MAS38_RearSightRamp',
      0.035,
      0.035,
      spec.stockEnd + 0.04,
      spec.stockEnd + 0.12,
      0.068
    );
    sightRamp.userData.lodBand = 'high';

    // MAS-38 Right-Side Spring Dust Cover over Ejection Port
    const dustCover = boxPart(
      model,
      materials.metal,
      'MAS38_DustCover',
      0.018,
      0.032,
      spec.stockEnd + 0.12,
      spec.receiverEnd - 0.02,
      0.018
    );
    dustCover.position.x = lateralX('right', 0.044);
    dustCover.userData.lodBand = 'high';
  }
  const barrel = cylinderPart(
    model,
    materials.metal,
    `${spec.designation}_Barrel`,
    spec.barrelRadius,
    spec.handguardEnd,
    spec.overallLength
  );

  if (spec.id === 'mg34') {
    const jacket = cylinderPart(
      model,
      materials.metal,
      'MG34_PerforatedBarrelJacket',
      0.035,
      spec.receiverEnd,
      spec.handguardEnd,
      0,
      0,
      10
    );
    jacket.userData.perforatedJacket = true;
  }
  const bipod = spec.id === 'mg34'
    ? addBipod(model, spec, materials.metal)
    : null;

  const magazine = addMagazine(model, spec, materials.metal);
  const fireControls = addFireControls(model, spec, materials);
  const muzzle = new THREE.Object3D();
  muzzle.name = `${spec.designation}_Muzzle`;
  muzzle.position.set(0, 0, spec.overallLength);
  model.add(muzzle);

  const frontSight = boxPart(
    model,
    materials.metal,
    `${spec.designation}_FrontSight`,
    0.018,
    0.045,
    spec.overallLength - 0.055,
    spec.overallLength - 0.035,
    0.03
  );
  frontSight.userData.semanticPart = 'frontSight';

  if (spec.id === 'mas38') {
    for (const side of [-1, 1]) {
      const ear = boxPart(
        model,
        materials.metal,
        `MAS38_FrontSightEar_${side < 0 ? 'Left' : 'Right'}`,
        0.008,
        0.055,
        spec.overallLength - 0.055,
        spec.overallLength - 0.035,
        0.032
      );
      ear.position.x = side * 0.018;
      ear.userData.lodBand = 'high';
    }
  }

  // Keep one coherent firearm silhouette through the core infantry tier.
  // Detail controls can disappear at distance, but the stock/receiver/feed/
  // barrel chain must still reach the authoritative muzzle marker.
  const coreSilhouette = [stock, receiver, handguard, barrel, magazine];
  if (spec.id === 'mp40') {
    model.traverse(object => {
      if (object.isMesh && /^MP40_(FoldingStock|ButtPlate)/.test(object.name)) {
        coreSilhouette.push(object);
      }
    });
  }
  if (spec.id === 'mg34') {
    coreSilhouette.push(model.getObjectByName('MG34_PerforatedBarrelJacket'));
    coreSilhouette.push(bipod.left, bipod.right);
  }
  for (const part of coreSilhouette) {
    if (part?.isMesh) part.userData.lodBand = 'core';
  }

  model.userData.visualContract = {
    units: 'metres',
    sourceQuality: {
      overallLength: 'historical nominal',
      sectionalDimensions: 'inferred visual proportion'
    },
    ...spec
  };
  model.userData.parts = {
    stock,
    receiver,
    handguard,
    barrel,
    magazine,
    muzzle,
    frontSight,
    profileDetail,
    bipod,
    coreSilhouette: coreSilhouette.filter(Boolean),
    ...fireControls
  };
  return model;
}

export function createFrance1940InfantryWeaponRig(weaponName, materials) {
  const spec = FRANCE_1940_INFANTRY_WEAPON_VISUALS[weaponName]
    ?? FRANCE_1940_INFANTRY_WEAPON_VISUALS['MAS-36 Rifle'];
  const rig = new THREE.Group();
  rig.name = 'TwoHandWeaponRig';

  const weapon = buildWeaponModel(spec, materials);
  rig.add(weapon);

  const hasPistolGrip = ['fm2429', 'mas38', 'mg34', 'mp40'].includes(spec.id);
  const triggerGrip = new THREE.Object3D();
  triggerGrip.name = 'TriggerHandGrip';
  triggerGrip.position.set(
    lateralX('right', 0.045),
    firingHandHeight(weapon.userData.parts),
    spec.triggerGripStation
      ?? (hasPistolGrip ? spec.stockEnd + 0.02 : Math.max(0.16, spec.stockEnd - 0.025))
  );
  rig.add(triggerGrip);

  const supportGrip = new THREE.Object3D();
  supportGrip.name = 'SupportHandGrip';
  supportGrip.position.set(
    lateralX('left', spec.supportGripLateralOffset ?? 0.025),
    spec.supportGripY ?? -0.03,
    spec.supportGripStation
      ?? spec.receiverEnd + (spec.handguardEnd - spec.receiverEnd) * 0.25
  );
  rig.add(supportGrip);

  const reloadGrip = new THREE.Object3D();
  reloadGrip.name = 'ReloadHandGrip';
  const reloadZ = spec.reloadGripStation ?? (spec.magazine === 'internal'
    ? spec.stockEnd + (spec.receiverEnd - spec.stockEnd) * 0.72
    : spec.stockEnd + 0.13);
  const reloadY = spec.magazine === 'top-box'
    ? 0.16
    : spec.magazine === 'bottom-box'
      ? -0.17
      : 0.015;
  reloadGrip.position.set(
    ['side-drum', 'belt-drum'].includes(spec.magazine) ? 0.12 : -0.055,
    reloadY,
    reloadZ
  );
  rig.add(reloadGrip);

  // Butt starts just ahead of the firing shoulder. Long-gun support grips
  // remain inside a physically plausible two-segment arm reach.
  // With +Z forward, -X is the model's right side. Seat the butt into the right
  // shoulder so the pose reads as right-handed from normal tactical cameras.
  rig.position.set(lateralX('right', 0.18), 1.46, 0.06);
  rig.rotation.set(-0.14, 0, 0.07);
  rig.userData.restPosition = rig.position.toArray();
  rig.userData.restRotation = rig.rotation.toArray();
  rig.userData.weaponName = weaponName;
  rig.userData.weaponModel = weapon;
  rig.userData.muzzle = weapon.userData.parts.muzzle;
  rig.userData.grips = { trigger: triggerGrip, support: supportGrip, reload: reloadGrip };
  rig.userData.semanticRig = 'two-hand-firearm';
  rig.userData.handedness = {
    firingHand: 'right',
    triggerSide: '-X',
    supportHand: 'left'
  };
  return rig;
}
