import * as THREE from 'three';

let ezTreeModulePromise = null;

function loadEzTreeModule() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (!ezTreeModulePromise) ezTreeModulePromise = import('virtual:ez-tree-geometry');
  return ezTreeModulePromise;
}

function configureBroadleafTemplate(tree, ezTree, seed) {
  tree.options.seed = seed;
  tree.options.bark.textured = false;
  if (ezTree.BarkType?.Oak) tree.options.bark.type = ezTree.BarkType.Oak;
  if (ezTree.LeafType?.Oak) tree.options.leaves.type = ezTree.LeafType.Oak;

  // Renderer approximation: retain EZ-Tree's recursive broadleaf generator,
  // but bound the one shared template before instancing it across the map.
  tree.options.branch.levels = 3;
  Object.assign(tree.options.branch.children, { 0: 5, 1: 4, 2: 3 });
  Object.assign(tree.options.branch.sections, { 0: 8, 1: 6, 2: 4, 3: 3 });
  Object.assign(tree.options.branch.segments, { 0: 6, 1: 5, 2: 4, 3: 3 });
  // The source texture represents a small oak spray rather than one solid
  // leaf. Five bounded placements per terminal branch close the large holes
  // left by the former one-card performance proxy without returning to the
  // preset's expensive 18-card canopy.
  tree.options.leaves.count = 5;
  tree.options.leaves.start = 0.18;
  tree.options.leaves.angle = 38;
  tree.options.leaves.size = 2.3;
  tree.options.leaves.sizeVariance = 0.45;
}

function disposeGeneratedTree(tree) {
  for (const mesh of [tree.branchesMesh, tree.leavesMesh]) {
    mesh?.geometry?.dispose();
    if (Array.isArray(mesh?.material)) mesh.material.forEach(material => material.dispose());
    else mesh?.material?.dispose();
  }
}

/**
 * Generate one source-backed EZ-Tree template for map-wide instancing.
 * Runtime materials remain family-owned; EZ-Tree's WebGL-only leaf shader is
 * deliberately discarded so the resulting geometry works on WebGPU and the
 * direct WebGL 2 fallback.
 */
export async function createFrance1940TreeTemplate({
  profileId = 'mature-tree',
  seed = 12345,
  ezTreeModule = null
} = {}) {
  const ezTree = ezTreeModule ?? await loadEzTreeModule();
  if (!ezTree?.Tree) return null;

  const tree = new ezTree.Tree();
  configureBroadleafTemplate(tree, ezTree, seed);
  tree.generate();

  const bounds = new THREE.Box3().setFromObject(tree);
  const generatedHeight = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(generatedHeight) || generatedHeight <= 0) {
    disposeGeneratedTree(tree);
    throw new Error('EZ-Tree generated a template without a finite height');
  }

  const targetHeight = profileId === 'poplar' ? 16 : 11;
  const scale = targetHeight / generatedHeight;
  const normalizeGeometry = geometry => {
    const clone = geometry.clone();
    clone.scale(scale, scale, scale);
    clone.translate(0, -bounds.min.y * scale, 0);
    clone.computeBoundingBox();
    clone.computeBoundingSphere();
    clone.userData = {
      generator: '@dgreenheck/ez-tree',
      profileId,
      speciesApproximation: 'oak-broadleaf',
      targetHeightMeters: targetHeight
    };
    return clone;
  };
  const template = {
    generator: '@dgreenheck/ez-tree',
    branchGeometry: normalizeGeometry(tree.branchesMesh.geometry),
    leafGeometry: normalizeGeometry(tree.leavesMesh.geometry),
    profileId,
    targetHeightMeters: targetHeight,
    dataQuality: 'renderer approximation: EZ-Tree oak broadleaf profile'
  };
  disposeGeneratedTree(tree);
  return template;
}

export const FRANCE_1940_FOLIAGE_TEMPLATE_PROVIDER = Object.freeze({
  kind: 'foliage-template-provider',
  familyId: 'france-1940',
  createTemplate: createFrance1940TreeTemplate
});
