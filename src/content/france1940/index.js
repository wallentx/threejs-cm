import { FRANCE_1940_FACTIONS } from './factions.js';
import { FRANCE_1940_FORMATIONS } from './formations.js';
import { FRANCE_1940_PRESENTATION } from './presentation.js';
import { FRANCE_1940_VEHICLES } from './vehicles.js';
import { FRANCE_1940_WEAPONS } from './weapons.js';
import { FRANCE_1940_ASSET_MANIFEST } from './assets/index.js';

/**
 * France 1940 owns its canonical weapon and vehicle catalogs.
 *
 * Extra properties, including the old `weapons` and `vehicles` adapters, are
 * deliberately ignored. This keeps transitional composition calls harmless
 * while ensuring every France 1940 family uses canonical identity-stable maps.
 */
export function createFrance1940Family() {
  return Object.freeze({
    id: 'france-1940',
    factions: FRANCE_1940_FACTIONS,
    formations: FRANCE_1940_FORMATIONS,
    presentation: FRANCE_1940_PRESENTATION,
    assetManifest: FRANCE_1940_ASSET_MANIFEST,
    catalogs: Object.freeze({
      weapons: FRANCE_1940_WEAPONS,
      vehicles: FRANCE_1940_VEHICLES
    })
  });
}

export {
  FRANCE_1940_ASSET_MANIFEST,
  FRANCE_1940_FACTIONS,
  FRANCE_1940_FORMATIONS,
  FRANCE_1940_PRESENTATION,
  FRANCE_1940_VEHICLES,
  FRANCE_1940_WEAPONS
};
