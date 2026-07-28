import { GameApp, installGameErrorHandlers } from './app/GameApp.js';
import { createFamilyRegistry } from './scenario/FamilyRegistry.js';
import { createFrance1940Family } from './content/france1940/index.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from './content/france1940/catalogPorts.js';
import {
  createFrance1940VisualFactories,
  FRANCE_1940_ASSET_RESOLVER
} from './content/france1940/render/index.js';
import { STONNE_1940_SCENARIO } from './scenarios/france1940/stonne1940.js';
import { FR_HOUSE_12X9_2F } from './maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from './maps/france/FranceFarmhouse8x6_1F.js';
import { STONNE_1940_MAP } from './maps/france/stonne.js';
import {
  createFrenchHouseVisualAdapter
} from './world/buildings/FrenchHouse.js';

const familyRegistry = createFamilyRegistry([
  createFrance1940Family()
]);
const visualFactories = createFrance1940VisualFactories({
  assetResolver: FRANCE_1940_ASSET_RESOLVER
});
const structureAdapters = Object.freeze({
  [FR_HOUSE_12X9_2F.id]: createFrenchHouseVisualAdapter(FR_HOUSE_12X9_2F),
  [FR_FARMHOUSE_8X6_1F.id]:
    createFrenchHouseVisualAdapter(FR_FARMHOUSE_8X6_1F)
});
const gameDefinition = Object.freeze({
  scenario: STONNE_1940_SCENARIO,
  mapDescriptor: STONNE_1940_MAP,
  familyRegistry,
  catalogPorts: FRANCE_1940_CATALOG_PORTS,
  visualFactories,
  playerFactionId: 'french',
  buildingDescriptors: Object.freeze([
    FR_HOUSE_12X9_2F,
    FR_FARMHOUSE_8X6_1F
  ]),
  structureAdapters
});

installGameErrorHandlers();
window.addEventListener('DOMContentLoaded', () => {
  new GameApp(gameDefinition);
});
