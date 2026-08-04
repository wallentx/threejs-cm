import { GameApp, installGameErrorHandlers } from './app/GameApp.js';
import { createFamilyRegistry } from './scenario/FamilyRegistry.js';
import {
  createFrance1940Family,
  FRANCE_1940_BATTLE_SETUP
} from './content/france1940/index.js';
import {
  BATTLE_SETUP_AI_LEVELS,
  createBattleSetupValidationPort,
  createConfiguredBattleScenario
} from './scenario/BattleSetup.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from './content/france1940/catalogPorts.js';
import {
  createFrance1940VisualFactories,
  FRANCE_1940_ASSET_RESOLVER
} from './content/france1940/render/index.js';
import { FR_HOUSE_12X9_2F } from './maps/france/FranceHouse12x9_2F.js';
import { FR_FARMHOUSE_8X6_1F } from './maps/france/FranceFarmhouse8x6_1F.js';
import { FRANCE_1940_MAPS } from './maps/france/index.js';
import { BattleSetupScreen } from './ui/BattleSetupScreen.js';
import {
  createFrenchHouseVisualAdapter
} from './world/buildings/FrenchHouse.js';

const family = createFrance1940Family();
const familyRegistry = createFamilyRegistry([family]);
const visualFactories = createFrance1940VisualFactories({
  assetResolver: FRANCE_1940_ASSET_RESOLVER
});
const structureAdapters = Object.freeze({
  [FR_HOUSE_12X9_2F.id]: createFrenchHouseVisualAdapter(FR_HOUSE_12X9_2F),
  [FR_FARMHOUSE_8X6_1F.id]:
    createFrenchHouseVisualAdapter(FR_FARMHOUSE_8X6_1F)
});
const availableMaps = Object.freeze(FRANCE_1940_MAPS.map(
  descriptor => Object.freeze({
    id: descriptor.id,
    title: descriptor.title,
    description: descriptor.description,
    previewStyle: descriptor.previewStyle,
    descriptor
  })
));
const buildingDescriptors = Object.freeze([
  FR_HOUSE_12X9_2F,
  FR_FARMHOUSE_8X6_1F
]);
const validateBattleSetup = createBattleSetupValidationPort({
  catalog: FRANCE_1940_BATTLE_SETUP,
  family
});

function createGameDefinition(selection) {
  const selectedMap = availableMaps.find(map => map.id === selection.mapId);
  if (!selectedMap) {
    throw new Error(`Unknown map ${selection.mapId}`);
  }
  const scenario = createConfiguredBattleScenario({
    mapDescriptor: selectedMap.descriptor,
    family,
    catalog: FRANCE_1940_BATTLE_SETUP,
    playerFactionId: selection.playerFactionId,
    enemyFactionId: selection.enemyFactionId,
    playerForceSelection: selection.playerForceSelection,
    enemyForceSelection: selection.enemyForceSelection,
    enemyAiDifficulty: selection.enemyAiDifficulty
  });
  return Object.freeze({
    scenario,
    mapDescriptor: selectedMap.descriptor,
    familyRegistry,
    catalogPorts: FRANCE_1940_CATALOG_PORTS,
    visualFactories,
    playerFactionId: selection.playerFactionId,
    buildingDescriptors,
    structureAdapters
  });
}

installGameErrorHandlers();
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isDebugMode = urlParams.get('debug') === 'true'
    || urlParams.get('mode') === 'debug'
    || urlParams.get('mode') === 'sandbox'
    || import.meta.env.MODE === 'debug';

  if (isDebugMode) {
    import('./debug/VehicleDebugSandboxApp.js').then(({ VehicleDebugSandboxApp }) => {
      new VehicleDebugSandboxApp();
    }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      document.body.dataset.gameStatus = 'error';
      document.body.dataset.gameError = message;
      console.error('[VehicleDebugSandbox]', error);
    });
    return;
  }

  const root = document.getElementById('battle-setup-root');
  const screen = new BattleSetupScreen({
    root,
    maps: availableMaps,
    catalog: FRANCE_1940_BATTLE_SETUP,
    aiLevels: BATTLE_SETUP_AI_LEVELS,
    validateSetup: validateBattleSetup,
    onStart: async selection => {
      const app = new GameApp(createGameDefinition(selection));
      await app.ready;
      if (document.body.dataset.gameStatus !== 'ready') {
        throw new Error(
          document.body.dataset.gameError
            ?? 'Battlefield failed to initialize'
        );
      }
      screen.hide();
    }
  });
  screen.mount();
});
