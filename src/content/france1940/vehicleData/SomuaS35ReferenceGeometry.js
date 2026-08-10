import {
  SOMUA_S35_REFERENCE_MESH_DATA
} from './SomuaS35ReferenceMeshData.js';

const SOURCE = SOMUA_S35_REFERENCE_MESH_DATA.source;
const SOURCE_BOUNDS = SOURCE.emittedRigidSourceBounds;
const TARGET = SOURCE.targetRigidEnvelopeMeters;
const SCALE = Object.freeze([
  TARGET.width / SOURCE_BOUNDS.size[0],
  TARGET.height / SOURCE_BOUNDS.size[1],
  TARGET.length / SOURCE_BOUNDS.size[2]
]);
const SOURCE_ORIGIN = Object.freeze([
  SOURCE_BOUNDS.center[0],
  SOURCE_BOUNDS.min[1],
  SOURCE_BOUNDS.center[2]
]);
const GUN_VERTICAL_CORRECTION_METERS = -0.007;

export const SOMUA_S35_REFERENCE_REGISTRATION = Object.freeze({
  source: SOURCE,
  scaleMetersPerSourceUnit: SCALE,
  sourceOrigin: SOURCE_ORIGIN,
  targetOrigin: Object.freeze([0, 0, 0]),
  targetTurretPivot: SOURCE.targetTurretPivot,
  rendererCorrections: Object.freeze({
    gunInstallationVerticalMeters: GUN_VERTICAL_CORRECTION_METERS,
    quality:
      '7 mm downward correction keeps the reduced source mantlet within the registered four-view turret-top datum'
  }),
  policy:
    'register the complete rigid exterior independently to the published 2.12 m width, 2.62 m height, and 5.38 m length; retain source coordinates as immutable evidence and keep the aerial, chains, bags, and tools outside the rigid-envelope fit',
  quality:
    'the user-supplied GLB owns production exterior topology; published dimensions retain rigid-envelope authority; offline simplification is presentation-only'
});

function decodeBase64Values(encoded, count, bytesPerValue, readValue) {
  const binary = atob(encoded);
  if (binary.length !== count * bytesPerValue) {
    throw new Error(`S35 reference payload length ${binary.length} does not match ${count}`);
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

function registerPosition(position, turretLocal) {
  const registered = position.map((value, axis) => (
    (value - SOURCE_ORIGIN[axis]) * SCALE[axis]
  ));
  if (turretLocal) {
    for (let axis = 0; axis < 3; axis += 1) {
      registered[axis] -= SOURCE.targetTurretPivot[axis];
    }
  }
  return registered;
}

function decodedGeometry(meshData, turretLocal, verticalCorrection = 0) {
  if (meshData.positionEncoding !== 'float32-le-base64') {
    throw new Error(`Unsupported S35 position encoding: ${meshData.positionEncoding}`);
  }
  if (meshData.indexEncoding !== 'uint32-le-base64') {
    throw new Error(`Unsupported S35 index encoding: ${meshData.indexEncoding}`);
  }
  const positions = decodeBase64Values(
    meshData.positionBase64,
    meshData.vertexCount * 3,
    Float32Array.BYTES_PER_ELEMENT,
    (view, offset) => view.getFloat32(offset, true)
  );
  const indices = decodeBase64Values(
    meshData.indexBase64,
    meshData.indexCount,
    Uint32Array.BYTES_PER_ELEMENT,
    (view, offset) => view.getUint32(offset, true)
  );
  for (let offset = 0; offset < positions.length; offset += 3) {
    const registered = registerPosition([
      positions[offset],
      positions[offset + 1],
      positions[offset + 2]
    ], turretLocal);
    positions[offset] = registered[0];
    positions[offset + 1] = registered[1] + verticalCorrection;
    positions[offset + 2] = registered[2];
  }
  return { positions, indices };
}

const REGISTERED_MESHES = Object.freeze(Object.fromEntries(
  Object.entries(SOMUA_S35_REFERENCE_MESH_DATA.meshes).map(([key, meshData]) => {
    const geometry = decodedGeometry(meshData, true);
    return [key, Object.freeze({
      sourceNodeName: meshData.sourceNodeNames[0],
      sourceTriangleCount: meshData.sourceTriangleCount,
      sourceVertexCount: meshData.sourceVertexCount,
      positions: Object.freeze(geometry.positions),
      indices: Object.freeze(geometry.indices)
    })];
  })
));

const REGISTERED_ASSEMBLIES = Object.freeze(Object.fromEntries(
  Object.entries(SOMUA_S35_REFERENCE_MESH_DATA.assemblies).map(([key, meshData]) => {
    const turretLocal = meshData.region === 'turret';
    const geometry = decodedGeometry(
      meshData,
      turretLocal,
      ['gun', 'mantlet'].includes(meshData.articulation)
        ? GUN_VERTICAL_CORRECTION_METERS
        : 0
    );
    return [key, Object.freeze({
      key,
      region: meshData.region,
      articulation: meshData.articulation,
      lodBand: meshData.lodBand,
      materialSlot: meshData.materialSlot,
      sourceNodeNames: meshData.sourceNodeNames,
      sourceMaterialNames: meshData.sourceMaterialNames,
      sourceParts: Object.freeze(meshData.sourceParts.map(part => Object.freeze({ ...part }))),
      sourceTriangleCount: meshData.sourceTriangleCount,
      sourceVertexCount: meshData.sourceVertexCount,
      windingRepair: meshData.windingRepair,
      triangleCount: meshData.triangleCount,
      vertexCount: meshData.vertexCount,
      positions: Object.freeze(geometry.positions),
      indices: Object.freeze(geometry.indices)
    })];
  })
));

export const SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY = Object.freeze({
  sourceExteriorNodeCount: SOURCE.exteriorNodeCount,
  emittedSourceNodeCount: SOURCE.emittedSourceNodeCount,
  derivedPresentationNodeCount: SOURCE.derivedPresentationNodeCount,
  excludedInteriorNodeCount: SOURCE.excludedInteriorNodeCount,
  excludedPresentationNodeCount: SOURCE.excludedPresentationNodeCount,
  sourceTriangleCount: SOURCE.exteriorSourceTriangleCount,
  emittedTriangleCount: SOURCE.emittedTriangleCount,
  visibleHighTriangleCount: Object.values(REGISTERED_ASSEMBLIES)
    .filter(assembly => assembly.lodBand !== 'proxy')
    .reduce((sum, assembly) => sum + assembly.triangleCount, 0),
  proxyTriangleCount: Object.values(REGISTERED_ASSEMBLIES)
    .filter(assembly => assembly.lodBand === 'proxy')
    .reduce((sum, assembly) => sum + assembly.triangleCount, 0),
  assemblyCount: Object.keys(REGISTERED_ASSEMBLIES).length,
  keys: Object.freeze(Object.keys(REGISTERED_ASSEMBLIES))
});

const registeredGunMuzzle = registerPosition(
  SOMUA_S35_REFERENCE_MESH_DATA.derived.sourceGunMuzzle,
  true
);
registeredGunMuzzle[1] += GUN_VERTICAL_CORRECTION_METERS;
export const SOMUA_S35_REFERENCE_GUN_MUZZLE = Object.freeze(registeredGunMuzzle);

export function createSomuaS35ReferenceMeshArrays(key) {
  const mesh = REGISTERED_MESHES[key];
  if (!mesh) throw new Error(`Unknown S35 reference armor mesh: ${key}`);
  return {
    sourceNodeName: mesh.sourceNodeName,
    sourceTriangleCount: mesh.sourceTriangleCount,
    sourceVertexCount: mesh.sourceVertexCount,
    positions: [...mesh.positions],
    indices: [...mesh.indices]
  };
}

export function createSomuaS35ReferenceAssemblyArrays(key) {
  const assembly = REGISTERED_ASSEMBLIES[key];
  if (!assembly) throw new Error(`Unknown S35 reference assembly: ${key}`);
  return {
    ...assembly,
    sourceNodeNames: [...assembly.sourceNodeNames],
    sourceMaterialNames: [...assembly.sourceMaterialNames],
    sourceParts: assembly.sourceParts.map(part => ({ ...part })),
    positions: [...assembly.positions],
    indices: [...assembly.indices]
  };
}
