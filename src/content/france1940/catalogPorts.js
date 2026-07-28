import {
  FRANCE_1940_VEHICLES,
  getVehicle,
  vehicleIdForFaction
} from './vehicles.js';
import {
  FRANCE_1940_WEAPONS,
  getWeapon,
  weaponIdFromName
} from './weapons.js';
import {
  FRANCE_1940_STRUCTURES,
  getStructure
} from './structures.js';

const WEAPON_PORT = Object.freeze({
  records: FRANCE_1940_WEAPONS,
  get: getWeapon,
  idFromName: weaponIdFromName
});

const VEHICLE_PORT = Object.freeze({
  records: FRANCE_1940_VEHICLES,
  get: getVehicle,
  defaultIdForFaction: vehicleIdForFaction
});

const STRUCTURE_PORT = Object.freeze({
  records: FRANCE_1940_STRUCTURES,
  get: getStructure
});

/**
 * Read-only family catalog boundary for runtime consumers.
 *
 * Functions deliberately return canonical frozen records. Mutable ammunition,
 * damage, crew, and firing state remain owned by each Unit/SoldierAgent.
 */
export const FRANCE_1940_CATALOG_PORTS = Object.freeze({
  familyId: 'france-1940',
  weapons: WEAPON_PORT,
  vehicles: VEHICLE_PORT,
  structures: STRUCTURE_PORT
});
