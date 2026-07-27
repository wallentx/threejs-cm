import {
  RENAULT_D2_VISUAL_DATA
} from '../../content/france1940/vehicleData/RenaultD2AuthoringData.js';
import {
  createParametricVehicleMesh
} from '../../authoring/vehicle/ParametricVehicleCompiler.js';
import { enhanceVehicleModel } from './VehicleModelEnhancer.js';

/**
 * Runtime renderer for the provisional blueprint-authored Renault D2.
 *
 * Geometry remains owned by its immutable vehicle bundle. This wrapper only
 * binds shared runtime material, LOD, selection, and articulation contracts.
 */
export function createRenaultD2Mesh(options = {}) {
  const root = createParametricVehicleMesh(RENAULT_D2_VISUAL_DATA);
  return enhanceVehicleModel(root, options);
}
