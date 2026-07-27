import {
  TerrainBuilder as CoreTerrainBuilder
} from '../../src/world/TerrainBuilder.js';
import {
  FRANCE_1940_TERRAIN_SURFACE_PROVIDER
} from '../../src/content/france1940/render/index.js';

export {
  createGroundConformingWallGeometry
} from '../../src/world/TerrainBuilder.js';

/**
 * Test-only family fixture. Production composition injects this provider
 * through GameApp; generic TerrainBuilder intentionally owns no family style.
 */
export class TerrainBuilder extends CoreTerrainBuilder {
  constructor(scene, options = {}) {
    super(scene, {
      ...options,
      terrainSurfaceProvider: options.terrainSurfaceProvider
        ?? FRANCE_1940_TERRAIN_SURFACE_PROVIDER
    });
  }
}
