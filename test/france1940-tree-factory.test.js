import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createFrance1940TreeTemplate
} from '../src/content/france1940/render/France1940TreeFactory.js';

class FakeEzTree extends THREE.Group {
  constructor() {
    super();
    this.options = {
      seed: 0,
      bark: { textured: true, type: null },
      branch: {
        levels: 0,
        children: {},
        sections: {},
        segments: {}
      },
      leaves: { type: null, count: 0 }
    };
    this.branchesMesh = new THREE.Mesh();
    this.leavesMesh = new THREE.Mesh();
    this.add(this.branchesMesh, this.leavesMesh);
  }

  generate() {
    this.branchesMesh.geometry = new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0);
    this.branchesMesh.material = new THREE.MeshBasicMaterial();
    this.leavesMesh.geometry = new THREE.BoxGeometry(3, 1, 3).translate(0, 2.5, 0);
    this.leavesMesh.material = new THREE.MeshBasicMaterial();
  }
}

test('EZ-Tree broadleaf generation emits one bounded family-material template', async () => {
  const template = await createFrance1940TreeTemplate({
    seed: 77,
    ezTreeModule: {
      Tree: FakeEzTree,
      BarkType: { Oak: 'oak' },
      LeafType: { Oak: 'oak' }
    }
  });

  const bounds = new THREE.Box3();
  bounds.union(template.branchGeometry.boundingBox);
  bounds.union(template.leafGeometry.boundingBox);
  assert.ok(Math.abs((bounds.max.y - bounds.min.y) - 11) < 1e-6);
  assert.equal(bounds.min.y, 0);
  assert.equal(template.generator, '@dgreenheck/ez-tree');
  assert.equal(template.branchGeometry.userData.generator, '@dgreenheck/ez-tree');
  assert.equal(template.leafGeometry.userData.speciesApproximation, 'oak-broadleaf');
  assert.equal(template.dataQuality, 'renderer approximation: EZ-Tree oak broadleaf profile');
});
