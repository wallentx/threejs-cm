import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createAssetResolver,
  createRuntimeAssetPack,
  defineAssetManifest
} from '../src/assets/AssetManifest.js';
import {
  FRANCE_1940_ASSET_IDS,
  FRANCE_1940_ASSET_MANIFEST
} from '../src/content/france1940/assets/index.js';
import {
  FRANCE_1940_AUDIO_EVENT_IDS,
  FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
} from '../src/content/france1940/audio/France1940ProceduralAudioProvider.js';
import {
  createFrance1940AudioProvider,
  createFrance1940VisualFactories,
  FRANCE_1940_RUNTIME_ASSET_PACK
} from '../src/content/france1940/render/index.js';
import { SoundEngine } from '../src/engine/SoundEngine.js';

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.onended = null;
    this.stops = [];
  }

  start() {}

  stop(at) {
    this.stops.push(at);
  }

  end() {
    this.onended?.();
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 5;
    this.sampleRate = 1000;
    this.destination = new FakeNode();
    this.state = 'running';
    this.sources = [];
  }

  createGain() {
    const node = new FakeNode();
    node.gain = new FakeParam();
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    return node;
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  createOscillator() {
    const source = new FakeSource();
    source.frequency = new FakeParam();
    this.sources.push(source);
    return source;
  }

  createBuffer(_channels, length) {
    return {
      getChannelData() {
        return new Float32Array(length);
      }
    };
  }

  close() {
    this.closed = true;
  }
}

function replacementResolver(provider, generatorId = provider.id) {
  const manifest = defineAssetManifest({
    id: `france1940-test-audio-${generatorId}`,
    familyId: 'france-1940',
    replaces: [FRANCE_1940_ASSET_MANIFEST.id],
    assets: {
      [FRANCE_1940_ASSET_IDS.battlefieldAudioProvider]: {
        id: FRANCE_1940_ASSET_IDS.battlefieldAudioProvider,
        kind: 'battlefield-audio-provider',
        source: {
          type: 'procedural',
          generatorId
        },
        provenance: 'test replacement battlefield audio'
      }
    }
  });
  return {
    manifest,
    resolver: createAssetResolver([
      FRANCE_1940_RUNTIME_ASSET_PACK,
      createRuntimeAssetPack(manifest, {
        [FRANCE_1940_ASSET_IDS.battlefieldAudioProvider]: provider
      })
    ])
  };
}

test('replacement audio provider reaches live weapon playback and disposal', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeAudioContext };
  try {
    const implementationId = 'test-battlefield-audio-v1';
    const replacementEventId = 'test.weapon.rifle';
    const replacementBuildingEventId = 'test.building.damage';
    let resourceCreates = 0;
    let resourceDisposals = 0;
    const replacementProvider = Object.freeze({
      id: implementationId,
      kind: 'battlefield-audio-provider',
      createResources() {
        resourceCreates++;
        const base = FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER.createResources();
        return Object.freeze({
          ...base,
          events: Object.freeze({
            ...base.events,
            [replacementEventId]: base.events[FRANCE_1940_AUDIO_EVENT_IDS.rifle],
            [replacementBuildingEventId]: base.events[
              FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged
            ]
          }),
          resolveWeaponEvent() {
            return replacementEventId;
          },
          resolveBuildingDamageEvent() {
            return replacementBuildingEventId;
          },
          dispose() {
            resourceDisposals++;
            return base.dispose();
          }
        });
      }
    });
    const { manifest, resolver } = replacementResolver(replacementProvider);
    const visualFactories = createFrance1940VisualFactories({
      assetResolver: resolver
    });
    const expectedBinding = {
      logicalId: FRANCE_1940_ASSET_IDS.battlefieldAudioProvider,
      sourcePackId: manifest.id,
      implementationId
    };

    assert.deepEqual(visualFactories.audioProvider.assetBinding, expectedBinding);
    const sound = new SoundEngine({
      audioProvider: visualFactories.audioProvider
    });
    assert.equal(resourceCreates, 1);
    assert.deepEqual(sound.assetBinding, expectedBinding);
    assert.equal(
      sound.playWeapon({ id: 'MAS36', kind: 'rifle', caliberMm: 7.5 }),
      true
    );
    assert.equal(sound.lastEventId, replacementEventId);
    sound.ctx.sources.forEach(source => source.end());
    assert.equal(sound.playBuildingDamage({ severity: 'damaged' }), true);
    assert.equal(sound.lastEventId, replacementBuildingEventId);
    const voice = [...sound.activeVoices.values()][0].values().next().value;
    assert.deepEqual(voice.assetBinding, expectedBinding);
    sound.ctx.sources.forEach(source => source.end());

    const context = sound.ctx;
    assert.equal(sound.dispose(), true);
    assert.equal(sound.dispose(), false);
    assert.equal(resourceDisposals, 1);
    assert.equal(context.closed, true);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('France audio provider resolves actual weapon records by class and caliber', () => {
  const resources = FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER.createResources();
  assert.equal(
    resources.resolveWeaponEvent({ kind: 'rifle', caliberMm: 7.5 }),
    FRANCE_1940_AUDIO_EVENT_IDS.rifle
  );
  assert.equal(
    resources.resolveWeaponEvent({ kind: 'machine_gun', caliberMm: 7.92 }),
    FRANCE_1940_AUDIO_EVENT_IDS.machineGun
  );
  assert.equal(
    resources.resolveWeaponEvent({ kind: 'submachine_gun', caliberMm: 9 }),
    FRANCE_1940_AUDIO_EVENT_IDS.submachineGun
  );
  assert.equal(
    resources.resolveWeaponEvent({ kind: 'cannon_ap', caliberMm: 47 }),
    FRANCE_1940_AUDIO_EVENT_IDS.lightCannon
  );
  assert.equal(
    resources.resolveWeaponEvent({ kind: 'cannon_he', caliberMm: 75 }),
    FRANCE_1940_AUDIO_EVENT_IDS.mediumCannon
  );
  assert.equal(
    resources.resolveBuildingDamageEvent({ severity: 'damaged' }),
    FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged
  );
  assert.equal(
    resources.resolveBuildingDamageEvent({ severity: 'breached' }),
    FRANCE_1940_AUDIO_EVENT_IDS.buildingBreached
  );
  assert.equal(
    resources.resolveBuildingDamageEvent({ severity: 'collapsed' }),
    FRANCE_1940_AUDIO_EVENT_IDS.buildingCollapsed
  );
  assert.ok(resources.voiceLimits.buildingDamage > 0);
  resources.dispose();
});

test('audio resources reject a missing building-damage resolver', () => {
  const malformedProvider = Object.freeze({
    id: 'missing-building-resolver',
    kind: 'battlefield-audio-provider',
    createResources() {
      const base = FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER.createResources();
      const { resolveBuildingDamageEvent, ...incomplete } = base;
      return incomplete;
    }
  });
  assert.throws(
    () => new SoundEngine({ audioProvider: malformedProvider }),
    /resolveBuildingDamageEvent/
  );
});

test('audio binding rejects missing, mismatched, and incomplete providers', () => {
  assert.throws(
    () => new SoundEngine(),
    /battlefield audio provider/
  );

  const wrongProvider = Object.freeze({
    ...FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    id: 'wrong-audio-generator'
  });
  const wrong = replacementResolver(wrongProvider, 'expected-audio-generator');
  assert.throws(
    () => createFrance1940AudioProvider(wrong.resolver),
    /expected generator expected-audio-generator, received wrong-audio-generator/
  );

  const incompleteProvider = Object.freeze({
    id: 'incomplete-audio-generator',
    kind: 'battlefield-audio-provider',
    createResources() {
      return { kind: 'battlefield-audio-resources' };
    }
  });
  const incomplete = replacementResolver(incompleteProvider);
  const provider = createFrance1940AudioProvider(incomplete.resolver);
  assert.throws(
    () => provider.createResources(),
    /masterGain/
  );
});

test('generic sound and combat systems contain no France audio labels or imports', async () => {
  const [soundSource, combatSource] = await Promise.all([
    readFile(new URL('../src/engine/SoundEngine.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game/CombatSystem.js', import.meta.url), 'utf8')
  ]);
  for (const source of [soundSource, combatSource]) {
    assert.doesNotMatch(source, /content\/france1940|FRANCE_1940/);
    assert.doesNotMatch(source, /\b(?:garand|mg42)\b/i);
  }
  assert.match(combatSource, /playWeapon\?\.\(weapon\)/);
  assert.doesNotMatch(combatSource, /playGunshot|playCannon/);
});
