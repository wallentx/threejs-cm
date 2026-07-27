import * as THREE from 'three';

export class MapEditor {
  constructor(editorPort) {
    this.editorPort = editorPort;
    this.activeTab = 'terrain';
    this.brushSize = 2;
    this.terrainMode = 'raise';

    this.initDOM();
  }

  initDOM() {
    document.querySelectorAll('.editor-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const etab = e.target.dataset.etab;
        this.activeTab = etab;
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        document.querySelectorAll('.editor-section').forEach(s => s.classList.add('hidden'));
        const targetSec = document.getElementById(`etab-${etab}`);
        if (targetSec) targetSec.classList.remove('hidden');
      });
    });

    const modeSel = document.getElementById('ed-terrain-mode');
    if (modeSel) {
      modeSel.addEventListener('change', (e) => {
        this.terrainMode = e.target.value;
      });
    }

    const brushSizeInput = document.getElementById('ed-brush-size');
    if (brushSizeInput) {
      brushSizeInput.addEventListener('input', (e) => {
        this.brushSize = parseInt(e.target.value);
      });
    }
  }

  handleEditorClick(intersectionPoint) {
    if (!intersectionPoint) return;
    const { x, z } = intersectionPoint;

    if (this.activeTab === 'terrain') {
      if (this.terrainMode === 'bocage') {
        this.editorPort.addBocageObstacle({
          minX: x - 5, maxX: x + 5,
          minZ: z - 1.2, maxZ: z + 1.2,
          height: 3.0,
          type: 'bocage'
        });

        const bocageGeo = new THREE.BoxGeometry(10, 2.5, 2.4);
        const bocageMat = new THREE.MeshStandardMaterial({ color: '#203314', roughness: 0.9 });
        const mesh = new THREE.Mesh(bocageGeo, bocageMat);
        mesh.position.set(x, 1.25 + this.editorPort.getTerrainHeight(x, z), z);
        mesh.castShadow = true;
        this.editorPort.addSceneObject(mesh);

        this.editorPort.notify('Bocage Hedgerow Placed', 'info');
      }
    } else if (this.activeTab === 'objects') {
      const objSelect = document.getElementById('ed-object-type');
      const objType = objSelect ? objSelect.value : 'building_stone';

      if (objType.startsWith('building_')) {
        const houseGeo = new THREE.BoxGeometry(12, 7, 10);
        const houseMat = new THREE.MeshStandardMaterial({ color: '#a39b8b' });
        const house = new THREE.Mesh(houseGeo, houseMat);
        house.position.set(x, 3.5 + this.editorPort.getTerrainHeight(x, z), z);
        house.castShadow = true;
        this.editorPort.addSceneObject(house);
        this.editorPort.notify('Building Placed', 'info');
      }
    }
  }
}
