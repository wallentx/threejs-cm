import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

function assertFiniteNodeGraph(root, label) {
  const visited = new Set();

  function visit(value, path) {
    if (typeof value === 'number') {
      assert.ok(
        Number.isFinite(value),
        `${path} must be finite, received ${value}`
      );
      return;
    }
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const key of Object.keys(value)) visit(value[key], `${path}.${key}`);
  }

  visit(root, label);
}

test('Vite gives procedural VFX the renderer Three and TSL singleton', async () => {
  const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  });

  try {
    const [rendererThree, webgpuThree, proceduralVfx] = await Promise.all([
      server.ssrLoadModule('three'),
      server.ssrLoadModule('three/webgpu'),
      server.ssrLoadModule('/src/world/vfx/ProceduralVfxNodes.js')
    ]);
    assert.equal(webgpuThree.SpriteNodeMaterial, rendererThree.SpriteNodeMaterial);
    assert.equal(webgpuThree.TSL.color, rendererThree.TSL.color);
    for (const role of [
      'flame',
      'smoke',
      'impact',
      'explosion',
      'muzzleFlash',
      'blast'
    ]) {
      const material = proceduralVfx.createProceduralSpriteMaterial(role);
      assert.equal(material.constructor, rendererThree.SpriteNodeMaterial);
      assert.ok(material.colorNode instanceof rendererThree.Node);
      assert.ok(material.opacityNode instanceof rendererThree.Node);
      assertFiniteNodeGraph(material.colorNode, `${role}.colorNode`);
      assertFiniteNodeGraph(material.opacityNode, `${role}.opacityNode`);
      material.dispose();
    }
  } finally {
    await server.close();
  }
});
