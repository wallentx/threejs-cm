import { Unit } from './src/game/Unit.js';
import * as THREE from 'three';
import { visibleWorldBounds } from './src/render/bounds.js';

const unit = new Unit({
  id: 'first_order_casualty_variants',
  faction: 'french',
  type: 'infantry_squad',
  position: new THREE.Vector3()
});

unit.applySoldierHit(unit.roster[1].id, 1, () => 0);
const mesh = unit.mesh.userData.soldiers[1];
const weapon = mesh.userData.parts.weaponModel;
console.log('Weapon ID:', unit.roster[1].weaponName);
const weaponBounds = visibleWorldBounds(weapon);
console.log('Weapon bounds:', weaponBounds);
const casualtyBounds = visibleWorldBounds(mesh);
console.log('Casualty bounds:', casualtyBounds);
