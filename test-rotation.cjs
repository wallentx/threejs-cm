const THREE = require('three');

// Hand geometry assumptions:
// -y is arm direction (DOWN)
// +z is the back of the hand (so -z is the palm)
// -x is the thumb

let hand = new THREE.Object3D();

// Suppose we want palm to face world +y, and thumb to face world -x
// after the elbow rotates from DOWN to FORWARD (+z)

let elbow = new THREE.Object3D();
let forward = new THREE.Vector3(0, 0, 1);
elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), forward);
elbow.add(hand);

elbow.updateMatrixWorld(true);

let localPalm = new THREE.Vector3(0, 0, -1); // palm faces -z
let worldPalm = localPalm.clone().applyMatrix4(hand.matrixWorld);

let localThumb = new THREE.Vector3(-1, 0, 0); // thumb at -x
let worldThumb = localThumb.clone().applyMatrix4(hand.matrixWorld);

console.log("Without rotation:");
console.log("Palm:", worldPalm.x, worldPalm.y, worldPalm.z);
console.log("Thumb:", worldThumb.x, worldThumb.y, worldThumb.z);

// Let's try rotating the left hand around its Y axis
hand.rotation.y = Math.PI / 2;
elbow.updateMatrixWorld(true);
worldPalm = localPalm.clone().applyMatrix4(hand.matrixWorld);
worldThumb = localThumb.clone().applyMatrix4(hand.matrixWorld);
console.log("\nWith PI/2:");
console.log("Palm:", worldPalm.x, worldPalm.y, worldPalm.z);
console.log("Thumb:", worldThumb.x, worldThumb.y, worldThumb.z);

hand.rotation.y = Math.PI;
elbow.updateMatrixWorld(true);
worldPalm = localPalm.clone().applyMatrix4(hand.matrixWorld);
worldThumb = localThumb.clone().applyMatrix4(hand.matrixWorld);
console.log("\nWith PI:");
console.log("Palm:", worldPalm.x, worldPalm.y, worldPalm.z);
console.log("Thumb:", worldThumb.x, worldThumb.y, worldThumb.z);

hand.rotation.y = -Math.PI / 2;
elbow.updateMatrixWorld(true);
worldPalm = localPalm.clone().applyMatrix4(hand.matrixWorld);
worldThumb = localThumb.clone().applyMatrix4(hand.matrixWorld);
console.log("\nWith -PI/2:");
console.log("Palm:", worldPalm.x, worldPalm.y, worldPalm.z);
console.log("Thumb:", worldThumb.x, worldThumb.y, worldThumb.z);
