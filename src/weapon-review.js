import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FRANCE_1940_INFANTRY_WEAPON_VISUALS, createFrance1940InfantryWeaponRig } from './content/france1940/render/France1940InfantryWeaponFactory.js';
import { France1940UnitMeshFactory } from './content/france1940/render/France1940UnitMeshFactory.js';
import { advanceInfantryAnimation, applyInfantrySecondaryPose, bindInfantryHandsToWeapon } from './world/infantry/InfantryPoseAnimator.js';

const testMaterials = {
  metal: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(-2, 3, 2);
scene.add(dirLight);

let currentWeapon = null;
let currentSoldierMesh = null;
let soldierData = null;
let viewMode = 'weapon';
let currentStanceKey = 'STANDING_LOW_READY';
const clock = new THREE.Clock();
const bgMeshes = { tl: null, tr: null, bl: null };

const viewSize = 0.6; // Orthographic frustum view extent

// 1. Side View Camera (Looking from -X to 0, Z is forward)
const camSide = new THREE.OrthographicCamera(-viewSize, viewSize, viewSize, -viewSize, 0.1, 100);
camSide.layers.enable(1); // Side Blueprint

// 2. Top View Camera (Looking down from +Y to 0, Z is forward)
const camTop = new THREE.OrthographicCamera(-viewSize, viewSize, viewSize, -viewSize, 0.1, 100);
camTop.up.set(0, 0, 1); // Z is up on screen
camTop.layers.enable(2); // Top Blueprint

// 3. Front View Camera (Looking from +Z to 0, Y is up)
const camFront = new THREE.OrthographicCamera(-viewSize, viewSize, viewSize, -viewSize, 0.1, 100);
camFront.layers.enable(3); // Front Blueprint

// 4. Free 3D Camera
const cam3D = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const viewConfigs = [
    { containerId: 'cell-tl', camera: camSide, rotate: false },
    { containerId: 'cell-tr', camera: camTop, rotate: false },
    { containerId: 'cell-bl', camera: camFront, rotate: false },
    { containerId: 'cell-br', camera: cam3D, rotate: true }
];

const views = [];

for (const cfg of viewConfigs) {
    const container = document.getElementById(cfg.containerId);
    const controls = new OrbitControls(cfg.camera, container);
    controls.enableRotate = cfg.rotate;
    if (!cfg.rotate) {
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
    }
    views.push({ container, camera: cfg.camera, controls });
}

// Single WebGPURenderer attached to fullscreen container
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Background Blueprint loaders
window.addEventListener('bg-loaded', (e) => {
    const { viewKey, src } = e.detail;
    new THREE.TextureLoader().load(src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (bgMeshes[viewKey]) {
            bgMeshes[viewKey].material.map = texture;
            bgMeshes[viewKey].material.needsUpdate = true;
        } else {
            const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.6, depthWrite: false });
            const aspect = texture.image.width / texture.image.height;
            const geo = new THREE.PlaneGeometry(aspect, 1);
            const mesh = new THREE.Mesh(geo, mat);
            
            if (viewKey === 'tl') {
                mesh.layers.set(1);
                mesh.position.x = -0.2;
                mesh.rotation.y = Math.PI / 2;
            } else if (viewKey === 'tr') {
                mesh.layers.set(2);
                mesh.position.y = -0.2;
                mesh.rotation.x = -Math.PI / 2;
            } else if (viewKey === 'bl') {
                mesh.layers.set(3);
                mesh.position.z = -0.2;
            }
            scene.add(mesh);
            bgMeshes[viewKey] = mesh;
        }
    });
});

window.addEventListener('bg-update', (e) => {
    const { viewKey, scale, x, y } = e.detail;
    const mesh = bgMeshes[viewKey];
    if (!mesh) return;
    
    mesh.scale.setScalar(scale / 100);
    const xMeters = x / 500;
    const yMeters = y / 500;
    
    const spec = currentWeapon?.children[0]?.userData.visualContract;
    const centerZ = spec ? spec.overallLength / 2 : 0.4;
    
    if (viewKey === 'tl') {
        mesh.position.z = centerZ - xMeters; 
        mesh.position.y = yMeters;
    } else if (viewKey === 'tr') {
        mesh.position.x = xMeters;
        mesh.position.z = centerZ - yMeters;
    } else if (viewKey === 'bl') {
        mesh.position.z = centerZ - 0.2; 
        mesh.position.x = xMeters;
        mesh.position.y = yMeters;
    }
});

function getSoldierStanceAndState(key) {
  switch (key) {
    case 'STANDING_AIMING':
      return { stance: 'STANDING', state: 'AIMING' };
    case 'STANDING_AT_EASE':
      return { stance: 'STANDING', state: 'AT_EASE' };
    case 'KNEELING':
      return { stance: 'KNEELING', state: 'OBSERVING' };
    case 'CROUCHED':
      return { stance: 'CROUCHED', state: 'OBSERVING' };
    case 'PRONE':
      return { stance: 'PRONE', state: 'OBSERVING' };
    case 'STANDING_LOW_READY':
    default:
      return { stance: 'STANDING', state: 'OBSERVING' };
  }
}

function loadWeapon(designation) {
    if (currentWeapon) scene.remove(currentWeapon);
    if (currentSoldierMesh) scene.remove(currentSoldierMesh);
    currentWeapon = null;
    currentSoldierMesh = null;
    soldierData = null;

    const isGerman = ['Kar98k', 'MG34 LMG', 'MP40'].includes(designation);
    const faction = isGerman ? 'german' : 'french';

    if (viewMode === 'soldier') {
        const squadGroup = France1940UnitMeshFactory.createInfantrySquadMesh(faction, [{ weapon: designation }]);
        currentSoldierMesh = squadGroup;
        const soldierMesh = squadGroup.children.find(c => c.name.startsWith('Soldier_'));
        
        const { stance, state } = getSoldierStanceAndState(currentStanceKey);
        soldierData = {
            id: 'review_soldier',
            weaponName: designation,
            health: 100,
            status: 'READY',
            stance,
            state,
            poseTime: 0,
            idlePhase: 0,
            velocity: [0, 0, 0]
        };

        if (soldierMesh) {
            applyInfantrySecondaryPose(soldierMesh, soldierData);
            bindInfantryHandsToWeapon(soldierMesh, soldierData);
        }
        
        scene.add(currentSoldierMesh);
        currentWeapon = soldierMesh;
    } else {
        currentWeapon = createFrance1940InfantryWeaponRig(designation, testMaterials);
        
        // Wireframe overlay for high visibility in weapon-only mode
        currentWeapon.traverse((child) => {
            if (child.isMesh) {
                const wireframe = new THREE.WireframeGeometry(child.geometry);
                const line = new THREE.LineSegments(wireframe);
                line.material.color.setHex(0x00ff00);
                line.material.transparent = true;
                line.material.opacity = 0.6;
                child.add(line);
            }
        });
        
        scene.add(currentWeapon);
    }
    
    // Adjust camera targets and extent for soldier vs standalone weapon
    const isSoldier = viewMode === 'soldier';
    const targetY = isSoldier ? (soldierData?.stance === 'KNEELING' ? 0.95 : soldierData?.stance === 'PRONE' ? 0.35 : 1.25) : 0;
    const centerZ = isSoldier ? 0 : (currentWeapon?.children[0]?.userData?.visualContract?.overallLength / 2 || 0.4);
    const camDistance = isSoldier ? 2.5 : 1.5;
    const effectiveViewSize = isSoldier ? 1.2 : viewSize;
    
    // Reset Side View
    views[0].controls.target.set(0, targetY, centerZ);
    camSide.position.set(-camDistance, targetY, centerZ);
    camSide.zoom = isSoldier ? 0.6 : 1;
    camSide.updateProjectionMatrix();
    views[0].controls.update();
    
    // Reset Top View
    views[1].controls.target.set(0, targetY, centerZ);
    camTop.position.set(0, targetY + camDistance, centerZ);
    camTop.zoom = isSoldier ? 0.6 : 1;
    camTop.updateProjectionMatrix();
    views[1].controls.update();
    
    // Reset Front View
    views[2].controls.target.set(0, targetY, centerZ);
    camFront.position.set(0, targetY, centerZ + camDistance);
    camFront.zoom = isSoldier ? 0.6 : 1;
    camFront.updateProjectionMatrix();
    views[2].controls.update();
    
    // Reset 3D View
    views[3].controls.target.set(0, targetY, centerZ);
    cam3D.position.set(1.2, targetY + 0.6, centerZ + 1.4);
    views[3].controls.update();
}

document.getElementById('weapon-select').addEventListener('change', (e) => {
    loadWeapon(e.target.value);
});

document.getElementById('view-mode-select').addEventListener('change', (e) => {
    viewMode = e.target.value;
    const currentWeaponName = document.getElementById('weapon-select').value;
    loadWeapon(currentWeaponName);
});

document.getElementById('stance-select').addEventListener('change', (e) => {
    currentStanceKey = e.target.value;
    if (viewMode === 'soldier') {
        const currentWeaponName = document.getElementById('weapon-select').value;
        loadWeapon(currentWeaponName);
    }
});

// Load default
loadWeapon('MAS-38 SMG');

// Render loop using getBoundingClientRect() to position viewports
async function animate() {
    await renderer.init();
    
    function loop() {
        requestAnimationFrame(loop);
        
        const delta = clock.getDelta();
        const animateIdle = document.getElementById('animate-toggle').checked;

        if (viewMode === 'soldier' && currentSoldierMesh && soldierData) {
            const soldierMesh = currentSoldierMesh.children.find(c => c.name.startsWith('Soldier_'));
            if (soldierMesh) {
                if (animateIdle) {
                    advanceInfantryAnimation(soldierData, delta);
                }
                applyInfantrySecondaryPose(soldierMesh, soldierData);
                bindInfantryHandsToWeapon(soldierMesh, soldierData);
            }
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        
        renderer.setScissorTest(true);
        
        const isSoldier = viewMode === 'soldier';
        const curViewSize = isSoldier ? 1.2 : viewSize;

        for (const v of views) {
            const rect = v.container.getBoundingClientRect();
            
            const left = rect.left;
            const bottom = h - rect.bottom;
            const width = rect.width;
            const height = rect.height;
            
            const aspect = width / height;
            if (v.camera.isOrthographicCamera) {
                v.camera.left = -curViewSize * aspect;
                v.camera.right = curViewSize * aspect;
                v.camera.top = curViewSize;
                v.camera.bottom = -curViewSize;
            } else {
                v.camera.aspect = aspect;
            }
            v.camera.updateProjectionMatrix();
            
            renderer.setViewport(left, bottom, width, height);
            renderer.setScissor(left, bottom, width, height);
            
            renderer.render(scene, v.camera);
        }
    }
    loop();
}
animate();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
});
