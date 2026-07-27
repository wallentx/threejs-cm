/**
 * Compatibility surface for consumers not yet migrated to an injected family
 * vehicle catalog. France 1940 owns the canonical records.
 */
export {
  FRANCE_1940_VEHICLES as VEHICLES,
  FRANCE_1940_VEHICLE_MACHINE_GUN_MOUNTS as VEHICLE_MACHINE_GUN_MOUNTS,
  getVehicle,
  vehicleIdForFaction
} from '../content/france1940/vehicles.js';

export {
  effectiveArmorMm,
  penetrationAtVelocity
} from '../simulation/ballistics/ArmorMath.js';
