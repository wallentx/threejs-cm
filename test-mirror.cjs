const THREE = require('three');

let hand = new THREE.Object3D();
let elbow = new THREE.Object3D();
let forward = new THREE.Vector3(0, 0, 1);
elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), forward);
elbow.add(hand);
let localPalm = new THREE.Vector3(0, 0, -1);
let localThumb = new THREE.Vector3(-1, 0, 0);

hand.rotation.set(0, 0, 0);
hand.scale.set(-1, 1, 1);
hand.rotation.y = Math.PI;

elbow.updateMatrixWorld(true);
let worldPalm = localPalm.clone().applyMatrix4(hand.matrixWorld).normalize();
// Since scale affects points, applyMatrix4 on a vector from origin works for direction if we normalize
// Actually, let's use points.
let p0 = new THREE.Vector3(0,0,0).applyMatrix4(hand.matrixWorld);
let pPalm = new THREE.Vector3(0,0,-1).applyMatrix4(hand.matrixWorld);
let pThumb = new THREE.Vector3(-1,0,0).applyMatrix4(hand.matrixWorld);

let dirPalm = pPalm.sub(p0).normalize();
let dirThumb = pThumb.sub(p0).normalize();

console.log("With scale.x = -1 and PI rotation:");
console.log("Palm:", dirPalm.x, dirPalm.y, dirPalm.z);
console.log("Thumb:", dirThumb.x, dirThumb.y, dirThumb.z);
