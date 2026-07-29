import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('main is a composition-only entrypoint and GameApp owns browser runtime orchestration', async () => {
  const [mainSource, appSource] = await Promise.all([
    source('../src/main.js'),
    source('../src/app/GameApp.js')
  ]);

  assert.match(mainSource, /new GameApp\(createGameDefinition\(selection\)\)/);
  assert.match(mainSource, /createFamilyRegistry/);
  assert.match(mainSource, /createFrance1940VisualFactories/);
  assert.match(mainSource, /createConfiguredBattleScenario/);
  assert.match(mainSource, /new BattleSetupScreen/);
  assert.match(mainSource, /FRANCE_1940_MAPS/);
  assert.doesNotMatch(
    mainSource,
    /^import\s.+?from\s+['"].*\/(?:engine|game|simulation|editor)\//m
  );
  assert.doesNotMatch(mainSource, /\bsimulateStep\s*\(|requestAnimationFrame\(/);

  assert.match(appSource, /export class GameApp/);
  assert.match(appSource, /async initialize\(\)/);
  assert.match(appSource, /simulateStep\(delta\)/);
  assert.match(appSource, /requestAnimationFrame\(nextTimestamp/);
  assert.match(appSource, /familyRegistry: this\.familyRegistry/);
  assert.match(appSource, /visualFactories: this\.visualFactories/);
  assert.match(
    appSource,
    /terrainSurfaceProvider: this\.visualFactories\.terrainSurfaceProvider/
  );
  assert.match(appSource, /vfxProvider: this\.visualFactories\.vfxProvider/);
  assert.match(
    appSource,
    /audioProvider: this\.visualFactories\.audioProvider/
  );
  assert.match(appSource, /structureAdapters: this\.structureAdapters/);
  assert.match(appSource, /buildFactionRosterIndex\(this\.factionOrder, this\.units\)/);
  assert.match(appSource, /createUIRuntimePort\(\{/);
  assert.match(appSource, /new UIManager\(this\.uiRuntimePort\)/);
  assert.match(appSource, /new MapEditor\(createMapEditorPort\(\{/);
  assert.match(appSource, /this\.playerFactionId/);
  assert.match(appSource, /attacker\.structureSpec\?\.weaponId/);
  assert.doesNotMatch(
    appSource,
    /^import\s.+?from\s+['"].*\/(?:content|maps\/france|scenarios\/france1940)\//m
  );
  assert.doesNotMatch(
    appSource,
    /\b(?:STONNE_1940|FRANCE_1940|FR_HOUSE_12X9_2F)\b/
  );
  assert.doesNotMatch(
    appSource,
    /['"](?:french|german|MG34)['"]|startsWith\(['"](?:Squad_|fr_|ger_)/
  );
});
