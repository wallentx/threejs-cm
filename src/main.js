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
import {
  FRANCE_1940_BUILDING_DESCRIPTORS
} from './maps/france/FranceBuildingDescriptors.js';
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
const structureAdapters = Object.freeze(Object.fromEntries(
  FRANCE_1940_BUILDING_DESCRIPTORS.map(descriptor => [
    descriptor.id,
    createFrenchHouseVisualAdapter(descriptor)
  ])
));
const availableMaps = Object.freeze(FRANCE_1940_MAPS.map(
  descriptor => Object.freeze({
    id: descriptor.id,
    title: descriptor.title,
    description: descriptor.description,
    previewStyle: descriptor.previewStyle,
    descriptor
  })
));
const buildingDescriptors = FRANCE_1940_BUILDING_DESCRIPTORS;
const validateBattleSetup = createBattleSetupValidationPort({
  catalog: FRANCE_1940_BATTLE_SETUP,
  family
});

function createLaunchSeed() {
  // Seed selection is browser setup input, not a simulation outcome. Once
  // chosen, the recorded uint32 drives the existing deterministic RNG and is
  // preserved by WEGO capture/restore.
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] || 1;
}

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
    enemyAiDifficulty: selection.enemyAiDifficulty,
    battleSeed: createLaunchSeed()
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
function startBrowserApp() {
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
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startBrowserApp, { once: true });
} else {
  startBrowserApp();
}
