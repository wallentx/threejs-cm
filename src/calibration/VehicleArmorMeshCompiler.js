import * as THREE from 'three';

const EPSILON = 1e-10;

function slug(value) {
  return value
    .replace(/-(?=\d)/g, 'negative-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function faceForNormal(normal) {
  if (Math.abs(normal.y) >= 0.9) return normal.y >= 0 ? 'positiveY' : 'negativeY';
  const axes = [
    ['positiveX', normal.x], ['negativeX', -normal.x],
    ['positiveZ', normal.z], ['negativeZ', -normal.z]
  ];
  axes.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return axes[0][0];
}

function zoneForFace(part, face, source) {
  if (source.zone) return source.zone;
  if (part === 'mantlet') return 'mantlet';
  if (part === 'cupola') return 'cupola';
  const direction = {
    positiveX: 'side', negativeX: 'side',
    positiveY: 'top', negativeY: 'bottom',
    positiveZ: 'front', negativeZ: 'rear'
  }[face];
  return `${part}_${direction}`;
}

function fallbackForZone(part, face, source, zone) {
  if (source.fallbackZone) return source.fallbackZone;
  if (part === 'mantlet') return 'turret_front';
  if (part === 'cupola') return 'turret_side';
  if (part === 'track') return 'hull_side';
  if (face === 'positiveY' || face === 'negativeY') return `${part}_side`;
  return zone;
}

function triangleIndices(geometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : positions.count;
  const result = [];
  for (let offset = 0; offset < count; offset += 3) {
    result.push([
      index ? index.getX(offset) : offset,
      index ? index.getX(offset + 1) : offset + 1,
      index ? index.getX(offset + 2) : offset + 2
    ]);
  }
  return result;
}

function instanceMatrices(object) {
  if (!object.isInstancedMesh) return [new THREE.Matrix4()];
  const matrices = [];
  for (let index = 0; index < object.count; index++) {
    const matrix = new THREE.Matrix4();
    object.getMatrixAt(index, matrix);
    matrices.push(matrix);
  }
  return matrices;
}

function ownerCenter(root, owner) {
  if (owner === root) return [0, 0, 0];
  const inverseRoot = root.matrixWorld.clone().invert();
  const center = new THREE.Vector3()
    .setFromMatrixPosition(owner.matrixWorld)
    .applyMatrix4(inverseRoot);
  return [center.x, center.y, center.z];
}

function includesTriangle(source, a, b, c) {
  if (!source.partition) return true;
  const axis = { x: 0, y: 1, z: 2 }[source.partition.axis];
  if (axis === undefined) {
    throw new Error(
      `${source.id ?? source.name} has unsupported partition axis ${source.partition.axis}`
    );
  }
  const centroid = (
    [a.x, a.y, a.z][axis]
    + [b.x, b.y, b.z][axis]
    + [c.x, c.y, c.z][axis]
  ) / 3;
  if (source.partition.sign === 'negative') return centroid < 0;
  if (source.partition.sign === 'positive') return centroid >= 0;
  throw new Error(
    `${source.id ?? source.name} has unsupported partition sign ${source.partition.sign}`
  );
}

export function compileVehicleArmorMesh(root, manifest) {
  root.updateMatrixWorld(true);
  const turret = root.userData.turret ?? root.getObjectByName('Turret');
  const volumes = [];
  const sourceNames = new Set();

  for (const source of manifest.sources) {
    const sourceId = source.id ?? source.name;
    if (sourceNames.has(sourceId)) {
      throw new Error(`${manifest.vehicleId} repeats armor source ${sourceId}`);
    }
    sourceNames.add(sourceId);
    const object = root.getObjectByName(source.name);
    if (!object?.isMesh || !object.geometry?.getAttribute('position')) {
      throw new Error(`${manifest.vehicleId} is missing armor source mesh ${source.name}`);
    }
    const owner = source.owner === 'turret' ? turret : root;
    if (!owner) {
      throw new Error(`${manifest.vehicleId}:${source.name} requires a turret owner`);
    }
    const ownerInverse = owner.matrixWorld.clone().invert();
    const positions = object.geometry.getAttribute('position');
    const sourceTriangles = triangleIndices(object.geometry);
    const vertices = [];
    const vertexIndices = new Map();
    const plateTriangles = new Map();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const addVertex = point => {
      const values = [
        Math.fround(point.x),
        Math.fround(point.y),
        Math.fround(point.z)
      ];
      const key = values.join(':');
      const existing = vertexIndices.get(key);
      if (existing !== undefined) return existing;
      const index = vertices.length;
      vertices.push(values);
      vertexIndices.set(key, index);
      return index;
    };

    for (const instanceMatrix of instanceMatrices(object)) {
      const transform = ownerInverse.clone()
        .multiply(object.matrixWorld)
        .multiply(instanceMatrix);
      for (const triangle of sourceTriangles) {
        a.fromBufferAttribute(positions, triangle[0]).applyMatrix4(transform);
        b.fromBufferAttribute(positions, triangle[1]).applyMatrix4(transform);
        c.fromBufferAttribute(positions, triangle[2]).applyMatrix4(transform);
        if (!includesTriangle(source, a, b, c)) continue;
        normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
        if (normal.lengthSq() <= EPSILON) continue;
        normal.normalize();
        const face = faceForNormal(normal);
        const indices = [addVertex(a), addVertex(b), addVertex(c)];
        const triangles = plateTriangles.get(face) ?? [];
        triangles.push(indices);
        plateTriangles.set(face, triangles);
      }
    }

    const plates = [...plateTriangles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([face, triangles]) => {
        const zone = zoneForFace(source.part, face, source);
        const fallbackZone = fallbackForZone(source.part, face, source, zone);
        return {
          id: face,
          zone,
          fallbackZone,
          triangles,
          thicknessMm: source.thicknessMm,
          thicknessSourceZone: source.thicknessSourceZone ?? fallbackZone,
          thicknessDataQuality: source.thicknessDataQuality
            ?? 'catalog armor mapped to deterministic authored core-mesh face classification',
          thicknessReferenceUrl: source.thicknessReferenceUrl
        };
      });

    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (const vertex of vertices) {
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], vertex[axis]);
        maximum[axis] = Math.max(maximum[axis], vertex[axis]);
      }
    }
    volumes.push({
      id: `${slug(sourceId)}-mesh`,
      shape: 'triangle-mesh',
      part: source.part,
      shellGroup: source.part === 'hull'
        ? 'hull'
        : (source.part === 'turret' || source.part === 'cupola' ? 'turret' : null),
      followsTurret: source.owner === 'turret',
      exitArmorPolicy: source.exitArmorPolicy,
      center: ownerCenter(root, owner),
      interiorPoint: minimum.map((value, axis) => (value + maximum[axis]) * 0.5),
      bounds: {
        center: minimum.map((value, axis) => (value + maximum[axis]) * 0.5),
        halfExtents: minimum.map((value, axis) => (maximum[axis] - value) * 0.5)
      },
      vertexStride: 3,
      vertices: vertices.flat(),
      plates: plates.map(plate => ({
        ...plate,
        triangleStride: 3,
        triangles: plate.triangles.flat()
      })),
      sourceMeshName: source.name,
      sourcePartition: source.partition ?? null,
      sourceLodBand: object.userData.lodBand ?? null,
      geometryQuality: 'deterministically extracted from the authored core vehicle mesh; renderer-neutral checked-in triangle snapshot'
    });
  }

  return {
    version: 'named-mesh-triangle-plates-v3',
    quality: 'deterministic checked-in triangle snapshots of authored core hull, turret, and targetable running-gear meshes',
    sourceModelId: root.userData.modelMetadata?.modelId ?? root.name ?? null,
    volumes
  };
}
